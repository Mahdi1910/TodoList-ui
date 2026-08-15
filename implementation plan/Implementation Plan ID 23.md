# Implementation Plan ID 23 — Custom Sort Adopts the Current Sort Order

## Purpose

Correct the meaning of **Sort → Custom** and make manual drag consistent with that meaning.

Custom must never mean “restore an old historical manual order.” Instead:

- When the user explicitly switches from Name / Due Date / Priority / Created Date into **Custom**, the order produced by the current sort becomes the new persisted Custom baseline.
- When the user manually drags a Task/Subtask while a non-Custom sort is active, the app must automatically switch to **Custom** and persist the current sorted baseline **with the user’s drag applied**.
- Canceling a drag must not switch to Custom or persist anything.
- Once Custom is active, later manual drags continue to update the saved Custom order normally.

Example:

```text
old Custom: C, A, B
Name:       A, B, C
select Custom
result:     A, B, C

drag B below C
result:     A, C, B  (saved Custom)
```

Direct-drag example:

```text
old Custom: C, A, B
Name:       A, B, C

drag A below C without first selecting Custom
result:     B, C, A
sort mode:  Custom
```

The old `C, A, B` order must not reappear.

---

## Scope

This is a focused sorting/order repair after ID20 Part 3. Do not start Part 4 and do not undo Part 3 ownership boundaries.

Expected files:

- `js/components/workspace-controls.js`
- `js/components/task-drag.js`
- `js/components/task-drag-commit.js`
- `js/storage/data-service-drag.js`
- `js/storage/data-service-hierarchy.js`

No changes should be required to:

- Task/Subtask editor focus behavior
- Schedule/Date keyboard behavior
- context-menu clipping/focus repair
- Repeat engine
- reminder architecture
- IndexedDB schema
- Backup format

The existing `task.sortOrder` field remains the persisted Custom-order representation.

---

# Current Root Cause

`WorkspaceControls.sortTasks()` calculates Name / Due Date / Priority / Created Date order only at render time.

The persisted `sortOrder` values still contain the previous manual Custom arrangement.

Currently, selecting Custom only saves:

```text
sortKey = custom
```

so the renderer falls back to the older persisted `sortOrder` and tasks jump back.

The drag path has the same architectural problem. A drag while Name/Priority/etc. is active eventually saves `sortKey = custom`, but the hierarchy service starts from the old AppState/custom sibling order instead of the currently active sorted baseline. Some drops can therefore mix the new drag with pieces of the old Custom order.

---

# Required Semantics

## 1. Explicit switch into Custom

For every non-Custom sort:

- Name → Custom keeps Name order.
- Due Date → Custom keeps Due Date order.
- Priority → Custom keeps Priority order.
- Created Date → Custom keeps Created Date order.
- Ascending/descending direction must be respected.

The current sorted order becomes the new persisted `sortOrder` baseline.

## 2. Switching between normal sorts

Name → Priority, Priority → Due Date, etc. must **not** rewrite `sortOrder`.

Only entering Custom captures a new manual baseline.

## 3. Selecting Custom while already Custom

No order rewrite is needed.

## 4. Drag while already Custom

Keep current drag behavior: the successful drag updates the saved manual order.

## 5. Drag while a non-Custom sort is active

This is mandatory.

At drag start:

1. Record the active sort key/direction.
2. Build an in-memory snapshot of the current sorted Task/Subtask sibling scopes.
3. Do **not** persist anything yet.

If the drag is canceled or returns to its original position:

- discard the snapshot;
- keep the original non-Custom sort;
- do not change `sortOrder`.

If the drag succeeds:

1. Use the captured sorted snapshot as the baseline.
2. Apply the actual hierarchy/order drop to that baseline.
3. Persist all affected `sortOrder` values plus `sortKey = custom` atomically.
4. Synchronize AppState through `AppStateSync` only after the transaction succeeds.
5. Set `WorkspaceControls.sortKey = custom` only after success.

Example:

```text
old Custom: C, A, B
Name view:  A, B, C

drag A to bottom

correct new Custom: B, C, A
incorrect result:   C, A, B or C, B, A
```

## 6. Root Tasks and Subtasks

Capture independent sibling scopes:

```text
root scope
parent A subtask scope
parent B subtask scope
...
```

Each scope receives its own sequential `sortOrder` values.

## 7. Use data, not DOM, for the baseline

The persistent baseline must be produced from Task data using the existing `WorkspaceControls.sortTasks()` comparator.

Do not reconstruct the global Custom baseline from rendered DOM because:

- filters hide Tasks;
- List and Kanban have different DOM structures;
- Group By creates separate containers;
- Tag grouping can render one Task more than once.

The drag system may continue using DOM geometry to determine the user’s actual drop neighbors (`beforeTaskId` / `afterTaskId`). The **baseline order** itself must remain data-driven.

---

# Implementation Design

## Step 1 — `WorkspaceControls.buildCustomOrderSnapshot()`

Add a read-only helper that runs while the current non-Custom sort is still active.

Build:

```text
[
  { parentTaskId: null, orderedIds: [...] },
  { parentTaskId: 'parent-1', orderedIds: [...] },
  ...
]
```

For roots:

```text
sortTasks(AppState.getRootTasks())
```

For every root with Subtasks:

```text
sortTasks(AppState.getSubtasks(root.id))
```

Use all Tasks in every sibling scope, not only the currently filtered/visible Tasks.

The snapshot contains IDs only.

## Step 2 — Explicit Custom selection

In `WorkspaceControls.handleSettingsPanelClick()`:

When selected value is `custom` and current `sortKey !== custom`:

1. Build the snapshot **before** changing `this.sortKey`.
2. Call `await AppDataService.activateCustomSort(snapshot)`.
3. After success, set `this.sortKey = 'custom'`.
4. Sync UI and render.

Normal sort selections keep using `setSetting('sortKey', value)` and do not touch task order.

If persistence fails, remain in the previous sort mode.

## Step 3 — Shared AppDataService snapshot validation/order helper

Extend the order/drag service layer with pure helpers that:

- validate snapshot structure;
- require exactly one root scope;
- require every existing Subtask sibling scope;
- reject duplicate IDs/scopes;
- verify every ID exists;
- verify each Task belongs to the declared `parentTaskId` scope;
- verify the snapshot covers the complete current hierarchy;
- apply sequential `sortOrder` values to task copies.

These helpers must not touch DOM.

## Step 4 — `AppDataService.activateCustomSort(snapshot)`

The explicit Custom command must:

1. validate/apply the snapshot to Task copies;
2. write changed Task rows and `APP_SETTINGS.sortKey = custom` in one IndexedDB transaction;
3. on success call `AppStateSync.replaceTasks(...)`;
4. call `AppStateSync.setSetting('sortKey', 'custom')`;
5. return without changing any Task field except `sortOrder`.

Do not change `updatedAt` merely for order capture unless existing order persistence requires it.

## Step 5 — Capture baseline when drag starts under a normal sort

In `TaskDragMethods.beginTaskDragSession()`:

- store the normalized `startSortKey`;
- if `startSortKey !== 'custom'`, call `WorkspaceControls.buildCustomOrderSnapshot()` and store it on the drag session;
- do not persist it yet.

This must happen before any successful drop changes the sort mode.

## Step 6 — Pass the baseline only on successful drag commit

`TaskDragCommitMethods.commitTaskDrag()` passes the captured snapshot to:

```text
AppDataService.commitHierarchyDrag(...)
```

only when the drag started from a non-Custom sort.

Canceled/no-op drag paths never call persistence and therefore never switch to Custom.

## Step 7 — Apply hierarchy drag on top of the captured baseline

Extend `AppDataService.commitHierarchyDrag()` with an optional `customOrderSnapshot`.

When present:

1. Create normal task copies.
2. Apply the captured sorted `sortOrder` baseline to those copies first.
3. Derive source/target sibling arrays from that baseline, not from the old AppState custom order.
4. Apply the user’s `beforeTaskId` / `afterTaskId`, hierarchy level, parent change, and grouped metadata change exactly as the current drag logic does.
5. Persist the baseline order changes, hierarchy/drop changes, and `sortKey = custom` in the same transaction.
6. Update AppState only after success.

When no snapshot is supplied (drag already started in Custom), preserve existing behavior.

This is the critical rule that makes:

```text
Name order + drag delta = new Custom order
```

instead of:

```text
old Custom order + drag delta
```

---

# Grouping / Filtering Rules

## Filters

The captured baseline uses all Tasks in each sibling scope, even if the current filter hides some of them.

The drop still uses the visible neighbors selected by the drag UI. Hidden Tasks keep their deterministic position from the active comparator.

## Group By

The baseline remains global/data-driven. Group containers only determine where the user dropped.

If a grouped drag changes Priority/Date/Project/Tag metadata, keep the existing metadata behavior. The successful operation still switches to Custom.

## Tag grouping duplicates

Do not use DOM order as the baseline because one Task may appear in several tag groups.

## Completed Tasks

Active/completed rendering may be separate, but one sibling `sortOrder` namespace remains sufficient. Sorting the full sibling scope preserves the comparator-relative order inside each rendered partition.

---

# Part 3 Architecture Rules

Do not reintroduce direct state mutation such as:

```text
AppState.tasks = ...
AppState.rebuildTaskOrder()
```

Required path:

```text
Workspace/Drag UI
  → AppDataService
  → IndexedDB transaction
  → AppStateSync
  → render
```

No UI component should write durable `sortOrder` directly.

---

# Static Verification

Before merge confirm:

- Explicit non-Custom → Custom builds snapshot before changing `sortKey`.
- Normal sort → normal sort does not rewrite `sortOrder`.
- Non-Custom drag stores a baseline snapshot without persisting at drag start.
- Canceled/no-op drag keeps the original sort mode.
- Successful non-Custom drag passes the snapshot into the hierarchy service.
- Hierarchy service derives sibling order from the snapshot when supplied.
- Task order + hierarchy/drop + `sortKey=custom` are atomic.
- Custom-started drags still work without a snapshot.
- No direct AppState write APIs are reintroduced.
- No DOM traversal is used to create the persistent global baseline.
- No Repeat/reminder/schedule/focus files are modified.

---

# Manual Test Checklist

## Explicit Custom

1. Old Custom: `C, A, B`.
2. Name ascending → `A, B, C`.
3. Select Custom.
4. Must stay `A, B, C`.
5. Refresh; must stay `A, B, C`.

Repeat with Name descending, Due Date, Priority, Created Date.

## Direct drag from Name

1. Old Custom: `C, A, B`.
2. Name ascending → `A, B, C`.
3. Without selecting Custom, drag `A` below `C`.
4. Must become `B, C, A`.
5. Sort indicator must now say Custom.
6. Refresh; must remain `B, C, A`.

## Direct drag from other sorts

Repeat drag tests while sorted by:

- Name ascending/descending
- Due Date
- Priority
- Created Date

The displayed sorted order plus the user’s drag must become the new Custom order.

## Cancel/no-op drag

1. Select Name.
2. Start dragging but cancel, or return to the original slot.
3. Must remain Name.
4. No Custom-order rewrite should occur.

## Subtasks

Repeat explicit Custom and direct-drag transitions for multiple Subtasks under one parent.

## Hierarchy changes

While a non-Custom sort is active, test:

- root reorder;
- Subtask reorder;
- root → Subtask where allowed;
- Subtask → root;
- Subtask moved between parents where supported.

After each successful drag, Custom must reflect the previously sorted baseline plus the hierarchy/drop change.

## Grouped views

Test at least Priority and Project grouping. Drag inside a group and between groups. Confirm metadata updates still work and the sort becomes Custom without restoring old manual order.

---

# Completion Rule

Do not mark this repair manually verified until the user confirms real-device behavior after refresh. Static review alone is not enough.