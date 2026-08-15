# Implementation Plan ID 23 — Custom Sort Adopts the Current Sort Order

## Purpose

Fix the meaning of **Sort → Custom**.

The current behavior treats Custom as an old persisted manual order. That is not the required behavior.

The required behavior is:

- Custom does **not** restore a historical custom arrangement.
- When the user changes from another sort mode into **Custom**, whatever order the current sort mode is producing becomes the **new saved custom order**.
- After that point, manual drag-and-drop can modify and persist that custom order normally.

Example:

1. Existing custom order: `C, A, B`
2. User chooses **Name** → screen becomes `A, B, C`
3. User chooses **Custom**
4. Screen must remain `A, B, C`
5. `A, B, C` is now the saved custom baseline
6. User manually drags to `B, A, C`
7. `B, A, C` becomes the persisted custom order

The old `C, A, B` custom order must not come back.

---

## Scope

This is a focused sorting repair. It must not start Implementation Plan ID20 Part 4 and must not undo Part 3 architecture work.

Primary files expected to change:

- `js/components/workspace-controls.js`
- `js/storage/data-service-drag.js` or a small dedicated sort-order service module if separation is cleaner
- possibly `js/state-sync.js` only if a small reusable post-transaction helper is required

Files that should not need behavioral changes:

- Task editor / Subtask editor
- Schedule / reminder UI
- Repeat engine
- modal focus code
- context-menu positioning/focus repairs
- database schema
- backup format

No IndexedDB schema version change is required because the existing task `sortOrder` field already stores manual/custom order.

---

## Current Behavior and Root Cause

`WorkspaceControls.sortTasks(tasks)` currently behaves like this:

- `custom` → return tasks in their current AppState order
- `dueDate` → calculate Due Date order
- `priority` → calculate Priority order
- `name` → calculate Name order
- `createdAt` → calculate Created Date order

The persisted AppState order ultimately comes from each task's stored `sortOrder`.

When the user changes from Name/Priority/Due Date/etc. back to Custom, the current code only saves:

```text
sortKey = custom
```

It does **not** rewrite task `sortOrder` values to match the order that was visible immediately before the switch.

Therefore Custom falls back to the older persisted manual `sortOrder`, causing tasks to jump back to an old arrangement.

That is the bug to fix.

---

# Required Semantics

## Rule 1 — Switching from a non-Custom sort into Custom captures the current sorted order

For example:

- Name → Custom = keep Name order
- Due Date → Custom = keep Due Date order
- Priority → Custom = keep Priority order
- Created Date → Custom = keep Created Date order

The current `sortDirection` must also be respected.

Example:

- Name Descending displays `C, B, A`
- User selects Custom
- Custom must begin as `C, B, A`

## Rule 2 — Switching between non-Custom modes does not modify saved custom `sortOrder`

Example:

- Name → Due Date

This should only change `sortKey`; do not continuously rewrite `sortOrder` while the user is browsing normal sort modes.

The rewrite happens specifically when the user **enters Custom**.

## Rule 3 — Selecting Custom while already in Custom is a no-op

Do not rewrite order unnecessarily.

## Rule 4 — Manual drag after entering Custom keeps working exactly as today

After the capture:

```text
Name order: A, B, C
↓ choose Custom
saved custom baseline: A, B, C
↓ drag
B, A, C
```

The existing drag persistence becomes responsible for later manual changes.

## Rule 5 — Capture all sibling scopes, not only one DOM list

The application has hierarchy:

- root tasks
- subtasks belonging to each root task

The current non-Custom sorter is also used for Subtasks. Therefore when entering Custom, the new baseline must be captured independently for:

- the root-task sibling scope
- every parent task's Subtask sibling scope

Each scope gets sequential `sortOrder` values according to the order produced by the current sort.

This avoids restoring old Subtask order after switching from Name/Priority/etc. to Custom.

## Rule 6 — Do not derive the persistent order by reading DOM positions

Use task data plus the existing `WorkspaceControls.sortTasks()` function while the previous sort is still active.

Reasons:

- List and Kanban render through different DOM structures.
- Grouped views create separate containers.
- Tag grouping can display the same task in more than one group.
- Filters can hide tasks.
- DOM-based capture would make persistence depend on UI layout.

The existing sort comparator already defines the canonical order. Reuse it.

---

# Detailed Implementation

## Step 1 — Add a Custom-order snapshot helper to `WorkspaceControls`

Add a read-only helper such as:

```text
buildCustomOrderSnapshot()
```

It must run **before** `this.sortKey` is changed to `custom`.

The helper uses the current non-Custom `sortKey` and current `sortDirection` through the existing `sortTasks()` implementation.

### Root scope

1. Read all root tasks from `AppState.getRootTasks()`.
2. Pass that array through `this.sortTasks(...)` while the old sort mode is still active.
3. Record the resulting root IDs in order.

Conceptually:

```text
parentTaskId: null
orderedIds: [rootA, rootB, rootC, ...]
```

### Subtask scopes

For every root task that has children:

1. Read `AppState.getSubtasks(parent.id)`.
2. Sort them with the same currently active `sortTasks()`.
3. Record their IDs as a separate sibling scope.

Conceptually:

```text
parentTaskId: rootA
orderedIds: [childA2, childA1, childA3]
```

The snapshot should contain IDs only, not DOM elements and not mutable task objects.

Suggested conceptual structure:

```text
[
  { parentTaskId: null, orderedIds: [...] },
  { parentTaskId: 'task-123', orderedIds: [...] },
  ...
]
```

### Important

Use **all tasks in each sibling scope**, not only tasks visible in the current Inbox/Project/Tag/Today filter.

Why:

A sort mode such as Name has one deterministic relative order for the entire sibling scope. Capturing the full scope means Custom becomes the same baseline everywhere, including when the user later changes filters.

It also prevents hidden tasks from retaining stale old custom positions that later appear unexpectedly.

---

## Step 2 — Add an AppDataService command for entering Custom

Create a command with a clear purpose, for example:

```text
AppDataService.activateCustomSort(orderSnapshot)
```

This service command owns persistence.

It must:

1. Validate every snapshot scope.
2. Validate that each ID exists.
3. Validate that IDs in a scope really share the expected `parentTaskId`.
4. Ignore/reject duplicate IDs safely.
5. Build task copies with new sequential `sortOrder` values.
6. Persist all changed task rows.
7. Persist the app setting:
   ```text
   sortKey = custom
   ```
8. Do both in **one IndexedDB read/write transaction**.
9. Only after the transaction succeeds, synchronize AppState through `AppStateSync`.

The service must not touch DOM or call `WorkspaceControls.sortTasks()`.

Architecture remains:

```text
WorkspaceControls
    ↓ creates explicit ordered ID snapshot
AppDataService
    ↓ transaction
IndexedDB
    ↓ success
AppStateSync
    ↓
render
```

This respects the Part 3 ownership boundary.

---

## Step 3 — Persist sequential `sortOrder` per sibling scope

For each scope:

```text
orderedIds[0] → sortOrder = 0
orderedIds[1] → sortOrder = 1
orderedIds[2] → sortOrder = 2
...
```

Root tasks and each parent's Subtasks have independent sibling ordering, so each scope may start at zero.

Do not modify:

- title
- description
- project
- tags
- priority
- due date/time
- reminders
- Repeat state
- completion state
- hierarchy

Only `sortOrder` should change for this operation.

There is no need to update `updatedAt` merely because the presentation/manual order changed unless existing drag-order behavior already treats ordering as an `updatedAt` mutation. Prefer consistency with current drag persistence.

---

## Step 4 — Change the sort-selection flow in `handleSettingsPanelClick()`

Current flow roughly does:

```text
read selected sort
persist sortKey
set this.sortKey
render
```

Change the sort branch to distinguish entering Custom from ordinary sort changes.

### Case A — Selected value is Custom AND current sort is not Custom

Order of operations must be:

1. Keep `this.sortKey` on the previous sort temporarily.
2. Build the custom-order snapshot with that previous sort still active.
3. Call `await AppDataService.activateCustomSort(snapshot)`.
4. Only after successful persistence:
   ```text
   this.sortKey = 'custom'
   ```
5. Sync UI.
6. Render.

This order is critical.

If `this.sortKey` is changed to `custom` before the snapshot is built, `sortTasks()` will return the old custom order and reproduce the bug.

### Case B — Selected value is a normal sort

For Name/Due Date/Priority/Created Date:

1. Persist with existing `AppDataService.setSetting('sortKey', value)`.
2. Set `this.sortKey = value`.
3. Render.

Do not touch task `sortOrder`.

### Case C — Selected value is Custom and current mode is already Custom

No task-order persistence is necessary.

At most sync/close the UI as normal.

---

## Step 5 — Failure behavior must be atomic

If capturing or saving the new custom order fails:

- Do not switch `WorkspaceControls.sortKey` to Custom.
- Do not partially update AppState.
- Do not leave only some `sortOrder` rows changed.
- Keep the previous sort visually active.
- Show the normal persistence error banner.

The IndexedDB transaction must contain both:

- task `sortOrder` writes
- `APP_SETTINGS.sortKey = custom`

so they either succeed together or fail together.

---

## Step 6 — Reuse `AppStateSync`, do not restore direct AppState mutation

Part 3 intentionally removed direct writes such as:

```text
AppState.tasks = ...
AppState.rebuildTaskOrder()
```

Do not bring those patterns back.

After the transaction succeeds, pass the task copies with the new `sortOrder` values through the existing controlled state-sync mechanism.

`AppStateSync.replaceTasks(...)` already normalizes and applies `TaskOrderMethods.orderTasks(...)`, so it is the correct post-transaction synchronization path.

Also update the in-memory setting through:

```text
AppStateSync.setSetting('sortKey', 'custom')
```

---

# Important Edge Cases

## Equal values / stable sorting

Example: several tasks have no Due Date.

`sortTasks()` already determines their displayed order, including stable ties. The snapshot must use the result of that exact function so entering Custom does not reshuffle equal-value tasks.

## Ascending / Descending

The snapshot must use the currently active direction.

Examples:

```text
Name ↑ → Custom = current Name ascending order
Name ↓ → Custom = current Name descending order
Priority ↑ → Custom = current Priority ascending order
```

Do not reset `sortDirection` when entering Custom. Custom simply disables the direction button as it already does.

## Active and completed tasks

The renderer displays active and completed tasks separately, but both use the same current comparator.

Capturing the full root sibling scope through `sortTasks()` gives both partitions the same relative ordering they had under the previous comparator when each partition is rendered.

Do not create separate permanent order namespaces for active/completed status.

## Filters

Switching to Custom while viewing Inbox, Today, Project, Tag, etc. should establish the current sort mode as the canonical custom baseline for the complete task hierarchy, not only the subset currently visible.

This produces predictable behavior after changing filters.

## Group By

Grouping does not change the capture algorithm.

The group layout controls which bucket a task appears in; `sortTasks()` controls the order inside those buckets. A globally captured sibling order using the same comparator preserves the relative order within groups after switching to Custom.

Do not read group DOM containers to construct the snapshot.

## Tag grouping duplicates

A task may appear in more than one Tag group. This is another reason not to capture DOM order. One persisted task can have only one `sortOrder` value.

Using the existing comparator gives one canonical relative order that is consistently reused in each Tag group.

## Subtasks

Every Subtask sibling list must receive the new baseline too. Otherwise:

```text
Name → Custom
```

could preserve root order but unexpectedly restore an old manual Subtask order.

## New tasks after Custom is active

Keep the existing `nextRootSortOrder()` / `nextSubtaskSortOrder()` behavior unless manual testing exposes a separate problem. This repair is specifically about entering Custom from another sort mode.

## Drag-and-drop

Do not rewrite existing drag semantics. Once Custom is active, current drag/hierarchy services remain the source of future manual order updates.

---

# Expected File-Level Changes

## `js/components/workspace-controls.js`

Add:

- helper to build a full hierarchy custom-order snapshot using the current sorter
- special branch when selected sort is `custom`
- ensure snapshot is captured before changing `this.sortKey`

Keep:

- existing comparators
- existing sort-direction behavior
- existing Group logic
- existing view logic

## Data service

Prefer adding a focused command to an existing order-related service file rather than putting IndexedDB transaction code in WorkspaceControls.

Likely options:

- extend `js/storage/data-service-drag.js` because it already persists root `sortOrder`, or
- create `js/storage/data-service-order.js` if keeping sort-mode capture separate from drag produces cleaner ownership

If a new service file is created, add it explicitly to `BOOTSTRAP_SCRIPTS` in `js/app.js` after the base data service and before UI initialization.

The command should:

- validate snapshot
- write task `sortOrder`
- write `sortKey=custom`
- commit atomically
- update AppState through `AppStateSync`

## `js/state-sync.js`

No change should be required if `replaceTasks()` and `setSetting()` are sufficient.

Only add a helper if it genuinely reduces duplication; do not expand AppState responsibilities again.

---

# Static Verification Checklist

Before merging:

- Confirm switching into Custom calls the new capture command.
- Confirm the snapshot is created before `WorkspaceControls.sortKey` changes.
- Confirm normal sort changes do not write task `sortOrder`.
- Confirm the Custom transaction writes both task order and `sortKey` atomically.
- Confirm no direct `AppState.tasks` mutation is introduced.
- Confirm no `AppState.rebuildTaskOrder()` pattern is reintroduced.
- Confirm no DOM traversal is used to determine persistent custom order.
- Confirm Task/Subtask hierarchy is not changed.
- Confirm Repeat/reminder fields are not touched.
- Confirm ID21/ID22 focus behavior and context-menu repair files are outside the diff unless there is an unrelated unavoidable reason.

---

# Manual Test Checklist

## Basic Name case

Create tasks in this old custom order:

```text
C
A
B
```

1. Select Name ascending.
2. Confirm display becomes `A, B, C`.
3. Select Custom.
4. **Pass:** remains `A, B, C`.
5. Refresh.
6. **Pass:** remains `A, B, C` while Custom is selected.

## Descending case

1. Select Name.
2. Set descending → `C, B, A`.
3. Select Custom.
4. **Pass:** remains `C, B, A`.
5. Refresh and verify again.

## Manual drag after capture

1. Name → Custom gives `A, B, C`.
2. Drag to `B, A, C`.
3. Refresh.
4. **Pass:** Custom remains `B, A, C`.

## Old custom must never resurrect

1. Custom manually set to `C, A, B`.
2. Select Name → `A, B, C`.
3. Select Custom.
4. **Pass:** stays `A, B, C`, not `C, A, B`.

## Other sort modes

Repeat the same transition for:

- Due Date → Custom
- Priority → Custom
- Created Date → Custom

The visible order immediately before selecting Custom must remain unchanged.

## Chained sorts

Example:

```text
Custom → Name → Priority → Custom
```

**Pass:** Custom captures the current Priority order, not the older Name order and not the old manual Custom order.

## Subtasks

1. Create one parent with several Subtasks in non-alphabetical custom order.
2. Select Name.
3. Confirm Subtasks sort by Name.
4. Select Custom.
5. **Pass:** Subtasks remain in Name order.
6. Drag a Subtask manually.
7. Refresh.
8. **Pass:** new manual Custom Subtask order persists.

## Filters

Test transition into Custom from:

- Inbox
- Today
- a Project
- a Tag
- Completed

Then change to another filter.

**Pass:** Custom behaves consistently and does not reveal stale historical ordering in previously hidden tasks.

## Grouping

With Group By Priority/Date/Project/Tag enabled:

1. Use a non-Custom sort.
2. Select Custom.
3. **Pass:** task order inside each group does not jump back to an older custom arrangement.

## List / Kanban

Repeat Name → Custom in both List and Kanban.

**Pass:** same order semantics; no view-specific custom history restoration.

---

# Acceptance Criteria

This repair is complete only when all of the following are true:

1. Entering Custom from any other sort mode preserves the order produced by that mode.
2. The previous historical custom order is overwritten as the new baseline at that moment.
3. The new baseline survives refresh.
4. Manual drag after entering Custom persists normally.
5. Root tasks and Subtasks both follow the corrected behavior.
6. Ascending/descending ordering is captured correctly.
7. Filters, grouping, List, and Kanban do not cause old custom positions to reappear.
8. The implementation uses `AppDataService → IndexedDB → AppStateSync`, consistent with ID20 Part 3.
9. No database schema or backup-format migration is introduced.
10. No regression is introduced into the recent mobile context-menu or Date/keyboard focus repairs.

Do not mark this repair manually verified until the user has completed the manual test checklist.