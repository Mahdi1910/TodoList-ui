# Implementation Plan ID 18 — Consolidate Architecture, State, Persistence, Modules, Taxonomy UI, and Permanent Markup

## Goal

Solve **Priority 2 Problems #6 through #14** from `problem is need to be fixed.md` as one coordinated architecture cleanup:

```text
6. Remove ui-persistence-bindings.js runtime patch layer
7. Remove Repeat mapper/service monkey-patching
8. Reduce AppState responsibilities
9. Merge duplicated Project/Tag sidebar/modal logic
10. Remove UI-component dependency from the data layer
11. Simplify JavaScript module loading / bootstrap order
12. Improve bootstrap error reporting
13. Remove dead/duplicate HTML immediately replaced by JavaScript
14. Stop runtime-upgrading permanent markup
```

These problems overlap heavily. They should **not** be implemented as nine unrelated patches. The implementation must move the application toward one clear dependency direction:

```text
UI Components
    ↓ commands
AppDataService
    ↓ transactions
IndexedDB / Repositories / Mappers
    ↓ only after successful transaction
AppStateStore
    ↓ read model
AppState + read-only helpers/selectors
    ↑
UI renders from current state
```

The final application must have **one implementation for every command**. A developer reading the owning file should be able to see the real runtime behavior without knowing that another file will replace it later.

This is an architecture/maintainability refactor. It must preserve existing behavior and data. It must not redesign the product.

No application implementation is part of this plan commit.

---

# 1. Current Architecture — Confirmed Findings

## 1.1 `ui-persistence-bindings.js` changes the real application after components are defined

Current file:

```text
js/storage/ui-persistence-bindings.js
```

It replaces methods belonging to many unrelated components after all of those components already have their own implementations.

It currently replaces or decorates at least:

```text
TasksComponent.createTaskCard
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

This creates two versions of many actions:

```text
owner file says:
    mutate AppState directly

runtime patch says:
    call AppDataService / IndexedDB
```

Example:

```text
js/components/tasks.js
    submitTask() → AppState.updateTask/addTask

then later:
js/storage/ui-persistence-bindings.js
    replaces submitTask() → AppDataService.updateTask/createTask
```

Likewise the checkbox rendered by `task-renderer.js` initially gets an AppState-only change listener, then the persistence binding clones/replaces the checkbox solely to remove that listener and attach a persistent listener.

This is the central Problem #6.

Required end state:

> The owning UI method contains the real persistent behavior from the beginning. No runtime patch file is needed.

---

## 1.2 Repeat storage changes mapper/service behavior after definition

Current file:

```text
js/storage/repeat-storage.js
```

It captures existing mapper/service methods and replaces them:

```text
TodoStorageMappers.taskToRow
TodoStorageMappers.repeatToRow
TodoStorageMappers.repeatFromRow
TodoStorageMappers.taskFromRow
AppDataService.buildTask
AppDataService.writeTaskAggregate
```

It also adds:

```text
AppDataService.repairRepeatState
```

The final runtime mapper therefore cannot be understood by reading `mappers.js` alone.

Current Repeat hydration also uses a hidden side channel:

```text
repeat.__repeatState
```

which is added as a non-enumerable property and later consumed by the task mapper.

Required end state:

> Repeat-aware row formats, task hydration, task building, aggregate writing, and repair are explicit in their real modules. No mapper decoration and no hidden `__repeatState` transport.

---

## 1.3 Repeat task completion replaces the base completion service

Current file:

```text
js/storage/data-service-repeat.js
```

It finally replaces:

```text
AppDataService.toggleTaskStatus
```

with the real recurrence-aware behavior.

That implementation contains important existing product semantics which must be preserved:

```text
completed task → uncomplete historical occurrence only
plain subtask completion → complete that child
repeating subtask completion → complete old occurrence + create next child occurrence
plain parent completion → complete parent + all children
repeating parent completion → complete old family + create next family
repeat end reached → complete old occurrence/family and stop
familySlotId → preserve subtask template identity across repeating parent families
active repeating child template → preferred for a family slot
```

Required end state:

> The recurrence-aware completion implementation is the only explicit task-completion implementation. It must not replace a simpler implementation after load.

---

## 1.4 `AppState` currently mixes read state and domain mutation

Current `js/state.js` currently contains:

```text
seed data
hydration
normalization
array reordering
Project CRUD
Tag CRUD
Task CRUD
Task completion mutation
ID generation
filter matching
Today/date helpers
counts
Project hierarchy reads
Tag hierarchy reads
```

Then additional files further replace/extend AppState at runtime:

```text
js/task-relations.js
js/task-order.js
```

`task-relations.js` captures AppState's original mutation methods, replaces Task mutation behavior, and overrides Project deletion.

`task-order.js` adds both ordering selectors and in-memory mutation operations such as resequencing/rebasing.

This means AppState is simultaneously:

```text
read model
write service
normalizer
domain rule engine
hierarchy service
order service
seed source
filter service
```

Required end state:

> AppState is the hydrated in-memory model plus lightweight read/UI state. Domain writes go through AppDataService. Task hierarchy/order logic stays in dedicated helpers/services.

---

## 1.5 Reminder persistence currently depends on Schedule UI state

Current `AppDataService.resolveReminders()` reads:

```text
ScheduleComponent.customReminders
```

when validating/resolving custom reminder IDs.

Current persistence hydration does the reverse coupling:

```text
AppPersistence.hydrateState()
    ↓
ScheduleComponent.customReminders = ...
```

So the data layer knows a UI component, and the persistence layer writes directly into that UI component.

Required end state:

```text
IndexedDB reminder_definitions
    ↓ hydrate
AppState.reminderDefinitions
    ↓ read
ScheduleComponent
```

and:

```text
Schedule UI command
    ↓
AppDataService.save/deleteReminderDefinition
    ↓
IndexedDB
    ↓ success
AppStateStore updates reminderDefinitions
    ↓
Schedule rerenders from state
```

No AppDataService or persistence module may read/write `ScheduleComponent`.

---

## 1.6 Project and Tag UI are mirror implementations

Current files:

```text
js/components/sidebar-projects.js
js/components/sidebar-tags.js
```

Both independently implement essentially the same workflows:

```text
render hierarchy tree
create tree node
open create/edit modal
populate icon state
populate parent picker
populate view type selection
select icon
save
Delete
close modal
```

`sidebar.js` also binds Project and Tag events separately.

The duplication has already created examples where one side can be changed without automatically changing the other.

Required end state:

> One taxonomy UI implementation configured for `project` or `tag`, while preserving Project/Tag-specific labels, datasets, CSS compatibility, persistence semantics, and drag behavior.

---

## 1.7 Current loading is split between static scripts and a second dynamic list

`index.html` currently loads a long ordered list of classic scripts, ending in:

```text
js/app.js
```

Then `app.js` contains another ordered list:

```text
BOOTSTRAP_SCRIPTS
```

which loads more JavaScript sequentially by injecting `<script>` elements.

After those dynamic scripts load, `app.js` manually installs late mixins with `Object.assign()` onto live component objects.

Examples:

```text
TaskDragHierarchyMethods → TasksComponent
TaskTaxonomyMenuOrderMethods → TasksComponent
SidebarTaxonomyDrag*Methods → SidebarComponent
ScheduleRepeatEndMethods → ScheduleComponent
ScheduleRepeatValidationMethods → ScheduleComponent
```

This is fragile because behavior depends on exact timing/order and because files can modify globals at top level.

Required end state:

> One native ES-module dependency graph with explicit `import`/`export`. `index.html` should not maintain a hand-sorted JavaScript dependency list and `app.js` should not inject scripts sequentially.

---

## 1.8 Bootstrap error reporting currently collapses unrelated failures into “storage failed”

The entire sequence below currently lives under one broad `try/catch`:

```text
dynamic module loading
integration assertions
late Object.assign mixin installation
IndexedDB initialize
hydrate
Repeat repair
persistent UI binding installation
```

A missing JavaScript module or integration failure can therefore produce a user-facing message similar to:

```text
Local storage could not be opened.
```

That message may have nothing to do with storage.

Required end state:

> Startup stages have distinct error categories/messages and preserve the underlying exception in the console.

---

## 1.9 `index.html` contains confirmed duplicate/dead structures

### Workspace menu

`index.html` contains a complete Sort / Group / View menu, but `WorkspaceControls.buildLayeredMenu()` immediately replaces `#workspace-menu.innerHTML` with a different View + Sort & Group structure.

The static HTML is therefore not the real UI.

### Task Project picker

`#menu-project` contains hard-coded Personal and Work rows, but `TasksComponent.init()` immediately calls `renderProjectMenu()` and clears/rebuilds that menu.

The hard-coded rows are dead first-paint placeholders.

Required end state:

> Each permanent structure has one source of truth.

---

## 1.10 Permanent controls are being upgraded/inserted at runtime

Confirmed examples:

### Completed header

`index.html` starts with:

```text
<div class="section-header-title">...</div>
```

and `TaskRendererMethods.ensureCompletedSectionToggle()` later constructs a button, moves child nodes into it, and replaces the original header.

### Task hierarchy actions

`index.html` only contains:

```text
Add Subtask
Delete
```

while `TaskActionMethods.ensureTaskHierarchyActionButtons()` dynamically inserts permanent:

```text
Link to Parent
Unlink
```

### Repeat Ends UI

`schedule-repeat-end.js` dynamically creates:

```text
Ends row
Repeat validation container
Repeat Ends modal
```

and even dynamically inserts its stylesheet link.

These are stable application controls, not data-driven rows.

Required end state:

> Permanent controls exist as correct semantic markup at first paint. JavaScript binds behavior and updates state; it does not rebuild the permanent shell.

---

# 2. Target Architecture

Final dependency direction:

```text
index.html
    ↓ one module entry
bootstrap.js
    ↓ imports app start and classifies module-load failure
app.js
    ├── AppPersistence
    ├── AppDataService
    ├── AppState
    ├── ThemeManager
    └── UI components

UI component command
    ↓
AppDataService
    ↓
TodoDb + TodoRepositories + TodoStorageMappers
    ↓ successful transaction
AppStateStore
    ↓
AppState/read helpers
    ↓
render
```

Read-only helpers remain separated by responsibility:

```text
AppState             hydrated data + basic read/UI state
TaskRelations        task parent/child reads and validation helpers
TaskOrder            task sibling/root ordering calculations
TaxonomyOrder        Project/Tag hierarchy + sortOrder reads
TaskFilter           filter/count/family-aware presentation selection
RepeatEngine         pure recurrence calculations
ReminderModel        pure reminder-definition conversion helpers
```

Write ownership:

```text
Task CRUD                  AppDataService
Task completion/repeat     AppDataService completion module
Task hierarchy/drag        AppDataService hierarchy module
Project/Tag writes         AppDataService taxonomy module
Project/Tag drag           AppDataService taxonomy-drag module
Reminder definitions       AppDataService reminder module
Workspace settings         AppDataService settings module
In-memory synchronization  AppStateStore only after DB success
```

---

# 3. Non-Negotiable Behavioral Invariants

This refactor must preserve:

```text
existing IndexedDB database name/version/stores
existing user data
Task/Subtask CRUD behavior
one-level Task/Subtask hierarchy rule
parent Project propagation to subtasks
Task hierarchy drag behavior
Project/Tag recursive hierarchy drag behavior
custom task ordering
List/Kanban parity
Group By semantics
family-aware filtering from ID 15
Repeat recurrence semantics from ID 9
Repeat Ends semantics
custom reminder configuration persistence
Project/Tag hierarchy ordering
ID 16 safe Project/Tag Task-menu rendering
current Timeline-disabled behavior
current dark/light Theme persistence strategy
```

No IndexedDB schema version bump is expected for Problems #6–#14.

Existing rows already allow:

```text
TASKS.familySlotId
TASK_REPEAT_RULES.seriesId
TASK_REPEAT_RULES.occurrenceNumber
TASK_REPEAT_RULES.anchorDate
TASK_REPEAT_RULES.anchorDay
TASK_REPEAT_RULES.anchorMonth
endType/endDate/endCount
```

because IndexedDB object stores are not column-restricted.

---

# 4. Implementation Order — Do Not Big-Bang the Refactor

Use this order:

```text
Phase 1  Establish explicit state/domain boundaries
Phase 2  Make Repeat persistence/completion explicit
Phase 3  Move reminder definitions into state/service ownership
Phase 4  Move persistent behavior into owning UI components
Phase 5  Delete ui-persistence-bindings.js
Phase 6  Merge Project/Tag UI
Phase 7  Make permanent markup static / remove duplicate HTML
Phase 8  Convert to native ES modules
Phase 9  Split bootstrap stages/error reporting
Phase 10 Remove obsolete compatibility/dead modules and final audit
```

Why this order:

- remove hidden runtime behavior **before** changing the loader;
- make the source files truthful first;
- then ES-module conversion becomes mostly dependency wiring rather than simultaneous behavior reconstruction;
- static markup cleanup should happen before final component imports so init code can target final DOM directly.

Every phase should leave the application in a coherent state.

---

# 5. Phase 1 — Reduce AppState to Read Model + Controlled State Synchronization

## 5.1 Move seed data out of `state.js`

Create a dedicated seed module, recommended:

```text
js/seed-data.js
```

Move `AppSeedData` there.

`AppState` should not know first-run fixture/seed content.

`AppPersistence.seedFirstRun()` imports/receives seed data directly.

---

## 5.2 Move Task normalization to a pure model helper

Create a small pure module, recommended:

```text
js/task-model.js
```

Move the normalization contract currently implemented by:

```text
AppState.normalizeTask()
```

into a pure function such as:

```text
normalizeTask(task)
```

Consumers:

```text
AppPersistence hydration
AppDataService buildTask
storage mapper hydration where appropriate
UI read normalization only if genuinely necessary
```

Normalization should occur at boundaries, not during selectors/rendering.

Remove:

```text
AppState.normalizeAllTasks()
```

and do not allow read selectors to recreate `AppState.tasks`.

This architecture change naturally makes read paths safer; it is required by Problem #8 even though selector side effects are also tracked separately as Problem #19.

Do not mark Problem #19 complete under this plan unless its own acceptance behavior is verified.

---

## 5.3 Separate AppState from AppStateStore

Recommended final pattern in `js/state.js`:

```text
AppState
    read model exposed to UI/selectors

AppStateStore
    controlled in-memory write adapter used by persistence/services
```

`AppState` should hold:

```text
projects
tags
tasks
reminderDefinitions
settings
currentFilter
currentFilterType
theme/sidebar UI state if still needed
```

`AppState` may expose basic reads such as:

```text
getProject(id)
getTag(id)
getTask(id)
```

Do not keep domain CRUD methods such as:

```text
addProject
updateProject
deleteProject
addTag
updateTag
deleteTag
addTask
updateTask
toggleTaskStatus
deleteTask
```

UI components must never call those methods after this phase.

`AppStateStore` should provide only state synchronization primitives used after successful persistence, for example:

```text
hydrate(snapshot)
replaceTasks(tasks)
upsertTask(task)
removeTaskIds(ids)
replaceProjects(projects)
upsertProject(project)
removeProject(id)
replaceTags(tags)
upsertTag(tag)
removeTag(id)
replaceReminderDefinitions(definitions)
upsertReminderDefinition(definition)
removeReminderDefinition(id)
setSetting(key, value)
```

These are not domain commands. They mirror already-committed persistent state into memory.

---

## 5.4 Refactor `task-relations.js` to read/domain helpers only

Remove the current base-method capture pattern:

```text
baseAddTask
baseUpdateTask
baseDeleteTask
baseDeleteProject
```

Remove its AppState mutation overrides.

Keep/rework only relation logic such as:

```text
getTask
isSubtask
getSubtasks
getSubtaskIds
hasSubtasks
getRootTasks
validateParentTaskId
```

These may be exported as pure/read helpers and consumed by AppDataService/UI.

Project propagation and deletion behavior belongs in AppDataService transactions, not AppState overrides.

---

## 5.5 Refactor `task-order.js` to ordering calculations, not state mutation

Keep useful reads/calculations:

```text
getSiblingTasks
getSiblingTaskIds
root order calculations
relative insertion calculations
```

Move mutation functions such as resequencing/rebasing snapshots into AppDataService hierarchy/drag planning or make them pure functions that return the new order without mutating AppState.

Rule:

> Order helpers calculate. AppDataService persists. AppStateStore mirrors the persisted result.

---

# 6. Phase 2 — Make Repeat Persistence and Completion Explicit

## 6.1 Fold Repeat fields into the real mappers

Update `js/storage/mappers.js` directly.

### `taskToRow(task)` must explicitly include

```text
familySlotId
```

### `taskFromRow(...)` must explicitly restore

```text
familySlotId
repeat
repeatState
```

### `repeatToRow(taskId, repeat, repeatState)` must explicitly write

```text
mode/custom pattern
endType
endDate
endCount
seriesId
occurrenceNumber
anchorDate
anchorDay
anchorMonth
updatedAt
```

### `repeatFromRow(row)`

Do not attach hidden state to the Repeat object.

Preferred explicit result:

```js
{
  repeat,
  repeatState
}
```

or an equivalent clear structure.

Hydration then passes both values directly into the task model.

Remove the non-enumerable:

```text
__repeatState
```

transport entirely.

---

## 6.2 Make `AppDataService.buildTask()` Repeat-aware directly

Move the behavior currently installed by `repeat-storage.js` into the real task-building implementation:

```text
normalize repeat rule
Repeat mode != none + no dueDate → use Today
root task → familySlotId null
subtask → preserve/existing slot or allocate slot
same Repeat pattern + same dueDate → preserve repeatState
changed Repeat pattern/date → initialize new series state
Repeat none → repeatState null
```

The function visible in the real service source must already be the final implementation.

---

## 6.3 Make `writeTaskAggregate()` Repeat-aware directly

The real aggregate writer must persist:

```text
TASKS
TASK_TAGS
REMINDER_DEFINITIONS
TASK_REMINDERS
TASK_REPEAT_RULES
```

using the explicit Repeat mapper.

No later replacement.

---

## 6.4 Move completion behavior to an explicit completion module

Recommended file:

```text
js/storage/data-service-completion.js
```

Export the final recurrence-aware `toggleTaskStatus` implementation plus private helpers.

Preserve the exact existing cases from `data-service-repeat.js`:

```text
uncompleteTask
completePlainSubtask
completeRepeatingSubtask
completeNonRepeatingRoot
finishRepeatingRootWithoutNext
completeRepeatingRoot
chooseSlotTemplates
nextState
```

The main `AppDataService` must explicitly import/include this method. It must not first define a simpler `toggleTaskStatus()` and then replace it.

Delete the simple duplicate completion implementation from the base service.

---

## 6.5 Make Repeat repair explicit

Move `repairRepeatState()` into a clearly imported service module, e.g. the completion/repeat service.

Preserve repair behavior:

```text
subtask missing familySlotId → allocate slot
repeating task missing dueDate → Today
missing/incomplete repeatState → recreate anchors/series state
persist repaired TASKS + TASK_REPEAT_RULES
```

No DB schema change.

---

## 6.6 Delete Repeat patch files only after parity review

After direct implementations are complete and statically compared against current behavior, delete:

```text
js/storage/repeat-storage.js
js/storage/data-service-repeat.js
```

Do not delete them first and attempt to reconstruct behavior from memory.

---

# 7. Phase 3 — Make Reminder Definitions State/Service Data

## 7.1 Add reminder definitions to hydration snapshot

`AppPersistence.hydrateState()` already reads:

```text
reminder_definitions
```

Instead of assigning custom reminders into ScheduleComponent, include reminder definitions in the AppState hydration snapshot:

```text
AppStateStore.hydrate({
  projects,
  tags,
  tasks,
  reminderDefinitions,
  settings
})
```

Remove:

```text
ScheduleComponent.customReminders = ...
```

from persistence.

Persistence must never know ScheduleComponent.

---

## 7.2 Introduce a pure reminder model helper

Recommended:

```text
js/reminder-model.js
```

Move/share pure reminder concerns there:

```text
BUILTIN_REMINDERS
custom parts → persisted definition
persisted definition → UI parts (day/hr/min)
validation/ID format helpers
```

This avoids forcing UI code to depend on a storage-specific mapper simply to interpret minutes.

Storage mappers may call the same pure helper.

---

## 7.3 Change `resolveReminders()` to read AppState, not Schedule

Current invalid dependency:

```text
AppDataService → ScheduleComponent.customReminders
```

New behavior:

```text
AppDataService.resolveReminders(ids)
    ↓
validate built-in IDs
validate custom IDs against AppState.reminderDefinitions
or parse a valid custom ID if a new definition is being submitted in the same command
```

No UI component access.

---

## 7.4 Make reminder definition service methods synchronize AppState

After successful DB write:

```text
saveReminderDefinition
    → AppStateStore.upsertReminderDefinition

deleteReminderDefinition
    → delete DB definition + task relations
    → remove ID from affected tasks in memory
    → AppStateStore.removeReminderDefinition
```

The service remains responsible for transaction correctness.

---

## 7.5 Schedule reads custom reminder options from AppState

Remove ScheduleComponent's long-lived authoritative:

```text
customReminders: []
```

or convert it to a derived getter, not an independently mutated store.

`renderReminderMenuContent()` and `updateReminderUI()` should derive custom options from:

```text
AppState.reminderDefinitions
```

through the pure ReminderModel helper.

`draftReminders` remains local Schedule draft state.

---

# 8. Phase 4 — Move Persistent UI Commands Into Their Owning Files

This phase directly replaces every responsibility currently hidden in `ui-persistence-bindings.js`.

Use one shared UI error helper instead of using `AppPersistence` as a general-purpose UI error service.

Recommended module:

```text
js/ui-error.js
```

API example:

```text
UiError.show(message, error)
```

It may preserve the existing non-destructive bottom error banner appearance.

---

## 8.1 Task checkbox

In `task-renderer.js`, create the checkbox with the final handler immediately:

```text
change
→ disable checkbox
→ await AppDataService.toggleTaskStatus(task.id)
→ refreshAfterTaskMutation()
→ on failure restore visual state + report error
```

Delete the clone-and-replace checkbox decoration currently in `ui-persistence-bindings.js`.

There should be exactly one checkbox listener.

---

## 8.2 Main Task submit

`TasksComponent.submitTask()` becomes the real async implementation:

```text
validate title
build payload
button disabled
createTask/updateTask via AppDataService
on success close + render
on failure keep modal/draft open
finally enable button
```

No direct AppState Task mutation.

---

## 8.3 Subtask submit

`SubtaskEditorComponent.submit()` becomes the real async implementation:

```text
create/update via AppDataService
parentTaskId supplied on create
keep form open on failure
refresh after success
```

No direct AppState Task mutation.

---

## 8.4 Task actions

In `task-actions.js`, replace placeholder/direct-state implementations with the real service commands:

```text
handleTaskActionLinkParent → AppDataService.linkTaskToParent
handleTaskActionUnlink     → AppDataService.unlinkTask
handleTaskActionDelete     → AppDataService.deleteTaskFamily
```

Preserve confirmation for parent family deletion.

Do not leave empty methods that another file is expected to fill.

---

## 8.5 Project/Tag save/delete

The owning taxonomy UI layer must directly call:

```text
AppDataService.createProject/updateProject/deleteProject
AppDataService.createTag/updateTag/deleteTag
```

Preserve:

```text
submit disabled during write
form stays open on write failure
sidebar rerender after success
Task Project/Tag picker rerender after success
current filter synchronization
count refresh
Task view rerender
```

These will move into the shared taxonomy UI in Phase 6, but persistence must already be part of the owner behavior.

---

## 8.6 Workspace Controls

`WorkspaceControls.init()` reads persisted values directly from:

```text
AppState.settings
```

from the beginning.

The real handlers become async:

```text
Sort key       → AppDataService.setSetting('sortKey', value)
Sort direction → AppDataService.setSetting('sortDirection', value)
Group key      → AppDataService.setSetting('groupKey', value)
Project/Tag view type → AppDataService.setEntityViewType(...)
```

Do not keep a nonpersistent implementation that another file replaces.

Preserve current UI behavior if a write fails: keep previous setting and show an error.

---

## 8.7 Task hierarchy drag commit

`TaskDragCommitMethods.commitTaskDrag()` must directly contain the current persistent commit behavior:

```text
if preview unchanged → cleanup only
else await AppDataService.commitHierarchyDrag(...)
set Sort = Custom after successful commit
cleanup/render
```

No runtime replacement.

Review `js/storage/data-service-drag.js` after this migration. The older `AppDataService.commitTaskDrag()` path appears superseded by `commitHierarchyDrag()`.

If static reference review confirms no remaining caller, delete `data-service-drag.js` rather than carrying a second obsolete drag persistence path.

---

## 8.8 Custom Reminder create/delete

`ScheduleTimeReminderMethods.submitCustomReminder()` and `deleteCustomReminder()` become async real commands:

```text
submit → AppDataService.saveReminderDefinition
       → state updated by service
       → toggle selection/render

delete → AppDataService.deleteReminderDefinition
       → state updated by service
       → remove from draft selection/render
```

Do not mutate a separate Schedule authoritative reminder array.

---

# 9. Phase 5 — Delete `ui-persistence-bindings.js`

Only after every overridden behavior above is migrated and reviewed:

1. remove `bindPersistentUiMutations()` call from startup;
2. remove `js/storage/ui-persistence-bindings.js` from loading/imports;
3. delete the file;
4. statically verify there are no UI component methods intentionally left as AppState-only placeholders.

Required source invariant:

> Searching the repository should not reveal code that exists only to replace a previously defined UI method at startup.

---

# 10. Phase 6 — Merge Project/Tag Sidebar + Modal UI

Create one shared component/helper, recommended:

```text
js/components/sidebar-taxonomy.js
```

Delete the mirrored implementation from:

```text
sidebar-projects.js
sidebar-tags.js
```

after parity is confirmed.

---

## 10.1 Define one taxonomy UI config

Use a configuration object for the small differences.

Conceptual shape:

```js
project: {
  type: 'project',
  singular: 'Project',
  childLabel: 'Sub-project',
  list: projectListEl,
  modal: projectModal,
  nameInput: projectNameInput,
  iconTrigger: projectIconTrigger,
  iconPicker: projectIconPicker,
  parentSelect: projectParentSelect,
  title: projectModalTitle,
  saveButton: projectSaveBtn
}

tag: {
  type: 'tag',
  singular: 'Tag',
  childLabel: 'Sub-tag',
  ...
}
```

Do not hide major behavior inside arbitrary conditionals scattered throughout the file.

---

## 10.2 Shared tree renderer

One recursive renderer should:

```text
TaxonomyOrder.getChildren(type, parentId)
create .sidebar-tree-node
set data-taxonomy-type/entity-id/parent-id/depth
create selectable row
create count
create More menu
create child host
recurse
```

Preserve compatibility hooks needed by existing CSS/filter/drag code:

```text
project-tree-node / tag-tree-node
project-nav-item / tag-nav-item
data-project / data-tag
data-project-id / data-tag-id
project-more-menu / tag-more-menu
```

They may be generated from config even though implementation is shared.

Do not break taxonomy drag DOM contracts.

---

## 10.3 Shared modal population

One open function should handle:

```text
create vs edit title/button text
icon state
name
view type
parent hierarchy options
exclude self/descendants
initial parent for Add Sub-project/Sub-tag
```

Use TaxonomyOrder for hierarchy ordering.

Keep Project/Tag-specific labels through config.

If Implementation Plan ID 13 has already introduced a shared ModalFocusManager by the time this plan is implemented, the shared taxonomy controller must preserve/use that lifecycle. If ID 13 has not yet been implemented, this plan must not silently redesign modal focus; preserve current focus behavior and leave Problem #2 open.

---

## 10.4 Shared save/delete commands

One internal flow can branch by type only at the service API boundary:

```text
project → createProject/updateProject/deleteProject
tag     → createTag/updateTag/deleteTag
```

Optionally make the data service itself use generic internal taxonomy create/update/delete helpers while preserving clear public wrappers.

---

## 10.5 Shared Sidebar event delegation

Replace duplicated Project and Tag delegated click blocks with one taxonomy event resolver where practical.

Required actions:

```text
select entity filter
open More menu
add child
edit
delete
```

Preserve current behavior and wording.

---

# 11. Phase 7 — Make Permanent Markup the Source of Truth

Rule:

> Static application shell/control structure belongs in `index.html`. Dynamic data rows belong in JavaScript.

Do not move data-driven task/project/tag/calendar rows into HTML.

---

## 11.1 Workspace main menu

Replace the obsolete Sort/Group/View HTML in `index.html` with the **actual current layered menu structure** that the app wants:

```text
View switcher
Sort & Group trigger
```

Then remove:

```text
WorkspaceControls.buildLayeredMenu()
```

`WorkspaceControls.init()` should query the existing controls and bind behavior only.

---

## 11.2 Workspace Sort & Group panel

Because this is a permanent UI panel, place its structural markup in `index.html` as well.

Remove runtime:

```text
createSortGroupPanel()
optionChip() HTML generator
```

JS only opens/closes/positions/synchronizes the static panel.

---

## 11.3 Task Project menu seed rows

Change:

```html
<div id="menu-project">
  Personal
  Work
</div>
```

into an empty dynamic data container, equivalent to the Tag menu:

```html
<div class="context-menu" id="menu-project"></div>
```

`renderProjectMenu()` remains the single source for Project data rows.

---

## 11.4 Completed section header

Make the final semantic button exist in `index.html` from first paint:

```text
button.completed-section-toggle
    label "Completed"
    count
    chevron
```

Give it the final:

```text
aria-controls="completed-task-list"
aria-expanded
aria-label
```

During `TasksComponent.init()` query:

```text
completedSectionToggle
completedSectionChevron
```

Bind click once.

Delete:

```text
ensureCompletedSectionToggle()
header.replaceWith(...)
```

`syncCompletedSectionState()` remains responsible for state updates only.

---

## 11.5 Task action menu permanent commands

Add permanent static buttons for:

```text
Add Subtask
Link to Parent
Unlink
Delete
```

with correct roles/attributes.

Then delete:

```text
ensureTaskHierarchyActionButtons()
```

The component only hides/disables the buttons based on the selected Task.

---

## 11.6 Repeat Ends structural UI

Move permanent Repeat Ends structure out of runtime creation and into `index.html`:

```text
Ends row
main Repeat validation message
Repeat Ends modal
end type wheel host
conditional date panel
conditional count panel
error/status container
footer buttons
```

Keep dynamic contents dynamic:

```text
wheel items
calendar day buttons
labels/state
```

`ScheduleRepeatEndMethods.initRepeatEndUi()` becomes a DOM-query/bind initializer rather than a DOM constructor.

Add `css/components/schedule-repeat-end.css` as an explicit stylesheet link in `index.html`; remove the runtime link injection.

This does not by itself complete tracker Problem #27 because that problem also concerns other CSS dependencies.

---

# 12. Phase 8 — Native ES Module Cutover

Do this **after** runtime patch behavior has been removed, so module conversion is dependency cleanup rather than behavioral archaeology.

No bundler/framework is required.

---

## 12.1 Final HTML entry

Remove the long classic `<script src="...">` list from `index.html`.

Use one entry:

```html
<script type="module" src="js/bootstrap.js"></script>
```

Do not keep both the classic list and module graph in the final state.

---

## 12.2 `bootstrap.js`

Create a very small module responsible for catching **module graph load failure**:

```js
try {
  const { startApp } = await import('./app.js');
  await startApp();
} catch (error) {
  ...
}
```

Because `app.js` and all its static imports are behind this dynamic import, a missing/parse-failing dependency rejects the import and can be classified as a module-load failure rather than a database failure.

Keep bootstrap independent of AppPersistence so it can report an error even when storage modules fail to import.

---

## 12.3 Convert internal modules to named imports/exports

Final internal modules should stop depending on load-order globals such as:

```text
window.AppState
window.AppDataService
window.TodoDb
window.TodoRepositories
window.TodoStorageMappers
window.RepeatEngine
window.TasksComponent
window.SidebarComponent
window.ScheduleComponent
```

Use explicit imports.

Examples:

```text
AppDataService imports AppState/AppStateStore/TaskRelations/TaskOrder/RepeatEngine/DB/mappers
TasksComponent imports its method modules + AppDataService + state reads
SidebarComponent imports taxonomy UI + TaxonomyOrder + AppDataService
ScheduleComponent imports RepeatEngine + ReminderModel + AppDataService + state
```

Do not rely on `Object.assign()` that occurs later because another script finally became available.

---

## 12.4 Explicit component composition is allowed at definition time

The codebase currently splits large components into method modules. Keep that modularity.

It is acceptable to compose at module definition time, for example:

```js
export const TasksComponent = {
  ...TaskMenuMethods,
  ...TaskActionMethods,
  ...TaskHierarchyMethods,
  ...TaskDragMethods,
  ...TaskDragHierarchyMethods,
  ...TaskRendererMethods,
  ...
};
```

The important distinction is:

```text
GOOD:
all imported methods are known while TasksComponent is created

BAD:
TasksComponent initializes, then unrelated later-loaded files replace methods
```

The same rule applies to Sidebar, Schedule, and AppDataService.

Keep source modules reasonably small (generally under the project's ~300-line source guideline).

---

## 12.5 Eliminate `BOOTSTRAP_SCRIPTS` and `loadScript()`

Delete from `app.js`:

```text
BOOTSTRAP_SCRIPTS
loadScript()
late integration Object.assign blocks
manual required-method assertions that exist only because scripts load late
```

ES imports become the dependency contract.

Keep small runtime capability assertions only where they validate DOM/database/browser capabilities, not script ordering.

---

# 13. Phase 9 — Accurate Startup Stages and Error Reporting

Refactor `app.js` to export:

```text
startApp()
```

Use clearly separated stages.

Recommended sequence:

```text
1. theme initialization
2. database open / first-run initialization
3. data hydration + relationship repair
4. Repeat state repair
5. UI component initialization
```

Module loading is handled/caught by `bootstrap.js` before these stages.

---

## 13.1 Error categories

### Module graph failure

User message:

```text
Application code could not be loaded. Refresh and try again.
```

Console:

```text
[startup:module-load]
```

### Database open / initialization failure

User message:

```text
The local database could not be opened. Existing data was not cleared.
```

Console:

```text
[startup:database]
```

### Hydration/relationship repair failure

User message:

```text
Saved data could not be loaded safely. Existing data was not cleared.
```

Console:

```text
[startup:hydration]
```

### Repeat repair failure

User message should specifically identify startup data repair rather than module loading.

Console:

```text
[startup:repeat-repair]
```

### UI initialization failure

User message:

```text
The application interface could not be initialized.
```

Console:

```text
[startup:ui]
```

Do not expose raw exception internals in the visible banner; retain them in `console.error`.

---

## 13.2 One generic UI error renderer, distinct from persistence

Move the current error-banner DOM concern out of `AppPersistence` into the generic UI error helper introduced earlier.

Then:

```text
AppPersistence → persistence only
bootstrap       → classifies startup stage
UI components   → report failed user commands
UiError         → renders message
```

This prevents a persistence object from becoming the app-wide error UI service.

---

# 14. Phase 10 — Final Dead-Code / Compatibility Cleanup

After native module conversion:

Delete confirmed obsolete files:

```text
js/storage/ui-persistence-bindings.js
js/storage/repeat-storage.js
js/storage/data-service-repeat.js
js/components/sidebar-projects.js
js/components/sidebar-tags.js
```

Delete `js/storage/data-service-drag.js` if the required static reference audit confirms the current hierarchy drag service fully supersedes it.

Refactor rather than delete:

```text
js/task-relations.js
js/task-order.js
```

into explicit imported read/order helpers with no AppState monkey-patching.

Remove temporary compatibility globals if any were used during the ESM cutover.

Final production architecture should not require internal `window.*` service/component globals.

---

# 15. Expected Final File Responsibilities

## State/domain

```text
js/state.js
    AppState read model
    AppStateStore synchronization boundary

js/seed-data.js
    first-run seed only

js/task-model.js
    pure Task normalization/model helpers

js/task-relations.js
    Task parent/child read/validation helpers

js/task-order.js
    pure Task order calculations/selectors

js/taxonomy-order.js
    Project/Tag hierarchy/order reads

js/task-filter.js
    filter matching/counts/family-aware display selection

js/reminder-model.js
    built-in/custom reminder domain conversion

js/repeat/repeat-engine.js
    pure recurrence calculations
```

## Storage/service

```text
js/storage/db-schema.js
js/storage/db.js
js/storage/repositories.js
js/storage/mappers.js
js/storage/persistence.js
js/storage/data-service.js
js/storage/data-service-completion.js
js/storage/data-service-taxonomy.js
js/storage/data-service-taxonomy-drag.js
js/storage/data-service-hierarchy.js
```

`data-service.js` may be an explicit facade assembled from imported method modules to keep files small.

## UI

```text
js/components/sidebar.js
js/components/sidebar-taxonomy.js
js/components/workspace-controls.js
js/components/tasks.js + existing Task submodules
js/components/subtask-editor.js
js/components/schedule.js + existing Schedule submodules
js/components/settings.js
js/ui-error.js
```

## Entry

```text
js/bootstrap.js
js/app.js
```

---

# 16. Circular Dependency Rules

Native modules expose bad dependency direction quickly. Avoid cycles deliberately.

Required direction:

```text
pure domain helper
    ↓ may be imported by
state/selectors
    ↓ may be imported by
services and UI

storage primitives
    ↓
AppDataService
    ↓
UI commands
```

Do not allow:

```text
AppDataService imports a UI component
AppPersistence imports a UI component
state imports a UI component
mappers import a UI component
```

UI components may import services/state/helpers.

`app.js` may import all top-level components/services to initialize them.

---

# 17. Data Transaction Invariant

For every persistent command:

```text
1. validate against current read model
2. create copies/next values
3. execute complete IndexedDB transaction
4. only if transaction succeeds, update AppStateStore
5. render from new AppState
```

Never:

```text
mutate AppState first
then hope IndexedDB succeeds
```

This invariant already exists in most AppDataService methods and must become universal after removing the UI patch layer.

---

# 18. Repeat Regression Matrix

Because Problem #7 changes architecture around one of the most complex features, manually verify all of these after implementation.

## A. No Repeat

Complete normal Task:

```text
Task → completed
```

No new occurrence.

## B. Parent + child, no Repeat

Complete parent:

```text
Parent + all children → completed
```

## C. Repeating root

Complete root:

```text
old root/family → completed historical occurrence
new root/family → created immediately
Repeat moves to new root
```

## D. Repeating child completed directly

```text
old child → completed and Repeat removed
new child occurrence → active under same parent
familySlotId preserved
```

## E. Repeating parent with repeating child templates

Verify familySlot/template selection remains exactly as current ID 9 behavior.

## F. Repeat end by date

No next occurrence beyond inclusive end date.

## G. Repeat end by count

Total occurrence count respected.

## H. Monthly/yearly anchor

End-of-month/leap/calendar anchor behavior remains unchanged.

## I. Historical undo

Uncompleting a historical completed occurrence does not generate another recurrence.

---

# 19. Persistence/UI Regression Matrix

## Task

```text
create
edit
complete/uncomplete
delete
create subtask
edit subtask
link to parent
unlink
parent Project change propagates to children
```

Refresh after every major mutation and confirm persisted state.

## Drag

```text
root reorder
child reorder
root → child
child → root
cross-group metadata move
Project/Tag hierarchy drag
```

Sort should switch to Custom where currently expected.

## Workspace settings

```text
Sort key persists
Sort direction persists
Group By persists
Project view type persists
Tag view type persists
```

## Reminders

```text
create custom reminder
select it on Task
refresh
edit Task → custom reminder still selected
delete custom reminder → removed from Task reminder relations
```

---

# 20. Taxonomy UI Regression Matrix

Verify both Project and Tag through the same shared implementation.

```text
create root
create child
create grandchild
edit name
edit icon
edit view type
change parent
delete root with children
open More menu
select as filter
recursive drag reorder
recursive drag reparent
Task Project/Tag menus refresh after taxonomy mutation
```

Project-specific rule:

```text
deleting Project clears affected Task project relation
```

Tag-specific rule:

```text
deleting Tag removes task_tag relations
```

The shared UI must not accidentally force identical persistence semantics where the domains differ.

---

# 21. Permanent Markup Acceptance

After Phase 7, inspect first-load DOM/source.

Required:

```text
workspace menu already has final structure before WorkspaceControls.init
Sort & Group panel already exists
Completed header already is a button
Link to Parent / Unlink already exist in Task action menu
Repeat Ends row/modal already exist
Task Project menu contains no hard-coded Personal/Work rows
```

JavaScript may set:

```text
hidden
selected
aria-*
text/count values
position
```

but must not replace these permanent controls with newly created equivalents.

---

# 22. Module/Bootstrap Static Acceptance

Final `index.html` should have one application JavaScript entry:

```text
<script type="module" src="js/bootstrap.js"></script>
```

Repository should no longer contain:

```text
BOOTSTRAP_SCRIPTS
loadScript(src)
data-dynamic-src
late script-integration Object.assign in app.js
bindPersistentUiMutations
```

Internal application modules should use imports/exports rather than script-order globals.

A missing module path must be classified as module-load failure, not storage failure.

---

# 23. Static Architecture Acceptance

Search/review after implementation.

Required:

### No UI direct domain mutation

No UI component should call:

```text
AppState.addTask/updateTask/deleteTask/toggleTaskStatus
AppState.addProject/updateProject/deleteProject
AppState.addTag/updateTag/deleteTag
```

Those domain mutation APIs should not exist on the public read model.

### No data → UI dependency

Storage/data modules must not reference:

```text
TasksComponent
SubtaskEditorComponent
SidebarComponent
WorkspaceControls
ScheduleComponent
SettingsComponent
```

### No method decoration

No module should capture a base service/mapper function solely to replace it later.

### One Task completion implementation

There should be one explicit recurrence-aware command path.

### One Project/Tag UI implementation

No mirror Project/Tag modal/tree source files.

---

# 24. Error/Failure Acceptance

Manually or through safe development fault simulation where practical:

```text
invalid module path → “application code could not be loaded”
IndexedDB open failure → database-specific message
hydration/repair failure → saved-data-specific message
UI init exception → interface initialization message
failed Task save → Task form remains open
failed Subtask save → Subtask form remains open
failed Project/Tag save → taxonomy form remains open
failed settings save → previous setting remains active
```

Never clear or reset the database automatically because startup failed.

---

# 25. Commit Strategy

Do not implement all of ID 18 in one giant commit.

Recommended commit sequence:

```text
1. refactor: separate task model and state write boundary
2. refactor: make task relation and order helpers non-mutating
3. refactor: make repeat mappers explicit
4. refactor: make repeat-aware task build/write explicit
5. refactor: move recurrence completion into explicit service
6. refactor: hydrate reminder definitions into app state
7. refactor: remove schedule dependency from data service
8. refactor: move task persistence handlers into task components
9. refactor: move taxonomy/workspace/drag/reminder persistence into owners
10. refactor: remove ui persistence binding layer
11. refactor: consolidate Project and Tag taxonomy UI
12. refactor: make permanent controls static in index
13. refactor: convert application modules to native ESM
14. refactor: split bootstrap stages and startup errors
15. chore: remove obsolete patch/dead modules and final static audit
```

A small adjustment in commit count is fine, but preserve the dependency order.

Do not combine unrelated visual redesigns into these commits.

---

# 26. Expected File Change Set

Likely new files:

```text
js/bootstrap.js
js/seed-data.js
js/task-model.js
js/reminder-model.js
js/state-store.js                 (optional if not exported beside AppState)
js/storage/data-service-completion.js
js/components/sidebar-taxonomy.js
js/ui-error.js
```

Likely major modifications:

```text
index.html
js/app.js
js/state.js
js/task-relations.js
js/task-order.js
js/task-filter.js
js/taxonomy-order.js
js/repeat/repeat-engine.js         (module syntax; recurrence logic preserved)
js/storage/db-schema.js            (module syntax only; no schema change expected)
js/storage/db.js
js/storage/repositories.js
js/storage/mappers.js
js/storage/persistence.js
js/storage/data-service.js
js/storage/data-service-taxonomy.js
js/storage/data-service-taxonomy-drag.js
js/storage/data-service-hierarchy.js
js/components/sidebar.js
js/components/workspace-controls.js
js/components/task-renderer.js
js/components/task-actions.js
js/components/task-drag-commit.js
js/components/tasks.js
js/components/subtask-editor.js
js/components/schedule.js
js/components/schedule-events.js
js/components/schedule-time-reminders.js
js/components/schedule-repeat.js
js/components/schedule-repeat-end.js
js/components/schedule-repeat-validation.js
plus component helper files converted to ES imports/exports
```

Expected deletions after migration:

```text
js/storage/ui-persistence-bindings.js
js/storage/repeat-storage.js
js/storage/data-service-repeat.js
js/components/sidebar-projects.js
js/components/sidebar-tags.js
```

Conditional deletion after reference audit:

```text
js/storage/data-service-drag.js
```

No CSS redesign is expected. `schedule-repeat-end.css` should become an explicit static link when Repeat Ends markup moves into HTML.

---

# 27. Out of Scope

Do not use this architecture plan to silently implement unrelated tracker items:

```text
Problem #2 modal focus lifecycle / ID 13
Problem #4 Subtask Tag ordering / ID 17
Problem #5 actual reminder notification delivery
Problem #15 sidebar focus
Problem #16 semantic Project/Tag row accessibility
Problem #17 pinch zoom
Problem #18 Project picker hierarchy indentation
Problem #20 render-time Repeat array mutation
Problem #21 rerender optimization
Problem #22 date-label deduplication
Problem #23 strict Repeat date parsing
Problem #24 Export/Import
Problem #25 tests
Problem #26 placeholder modules
```

Some source files overlap with these issues. Preserve their current behavior unless a change is strictly necessary for Problems #6–#14.

If ID 13 or ID 17 is implemented before ID 18, preserve those newer behaviors during the refactor.

---

# 28. No Browser Automation

Do not run:

```text
Chrome
Edge
Puppeteer
Playwright
Selenium
headless browser automation
```

for this project unless the user explicitly changes that rule.

Use:

```text
static source review
ES-module/syntax checks where available
pure non-browser logic checks where appropriate
manual browser/phone verification by the user
```

Do not introduce an automated browser test dependency as part of this architecture cleanup.

---

# 29. Tracker Update Rule

Problems #6 through #14 must remain `[ ]` while this is only a plan.

During implementation, do **not** mark all nine complete at once merely because the final module cutover occurred.

Mark each item `[x]` only when its specific definition is satisfied and important behavior has been reviewed/manually verified.

Suggested mapping:

```text
#6  complete after ui-persistence-bindings.js is deleted and owner commands verified
#7  complete after repeat patch files are deleted and recurrence parity verified
#8  complete after AppState public domain mutation is removed
#9  complete after one shared taxonomy UI owns Project/Tag tree/modal flow
#10 complete after data/persistence contain no ScheduleComponent dependency
#11 complete after final single ES-module graph replaces static+dynamic script loading
#12 complete after startup errors are stage-specific
#13 complete after confirmed dead/duplicate permanent HTML is removed
#14 complete after confirmed permanent controls exist correctly in static markup
```

Record this plan path against those items when useful:

```text
implementation plan/Implementation Plan ID 18.md
```

---

# 30. Final Definition of Done

Implementation Plan ID 18 is complete only when all of the following are true:

- `ui-persistence-bindings.js` no longer exists;
- UI commands call AppDataService directly from their owning components;
- no checkbox clone/replacement persistence decoration exists;
- Repeat-aware mappers are explicit in the mapper source;
- Repeat task construction and aggregate writing are explicit;
- recurrence-aware completion is the only task-completion command implementation;
- `repeat-storage.js` and `data-service-repeat.js` no longer exist;
- AppState is no longer a public domain CRUD/mutation service;
- seed and Task normalization concerns are separated from state;
- task relation/order logic no longer monkey-patches AppState mutations;
- reminder definitions hydrate into state, not ScheduleComponent;
- AppDataService does not read ScheduleComponent;
- custom reminder create/delete updates IndexedDB then state then UI;
- Project and Tag sidebar/modal behavior shares one taxonomy UI implementation;
- Project/Tag drag DOM contracts remain intact;
- workspace menu has one structural source of truth;
- hard-coded Task Project seed menu rows are removed;
- Completed header is the correct button in static HTML;
- permanent Link/Unlink task actions are static markup;
- Repeat Ends permanent shell is static markup;
- native ES imports/exports replace script-order globals for internal modules;
- `index.html` uses one module entry;
- `BOOTSTRAP_SCRIPTS`/script injection/late mixin installation are gone;
- module-load, database, hydration/repair, and UI-init failures produce accurate distinct messages;
- IndexedDB schema/data remain compatible;
- current Task/Subtask/Project/Tag/drag/Repeat/reminder/workspace behavior passes manual regression checks;
- no browser automation was used;
- Problems #6–#14 are marked complete individually only after verification.
