# Implementation Plan ID 14 — Fix Project/Tag Outdent When Multiple Siblings Remain

## Goal

Fix the hierarchy-drag defect introduced with Project/Tag drag-and-drop where a child Project or Tag cannot reliably outdent to a shallower level when its current parent still has another child remaining.

Primary reproduction:

```text
A
    B
    C
```

Dragging `C` clearly to the left should produce:

```text
A
    B
C
```

but the current resolver keeps `C` under `A`.

The same defect exists for Tags because Projects and Tags share the same taxonomy drag hierarchy resolver.

This plan is intentionally narrow. It does **not** redesign taxonomy dragging, persistence, sorting, modal focus, Task dragging, or Project/Tag hierarchy semantics.

No application implementation is part of this plan commit.

---

# 1. Confirmed Root Cause

The bug is in:

```text
js/components/sidebar-taxonomy-drag-hierarchy.js
```

The current resolver performs these steps:

```text
1. Update horizontal depth intent from pointer X.
2. Search for a forced child zone from pointer Y.
3. If any forced child zone exists, immediately use it and return.
4. Only otherwise resolve the destination from horizontal depth intent.
```

Conceptually:

```js
updateTaxonomyDepthIntent(...);

const forced = findForcedTaxonomyChildZone(...);
if (forced) {
    apply child preview;
    return;
}

resolve from horizontalDepthIntent;
```

The forced child detector currently treats any `.sidebar-tree-children` host containing at least one visible child as a valid forced zone.

That creates sibling-count-dependent behavior.

## Case A — only one child

```text
A
    B
```

When `B` starts dragging, its node is removed from A's child host and placed in the floating drag layer.

A's child host then contains zero real child nodes:

```text
A
    [empty child host]
```

The forced-zone code rejects the host because:

```text
direct.length === 0
```

Therefore moving B left is allowed to fall through to the normal horizontal resolver and B becomes root.

This is why the single-child case already works.

## Case B — two children

```text
A
    B
    C
```

When `C` starts dragging, `B` remains inside A's child host:

```text
A
    B
```

Therefore:

```text
direct.length > 0
```

A's child host remains a valid forced child zone.

Even after horizontal intent correctly changes from depth 1 to depth 0, the forced-child branch runs first and forces C back under A.

The actual failure is therefore:

> The dragged entity's **own source hierarchy zone** is allowed to override a deliberate horizontal outdent request merely because another sibling remains in that zone.

The persistence layer is not the cause. The commit service already commits the final preview's `parentId` and sibling slot correctly. The wrong preview is being chosen before commit.

---

# 2. Required Behavioral Invariant

Forced-child behavior must remain, but it must not trap an item inside hierarchy levels that the user has explicitly outdented past.

Required rule:

> A forced child zone belonging to the dragged entity's original ancestor path must not override a horizontal depth intent that is shallower than that zone.

Unrelated child zones must continue to behave exactly as they do now.

This distinction is critical.

---

# 3. Preserve Legitimate Forced-Child Behavior

Do **not** solve this by disabling forced child zones whenever horizontal intent is root/shallow.

That would break a useful existing behavior.

Example:

```text
A
    B
    C
D
```

Dragging unrelated root Project `D` vertically between B and C should still allow:

```text
A
    B
    D
    C
```

Even if D's current horizontal intent is root, entering another Project's established child block should still force D into that block.

Therefore this rule would be incorrect:

```text
if horizontalDepthIntent < forced.depth:
    reject every forced zone
```

The suppression must apply **only to source-ancestor zones being intentionally exited**.

---

# 4. Generalize the Fix for Recursive Project/Tag Trees

Projects and Tags support arbitrary recursive depth, so the fix must not be hard-coded only for root → child.

Example:

```text
A
    B
        C
```

C starts at depth 2.

## One-level outdent

Move C left enough for horizontal intent depth 1:

Expected:

```text
A
    B
    C
```

Behavior required:

- B's child host represents zone depth 2;
- because desired depth is 1, B's source-child zone must stop forcing C;
- A's child host represents zone depth 1;
- A's zone may remain eligible because it matches the intended depth;
- resulting parent becomes A.

## Full outdent

Move C farther left until horizontal intent depth 0:

Expected:

```text
A
    B
C
```

Behavior required:

- B's source zone at depth 2 is suppressed;
- A's source-ancestor zone at depth 1 is also suppressed;
- normal depth resolver falls through to root depth 0.

This must work at any hierarchy depth.

---

# 5. Capture Immutable Source-Ancestor Zone Information at Drag Start

The drag session currently stores:

```text
sourceParentId
sourceDepth
sourceHost
horizontalDepthIntent
```

Extend the session with immutable source ancestry information captured when dragging begins.

Recommended representation:

```text
sourceAncestorZoneDepths: Map<parentEntityId, childZoneDepth>
```

Example:

```text
A depth 0
└─ B depth 1
   └─ C depth 2
```

Dragging C should capture approximately:

```text
B → 2
A → 1
```

Meaning:

- B's child host is a depth-2 destination zone;
- A's child host is a depth-1 destination zone.

Do not derive this from the moving placeholder's current DOM location during drag. The source ancestry must describe where the entity started, even after the placeholder moves through other hosts.

### Suggested helper

Add a small helper in the taxonomy hierarchy/drag module, such as:

```text
buildTaxonomySourceAncestorZones(entityType, entityId)
```

It should:

1. get the dragged entity from `TaxonomyOrder`;
2. start at the entity's original parent;
3. walk upward through `parentId`;
4. record each ancestor parent ID and the corresponding child-zone depth;
5. protect against unexpected cycles with a `seen` set;
6. return a Map or equivalent immutable session structure.

No IndexedDB read is needed; hydrated `AppState`/`TaxonomyOrder` is sufficient.

---

# 6. Add an Explicit Source-Zone Suppression Predicate

Do not scatter the new condition inline throughout `findForcedTaxonomyChildZone()`.

Add a focused helper, e.g.:

```text
shouldSuppressSourceAncestorForcedZone(parentId, zoneDepth)
```

Required logic:

```text
is source ancestor zone
AND
horizontalDepthIntent < zoneDepth
→ suppress this forced zone
```

Conceptually:

```js
const sourceDepth = session.sourceAncestorZoneDepths?.get(parentId);
const isSourceAncestorZone = sourceDepth === zoneDepth;
const isOutdentingPastZone = session.horizontalDepthIntent < zoneDepth;

return isSourceAncestorZone && isOutdentingPastZone;
```

The exact implementation may differ, but the invariant must stay the same.

---

# 7. Update `findForcedTaxonomyChildZone()` Candidate Filtering

Current candidate flow roughly does:

```text
for every child host
    require visible children
    require valid parent
    require Y inside host bounds
    add candidate
choose deepest candidate
```

Update it to:

```text
for every child host
    require visible children
    require valid parent
    require Y inside host bounds
    compute zone depth
    if source-ancestor zone being outdented past:
        skip candidate
    otherwise:
        add candidate
choose deepest remaining candidate
```

Important: perform suppression **before** deepest-candidate sorting.

This lets the resolver naturally fall back from a suppressed deeper source zone to a valid shallower source ancestor or unrelated zone.

Example:

```text
A
    B
        C ← dragging
```

Intent depth 1:

```text
B child zone depth 2 → suppressed
A child zone depth 1 → allowed
```

Intent depth 0:

```text
B zone depth 2 → suppressed
A zone depth 1 → suppressed
normal root resolution runs
```

---

# 8. Keep Horizontal Hysteresis Unchanged

Do not change `updateTaxonomyDepthIntent()` thresholds unless manual testing proves a separate issue.

The current bug is not that horizontal intent fails to become root/shallow. It does change correctly.

The bug is that forced-zone resolution subsequently overwrites it.

Preserve:

```text
root alignment measurement
indent step
hysteresis thresholds
multi-level left/right intent changes
```

This minimizes regression risk.

---

# 9. Keep Normal Depth Resolution Unchanged

After source-zone suppression, the existing fallback path should remain responsible for actual depth/parent resolution:

```text
getVisibleTaxonomyNodes()
resolveTaxonomyInsertionIndex()
resolveTaxonomyParentForDepth()
resolveTaxonomySiblingSlot()
applyTaxonomyPreview()
```

Do not create a separate special-case "make root" commit path.

The blue placeholder remains the single source of truth for the eventual commit.

Expected visual behavior for the main bug:

```text
A
    B
    C ← dragging
```

Move C left across the outdent threshold:

```text
A
    B
──────────── blue root placeholder
```

Release:

```text
A
    B
C
```

---

# 10. Persistence / Commit Layer Should Not Change

Expected no behavioral changes in:

```text
js/components/sidebar-taxonomy-drag-commit.js
js/storage/data-service-taxonomy-drag.js
```

The current commit path already takes:

```text
previewParentId
previewBeforeEntityId
previewAfterEntityId
```

and persists the resulting hierarchy/sibling order.

Once the resolver produces the correct root/shallower preview, the existing commit path should persist it correctly.

During implementation, review these files only to confirm this assumption; do not modify them unless a concrete integration issue is discovered.

No database schema/version change is required.

---

# 11. Project and Tag Share the Fix

Do not implement separate Project and Tag patches.

Both use:

```text
SidebarTaxonomyDragHierarchyMethods
```

The correction belongs in the shared taxonomy resolver/session logic.

Required parity:

```text
Project outdent behavior == Tag outdent behavior
```

Every acceptance scenario below must be tested once for Projects and once for Tags where relevant.

---

# 12. Parent With Multiple Children — Core Acceptance Matrix

## A. Single child regression

Start:

```text
A
    B
```

Drag B left.

Expected:

```text
A
B
```

Must continue working.

## B. Two children — last child (reported bug)

Start:

```text
A
    B
    C
```

Drag C left.

Expected:

```text
A
    B
C
```

This is the primary fix.

## C. Two children — first child

Start:

```text
A
    B
    C
```

Drag B left.

Expected a valid root preview and final root B, with C remaining under A.

The solution must not depend on whether the dragged child is first/last.

## D. Three children — middle child

```text
A
    B
    C
    D
```

Drag C left.

Expected:

```text
A
    B
    D
C
```

(or root C in the exact previewed root slot, depending on pointer Y).

The key requirement is that C can leave A even while B and D remain.

---

# 13. Recursive Outdent Acceptance Matrix

## A. Depth 2 → depth 1

```text
A
    B
        C
```

Move C left one hierarchy step.

Expected:

```text
A
    B
    C
```

## B. Depth 2 → root

Same start:

```text
A
    B
        C
```

Move C farther left until root intent.

Expected:

```text
A
    B
C
```

## C. Deeper tree

```text
A
    B
        C
            D
```

D must be able to outdent progressively:

```text
depth 3 → depth 2 → depth 1 → depth 0
```

according to horizontal movement.

No source ancestor should trap D at a depth the horizontal intent has already moved past.

---

# 14. Preserve Forced-Child Reparenting Acceptance Matrix

The fix must not weaken unrelated forced-child behavior.

## A. Root into another parent's existing child block

```text
A
    B
    C
D
```

Drag D vertically between B and C.

Expected:

```text
A
    B
    D
    C
```

Even if D begins with root horizontal intent.

## B. Child from one parent into another parent's child block

```text
A
    B

C
    D
    E
```

Drag B into the vertical block between D/E.

Expected B may become child of C.

The source-zone suppression must not suppress C because C is not in B's original ancestor path.

## C. Re-enter original parent

After intentionally outdenting a child left, move it right again into its original parent's child block.

Expected:

- horizontal depth intent becomes deep enough again;
- source-zone suppression no longer applies when `horizontalDepthIntent >= zoneDepth`;
- original parent may become a valid destination again.

This confirms the suppression is intent-sensitive rather than permanently blacklisting the original parent.

---

# 15. Sibling Reordering Must Remain Unchanged

Within the same parent:

```text
A
    B
    C
    D
```

Dragging D between B/C while remaining at child depth should still yield:

```text
A
    B
    D
    C
```

Do not turn normal same-depth reorder into an accidental outdent.

---

# 16. Subtree Movement Must Remain Unchanged

If the dragged Project/Tag has descendants, the entire DOM subtree continues to move as one drag unit.

Example:

```text
A
    B
        B1
        B2
    C
```

Outdent B:

```text
A
    C
B
    B1
    B2
```

The fix concerns B's relationship to its ancestors only. B1/B2 remain attached to B.

Cycle prevention remains unchanged.

---

# 17. Mouse and Touch Use the Same Resolver

No separate touch hierarchy fix should be necessary because mouse/pointer and touch drag paths both feed into:

```text
resolveTaxonomyDrop(x, y)
```

Still verify both input paths manually.

Do not duplicate source-zone logic in the touch module.

---

# 18. Expected Files

Primary implementation files:

```text
js/components/sidebar-taxonomy-drag.js
js/components/sidebar-taxonomy-drag-hierarchy.js
```

### `sidebar-taxonomy-drag.js`

Expected responsibility:

- capture immutable source-ancestor zone metadata when `beginTaxonomyDragSession()` starts;
- store it in `taxonomyDragSession`.

### `sidebar-taxonomy-drag-hierarchy.js`

Expected responsibility:

- build/interpret source ancestor zone data;
- add focused suppression predicate;
- filter source-ancestor forced zones when outdenting past them;
- keep all unrelated forced zones and normal depth resolution intact.

Expected **no change** unless a concrete need appears:

```text
js/components/sidebar-taxonomy-drag-touch.js
js/components/sidebar-taxonomy-drag-commit.js
js/storage/data-service-taxonomy-drag.js
js/taxonomy-order.js
css/components/sidebar-taxonomy-drag.css
```

No CSS change should be needed because the existing placeholder already represents destination hierarchy correctly once the resolver chooses the correct host.

---

# 19. Implementation Order

1. Add source-ancestor zone builder/helper.
2. Capture source ancestor zones before the dragged DOM subtree is moved to the floating layer.
3. Store the immutable map/metadata in the drag session.
4. Add `shouldSuppressSourceAncestorForcedZone(...)` or equivalent focused predicate.
5. Update `findForcedTaxonomyChildZone()` to skip only source-ancestor zones whose depth is deeper than current horizontal intent.
6. Preserve deepest-candidate sorting among all remaining candidates.
7. Leave normal `resolveTaxonomyParentForDepth()` fallback unchanged.
8. Static-review the commit/persistence path to ensure correct preview values are already sufficient.
9. Manually execute the acceptance matrix.
10. Confirm refresh persistence after successful outdent.

---

# 20. Manual Verification Checklist

For **Projects**:

- [ ] A→B single-child outdent still works.
- [ ] A→B,C: outdent C works.
- [ ] A→B,C: outdent B works.
- [ ] A→B,C,D: outdent middle C works.
- [ ] sibling reorder under A still works.
- [ ] root D can still be forced between A's B/C children.
- [ ] child B can move from parent A into unrelated parent C.
- [ ] outdented child can be moved right back under original parent.
- [ ] depth-2 child can outdent exactly one level.
- [ ] depth-2 child can outdent all the way to root.
- [ ] deeper recursive outdent works progressively.
- [ ] parent with descendants moves subtree intact.
- [ ] cycle prevention still rejects ancestor→descendant invalid moves.
- [ ] exact blue placeholder matches the eventual parent/depth.
- [ ] refresh preserves the new hierarchy/order.

Repeat the key hierarchy cases for **Tags**:

- [ ] multiple-child last Tag outdent.
- [ ] middle Tag outdent.
- [ ] nested Tag one-level/full outdent.
- [ ] unrelated Tag forced-child insertion remains functional.
- [ ] refresh persistence.

Input coverage:

- [ ] desktop mouse/pointer.
- [ ] phone touch/long-press.
- [ ] auto-scroll does not reintroduce source-zone trapping.

---

# 21. Regression Boundaries

Do not change:

- Task hierarchy dragging;
- Task root/subtask rules;
- Project/Tag recursive hierarchy capability;
- Project ↔ Tag drag-domain isolation;
- long-press timing;
- pointer movement cancellation threshold;
- horizontal hysteresis constants;
- blue placeholder styling;
- subtree drag visuals;
- auto-scroll mechanics;
- IndexedDB schema;
- transactional taxonomy persistence;
- modal focus behavior / Implementation Plan ID 13.

---

# 22. Definition of Done

The bug is fixed only when hierarchy behavior is independent of the number of siblings left behind.

These two cases must behave identically from the user's perspective:

```text
A
    B
```

and:

```text
A
    B
    C
```

If B or C is dragged clearly to a shallower horizontal depth, the blue placeholder must move to that shallower hierarchy level and release must persist exactly that result.

At the same time, dragging an entity into an **unrelated** existing child block must continue to force it into that block as before.

The final invariant is:

> **Source ancestry may guide the starting hierarchy, but it may never trap a dragged Project/Tag at a depth the user has explicitly outdented past.**
