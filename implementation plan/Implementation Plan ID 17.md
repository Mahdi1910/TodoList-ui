# Implementation Plan ID 17 — Make Subtask Tag Picker Follow Taxonomy Order

## Goal

Fix Problem #4 from `problem is need to be fixed.md`:

> The main Task editor follows the saved Project/Tag taxonomy order, but the Subtask editor still reads Tag siblings directly from `AppState.tags`. After Tags are reordered in the sidebar, the Subtask Tag picker can therefore show an older/different sibling order.

The fix must make the Subtask Tag picker use the same authoritative Tag hierarchy/order source as the main Task editor:

```text
TaxonomyOrder.getChildren('tag', parentId)
```

This is a focused ordering/UI-consistency fix. It does **not** change Tag persistence, Tag hierarchy semantics, Subtask persistence, selected Tag values, modal focus, or Project ordering.

No application implementation is part of this plan commit.

---

# 1. Confirmed Current Problem

Relevant files:

```text
js/components/subtask-editor.js
js/components/task-taxonomy-menu-order.js
js/taxonomy-order.js
```

The Subtask editor currently renders Tags recursively with logic conceptually equivalent to:

```js
const renderLevel = (parentId, depth = 0) => {
  AppState.tags
    .filter(tag => (tag.parentId || null) === parentId)
    .forEach(tag => {
      render tag;
      renderLevel(tag.id, depth + 1);
    });
};
```

This preserves hierarchy, but it does **not** sort each sibling level using the saved taxonomy `sortOrder`.

`AppState.tags` is a hydrated in-memory array. Taxonomy drag updates each Tag's:

```text
parentId
sortOrder
```

but the application does not need to physically reorder the `AppState.tags` array itself.

Therefore the raw array order and the visible taxonomy order can differ.

Example:

Initial raw array / old order:

```text
Work
Personal
Important
```

User drags Tags in the sidebar to:

```text
Important
Work
Personal
```

The saved `sortOrder` values now describe the second order, but the raw array may still physically be:

```text
Work
Personal
Important
```

The main Task editor is correct because it uses `TaxonomyOrder`.

The Subtask editor can still show the raw order because it walks `AppState.tags` directly.

---

# 2. Authoritative Ordering Rule

There must be one source of truth for Project/Tag hierarchy order:

```text
TaxonomyOrder
```

For Tags, sibling ordering is defined by:

```js
TaxonomyOrder.getChildren('tag', parentId)
```

That helper:

1. selects Tags whose `parentId` matches the requested parent;
2. sorts them by `sortOrder`;
3. uses deterministic fallback ordering when necessary.

The Subtask editor must use this helper rather than implementing its own sibling selection/order.

Required invariant:

> For the same Tag hierarchy state, the sidebar, main Task Tag picker, and Subtask Tag picker must visit Tags in the same recursive sibling order.

---

# 3. Preserve Recursive Hierarchy Rendering

Do not flatten the Subtask Tag picker into a simple list.

Keep the existing recursive visual model:

```text
Tag A
    Tag B
        Tag C
Tag D
```

The existing `depth` value controls indentation:

```js
item.style.paddingLeft = `${12 + depth * 16}px`;
```

Keep that behavior.

Recommended traversal:

```js
const renderLevel = (parentId, depth = 0) => {
  window.TaxonomyOrder.getChildren('tag', parentId).forEach(tag => {
    renderTag(tag, depth);
    renderLevel(tag.id, depth + 1);
  });
};

renderLevel(null);
```

This preserves arbitrary recursive Tag depth while correcting sibling order at every level.

---

# 4. Match the Main Task Editor's Ordering Source

The main Task editor's taxonomy-order override already uses:

```js
TaxonomyOrder.getChildren('tag', parentId)
```

recursively.

Do not create a new `sortTagsForSubtask()` helper with separate comparison rules.

Do not sort by:

```text
name
createdAt only
raw AppState array position
```

The goal is not merely "make the list look sorted." The goal is:

```text
Main Task Tag picker order
==
Subtask Tag picker order
==
Sidebar taxonomy order
```

for the same hierarchy.

---

# 5. Preserve Selection State

This problem is only about display order.

Do not change:

```text
SubtaskEditorComponent.selectedTags
Task.tags persistence
Tag IDs
multi-select behavior
```

Current selection flow should remain:

```text
click Tag row
↓
read data-subtask-tag
↓
add/remove Tag ID from selectedTags
↓
syncTagUI()
```

After reordering the menu DOM, selected Tags must still show `.selected` based on their Tag IDs.

Example:

```text
Selected Tags = Work + Important
```

After sidebar reordering and reopening the Subtask editor:

- Work remains selected;
- Important remains selected;
- only their visible positions change.

No task record should be modified merely because Tags were reordered.

---

# 6. Preserve Tag Hierarchy Indentation

For:

```text
A
    B
    C
D
```

Subtask Tag picker should remain visually hierarchical:

```text
A
    B
    C
D
```

not:

```text
A
B
C
D
```

Keep the current depth-based padding unless a concrete regression is discovered.

No CSS change is expected.

---

# 7. Reordering at Every Hierarchy Level

The implementation must work for root Tags and nested siblings.

## Root reorder

Start:

```text
A
B
C
```

Drag C above A in the sidebar.

Expected in all Tag views/pickers:

```text
C
A
B
```

## Child reorder

Start:

```text
A
    B
    C
    D
```

Drag D between B and C.

Expected Subtask Tag picker:

```text
A
    B
    D
    C
```

## Recursive hierarchy

Start:

```text
A
    B
        C
        D
```

Reorder C/D.

Expected Subtask picker to respect their new order under B without changing A/B hierarchy.

The fix must therefore call `TaxonomyOrder.getChildren()` at **every recursive level**, not only for roots.

---

# 8. Reparenting Must Also Be Reflected

Taxonomy drag can change both:

```text
sortOrder
parentId
```

The Subtask Tag picker must reflect both because `TaxonomyOrder.getChildren()` reads the current hierarchy state.

Example:

Before:

```text
A
    B
C
```

After dragging B to become child of C:

```text
A
C
    B
```

The next time the Subtask Tag picker renders, expected:

```text
A
C
    B
```

No special Subtask editor hierarchy repair should be added. The shared taxonomy helper already provides the correct relationship.

---

# 9. Rendering Timing / Rerender Behavior

`SubtaskEditorComponent.open(parent)` already calls:

```text
renderTagMenu()
```

when the editor opens.

That is sufficient for this fix because the Tag picker is rebuilt from current hydrated state each time the Subtask editor is opened.

Do not add global listeners or automatic Subtask Tag-menu rerenders unless a concrete requirement appears.

Expected workflow:

```text
reorder Tag in sidebar
↓
open/reopen Subtask editor
↓
renderTagMenu()
↓
new taxonomy order appears
```

If the Subtask editor is already open while sidebar taxonomy dragging is impossible/blocked by modal state, no live-update requirement is needed.

---

# 10. Bootstrap / Availability Check

`TaxonomyOrder` is loaded during application bootstrap before UI component initialization.

Therefore no new script file or database dependency should be necessary.

During implementation, confirm:

```js
window.TaxonomyOrder
```

is available by the time `SubtaskEditorComponent.renderTagMenu()` can run.

Expected no changes to `js/app.js`.

Do not add a silent fallback back to raw `AppState.tags` unless there is a real startup-order reason. A fallback would hide integration bugs and could recreate the inconsistent order.

If the shared ordering system is unexpectedly unavailable, fail clearly during development rather than quietly using a different ordering rule.

---

# 11. Keep Rendering/Safety Concerns Separate

This plan is specifically for **Tag ordering**.

Do not redesign the Subtask editor menu markup, keyboard interaction, or styling as part of this work unless the small ordering change exposes a concrete regression.

Current row construction and `data-subtask-tag` behavior should remain functionally unchanged.

If a separate HTML-safety concern is identified in the Subtask Tag renderer, record/fix it under the appropriate safety problem rather than mixing unrelated architecture changes into this ordering fix.

---

# 12. Expected Implementation File

Primary expected file:

```text
js/components/subtask-editor.js
```

Expected change inside `renderTagMenu()`:

```text
BEFORE
AppState.tags.filter(...)

AFTER
TaxonomyOrder.getChildren('tag', parentId)
```

while retaining the recursive `renderLevel(tag.id, depth + 1)` behavior.

Expected no changes to:

```text
js/taxonomy-order.js
js/components/task-taxonomy-menu-order.js
js/storage/*
js/state.js
css/*
index.html
```

unless static review finds a concrete integration requirement.

No database schema/version change is needed.

---

# 13. Manual Acceptance Matrix

## A. Root Tag reorder

Start:

```text
A
B
C
```

Reorder sidebar to:

```text
C
A
B
```

Open a normal Task Tag picker:

```text
C
A
B
```

Open a Subtask Tag picker:

```text
C
A
B
```

Both must match.

## B. Nested sibling reorder

Start:

```text
A
    B
    C
    D
```

Reorder to:

```text
A
    D
    B
    C
```

Expected Subtask Tag picker exactly follows that child order.

## C. Reparent

Start:

```text
A
    B
C
```

Move B under C.

Expected:

```text
A
C
    B
```

in Subtask picker.

## D. Selected Tag preservation

Select B on a Subtask, save, reorder B elsewhere, reopen Subtask.

Expected:

- B appears in its new position;
- B is still selected;
- saved Subtask Tag relation is unchanged.

## E. Multiple selected Tags

Select Tags from different hierarchy levels, reorder the taxonomy, reopen editor.

Expected all selected IDs remain selected while display order follows taxonomy order.

## F. Persistence across refresh

Reorder Tags, refresh application, then open Subtask Tag picker.

Expected order still matches the persisted sidebar/main Task order.

---

# 14. Static Verification

After implementation, verify:

- `SubtaskEditorComponent.renderTagMenu()` no longer walks `AppState.tags.filter(...)` for hierarchy order;
- it calls `TaxonomyOrder.getChildren('tag', parentId)` recursively;
- no duplicate custom Tag sorting comparator was added;
- Tag IDs and `data-subtask-tag` remain unchanged;
- no persistence/storage code changed;
- no CSS change was required unless justified.

No browser/headless automation should be run. Manual UI verification is sufficient for this application, plus static source review.

---

# 15. Tracker Update Rule

Problem #4 in:

```text
problem is need to be fixed.md
```

must remain:

```text
[ ]
```

while this is only a plan.

After implementation and manual verification, update it to:

```text
[x]
```

and record:

```text
Implementation Plan: implementation plan/Implementation Plan ID 17.md
```

Do not mark the problem complete merely because the code was written.

---

# 16. Final Definition of Done

Problem #4 is complete when:

- Subtask Tag picker uses `TaxonomyOrder` as its ordering source;
- root Tag order matches the sidebar/main Task picker;
- nested sibling order matches the sidebar/main Task picker;
- reparented Tags appear under the correct parent;
- hierarchy indentation remains correct;
- selected Tag IDs remain selected after reorder;
- persistence and Task/Subtask Tag relations are unchanged;
- refresh preserves the same visible order;
- no duplicate Subtask-specific ordering system is introduced;
- the behavior is manually verified and Problem #4 is then marked complete in the permanent tracker.
