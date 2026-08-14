# Implementation Plan ID 20 — Current-Main Architecture Consolidation for Priority 2 Problems #6–#14

> **Status:** Plan only. No application code is implemented by this commit.
>
> **Supersedes for future execution:** `implementation plan/Implementation Plan ID 18.md`.
>
> ID18 remains useful historical/design reference. ID20 updates that plan to the actual current `main` after ID17 and ID19 work and after bootstrap error classification was already added.

---

# 1. Goal

Solve the remaining **Priority 2 — Architecture / maintainability** problems from `problem is need to be fixed.md` safely, without changing product behavior or losing user data:

```text
6. Remove ui-persistence-bindings.js as a large runtime patch layer
7. Remove Repeat mapper/service monkey-patching
8. Reduce AppState responsibilities
9. Merge duplicated Project and Tag sidebar/modal logic
10. Remove UI-component dependency from the data layer
11. Simplify JavaScript module loading / bootstrap order
12. Improve bootstrap error reporting
13. Remove dead/duplicate HTML immediately replaced by JavaScript
14. Stop runtime-upgrading permanent markup / establish one UI source of truth
```

The destination remains:

```text
UI component
    ↓ command
AppDataService / focused domain service
    ↓ transaction
IndexedDB / repositories / mappers
    ↓ only after success
controlled in-memory synchronization
    ↓
AppState read model / selectors
    ↓
render
```

A developer reading the owning file must be able to see the real behavior. There should not be a hidden later-loaded file that silently replaces the implementation.

---

# 2. What Changed Since ID18 Was Written

ID20 must not execute ID18 literally because current `main` has changed.

## 2.1 ID17 is now implemented

Current Subtask Tag rendering now uses the shared taxonomy ordering source recursively:

```text
TaxonomyOrder.getChildren('tag', parentId)
```

Therefore ID17 is no longer a code prerequisite for this architecture refactor.

It is now a **regression invariant**:

> Project/Tag UI consolidation and module conversion must not make the Subtask Tag picker return to raw `AppState.tags` order.

Problem #4 may still remain unchecked until its manual verification rule is satisfied; that tracker state does not change ID20's architecture scope.

## 2.2 ID19 Backup/Restore now exists and must be preserved

Current `main` now contains:

```text
js/storage/backup-service.js
js/storage/backup-validation.js
js/storage/data-service-backup.js
Settings Backup/Restore controls and interaction
Backup/Restore CSS
```

Backup/Restore is implemented as a durable-storage feature and is now a critical regression invariant.

Important current behavior that ID20 must preserve:

```text
Create Backup
→ wait for pending AppDataService writes
→ read all IndexedDB stores in one readonly transaction
→ include persisted theme
→ download versioned JSON

Restore Backup
→ parse + validate complete backup before destructive work
→ wait for pending writes
→ replace all stores in one readwrite IndexedDB transaction
→ apply theme only after DB commit succeeds
→ reload through the normal hydration/startup path
```

ID20 must not weaken this safety contract.

## 2.3 ID19 also introduced architecture details that must now be cleaned up by Priority 2

ID19 was intentionally implemented against the old loader architecture. Current Settings therefore lazy-loads backup modules with runtime `<script>` creation:

```text
SettingsComponent.loadBackupScript()
SettingsComponent.ensureBackupServices()
```

It loads:

```text
js/storage/data-service-backup.js
js/storage/backup-validation.js
js/storage/backup-service.js
```

`data-service-backup.js` also extends `AppDataService` later with:

```text
whenIdle()
```

This is small and behaviorally correct, but it is another late extension that must be absorbed into the real service during Problem #11/#8 cleanup.

Current Settings also creates the stable Backup/Restore section at runtime with:

```text
SettingsComponent.ensureBackupUi()
```

That becomes a new known structure to resolve under Problems #13/#14.

## 2.4 Problem #12 bootstrap error classification is already implemented in current code

Current `js/app.js` already distinguishes startup stages such as:

```text
MODULE_LOAD
INTEGRATION
DATABASE_OPEN
DATABASE_REPAIR
HYDRATION
UI_INIT
```

Therefore ID20 must **not reimplement Problem #12 from scratch**.

For #12, the work is now:

```text
static audit existing implementation
+
manual verification of representative failure categories
+
preserve that behavior through the later module cutover
```

If the audit finds a concrete missing/error case, fix only that gap during implementation. Otherwise treat #12 as an existing baseline.

## 2.5 Modal focus work is still only partial and remains separate

`ModalFocusManager` exists and Settings already uses it, but Project/Tag/Subtask/Repeat Ends and other flows still contain manual `aria-hidden`/focus lifecycle code.

That is tracker Problem #2 / ID13 territory, not Priority 2.

ID20 must:

```text
preserve ModalFocusManager
preserve Settings integration
not regress modal behavior
not claim Problem #2 solved
```

If Project/Tag shared-core work touches modal open/close methods, keep focus behavior equivalent unless ID13 has been implemented separately first.

---

# 3. Current Priority 2 Diagnosis on `main`

## #6 — Runtime persistence patch layer is still real

`js/storage/ui-persistence-bindings.js` still replaces final runtime behavior for:

```text
Task checkbox completion
Task submit
Subtask submit
Task Link / Unlink / Delete
Project save/delete
Tag save/delete
Workspace init / sort / group / direction / viewType
Task hierarchy drag commit
Custom reminder save/delete
```

This file is still the actual final owner for many commands even though the corresponding UI components contain other implementations.

Problem #6 remains valid and high priority.

## #7 — Repeat monkey-patching is still real

`js/storage/repeat-storage.js` still decorates/replaces:

```text
TodoStorageMappers.taskToRow
TodoStorageMappers.repeatToRow
TodoStorageMappers.repeatFromRow
TodoStorageMappers.taskFromRow
AppDataService.buildTask
AppDataService.writeTaskAggregate
```

It also installs Repeat repair behavior and transports recurrence state through the hidden `repeat.__repeatState` channel.

`js/storage/data-service-repeat.js` still replaces:

```text
AppDataService.toggleTaskStatus
```

with the real recurrence-aware completion implementation.

Problem #7 remains valid and is the highest-risk logic migration.

## #8 — AppState still mixes reads and writes

Current `state.js` still owns/mixes:

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
```

`task-relations.js` still captures AppState mutation methods at load time:

```text
AppState.addTask
AppState.updateTask
AppState.deleteTask
AppState.deleteProject
```

and replaces/extends mutation behavior.

Problem #8 remains valid.

## #9 — Project/Tag UI remains duplicated

Current:

```text
js/components/sidebar-projects.js
js/components/sidebar-tags.js
```

still mirror each other for rendering, node construction, modal setup, icon selection, parent picker, view type, save/delete and close logic.

Problem #9 remains valid.

## #10 — Reminder ownership still crosses UI/data layers

Current `AppDataService.resolveReminders()` reads custom reminder data from:

```text
ScheduleComponent.customReminders
```

Current `AppPersistence.hydrateState()` writes hydrated reminder definitions directly into:

```text
ScheduleComponent.customReminders
```

Reminder definition save/delete methods still live in:

```text
js/storage/data-service-taxonomy.js
```

Problem #10 remains valid.

## #11 — Loading architecture is now even more important

The app currently has multiple load mechanisms:

```text
1. static classic <script> list in index.html
2. BOOTSTRAP_SCRIPTS + runtime script injection in app.js
3. SettingsComponent.loadBackupScript() for ID19 Backup/Restore
4. late Object.assign()/method installation on live globals
```

Therefore Problem #11 remains valid, and ID20 must include Backup/Restore in the final explicit module graph.

## #12 — Implemented baseline, verification still required

Current staged error classification exists. Preserve it; do not restart this work.

## #13/#14 — One-source UI issues remain and ID19 added one more

Known current examples:

```text
Workspace menu:
  static structure exists, then WorkspaceControls.buildLayeredMenu() replaces it

Task Project picker:
  hard-coded Personal/Work rows exist, then JS rebuilds the menu

Completed header:
  static div is replaced at runtime with a button

Task hierarchy action menu:
  stable Link/Unlink controls are inserted/upgraded after startup

Repeat Ends:
  stable stylesheet + row/modal are installed at runtime

Settings Backup/Restore:
  stable Data section is created at runtime by SettingsComponent.ensureBackupUi()
```

Problems #13/#14 remain valid.

The rule remains:

> **Every stable structure has one authoritative owner and correct semantics when interactive. Dynamic data-driven DOM is fine; duplicate placeholder/replacement ownership is not.**

---

# 4. Non-Negotiable Data and Behavior Invariants

No architecture cleanup is allowed to break or reset user data.

Preserve:

```text
TodoListDB name
IndexedDB VERSION = 1
all current store names
all current records
seed-once behavior
intentional empty-database behavior
Task/Subtask CRUD
one-level Subtask hierarchy
Subtask Project inheritance
Task Link / Unlink
Task hierarchy drag indent/outdent/reparent/reorder
Project/Tag recursive hierarchy drag
Project/Tag cycle prevention
Project/Tag sortOrder persistence
custom Task order
List/Kanban parity
Sort / direction / Group By
saved Project/Tag viewType
Timeline remains disabled
Theme persistence
custom reminder definitions + task-reminder relations
Repeat recurrence behavior
Repeat Ends behavior
familySlotId semantics
```

Existing tracker-plan behavior that must remain intact:

```text
ID15 family-aware filtering
ID16 safe Task Project/Tag DOM rendering
ID17 Subtask Tag taxonomy order
ID19 full Backup/Restore
```

Important durable Repeat fields must survive unchanged:

```text
TASKS.familySlotId
TASK_REPEAT_RULES.endType
TASK_REPEAT_RULES.endDate
TASK_REPEAT_RULES.endCount
TASK_REPEAT_RULES.seriesId
TASK_REPEAT_RULES.occurrenceNumber
TASK_REPEAT_RULES.anchorDate
TASK_REPEAT_RULES.anchorDay
TASK_REPEAT_RULES.anchorMonth
```

Backup-specific invariants:

```text
backup exports raw durable store rows, not rebuilt AppState objects
backup includes every current store
backup includes theme
restore validates before clearing anything
restore uses one all-store readwrite transaction
failed DB restore leaves existing DB unchanged
theme changes only after successful DB commit
successful restore reloads through normal startup/hydration
app_meta initialized/dataVersion safety is preserved
```

No IndexedDB schema/version bump is expected for this refactor.

---

# 5. Global Safety Rules

## 5.1 Persist first, mutate memory second

For every domain command:

```text
calculate durable change
        ↓
IndexedDB transaction
        ↓ success
controlled in-memory synchronization
        ↓
render
```

Do not mutate live domain state first and hope persistence succeeds afterward.

## 5.2 Move one ownership boundary at a time

For every currently patched command:

```text
move final behavior to real owner
+
remove that exact old override in same milestone
+
remove duplicate listener/install path
+
static audit ownership
+
then manually verify
```

Never test a new implementation while an older patch can still shadow it.

## 5.3 Preserve Backup/Restore before architecture deletion

Before deleting or moving any storage/service module used by ID19, explicitly map how Backup/Restore depends on it.

In particular preserve:

```text
AppDataService.whenIdle()
TodoDbSchema.STORES
TodoDb.withTransaction()
TodoRepositories.getAll/clear/putMany
normal startup hydration after restore
```

## 5.4 Every mutation verification includes refresh

Immediate UI success is not enough.

For important writes:

```text
mutate
refresh
confirm durable state remains
```

## 5.5 No browser automation

Do not run:

```text
Chrome/Edge automation
Puppeteer
Playwright
Selenium
headless browser tests
```

Use:

```text
static source/reference audits
small pure-JS checks when useful
manual browser/phone verification
```

## 5.6 Keep source modules focused

Prefer responsibility-focused modules around or below ~300 lines where practical. Do not replace many small patches with one giant architecture file.

---

# 6. Phase 0 — Establish the Current-Main Baseline

Before changing architecture, record a clean rollback point and verify the current behavior inventory.

## 6.1 Treat #12 as existing infrastructure

Do not rewrite bootstrap error classification.

Verify current `app.js` still has distinct stages for:

```text
MODULE_LOAD
INTEGRATION
DATABASE_OPEN
DATABASE_REPAIR
HYDRATION
UI_INIT
```

Record this as the diagnostic baseline that later phases must preserve.

## 6.2 Resolve overlap status explicitly

Current status entering ID20:

```text
ID17 code: implemented — preserve it
ID19 code: implemented — preserve it
ID13: separate/partial — do not claim it solved
#12 code: implemented — preserve and verify it
```

## 6.3 Baseline manual smoke test before refactor

At minimum verify current application can:

```text
create/edit/complete a plain Task
create/edit a Subtask
create/reorder Project/Tag
save Sort/Group/view setting
create/use a custom reminder
complete a repeating Task
Create Backup
select/validate a Backup for Restore
```

Do not start architecture migration if current `main` is already broken in one of those critical paths; record/fix the baseline separately first.

---

# 7. Phase 1 — Runtime Ownership / Parity Inventory

Before deleting patches, write down the actual final behavior of every command.

Minimum inventory:

| Command | Current source owner | Current final/shadow implementation | Durable path | Critical behavior |
|---|---|---|---|---|
| Task checkbox | `task-renderer.js` | `ui-persistence-bindings.js` | `AppDataService.toggleTaskStatus` | rollback UI on failure, Repeat semantics |
| Main Task submit | Tasks component | persistence patch | create/update Task | keep form open on error |
| Subtask submit | Subtask editor | persistence patch | create/update Task | inherited Project |
| Link/Unlink/Delete | task actions | persistence patch | hierarchy/delete service | family rules + confirmation |
| Task hierarchy drag | drag component | persistence patch | hierarchy drag service | resequence + custom sort |
| Project CRUD | Project sidebar | persistence patch | taxonomy service | filter/count/picker sync |
| Tag CRUD | Tag sidebar | persistence patch | taxonomy service | filter/count/picker sync |
| Sort/Group/view | workspace controls | persistence patch | setting/entity service | only update UI state after success |
| Custom reminder save/delete | Schedule | persistence patch | reminder definition stores | relation cleanup |
| Repeat mapping/build | base storage/service | `repeat-storage.js` | Task/Repeat stores | series/anchor/familySlot state |
| Repeat completion | base service | `data-service-repeat.js` | aggregate transactions | recurrence family semantics |
| Backup idle boundary | no base owner | `data-service-backup.js` extension | AppDataService queue | snapshot/restore waits for writes |
| Backup module loading | Settings | `loadBackupScript()` | runtime script injection | Backup available on demand |

For each row identify before migration:

```text
real future owner
stores affected
transaction boundary
post-commit memory update
render/refresh behavior
error behavior
manual acceptance cases
```

---

# 8. Phase 2 — Make AppDataService's Core Surface Truthful Before Removing UI Patches

This phase is small but important because ID19 introduced `data-service-backup.js` as another late extension.

## 8.1 Move `whenIdle()` into the real AppDataService owner

Current:

```text
js/storage/data-service-backup.js
→ Object.assign(AppDataService, { whenIdle() ... })
```

Target:

```text
AppDataService directly owns whenIdle()
```

Required behavior:

```text
await AppDataService.whenIdle()
```

must resolve only after all earlier queued writes have settled.

Do not let `whenIdle()` bypass or corrupt the write queue.

## 8.2 Delete the backup-specific AppDataService extension only after callers move

After base service owns `whenIdle()`:

```text
delete js/storage/data-service-backup.js
remove its Settings lazy-load reference
```

Do not change Backup/Restore behavior in this milestone.

This removes a new small late-extension pattern before the larger patch cleanup.

---

# 9. Phase 3 — Remove `ui-persistence-bindings.js` Incrementally (#6)

Use atomic ownership slices.

## 9A — Task checkbox completion

Real owner:

```text
js/components/task-renderer.js
```

The checkbox created by the renderer must directly perform the final async command:

```text
remember requested state
→ disable control
→ await AppDataService.toggleTaskStatus(task.id)
→ refresh on success
→ restore previous UI state + report error on failure
```

Remove the checkbox clone/replacement patch in the same milestone.

Regression includes:

```text
plain root
plain Subtask
repeating root
repeating Subtask
historical uncomplete
parent-family completion
refresh persistence
```

## 9B — Main Task + Subtask submit

Real owners:

```text
Task editor component
SubtaskEditorComponent
```

Direct commands:

```text
new root → AppDataService.createTask({ parentTaskId: null })
edit Task → AppDataService.updateTask(...)
new Subtask → AppDataService.createTask({ parentTaskId })
edit Subtask → AppDataService.updateTask(...)
```

Preserve:

```text
submit disabled during write
form remains open on failure
all payload fields
Subtask Project inheritance
ID17 Tag ordering
render only after success
```

Remove both submit overrides immediately.

## 9C — Task action ownership

Real owner:

```text
js/components/task-actions.js
```

Direct service commands:

```text
Link → AppDataService.linkTaskToParent
Unlink → AppDataService.unlinkTask
Delete → AppDataService.deleteTaskFamily
```

Preserve family delete confirmation and hierarchy rules.

Remove matching runtime overrides immediately.

## 9D — Workspace persistence ownership

Real owner:

```text
js/components/workspace-controls.js
```

Move final behavior directly into it:

```text
init from AppState.settings
Sort/Group → await AppDataService.setSetting
Direction → await AppDataService.setSetting
Project/Tag viewType → await AppDataService.setEntityViewType
update component state only after successful persistence
```

Preserve Timeline disabled and custom-sort direction rules.

Remove Workspace overrides immediately.

## 9E — Task hierarchy drag ownership

Real owner:

```text
js/components/task-drag-commit.js
```

Direct path:

```text
preview
→ AppDataService.commitHierarchyDrag(...)
→ success
→ custom Sort state/UI
→ cleanup/render
```

Preserve hierarchy/group/date/Repeat re-anchoring semantics from the service layer.

Remove drag override immediately.

Audit the older `data-service-drag.js`; delete only after proving it has no active caller.

## 9F — Project/Tag persistence ownership

First make the existing Project and Tag owners truthful before merging them.

Project direct service paths:

```text
createProject
updateProject
deleteProject
```

Tag direct service paths:

```text
createTag
updateTag
deleteTag
```

Preserve:

```text
save disabled during write
form stays usable on error
hierarchy validation
picker refresh
current filter repair
counts
Task rerender
```

Remove Project/Tag persistence overrides before shared-core refactor.

## 9G — Custom reminder command ownership

Create focused reminder service responsibility, recommended:

```text
js/storage/data-service-reminders.js
```

Move out of taxonomy service:

```text
saveReminderDefinition
deleteReminderDefinition
```

Schedule calls the service directly.

This milestone should be coordinated with Phase 5 so the runtime reminder patch is removed rather than recreated elsewhere.

## 9H — Delete the runtime UI patch layer

After all unique behavior has moved:

```text
delete js/storage/ui-persistence-bindings.js
remove bindPersistentUiMutations()
remove bootstrap/load reference
```

Static gate:

```text
ui-persistence-bindings.js   gone
bindPersistentUiMutations    zero production refs
no checkbox clone patch
no Task/Subtask submit patch
no Project/Tag patch
no Workspace patch
no drag patch
no reminder patch
```

Problem #6 is complete only after relevant manual verification.

---

# 10. Phase 4 — Make Repeat Mapping, Build, Repair and Completion Explicit (#7)

This is the highest-risk phase. Do not mix it with ES-module conversion or Project/Tag UI consolidation.

## 10.1 Make base mappers Repeat-aware

`js/storage/mappers.js` becomes the real source of truth.

Task row directly includes:

```text
familySlotId
```

Repeat row directly includes:

```text
mode
custom interval/unit/weekdays/monthDays/yearDates
endType/endDate/endCount
seriesId
occurrenceNumber
anchorDate
anchorDay
anchorMonth
```

## 10.2 Remove hidden `__repeatState` transport

Do not encode state through a non-enumerable property on the Repeat object.

Use an explicit mapper contract, for example:

```text
repeatFromRow(row)
→ { repeat, repeatState }
```

or another explicit equivalent.

Hydration must pass rule/state explicitly into Task construction.

## 10.3 Make `buildTask()` explicitly Repeat-aware

Preserve exact current semantics:

```text
normalize Repeat through RepeatEngine
Repeat enabled + no date → Today
root familySlotId → null
Subtask familySlotId → preserve or create stable slot
same Repeat pattern + same date → preserve series state
changed pattern/date → fresh series state
Repeat removed → repeatState null
```

## 10.4 Make aggregate persistence explicitly Repeat-aware

The one real aggregate writer must handle:

```text
tasks
task_tags
reminder_definitions
task_reminders
task_repeat_rules
```

and explicit Repeat state.

## 10.5 Keep Repeat repair explicit

Preserve repair behavior for:

```text
missing Subtask familySlotId
repeating Task without due date
legacy/missing series/anchor state
transactional repair persistence
```

Do not attach the repair method through late monkey-patching.

## 10.6 Make recurrence-aware completion the only completion implementation

Use one explicit service owner, recommended focused completion module.

Preserve:

### Historical uncomplete

```text
completed occurrence → active historical occurrence
NO new recurrence generation
```

### Plain Subtask

```text
complete only that child
```

### Repeating Subtask

```text
complete old child
transfer Repeat ownership to immediate next child occurrence
same parent
same familySlotId
advance occurrence state
```

### Plain root

```text
complete root + current children as family
suppress child-driven recurrence when completion comes from parent
```

### Repeating root

```text
complete old family
old root loses Repeat ownership
create immediate next root occurrence
clone logical child slots
preserve familySlotId
transfer active child Repeat ownership correctly
```

### End rule

```text
when recurrence ends, complete old occurrence/family and create no next occurrence
```

### Calendar anchors

Preserve month-end fallback/return-to-anchor, leap behavior, custom week/month/year, inclusive end date and total-occurrence count semantics.

## 10.7 Remove Repeat patches atomically

Only after explicit parity implementation exists:

```text
delete js/storage/repeat-storage.js
delete js/storage/data-service-repeat.js
remove their load references
```

Static gate before testing:

```text
repeat-storage.js      gone
data-service-repeat.js gone
__repeatState          zero references
one mapper path
one completion path
```

Then run full Repeat manual parity.

---

# 11. Phase 5 — Move Reminder Definitions into State/Service Ownership (#10)

## 11.1 Hydrated read model owns reminder definitions

Add reminder definitions to the hydrated state snapshot, e.g.:

```text
AppState.reminderDefinitions
```

or an equivalent dedicated read-model container.

## 11.2 Persistence must stop writing into ScheduleComponent

Remove hydration behavior equivalent to:

```text
ScheduleComponent.customReminders = ...
```

Hydration writes only state/read-model data.

## 11.3 AppDataService must stop reading ScheduleComponent

`resolveReminders()` must resolve custom IDs through state/domain data rather than UI component state.

Data/service modules must have zero runtime dependency on Schedule UI.

## 11.4 Schedule derives reminder UI from state

Schedule may use a selector/helper, but it is not the durable owner.

## 11.5 Dedicated reminder commands

Keep:

```text
saveReminderDefinition
deleteReminderDefinition
```

in focused reminder service responsibility, not taxonomy service.

Preserve delete semantics:

```text
remove custom definition
remove task_reminders relations
remove ID from affected Task reminders in memory after commit
fallback to ['none'] where needed
rerender Schedule from updated state
```

Static gate:

```text
storage/data-service/persistence references to ScheduleComponent = 0
```

---

# 12. Phase 6 — Reduce AppState Write Surface Safely (#8)

Do this after UI persistence patches and Repeat patches are gone.

## 12.1 Move normalization to a pure boundary helper

Recommended:

```text
js/task-model.js
normalizeTask(task)
```

Use at controlled boundaries:

```text
hydration
Task build/update
mapper/state synchronization
```

Do not normalize/rebuild the entire live Task array as a side effect of a read selector.

If this also addresses tracker #19, leave #19 separate until reviewed/verified.

## 12.2 Controlled memory synchronization

Required invariant:

> Domain arrays/settings are mutated only by controlled post-transaction synchronization code.

A small state adapter is optional. Do not create abstraction for its own sake.

Useful operations may include:

```text
hydrate
upsert/remove Task(s)
upsert/remove Project
upsert/remove Tag
upsert/remove reminder definitions
set setting
resequence a Task scope
```

## 12.3 Refactor `task-relations.js`

Keep read/validation helpers:

```text
getTask
isSubtask
getSubtasks
getSubtaskIds
hasSubtasks
getRootTasks
validateParentTaskId
```

Remove the pattern that captures base AppState CRUD and replaces write methods.

## 12.4 Refactor `task-order.js`

Keep pure/read ordering calculations where useful; durable reordering belongs in services.

## 12.5 Remove public AppState write APIs only after callers are gone

Hard gate:

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

must not be removed until repository search proves no production caller or captured alias remains.

Expected final AppState responsibility:

```text
hydrated Tasks/Projects/Tags/reminderDefinitions/settings
current navigation/filter state
entity lookup
read-only selectors/counts
```

---

# 13. Phase 7 — Consolidate Project/Tag UI with Shared Core + Thin Wrappers (#9)

Do this only after Project/Tag persistence ownership is already direct and truthful.

Recommended structure:

```text
js/components/sidebar-taxonomy-core.js
js/components/sidebar-projects.js   thin Project wrapper/config
js/components/sidebar-tags.js       thin Tag wrapper/config
```

Shared core may own:

```text
recursive tree rendering
common node shell
icon state/picker helpers
parent-select population from TaxonomyOrder
view-type state
common async save/delete lifecycle
common refresh sequence
common modal field setup/cleanup where behavior is truly identical
```

Domain-specific configuration stays explicit:

```text
entity type
labels
DOM references
service commands
getters
Project-vs-Tag-specific dataset names
```

Do not create a giant function full of `if project else tag` branches.

Preserve:

```text
recursive hierarchy
create/edit/delete
add child
parent picker
viewType
counts
filter repair
mouse/touch drag
indent/outdent/reparent
cycle prevention
sortOrder persistence
ID16 safe Task-menu text rendering
ID17 Subtask Tag order
```

Modal note:

- preserve existing modal behavior;
- do not remove `ModalFocusManager`;
- do not claim ID13/Problem #2 complete as a side effect of this refactor.

---

# 14. Phase 8 — One-Source Stable UI Cleanup (#13/#14)

Rule:

> Stable UI gets one authoritative owner. Dynamic/data-driven DOM can remain dynamic when it has only one owner.

## 14.1 Completed header

Make the stable control the correct semantic button from its authoritative source.

Remove runtime element replacement from `ensureCompletedSectionToggle()`; keep only binding/state synchronization.

## 14.2 Task hierarchy action menu

Stable actions such as:

```text
Add Subtask
Link to Parent
Unlink
Delete
```

must have one owner. Remove placeholder/insertion duplication.

## 14.3 Task Project/Tag pickers

If taxonomy state always supplies choices:

```text
remove hard-coded Personal/Work Project rows
keep authoritative empty container
populate from state/order source
```

Do not ship sample rows that are immediately cleared.

## 14.4 Workspace menu

Choose one owner.

Recommended for the stable shell:

```text
final semantic markup in index.html
WorkspaceControls binds/updates it
```

Then remove `buildLayeredMenu()` replacement behavior.

If component-generated markup is intentionally retained instead, remove the duplicate static structure. Never keep both.

## 14.5 Repeat Ends

One owner only.

Dynamic component ownership is acceptable, but:

```text
schedule-repeat-end.css must load normally
runtime stylesheet injection must be removed
```

If stable row/modal markup is moved to HTML, remove component creation. If component owns it, do not also add duplicate static markup.

## 14.6 NEW from ID19 — Settings Backup/Restore section

Current stable Backup/Restore controls are created by:

```text
SettingsComponent.ensureBackupUi()
```

Under #13/#14, choose one owner.

Recommended:

```text
put stable Data / Create Backup / Restore Backup / status / confirmation markup in index.html
SettingsComponent only binds and updates it
remove ensureBackupUi() DOM construction
```

Preserve:

```text
inline restore confirmation
no nested restore modal
aria-live status
same-file re-selection
busy-state disabling
Settings focus manager behavior
```

This cleanup is architectural only; do not change Backup/Restore product behavior.

---

# 15. Phase 9 — Isolated Native ES-Module / Bootstrap Cutover (#11)

Do this last, after business ownership is stable.

Do not combine business-logic changes with module syntax/loading changes.

## 15.1 Pre-cutover gate

Before conversion:

```text
ui-persistence patch gone
Repeat patches gone
reminder ownership clean
AppState write surface reduced
Project/Tag shared core stable
one-source markup cleanup stable
Backup/Restore still passes manual regression
#12 staged error reporting still working
```

Create a clean Git rollback checkpoint.

## 15.2 Final target

Prefer one application entry:

```html
<script type="module" src="js/bootstrap.js"></script>
```

Final state must have no production dependency on:

```text
long hand-ordered classic script list
BOOTSTRAP_SCRIPTS
loadScript() runtime injection
SettingsComponent.loadBackupScript()
SettingsComponent.ensureBackupServices() as script loader
late Object.assign method installation for behavior ownership
```

## 15.3 Backup/Restore must become part of explicit imports

ID19 modules must enter the same dependency graph as the rest of the app:

```text
backup-validation
backup-service
AppDataService.whenIdle
schema/db/repositories
Settings UI
```

No special runtime backup loader should remain.

Backup must still work even though its loading strategy changes.

## 15.4 Dependency direction

Use explicit imports/exports with:

```text
pure models/helpers
        ↑
state/read model + storage/domain helpers
        ↑
AppDataService / persistence
        ↑
UI components
        ↑
bootstrap composition
```

Data/service modules must not import UI components.

Avoid circular dependencies; keep pure domain helpers independent.

## 15.5 Suggested conversion order

```text
1. pure helpers/models
2. db schema/db/repositories/mappers
3. state/read helpers
4. persistence/data services + backup services
5. UI components
6. bootstrap composition
7. remove temporary global bridges
```

## 15.6 No framework/bundler expansion

Native browser ES modules are sufficient.

Do not add React/Vite/Webpack/etc. just for this cleanup.

## 15.7 Preserve #12 through cutover

The final module bootstrap must still distinguish:

```text
module/import/integration failure
database open failure
repair failure
hydration failure
UI initialization failure
```

Do not regress to one generic storage error.

---

# 16. Phase 10 — Final Dead-Code / Ownership Audit

After all phases, search for obsolete architecture.

## #6

Expected:

```text
ui-persistence-bindings.js gone
bindPersistentUiMutations zero production refs
```

## #7

Expected:

```text
repeat-storage.js gone
data-service-repeat.js gone
__repeatState zero refs
one Repeat mapper/build/write/repair path
one completion path
```

## #8

Expected:

```text
task-relations no longer captures AppState CRUD
UI has no domain writes through old AppState mutation APIs
AppState read selectors do not mutate/rebuild state during reads
```

## #9

Expected:

```text
Project/Tag duplicated common UI behavior lives once in shared core
thin wrappers/configuration remain understandable
```

## #10

Expected:

```text
data/service/persistence refs to ScheduleComponent = 0
reminder commands no longer live in taxonomy service
```

## #11

Expected:

```text
one module entry
BOOTSTRAP_SCRIPTS gone
app loadScript runtime injection gone
Settings backup runtime script injection gone
data-service-backup.js gone
no late behavior patch installation required for load order
```

## #12

Expected:

```text
staged error reporting still present after module cutover
original exceptions remain available in console
storage-specific error shown only for storage failures
```

## #13/#14

Audit at least:

```text
workspace menu
Task Project picker placeholder rows
Completed header
Task hierarchy action controls
Repeat Ends stylesheet/markup
Settings Backup/Restore markup
```

Each must have one owner.

## Extra drag audit

Audit:

```text
js/storage/data-service-drag.js
```

against the final hierarchy drag path. Delete only if proven unused.

---

# 17. Recommended Commit / Rollback Milestones

Do not implement ID20 as one commit.

Recommended sequence:

```text
M0  current-main baseline + ownership inventory
M1  move AppDataService.whenIdle into real owner; remove data-service-backup extension
M2  Task checkbox ownership; remove patch slice
M3  Task/Subtask submit ownership; remove patch slice
M4  Task actions ownership; remove patch slice
M5  Workspace persistence ownership; remove patch slice
M6  Task hierarchy drag ownership; remove patch slice
M7  Project/Tag persistence ownership; remove patch slice
M8  reminder service/state foundation; remove reminder patch slice
M9  delete ui-persistence-bindings.js + install references (#6)
M10 explicit Repeat mapper/build/write/repair
M11 explicit Repeat completion; delete Repeat patch files (#7)
M12 reminder ownership final audit (#10)
M13 AppState mutation-surface cleanup (#8)
M14 Project/Tag shared-core consolidation (#9)
M15 one-source markup cleanup including Backup/Restore (#13/#14)
M16 isolated ES-module cutover including Backup modules (#11)
M17 final dead-code/reference audit + #12 regression verification
```

Neighboring milestones may be combined only when rollback and ownership remain obvious.

---

# 18. Manual Regression Matrix

Run relevant subsets after each milestone and the full set before completion.

## 18.1 Tasks

- Create root Task in Inbox.
- Create while Project filter is active.
- Create while Tag filter is active.
- Edit title/description.
- Edit priority.
- Date/time.
- built-in reminder.
- custom reminder.
- Repeat.
- Complete/uncomplete.
- Delete.
- Refresh after important writes.

## 18.2 Subtasks / hierarchy

- Add/edit Subtask.
- inherited Project remains correct.
- ID17 Tag order remains correct.
- Link root to parent.
- Unlink child.
- Delete child.
- Delete parent family.
- root reorder.
- Subtask reorder.
- root → Subtask.
- Subtask → root.
- reparent.
- Group lane moves where supported.
- refresh persistence.

## 18.3 ID15 family-aware filtering invariant

Verify List and Kanban:

```text
parent matches → show parent family
parent does not match, child matches → child appears standalone visually
stored parentTaskId remains unchanged
```

## 18.4 ID16 safety invariant

Create Project/Tag names/icons containing HTML-sensitive characters and verify Task pickers display literal text correctly; no markup injection regression.

## 18.5 ID17 ordering invariant

Reorder and reparent Tags, then verify:

```text
sidebar order
main Task Tag picker order
Subtask Tag picker order
```

remain consistent after refresh.

## 18.6 Repeat full parity

Plain Task:

- complete/uncomplete, no recurrence.

Repeating root:

- Daily/Weekly/Monthly/Yearly.
- Custom day/week/month/year.

Repeating Subtask:

- direct completion creates next child occurrence under same parent.
- familySlotId stays stable.

Parent/child combinations:

- repeating/non-repeating combinations.
- multiple child slots.

Repeat Ends:

- Never.
- On Date inclusive.
- After 1.
- After N.

Historical undo:

- uncomplete old occurrence does not create another future occurrence.

Calendar anchors:

- month-end fallback and return to anchor.
- leap behavior.
- custom month/year dates.

## 18.7 Projects / Tags

For both:

- create/edit/delete.
- add child.
- parent picker.
- recursive hierarchy.
- drag reorder/indent/outdent/reparent.
- cycle prevention.
- refresh persistence.
- saved viewType.
- counts/filter repair.

## 18.8 Workspace

- List/Kanban.
- Sort Custom/Due Date/Priority/Name/Created Date.
- Asc/Desc where applicable.
- Group None/Priority/Date/Project/Tag.
- hierarchy drag returns Sort to Custom.
- saved Project/Tag viewType survives refresh.
- Timeline remains unavailable.

## 18.9 Reminders

- built-in reminder.
- multiple reminders.
- create custom reminder.
- custom reminder survives refresh.
- reuse on another Task.
- delete custom reminder.
- relations removed from affected Tasks.
- fallback to None when needed.

## 18.10 NEW mandatory Backup/Restore regression

This is required because ID20 changes service/module/Settings ownership used by ID19.

Create representative data including:

```text
Projects/Tags with hierarchy/order
root + Subtasks
custom reminders
Repeat rule + current series state
Sort/Group/view settings
theme
```

Then:

1. Create Backup.
2. Confirm JSON is downloaded.
3. Change/delete several pieces of data.
4. Restore the backup.
5. Confirm reload.
6. Confirm pre-backup state returns.
7. Confirm Repeat occurrence/series state did not restart.
8. Confirm empty backup restore does not reseed sample data.
9. Confirm invalid JSON is rejected without data change.
10. Confirm corrupted/orphan backup is rejected before destructive transaction.
11. Confirm cancel performs no restore.

## 18.11 Startup/#12 regression

Verify representative failure categories when practical during development:

```text
module/integration failure → module/integration message
database open failure → database message
hydration failure → hydration message
UI init failure → UI-init message
```

No startup failure may clear existing database data.

---

# 19. Static Definition of Done by Problem

## #6

```text
ui-persistence-bindings.js deleted
bootstrap/install refs removed
former commands live in real owners
no shadow handlers remain
```

## #7

```text
Repeat-aware mapper explicit
Repeat-aware task build/write explicit
Repeat repair explicit
one recurrence-aware completion owner
repeat-storage.js deleted
data-service-repeat.js deleted
__repeatState removed
```

## #8

```text
AppState primarily hydrated read model/selectors
controlled post-transaction state synchronization
old write APIs removed only after zero callers
no read selector mutates/rebuilds entire state
```

## #9

```text
common Project/Tag UI behavior implemented once
thin explicit wrappers/configuration
hierarchy/drag/modal behavior preserved
```

## #10

```text
reminder definitions hydrated into state/read model
Schedule reads from state
service/persistence never read/write ScheduleComponent
reminder commands in focused service responsibility
```

## #11

```text
one native module entry
explicit dependency graph
no BOOTSTRAP_SCRIPTS runtime loader
no Settings backup runtime script loader
no late behavior installation needed for load order
```

## #12

```text
existing staged error classification preserved through all refactors
representative categories manually verified
```

## #13

```text
known static placeholders/rebuilt structures removed
no stable structure is immediately discarded by another owner
```

## #14

```text
stable controls have one owner
semantics correct when interactive
component-generated stable DOM allowed only when component is sole owner
```

---

# 20. Tracker Update Rule

Problems #6–#14 must be handled **individually**.

Do not mark them all `[x]` merely because ID20 implementation exists.

For each problem:

```text
code migration complete
+
static ownership/reference audit passes
+
important manual verification passes
→ then mark [x]
```

Special case #12:

- code is already present before ID20 implementation;
- mark it complete only after its static/manual verification gate is satisfied and after confirming later module work did not regress it.

Do not edit unrelated tracker items as part of ID20.

---

# 21. Out of Scope

Do not expand ID20 into unrelated tracker work unless a concrete regression requires it:

```text
#2 full modal-focus completion / ID13
#5 real notification delivery
#15 hidden-sidebar focus
#16 keyboard semantics for generated Project/Tag rows
#17 mobile pinch zoom
#18 Project picker visual hierarchy indentation
#19 read-selector mutation as standalone tracker completion
#20 Repeat rendering mutation
#21 rerender optimization
#22 date formatting deduplication
#23 strict Repeat date parser
#25 broad test suite
#26 placeholder app navigation cleanup
#27 CSS import cleanup
```

Problem #24 Backup/Restore is **already implemented** and is not to be redesigned under ID20. Only architecture integration necessary to preserve it while solving #8/#11/#13/#14 is in scope.

Do not add cloud backup, accounts, encryption, or sync.

---

# 22. Final Definition of Done

ID20 is complete only when all of the following are true:

1. Current-main behavior was inventoried before migrations.
2. Existing #12 staged bootstrap errors were preserved rather than rewritten unnecessarily.
3. ID17 Tag-order behavior remains intact.
4. ID19 Backup/Restore remains fully functional and data-safe.
5. `AppDataService.whenIdle()` has a real owner; `data-service-backup.js` is no longer a late extension.
6. Every former `ui-persistence-bindings.js` command lives in its real owner.
7. `ui-persistence-bindings.js` and `bindPersistentUiMutations` are gone.
8. Repeat mapping/build/write/repair/completion are explicit and the two Repeat patch files are gone.
9. Repeat parity is manually verified, including family-slot, series/occurrence and Repeat Ends semantics.
10. Reminder definitions belong to state/service data, not Schedule UI.
11. AppState no longer acts as a second public domain-write service.
12. Project/Tag duplicated UI behavior uses a shared core with understandable thin wrappers/configuration.
13. Stable duplicate/runtime-replaced structures have one authoritative owner, including the ID19 Settings Backup/Restore section.
14. The final module/bootstrap model has one explicit native ES-module entry and no runtime ordered script injection, including no special Backup loader.
15. Bootstrap error classification still works after module conversion.
16. No IndexedDB schema reset or destructive migration occurred.
17. Full regression passes and important mutations survive refresh.
18. Backup export/restore regression passes after all architecture/module changes.
19. Problems #6–#14 are marked complete individually only after their own verification gates pass.

Final architecture:

```text
UI command
    ↓
AppDataService / focused domain service
    ↓
IndexedDB transaction
    ↓ success
controlled memory synchronization
    ↓
AppState/read selectors
    ↓
render
```

Final loading architecture:

```text
index.html
   ↓ one native module entry
bootstrap
   ↓ explicit imports
models / state / storage / services / backup / UI
```

There should be no requirement to know that a later script secretly replaces a method, no separate hidden Backup loader, and no duplicate stable UI that exists only to be replaced after startup.
