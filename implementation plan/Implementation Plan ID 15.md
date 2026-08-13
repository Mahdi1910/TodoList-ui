# Implementation Plan ID 15 — Family-Aware Task Filtering With Standalone Matching Subtasks

## Goal

Fix Problem #1 from `problem is need to be fixed.md` by making filtering understand the relationship between a main task and its subtasks.

The required product rule is now fully defined.

Given:

```text
A = main/root task
    B = subtask of A
```

### Rule 1 — Parent matches the current filter

If A matches the current filter, show A as a normal task family and show **all of A's subtasks underneath it**, even when an individual subtask does not match the filter itself.

Example — Today:

```text
A = Today
    B = No date
```

Expected Today view:

```text
A
    B
```

Example — Tag Work:

```text
A = Work tag
    B = No Work tag
```

Expected Work view:

```text
A
    B
```

### Rule 2 — Parent does not match, but a subtask matches

If A does not match the filter but B does, do **not** show A merely to provide context.

Show B alone as an independent-looking task in that filtered view.

Example — Today:

```text
A = No date
    B = Today
```

Expected Today view:

```text
B
```

Example — Tag Work:

```text
A = No Work tag
    B = Work tag
```

Expected Work view:

```text
B
```

B is visually standalone in that filtered view only. B remains a real subtask of A in application state and IndexedDB.

### Rule 3 — Parent and subtask both match

Do not display the subtask twice.

```text
A = Today
    B = Today
```

Expected:

```text
A
    B
```

Not:

```text
A
    B
B
```

### Rule 4 — Multiple matching children under a nonmatching parent

```text
A = No date
    B = Today
    C = No date
    D = Today
```

Expected Today view:

```text
B
D
```

A and C remain hidden.

The same filtering rules must produce the same visible task set in **List** and **Kanban**.

This plan changes filtering/presentation only. It does not redesign persistence, recurrence, task hierarchy storage, Project/Tag hierarchy, or modal focus.

No application implementation is part of this plan commit.

---

# 1. Confirmed Current Failure

Current filtering and rendering disagree about what the unit of display is.

Relevant files:

```text
js/state.js
js/components/task-renderer.js
js/components/task-hierarchy.js
js/components/task-groups.js
js/components/task-kanban.js
```

`AppState.getFilteredTasks()` currently returns every task that independently passes `matchesFilter(task)`.

Conceptually:

```text
all tasks
    ↓
check A independently
check B independently
check C independently
    ↓
return matching task objects
```

But List rendering then does:

```text
filtered tasks
    ↓
getRootTasks(filtered)
```

This throws away matching subtasks whose parents did not match.

Then, for every surviving root, `createTaskFamily(root)` loads the root's subtasks again from full `AppState`, not from the filtered list.

So the application currently has both failure directions:

### Failure A — matching child disappears

```text
A does not match
    B matches
```

Filter result contains B, but root-only rendering discards B.

### Failure B — nonmatching child appears with matching parent

```text
A matches
    B does not match
```

The filtered result contains A only, but `createTaskFamily(A)` reloads B from global state and displays it.

Failure B is actually desired under the newly defined product rule; Failure A is not.

Therefore the correct fix is **not** "filter every rendered subtask independently." The correct fix is to make the filter produce the right **top-level display representatives**.

---

# 2. Introduce a Family-Aware Display Selection Layer

Do not make List and Kanban each invent their own family filtering rules.

Add one small focused module:

```text
js/task-filter.js
```

Recommended public object:

```text
window.TaskFilter
```

Primary method:

```text
getDisplayTasks()
```

or an equivalently clear name.

This method should return an ordered array of task objects that represent the **top-level visible units** for the current filter.

A returned root task means:

```text
render this root as a normal family
```

A returned subtask means:

```text
render this matching subtask as a standalone-looking filtered result
```

Do not clone tasks and do not change `parentTaskId`.

The returned values should be references/read-only selections from current hydrated state.

---

# 3. Exact Family-Aware Selection Algorithm

Use the real task hierarchy as the unit for evaluating the display rule.

For each root task in stable task order:

```text
parent = root
children = its real subtasks
```

Then:

```text
if parent matches current filter:
    output parent only
    do not output any child separately
else:
    for each child:
        if child matches current filter:
            output child
```

Pseudo-code:

```js
const output = [];

for (const parent of orderedRootTasks) {
    if (AppState.matchesFilter(parent)) {
        output.push(parent);
        continue;
    }

    for (const child of orderedChildren(parent.id)) {
        if (AppState.matchesFilter(child)) {
            output.push(child);
        }
    }
}

return output;
```

This single rule gives all required outcomes without later deduplication hacks.

### Parent match

```text
A ✅
    B ❌
```

Output representatives:

```text
[A]
```

Renderer sees A is root and renders:

```text
A
    B
```

### Child-only match

```text
A ❌
    B ✅
```

Output representatives:

```text
[B]
```

Renderer sees B is a real subtask and renders it standalone.

### Both match

```text
A ✅
    B ✅
```

Parent branch wins and immediately continues.

Output:

```text
[A]
```

B therefore appears only under A.

### Multiple matching children

```text
A ❌
    B ✅
    C ❌
    D ✅
```

Output:

```text
[B, D]
```

---

# 4. Preserve Stable Order

Family-aware filtering must not create a new accidental ordering system.

Use the application's established hierarchy/sort order.

For root iteration, use the existing root ordering source rather than arbitrary array filtering if a dedicated order helper is available.

For child iteration, use the existing sibling ordering source (`getSiblingTasks(parentId)` / equivalent) so `sortOrder` remains authoritative.

Required custom-order example:

```text
A
    B
    C
D
```

If A does not match and B/C do match, while D also matches, the base custom-filter projection should preserve the family positions:

```text
B
C
D
```

before any user-selected non-custom sorting is applied.

Do not mutate `sortOrder` as part of filtering.

---

# 5. Do Not Change Real Hierarchy State for Standalone Results

This is a critical invariant.

Example:

```text
A = no date
    B = Today
```

In Today, B looks like:

```text
B
```

But internally it must remain:

```text
B.parentTaskId === A.id
```

Do not temporarily set:

```text
B.parentTaskId = null
```

Do not write any IndexedDB change just because the filter changes.

Do not make a cloned fake root task with changed hierarchy fields.

The standalone appearance is a rendering projection only.

After leaving Today and opening a view where A is shown as a family, B must immediately return underneath A:

```text
A
    B
```

with no repair or persistence work required.

---

# 6. Add One Shared Render Dispatcher for Root Families vs Standalone Subtasks

Current renderers assume every top-level task passed to them is a real root and call:

```text
createTaskFamily(task)
```

That assumption must change.

In `js/components/task-hierarchy.js`, add one focused render dispatcher such as:

```text
createTaskDisplayUnit(task)
```

Required behavior:

```text
if task is a real root:
    return createTaskFamily(task)

if task is a real subtask:
    return createStandaloneFilteredSubtask(task)
```

This allows List, grouped List, and Kanban to share exactly the same presentation rule.

Do not duplicate `if (task.parentTaskId)` rendering logic in three different renderer files.

---

# 7. Standalone Matching Subtask Must Look Like a Normal Task Card

A child-only match is intentionally displayed without indentation and without its hidden parent container.

Example:

```text
Today

B
```

It should use the normal/root card visual language:

- no `.subtask-list` left indentation;
- no child border line;
- no parent expander;
- no fake parent row;
- normal task-card width/padding;
- normal task metadata;
- normal checkbox;
- normal three-dot actions.

It should not look like this:

```text
    │ B
```

because A is not being shown.

No new visual design is required. Reuse the existing normal `.task-card` appearance.

Prefer no CSS changes unless a concrete layout issue is discovered during implementation.

---

# 8. Decouple Logical Subtask Identity From Nested Visual Style

Current `createTaskCard(task, { isSubtask })` uses the `isSubtask` presentation option for two different jobs:

1. visual styling (`subtask-card`), and
2. deciding whether clicking the card opens the Subtask editor or main Task editor.

That coupling becomes wrong for a standalone filtered subtask.

A standalone B must:

```text
look like root card
BUT
behave logically like a subtask
```

Update `createTaskCard()` so logical identity comes from the task data itself:

```text
logicalIsSubtask = Boolean(task.parentTaskId)
```

or:

```text
AppState.isSubtask(task)
```

Use logical identity for:

- edit aria-label (`Edit subtask: ...`);
- title text describing edit behavior;
- deciding between `SubtaskEditorComponent.openEdit()` and `TasksComponent.openModal()`.

Keep the existing `isSubtask` option only for nested visual presentation if practical.

Conceptual separation:

```text
logicalIsSubtask
    → which editor / hierarchy behavior

nestedVisualStyle
    → whether card gets .subtask-card appearance
```

This avoids a dangerous fake-root behavior.

---

# 9. Standalone Matching Subtask Actions Must Still Know It Is a Subtask

The three-dot action menu already determines hierarchy from `AppState.isSubtask(task)`.

Preserve that behavior.

For standalone B:

```text
B still belongs to A
```

Therefore its action menu should still behave as a subtask action menu, including the existing explicit `Unlink` action.

Do not show root-only actions merely because B is visually standalone in the filter.

If the user explicitly chooses `Unlink`, that is a real hierarchy mutation and may make B a true root afterward. That is separate from filtering.

---

# 10. Do Not Treat Standalone Filtered Subtasks as Real Root Drag Units

The task hierarchy drag system uses structural DOM markers such as:

```text
.task-family
.subtask-drag-item
```

to decide whether a task is being dragged as a root or subtask.

A standalone filtered result is a projection, not a real root hierarchy unit.

Therefore:

- do not wrap standalone B in `.task-family`;
- do not give it root drag datasets;
- do not give it `.subtask-drag-item` while it is outside its real parent family;
- do not allow filtered presentation to feed a false root `parentTaskId = null` assumption into drag persistence.

The simplest safe behavior is:

```text
standalone projected subtask card
→ normal click/edit/complete/actions
→ no hierarchy long-press drag from that projected row
```

The existing explicit `Unlink` command remains available when a real hierarchy change is desired.

This keeps Problem #1 focused and avoids redesigning task drag around hidden parents.

Do not modify task drag persistence for this filtering fix unless implementation discovers an actual integration regression.

---

# 11. Update List Rendering

Current `renderList(filtered)` immediately does:

```text
roots = AppState.getRootTasks(filtered)
```

Remove that root-only projection from the renderer.

The family-aware filter layer should already have returned exactly the top-level display representatives required by the current filter.

New conceptual flow:

```text
TaskFilter.getDisplayTasks()
        ↓
[A root, B standalone-child, D root, ...]
        ↓
separate active/completed representatives
        ↓
sort/group representatives
        ↓
createTaskDisplayUnit(task)
```

So List should use the supplied representative tasks directly.

For each representative:

```text
root → create normal family
subtask → create standalone filtered card
```

Do not call `getRootTasks(filtered)` after family-aware filtering.

---

# 12. Update Completed Section Handling

The same rule must work for completed tasks.

Example:

```text
A = active, not matching Completed
    B = completed
```

When the Completed filter is selected, expected:

```text
B
```

B appears as a standalone completed result.

If A itself is completed and therefore matches:

```text
A = completed
    B = completed
```

Expected:

```text
A
    B
```

Do not duplicate B.

List's Active/Completed split should operate on the **representative task's** completion state.

The existing Completed collapse control should continue to work with standalone result cards.

No new Completed-state persistence logic is needed.

---

# 13. Update Grouped List Rendering

`task-groups.js` currently receives tasks and ultimately renders every group task with:

```text
createTaskFamily(task)
```

Change only the rendering assumption.

Grouping should work on the representative task returned by family-aware filtering.

Required semantics:

### Root representative

If A matches the filter and represents the family, group A using A's own grouping field.

Example Group By Priority:

```text
A priority = High
    B priority = Low
```

A matched the current filter, so the family belongs under High:

```text
High
    A
        B
```

Do not split B away into Low merely because grouping is active.

### Standalone subtask representative

If A does not match and B is independently visible, group B using B's own data.

```text
A does not match filter
    B matches filter, priority = Low
```

Expected:

```text
Low
    B
```

This follows the same representative-task rule and requires no separate special grouping algorithm.

Replace grouped rendering calls from `createTaskFamily(task)` to the shared `createTaskDisplayUnit(task)`.

Preserve existing group collapse behavior.

---

# 14. Update Kanban Rendering With the Same Representative Model

Current Kanban repeats the root-only mistake:

```text
roots = AppState.getRootTasks(tasks)
```

Remove that extra root-only filter.

Kanban should receive the same representative array as List.

Conceptual flow:

```text
family-aware display representatives
        ↓
Group By / column construction
        ↓
active vs completed
        ↓
createTaskDisplayUnit(task)
```

Expected parity:

```text
List result IDs == Kanban result representative IDs
```

for the same filter, sort, and grouping state.

A child-only match must not disappear merely because the user switches from List to Kanban.

A parent match must still render the full family in its Kanban column.

Replace Kanban `createTaskFamily(task)` calls with the same display dispatcher used by List.

---

# 15. Sorting Semantics

Sorting should apply to the visible representative units.

### Parent match

```text
A represents family A+B+C
```

Sort using A's fields.

### Child-only match

```text
B is standalone representative
```

Sort using B's fields.

This works naturally if List/Kanban continue passing the representative task array through `WorkspaceControls.sortTasks()`.

Do not sort hidden children individually when their parent represents the family.

Inside a displayed family, existing child ordering/sorting behavior should remain unchanged.

---

# 16. Filter Semantics by Existing Filter Type

Use existing `AppState.matchesFilter(task)` as the definition of whether an individual task matches.

Do not duplicate filter rules in `task-filter.js`.

The family-aware layer should only decide **how matching results are presented**.

### Today

Independent due date matching.

```text
parent Today → family
parent not Today + child Today → child standalone
```

### Tag

Independent tag matching, including existing parent-tag descendant logic.

```text
parent has selected Tag → family
parent does not + child has Tag → child standalone
```

### Completed

Independent completion matching.

```text
completed parent → family
active parent + completed child → child standalone
```

### Project

Subtasks currently inherit their parent's Project, so normally parent and child match the same Project filter.

Family-aware logic should still be used consistently rather than special-casing Project.

### Inbox

Subtasks currently inherit parent Project/Inbox relationship, so family-aware logic should also naturally produce the existing expected result.

### Other/default active behavior

Use the same rule. Do not add filter-specific branches unless a concrete existing filter requires one.

---

# 17. Sidebar Counts Should Not Be Reinterpreted in This Fix

Sidebar count functions currently count tasks that independently satisfy their count condition.

Do not redesign count semantics as part of Problem #1.

Example:

```text
A = Today
    B = Today
```

The sidebar Today count may count two independently due tasks even though the visual family is one top-level card with B nested.

That is acceptable for this implementation unless manual product testing reveals a separate count requirement.

Keep the filtering fix focused on which task rows/families are visible.

Do not silently change count logic and create a second scope of work.

---

# 18. Section / Kanban Counts

Existing section and Kanban counts are based primarily on top-level displayed root units.

After this fix, standalone matching subtasks become legitimate top-level **display representatives**.

Therefore top-level section/column counts should count the representative units they actually display.

Example:

```text
A does not match
    B matches
    C matches
```

The filtered active display has two standalone units:

```text
B
C
```

Any visible top-level count for that section/column should reflect `2`.

If A matches and therefore represents the whole family:

```text
A
    B
    C
```

the top-level representative count remains `1` under existing semantics.

Do not count nested children twice.

---

# 19. Completion / Repeat Integration

A standalone filtered subtask must use the exact same real task ID and existing checkbox persistence path.

Example:

```text
A no date
    B Today + repeating
```

Today shows standalone B.

Completing B must still call the existing persistent completion/Repeat logic for B's real ID.

If recurrence creates a next occurrence under A with a different due date, the next render should naturally include or exclude it based on the active filter.

Do not create special filtering-specific completion logic.

Do not clone task records for presentation.

---

# 20. Editing Integration

Standalone B must open the Subtask editor, because B is still logically a subtask.

Expected:

```text
Today
B  ← visually standalone
```

Click B:

```text
Edit Subtask
Parent: A
```

not:

```text
Edit Task
```

This is why logical identity must be derived from stored task hierarchy rather than the visual `isSubtask` flag.

Saving B must preserve its real parent relation and use existing persistence behavior.

---

# 21. No Persistence / Database Schema Changes

This is a read/presentation bug.

Expected no changes to:

```text
js/storage/db-schema.js
js/storage/db.js
js/storage/repositories.js
js/storage/data-service.js
js/storage/data-service-hierarchy.js
js/storage/data-service-repeat.js
```

No IndexedDB migration or database version bump is required.

Filtering must not write to storage.

Review persistence paths only to confirm standalone cards still call the existing real task actions correctly.

---

# 22. Expected Files

Primary expected implementation files:

```text
js/task-filter.js                         (new)
index.html
js/components/task-renderer.js
js/components/task-hierarchy.js
js/components/task-groups.js
js/components/task-kanban.js
```

### `js/task-filter.js`

Responsibility:

- build family-aware top-level display representatives;
- preserve stable hierarchy order;
- use existing `AppState.matchesFilter()`;
- never mutate tasks or hierarchy.

### `index.html`

Responsibility:

- load `js/task-filter.js` before components that call it;
- keep load order explicit.

Recommended location near:

```text
js/task-relations.js
js/task-order.js
```

### `task-renderer.js`

Responsibility:

- use family-aware display representatives;
- stop throwing away subtasks with `getRootTasks(filtered)`;
- split active/completed using representative task state;
- use shared display dispatcher;
- derive edit behavior from logical hierarchy, not visual subtask styling.

### `task-hierarchy.js`

Responsibility:

- add shared `createTaskDisplayUnit()`;
- render root representative as full family;
- render child representative as standalone normal-style card.

### `task-groups.js`

Responsibility:

- preserve current grouping calculations;
- render group entries through `createTaskDisplayUnit()` rather than assuming all are roots.

### `task-kanban.js`

Responsibility:

- remove root-only filtering of the family-aware result;
- render representatives through `createTaskDisplayUnit()`;
- preserve completed collapse and column behavior.

Expected no CSS modification unless direct task-card placement exposes a concrete spacing problem.

Expected no task-drag implementation change unless static integration review discovers that a standalone projected row is accidentally being recognized as a hierarchy drag unit.

---

# 23. Module Integration / Fail-Fast Check

Because `TaskFilter` becomes required by rendering, do not let a missing helper silently produce an empty UI.

At minimum, rendering should clearly fail in development if `window.TaskFilter` is unavailable.

Preferred approach:

- load `task-filter.js` statically before task component initialization;
- use a small explicit existence check where appropriate rather than optional chaining that turns an integration error into wrong filtering.

Do not add another runtime monkey-patch layer.

`TaskFilter` should be a normal dependency/helper, not a method replacement installed after `TasksComponent.init()`.

---

# 24. Manual Acceptance Matrix — Core Today Cases

## A. Parent Today, child no date

```text
A = Today
    B = No date
```

Expected Today List:

```text
A
    B
```

Expected Today Kanban: same family.

## B. Parent no date, child Today

```text
A = No date
    B = Today
```

Expected Today:

```text
B
```

B looks like a normal top-level card.

Open B and verify it opens **Edit Subtask** with parent A.

## C. Both Today

```text
A = Today
    B = Today
```

Expected:

```text
A
    B
```

B appears exactly once.

## D. Multiple child-only matches

```text
A = No date
    B = Today
    C = No date
    D = Today
```

Expected:

```text
B
D
```

No A, no C.

## E. Parent Today with mixed children

```text
A = Today
    B = Today
    C = Tomorrow
    D = No date
```

Expected:

```text
A
    B
    C
    D
```

Parent match brings the whole family.

---

# 25. Manual Acceptance Matrix — Tag Cases

Create:

```text
A
    B
    C
```

## A. Parent has Work, children do not

Expected Work:

```text
A
    B
    C
```

## B. Parent no Work, B has Work, C does not

Expected Work:

```text
B
```

## C. Parent and B both Work

Expected Work:

```text
A
    B
    C
```

B is not duplicated.

## D. B and C Work, parent does not

Expected:

```text
B
C
```

Both look standalone.

Repeat in List and Kanban.

---

# 26. Manual Acceptance Matrix — Completed

## A. Active parent, completed child

```text
A active
    B completed
```

Open Completed filter.

Expected:

```text
B
```

## B. Completed parent/family

```text
A completed
    B completed
```

Expected:

```text
A
    B
```

No duplicate B.

Verify Completed collapse still hides/shows the visible result correctly in both List and Kanban.

---

# 27. Manual Acceptance Matrix — Group By

For a filter that produces standalone B:

```text
A does not match
    B matches; priority Low
```

With Group By Priority:

Expected:

```text
Low
    B
```

For a parent match:

```text
A matches; priority High
    B priority Low
```

Expected:

```text
High
    A
        B
```

B must not be broken out into Low because A is the family representative.

Verify Group By:

```text
None
Priority
Date
Project
Tag
```

with at least one standalone subtask result.

---

# 28. Manual Acceptance Matrix — Sorting

For a child-only result, verify sorting treats the child as the visible unit.

Test:

```text
Custom
Due Date
Priority
Name
Created Date
```

Requirements:

- standalone matching children sort by their own fields;
- displayed parent families sort by parent fields;
- nested children retain their existing within-family ordering;
- changing sort must not change real parentTaskId or persisted custom hierarchy.

---

# 29. Manual Acceptance Matrix — Editing / Actions / Completion

For standalone B:

- click body → opens Subtask editor;
- three-dot menu → identifies B as subtask;
- `Unlink` remains available according to existing rules;
- root-only `Add Subtask` / `Link to Parent` behavior must not appear incorrectly;
- checkbox completion updates real B;
- repeating B still executes existing recurrence behavior;
- deleting B deletes only B according to existing subtask semantics;
- changing filter after any operation rerenders from actual state.

---

# 30. Manual Acceptance Matrix — Presentation-Only Hierarchy Safety

Start:

```text
A = No date
    B = Today
```

Open Today and verify B standalone.

Without using Unlink:

1. switch to a view/filter where A appears;
2. verify B is still underneath A;
3. refresh the page;
4. verify B remains underneath A;
5. inspect behavior after editing/completing B;
6. verify no filter switch itself changes hierarchy.

Standalone filtering must never create an IndexedDB hierarchy write.

---

# 31. Drag Regression Check

Because standalone projected children are not real root units, verify:

- long-pressing standalone B does not begin a false root hierarchy drag;
- normal root task drag still works in views that contain normal families;
- normal nested subtask drag still works when parent family is displayed;
- filtered standalone cards are not included as root ordering IDs during drag commit;
- changing filters cannot accidentally unlink a subtask.

Do not expand this implementation into a redesign of projected-subtask dragging.

If later desired, that can be a separate feature with explicit semantics.

---

# 32. Empty State Regression

If no parent and no child matches, List/Kanban must show the existing empty state.

If only a subtask matches, the view must **not** show empty state.

Example:

```text
A no date
    B Today
```

Today has one visible representative (B), so empty state must be hidden.

---

# 33. No Duplicate Rendering Guarantee

During implementation, enforce a simple invariant:

> A task ID must not appear both as a standalone representative and as a nested child of a displayed parent within the same ungrouped view instance.

The parent-first algorithm naturally guarantees this.

Do not add a second post-render deduplication system unless needed only as a development assertion.

For debugging/static review, it is acceptable to assert that representative IDs are unique.

---

# 34. Performance Expectations

This is a personal-use application; do not overengineer indexing or virtualization.

A straightforward family pass over current in-memory tasks is sufficient.

Avoid obviously wasteful nested full-array scans where existing maps/order helpers are available, but readability and correctness are more important than micro-optimization.

No server-scale architecture is required.

---

# 35. Tracker Update Rule

Problem #1 currently remains:

```text
[ ] Fix task-family filtering
```

After implementation, do **not** immediately mark it `[x]` merely because code was committed.

Mark Problem #1 complete only after the important manual behavior is verified, especially:

```text
parent Today → whole family
child-only Today → child standalone
parent Tag → whole family
child-only Tag → child standalone
List/Kanban parity
no duplicate child
standalone child still logically belongs to parent
```

When verified, update:

```text
problem is need to be fixed.md
```

with `[x]` and include Implementation Plan ID 15 / fixing commit when useful.

---

# 36. Verification Constraints

Do not use Chrome, Edge, Playwright, Puppeteer, Selenium, or other browser automation for this project.

Allowed implementation verification:

- static source review;
- JavaScript syntax checks if an available environment can run them without browser automation;
- diff review;
- dependency/load-order review;
- manual user testing in the real application.

The user will perform the important UI behavior checks manually.

---

# Definition of Done

Implementation Plan ID 15 is complete only when all of the following are true:

- family-aware filter selection exists in one shared place;
- parent match renders parent + all real subtasks;
- parent nonmatch + child match renders child alone;
- parent+child both matching does not duplicate the child;
- multiple matching children under nonmatching parent render independently;
- standalone filtered child looks like a normal top-level card;
- standalone filtered child remains logically/persistently a subtask;
- standalone filtered child opens the Subtask editor;
- action menu still treats standalone filtered child as a subtask;
- filter switching performs no hierarchy write;
- List and Kanban use the same representative result model;
- Group By uses parent data for displayed families and child data for standalone children;
- sorting works on visible representatives;
- Completed handling works for child-only matches;
- existing normal family/subtask drag behavior remains unchanged;
- projected standalone subtasks are not misidentified as true root drag units;
- empty states remain correct;
- no IndexedDB schema change is introduced;
- no unrelated architecture cleanup is bundled into this fix;
- Problem #1 is marked `[x]` only after manual verification.