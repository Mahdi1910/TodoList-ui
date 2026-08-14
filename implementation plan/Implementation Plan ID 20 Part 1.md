# Implementation Plan ID 20 — Part 1 of 5

## Baseline + Remove the Runtime UI Persistence Patch Layer (#6)

> **Status:** Plan only. Do not implement application code merely by creating this file.
>
> **Source plan:** `implementation plan/Implementation Plan ID 20.md`.
>
> **Execution order:** Part 1 → Part 2 → Part 3 → Part 4 → Part 5.
>
> The original ID20 remains the master/reference plan. These Part files only split it into smaller execution units; they do not change intended behavior.

---

# 1. Goal of This Part

Prepare current `main` for architecture work, then remove:

```text
js/storage/ui-persistence-bindings.js
```

as the hidden final owner of UI commands.

This Part primarily addresses:

```text
Priority 2 Problem #6
```

It also removes the small Backup-specific `AppDataService.whenIdle()` late extension so the main service surface is truthful before larger cleanup.

Target ownership after this Part:

```text
UI component
    ↓ direct command
AppDataService / focused service
    ↓ IndexedDB transaction
successful commit
    ↓
controlled AppState synchronization
    ↓
render
```

No UI action covered here should depend on a later-loaded file silently replacing its implementation.

---

# 2. Non-Negotiable Invariants

Preserve all current user data and behavior.

Do not change:

```text
TodoListDB name
IndexedDB VERSION = 1
store names
seed-once behavior
intentional empty-database behavior
Task/Subtask CRUD
one-level Subtask hierarchy
Subtask Project inheritance
Task Link / Unlink / Delete
Task hierarchy drag/reorder/reparent
Project/Tag hierarchy and order
Sort / direction / Group By
Project/Tag saved viewType
Timeline disabled state
Theme persistence
custom reminders
Repeat behavior
Repeat Ends
familySlotId behavior
ID15 family-aware filtering
ID16 safe Project/Tag text rendering
ID17 Subtask Tag ordering
ID19 Backup/Restore
existing bootstrap error classification (#12)
```

Data safety rule for every write:

```text
calculate durable change
→ IndexedDB transaction
→ success
→ update in-memory state
→ render
```

Do not mutate live domain state first and hope persistence works afterward.

No browser automation. Manual browser/phone testing belongs to the user.

---

# 3. Step 1 — Establish Current-Main Baseline

Before moving ownership, verify the current source and behavior.

## 3.1 Confirm bootstrap diagnostic baseline

Current `js/app.js` should still distinguish:

```text
MODULE_LOAD
INTEGRATION
DATABASE_OPEN
DATABASE_REPAIR
HYDRATION
UI_INIT
```

Do not rewrite this classification in Part 1.

## 3.2 Confirm overlapping work status

Entering Part 1:

```text
ID17: implemented — preserve
ID19: implemented — preserve
ID13: separate/partial — do not claim solved
Problem #12: existing code — preserve and later verify
```

## 3.3 Baseline smoke test

Before architecture migration, manually confirm current `main` can perform at least:

```text
create/edit/complete plain Task
create/edit Subtask
create/reorder Project or Tag
save Sort/Group/view setting
create/use custom reminder
complete repeating Task
Create Backup
select + validate Backup for Restore
```

If current `main` is already broken in one of these critical paths, record/fix that separately rather than hiding it inside this refactor.

---

# 4. Step 2 — Build Runtime Ownership / Parity Inventory

Before removing any patch slice, record the final behavior currently supplied by the runtime patch.

Minimum inventory:

| Command | Source owner | Current shadow/final owner | Durable path | Behavior to preserve |
|---|---|---|---|---|
| Task checkbox | `task-renderer.js` | `ui-persistence-bindings.js` | `AppDataService.toggleTaskStatus` | disable while saving, rollback UI on failure, Repeat semantics |
| Main Task submit | Tasks component | persistence patch | create/update Task | keep form open on failure |
| Subtask submit | Subtask editor | persistence patch | create/update Task | inherited Project |
| Link/Unlink/Delete | task actions | persistence patch | hierarchy/delete service | family rules + confirmation |
| Task hierarchy drag | drag commit component | persistence patch | hierarchy service | resequence + force Custom sort |
| Project CRUD | Project sidebar | persistence patch | taxonomy service | filter/count/picker refresh |
| Tag CRUD | Tag sidebar | persistence patch | taxonomy service | filter/count/picker refresh |
| Sort/Group/view | WorkspaceControls | persistence patch | setting/entity service | component state only after success |
| Custom reminder save/delete | Schedule | persistence patch | reminder stores | relation cleanup |
| Backup idle boundary | no real base owner | `data-service-backup.js` | AppDataService queue | Backup waits for writes |

For each command identify:

```text
future real owner
stores touched
transaction boundary
memory update after commit
render/refresh behavior
error behavior
manual acceptance cases
```

This inventory is a hard prerequisite to deleting `ui-persistence-bindings.js`.

---

# 5. Step 3 — Make AppDataService Core Surface Truthful

## 5.1 Move `whenIdle()` into the real AppDataService owner

Current pattern:

```text
js/storage/data-service-backup.js
→ late Object.assign(AppDataService, { whenIdle() })
```

Target:

```text
AppDataService directly owns whenIdle()
```

Required contract:

```text
await AppDataService.whenIdle()
```

must settle only after all earlier queued writes have settled.

It must not bypass or corrupt `_writeQueue`.

## 5.2 Remove the Backup-specific service extension

Only after real `AppDataService` owns `whenIdle()` and callers resolve correctly:

```text
remove js/storage/data-service-backup.js
remove its Settings lazy-load reference
```

Do not redesign Backup/Restore here.

Backup must still:

```text
wait for pending writes
read raw stores
validate before restore
restore transactionally
apply theme after DB success
reload normally
```

---

# 6. Step 4 — Move Task Checkbox Completion into Its Real Owner

Real owner:

```text
js/components/task-renderer.js
```

The checkbox itself should directly perform final async behavior:

```text
remember requested state
→ disable checkbox
→ await AppDataService.toggleTaskStatus(task.id)
→ refresh on success
→ restore previous checkbox state on failure
→ report storage error
```

Remove the checkbox cloning/replacement logic from the runtime patch in the same milestone.

Regression coverage:

```text
plain root
plain Subtask
repeating root
repeating Subtask
historical uncomplete
parent-family completion
refresh persistence
```

Do not simplify Repeat behavior here; Part 2 will later make Repeat ownership explicit.

---

# 7. Step 5 — Move Task and Subtask Submit Ownership

Real owners:

```text
TasksComponent
SubtaskEditorComponent
```

Direct paths:

```text
new root     → AppDataService.createTask({ parentTaskId: null })
edit Task    → AppDataService.updateTask(...)
new Subtask  → AppDataService.createTask({ parentTaskId })
edit Subtask → AppDataService.updateTask(...)
```

Preserve:

```text
submit disabled during write
form remains open if persistence fails
all Task fields
Subtask Project inheritance
ID17 Tag ordering
render only after successful write
```

Remove both runtime submit overrides in the same milestone.

---

# 8. Step 6 — Move Task Action Ownership

Real owner:

```text
js/components/task-actions.js
```

Direct service commands:

```text
Link   → AppDataService.linkTaskToParent
Unlink → AppDataService.unlinkTask
Delete → AppDataService.deleteTaskFamily
```

Preserve:

```text
family delete confirmation
one-level hierarchy rules
parent validation
Project inheritance
refresh after success
error reporting on failure
```

Remove the corresponding runtime overrides immediately after parity is established.

---

# 9. Step 7 — Move Workspace Persistence Ownership

Real owner:

```text
js/components/workspace-controls.js
```

Move final persistent behavior directly into that component:

```text
init settings from AppState.settings
Sort/Group   → await AppDataService.setSetting(...)
Direction    → await AppDataService.setSetting(...)
Project/Tag viewType → await AppDataService.setEntityViewType(...)
```

Critical rule:

> Update the component's live setting only after persistence succeeds.

Preserve:

```text
Custom sort disables direction changes
Timeline remains disabled
Project/Tag viewType survives refresh
List/Kanban behavior unchanged
```

Remove the Workspace runtime overrides in the same milestone.

---

# 10. Step 8 — Move Task Hierarchy Drag Commit Ownership

Real owner:

```text
js/components/task-drag-commit.js
```

Final path:

```text
drag preview
→ AppDataService.commitHierarchyDrag(...)
→ success
→ set Sort to Custom in UI/state
→ cleanup/render
```

Preserve existing service semantics for:

```text
root reorder
Subtask reorder
root → Subtask
Subtask → root
reparent
Project inheritance
group-lane moves
priority/date/tag changes from lane movement
Repeat re-anchoring on date change
sortOrder resequencing
```

Audit:

```text
js/storage/data-service-drag.js
```

Do not delete it merely because it looks old. Remove only after proving no active production caller remains.

Remove the runtime drag override after the real owner works.

---

# 11. Step 9 — Move Project/Tag Persistence Ownership Before UI Consolidation

Do not merge Project/Tag UI yet. First make each existing owner truthful.

Project direct service commands:

```text
createProject
updateProject
deleteProject
```

Tag direct service commands:

```text
createTag
updateTag
deleteTag
```

Preserve:

```text
save disabled during write
form usable after failure
hierarchy validation
parent picker behavior
viewType
picker refresh
current-filter repair
counts
Task rerender
```

Remove Project/Tag runtime persistence overrides after parity.

The actual Project/Tag shared-core merge belongs to Part 4.

---

# 12. Step 10 — Move Custom Reminder Command Ownership to a Focused Service

Recommended service responsibility:

```text
js/storage/data-service-reminders.js
```

Move out of taxonomy service:

```text
saveReminderDefinition
deleteReminderDefinition
```

Schedule should call the focused reminder command directly.

For this Part, the goal is to remove the runtime reminder patch without yet finishing the deeper reminder read-model cleanup. That deeper ownership work is Part 3.

Preserve custom-reminder delete semantics:

```text
remove definition
remove task_reminders relations
update affected Tasks only after successful DB commit
fallback to ['none'] when required
rerender reminder UI
```

---

# 13. Step 11 — Delete `ui-persistence-bindings.js`

Only after all unique behavior above has a truthful real owner:

```text
remove js/storage/ui-persistence-bindings.js
remove bindPersistentUiMutations()
remove bootstrap/load references
```

Static gate:

```text
ui-persistence-bindings.js      gone
bindPersistentUiMutations       zero production refs
checkbox clone patch            gone
Task/Subtask submit patches     gone
Task action patches             gone
Project/Tag patches             gone
Workspace patches               gone
drag patch                      gone
reminder patch                  gone
```

No command should have both an original implementation and a later hidden replacement.

---

# 14. Manual Verification for Part 1

Test immediately and after refresh where persistence matters.

## Tasks

- Create root Task in Inbox.
- Create under active Project filter.
- Create under active Tag filter.
- Edit title/description/priority/date/time/reminders/Repeat.
- Complete/uncomplete.
- Delete.

## Subtasks

- Create/edit Subtask.
- Confirm Project inheritance.
- Confirm ID17 Tag order remains correct.
- Link/Unlink.
- Delete child and parent family.

## Drag

- root reorder.
- Subtask reorder.
- root → Subtask.
- Subtask → root.
- reparent.
- supported group-lane move.
- confirm Sort becomes Custom.

## Project/Tag

- create/edit/delete.
- add child.
- parent picker.
- reorder/reparent.
- confirm current filter/counts/pickers refresh.

## Workspace

- Sort.
- Group.
- Asc/Desc.
- List/Kanban.
- Project/Tag viewType persistence.

## Reminders

- create custom reminder.
- use on Task.
- refresh.
- delete custom reminder.
- confirm Task relations update.

## Repeat regression

At minimum ensure existing Repeat completion still behaves exactly as before. Do not refactor Repeat internals in Part 1.

## Backup/Restore regression

- Create Backup.
- Validate a Restore file.
- Confirm no regression from moving `whenIdle()`.

---

# 15. Definition of Done for Part 1

Part 1 is complete when:

1. Current-main behavior was inventoried.
2. Existing bootstrap error stages remain intact.
3. `AppDataService.whenIdle()` has a real owner.
4. `data-service-backup.js` is no longer needed as a late service extension.
5. Task checkbox final behavior lives in the renderer owner.
6. Task/Subtask submit final behavior lives in their real components.
7. Task action final behavior lives in `task-actions.js`.
8. Workspace persistence lives in `workspace-controls.js`.
9. Hierarchy drag commit final behavior lives in `task-drag-commit.js`.
10. Project/Tag persistence calls live in their real owners.
11. Reminder save/delete commands have a focused service owner.
12. `ui-persistence-bindings.js` is deleted.
13. `bindPersistentUiMutations` has zero production references.
14. ID15/ID16/ID17/ID19 behavior remains intact.
15. Important mutations survive refresh.
16. Problem #6 is marked complete only after manual verification, not merely after code movement.

---

# 16. Stop Point / Handoff to Part 2

Do not continue directly into Repeat internals unless Part 1 is stable.

Part 2 begins only when:

```text
runtime UI persistence patch layer is gone
real UI owners are truthful
Backup idle boundary is stable
current Repeat behavior still passes regression
```

Then continue with:

```text
Implementation Plan ID 20 Part 2.md
```
