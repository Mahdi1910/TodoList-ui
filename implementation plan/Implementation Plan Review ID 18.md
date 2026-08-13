# Implementation Plan Review ID 18 — Architecture Refactor Safety Review

## Review verdict

**Status: APPROVE ONLY AFTER REVISION.**

Implementation Plan ID 18 has a **strong diagnosis** of the application's architecture problems. Problems #6, #7, #8, #10, #11, #12, #13, and #14 are real. Project/Tag duplication in #9 is also real.

However, I do **not** recommend implementing ID 18 exactly as currently written.

The main issue is not the destination architecture. The destination is mostly good. The problem is the **migration order and scope**. Several phases can temporarily remove APIs that current files still depend on, while other phases can install a new implementation that is still silently replaced by the old runtime patch. That creates a dangerous situation where manual testing can appear successful while actually testing the old code.

The plan should therefore be revised into a **migration program with smaller atomic checkpoints**, where every checkpoint leaves one real implementation active and testable.

My overall judgment:

| Problem | Necessary? | Recommendation |
|---|---|---|
| #6 Remove `ui-persistence-bindings.js` | **Yes — high priority** | Keep, but migrate/remove overrides atomically |
| #7 Remove Repeat monkey-patching | **Yes — high priority** | Keep, but preserve recurrence behavior exactly |
| #8 Reduce AppState responsibilities | **Yes, but narrow it** | Keep goal; do not require a large new store abstraction immediately |
| #9 Merge Project/Tag UI duplication | **Useful, medium priority** | Share a common core; thin Project/Tag wrappers are safer than one giant generic component |
| #10 Remove UI dependency from data layer | **Yes — high priority** | Keep; create explicit reminder data ownership |
| #11 Native ES-module conversion | **Useful, but high-risk and optional for this cleanup** | Split into a later milestone/plan |
| #12 Improve bootstrap error reporting | **Yes — move earlier** | Do this first so later refactor failures are diagnosable |
| #13 Remove dead/duplicate HTML | **Yes, low risk** | Keep as a late cleanup |
| #14 Stop runtime-upgrading permanent markup | **Partly** | Reframe as “one source of truth”; not every permanent UI must live in `index.html` |

---

# 1. What the current plan gets right

## 1.1 The runtime patch problem is real and should be fixed

`js/storage/ui-persistence-bindings.js` currently replaces behavior belonging to many unrelated owners:

- Task checkbox completion
- Task submit
- Subtask submit
- Link / Unlink / Delete actions
- Project save/delete
- Tag save/delete
- Workspace sort/group/view behavior
- Task hierarchy drag commit
- Custom reminder save/delete

This is exactly the architecture smell described in Problem #6.

The desired direction is correct:

```text
UI command
    ↓
AppDataService
    ↓
IndexedDB transaction
    ↓ success
in-memory state update
    ↓
render
```

A developer should not have to read a second file to discover that the first method is replaced after startup.

**Keep this goal unchanged.**

---

## 1.2 Repeat monkey-patching is also a real problem

`js/storage/repeat-storage.js` currently replaces mapper and service methods after they are defined. It adds behavior that is essential, not optional:

- `familySlotId`
- Repeat end fields
- `seriesId`
- `occurrenceNumber`
- `anchorDate`
- `anchorDay`
- `anchorMonth`
- Repeat-aware task hydration
- Repeat-aware `buildTask()`
- Repeat-aware aggregate persistence
- Repeat-state repair

`js/storage/data-service-repeat.js` then replaces `AppDataService.toggleTaskStatus()` with the real recurrence behavior.

So Problem #7 is correctly identified.

The plan is also correct that the final implementation must make this explicit rather than decorate a simpler version after load.

**Keep this goal unchanged.**

---

## 1.3 AppState really has too many responsibilities

`js/state.js` currently contains:

- seed data
- hydration
- Task normalization
- Task ordering
- Project CRUD
- Tag CRUD
- Task CRUD
- completion mutation
- filtering
- date helpers
- counts
- taxonomy hierarchy helpers
- navigation/UI state

Then `task-relations.js` captures and replaces AppState mutation methods, while `task-order.js` attaches more read and mutation behavior.

So Problem #8 is real.

The plan is correct that UI components should not use AppState as a second write service when IndexedDB is the durable source of truth.

**Keep the architectural direction, but simplify the proposed solution.**

---

## 1.4 Reminder ownership is currently backwards

The current data service reads:

```text
ScheduleComponent.customReminders
```

inside `AppDataService.resolveReminders()`.

Hydration also writes reminder definitions directly into:

```text
ScheduleComponent.customReminders
```

This reverses the desired dependency direction.

The plan's proposed ownership is correct:

```text
IndexedDB
    ↓
state/reminder data
    ↓
Schedule UI reads it
```

**Keep Problem #10.**

One extra correction: reminder save/delete methods currently live in `data-service-taxonomy.js`. They should move to a dedicated reminder service/module as part of this cleanup. That is more important than creating a large `ReminderModel` abstraction.

---

## 1.5 Bootstrap/load-order diagnosis is correct

The app currently has two loading systems:

1. a long static `<script>` list in `index.html`;
2. another ordered list in `app.js` named `BOOTSTRAP_SCRIPTS`, loaded sequentially at runtime.

Then `app.js` manually performs `Object.assign()` to install late modules onto live component objects.

That is fragile and difficult to reason about.

Problem #11 is therefore valid.

However, the **native ES-module conversion should not be coupled to every other architecture change**. More detail is in Section 6 below.

---

## 1.6 Bootstrap error reporting is definitely wrong

Current startup places all of these under one broad error path:

- dynamic script loading
- integration assertions
- late mixin installation
- IndexedDB open
- hydration
- repair
- persistence binding installation

A missing JS module can therefore produce:

```text
Local storage could not be opened.
```

That is misleading.

**Problem #12 should remain, but it should be moved to the beginning of the refactor.**

Accurate errors are a safety tool for every later phase.

---

# 2. Critical safety problem in the current plan: AppState writes are removed too early

This is the most important ordering problem in ID 18.

The plan currently puts “Reduce AppState / introduce AppStateStore / remove public domain CRUD” in Phase 1.

But current production code still depends on those AppState mutation methods.

Concrete examples:

### `task-relations.js`

At module load it executes logic equivalent to:

```text
baseAddTask = AppState.addTask.bind(AppState)
baseUpdateTask = AppState.updateTask.bind(AppState)
baseDeleteTask = AppState.deleteTask.bind(AppState)
baseDeleteProject = AppState.deleteProject.bind(AppState)
```

If those AppState methods disappear before `task-relations.js` is refactored, the file can fail **during startup**, before the app even becomes usable.

### `data-service-taxonomy.js`

`AppDataService.deleteProject()` currently persists the DB changes and then calls:

```text
AppState.deleteProject(projectId)
```

If `AppState.deleteProject()` is removed first, Project deletion breaks.

### Other data-service modules

Several services still call AppState mutation/order helpers after successful transactions. Those must be migrated before the methods are removed.

## Required correction

Do **not** make “delete AppState mutation APIs” an early Phase 1 action.

Instead use this transition:

```text
Step A
Introduce pure helpers / optional state-write adapter
WITHOUT deleting existing APIs

Step B
Migrate every AppDataService caller to the new memory-sync path

Step C
Refactor task-relations/task-order so they no longer capture/replace AppState writes

Step D
Run static search proving no production caller uses AppState domain writes

Step E
Only then remove the old AppState mutation APIs
```

This should be an explicit gate in the improved plan.

---

# 3. Critical safety problem: new implementations can be hidden by old runtime patches

This is the second major flaw.

Suppose ID 18 changes `TasksComponent.submitTask()` so the real owner now calls `AppDataService.createTask()`.

If `ui-persistence-bindings.js` is still loaded, startup later does:

```text
TasksComponent.submitTask = another function
```

The new owner implementation is now **not the runtime implementation**.

Manual testing can pass, but it is testing the old patch.

The same problem applies to:

- checkbox completion
- Subtask submit
- Project/Tag save/delete
- Workspace settings
- Task drag commit
- reminder save/delete

Repeat has the same migration danger:

```text
mappers.js updated
    ↓
repeat-storage.js loads later
    ↓
methods are decorated/replaced again
```

## Required correction: migrate and unshadow atomically

Do not use this pattern:

```text
Phase 4: add all new owner implementations
Phase 5: later delete patch file
```

Use this pattern instead:

```text
Slice 1:
move checkbox behavior to owner
+ remove checkbox override from persistence patch
+ verify

Slice 2:
move Task/Subtask submit behavior
+ remove those exact overrides
+ verify

Slice 3:
move Task action behavior
+ remove those overrides
+ verify

...
```

Or, if all methods are migrated in one commit, remove `ui-persistence-bindings.js` **in that same atomic milestone before testing**.

The rule should be:

> Never have two active implementations of a migrated command during verification.

The same rule applies to Repeat:

> Once explicit Repeat mappers/service completion are installed, remove the corresponding Repeat patch in the same milestone before parity testing.

---

# 4. Recommended new execution order

I recommend replacing the current 10-phase order with the following safer order.

## Phase 0 — Resolve overlapping pending plans first

ID 18 touches several files also covered by pending plans.

Most importantly:

- **ID 13** — modal focus / `aria-hidden` lifecycle
- **ID 17** — Subtask Tag ordering

Implement and verify these first, or explicitly absorb their acceptance criteria into ID 18.

My preference: **finish ID 13 and ID 17 first**.

Why:

- ID 18 will heavily change `tasks.js`, `subtask-editor.js`, Project/Tag UI, Schedule, and bootstrap.
- If ID 13/17 remain pending, their plans will describe code that no longer exists after the architecture refactor.

ID 15 family-aware filtering and ID 16 safe Task taxonomy-menu DOM rendering are already existing behavior and must remain regression invariants.

---

## Phase 1 — Improve bootstrap error reporting first (#12)

Do this before risky architectural changes.

Current categories should become distinguishable:

```text
MODULE_LOAD
INTEGRATION
DATABASE_OPEN
DATABASE_REPAIR
HYDRATION
UI_INIT
```

The exact names are less important than the separation.

Preserve the original exception in `console.error()`.

This phase does not need ES modules yet.

**Why first:** when a later refactor breaks startup, the app will tell you what actually failed.

---

## Phase 2 — Create a runtime ownership/reference inventory

Before deleting anything, record the current final owner of every mutation.

At minimum inventory:

```text
Task checkbox completion
Task create/update
Subtask create/update
Task delete
Link/Unlink
Task hierarchy drag
Project create/update/delete
Tag create/update/delete
Taxonomy drag
Sort/Group settings
View selection
Custom reminder save/delete
Repeat task completion
Repeat mapper/hydration
```

For each command record:

```text
UI caller
current runtime implementation
AppDataService method
stores touched
memory state changed after success
render/refresh path
```

This is not bureaucracy. It is the parity checklist for removing monkey patches safely.

---

## Phase 3 — Remove `ui-persistence-bindings.js` incrementally (#6)

Use atomic slices.

Recommended order:

### 3A Task checkbox

Move the final persistent handler directly into `task-renderer.js`.

Remove the checkbox-clone override immediately.

Verify:

- complete
- uncomplete
- Repeat completion
- parent/subtask completion
- failure state restores checkbox

### 3B Main Task + Subtask submit

Move persistent submit behavior into `tasks.js` and `subtask-editor.js`.

Remove their overrides immediately.

Verify create/edit + refresh.

### 3C Task actions

Move Link / Unlink / Delete service calls into `task-actions.js`.

Remove those overrides immediately.

### 3D Workspace settings/view

Move persistent behavior into `workspace-controls.js`.

Remove those overrides immediately.

### 3E Task drag commit

Make `task-drag-commit.js` call `AppDataService.commitHierarchyDrag()` directly.

Remove the override immediately.

Note: `data-service-drag.js` appears to be an older root-only implementation while the active hierarchy path uses `data-service-hierarchy.js`. Delete `data-service-drag.js` only after a static search proves it has no real caller.

### 3F Project/Tag save/delete

Move persistent commands into the current taxonomy UI owner.

Remove those overrides immediately.

### 3G Reminder definition actions

Move persistent behavior out of the patch and into Schedule/reminder ownership.

After the last slice:

```text
ui-persistence-bindings.js contains no behavior
→ remove file
→ remove load/reference
```

---

## Phase 4 — Make Repeat explicit and remove Repeat patch files (#7)

This remains a high-risk phase and deserves its own checkpoint.

### Required explicit destinations

`mappers.js` must directly own:

- `familySlotId` task row conversion
- Repeat end fields
- series/occurrence/anchor fields
- Repeat hydration state

Do not keep hidden `repeat.__repeatState` transport.

`AppDataService` task building must explicitly own:

- Repeat normalization
- default Today when repeating without a due date
- family slot creation/preservation
- series state creation/preservation

A dedicated completion module is reasonable:

```text
js/storage/data-service-completion.js
```

It should export/install the **one real completion command**, not decorate another completion command.

Preserve all current recurrence semantics from `data-service-repeat.js` exactly.

### Atomic removal rule

Once explicit mapper/build/completion behavior is present:

```text
remove repeat-storage.js
remove data-service-repeat.js
remove both bootstrap references
```

before manual parity testing.

Otherwise tests can still exercise the old monkey-patch behavior.

---

## Phase 5 — Move reminder definitions into state/service ownership (#10)

This should be done after persistence ownership is truthful.

Recommended model:

```text
AppState.reminderDefinitions
```

Hydration writes definitions into state, not Schedule.

Schedule derives custom reminder UI data from state.

`AppDataService.resolveReminders()` reads the state/reminder domain, never `ScheduleComponent`.

Move these methods out of `data-service-taxonomy.js`:

```text
saveReminderDefinition
deleteReminderDefinition
```

into a focused reminder service module.

Preserve current deletion behavior:

- remove custom definition
- remove `task_reminders` relations using it
- remove that reminder ID from affected tasks in memory
- fallback to `['none']` when a task has no reminder IDs left

### Do we need `ReminderModel`?

Maybe, but keep it small.

If mapper conversion functions are already sufficient, do not create a large new abstraction just to satisfy architecture aesthetics.

---

## Phase 6 — Reduce AppState write surface (#8)

Do this **after** UI and data-service commands already use AppDataService.

### Necessary

- remove seed data from AppState if desired
- move normalization to a pure helper
- stop selectors from mutating/normalizing the whole task array
- make task-relations primarily read/validation logic
- make task-order calculations pure or service-owned
- stop UI components from calling AppState domain writes

### Optional

A separate exported `AppStateStore` object/file is **not mandatory** for this personal app.

The essential invariant is:

> Persistence succeeds first; only then controlled code updates the in-memory read model.

This can be achieved with:

```text
AppStateStore
```

or with a smaller internal state-sync API.

Do not add a large abstraction merely to rename direct assignments.

### Removal gate

Only remove these public APIs after repository search proves no production caller remains:

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

---

## Phase 7 — Consolidate Project/Tag UI (#9)

The duplication is real, but do not over-generalize.

Current Project and Tag implementations are mirrors, but they still have different:

- labels
- dataset names
- modal element IDs
- parent picker wording
- menu action wording
- view-option selectors
- accessibility labels

Recommended structure:

```text
shared taxonomy core
    + project config/wrapper
    + tag config/wrapper
```

rather than one enormous function full of:

```text
if project ... else tag ...
```

A possible shape:

```text
sidebar-taxonomy-core.js
sidebar-projects.js   thin config/wrapper
sidebar-tags.js       thin config/wrapper
```

If the wrappers become trivial enough to remove later, that can be decided after the shared core is stable.

Therefore, deleting `sidebar-projects.js` and `sidebar-tags.js` should be **optional**, not a required success condition.

The actual success condition should be:

> duplicated behavior has one implementation, while Project/Tag-specific configuration stays explicit.

This phase must preserve:

- recursive taxonomy hierarchy
- drag indentation/outdent behavior
- cycle prevention
- saved `sortOrder`
- parent selection
- Project/Tag viewType
- sidebar counts
- current filter repair after rename/delete
- ID 17 Subtask Tag order behavior

---

## Phase 8 — One-source markup cleanup (#13 and #14)

The plan's principle is correct, but its rule is too strict.

Current examples that should be cleaned:

- workspace menu has static HTML that is immediately replaced
- Task Project picker has dead static rows that are rebuilt
- Completed header starts as a `div` and is replaced with a button
- hierarchy actions are inserted at runtime despite being stable menu actions
- Repeat Ends CSS is injected dynamically

### Better rule

Use:

> Every UI structure has exactly one owner/source of truth, and its semantic element is correct when it becomes interactive.

Do **not** require:

> Every permanent control must live in `index.html`.

Some component-owned DOM is legitimate:

- task cards
- taxonomy rows
- transient parent picker
- menus/panels generated wholly by one component
- a modal that a component owns exclusively and creates once

The architectural problem is duplication/runtime replacement, not DOM creation itself.

For example, `task-parent-picker` being created by `TaskActionMethods` is not inherently a problem if there is no duplicate static version.

### Recommended concrete cleanup

- Make Completed header a real button in static HTML.
- Pick **one** owner for Workspace menu: static HTML or component-generated, not both.
- Remove dead hard-coded Project/Tag menu rows if JS always populates them.
- Load Repeat Ends CSS normally in `<head>` rather than injecting a stylesheet link.
- Either move Repeat Ends markup to HTML or keep it component-owned; do not require both.

---

## Phase 9 — Loader simplification / ES modules (#11)

I recommend splitting this into a **separate implementation plan or optional final milestone**.

Why:

By this point, the important architecture problems are already solved:

- no persistence UI patch
- no Repeat monkey patch
- clear data ownership
- reduced AppState writes
- cleaner taxonomy UI
- one-source markup

Native ES modules would improve dependency clarity, but they are not required for the app to work correctly.

For a personal Vanilla JS application, this is a maintainability improvement, not a functional necessity.

### If you keep it in ID 18

Treat it as an isolated migration:

```text
Before cutover:
full manual regression

Cutover commit:
classic globals → import/export
one module entry

After cutover:
full manual regression again
```

Do not change business logic during module conversion.

No framework or bundler is required.

### Important circular-dependency rule

Keep direction:

```text
pure models/helpers
      ↓
state/read model
      ↓
data service / persistence
      ↓
UI
      ↓
bootstrap composition
```

Avoid UI imports from data/domain modules.

---

## Phase 10 — Final dead-code/static audit

Only after all earlier phases:

- remove obsolete compatibility files
- search for runtime method replacement
- search for `Object.assign(window.AppState, ...)` mutation mixins
- search for `Object.assign(window.AppDataService, ...)` if final ES-module architecture no longer needs it
- search for duplicate command implementations
- search for unused old drag service
- verify there is one completion implementation
- verify there is one Repeat mapper implementation
- verify no data service reads UI components
- verify no UI writes domain data directly to AppState

Then update tracker items individually.

---

# 5. Problem-by-problem review

## Problem #6 — Remove `ui-persistence-bindings.js`

### Verdict

**Necessary. Keep it.**

This is one of the highest-value cleanup items.

### Change needed in plan

Do not wait until a separate later phase to remove all overrides.

Migrate/remove each override together so tests cannot be shadowed by the patch.

### Risk level

**High**, because this file currently contains the real production behavior for many commands.

### Must preserve

- disabled-submit behavior during async writes
- form stays open on failed write
- checkbox rollback on error
- task mutation refresh path
- Project/Tag current-filter sync
- workspace setting persistence
- viewType persistence per Project/Tag
- task drag setting `sortKey = custom`
- reminder save/delete behavior

---

## Problem #7 — Remove Repeat mapper/service monkey-patching

### Verdict

**Necessary. Keep it.**

### Risk level

**Very high.**

Repeat is one of the most complex parts of the app.

### Must preserve exactly

- direct repeating subtask completion
- parent-triggered child completion suppression
- repeating parent family cloning
- `familySlotId`
- repeat ownership transfer
- historical occurrence uncomplete semantics
- end-by-date
- end-after-count
- monthly/yearly last-valid-day fallback
- series IDs
- occurrence numbers
- anchor dates/day/month
- repair of legacy/incomplete Repeat rows

The current plan's Repeat regression matrix is valuable and should remain.

---

## Problem #8 — Reduce AppState responsibilities

### Verdict

**Necessary goal, but current plan is over-specified.**

### Keep

- pure normalization helper
- read-focused AppState
- mutation through AppDataService
- task relations/order outside general state

### Make optional

- separate `AppStateStore` file/object
- separate seed file as a prerequisite

A small app does not need extra abstraction for its own sake.

### Critical ordering fix

Remove AppState write APIs **last**, after all callers migrate.

---

## Problem #9 — Merge Project/Tag UI duplication

### Verdict

**Useful, but not necessary for correctness.**

It should not block the more important #6/#7/#10 cleanup.

### Recommended scope

Share the common core but allow thin Project/Tag wrappers/configuration.

Do not require deleting both files as a success criterion.

### Risk level

**Medium.**

The drag hierarchy and modal behaviors are now complex enough that an overly generic component can become harder to understand than two small wrappers.

---

## Problem #10 — Remove UI dependency from data layer

### Verdict

**Necessary. Keep it.**

### Add to plan

Move reminder save/delete methods out of `data-service-taxonomy.js` into a reminder-specific data-service module.

Hydrate reminder definitions into state.

Schedule reads them from state.

Preserve deletion cleanup of task reminder relations.

---

## Problem #11 — Simplify JavaScript module loading

### Verdict

**Good improvement, but not required in the same refactor.**

### Recommendation

Split native ES-module conversion into a separate plan after #6–#10 are stable.

If you want a smaller improvement first, simply eliminating the second dynamic loader and late mixin system already removes much of the fragility.

### Risk level

**High if combined with all other architecture changes.**

---

## Problem #12 — Improve bootstrap errors

### Verdict

**Necessary and should move to Phase 1.**

This is low-risk and improves every later debugging step.

---

## Problem #13 — Remove dead/duplicate HTML

### Verdict

**Useful and low-risk.**

Do it late, after behavior ownership is stable.

The success criterion should be “one source of truth,” not “HTML must own everything.”

---

## Problem #14 — Stop runtime-upgrading permanent markup

### Verdict

**Partially correct; rewrite the requirement.**

The real problem is runtime replacement of a structure that already has another owner.

Dynamic component-owned DOM is fine.

Use this requirement instead:

> Permanent controls must have one authoritative owner and correct semantics/accessibility. Do not create placeholder markup only to replace it immediately after startup.

---

# 6. What is unnecessary or can be deferred

The following parts of ID 18 should not be mandatory for solving Problems #6–#14 safely.

## 6.1 Mandatory separate `seed-data.js`

Nice cleanup, but low value.

Move it if convenient. Do not make architecture progress depend on it.

---

## 6.2 Mandatory separate `AppStateStore`

Optional.

What matters is controlled post-transaction synchronization.

A lightweight internal write adapter is enough.

---

## 6.3 Full Project/Tag file deletion

Not required.

Shared core + thin wrappers can be cleaner and safer.

---

## 6.4 Forcing all permanent DOM into `index.html`

Not required.

One-source component-generated markup is valid.

---

## 6.5 Full ES-module conversion in the same implementation

I recommend separating it.

It adds a large diff without changing application behavior, which makes regressions harder to locate.

---

# 7. Dependencies that must not be broken

This section should be added explicitly to the improved ID 18.

## 7.1 Current data-service → AppState mutation dependencies

Before removing AppState write APIs, audit and migrate every caller.

Known examples include:

```text
data-service-taxonomy.js
    deleteProject → AppState.deleteProject
    deleteTag     → AppState.deleteTag

current service modules
    update task/project/tag memory after DB success
```

`task-relations.js` also captures AppState methods at module load.

These dependencies are migration blockers.

---

## 7.2 Task hierarchy service

`data-service-hierarchy.js` contains current real behavior for:

- Link
- Unlink
- root/subtask drag
- sibling resequencing
- familySlotId
- Project propagation
- Group By metadata changes
- Repeat re-anchoring when Date changes by drag

Do not replace this with a generic CRUD path.

---

## 7.3 Taxonomy drag service

`data-service-taxonomy-drag.js` already has a useful generic Project/Tag architecture:

```text
entityType = project | tag
```

Reuse this as the service-side taxonomy core.

Do not reimplement ordering/cycle logic inside the new shared sidebar UI.

---

## 7.4 TaskFilter from ID 15

Preserve the exact family-aware behavior:

```text
Parent matches
→ parent is the visible representative; renderer shows its family

Parent does not match, child matches
→ child appears standalone visually
→ stored parentTaskId remains unchanged
```

Do not move this logic back into AppState accidentally while refactoring selectors.

---

## 7.5 ID 16 safe taxonomy menu rendering

When converting modules or consolidating components, retain DOM creation + `textContent` for user-controlled Project/Tag values.

Do not reintroduce interpolated `innerHTML` as part of generic UI code.

---

## 7.6 ID 13 / ID 17 overlap

Before ID 18 implementation begins, decide whether these are complete:

```text
ID 13 modal focus lifecycle
ID 17 Subtask Tag menu ordering
```

If not, implement them first or explicitly merge their acceptance requirements into ID 18.

Do not let the architecture refactor invalidate their plans silently.

---

# 8. Data safety rules

These should be non-negotiable in the revised plan.

## 8.1 No IndexedDB reset or schema migration

Keep:

```text
TodoListDB
VERSION = 1
existing store names
existing records
```

No schema bump is required for this architecture refactor.

---

## 8.2 Persist first, mutate memory second

For every command:

```text
calculate new state
    ↓
IndexedDB transaction
    ↓ success
update in-memory state
    ↓
render
```

Never update live AppState first and then attempt persistence.

---

## 8.3 Every phase must survive refresh

After each migration slice, manually verify:

```text
perform mutation
refresh browser
same result remains
```

This is more valuable than only testing immediate UI behavior.

---

## 8.4 Never delete old behavior before parity mapping

For Repeat and persistence patches:

```text
map old behavior
implement direct equivalent
remove shadowing patch
then test
```

Do not delete first and reconstruct from memory.

---

# 9. Recommended commit/milestone strategy

Do not make ID 18 one huge commit.

Suggested milestones:

```text
M1  bootstrap error categories
M2  task checkbox persistence ownership
M3  task/subtask submit ownership
M4  task action ownership
M5  workspace persistence ownership
M6  task drag ownership
M7  Project/Tag persistence ownership
M8  reminder ownership
M9  delete ui-persistence-bindings.js
M10 explicit Repeat mappers/build
M11 explicit Repeat completion + delete Repeat patches
M12 reminder state hydration cleanup
M13 AppState mutation-surface cleanup
M14 taxonomy UI consolidation
M15 markup/source-of-truth cleanup
M16 optional ES-module migration
M17 final dead-code/reference audit
```

Some neighboring milestones can be combined if the diff is small, but each one should have a clear rollback point.

Because this repository already uses Git history directly, these commits are the backup mechanism.

---

# 10. Static verification gates

Without browser automation, use static checks between milestones.

## After Problem #6

Repository search should show:

```text
ui-persistence-bindings.js        gone
bindPersistentUiMutations         zero references
checkbox clone persistence patch  zero references
```

And owner files should call AppDataService directly.

---

## After Problem #7

Search should show:

```text
repeat-storage.js                 gone
data-service-repeat.js            gone
__repeatState                     zero references
```

`mappers.js` and the explicit completion module should contain the real implementation.

---

## After Problem #8

Search UI/components for:

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

Expected result: no domain-write usage.

---

## After Problem #10

Search storage/data-service code for:

```text
ScheduleComponent
```

Expected result: no data-layer dependency on Schedule UI.

---

## After optional Problem #11 ES-module cutover

Final app should have one application entry:

```html
<script type="module" src="js/bootstrap.js"></script>
```

No `BOOTSTRAP_SCRIPTS`, runtime script injection, or late mixin installation should remain.

---

# 11. Manual regression matrix that must remain in the improved plan

The original plan is right to emphasize manual regression. Keep that.

At minimum test these after the relevant milestones.

## Tasks

- Create root Task in Inbox
- Create root Task in Project context
- Create Task in Tag context
- Edit Task
- Delete Task
- Complete/uncomplete Task
- Priority None/Low/Medium/High
- Date/Time/Reminder/Repeat save after refresh

## Subtasks

- Add Subtask
- Edit Subtask
- Project remains locked to parent
- Tag order uses custom taxonomy order
- Link root to parent
- Unlink Subtask
- drag indent/outdent/reparent/reorder

## Repeat

Keep the full Repeat regression matrix from original ID 18, including:

- plain Task completion
- repeating Task completion
- repeating Subtask completion
- non-repeating parent with repeating child
- repeating parent with non-repeating child
- repeating parent + repeating child
- Repeat Ends date/count
- undo historical completed occurrence
- monthly/yearly fallback dates

## Projects/Tags

- create/edit/delete
- add child
- parent picker
- recursive hierarchy
- drag reorder
- indent/outdent
- move between parents
- refresh persistence
- custom order reflected in Task/Subtask menus

## Views

- List
- Kanban
- Group By all modes
- sorting all modes/directions
- custom drag switches sort to Custom
- Project/Tag saved viewType
- family-aware filtering from ID 15

## Reminders

- built-in reminder
- create custom reminder
- reuse custom reminder
- delete custom reminder
- task relation cleanup
- refresh persistence

## Startup

- normal startup
- existing IndexedDB data hydrates
- no data reseeding
- accurate error category when deliberately simulating a missing module in a temporary review branch/inspection setup if desired

No Chrome/headless automation is required. Manual browser/phone testing remains the final validation.

---

# 12. Recommended rewrite of ID 18's central strategy

Replace the current central execution message with something similar to:

> Problems #6–#14 form one architecture-cleanup program, but they must not be implemented as one big-bang refactor. The implementation must migrate one ownership boundary at a time. Whenever behavior is moved from a runtime patch into its real owner, the corresponding old override must be removed in the same milestone before testing so the new implementation cannot be shadowed. Existing AppState write APIs remain temporarily available until every service/UI caller has migrated; they are removed only after a static reference audit. Bootstrap error reporting is improved before risky migrations. Native ES-module conversion is an optional final milestone and must not be mixed with business-logic migration.

That statement would make the plan substantially safer.

---

# 13. Final recommendation

## Keep as core requirements

```text
#6  Remove ui-persistence-bindings runtime patching
#7  Make Repeat persistence/completion explicit
#8  Make AppState primarily a read model and stop UI domain writes
#10 Remove UI-component dependencies from data/persistence
#12 Accurate startup errors
```

These provide the largest architecture benefit.

## Keep, but lower priority / narrower scope

```text
#9  Share Project/Tag common UI behavior without forcing one giant component
#13 Remove duplicate/dead UI source
#14 One authoritative owner + correct semantics, not “everything must be static HTML”
```

## Split or make optional

```text
#11 Native ES-module conversion
```

It is a good destination, but should preferably be a separate implementation plan after behavior ownership is stable.

---

# Approval decision

**Do not implement the current ID 18 unchanged.**

After the following corrections, I would approve it:

1. Move bootstrap error reporting to the first implementation milestone.
2. Do not remove AppState mutation APIs until all callers have migrated.
3. Migrate and remove each `ui-persistence-bindings.js` override atomically so manual tests exercise the new code.
4. Apply the same atomic no-shadowing rule to Repeat patch removal.
5. Make `AppStateStore` optional rather than mandatory.
6. Change Project/Tag “merge” into shared-core consolidation with optional thin wrappers.
7. Reframe #14 as one-source/correct-semantics rather than mandatory static HTML.
8. Prefer splitting ES-module conversion into a separate final plan.
9. Resolve or absorb pending ID 13 and ID 17 before changing their owning files.
10. Keep the existing detailed regression matrices and individual tracker completion rules.

With those changes, ID 18 becomes a strong and much safer architecture-cleanup program.