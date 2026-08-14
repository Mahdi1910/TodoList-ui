# Implementation Plan ID 20 — Part 3 of 5

## Reminder Ownership + Reduce AppState Write Responsibilities (#10, #8)

> **Status:** Plan only. No application code is implemented by this file.
>
> **Source plan:** `implementation plan/Implementation Plan ID 20.md`.
>
> **Prerequisites:** Part 1 and Part 2 must be stable first.

---

# 1. Goal of This Part

This Part solves two closely related ownership problems:

```text
#10 Remove UI-component dependency from the data layer
#8  Reduce AppState responsibilities
```

The desired direction is:

```text
IndexedDB / services
        ↓
hydrated read model
        ↓
UI reads from state
```

not:

```text
data service ↔ ScheduleComponent
```

and not:

```text
UI writes directly through AppState CRUD APIs
```

---

# 2. Current Problems to Remove

Current reminder coupling includes:

```text
AppDataService.resolveReminders()
→ reads ScheduleComponent.customReminders

AppPersistence.hydrateState()
→ writes ScheduleComponent.customReminders
```

Current AppState still owns/mixes:

```text
seed data
hydration
normalization
Task CRUD
Project CRUD
Tag CRUD
completion mutation
filter matching
counts
hierarchy helpers
navigation/filter state
ordering helpers
```

`task-relations.js` also captures and replaces AppState mutation methods.

This Part separates read-model responsibility from domain mutation responsibility.

---

# 3. Non-Negotiable Invariants

Preserve:

```text
Task/Subtask behavior
Project/Tag behavior
ID15 family-aware filtering
ID16 safe Task picker rendering
ID17 Subtask Tag ordering
Repeat behavior stabilized in Part 2
custom reminder definitions
Task-reminder relations
Sort/Group/settings persistence
Backup/Restore
current navigation/filter behavior
```

No IndexedDB schema/version bump is expected.

All writes remain:

```text
persist first
→ memory synchronization after success
→ render
```

---

# 4. Step 1 — Add Reminder Definitions to the Hydrated Read Model

Add reminder definitions to the application read model, for example:

```text
AppState.reminderDefinitions
```

or an equivalent dedicated state/read-model container.

Hydration should load reminder definitions as normal application data.

Recommended conceptual state:

```text
AppState
├── tasks
├── projects
├── tags
├── reminderDefinitions
├── settings
├── currentFilter
└── currentFilterType
```

The UI is allowed to derive display-friendly custom reminder objects from this state.

---

# 5. Step 2 — Stop Persistence from Writing into Schedule UI

Remove hydration behavior equivalent to:

```text
ScheduleComponent.customReminders = ...
```

Hydration should only populate the state/read model.

Target:

```text
IndexedDB
→ AppPersistence
→ AppState.reminderDefinitions
```

No storage/persistence module should need ScheduleComponent to exist during hydration.

Static gate:

```text
persistence references to ScheduleComponent = 0
```

---

# 6. Step 3 — Stop AppDataService from Reading Schedule UI

Current `resolveReminders()` must no longer search:

```text
ScheduleComponent.customReminders
```

Instead, resolve reminder IDs from:

```text
hydrated reminder definitions
or
focused reminder-domain helper/service
```

Data/service modules must not depend on UI component state.

Static target:

```text
storage/data-service references to ScheduleComponent = 0
```

---

# 7. Step 4 — Make Schedule Derive Reminder UI from State

Schedule remains the UI owner for editing reminder selection, but not the durable owner of reminder definitions.

Conceptual flow:

```text
AppState.reminderDefinitions
        ↓ selector/mapper
Schedule reminder menu
```

When a custom reminder is created or removed:

```text
Schedule command
→ reminder service
→ IndexedDB transaction
→ update AppState reminderDefinitions
→ Schedule rerenders from state
```

Avoid keeping a second permanent mutable source of truth inside:

```text
ScheduleComponent.customReminders
```

A short-lived derived cache is acceptable only if it cannot diverge from state.

---

# 8. Step 5 — Finalize Focused Reminder Service Responsibility

Part 1 should already have moved reminder commands out of taxonomy responsibility.

Final focused owner should contain operations such as:

```text
saveReminderDefinition
deleteReminderDefinition
resolve reminder definitions/IDs where appropriate
```

Preserve delete semantics:

```text
remove custom reminder definition
remove task_reminders relations using that ID
commit transaction
update affected Task reminders in memory
fallback to ['none'] if no reminder remains
update reminderDefinitions read model
rerender affected UI
```

Built-in reminders remain protected from deletion.

---

# 9. Step 6 — Extract Task Normalization from AppState

Current normalization lives inside AppState and is also called by read paths.

Recommended focused pure helper:

```text
js/task-model.js
```

with something like:

```text
normalizeTask(task)
```

Use normalization only at controlled boundaries:

```text
hydration
Task creation/build
Task update
mapper conversion
post-transaction state synchronization
```

Do not normalize/rebuild the whole live Task array as a side effect of reading/filtering.

If this overlaps tracker Problem #19, do not automatically mark #19 complete; that tracker item has its own review/verification rule.

---

# 10. Step 7 — Establish Controlled Post-Transaction State Synchronization

Domain data arrays/settings should be changed only through controlled synchronization after persistence succeeds.

A small state synchronization layer is allowed if useful, but do not add abstraction for its own sake.

Useful responsibilities may include:

```text
hydrate all data
upsert Task
remove Task family
upsert/remove Project
upsert/remove Tag
upsert/remove reminder definition
set setting
replace/resequence Task scope
replace a set of updated Tasks after transaction
```

The key rule is ownership, not a specific class name.

---

# 11. Step 8 — Refactor `task-relations.js`

Keep read/validation helpers such as:

```text
getTask
isSubtask
getSubtasks
getSubtaskIds
hasSubtasks
getRootTasks
validateParentTaskId
```

Remove the pattern that does:

```text
capture AppState.addTask/updateTask/deleteTask/deleteProject
then replace those methods later
```

Hierarchy/domain writes already belong in AppDataService/focused services after Part 1.

`task-relations.js` should become read/validation logic rather than a second write layer.

---

# 12. Step 9 — Refactor `task-order.js`

Keep useful read/pure calculations such as:

```text
getSiblingTasks
getSiblingTaskIds
getRootTaskIds
order calculations
```

Durable ordering/resequence operations belong to services that persist first.

Avoid public helpers that mutate live arrays merely because a selector/render path called them.

---

# 13. Step 10 — Remove Old Public AppState CRUD APIs Only After Zero Callers

Potential write APIs to remove from public AppState:

```text
AppState.addTask
AppState.updateTask
AppState.deleteTask
AppState.toggleTaskStatus
AppState.addProject
AppState.updateProject
AppState.deleteProject
AppState.addTag
AppState.updateTag
AppState.deleteTag
```

Hard rule:

> Do not remove any method until repository search proves no production caller or captured alias remains.

Do not break legacy code by deleting them early.

---

# 14. Expected Final AppState Responsibility

After Part 3, AppState should primarily own:

```text
hydrated Tasks
hydrated Projects
hydrated Tags
hydrated reminderDefinitions
hydrated settings
current navigation/filter state
entity lookup
read-only selectors
counts
filter matching
hierarchy/read helpers
```

It should not act as a second public domain-write service beside AppDataService.

---

# 15. Read-Path Safety Audit

Search selectors and render helpers for mutations.

Important rule:

```text
reading state must not normalize/rebuild/reorder the entire live state as a side effect
```

Audit at least:

```text
getFilteredTasks
matchesFilter
countInbox
countToday
countProject
countTag
TaskFilter.getDisplayTasks
Task rendering paths
Task grouping/sorting paths
```

Pure sorting of copied arrays is fine.

---

# 16. Manual Reminder Regression

Test:

- built-in reminder.
- multiple reminders.
- create custom reminder.
- custom reminder appears immediately.
- custom reminder survives refresh.
- reuse custom reminder on another Task.
- edit Task retaining custom reminder.
- delete custom reminder.
- affected Tasks lose the deleted relation.
- fallback to None where needed.
- reopen Schedule and confirm it derives the correct reminder list from state.
- refresh and confirm state is durable.

---

# 17. Manual AppState/Behavior Regression

## Filtering

Verify ID15 behavior in List and Kanban:

```text
parent matches → show parent family
parent does not match but child matches → show matching child standalone visually
stored parentTaskId does not change
```

## Counts

Confirm counts remain correct for:

```text
Inbox
Today
Completed
Project hierarchy
Tag hierarchy
```

## CRUD

Re-test:

```text
Task create/edit/delete/complete
Subtask create/edit/delete
Project create/edit/delete
Tag create/edit/delete
hierarchy link/unlink
```

and refresh after important writes.

## Sorting/grouping

Confirm state cleanup did not break:

```text
Custom order
Due Date
Priority
Name
Created Date
Group None/Priority/Date/Project/Tag
```

---

# 18. Backup/Restore Regression

Part 3 changes state ownership and hydration shape, so Backup/Restore must be tested.

Verify:

1. Create representative data with custom reminders.
2. Create Backup.
3. Change/delete data.
4. Restore Backup.
5. Confirm reminder definitions and Task relations return.
6. Confirm Repeat state from Part 2 remains correct.
7. Confirm settings/theme return.
8. Confirm empty valid backup does not trigger seed data.

Backup must still export raw IndexedDB rows, not reconstructed AppState objects.

---

# 19. Static Gates

Before Part 3 is considered complete:

```text
storage/persistence refs to ScheduleComponent = 0
AppDataService refs to ScheduleComponent = 0
reminder definitions are represented in state/read model
reminder commands live in focused reminder responsibility
task-relations no longer captures/replaces AppState CRUD
UI production callers of old AppState CRUD = 0
read selectors do not rebuild/mutate full live state as a side effect
```

---

# 20. Definition of Done for Part 3

Part 3 is complete when:

1. reminder definitions hydrate into state/read-model data.
2. persistence no longer writes into ScheduleComponent.
3. AppDataService no longer reads ScheduleComponent.
4. Schedule renders reminder definitions from state-derived data.
5. reminder save/delete commands have focused ownership.
6. custom-reminder relation cleanup still works.
7. Task normalization is a controlled pure boundary concern.
8. `task-relations.js` is read/validation focused, not mutation patching.
9. ordering helpers no longer act as hidden durable mutation owners.
10. old AppState CRUD APIs have zero production callers before removal.
11. AppState is primarily a hydrated read model + selectors/navigation state.
12. ID15/ID16/ID17/Repeat/Backup behavior remains intact.
13. Problems #10 and #8 are marked complete individually only after their own verification gates pass.

---

# 21. Stop Point / Handoff to Part 4

Part 4 should start only when:

```text
UI persistence patches are gone
Repeat patches are gone
reminder data ownership is clean
AppState write surface is reduced
```

Then continue with:

```text
Implementation Plan ID 20 Part 4.md
```
