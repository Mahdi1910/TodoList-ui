# Implementation Plan ID 7 — Parent Linking, Unlinking, and Hierarchy-Aware Drag Preview

## Goal

Extend the existing one-level task/subtask system with two complementary ways to change hierarchy:

1. **Explicit task actions** from the existing `•••` menu:
   - keep the existing **Add Subtask** action;
   - add **Link to Parent** for eligible normal/root tasks;
   - add **Unlink** for subtasks.
2. **Hierarchy-aware long-press drag-and-drop**:
   - root task dragged to the right can become a subtask;
   - subtask starts dragging at subtask indentation;
   - subtask dragged left can become a root task;
   - subtask can be moved from parent A to parent C;
   - a root task dropped inside an existing child block automatically becomes a child of that block's parent;
   - the **blue placeholder is the authoritative visual preview** of the hierarchy level that will be committed if the user releases now.

Preserve the current one-level hierarchy only:

```text
Root
  └─ Subtask
```

Do not introduce sub-subtasks.

---

# 1. Confirmed UX Contract

## 1A. Existing Add Subtask stays

Do not remove or replace the existing action:

```text
•••
┌────────────────┐
│ Add Subtask    │
│ ...            │
└────────────────┘
```

The task edit modal's existing `+` Add Subtask action also remains unchanged.

The new features are additional hierarchy controls, not a replacement for existing subtask creation.

---

# 2. Three-Dot Menu Behavior

## Root / normal task

For an eligible root task:

```text
A                                      •••
                                        ↓
                                  ┌────────────────┐
                                  │ Add Subtask    │
                                  │ Link to Parent │
                                  │ Delete         │
                                  └────────────────┘
```

Selecting **Link to Parent** opens a secondary parent picker containing eligible root tasks.

Example:

```text
Link to Parent
┌──────────────────────┐
│ ○ Task A             │
│ ○ Task C             │
│ ○ Task D             │
└──────────────────────┘
```

Selecting `Task A`:

```text
Before
A
B

After
A
  └─ B
```

Rules:

- selected parent must be an existing root task;
- task cannot parent itself;
- a subtask can never be selected as parent;
- one-level hierarchy must be preserved;
- the linked task inherits the selected parent's project;
- via menu linking, append the linked task after the parent's existing subtasks unless there is a stronger existing ordering rule.

### Root tasks that already have subtasks

A root task with its own children cannot itself become another task's child without creating a sub-subtask level.

Do **not** silently detach or promote its children.

For these tasks:

- keep **Add Subtask**;
- show **Link to Parent** disabled or unavailable with a clear accessible reason such as `Move or unlink this task's subtasks first`;
- root-family drag can still reorder the family at root level;
- do not allow horizontal indentation to convert the family into a subtask.

---

## Subtask

For a subtask:

```text
A
  └─ B                                  •••
                                         ↓
                                   ┌────────────┐
                                   │ Unlink     │
                                   │ Delete     │
                                   └────────────┘
```

Do not show **Add Subtask** for a subtask.

Selecting **Unlink**:

```text
Before
A
  └─ B

After
A
B
```

Menu-based unlink behavior:

- `parentTaskId = null`;
- retain the subtask's current inherited project rather than unexpectedly moving it to Inbox;
- give it a valid root `sortOrder`;
- place it immediately after the former parent's root family where practical;
- persist the result transactionally before rerendering.

---

# 3. Parent Picker Layer

Use one secondary task-parent picker rather than creating one separate menu per task.

Recommended structure:

```text
Task action menu
      ↓ Link to Parent
Parent picker
```

Behavior:

- parent picker is anchored near/on the task action menu;
- only eligible root tasks are listed;
- target task itself is excluded;
- subtasks are excluded;
- current descendants/invalid choices are excluded;
- selecting a parent commits and closes the picker and task action menu;
- Escape closes the parent picker first;
- an outside click closes the parent picker first, then the task action menu on the next outside click, following the app's existing layered-menu interaction style where practical.

Accessibility:

- trigger uses `aria-haspopup` / `aria-expanded`;
- picker uses menu/listbox semantics;
- options have clear task names;
- disabled Link to Parent exposes a reason via `title` / `aria-description` or equivalent.

---

# 4. Current Drag Limitation That Must Be Removed

The current drag implementation explicitly rejects `.subtask-card` and resolves only a root `.task-family` as a drag target.

That means the current system can drag root families but **cannot drag a subtask independently**.

Refactor drag targeting so the system can distinguish:

```text
root drag unit    → .task-family
subtask drag unit → one subtask wrapper/card
```

Do not accidentally drag the entire parent family when the user holds a subtask.

---

# 5. Render a Stable Drag Unit for Every Subtask

**Files:**

```text
js/components/task-hierarchy.js
js/components/task-renderer.js (only if necessary)
css/components/task-subtasks.css
```

Each rendered subtask should have a stable wrapper/identity for drag purposes, for example:

```html
<div class="subtask-drag-item"
     data-task-id="B"
     data-parent-task-id="A">
  <div class="task-card subtask-card">...</div>
</div>
```

The exact element name can differ, but requirements are:

- one movable DOM unit per subtask;
- easy lookup of task ID and current parent ID;
- wrapper does not visually change the existing design when not dragging;
- task card's existing edit/checkbox/three-dot interactions continue working.

---

# 6. Keep/Expose a Child Drop Host for Every Root Task

Today `.subtask-list` is only rendered when a root already has children.

To support this case:

```text
A
B

hold B → move right under A
```

`A` needs a target child slot even when it currently has zero subtasks.

Recommended direction:

- render a `.subtask-list` / child-drop host for every root family;
- empty hosts have no visible border/height during normal display;
- during an active hierarchy drag, the candidate parent's empty child host can expose the blue placeholder;
- existing child lists keep the current indentation and border styling;
- collapsed parents remain logically valid targets; if targeted, expose at least a compact child placeholder without permanently expanding their saved collapse state.

Attach explicit metadata such as:

```text
data-subtask-parent-id="A"
```

so drag logic does not infer parent identity from fragile DOM traversal.

---

# 7. Hierarchy Drag Session State

Extend `dragSession` with hierarchy-specific state.

Conceptual fields:

```text
sourceLevel          root | subtask
sourceParentId       null | taskId
previewLevel         root | subtask
previewParentId      null | taskId
sourceLeft           original rendered left edge
rootAlignmentX       measured root alignment
subtaskAlignmentX    measured child alignment
horizontalIntent     root | subtask
forcedChildZone      boolean
previewBeforeTaskId  optional sibling insertion target
```

For a root task:

```text
sourceLevel = root
previewLevel = root
```

For a subtask:

```text
sourceLevel = subtask
sourceParentId = A
previewLevel = subtask
previewParentId = A
```

This is essential to the requested initial visual behavior.

---

# 8. Floating Element Must Start at Its Existing Visual Level

## Root task

If B is a root task:

```text
A
B
```

Long-press B:

```text
A
[B floating]
──────────── blue root placeholder
```

The floating element begins at B's original root X position.

## Subtask

If B is a child of A:

```text
A
   B
```

Long-press B:

```text
A
   [B floating]
   ──────────── blue child placeholder
```

Do **not** snap B back to the root X position when drag begins.

The floating card begins from its original indented rectangle, and the placeholder also begins in the child slot.

This means simply lifting a subtask already visually says:

```text
"release now → still a subtask"
```

---

# 9. Blue Placeholder Is the Authoritative Hierarchy Preview

The placeholder must communicate the exact result of releasing the task **right now**.

## Root preview

```text
A
──────────────────────────────  ← full/root-level blue placeholder
B
```

means:

```text
release → root task
parentTaskId = null
```

## Subtask preview

```text
A
   ────────────────────────     ← indented blue placeholder
```

means:

```text
release → child of A
parentTaskId = A
```

Do not require the user to infer hierarchy from pointer position alone.

The placeholder itself must snap left/right between the two hierarchy alignments.

---

# 10. Do Not Use Literal Physical Centimeters

The user's `2–3 cm` / `3 cm` language describes the intended gesture magnitude, not a reliable browser unit.

Physical CSS `cm` or a fixed pixel number will vary badly across devices and browser scaling.

Use the application's **actual rendered hierarchy indentation**.

Current visual indentation is approximately:

```text
desktop: 30px margin + 14px padding ≈ 44px
mobile:  18px margin + 10px padding ≈ 28px
```

Prefer runtime measurement:

```text
rootAlignmentX    = root card/list left edge
subtaskAlignmentX = child card/drop-host left edge
```

Then derive the switching threshold from the midpoint between those two alignments.

This makes the gesture automatically match desktop/mobile CSS.

Add small hysteresis (for example 8–12px around the midpoint) so the preview does not flicker rapidly between root and child if the finger is near the boundary.

The exact tuned hysteresis should be a named constant, not scattered magic numbers.

---

# 11. Horizontal Intent Must Be Stateful

The user's subtask scenario requires this sequence:

```text
A
   B
C

hold B
move B left until placeholder becomes root-level
move B downward near C while staying at root alignment
release
```

Result:

```text
A
C
B   (or B/C order based on vertical slot)
```

Therefore track the current hierarchy intent:

```text
horizontalIntent = root | subtask
```

Use threshold + hysteresis transitions:

```text
root → cross right threshold    → subtask intent
subtask → cross left threshold  → root intent
```

Do not reset horizontal intent merely because the pointer moves vertically.

It may switch back only when the user clearly crosses the opposite threshold again, unless a forced child zone takes precedence.

---

# 12. Highest-Priority Rule: Existing Child Block Wins

This is a strict requirement.

Given:

```text
A
   B1
   B2
C
```

If C is dropped between A and B1:

```text
A
   [ C ]
   B1
   B2
```

result:

```text
A
   C
   B1
   B2
```

If C is dropped between B1 and B2:

```text
A
   B1
   [ C ]
   B2
```

result:

```text
A
   B1
   C
   B2
```

This is true **even if C was moved far left horizontally**.

Implementation precedence:

```text
1. Is pointer/insertion slot inside an existing root family's child block?
   YES → force previewLevel = subtask and previewParentId = that root.

2. Otherwise use horizontalIntent + nearest eligible root/insertion position.
```

When forced:

```text
forcedChildZone = true
```

and the blue placeholder must visibly snap to the child indentation.

This rule prevents ambiguous drops between parent/children from unexpectedly creating a root task in the middle of one visual family.

---

# 13. Define Child-Block Hit Zones by Geometry, Not Text/DOM Guessing

Create a hierarchy drop resolver, preferably in a new focused module:

```text
js/components/task-drag-hierarchy.js
```

Responsibilities:

```text
measure root/subtask alignment
identify root insertion slots
identify child insertion slots
identify forced child zones
resolve candidate parent
move placeholder into correct host
return hierarchy preview model
```

Recommended conceptual result:

```js
{
  level: 'subtask',
  parentId: 'A',
  beforeTaskId: 'B2',
  forced: true
}
```

or:

```js
{
  level: 'root',
  parentId: null,
  beforeTaskId: 'C',
  forced: false
}
```

Do not spread hierarchy resolution branches through pointer, touch, commit, and rendering files separately.

---

# 14. Root → Subtask by Right Movement

Given:

```text
A
B
C
```

Hold B at root level.

Initial placeholder:

```text
A
──────────────────────── root preview
C
```

Move B right beyond the hierarchy threshold while positioned under/after A:

```text
A
   ───────────────────── child preview
C
```

Result on release:

```text
A
   B
C
```

Candidate parent rule outside forced child blocks:

- use the root task visually above the current insertion slot;
- candidate must be a valid root task;
- candidate cannot be the dragged task;
- candidate can already have subtasks;
- if there is no valid root above, keep root preview.

A root task that already owns subtasks is not eligible to become a subtask because the app supports only one hierarchy level.

---

# 15. Subtask → Root by Left Movement

Given:

```text
A
   B
C
```

Long-press B.

Initial state:

```text
A
   [B floating]
   ───────────────── child preview
C
```

Move left beyond the root threshold:

```text
A
[B floating]
──────────────────── root preview
C
```

If the pointer is not inside a forced child block, release commits:

```text
parentTaskId = null
```

The root placeholder's vertical position determines B's new root order.

Retain B's current project unless a root-level grouped destination explicitly changes it through the existing grouping behavior.

---

# 16. Reparent Subtask A → C

Given:

```text
A
   B
C
```

Hold B. It begins with child intent.

Move B downward while keeping child indentation near/under C:

```text
A
C
   ───────────── child placeholder
```

Release:

```text
A
C
   B
```

Commit:

```text
B.parentTaskId = C.id
B.project = C.project
```

Place B according to the exact child insertion slot. If C has no children, B becomes C's first child.

---

# 17. Reorder Subtasks Within the Same Parent

Given:

```text
A
   B1
   B2
   B3
```

Dragging B3 between B1 and B2:

```text
A
   B1
   ───────── blue child placeholder
   B2
```

results:

```text
A
   B1
   B3
   B2
```

Persist child sibling order using `sortOrder`.

Do not rely on DOM order alone.

---

# 18. Subtask Ordering Must Become Explicit Per Parent Scope

Current persistence already stores `sortOrder`, but root drag persistence is root-only.

Extend ordering helpers so ordering is defined by sibling scope:

```text
root scope              parentTaskId = null
child scope for A       parentTaskId = A
child scope for C       parentTaskId = C
```

Recommended helpers:

```text
getSiblingTasks(parentTaskId)
getSiblingTaskIds(parentTaskId)
resequenceTaskScope(parentTaskId, orderedIds)
```

When reparenting B from A → C:

```text
resequence old A child scope
resequence new C child scope
```

When unlinking B:

```text
resequence old child scope
resequence root scope
```

The in-memory `AppState` order and persisted `sortOrder` must agree after commit and after refresh.

---

# 19. Persistence Service: Explicit Link / Unlink Commands

Add durable service commands, preferably in a focused relationship service module if needed for line limits:

```text
AppDataService.linkTaskToParent(taskId, parentId)
AppDataService.unlinkTask(taskId, placement?)
```

### Link transaction

Conceptually:

```text
BEGIN
  validate child is eligible leaf root
  validate parent is root
  set child.parentTaskId = parentId
  set child.projectId = parent.projectId
  assign child sortOrder at end of parent child scope
  resequence affected root scope
COMMIT
```

### Unlink transaction

```text
BEGIN
  validate task is subtask
  set parentTaskId = null
  retain projectId
  insert into root ordering near former parent / requested slot
  resequence old child scope
  resequence root scope
COMMIT
```

Only update `AppState` after IndexedDB transaction success.

---

# 20. Persistence Service: Hierarchy Drag Command

The existing `AppDataService.commitTaskDrag()` currently rejects subtasks and only persists root order/group metadata.

Refactor/replace with a hierarchy-aware command, for example:

```text
AppDataService.commitHierarchyDrag({
  taskId,
  sourceParentId,
  targetParentId,
  targetLevel,
  orderedRootIds,
  sourceChildIds,
  targetChildIds,
  sourceContext,
  destinationContext
})
```

The exact payload can be simpler, but the transaction must have enough information to commit one atomic result.

Transaction may update:

```text
tasks.parentTaskId
tasks.projectId
tasks.sortOrder
root sibling order
source parent's child order
target parent's child order
existing Group By metadata if applicable
app_settings.sortKey = custom
```

All related writes occur in one IndexedDB transaction.

Never persist hierarchy first and order second in unrelated transactions.

---

# 21. Hierarchy vs Group-By Metadata Precedence

Preserve existing Group By drag behavior, but hierarchy has an explicit precedence rule.

## Root-level drop

If preview is root:

```text
apply existing group destination mutation
+
apply root order
```

Example: dragging a root into another Project group still changes its project.

## Subtask-level drop

If preview parent is A:

```text
parent relationship wins for project
```

because the existing domain rule requires:

```text
child.project = parent.project
```

Do not let a conflicting Project group destination leave a child with a project different from its parent.

Priority/date/tag group metadata may continue to apply where the current UX exposes a meaningful compatible target, but it must not violate hierarchy integrity.

Document the final precedence in the hierarchy drag resolver/service rather than allowing accidental order-dependent mutations.

---

# 22. Placeholder DOM Movement

Do not fake hierarchy preview using only a translated blue rectangle.

Move the placeholder into the actual semantic destination host:

```text
root preview
→ root task drop lane

subtask preview
→ target root's child drop host
```

Benefits:

- indentation automatically matches real CSS;
- width naturally matches root vs child content area;
- child order preview is exact;
- forced child-block behavior is straightforward;
- user sees the actual final structural location.

The placeholder should keep the current blue visual style.

---

# 23. Floating Card Width and Indentation

Root family drag currently uses the original element width.

For hierarchy conversion:

- floating element should continue following the pointer smoothly;
- it starts from the exact original rectangle;
- do not snap the floating card abruptly when hierarchy intent changes;
- the **placeholder** performs the clear snap between root/subtask levels;
- optional subtle width adjustment is allowed only if it improves the visual match and does not cause jitter.

For a subtask drag, drag only that subtask's wrapper/card, not the entire root family.

---

# 24. Touch and Pointer Must Share One Resolver

Current pointer and touch implementations both call `positionFloatingFamily()` and `updateTaskDropTarget()`.

Keep one hierarchy resolution path for both inputs.

Do not create separate hierarchy rules for desktop mouse and phone touch.

Conceptually:

```text
pointermove / touchmove
       ↓
update floating position
       ↓
resolveHierarchyDrop(x, y)
       ↓
update placeholder + preview state
```

Long-press timing can remain the current approximately 300ms unless manual testing shows it conflicts with the new subtask target.

---

# 25. Drag Activation Hit Rules

Current drag intentionally ignores interactive controls.

Preserve that behavior:

```text
button
checkbox
links
inputs
selects
textareas
three-dot actions
```

must not start a drag.

But remove the blanket rejection of `.subtask-card`.

Instead:

- holding non-interactive area of a root card → root-family drag;
- holding non-interactive area of a subtask card → subtask-only drag.

Editing by normal click/keyboard remains unchanged.

---

# 26. Collapsed Parent Behavior

A collapsed root may still be a valid parent.

Recommended behavior:

- right-indent underneath a collapsed root may target it as parent;
- display a compact indented blue placeholder immediately beneath it;
- do not permanently alter the parent's saved collapsed state;
- after successful drop, keep the parent collapsed unless existing UX intentionally expands it.

Forced child-zone logic only uses visible child geometry. Hidden children must not create invisible giant hit regions.

---

# 27. Invalid Hierarchy Targets

Do not allow:

```text
task → itself
root with children → another parent
subtask → subtask parent
sub-subtask creation
missing parent
cyclic relationship
```

If horizontal intent requests a child level but there is no valid parent candidate:

- keep/revert the placeholder to root level;
- do not show an indented preview that cannot be committed.

If an otherwise valid drag becomes invalid because the underlying state changed, abort cleanly and rerender from current `AppState`.

---

# 28. Task Action Menu Changes

**Files:**

```text
index.html
js/components/task-actions.js
css/components/task-subtasks.css
```

Extend the shared action menu from:

```text
Add Subtask
Delete
```

to support:

```text
Add Subtask
Link to Parent
Unlink
Delete
```

Visibility by target type:

```text
root leaf:
  Add Subtask     visible
  Link to Parent  visible
  Unlink          hidden

root with children:
  Add Subtask     visible
  Link to Parent  disabled/unavailable
  Unlink          hidden

subtask:
  Add Subtask     hidden
  Link to Parent  hidden
  Unlink          visible
```

Delete remains available for both.

Do not remove current delete confirmations/family semantics.

---

# 29. Recommended Module Split

Current `task-drag.js` already owns pointer session mechanics. Do not overload it with all hierarchy geometry and relationship resolution.

Recommended new focused module:

```text
js/components/task-drag-hierarchy.js
```

Own:

```text
hierarchy alignment measurement
horizontal intent switching
forced child-zone detection
root/child insertion slot calculation
candidate parent resolution
placeholder relocation
preview-level state
```

Keep:

```text
task-drag.js
```

focused on drag lifecycle / pointer movement.

Keep:

```text
task-drag-touch.js
```

focused on touch event translation.

Refactor:

```text
task-drag-commit.js
```

to prepare the final hierarchy result and invoke the durable service.

Register the new module in:

```text
index.html
js/components/tasks.js
```

before commit methods if dependency order requires it.

---

# 30. Persistence Module Split

The current storage architecture is already modular.

Prefer one focused relationship/hierarchy service if adding all behavior to `data-service-drag.js` would make it too large:

```text
js/storage/data-service-hierarchy.js
```

Potential ownership:

```text
linkTaskToParent
unlinkTask
commitHierarchyDrag
resequence sibling scopes
transactional parent/project/order validation
```

Then keep `data-service-drag.js` for ordinary group/order helpers or merge only if the final file remains small and coherent.

If a new storage module is added, register it in `js/app.js` storage script order before `ui-persistence-bindings.js`.

---

# 31. Persistence Bindings

`ui-persistence-bindings.js` currently overrides the root-only drag commit path so persistence finishes before in-memory mutation.

Update the binding so:

```text
drop
↓
await AppDataService.commitHierarchyDrag(...)
↓
DB transaction completes
↓
AppState mirror updated
↓
cleanup drag
↓
render
```

Also bind:

```text
Link to Parent
Unlink
```

to persistent service commands.

On failure:

- do not leave a fake hierarchy in memory;
- remove floating UI;
- render the last durable AppState;
- show the existing concise storage error banner.

---

# 32. Sort Mode After Manual Hierarchy Drag

A successful manual drag should continue switching Sort to:

```text
Custom
```

and persist:

```text
app_settings.sortKey = custom
```

because the user explicitly established manual order.

Menu-based Link/Unlink may preserve the current Sort setting because it is a relationship command rather than an explicit ordering gesture, unless the existing implementation requires `Custom` to display deterministic sibling placement. If deterministic visual placement cannot be preserved under another active Sort mode, keep the sort setting but understand that the visible order may still be controlled by that selected sort.

Do not unexpectedly reset Group By.

---

# 33. Visual CSS Requirements

**Files:**

```text
css/components/task-drag.css
css/components/task-subtasks.css
```

Keep the current blue placeholder styling.

Add only hierarchy-state styling needed for:

```text
root placeholder width/alignment
subtask placeholder width/alignment
empty child drop host during drag
subtask floating wrapper
optional transition when placeholder changes level
invalid/disabled Link to Parent control
```

Avoid highlighting the entire lane/family.

Only the placeholder should provide the strong blue hierarchy preview.

No reintroduction of the old whole-lane blue background problem.

---

# 34. Visual Examples — Required Outcomes

## Root starts root

```text
A
B  ← hold

A
[B floating]
────────────────── blue root shadow
```

## Root moves right

```text
A
   [B floating]
   ─────────────── blue child shadow
```

Release:

```text
A
   B
```

---

## Subtask starts indented

```text
A
   B ← hold

A
   [B floating]
   ─────────────── blue child shadow
```

No horizontal movement is required for it to remain a child.

---

## Subtask moves left

```text
A
[B floating]
────────────────── blue root shadow
C
```

Release outside a forced child block:

```text
A
B
C
```

---

## Reparent B from A to C

```text
A
   B
C

hold B, keep child level, move down

A
C
   ─────────────── child shadow
```

Release:

```text
A
C
   B
```

---

## Forced child block ignores left intent

```text
A
   B1
   B2
C
```

Move C between B1 and B2, even while pointer is far left:

```text
A
   B1
   ─────────────── blue child shadow
   B2
```

Release:

```text
A
   B1
   C
   B2
```

---

## Between parent and first child

```text
A
   B1
   B2
C
```

Move C into the slot between A and B1:

```text
A
   ─────────────── blue child shadow
   B1
   B2
```

Release:

```text
A
   C
   B1
   B2
```

---

# 35. Acceptance Tests — Three-Dot Actions

1. Root leaf task shows Add Subtask + Link to Parent + Delete.
2. Add Subtask continues to work exactly as before.
3. Link to Parent opens eligible root list.
4. Choosing A makes B a child of A.
5. Refresh → relationship persists.
6. B inherits A's project.
7. Subtask menu hides Add Subtask and shows Unlink.
8. Unlink B → B becomes root.
9. Refresh → B remains root.
10. Root with existing children cannot be linked under another root.
11. No menu operation creates a sub-subtask.

---

# 36. Acceptance Tests — Initial Drag Preview

12. Hold root B without horizontal movement → floating B remains at root X; blue placeholder is root level.
13. Hold subtask B without horizontal movement → floating B begins at child X; blue placeholder is child level.
14. No initial snap from subtask indentation to root indentation occurs.
15. Placeholder width/alignment clearly distinguishes root from subtask on desktop.
16. Same behavior works on mobile with the mobile indentation.

---

# 37. Acceptance Tests — Horizontal Hierarchy Intent

17. Root B moved right across threshold → blue placeholder snaps to child level.
18. Move it back left across reverse threshold → placeholder snaps to root level.
19. Small jitter near threshold does not rapidly flicker due to hysteresis.
20. Subtask B moved left across threshold → root placeholder appears.
21. Continue moving B vertically while staying at root alignment → root intent remains.
22. Move B right again → it can return to child intent.

---

# 38. Acceptance Tests — Forced Child Zones

23. A has B1/B2; drag root C between A and B1 → C previews/commits as child A.
24. Drag root C between B1 and B2 → C previews/commits as child A.
25. Repeat while pointer is deliberately far left → child preview still wins.
26. Blue placeholder visibly remains indented during forced child-zone state.
27. Drag outside A's child block → horizontal hierarchy intent becomes active again.

---

# 39. Acceptance Tests — Reparenting and Ordering

28. A→B child; C root. Drag B under C while keeping child level → B.parent = C.
29. Refresh → B remains under C.
30. C project differs from A → B inherits C project.
31. Reorder B1/B2/B3 within A → child order persists after refresh.
32. Move B from A to C between existing C children → exact insertion position persists.
33. Drag B left to root slot between C and D → B becomes root at that exact manual position.
34. Refresh → root position persists.

---

# 40. Acceptance Tests — Persistence / Transactions

35. Link to Parent updates parent/project/order atomically.
36. Unlink updates parent/order atomically.
37. Reparent updates old child scope + new child scope + project atomically.
38. Drag hierarchy + Group By metadata is one transaction.
39. Simulated write failure leaves hierarchy unchanged in AppState after rerender.
40. No orphan parent IDs are created.
41. No subtask has a subtask parent.
42. IndexedDB `tasks.parentTaskId`, `projectId`, and `sortOrder` match the rendered hierarchy after refresh.

---

# 41. Acceptance Tests — Existing Features

43. Root family reorder still works.
44. Root task with existing subtasks drags as one root family for root reordering.
45. Existing Add Subtask menu action still works.
46. Existing Add Subtask `+` in task editor still works.
47. Edit task/subtask works.
48. Completion checkbox works.
49. Delete root family works.
50. Delete subtask only works.
51. List view works.
52. Kanban remains functional.
53. Group By remains functional.
54. Sort & Group panel remains functional.
55. No whole-lane blue drag highlight is reintroduced.
56. Timeline remains disabled/unimplemented.

---

# 42. Manual Testing Only

Do not introduce browser automation/headless Chrome for this feature.

Use static/source checks only during implementation.

The user will manually test touch behavior on the phone and mouse/pointer behavior on desktop.

Particularly test on phone:

```text
long press root
long press subtask
root → right indent
subtask → left outdent
subtask A → parent C
forced child slot between B1/B2
forced child slot between parent A/B1
placeholder left/right preview
```

---

# 43. Expected Files to Change

Likely existing files:

```text
index.html
js/components/tasks.js
js/components/task-actions.js
js/components/task-hierarchy.js
js/components/task-drag.js
js/components/task-drag-touch.js (minimal, only if shared call signature changes)
js/components/task-drag-commit.js
js/task-order.js
css/components/task-subtasks.css
css/components/task-drag.css
js/storage/ui-persistence-bindings.js
js/app.js (only if a new storage service file is loaded dynamically)
```

Likely new focused modules:

```text
js/components/task-drag-hierarchy.js
js/storage/data-service-hierarchy.js
```

Do not modify unrelated scheduling, settings, theme, or workspace-menu styling.

---

# 44. Completion Contract

Implementation Plan ID 7 is complete only when all of the following are true:

1. Existing Add Subtask actions remain.
2. Eligible root tasks can Link to Parent from `•••`.
3. Subtasks can Unlink from `•••`.
4. Relationships persist through IndexedDB.
5. Root tasks and subtasks can both be long-pressed into floating drag state.
6. A subtask starts floating at its existing indented level.
7. A root starts floating at root level.
8. Blue placeholder starts at the dragged task's current hierarchy level.
9. Horizontal right movement can preview/commit root → subtask.
10. Horizontal left movement can preview/commit subtask → root.
11. The placeholder visibly snaps left/right to show the exact release result.
12. Horizontal intent remains stable while moving vertically.
13. Existing child-block insertion slots override horizontal intent.
14. Between parent/first child and between child/child always previews and commits as that parent's child.
15. A subtask can be reparented A → C by drag.
16. Subtasks can be reordered within one parent.
17. Root and child orders persist using explicit `sortOrder`.
18. Parent project inheritance remains valid.
19. No sub-subtasks can be created.
20. Root families with existing children cannot be nested under another root.
21. Hierarchy + ordering + compatible group metadata commits atomically.
22. Existing drag, List, Kanban, Group By, task edit/delete, and persistence behavior remains intact.
23. No browser automation is used; final validation instructions are manual desktop/mobile tests.
