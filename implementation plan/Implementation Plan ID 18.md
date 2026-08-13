# Implementation Plan ID 18 — Safe Architecture Consolidation for Problems #6–#14

> **Revision status:** Revised after `implementation plan/Implementation Plan Review ID 18.md`.
>
> The review's central safety criticisms are accepted. This revision changes the migration order, makes runtime-patch removal atomic, delays AppState API removal until all callers migrate, narrows the Project/Tag and markup goals, and isolates the ES-module cutover from business-logic changes.

## Goal

Solve **Priority 2 Problems #6 through #14** from `problem is need to be fixed.md` without changing product behavior or user data:

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

These problems overlap, but they must **not** be implemented as one big-bang rewrite.

The governing migration rule is:

> **Move one ownership boundary at a time. Whenever behavior is moved from a runtime patch into its real owner, remove the corresponding old override in the same milestone before testing. Never verify a migrated command while an older patch can still shadow it.**

Target command flow:

```text
UI component
    ↓ command
AppDataService
    ↓ transaction
IndexedDB / repositories / mappers
    ↓ only after success
controlled in-memory state synchronization
    ↓
AppState read model / selectors
    ↓
render
```

A developer reading an owning file must be able to see the real runtime behavior. No later-loaded file should secretly replace that behavior.

---

# 1. Why This Revision Was Necessary

The first version of ID 18 had a sound destination architecture but an unsafe migration order.

Two concrete hazards exist in the current application.

## 1.1 AppState mutation APIs are still startup/runtime dependencies

`js/task-relations.js` currently captures mutation methods at module load:

```text
AppState.addTask
AppState.updateTask
AppState.deleteTask
AppState.deleteProject
```

It then uses those captured functions while replacing/augmenting AppState behavior.

Other service code also still depends on AppState mutation methods after successful persistence. For example, Project/Tag service flows currently use AppState mutation helpers as part of memory synchronization.

Therefore this is unsafe:

```text
remove AppState mutation API first
→ refactor callers later
```

It can break startup before the UI initializes.

Correct transition:

```text
A. Introduce pure helpers / controlled memory-sync path
   WITHOUT deleting old AppState APIs

B. Migrate UI + AppDataService callers

C. Refactor task-relations/task-order so they no longer capture/replace writes

D. Static search proves no production caller remains

E. Only then remove old AppState mutation APIs
```

This is now a hard removal gate in this plan.

## 1.2 New owner implementations can be hidden by old patches

Example:

```text
TasksComponent.submitTask updated correctly
        ↓
ui-persistence-bindings.js loads later
        ↓
TasksComponent.submitTask replaced again
```

A manual test could pass while actually exercising the old persistence patch, not the newly migrated owner.

Repeat has the same danger:

```text
mappers.js updated
        ↓
repeat-storage.js loads later
        ↓
mapper methods replaced/decorated again
```

Therefore this plan uses **atomic migrate + unshadow + verify** milestones.

---

# 2. Confirmed Current Architecture Problems

## 2.1 `ui-persistence-bindings.js` is currently the real owner of many commands

Current file:

```text
js/storage/ui-persistence-bindings.js
```

It replaces/decorates at least:

```text
TasksComponent.createTaskCard / checkbox completion
TasksComponent.submitTask
SubtaskEditorComponent.submit
TasksComponent.handleTaskActionLinkParent
TasksComponent.handleTaskActionUnlink
TasksComponent.handleTaskActionDelete
SidebarComponent.saveProject
SidebarComponent.deleteProject
SidebarComponent.saveTag
SidebarComponent.deleteTag
WorkspaceControls.init
WorkspaceControls.handleSettingsPanelClick
WorkspaceControls.toggleDirection
WorkspaceControls.setViewType
WorkspaceControls.handleMainMenuClick
TasksComponent.commitTaskDrag
ScheduleComponent.submitCustomReminder
ScheduleComponent.deleteCustomReminder
```

This creates misleading source ownership:

```text
component file
    contains AppState-only / incomplete implementation

runtime patch
    contains actual persistent implementation
```

A particularly clear example is Task completion: the original card receives an AppState-only checkbox listener, then the persistence patch clones/replaces the checkbox to remove that listener and attach the real persistent one.

Problem #6 is therefore real and high priority.

---

## 2.2 Repeat behavior is installed by monkey-patching after base modules exist

`js/storage/repeat-storage.js` currently replaces/decorates:

```text
TodoStorageMappers.taskToRow
TodoStorageMappers.repeatToRow
TodoStorageMappers.repeatFromRow
TodoStorageMappers.taskFromRow
AppDataService.buildTask
AppDataService.writeTaskAggregate
```

It also adds Repeat repair behavior.

The current mapper path transports recurrence state through a hidden/non-enumerable property:

```text
repeat.__repeatState
```

`js/storage/data-service-repeat.js` then replaces:

```text
AppDataService.toggleTaskStatus
```

with the actual recurrence-aware completion semantics.

Problem #7 is real and very high risk because these patches contain essential behavior, not optional enhancements.

---

## 2.3 AppState is both read model and write/domain service

Current `js/state.js` mixes:

```text
seed data
hydration
Task normalization
Task ordering
Project CRUD
Tag CRUD
Task CRUD
Task completion mutation
filter matching
date helpers
counts
Project hierarchy helpers
Tag hierarchy helpers
navigation/filter state
```

Then:

```text
js/task-relations.js
js/task-order.js
```

extend/replace more AppState behavior after definition.

Problem #8 is real, but the fix should be **minimal and dependency-driven**, not abstraction for its own sake.

---

## 2.4 Reminder ownership crosses the UI/data boundary

Current data service resolves custom reminder IDs by reading:

```text
ScheduleComponent.customReminders
```

Current hydration writes reminder data directly into:

```text
ScheduleComponent.customReminders
```

Reminder save/delete methods also currently live inside `data-service-taxonomy.js`, which is the wrong responsibility.

Target ownership:

```text
IndexedDB reminder_definitions
        ↓ hydrate
AppState.reminderDefinitions
        ↓ read
Schedule UI
```

and:

```text
Schedule command
        ↓
AppDataService reminder module
        ↓
IndexedDB
        ↓ success
memory synchronization
        ↓
Schedule rerender from state
```

Problem #10 is real and high priority.

---

## 2.5 Project and Tag UI duplicate the same workflows

Current files:

```text
js/components/sidebar-projects.js
js/components/sidebar-tags.js
```

Both implement their own versions of:

```text
hierarchy rendering
node construction
create/edit modal setup
icon selection
parent picker population
view-type selection
save
delete
close
```

The goal is not a giant generic component full of Project-vs-Tag branches.

Target:

```text
shared taxonomy core
    + thin Project configuration/wrapper
    + thin Tag configuration/wrapper
```

The success condition is **one implementation of duplicated behavior**, not mandatory deletion of both wrapper files.

---

## 2.6 Startup has two script-loading systems and late mixin installation

Current `index.html` loads a long static classic-script list.

Then `js/app.js` has another ordered list:

```text
BOOTSTRAP_SCRIPTS
```

and dynamically injects scripts sequentially.

After that it installs late modules with `Object.assign()` onto live component objects.

This makes final behavior depend on exact load order and timing.

Problem #11 is valid, but the module cutover must be isolated from business-logic migration.

---

## 2.7 Bootstrap error reporting collapses unrelated failures into storage errors

Current startup places these under one broad error path:

```text
dynamic script loading
integration assertions
late mixin installation
IndexedDB open
hydration
Repeat repair
persistence binding installation
UI initialization boundary
```

A missing JS integration can therefore result in a message saying local storage could not be opened.

Problem #12 should be addressed **before** risky architecture migrations.

---

## 2.8 Confirmed duplicate/runtime-replaced UI sources

Examples:

### Workspace menu

`index.html` contains one complete workspace menu, while `WorkspaceControls.buildLayeredMenu()` immediately replaces it with another structure.

### Task Project menu

`#menu-project` contains hard-coded Personal/Work rows, but Task initialization clears/rebuilds the picker from state.

### Completed header

Static HTML begins as a `div`; rendering later replaces it with a semantic collapse button.

### Task hierarchy actions

Permanent Link/Unlink actions are inserted after startup rather than having one stable authoritative owner.

### Repeat Ends stylesheet/markup

The Repeat Ends component injects a stylesheet link and creates stable UI structures at runtime.

Problems #13/#14 should be reframed as:

> **Every UI structure must have one authoritative owner/source of truth and correct semantics when it becomes interactive. Dynamic component-owned DOM is allowed; duplicate placeholder markup that is immediately replaced is not.**

---

# 3. Non-Negotiable Data and Behavior Invariants

This architecture refactor must preserve:

```text
TodoListDB database name
IndexedDB VERSION = 1
all existing store names
all existing user records
seed-once behavior
Task/Subtask CRUD
one-level Task/Subtask hierarchy rule
Subtask Project inheritance
Task hierarchy Link / Unlink
Task hierarchy drag indent/outdent/reparent/reorder
Project/Tag recursive hierarchy drag
Project/Tag cycle prevention
Project/Tag sortOrder persistence
custom Task order
List/Kanban parity
Group By behavior
saved Project/Tag viewType
family-aware filtering from ID 15
safe Project/Tag Task-menu rendering from ID 16
Repeat behavior from ID 9
Repeat Ends date/count semantics
custom reminder definition persistence
custom reminder relation cleanup
Timeline remains disabled
Theme persistence behavior remains unchanged
```

No IndexedDB schema/version migration is expected.

Important row fields already used by the app must remain intact:

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

---

# 4. Global Safety Rules for Every Milestone

## 4.1 Persist first, mutate memory second

For every domain command:

```text
calculate next durable state
        ↓
IndexedDB transaction
        ↓ success
update in-memory state
        ↓
render
```

Do not modify live AppState first and then try to persist.

## 4.2 Never verify shadowed behavior

Whenever a runtime override is migrated:

```text
move final behavior to owner
+
remove that exact old override
+
remove any duplicate listener/install path
+
then verify
```

No milestone is complete while two active implementations exist.

## 4.3 Every mutation test includes refresh persistence

After a successful command:

```text
perform mutation
refresh browser
confirm result remains
```

Immediate UI success alone is insufficient for persistence refactors.

## 4.4 Do not reconstruct complex behavior from memory

Before deleting an old Repeat/persistence patch:

```text
map existing behavior
implement explicit equivalent
remove shadowing patch
then test parity
```

## 4.5 No browser automation

Do not use Chrome/Edge/Puppeteer/Playwright/Selenium/headless browser automation for this project.

Use:

```text
static source/reference checks
small pure-JS checks when helpful
manual browser/phone verification
```

## 4.6 Keep modules focused

New/refactored source modules should remain small and responsibility-focused. Preserve the project's preference for source files around or below ~300 lines where practical; split by responsibility rather than creating a giant architecture file.

---

# 5. Phase 0 — Resolve Overlapping Pending Plans Before ID 18

ID 18 touches files also covered by pending plans:

```text
ID 13 — modal focus / aria-hidden / inert lifecycle
ID 17 — Subtask Tag taxonomy order
```

Preferred execution:

```text
implement + manually verify ID 13
implement + manually verify ID 17
then begin ID 18
```

Why:

- ID 18 will substantially change Tasks, Subtask editor, Project/Tag UI, Schedule, and bootstrap.
- Leaving ID 13/17 pending risks making their plans describe obsolete code.

If ID 18 must begin before either plan is complete, explicitly absorb that plan's acceptance criteria into the relevant ID 18 milestone and mark the older plan as superseded. Do not silently invalidate it.

Existing behavior from already implemented plans is a regression invariant:

```text
ID 15 family-aware filtering
ID 16 safe Task Project/Tag DOM rendering
```

---

# 6. Phase 1 — Improve Bootstrap Error Reporting First (#12)

Do this while the existing classic-script/dynamic-loader architecture still exists.

The purpose is diagnostic safety for all later phases.

## 6.1 Split startup into explicit stages

Recommended categories:

```text
MODULE_LOAD
INTEGRATION
DATABASE_OPEN
DATABASE_REPAIR
HYDRATION
UI_INIT
```

Exact enum names can differ, but failures must no longer all report as storage-open failures.

## 6.2 Keep original exceptions

Each stage should:

```text
console.error(stage, originalError)
```

and show a concise user-facing message appropriate to that stage.

Examples:

```text
MODULE_LOAD
"A required application module could not be loaded."

INTEGRATION
"Application modules loaded, but one integration is incomplete."

DATABASE_OPEN
"TodoListDB could not be opened. Existing data was not cleared."

DATABASE_REPAIR
"Stored data could not be repaired safely. Existing data was not cleared."

HYDRATION
"Stored data could not be loaded into the application."

UI_INIT
"Data loaded, but the interface could not finish starting."
```

## 6.3 Do not combine this with ES-module conversion

This phase should make the **current** loader safer first.

### Phase 1 verification

- missing dynamic module maps to module/integration error, not database error;
- IndexedDB open failure maps to database-open error;
- hydration failure maps to hydration error;
- underlying error remains visible in console;
- no data is cleared on startup failure.

---

# 7. Phase 2 — Build the Runtime Ownership / Parity Inventory

Before removing patches, record the final current behavior of every mutation command.

This becomes the migration checklist and prevents lost semantics.

At minimum inventory:

| Command | Current UI caller/owner | Current runtime shadow/final implementation | Service / persistence path | Important memory/render behavior |
|---|---|---|---|---|
| Task checkbox | `task-renderer.js` | `ui-persistence-bindings.js` clones/rebinds checkbox | `AppDataService.toggleTaskStatus` | rollback checkbox on failure, refresh |
| Task create/edit | `tasks.js` | persistence binding replaces submit | `createTask` / `updateTask` | disable submit, keep form on error |
| Subtask create/edit | `subtask-editor.js` | persistence binding replaces submit | `createTask` / `updateTask` | preserve parent/project semantics |
| Task Link/Unlink/Delete | `task-actions.js` | persistence binding replaces handlers | hierarchy/delete services | confirm parent-family delete, refresh |
| Task hierarchy drag | `task-drag-commit.js` | persistence binding replaces commit | `commitHierarchyDrag` | custom sort setting, rerender |
| Project create/edit/delete | Project sidebar owner | persistence binding replaces save/delete | taxonomy service | filter/view/count synchronization |
| Tag create/edit/delete | Tag sidebar owner | persistence binding replaces save/delete | taxonomy service | task picker/count synchronization |
| Taxonomy drag | sidebar taxonomy drag modules | service-side taxonomy drag | taxonomy-drag service | recursive order/parent persistence |
| Sort/Group settings | `workspace-controls.js` | persistence binding replaces handlers | `setSetting` | AppState.settings + render |
| Project/Tag viewType | `workspace-controls.js` | persistence binding replaces `setViewType` | `setEntityViewType` | per-entity view persistence |
| Custom reminder save/delete | Schedule reminder code | persistence binding replaces methods | reminder-definition persistence | selected reminders + relation cleanup |
| Repeat task completion | Task checkbox command | `data-service-repeat.js` replaces base completion | Repeat aggregate transactions | recurrence family semantics |
| Repeat mapping/build | storage/service base files | `repeat-storage.js` replaces methods | mappers + task aggregate | series/anchor/familySlot state |

During implementation, expand this inventory if another final runtime override is discovered.

### Ownership inventory gate

Do not delete a runtime patch method until its row in the inventory has:

```text
new owner
new direct service path
stores affected
post-transaction memory behavior
refresh/render behavior
error behavior
manual acceptance cases
```

---

# 8. Phase 3 — Remove `ui-persistence-bindings.js` Incrementally (#6)

Use atomic slices. After each slice, the old override for that exact command must be removed **before testing**.

## 8A — Task checkbox completion ownership

### Owner

```text
js/components/task-renderer.js
```

### Required change

Create the checkbox once with the real handler:

```text
change
    ↓
disable / remember requested state
    ↓
await AppDataService.toggleTaskStatus(task.id)
    ↓ success
refreshAfterTaskMutation()
```

On failure:

```text
restore previous checkbox state
re-enable checkbox
report persistence error
```

Remove the checkbox clone/replacement override from `ui-persistence-bindings.js` in the same milestone.

### Verify

- plain root complete/uncomplete;
- plain subtask complete/uncomplete;
- repeating root completion;
- repeating subtask completion;
- parent completion family behavior;
- failed write restores checkbox;
- refresh preserves result.

---

## 8B — Main Task + Subtask submit ownership

### Owners

```text
js/components/tasks.js
js/components/subtask-editor.js
```

### Required direct behavior

Main Task:

```text
editing → AppDataService.updateTask
new root → AppDataService.createTask({ parentTaskId: null })
```

Subtask:

```text
editing → AppDataService.updateTask
new child → AppDataService.createTask({ parentTaskId })
```

Preserve:

```text
submit disabled while awaiting write
modal/form remains open on failure
payload keeps date/time/reminders/repeat/project/priority/tags
Subtask Project remains inherited/locked
render only after successful write
```

Remove both submit overrides from `ui-persistence-bindings.js` in the same milestone.

---

## 8C — Task action ownership

### Owner

```text
js/components/task-actions.js
```

Implement real async handlers directly:

```text
Link   → AppDataService.linkTaskToParent
Unlink → AppDataService.unlinkTask
Delete → AppDataService.deleteTaskFamily
```

Preserve:

- completed tasks are not eligible parents;
- root with children cannot be linked as child until hierarchy rule allows it;
- family delete confirmation text/behavior;
- action menus close at correct time;
- error leaves durable state unchanged;
- refresh after successful mutation.

Remove Link/Unlink/Delete overrides immediately.

---

## 8D — Workspace settings/view ownership

### Owner

```text
js/components/workspace-controls.js
```

Move final persistence behavior into the component:

```text
init
    reads AppState.settings

sort/group changes
    await AppDataService.setSetting
    update local component state after success
    sync UI + render

sort direction
    await AppDataService.setSetting('sortDirection', next)

Project/Tag viewType
    await AppDataService.setEntityViewType(...)
```

Preserve:

- `custom` sort disables direction;
- Group By options;
- Project/Tag saved viewType;
- Timeline disabled;
- error leaves old setting/view active.

Remove all Workspace overrides from the patch in the same milestone.

---

## 8E — Task drag commit ownership

### Owner

```text
js/components/task-drag-commit.js
```

Make the real commit path explicit:

```text
drag preview
    ↓
AppDataService.commitHierarchyDrag(...)
    ↓ success
WorkspaceControls.sortKey = custom
sync UI
cleanup + render
```

Preserve hierarchy service semantics from:

```text
js/storage/data-service-hierarchy.js
```

including:

```text
Link/Unlink validation
root/subtask movement
sibling resequencing
familySlotId changes
Project inheritance
Group By metadata moves
Repeat re-anchoring when Date group changes
sortKey persistence to custom
```

Remove the `TasksComponent.commitTaskDrag` patch immediately.

### `data-service-drag.js` audit

There is also an older/root-oriented `AppDataService.commitTaskDrag` implementation.

Do not delete it merely because it looks old.

First perform a repository/reference audit proving it has no active caller/final ownership. If unused, remove it in the final dead-code phase or in this milestone with evidence.

---

## 8F — Project/Tag save/delete ownership

Initially migrate persistence into the current Project/Tag UI owners before doing the duplication consolidation.

Why:

> First make current source ownership truthful; then refactor duplication. Do not combine persistence ownership migration and generic-UI redesign in one risky change.

Project direct commands:

```text
createProject
updateProject
deleteProject
```

Tag direct commands:

```text
createTag
updateTag
deleteTag
```

Preserve:

```text
save button disabled while writing
form remains usable on failure
parent hierarchy validation
render Projects/Tags after success
Task Project/Tag picker refresh
current filter repair/sync
counts refresh
Task rerender
```

Remove Project/Tag save/delete overrides immediately after direct owner behavior is installed.

---

## 8G — Custom reminder command ownership + Problem #10 foundation

Do not leave reminder persistence as the final hidden patch.

Create a focused service module, recommended:

```text
js/storage/data-service-reminders.js
```

Move from `data-service-taxonomy.js`:

```text
saveReminderDefinition
deleteReminderDefinition
```

Then make Schedule call those service methods directly.

At this milestone also establish state-owned reminder definitions as described in Phase 5 below, so the UI patch can be removed completely rather than temporarily recreating the UI/data coupling.

Remove:

```text
ScheduleComponent.submitCustomReminder override
ScheduleComponent.deleteCustomReminder override
```

in the same milestone.

---

## 8H — Delete the runtime patch layer

After 8A–8G:

Static audit must prove `ui-persistence-bindings.js` no longer contains unique behavior.

Then:

```text
delete js/storage/ui-persistence-bindings.js
remove bindPersistentUiMutations call
remove bootstrap load entry/reference
```

Search expectations:

```text
ui-persistence-bindings.js        gone
bindPersistentUiMutations         zero production references
persistent checkbox clone patch   zero references
```

Problem #6 is not complete until all of those are true and migrated commands are manually verified.

---

# 9. Phase 4 — Make Repeat Persistence and Completion Explicit (#7)

This is the highest-risk logic migration. Treat it as a dedicated checkpoint.

## 9.1 Make `mappers.js` the actual mapper source of truth

`js/storage/mappers.js` must directly encode/decode:

### Task row

```text
familySlotId
```

alongside existing Task fields.

### Repeat row

Directly persist:

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

### Hydration contract

Do not use:

```text
repeat.__repeatState
```

as a hidden side channel.

Use an explicit result shape, for example:

```text
repeatFromRow(row)
→ { repeat, repeatState }
```

or an equivalent explicit mapper contract.

Then `taskFromRow()` receives the Repeat rule and state explicitly.

---

## 9.2 Make task building explicitly Repeat-aware

The real task-building implementation must directly preserve current semantics:

```text
normalize Repeat through RepeatEngine
Repeat enabled + no due date → Today
root familySlotId → null
subtask familySlotId → preserve existing slot or create a stable slot
same repeat pattern + same due date → preserve series/occurrence/anchor state
changed repeat pattern/date → create fresh initial Repeat state/series
Repeat removed → repeatState = null
```

There must not be a simpler base build method that is later replaced.

---

## 9.3 Make aggregate persistence explicitly Repeat-aware

The real `writeTaskAggregate()` path directly writes/removes:

```text
tasks
task_tags
reminder_definitions
task_reminders
task_repeat_rules
```

using the explicit Repeat mapper/state.

There must be one aggregate writer contract.

---

## 9.4 Preserve Repeat repair as an explicit startup/service operation

Repair behavior must preserve:

```text
missing subtask familySlotId → generate
repeating task without due date → Today
missing/legacy Repeat series state → recreate safely
preserve existing valid series where possible
persist repaired Task/Repeat rows transactionally
```

Place the repair function in an explicit Repeat/service/persistence module; do not add it by monkey-patching a service object after load.

---

## 9.5 Make completion recurrence the one real completion command

Recommended focused module:

```text
js/storage/data-service-completion.js
```

It should define the actual completion command used by `AppDataService`, not wrap/replace another completion implementation later.

Preserve **exact current semantics**:

### Uncomplete completed occurrence

```text
completed occurrence → active historical occurrence
no new recurrence generation
```

### Plain Subtask completion

```text
mark that child complete only
```

### Repeating Subtask completion

```text
old child completes
old child loses Repeat ownership
next child occurrence is created immediately
same parent
same stable familySlotId
next occurrenceNumber/series/anchor semantics preserved
```

### Plain root completion

```text
root + current children complete as a family
child Repeat execution is suppressed when completion is parent-triggered
```

### Repeating root completion

```text
old root family completes
old root loses Repeat ownership
next root occurrence created immediately
child templates cloned into next family
familySlotId preserves logical child slots
active Repeat owner preferred for a slot
child Repeat ownership transferred correctly
```

### Repeat end reached

```text
complete old occurrence/family
create no next occurrence
remove Repeat ownership where current behavior does so
```

### Calendar anchor behavior

Preserve:

```text
monthly fallback to last valid day
return to anchor day when later month allows it
yearly/leap-date behavior
custom week/month/year intervals
end date inclusive semantics
After N = total occurrence-count semantics
```

---

## 9.6 Atomic Repeat patch removal

Once explicit mapper/build/write/repair/completion behavior is installed:

```text
delete js/storage/repeat-storage.js
delete js/storage/data-service-repeat.js
remove both bootstrap references
remove any method-decoration/install code
```

**Do this before Repeat parity testing.**

Otherwise tests may still exercise the old patch.

Static expectations:

```text
repeat-storage.js       gone
data-service-repeat.js  gone
__repeatState           zero references
one task completion implementation
one Repeat mapper implementation
```

---

# 10. Phase 5 — Complete Reminder Data Ownership Cleanup (#10)

This phase may begin in 8G because reminder persistence must be unshadowed atomically. Complete the ownership cleanup here.

## 10.1 State owns hydrated reminder definitions

Add:

```text
AppState.reminderDefinitions
```

or equivalent read-model storage.

Hydration must pass reminder definitions into the state snapshot.

Remove direct hydration writes to:

```text
ScheduleComponent.customReminders
```

## 10.2 Schedule derives custom reminder UI from state

Schedule should read current custom definitions from AppState and map them to UI values.

It may expose a small selector/helper such as:

```text
getCustomReminderDefinitions()
```

but Schedule must not be the durable owner.

## 10.3 `AppDataService.resolveReminders()` cannot read UI components

Replace:

```text
ScheduleComponent.customReminders.find(...)
```

with state/reminder-domain lookup.

Unknown custom reminder IDs should still be validated safely.

## 10.4 Dedicated reminder service responsibility

Keep reminder definition commands outside taxonomy service:

```text
saveReminderDefinition
deleteReminderDefinition
```

Preserve delete semantics:

```text
custom definition removed
all task_reminders relations using it removed
affected in-memory Task.reminders remove the ID
empty reminder list falls back to ['none']
Schedule refreshes from updated state
```

Do not build a large `ReminderModel` abstraction unless a small pure mapper/helper is genuinely useful.

### Static gate

Search storage/data-service modules for:

```text
ScheduleComponent
```

Expected after Problem #10:

```text
zero data-layer references to ScheduleComponent
```

---

# 11. Phase 6 — Reduce AppState Write Surface Safely (#8)

Do this **after** the UI persistence patch and Repeat monkey-patches are gone.

The purpose is not to introduce layers for aesthetics. The purpose is to make AppState a truthful read model rather than a second write service.

## 11.1 Move Task normalization to a pure boundary helper

Recommended:

```text
js/task-model.js
```

with a pure:

```text
normalizeTask(task)
```

Use it at controlled boundaries:

```text
hydration
task build/update
mapper/state synchronization
```

Do not normalize/rebuild the entire live Task array during a selector/render call.

If this naturally fixes tracker Problem #19, do **not** mark #19 complete unless its own behavior is separately reviewed/verified.

## 11.2 Seed separation is optional

Moving `AppSeedData` to:

```text
js/seed-data.js
```

is reasonable but not a prerequisite for Problem #8.

Do it only if it makes the final module ownership clearer.

## 11.3 Controlled memory synchronization

A separate public `AppStateStore` object is **optional**.

Required invariant:

> Only controlled post-transaction code may mutate the hydrated domain arrays/settings.

Acceptable implementation options:

```text
small AppStateStore adapter
or
small internal state-sync functions used by AppDataService/persistence
```

Do not create a large abstraction that merely renames direct assignments.

Useful primitives may include:

```text
hydrate(snapshot)
upsert/remove Task(s)
upsert/remove Project
upsert/remove Tag
replace/upsert/remove reminder definitions
setSetting
replace/resequence Task scope
```

## 11.4 Refactor `task-relations.js`

It should become read/validation logic, not a mutation override layer.

Keep useful reads such as:

```text
getTask
isSubtask
getSubtasks
getSubtaskIds
hasSubtasks
getRootTasks
validateParentTaskId
```

Move write behavior to AppDataService/hierarchy service.

Remove the pattern of capturing base AppState CRUD methods and replacing them.

## 11.5 Refactor `task-order.js`

Keep ordering calculations/helpers where useful:

```text
getSiblingTasks
getSiblingTaskIds
root/sibling ordering calculations
```

Move durable mutation ownership to AppDataService hierarchy/drag commands.

If in-memory resequencing helpers remain, they should be controlled synchronization helpers, not public UI domain commands.

## 11.6 AppState mutation API removal gate

Only remove these after repository search proves no production caller remains:

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

Also audit for equivalent aliases captured in closures.

### Expected final AppState responsibility

```text
hydrated Projects/Tags/Tasks/reminderDefinitions/settings
current filter/navigation read/UI state
basic entity lookup
read-only selectors/count helpers
```

Hierarchy/order/domain writes belong elsewhere.

---

# 12. Phase 7 — Consolidate Project/Tag UI with Shared Core + Thin Wrappers (#9)

Do this after Project/Tag persistence ownership is already truthful.

## 12.1 Recommended structure

```text
js/components/sidebar-taxonomy-core.js
js/components/sidebar-projects.js   thin Project config/wrapper
js/components/sidebar-tags.js       thin Tag config/wrapper
```

Deleting the wrapper files is optional.

## 12.2 Shared core responsibilities

Centralize duplicated behavior such as:

```text
render recursive taxonomy tree
build common node shell
populate icon state
populate parent select from TaxonomyOrder
apply view-type state
open create/edit modal common lifecycle hooks
save command common async/error pattern
delete command common async/error pattern
close common modal state
refresh affected sidebar/task UI
```

## 12.3 Configuration remains explicit

Project config should explicitly define things like:

```text
entityType = project
labels: Project / Sub-project
ID/dataset names
Project-specific DOM references
Project getter/service commands
```

Tag config should explicitly define:

```text
entityType = tag
labels: Tag / Sub-tag
ID/dataset names
Tag-specific DOM references
Tag getter/service commands
```

Avoid a giant core filled with scattered:

```text
if (type === 'project') ... else ...
```

Use small configuration-driven differences.

## 12.4 Reuse existing service-side taxonomy architecture

`data-service-taxonomy-drag.js` already has useful Project/Tag generic service logic.

Do not duplicate drag ordering/cycle rules in the new UI core.

Keep:

```text
TaxonomyOrder
service-side taxonomy drag
```

as hierarchy/order authorities.

## 12.5 Preserve behavior

Regression requirements:

```text
recursive Project hierarchy
recursive Tag hierarchy
create/edit/delete
add child
parent picker
viewType
sidebar counts
current filter sync/repair
mouse/touch taxonomy drag
indent/outdent
move between parents
cycle prevention
sortOrder persistence
ID 16 safe text rendering
ID 17 Subtask Tag ordering
```

Success condition:

> duplicated behavior has one shared implementation; Project/Tag-specific configuration remains understandable.

---

# 13. Phase 8 — One-Source UI Markup Cleanup (#13 and #14)

Use this rule:

> **Every structure has one authoritative owner/source of truth and correct semantics/accessibility when interactive. Component-generated DOM is valid when the component is its only owner.**

Do not force all permanent DOM into `index.html`.

## 13.1 Completed section header

This is a stable control and should start as the correct semantic button.

Recommended static structure:

```html
<button type="button"
        class="section-header-title completed-section-toggle"
        aria-controls="completed-task-list"
        aria-expanded="true">
  ...
</button>
```

Then remove runtime element replacement from:

```text
ensureCompletedSectionToggle()
```

Keep only binding/state synchronization logic.

## 13.2 Task hierarchy action menu

Stable actions such as:

```text
Add Subtask
Link to Parent
Unlink
Delete
```

should have one owner.

Recommended: place the stable menu action buttons in the authoritative markup and remove runtime insertion by `ensureTaskHierarchyActionButtons()`.

Dynamic visibility/disabled state remains JS responsibility.

## 13.3 Task Project/Tag picker placeholders

If JS always populates the Project/Tag pickers from current taxonomy state:

```text
remove hard-coded Personal/Work placeholder rows
keep empty authoritative container
```

Do not ship static sample items only to clear them immediately.

## 13.4 Workspace menu

Choose exactly one owner.

Recommended for this stable permanent shell:

```text
final semantic menu/panel markup in index.html
WorkspaceControls only binds/updates it
```

Then remove `buildLayeredMenu()` replacement behavior.

If implementation instead chooses component-generated markup, remove the duplicate static version completely. Do not retain both.

## 13.5 Repeat Ends UI

The important requirement is one owner, not mandatory static HTML.

Acceptable options:

```text
A. move stable Repeat Ends row/modal markup into index.html
or
B. keep it wholly owned/created once by ScheduleRepeatEnd component
```

In either case:

```text
load schedule-repeat-end.css normally from the document stylesheet list
remove runtime stylesheet injection
```

Do not maintain both static and generated versions.

## 13.6 Transient/data-driven DOM remains dynamic

These are not problems simply because they are generated:

```text
Task cards
Project/Tag tree rows
calendar day cells
parent picker options
Tag/Project dynamic choices
transient task parent picker
```

The problem is duplicate ownership/runtime replacement, not DOM APIs themselves.

---

# 14. Phase 9 — Isolated JavaScript Module/Bootstrap Cutover (#11)

Problem #11 remains part of ID 18 because the requested cleanup includes it, but it must be executed as an **isolated final milestone** after Problems #6–#10 and #12–#14 are stable.

Do not mix business-logic changes into this phase.

## 14.1 Pre-cutover gate

Before module conversion:

```text
full manual regression of current behavior
all runtime persistence patches removed
Repeat patches removed
AppState write surface reduced
reminder ownership clean
Project/Tag shared core stable
one-source markup cleanup complete
```

Create a clean Git rollback point.

## 14.2 Target loading model

Final `index.html` should have one application entry such as:

```html
<script type="module" src="js/bootstrap.js"></script>
```

No long hand-sorted classic script list.

No:

```text
BOOTSTRAP_SCRIPTS
loadScript() runtime injection
late Object.assign installation onto live components
```

## 14.3 Dependency direction

Use explicit imports/exports with this dependency rule:

```text
pure models/helpers
        ↑ imported by
state/read model + storage/domain helpers
        ↑ imported by
AppDataService / persistence
        ↑ imported by
UI components
        ↑ composed by
bootstrap
```

Equivalently:

```text
UI may depend on service/state selectors
service may depend on state-sync/storage/domain
storage/domain must NOT depend on UI
bootstrap composes everything
```

Avoid circular imports by keeping domain helpers pure and keeping UI references out of data/service modules.

## 14.4 Suggested conversion order

Within the isolated module milestone:

```text
1. pure helpers/models
2. db schema/db/repositories/mappers
3. state/read helpers
4. persistence/data services
5. UI components
6. bootstrap composition
7. remove temporary global bridges
```

A temporary compatibility export may be used only during the cutover if strictly necessary, but the final state should not depend on global method patching.

## 14.5 No framework or bundler required

Use native browser ES modules only.

Do not add React/Vite/Webpack/etc. merely for this cleanup.

## 14.6 Module cutover acceptance

After conversion:

```text
one module entry
no BOOTSTRAP_SCRIPTS
no dynamic script injection
no load-order Object.assign integrations
normal startup succeeds
all persistence/Repeat behavior survives refresh
```

Then run the full regression matrix again.

---

# 15. Phase 10 — Final Dead-Code / Runtime-Ownership Audit

After all earlier phases:

Search/remove obsolete compatibility code.

## 15.1 Runtime replacement audit

Search for patterns equivalent to:

```text
SomeComponent.someMethod = function ...
const baseX = ...; X = enhanced...
Object.assign(window.AppState, mutation mixin)
Object.assign(window.AppDataService, late patch)  // if no longer part of final module design
install...Enhancements() that replaces existing business methods
```

Not every assignment is wrong, but no final domain command should rely on late monkey-patching.

## 15.2 Required final searches

### Problem #6

```text
ui-persistence-bindings.js       gone
bindPersistentUiMutations        zero references
```

### Problem #7

```text
repeat-storage.js                gone
data-service-repeat.js           gone
__repeatState                    zero references
```

### Problem #8

UI/components should have zero domain-write calls to:

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

### Problem #10

Data/storage/service modules should have zero references to:

```text
ScheduleComponent
```

### Problem #11

```text
BOOTSTRAP_SCRIPTS                gone
runtime script injection         gone
one module entry                 present
```

### Problem #13/#14

Audit known duplicate/replaced structures:

```text
workspace menu
Task Project picker placeholder rows
Completed header
Task hierarchy actions
Repeat Ends stylesheet/markup ownership
```

Each must have one owner.

## 15.3 Old drag service

Audit:

```text
js/storage/data-service-drag.js
```

against the actual hierarchy drag path.

If it has no final caller, delete it. Do not keep two competing drag persistence implementations.

---

# 16. Recommended Commit / Rollback Milestones

Do not implement ID 18 as one commit.

Recommended checkpoints:

```text
M0  prerequisites ID13/ID17 resolved or explicitly absorbed
M1  bootstrap error categories (#12)
M2  runtime ownership/parity inventory
M3  Task checkbox persistence ownership + remove override
M4  Task/Subtask submit ownership + remove overrides
M5  Task action ownership + remove overrides
M6  Workspace persistence ownership + remove overrides
M7  Task drag ownership + remove override
M8  Project/Tag persistence ownership + remove overrides
M9  reminder service/state ownership + remove reminder overrides
M10 delete ui-persistence-bindings.js and bootstrap reference (#6)
M11 explicit Repeat mapper/build/write/repair
M12 explicit Repeat completion + delete Repeat patch files (#7)
M13 AppState mutation-surface cleanup (#8)
M14 Project/Tag shared-core consolidation (#9)
M15 one-source markup cleanup (#13/#14)
M16 isolated native ES-module cutover (#11)
M17 final dead-code/reference audit
```

Neighboring milestones may be combined only when the resulting diff remains small enough to reason about and rollback safely.

Git history is the rollback mechanism. Do not perform destructive database migrations as part of this plan.

---

# 17. Manual Regression Matrix

Run relevant subsets after each milestone and the full matrix before declaring ID 18 complete.

## 17.1 Tasks

- Create root Task in Inbox.
- Create root Task while inside a Project filter.
- Create root Task while inside a Tag filter.
- Edit Task title/description.
- Edit priority None/Low/Medium/High.
- Save date.
- Save time.
- Save built-in reminder.
- Save custom reminder.
- Save Repeat.
- Delete Task.
- Complete/uncomplete Task.
- Refresh after each important mutation.

## 17.2 Subtasks / hierarchy

- Add Subtask.
- Edit Subtask.
- Subtask Project remains inherited from parent.
- Subtask Tag picker follows taxonomy order (ID 17 invariant).
- Link root Task to parent.
- Unlink Subtask.
- Delete Subtask.
- Delete parent family.
- Drag root reorder.
- Drag Subtask reorder.
- Drag root → Subtask.
- Drag Subtask → root.
- Reparent Subtask.
- Move between Group By lanes where supported.
- Refresh and confirm hierarchy/order persists.

## 17.3 Family-aware filtering — ID 15 invariant

```text
Parent matches filter
→ show parent family

Parent does not match, child matches
→ show matching child as standalone presentation row
→ stored parentTaskId remains unchanged
```

Test in List and Kanban for Today and Tag filters.

## 17.4 Repeat — full parity matrix

### Plain Task

- complete;
- uncomplete;
- no recurrence generated.

### Repeating root

- Daily;
- Weekly;
- Monthly;
- Yearly;
- Custom day/week/month/year.

Expected:

```text
old occurrence completes
new occurrence created immediately
Repeat moves to new occurrence
series/occurrence state advances correctly
```

### Repeating Subtask

- direct child completion creates next child occurrence;
- remains under same parent;
- familySlotId remains stable.

### Parent/child combinations

- non-repeating parent + non-repeating child;
- non-repeating parent + repeating child;
- repeating parent + non-repeating child;
- repeating parent + repeating child;
- multiple child slots;
- completed historical child template vs active Repeat owner.

### Repeat Ends

- Never;
- On Date inclusive;
- After 1;
- After N;
- no extra occurrence after end.

### Historical undo

Uncomplete an old completed occurrence:

```text
must not create another future occurrence
```

### Anchor/calendar behavior

- Jan 31 monthly → valid February day → returns to 31 in March;
- leap-day/year behavior;
- custom month day fallback;
- custom year date behavior.

## 17.5 Projects / Tags

For both domains:

- create;
- edit;
- delete;
- add child;
- parent picker;
- recursive hierarchy;
- drag reorder;
- indent;
- outdent;
- reparent;
- cycle prevention;
- refresh persistence;
- saved viewType;
- counts;
- current filter repair after delete.

Also verify:

- main Task Project/Tag pickers follow taxonomy order;
- Subtask Tag picker follows taxonomy order;
- ID 16 safe text rendering remains intact.

## 17.6 Workspace

- List.
- Kanban.
- Sort Custom/Due Date/Priority/Name/Created Date.
- Ascending/Descending where applicable.
- Group None/Priority/Date/Project/Tag.
- custom hierarchy drag sets Sort back to Custom.
- Project/Tag saved viewType survives refresh.
- Timeline remains unavailable.

## 17.7 Reminders

- built-in reminder selection;
- multiple reminders;
- create custom reminder;
- custom reminder appears after refresh;
- reuse custom reminder on another Task;
- delete custom reminder;
- relation removed from affected Tasks;
- Task with no remaining reminder falls back to None;
- no data-service read of Schedule UI state.

## 17.8 Startup

- existing IndexedDB hydrates without reseeding;
- initialized empty database remains empty;
- accurate module/integration/storage/hydration/UI-init error classification;
- no startup error clears database;
- final ES-module entry starts correctly.

---

# 18. Static Verification Gates by Problem

## #6 — `ui-persistence-bindings.js`

Definition of done:

```text
runtime patch file deleted
bootstrap reference deleted
all former commands implemented in real owners
no duplicate/shadowed handlers
```

## #7 — Repeat monkey-patching

Definition of done:

```text
Repeat-aware mappers explicit
Repeat-aware task build/write explicit
Repeat repair explicit
one recurrence-aware completion implementation
repeat-storage.js deleted
data-service-repeat.js deleted
__repeatState deleted
```

## #8 — AppState responsibility reduction

Definition of done:

```text
UI domain writes use AppDataService
AppState old CRUD mutation APIs removed only after no callers remain
task-relations no longer captures/replaces CRUD
durable hierarchy/order writes remain in services
normalization occurs at boundaries, not as read-side array mutation
```

## #9 — Project/Tag UI duplication

Definition of done:

```text
common behavior implemented once in shared core
Project/Tag-specific configuration stays explicit
wrappers may remain if they improve clarity
all existing hierarchy/drag/modal behavior preserved
```

## #10 — UI dependency from data layer

Definition of done:

```text
reminder definitions hydrated into state
Schedule reads reminder definitions from state
data service never reads ScheduleComponent
persistence never writes ScheduleComponent
reminder commands live in focused reminder service responsibility
```

## #11 — module/bootstrap order

Definition of done:

```text
one native ES-module application entry
explicit import/export graph
no BOOTSTRAP_SCRIPTS
no runtime script injection
no late behavior installation needed for load order
```

## #12 — bootstrap errors

Definition of done:

```text
module/integration/database/repair/hydration/UI-init failures are distinguishable
original exception retained in console
storage error message is only used for real storage failures
```

## #13 — dead/duplicate HTML

Definition of done:

```text
no known static structure is immediately discarded/rebuilt by another owner
placeholder hard-coded taxonomy/task rows removed where state always renders them
workspace menu has one source
```

## #14 — runtime-upgraded permanent markup

Definition of done:

```text
stable interactive controls have one authoritative owner
semantics/accessibility are correct when interactive
no placeholder structure exists only to be replaced after startup
component-owned dynamic DOM remains allowed when it is the sole owner
```

---

# 19. Tracker Update Rule

Problems #6–#14 must be updated **individually** in:

```text
problem is need to be fixed.md
```

Do not mark all nine complete because ID 18 implementation exists.

For each problem:

```text
code migrated
+
static ownership/reference audit passes
+
important behavior manually verified
→ then mark [x]
```

If a problem is implemented but awaiting manual verification, leave `[ ]` and optionally record “implemented, awaiting verification” rather than claiming completion.

---

# 20. Out of Scope / Do Not Accidentally Mix In

Unless required by a concrete regression, do not expand this plan into unrelated tracker work such as:

```text
#5 real notification delivery
#15 sidebar focus lifecycle (except overlap with completed ID13 principles if relevant)
#16 keyboard Project/Tag row semantics
#17 mobile pinch zoom
#18 Project picker visual indentation
#20 render-time Repeat mutation
#21 rerender optimization
#22 date label deduplication
#23 strict Repeat date parsing
#24 JSON export/import
#25 general test suite expansion
#26 placeholder app navigation cleanup
#27 CSS import cleanup
```

If implementation naturally touches one of these, preserve behavior and record the overlap, but do not silently mark another tracker item solved without its own acceptance check.

---

# 21. Final Definition of Done

ID 18 is complete only when:

1. Pending overlapping plans ID 13 and ID 17 are resolved or explicitly absorbed.
2. Bootstrap failures are accurately categorized before risky migrations.
3. Every former `ui-persistence-bindings.js` command lives in its real owner and the corresponding old override was removed before verification.
4. `ui-persistence-bindings.js` and its bootstrap/install references are gone.
5. Repeat mappers/build/write/repair/completion are explicit and the old Repeat patch files are gone.
6. Recurrence parity is manually verified, including family-slot and Repeat Ends behavior.
7. Reminder definitions belong to state/service data, not Schedule UI.
8. AppState no longer acts as a second public domain-write service; old write APIs are removed only after caller audits pass.
9. Project/Tag duplicated UI behavior uses a shared core with understandable domain-specific configuration.
10. Known duplicate/runtime-replaced UI sources have one authoritative owner and correct semantics.
11. The isolated native ES-module cutover succeeds with one application entry and no dynamic ordered script loader.
12. No IndexedDB schema/version reset or destructive data migration occurred.
13. Full manual regression succeeds and important mutations survive refresh.
14. Problems #6–#14 are marked complete individually only after their own verification gates pass.

The final architecture should be understandable by reading the real owner of each behavior:

```text
UI command
    ↓
AppDataService
    ↓
IndexedDB transaction
    ↓ success
controlled memory sync
    ↓
AppState/read selectors
    ↓
render
```

There should be no requirement to know that “another file loaded later will replace this method.”
