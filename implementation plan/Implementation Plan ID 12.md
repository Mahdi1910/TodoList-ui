# Implementation Plan ID 12 — Task-Style Hierarchy Drag for Projects and Tags

## Goal

Add **task-style hierarchy-aware drag-and-drop** to the sidebar **Projects** tree and independently to the sidebar **Tags** tree.

This is not simple vertical reordering. The interaction must reuse the same mental model already established by task dragging:

- long-press / hold to begin drag;
- neutral floating dragged item/subtree;
- blue placeholder is the authoritative preview of the result if released now;
- vertical movement changes ordering position;
- horizontal movement changes hierarchy depth;
- move right to become a child;
- move left to move toward the root / become less nested;
- move from one parent to another;
- reorder children under the same parent;
- dropping inside an existing child block forces the child relationship, matching the task drag rule;
- mouse and touch both supported;
- persist `parentId` and sibling `sortOrder` transactionally.

Projects and Tags must remain completely separate drag domains:

```text
PROJECTS
Project ↔ Project only

TAGS
Tag ↔ Tag only
```

Never allow:

```text
Project → Tags
Tag → Projects
```

No app implementation is part of this plan commit.

---

# 1. Current-State Findings

## 1.1 Task drag is already the UX reference

The existing task hierarchy drag implementation already provides the interaction language this feature must mirror:

```text
hold
→ floating item/family
→ blue placeholder
→ horizontal hierarchy intent
→ forced child-block detection
→ exact before/after slot
→ release
→ transactional hierarchy/order commit
```

Important existing task behaviors to preserve conceptually:

- 300 ms hold before activation;
- cancel pending drag when pre-activation movement exceeds ~8 px;
- floating item starts at its current visual indentation;
- root/child alignment measured from rendered DOM rather than physical `cm` values;
- stateful horizontal intent with hysteresis;
- existing child block wins over horizontal root intent;
- placeholder moves to the actual target host and indentation;
- sibling rows animate out of the way;
- Escape / blur cancels active drag;
- post-drag click suppression prevents accidental edit/navigation;
- auto-scroll near the scroll-container edges.

Projects/Tags should feel like the same feature, not a separate drag system with different rules.

## 1.2 Projects and Tags already have recursive hierarchy

Current Project and Tag records already contain:

```text
parentId
sortOrder
```

and their editors already allow assigning a parent while preventing hierarchy cycles.

Unlike Tasks, Project/Tag hierarchy is recursive. The sidebar renderer currently recursively renders:

```text
root
  child
    grandchild
      ...
```

Therefore this plan must adapt the task drag behavior to **arbitrary depth** instead of imposing the task-only one-level restriction.

## 1.3 Current rendering is visually hierarchical but DOM-flat

`renderProjects()` and `renderTags()` currently recurse through data but append every row directly into the same root list, using calculated left padding:

```text
8 + depth * 18px
```

This is enough for display but not ideal for hierarchy dragging because:

- a parent and all descendants are not one movable subtree DOM unit;
- there is no persistent child drop host for an empty parent;
- direct-child insertion slots are hard to distinguish from descendant insertion slots;
- moving a parent with descendants would require manually collecting many unrelated sibling DOM rows.

The implementation should convert the sidebar hierarchy to stable tree-node wrappers while preserving the same visual appearance.

## 1.4 Persistence already supports the needed fields

IndexedDB already stores Projects and Tags with:

```text
id
parentId
sortOrder
```

and both stores already index `parentId` and `sortOrder`.

No schema version increase is needed for this feature.

Current creation uses a global `nextEntitySortOrder()` across all Projects/Tags. For hierarchy drag, ordering must become explicit **per sibling scope**.

---

# 2. Exact Product Behavior

## 2.1 Root reorder

Projects:

```text
A
B
C
```

Drag C between A and B at root indentation:

```text
A
──────────── blue root placeholder
B
```

Release:

```text
A
C
B
```

Same for Tags.

## 2.2 Move right to become child

Given:

```text
A
B
C
```

Hold B. Initial preview is root-level.

Move B right while vertically positioned beneath/after A:

```text
A
    ───────── blue child placeholder
C
```

Release:

```text
A
    B
C
```

Commit:

```text
B.parentId = A.id
```

## 2.3 Move left to outdent

Given:

```text
A
    B
C
```

Hold B. Initial placeholder begins at B's current child indentation.

Move B left far enough:

```text
A
──────────── blue root placeholder
C
```

Release:

```text
A
B
C
```

Commit:

```text
B.parentId = null
```

## 2.4 Move between parents

Given:

```text
A
    B
    C
D
    E
```

Drag B under D at child indentation:

```text
A
    C
D
    E
    ───────── blue child placeholder
```

Release:

```text
A
    C
D
    E
    B
```

Commit:

```text
B.parentId = D.id
```

## 2.5 Reorder children under same parent

Given:

```text
A
    B1
    B2
    B3
```

Drag B3 between B1 and B2:

```text
A
    B1
    ───────── blue placeholder
    B2
```

Release:

```text
A
    B1
    B3
    B2
```

Persist direct-child sibling `sortOrder`.

## 2.6 Move a parent with its entire subtree

Given:

```text
A
    B
        C
D
E
```

Dragging A at root level must move **A + B + C together as one subtree**.

Drop after E:

```text
D
E
A
    B
        C
```

Only A's relationship to its old/new parent scope changes. Internal relationships remain:

```text
B.parentId = A
C.parentId = B
```

Do not flatten, clone, detach, or individually reparent descendants.

---

# 3. Recursive-Tree Adaptation of Task Horizontal Intent

Tasks only switch between two levels:

```text
root ↔ subtask
```

Projects/Tags may have:

```text
depth 0
  depth 1
    depth 2
      depth 3
```

Use the same horizontal gesture model but represent it as an integer depth intent:

```text
previewDepth = 0, 1, 2, ...
```

## 3.1 Runtime indentation measurement

Do not use physical `cm` values or assume a fixed pixel threshold.

Measure the rendered sidebar hierarchy:

```text
rootAlignmentX
indentStep
```

The current visual step is approximately 18 px, but runtime measurement should be the source of truth.

Suggested measurement:

- root row left/content alignment;
- direct child row left/content alignment;
- `indentStep = childX - rootX`.

If no child currently exists, fall back to the CSS tree indentation variable/constant.

## 3.2 Stateful depth intent

Track:

```text
horizontalDepthIntent
```

Start it at the dragged entity's existing depth.

Moving right across the next depth midpoint increases intended depth.
Moving left across the previous depth midpoint decreases intended depth.

Use hysteresis so small finger/mouse jitter does not repeatedly switch depth.

Because sidebar indentation is smaller than task indentation, do not blindly reuse the task drag's fixed 10 px hysteresis. Derive it from indentation, for example:

```text
hysteresis = clamp(indentStep * ~0.20–0.25, 4px, 10px)
```

Use one named constant/helper, not scattered magic numbers.

## 3.3 Multiple-level outdent/indent

Dragging far enough left may move an entity several levels toward root in one drag.

Example:

```text
A
    B
        C
```

Dragging C far left can preview:

```text
C at depth 0
```

Dragging right may increase depth only when a valid parent exists for that depth.

Never create skipped hierarchy levels such as:

```text
root
        depth 2 without depth 1 parent   ❌
```

---

# 4. Highest-Priority Rule: Existing Child Block Wins

Preserve the strongest task drag rule.

Given:

```text
A
    B1
    B2
C
```

If C is vertically dropped between B1 and B2:

```text
A
    B1
    [C placeholder]
    B2
```

then C becomes a child of A **even if the user has moved C far left horizontally**.

Result:

```text
A
    B1
    C
    B2
```

For recursive trees, apply this rule to the **deepest matching existing child block**.

Example:

```text
A
    B
        C1
        C2
    D
```

A Y-position between C1 and C2 is inside B's child block, not merely A's broader descendant area.

Resolver precedence:

```text
1. Find existing visible child blocks containing the pointer Y.
2. Choose the deepest valid block.
3. Force preview parent = owner of that child block.
4. Resolve exact direct-child insertion slot inside that host.
5. Only when no forced block applies, use horizontal depth intent.
```

This is the recursive equivalent of the task forced-child-zone behavior.

---

# 5. Stable Sidebar Tree DOM

Refactor Project and Tag rendering to create a stable node for each entity.

Conceptual structure:

```html
<div class="sidebar-tree-node"
     data-taxonomy-type="project"
     data-entity-id="A"
     data-parent-id=""
     data-depth="0">

  <div class="sidebar-nav-item project-nav-item" ...>
    ...existing project row content...
  </div>

  <div class="sidebar-tree-children"
       data-tree-parent-id="A">
    ...child sidebar-tree-node wrappers...
  </div>
</div>
```

Tags use the same structural classes with `data-taxonomy-type="tag"`.

Requirements:

- every entity gets exactly one draggable node wrapper;
- wrapper contains its full descendant subtree;
- row retains all existing IDs/data attributes needed by filtering/counts/menu actions;
- existing click-to-select behavior remains on the `.sidebar-nav-item` row;
- `•••` buttons and action menus continue working;
- child host exists even when empty;
- empty child host takes no visible space normally;
- during drag, empty child host can reveal the blue placeholder;
- visual indentation remains effectively the same as today.

Prefer nested child hosts with a shared indentation variable instead of continually writing depth-specific inline `paddingLeft` values.

Example CSS concept:

```text
--sidebar-tree-indent: 18px
```

Nested `.sidebar-tree-children` can apply one indentation step per level.

---

# 6. Drag Domains

There are exactly two taxonomy drag domains:

```text
project-list
 tag-list
```

A drag session stores:

```text
entityType = project | tag
container = projectListEl | tagListEl
```

Drop resolution must search only inside the source domain.

During Project drag:

- ignore Tag nodes/hosts;
- ignore smart filters (Inbox/Today/Completed);
- ignore main workspace task lanes.

During Tag drag:

- ignore Project nodes/hosts;
- ignore smart filters;
- ignore main workspace task lanes.

Do not permit cross-domain dragging even if pointer coordinates overlap another section.

---

# 7. Drag Target Rules

A drag can begin from the normal body of a Project/Tag row.

Do not begin drag from interactive controls:

```text
button
input
select
textarea
a
project/tag more button
open action menu
modal controls
```

If a modal is open, taxonomy drag should not start.

On activation:

- close Project/Tag more menus;
- close workspace/task menus where appropriate;
- keep the sidebar itself open;
- create floating subtree;
- insert source placeholder;
- suppress accidental row selection after release.

---

# 8. Input Model — Match Task Drag

## Pointer / mouse

Use task drag's interaction timing:

```text
left primary pointer
hold ≈300 ms
pre-activation movement >≈8 px → cancel pending drag
```

After activation:

- pointer movement updates floating subtree and preview;
- release commits;
- Escape cancels;
- window blur cancels.

## Touch

Use the same dedicated touch handling model already used by Tasks:

```text
single touch
hold ≈300 ms
touch movement >≈8 px before activation → cancel
```

Once active:

- prevent browser scrolling for the active drag touch;
- track the original touch identifier;
- touchend commits;
- touchcancel cancels;
- a second touch cancels pending/active taxonomy drag.

Do not use native HTML5 drag-and-drop because it is inconsistent on touch/mobile and would diverge from task behavior.

---

# 9. Drag Session Model

Use a dedicated taxonomy drag session, separate from task `dragSession`.

Conceptual fields:

```text
entityType
entityId
sourceParentId
sourceDepth
sourceHost
sourceNode
sourceContainer
inputType
pointerId / touchIdentifier
x / y
offsetX / offsetY
placeholder
horizontalDepthIntent
previewDepth
previewParentId
previewBeforeEntityId
previewAfterEntityId
forcedChildZone
rootAlignmentX
indentStep
initialPreview
```

Projects and Tags should not reuse the same active state object as Tasks; simultaneous drags are not allowed, but keeping systems isolated avoids state collisions.

---

# 10. Floating Subtree

If the dragged entity owns descendants, the whole `.sidebar-tree-node` subtree becomes the floating drag unit.

Requirements:

- preserve the subtree's current visual shape;
- preserve indentation of descendants relative to the dragged root;
- neutral shadow like task dragging;
- no blue coloring on the floating item;
- pointer-events disabled on floating layer;
- floating unit follows the pointer/finger naturally;
- initial left/top comes from its current rendered rectangle, so lifting a nested item does not snap it to root alignment.

The blue placeholder—not the floating item—is the authoritative hierarchy preview.

---

# 11. Blue Placeholder Contract

## Same-parent reorder preview

A placeholder inside the same child host means:

```text
release → same parent, new sibling position
```

## Child preview

Indented placeholder inside A's child host means:

```text
release → parentId = A
```

## Root preview

Placeholder inside the top-level Project/Tag host means:

```text
release → parentId = null
```

## Deeper preview

Nested placeholder inside B's child host means:

```text
release → parentId = B
```

Placeholder should have the same blue border/background language as task drag.

Its height should represent the dragged subtree footprint enough that surrounding sibling subtrees visibly move out of the way.

---

# 12. Vertical Slot Resolution

Create one generic sibling-slot resolver for a tree child host:

```text
resolveSiblingSlot(host, y)
```

The host contains direct child `.sidebar-tree-node` wrappers.

For each direct child node:

- use the node/subtree rectangle;
- compare pointer Y with its midpoint;
- return `beforeEntityId` / `afterEntityId`.

Because each child node wrapper includes its descendants, a sibling is treated as one subtree unit.

This prevents dropping a root sibling into the middle of another subtree unless the pointer is explicitly resolved into that subtree's child host.

---

# 13. Non-Forced Horizontal Parent Resolution

When the pointer is not inside a forced existing child block:

1. Determine the vertical insertion position among visible nodes.
2. Determine the previous visible entity around that insertion point.
3. Apply `horizontalDepthIntent`.
4. Clamp the requested depth to a valid tree depth.
5. Resolve the corresponding parent at `previewDepth - 1`.
6. Resolve exact sibling slot inside that parent's child host.

Rules:

- at the top of a container with no previous node, maximum valid depth is 0;
- requested depth cannot exceed `previousVisibleDepth + 1`;
- when requested depth is one deeper than the previous visible entity, that previous entity is the natural parent candidate;
- for shallower requested depths, resolve the closest applicable ancestor/scope;
- if requested depth has no valid parent, reduce depth until valid;
- never infer an invalid skipped level.

This is the recursive generalization of task drag's `resolveCandidateParent()` behavior.

---

# 14. Cycle and Descendant Protection

A Project/Tag can never be dropped:

```text
inside itself
inside any descendant
```

Example invalid move:

```text
A
    B
        C
```

Dragging A under C must be impossible.

Protection must exist at **two layers**:

## UI resolver

Exclude the dragged subtree from candidate parent/child hosts.

Since the whole subtree is moved into the floating layer, its descendants should naturally disappear from normal destination geometry, but do not rely on DOM alone.

Use data validation:

```text
candidateParentId != entityId
candidateParentId not in dragged entity descendant IDs
```

## Persistence service

Before commit, validate the same invariant against `AppState`.

Never trust the UI preview as the only protection.

---

# 15. Sorting Model — Sibling Scoped

Treat `sortOrder` as ordering **inside one parent scope**.

Examples:

```text
parentId = null
→ root Project sibling scope

parentId = A
→ A's direct Project children

parentId = B
→ B's direct Project children
```

Tags use identical rules.

After a successful drop, affected sibling scopes should be normalized to deterministic integer order:

```text
0, 1, 2, 3, ...
```

Do not rely on DOM order without persistence.

## Same-parent reorder

Only one sibling scope must be reordered.

## Reparent

Update:

- old parent sibling scope;
- new parent sibling scope;
- dragged entity's `parentId`.

Descendant `parentId` and descendant sibling order remain unchanged.

---

# 16. Transactional Persistence API

Add a focused persistence command, preferably in a new module such as:

```text
js/storage/data-service-taxonomy-drag.js
```

Conceptual API:

```js
commitTaxonomyDrag({
  entityType: 'project' | 'tag',
  entityId,
  targetParentId,
  beforeEntityId,
  afterEntityId
})
```

The command must:

1. resolve correct source array/store;
2. ensure entity exists;
3. validate target parent exists when non-null;
4. validate target parent is same taxonomy type;
5. reject self/descendant cycles;
6. capture source parent ID;
7. build source sibling IDs excluding dragged entity;
8. build destination sibling IDs excluding dragged entity;
9. insert entity according to `beforeEntityId` / `afterEntityId`;
10. update `parentId`;
11. renumber affected sibling `sortOrder` values;
12. update `updatedAt` for changed rows;
13. persist all changed rows in **one IndexedDB readwrite transaction** to the Projects or Tags store;
14. update `AppState` only after transaction success;
15. rerender the relevant sidebar tree;
16. preserve the currently selected Project/Tag filter if it still exists.

If source and destination parent are the same, do not duplicate work or write two copies of the same sibling scope.

---

# 17. Creation / Modal Parent Changes Must Respect the New Ordering Invariant

Hierarchy can also change through the existing Project/Tag editor, so drag ordering must not be undermined by the modal path.

Update taxonomy persistence helpers so:

## Create Project/Tag

Instead of global:

```text
next sortOrder across all entities
```

use:

```text
next sortOrder among siblings with the selected parentId
```

New entities append to the end of their selected sibling scope.

## Edit parent in modal

If `parentId` changes through the existing parent selector:

- validate cycle as today;
- remove entity from old sibling scope;
- append it to end of new sibling scope;
- normalize old/new sibling sort orders transactionally.

If parent does not change, preserve current `sortOrder`.

The editor remains a valid non-drag way to change hierarchy.

Do **not** add new `Link to Parent` / `Unlink` menu actions for Projects/Tags in this feature; the existing parent selector already fulfills that role.

---

# 18. Delete Behavior and Order Integrity

Keep the current product behavior:

```text
Delete parent Project/Tag
→ direct children become top-level
```

but make resulting ordering deterministic.

Recommended behavior:

- remove deleted parent from its sibling scope;
- promote its direct children into the deleted parent's parent scope (current implementation promotes to root; preserve current product rule unless consciously changed during implementation review);
- retain promoted children's relative order;
- place promoted children near the deleted parent's former position where practical;
- normalize the affected target/root sibling order.

Do not detach grandchildren from their direct parents.

If preserving the existing exact root-promotion semantics is required, only normalize ordering around that behavior—do not redesign delete semantics.

---

# 19. Rendering Order Must Explicitly Use `sortOrder`

Current recursive render uses filtered array order.

Change both Project and Tag renderers so every parent scope explicitly sorts direct children by:

```text
1. sortOrder ascending
2. createdAt fallback
3. id/name deterministic fallback
```

Do not assume `AppState.projects` or `AppState.tags` happens to already be globally sorted.

This makes drag results stable immediately and after refresh.

Parent selector lists may continue to show preorder/tree order, but should use the same deterministic taxonomy ordering helper where practical.

---

# 20. Tree Utility Layer

To avoid duplicating recursive hierarchy/order logic across Projects, Tags, drag resolver, and persistence, introduce a small shared utility module if useful, for example:

```text
js/taxonomy-order.js
```

Possible responsibilities:

```text
getItems(type)
getEntity(type, id)
getChildren(type, parentId)
compareEntityOrder(a, b)
getDepth(type, id)
getDescendantIds(type, id)
flattenTree(type)
```

Keep this module data-only. It should not manipulate DOM or IndexedDB.

This is optional if equally clean helpers fit elsewhere, but avoid copying near-identical Project and Tag tree algorithms into several files.

---

# 21. Drag Resolver Module Boundaries

Keep source files modular and generally below ~300 lines.

Recommended split:

```text
js/components/sidebar-taxonomy-drag.js
```

Responsibilities:

- initialization;
- pointer pending/activation;
- drag target lookup;
- session creation;
- floating positioning;
- drag-domain restriction.

```text
js/components/sidebar-taxonomy-drag-hierarchy.js
```

Responsibilities:

- depth measurement;
- horizontal intent/hysteresis;
- forced child-block detection;
- visible-tree/vertical slot resolution;
- candidate parent validation;
- placeholder host movement;
- preview model.

```text
js/components/sidebar-taxonomy-drag-touch.js
```

Responsibilities:

- touch pending/activation;
- touch identifier tracking;
- active touch move/end/cancel.

```text
js/components/sidebar-taxonomy-drag-commit.js
```

Responsibilities:

- unchanged-preview detection;
- commit/cancel cleanup;
- click suppression;
- sidebar vertical auto-scroll;
- FLIP sibling/subtree shift animation helpers if not kept in core.

Do not copy task files line-for-line if generic tree differences require different logic, but intentionally preserve the same interaction contract.

---

# 22. Sidebar Auto-Scroll

Projects/Tags can exceed the visible sidebar height.

During active taxonomy drag, auto-scroll the existing:

```text
.sidebar-content
```

when pointer/finger approaches its top or bottom edge.

Reuse the task drag speed model conceptually:

- edge zone around ~55 px;
- speed proportional to distance into edge zone;
- cap speed around task drag's existing maximum;
- after scrolling, recompute the hierarchy preview using current pointer coordinates.

No horizontal sidebar auto-scroll is needed.

---

# 23. Sidebar / Menu Interaction Safety

During an active taxonomy drag:

- do not allow drag release to select/open that Project/Tag;
- do not close the mobile sidebar because the dragged row generated a synthetic click;
- close existing row action menus when drag activates;
- do not start drag from the `•••` button;
- do not start drag while Project/Tag modal is open;
- suppress context menu while drag is pending/active where needed;
- cancel on Escape/window blur;
- clean every temporary body class/placeholder/revealed host on cancel/error.

After successful commit:

- rerender Projects or Tags;
- update counts;
- keep current filter selection synchronized;
- update task Project/Tag menus only if hierarchy/order display there depends on taxonomy order.

---

# 24. Visual Styling

Add a dedicated stylesheet, for example:

```text
css/components/sidebar-taxonomy-drag.css
```

Reuse task drag visual language:

```text
neutral floating subtree
blue placeholder only
normal non-target rows
subtle sibling shift animation
```

Suggested classes:

```text
.sidebar-taxonomy-drag-layer
.sidebar-tree-node.is-dragging
.sidebar-taxonomy-placeholder
.sidebar-tree-children[data-drag-reveal="true"]
body.sidebar-taxonomy-drag-active
```

Do not add permanent drag handles unless separately requested.

The normal sidebar appearance should remain unchanged when not dragging.

Respect `prefers-reduced-motion`.

---

# 25. Placeholder / Child Host Reveal

Every entity should have a child host, even when it currently has no children.

Normal empty host:

```text
zero visible height
no border
no blank spacing
```

If horizontal intent targets an empty entity as new parent:

```text
A
    [blue placeholder]
```

set a temporary reveal state only for the active target host.

When preview changes/cancel/commit:

- clear reveal state from old hosts;
- do not persist any expanded/revealed UI state.

Projects/Tags currently do not have a separate collapse state that this plan needs to manipulate.

---

# 26. Commit Failure / Rollback Behavior

Persistence is source-of-truth.

On release:

- calculate preview from session;
- call `AppDataService.commitTaxonomyDrag()`;
- do not permanently mutate `AppState` before IndexedDB succeeds.

If persistence fails:

- clean drag DOM/session;
- rerender from existing in-memory state;
- show existing persistence error banner;
- hierarchy/order must remain unchanged.

Do not leave placeholder/floating nodes stranded after exceptions.

---

# 27. Bootstrap / Integration

Expected integration:

- add taxonomy drag CSS link to `index.html`;
- load shared taxonomy order utility before sidebar drag modules if introduced;
- load sidebar taxonomy drag modules after `sidebar.js` so they can attach to `SidebarComponent`;
- `SidebarComponent.init()` calls `initTaxonomyDrag()` after caching Project/Tag list elements;
- add `data-service-taxonomy-drag.js` to `BOOTSTRAP_SCRIPTS` after base taxonomy service and before `ui-persistence-bindings.js`;
- persistent commit handler should call the new data-service method;
- fail fast during initialization if required hierarchy resolver methods are missing, mirroring the task drag integration guard.

Avoid the previous task-drag late-mixin bug: ensure methods are attached to the **live `SidebarComponent` object before `SidebarComponent.init()`**.

---

# 28. Files Expected to Change

Likely existing files:

```text
index.html
js/app.js
js/components/sidebar.js
js/components/sidebar-projects.js
js/components/sidebar-tags.js
js/storage/data-service-taxonomy.js
js/storage/ui-persistence-bindings.js
css/layout/sidebar-layout.css              (only if base tree layout belongs here)
css/components/project-tags.css            (only for existing row/tree compatibility)
```

Likely new focused files:

```text
js/taxonomy-order.js                        (optional shared data utility)
js/components/sidebar-taxonomy-drag.js
js/components/sidebar-taxonomy-drag-hierarchy.js
js/components/sidebar-taxonomy-drag-touch.js
js/components/sidebar-taxonomy-drag-commit.js
js/storage/data-service-taxonomy-drag.js
css/components/sidebar-taxonomy-drag.css
```

No changes expected to:

```text
js/storage/db-schema.js
repeat modules
Task recurrence logic
Kanban/List Completed collapse
Timeline
```

No IndexedDB migration should be required.

---

# 29. Manual Acceptance Matrix

Do not run Chrome/Playwright/Puppeteer/Selenium/headless browser tests.

## A. Root Project reorder

Given:

```text
A
B
C
```

1. Hold C.
2. Move between A/B at root indentation.
3. Blue placeholder is root-level.
4. Release.
5. Result is A, C, B.
6. Refresh.
7. Order remains A, C, B.

## B. Root Tag reorder

Repeat A for Tags.

## C. Project root → child

```text
A
B
C
```

1. Hold B.
2. Move right beneath A.
3. Placeholder snaps to A's child indentation.
4. Release.
5. Result:

```text
A
    B
C
```

6. Refresh; hierarchy remains.

## D. Tag root → child

Repeat C for Tags.

## E. Child → root

```text
A
    B
C
```

1. Hold B.
2. It starts at child indentation.
3. Move left.
4. Placeholder becomes root-level.
5. Release.
6. B becomes root.
7. Refresh; result persists.

## F. Child reparent

```text
A
    B
C
```

1. Hold B.
2. Keep child/deeper intent.
3. Move under C.
4. Release.
5. Result:

```text
A
C
    B
```

## G. Same-parent child reorder

```text
A
    B1
    B2
    B3
```

Move B3 between B1/B2 and verify persisted order.

## H. Forced child block

```text
A
    B1
    B2
C
```

1. Drag C between B1 and B2.
2. Move C far left while pointer Y remains in A's child block.
3. Placeholder stays child-indented.
4. Release.
5. C becomes child of A between B1/B2.

## I. Nested forced block

```text
A
    B
        C1
        C2
    D
E
```

Drop E between C1/C2.

Expected:

```text
A
    B
        C1
        E
        C2
    D
```

The deepest matching child block (B's) wins.

## J. Multi-level outdent

```text
A
    B
        C
```

Drag C far left to root preview and release.

Expected:

```text
A
    B
C
```

## K. Move parent subtree

```text
A
    B
        C
D
```

Move A after D.

Expected:

```text
D
A
    B
        C
```

B/C stay attached internally.

## L. Cycle prevention

```text
A
    B
        C
```

Attempt to drag A under B or C.

Expected:

```text
no valid child preview under own descendants
no commit
no cycle
```

## M. Empty-parent child creation

```text
A
B
```

Drag B right under A when A has no existing children.

Expected:

- temporary empty child host reveals blue placeholder;
- release creates first child B.

## N. Project/Tag isolation

1. Start dragging a Project.
2. Move pointer over Tags section.
3. No Tag drop preview appears.
4. Release outside Project domain does not move into Tags.
5. Repeat inverse for Tag.

## O. Touch long-press

On phone:

1. tap normally → filter selection works;
2. hold ~300 ms without moving → drag activates;
3. move before hold threshold >8 px → normal scrolling/interaction, drag does not activate;
4. active drag prevents page/sidebar scroll except controlled edge auto-scroll;
5. release commits without opening the Project/Tag.

## P. Sidebar auto-scroll

With a long Projects/Tags tree:

1. drag near bottom edge;
2. sidebar scrolls downward;
3. placeholder continues updating correctly;
4. drag near top edge;
5. sidebar scrolls upward.

## Q. Modal parent change after drag feature

1. Reorder entities by drag.
2. Open one entity editor.
3. Change Parent using existing selector.
4. Entity appends deterministically to new parent's child scope.
5. Old scope order remains correct.
6. Refresh preserves all ordering.

## R. Delete ordering integrity

1. Create parent with several direct children.
2. Delete parent using existing behavior.
3. Promoted children keep deterministic relative order.
4. Refresh does not reshuffle them.

## S. Regression

Verify manually:

```text
Inbox/Today/Completed sidebar filters unchanged
Project/Tag click selection unchanged
Project/Tag counts unchanged
Project/Tag add/edit/delete menus unchanged
Project/Tag parent selectors still prevent cycles
Task drag remains unchanged
Task hierarchy Link/Unlink remains unchanged
Repeat behavior unchanged
List/Kanban behavior unchanged
Completed collapse behavior unchanged
```

---

# 30. Explicit Non-Goals

Do not implement as part of this plan:

- dragging Projects into Tags or Tags into Projects;
- dragging Tasks into Project/Tag sidebar trees;
- adding Project/Tag Link/Unlink menu actions;
- changing Project/Tag hierarchy to one-level only;
- permanent drag handles;
- Project/Tag collapse/expand tree controls unless separately requested;
- keyboard-only reorder commands;
- multi-select drag;
- copy/duplicate on drag;
- task recurrence changes;
- task drag redesign;
- Timeline work;
- schema migration.

---

# 31. Implementation Order

1. Introduce shared deterministic taxonomy ordering/tree helpers if needed.
2. Refactor Project rendering into stable nested `.sidebar-tree-node` + child-host structure without changing appearance or click/menu behavior.
3. Refactor Tag rendering to the same shared structure.
4. Make create/update/delete Project/Tag persistence obey sibling-scoped `sortOrder` invariants.
5. Add transactional `commitTaxonomyDrag()` service with cycle protection and source/destination sibling normalization.
6. Add taxonomy drag hierarchy resolver: runtime indentation, depth intent, hysteresis, forced child blocks, exact sibling slots.
7. Add pointer/mouse drag lifecycle matching task timing and click suppression.
8. Add touch drag lifecycle matching task timing/identifier behavior.
9. Add floating subtree + blue placeholder + empty child-host reveal.
10. Add sidebar vertical auto-scroll and FLIP sibling/subtree movement.
11. Wire persistence commit and robust cleanup/error rollback.
12. Add CSS with task-consistent blue placeholder and neutral floating subtree.
13. Wire scripts/bootstrap in an order that avoids late-mixin integration failures.
14. Perform static source/integration review only.
15. User manually runs the acceptance matrix on desktop and phone.
