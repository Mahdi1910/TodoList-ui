# Implementation Plan ID 23 — Custom Sort Adopts the Current Sort Order

## Purpose

Correct the meaning of **Sort → Custom** and make manual drag use the same rule.

Custom must never mean “restore an old historical manual order.”

Required behavior:

- When the user switches from Name / Due Date / Priority / Created Date to **Custom**, the currently sorted order becomes the new saved Custom order.
- When the user manually reorders a Task/Subtask while a non-Custom sort is active, the app automatically changes to **Custom** and saves the current sorted order **plus the drag change**.
- A canceled/no-op drag does not change the sort mode or saved order.
- Once Custom is active, later drags continue updating the saved manual order normally.

Example:

```text
Old Custom: C, A, B
Name:       A, B, C
Select Custom
Result:     A, B, C
```

Direct-drag example:

```text
Old Custom: C, A, B
Name:       A, B, C
Drag A below C
Result:     B, C, A
Sort:       Custom
```

The old `C, A, B` order must not return.

---

## Scope

This is a focused sorting/order repair after ID20 Part 3. Do not start Part 4 and do not undo Part 3 ownership boundaries.

Expected files:

- `js/components/workspace-controls.js`
- `js/components/task-drag-commit.js`
- `js/storage/data-service-drag.js`
- `js/storage/data-service-hierarchy.js`

Do not modify:

- Task/Subtask editor focus behavior
- Date/Schedule keyboard behavior
- context-menu clipping/focus behavior
- Repeat engine
- reminder architecture
- IndexedDB schema
- Backup format

Existing `task.sortOrder` remains the persisted Custom-order representation.

---

# Root Cause

Normal sorts are calculated at render time by `WorkspaceControls.sortTasks()`.

The durable `sortOrder` values still contain the old manual Custom arrangement. Previously, selecting Custom only persisted:

```text
sortKey = custom
```

Therefore the renderer returned to the old `sortOrder` values.

The drag path had the same problem: it changed the mode to Custom after a drop, but hierarchy ordering was based on the old AppState/custom sibling order rather than the order currently produced by Name/Priority/etc.

---

# Required Rules

## Rule 1 — Explicit non-Custom → Custom

- Name → Custom keeps Name order.
- Due Date → Custom keeps Due Date order.
- Priority → Custom keeps Priority order.
- Created Date → Custom keeps Created Date order.
- Ascending/descending direction is respected.

## Rule 2 — Normal sort → normal sort

Changing Name → Priority, Priority → Due Date, etc. does not rewrite `sortOrder`.

The baseline is rewritten only when entering Custom or when a successful drag forces the app into Custom.

## Rule 3 — Custom → Custom

No order rewrite is required.

## Rule 4 — Drag while Custom is already active

Keep the existing hierarchy/order persistence behavior.

## Rule 5 — Drag while a normal sort is active

The drag session already records `startSortKey`.

For a real drop:

1. Verify the active sort has not changed during the drag.
2. While that non-Custom sorter is still active, build the complete data-driven sibling-order snapshot.
3. Pass that snapshot into the existing hierarchy drag command.
4. Apply the sorted baseline to Task copies first.
5. Apply the actual before/after/hierarchy/group drop on top of that baseline.
6. Persist all order/hierarchy changes and `sortKey = custom` atomically.
7. Update AppState through `AppStateSync` only after transaction success.
8. Set the Workspace UI to Custom after success.

Canceled/no-op drags return before step 2, so they do not persist or switch sort modes.

## Rule 6 — Root Tasks and Subtasks

The snapshot contains independent sibling scopes:

```text
root scope
parent A subtask scope
parent B subtask scope
...
```

Each scope gets its own sequential `sortOrder` values.

## Rule 7 — Baseline comes from data, not DOM

Use `WorkspaceControls.sortTasks()` over AppState sibling data.

Do not derive the complete persistent baseline from rendered DOM because filters, List/Kanban, grouping, and duplicate Tag-group appearances make DOM order incomplete or ambiguous.

The drag UI may still use DOM geometry to identify the actual drop neighbors (`beforeTaskId` / `afterTaskId`).

---

# Implementation

## 1. `WorkspaceControls.buildCustomOrderSnapshot()`

Build:

```text
[
  { parentTaskId: null, orderedIds: [...] },
  { parentTaskId: 'parent-1', orderedIds: [...] },
  ...
]
```

Root scope:

```text
sortTasks(AppState.getRootTasks())
```

Every Subtask scope:

```text
sortTasks(AppState.getSubtasks(parent.id))
```

Use all Tasks in each scope, not only the current filter.

## 2. Explicit Custom selection

In `handleSettingsPanelClick()`:

If selected sort is Custom and current sort is not Custom:

1. Build snapshot before changing `this.sortKey`.
2. `await AppDataService.activateCustomSort(snapshot)`.
3. On success set `this.sortKey = 'custom'`.
4. Sync UI and render.

Normal sort selections keep using `setSetting('sortKey', value)`.

## 3. Shared snapshot validation/application

The data service must validate:

- one root scope;
- every existing Subtask sibling scope;
- no duplicate scopes;
- no duplicate Task IDs;
- every Task ID exists;
- every Task belongs to the declared parent scope;
- every sibling scope is complete;
- the entire hierarchy is represented.

Then assign sequential `sortOrder` values to Task copies.

## 4. `activateCustomSort(snapshot)`

One transaction writes:

- changed Task `sortOrder` rows;
- `APP_SETTINGS.sortKey = custom`.

After success:

- `AppStateSync.replaceTasks(...)`;
- `AppStateSync.setSetting('sortKey', 'custom')`.

No other Task field changes.

## 5. Integrate baseline into the existing hierarchy writer

Do **not** create a second hierarchy mutation path.

Extend the existing `AppDataService.commitHierarchyDrag()` with optional `customOrderSnapshot`.

When supplied:

- apply snapshot to copies;
- derive source/target sibling IDs from snapshot order rather than old custom AppState order;
- run the existing hierarchy/group metadata logic;
- persist through the existing single transaction.

When absent, preserve existing Custom drag behavior.

## 6. Drag commit UI

`TaskDragCommitMethods.commitTaskDrag()`:

- no-op/canceled drag: return without switching sort;
- drag started from Custom: normal `commitHierarchyDrag()`;
- drag started from non-Custom: verify sort is unchanged, build snapshot, pass it to `commitHierarchyDrag()`;
- after successful commit set Workspace sort UI to Custom.

---

# Grouping / Filtering

## Filters

Snapshot all Tasks in each sibling scope. Hidden Tasks retain deterministic positions from the active comparator.

## Group By

Grouping controls where the user drops; it does not define the global baseline.

Existing Priority/Date/Project/Tag metadata changes from cross-group drag must remain unchanged.

## Tag grouping

A Task can appear in multiple Tag groups, so DOM cannot be the durable baseline.

## Completed Tasks

Active/completed sections still share the same sibling `sortOrder` namespace. Sorting the complete scope preserves relative comparator order inside each partition.

---

# Part 3 Architecture Requirement

Do not reintroduce direct state mutation such as:

```text
AppState.tasks = ...
AppState.rebuildTaskOrder()
```

Required path:

```text
Workspace / Drag UI
  → AppDataService
  → IndexedDB transaction
  → AppStateSync
  → render
```

---

# Static Verification

Before merge confirm:

- Explicit non-Custom → Custom captures before changing `sortKey`.
- Normal sort → normal sort does not rewrite `sortOrder`.
- No-op/canceled drag keeps the current normal sort.
- Successful normal-sort drag passes a complete snapshot into the existing hierarchy writer.
- The existing hierarchy writer has only one mutation implementation.
- Baseline + drop/hierarchy/group metadata + `sortKey=custom` are atomic.
- Custom-started drags preserve existing behavior.
- No direct AppState mutation is introduced.
- No DOM traversal creates the global baseline.
- No Schedule/Repeat/reminder/focus/context-menu files are touched.

---

# Manual Test Checklist

## Explicit Custom

1. Old Custom: `C, A, B`.
2. Name ascending → `A, B, C`.
3. Select Custom.
4. Must remain `A, B, C`.
5. Refresh: must remain `A, B, C`.

Repeat with Name descending, Due Date, Priority, Created Date.

## Direct drag from Name

1. Old Custom: `C, A, B`.
2. Name ascending → `A, B, C`.
3. Without selecting Custom, drag `A` below `C`.
4. Must become `B, C, A`.
5. Sort indicator must become Custom.
6. Refresh: must remain `B, C, A`.

## Other normal sorts

Repeat direct drag under:

- Name ascending/descending
- Due Date
- Priority
- Created Date

## Cancel/no-op drag

Start from Name, begin dragging, then cancel or return to the original slot. Sort must remain Name and saved Custom order must not be rewritten.

## Subtasks / hierarchy

Test:

- Subtask reorder under a normal sort;
- root reorder;
- root → Subtask where allowed;
- Subtask → root;
- Subtask between parents where supported.

A successful drop must become Custom and preserve the previous sorted baseline plus the drag.

## Grouped views

Test Priority and Project grouping, including cross-group drops. Existing metadata behavior must remain correct while Custom adopts the new order.

---

# Completion Rule

Do not mark this repair manually verified until real-device testing succeeds after refresh.