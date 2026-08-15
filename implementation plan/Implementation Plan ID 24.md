# Implementation Plan ID 24 — ID20 Part 5 Regression Audit + Repair

> **Status:** Plan only. No application code is changed by this file.
>
> **Source regression:** `Implementation Plan ID 20 — Part 5 of 5` / commit `e0742c5c33fad4ef98ee76983e4e8568485977d7`.
>
> **Goal:** keep the Part 5 native ES-module architecture, repair every regression introduced by the global-to-module cutover, and prove that no equivalent migration mistake remains before continuing other work.

---

# 1. Why This Repair Plan Exists

After ID20 Part 5, Task hierarchy/reorder can fail with:

```text
Could not save the new task hierarchy or position.
ReferenceError: AppStateSync is not defined
    at applyHierarchyMemory (.../data-service-hierarchy.js)
```

The failure is caused by an incomplete ES-module conversion: several files changed from `window.AppStateSync...` to `AppStateSync...` but did not import `AppStateSync`.

The first runtime failure exposed a broader migration risk, so this plan must audit **every Part 5 change**, not just patch the first stack trace.

Do **not** roll back Part 5 unless the native-module architecture itself is proven unsalvageable. The intended repair is to keep native ES modules and correct incomplete dependency conversion.

---

# 2. Confirmed Defect A — Missing `AppStateSync` Imports in Five Service Modules

Repository-wide comparison of Part 5 (`aaa34de...` → `e0742c5...`) found five current service modules that use the lexical identifier `AppStateSync` without importing or declaring it:

```text
js/storage/data-service-drag.js
js/storage/data-service-hierarchy.js
js/storage/data-service-reminders.js
js/storage/data-service-taxonomy-drag.js
js/storage/data-service-taxonomy.js
```

Each must explicitly import:

```js
import { AppStateSync } from '../state-sync.js';
```

Do not restore `window.AppStateSync` as a workaround. Part 5's architecture goal is import/export ownership.

## 2.1 Known affected commands

### `data-service-hierarchy.js`

Uses `AppStateSync` for:

```text
replaceTasks(...)
setSetting('sortKey', 'custom')
```

Affected behavior includes:

```text
root Task reorder
Subtask reorder
root → Subtask
Subtask → root
reparent
link to parent
unlink from parent
supported group-lane hierarchy moves
```

### `data-service-drag.js`

Uses `AppStateSync` for:

```text
replaceTasks(...)
setSetting('sortKey', 'custom')
```

Affected behavior includes:

```text
explicit Normal Sort → Custom activation
Custom-order snapshot persistence
legacy/root drag service path if invoked
ID23 Name/Due/Priority/Created → Custom semantics
```

### `data-service-reminders.js`

Uses `AppStateSync` for:

```text
upsertReminderDefinitions(...)
removeReminderDefinition(...)
removeReminderFromTasks(...)
```

Affected behavior includes:

```text
create custom reminder
delete custom reminder
remove deleted reminder from affected Tasks
fallback reminder state after deletion
```

### `data-service-taxonomy-drag.js`

Uses `AppStateSync` for:

```text
applyTaxonomyChanges(...)
```

Affected behavior includes:

```text
Project reorder
Tag reorder
indent/outdent
reparent
hierarchy drag persistence → in-memory synchronization
```

### `data-service-taxonomy.js`

Uses `AppStateSync` for:

```text
upsertTaxonomyEntity(...)
removeTaxonomyEntity(...)
replaceTasks(...)
```

Affected behavior includes:

```text
create/edit/delete Project
create/edit/delete Tag
repair affected Task Project/Tag relationships after deletion
saved viewType updates
```

---

# 3. Important Transaction-Safety Consequence

Several affected methods perform this order:

```text
1. IndexedDB transaction commits
2. controlled AppState synchronization runs
3. missing AppStateSync throws ReferenceError
4. UI catches the exception and reports a generic save failure
```

Therefore the message:

```text
Could not save ...
```

can be misleading for this regression: the IndexedDB write may already have succeeded while the in-memory model failed to update.

The repair must **not clear, reseed, or reset IndexedDB**.

After the imports are fixed, manual tests must include refresh verification because users may already have persisted changes from failed-looking operations.

---

# 4. Confirmed Defect B — Stale Sidebar Taxonomy Globals

Part 4 established a shared taxonomy UI core. Before Part 5, classic scripts exposed these globals:

```text
window.SidebarProjectConfig
window.SidebarTagConfig
window.SidebarTaxonomyCore
```

Part 5 correctly converted their files to ES-module exports:

```text
SidebarProjectConfig
SidebarTagConfig
SidebarTaxonomyCore
```

but `js/components/sidebar.js` still contains stale runtime reads such as:

```js
this.taxonomyConfigs = [window.SidebarProjectConfig, window.SidebarTagConfig].filter(Boolean);
this.taxonomyConfigs.forEach(config => window.SidebarTaxonomyCore.initialize(this, config));
```

Because those globals are no longer assigned, `taxonomyConfigs` becomes empty and the shared taxonomy initialization/event-binding path is skipped.

## 4.1 Correct repair

`sidebar.js` must explicitly import:

```js
import { SidebarProjectConfig } from './sidebar-projects.js';
import { SidebarTagConfig } from './sidebar-tags.js';
import { SidebarTaxonomyCore } from './sidebar-taxonomy-core.js';
```

Then replace stale `window.Sidebar...` config/core reads with those imported lexical bindings.

Do **not** re-add these three objects to `window` simply to make the old code work.

## 4.2 Behaviors to verify

```text
Project/Tag list rendering
Add Project / Add Tag
Edit Project / Edit Tag
Delete Project / Delete Tag
Add Sub-project / Sub-tag
icon picker
parent picker
Project/Tag viewType
modal open/close/focus
Project/Tag action menus
hierarchy drag initialization
```

---

# 5. Full Part 5 Global → Module Dependency Audit

Before implementation is considered finished, compare every JavaScript file changed by Part 5 against parent commit:

```text
aaa34de7e54e2f2ffe52fb9feb012e22eec2ee30
e0742c5c33fad4ef98ee76983e4e8568485977d7
```

Part 5 changed 58 JavaScript files plus `index.html`.

For every removed expression of the form:

```js
window.SomeDependency
```

verify that the replacement is exactly one of:

```text
1. an explicit ES-module import
2. a declaration in the same module
3. one of the deliberately retained UI coordination globals
4. a genuine browser global such as window.visualViewport / matchMedia / location
```

No converted dependency may become an undeclared lexical identifier.

## 5.1 Known deliberate application globals

The Part 5 architecture currently deliberately exposes only these mutually coordinating UI component objects:

```text
window.TasksComponent
window.SidebarComponent
window.WorkspaceControls
window.ScheduleComponent
window.SubtaskEditorComponent
```

Audit every current `window.<ApplicationName>` reference.

Anything outside that deliberate list must either:

```text
be converted to an import
or be explicitly justified as a browser global
```

The audit has already identified the stale Sidebar config/core references described in Section 4.

---

# 6. Named Import / Export Integrity Audit

Repository-wide static verification must prove:

```text
every relative import path exists
every named import is actually exported by its target module
no duplicate/conflicting export owner was introduced
import graph is acyclic
```

Do not accept only `node --check` as sufficient: syntax checking cannot catch a runtime-only undeclared variable inside a function body.

Add a dedicated static dependency audit that checks the known Part 5 migration symbols, especially:

```text
AppState
AppStateSync
AppDataService
AppPersistence
TaxonomyOrder
TaskFilter
TaskModel
RepeatEngine
ModalFocusManager
ThemeManager
TodoDbSchema
TodoDb
TodoRepositories
TodoStorageMappers
AppBackupService
AppBackupValidation
AppSeedData
```

---

# 7. Re-review Every Behavior-Sensitive Part 5 Transformation

Most Part 5 edits are mechanical `window.X` → imports/exports. The following changes contain actual behavior/composition movement and require direct parity review against the Part 4 parent.

## 7.1 Bootstrap

Files:

```text
index.html
js/bootstrap.js
js/app-main.js
removed js/app.js
```

Verify:

```text
one module entry only
MODULE_LOAD catches dynamic import failure
INTEGRATION remains separate
DATABASE_OPEN remains separate
DATABASE_REPAIR remains separate
HYDRATION remains separate
UI_INIT remains separate
original exception remains in console
no startup failure clears data
DOMContentLoaded timing is correct
```

## 7.2 `AppDataService` composition

File:

```text
js/storage/data-service.js
```

Verify owner includes all expected method sets exactly once:

```text
DataServiceTaxonomyMethods
DataServiceReminderMethods
DataServiceTaxonomyDragMethods
DataServiceDragMethods
DataServiceHierarchyMethods
```

Check that every method set has every dependency it uses imported directly.

## 7.3 AppState / synchronization

Files:

```text
js/state.js
js/state-sync.js
js/storage/persistence.js
```

Verify:

```text
AppState remains the read model/selectors/navigation state
AppStateSync remains the controlled memory writer
hydration calls AppStateSync.hydrate(...)
Task relation/order selectors are composed once
no old AppState public CRUD surface returns
```

## 7.4 Schedule Repeat validation inlining

Files:

```text
js/components/schedule.js
js/components/schedule-repeat.js
js/components/schedule-repeat-validation.js
```

Part 5 removed the late `installRepeatEnhancements()` method wrapping and moved the same logic into real Schedule owners.

Parity review must verify all former wrapper behavior survived:

```text
open → normalize Repeat + render Repeat Ends
preset selection → normalize + default repeating Task date to Today
custom submit → validate before close
custom submit → default date when Repeat active
Apply → normalize + validate
Apply → reject end date before Task date
validation error switches/appears correctly
Repeat Ends row updates after changes
```

Do not redesign Repeat behavior in this repair.

## 7.5 Settings Backup/Restore

Files:

```text
js/components/settings.js
js/storage/backup-service.js
js/storage/backup-validation.js
```

Verify runtime script loading was removed without changing ID19 semantics:

```text
Create Backup waits AppDataService.whenIdle()
raw stores are captured
Restore validates before destructive transaction
Restore waits pending writes
all-store transaction remains atomic
theme applies only after DB commit
reload uses normal bootstrap/hydration
invalid/canceled restore changes nothing
```

## 7.6 Component composition

Verify the final owners expose all expected methods immediately at module evaluation:

```text
TasksComponent
SidebarComponent
ScheduleComponent
AppDataService
```

There must be no hidden late `Object.assign` installation required for correctness.

---

# 8. Implementation Sequence

## Step 1 — Create repair branch/checkpoint

Create a branch from the exact current `main` before application-code edits.

Do not modify the user's local working project checkout.

## Step 2 — Fix all five `AppStateSync` imports together

Files:

```text
js/storage/data-service-drag.js
js/storage/data-service-hierarchy.js
js/storage/data-service-reminders.js
js/storage/data-service-taxonomy-drag.js
js/storage/data-service-taxonomy.js
```

Add the explicit import to every file in the same repair milestone so one runtime path is not fixed while another remains broken.

No business logic changes in this step.

## Step 3 — Fix Sidebar taxonomy module ownership

File:

```text
js/components/sidebar.js
```

Import the two configs and the shared core and replace stale `window` references.

Preserve Part 4 shared-core behavior.

## Step 4 — Run the complete Part 5 dependency audit

Run repository-wide static checks from Section 5–7.

If another migration defect is found, add it to this plan's repair branch before merge. Do not silently work around it with new globals.

## Step 5 — Static verification

Mandatory checks:

```text
node --check / ES-module parse for all js files
all relative imports resolve
all named imports resolve to exports
import graph has no cycles
known migration symbol audit has zero undeclared candidates
stale non-deliberate application window refs = zero
old loader/patch patterns remain zero
git diff --check
```

Also confirm these remain absent:

```text
BOOTSTRAP_SCRIPTS
loadScript()
SettingsComponent.loadBackupScript()
SettingsComponent.ensureBackupServices() as loader
installRepeatEnhancements()
ui-persistence-bindings.js
repeat-storage.js
data-service-repeat.js
data-service-backup.js
__repeatState
```

## Step 6 — Review exact repair diff

Expected direct code changes initially:

```text
5 storage service modules
1 Sidebar module
```

Additional files are allowed only if the full Part 5 audit proves another concrete migration defect.

No CSS/HTML/product redesign should be mixed into this repair unless required by an identified Part 5 regression.

---

# 9. Mandatory Manual Regression Matrix

Static checks alone are not enough because the original missing-import defect only appears when affected functions execute.

## 9.1 Task hierarchy / reorder

Test and refresh after each representative write:

```text
Custom root reorder
Name → drag → automatic Custom
Due Date → drag → automatic Custom
Priority → drag → automatic Custom
Created Date → drag → automatic Custom
Subtask reorder
root → Subtask
Subtask → root
reparent Subtask
Link to Parent
Unlink
supported cross-group lane move
```

Expected:

```text
no "AppStateSync is not defined"
no false save-failure banner
UI updates immediately
refresh keeps the same result
ID23 Custom-sort semantics remain correct
```

## 9.2 Project / Tag CRUD

For both Project and Tag:

```text
create
edit name/icon/viewType
delete
add child
change parent
open/close modal
parent picker
icon picker
```

Expected immediate UI update and refresh persistence.

## 9.3 Project / Tag hierarchy drag

For both:

```text
reorder
indent
outdent
reparent
cycle prevention
refresh persistence
```

## 9.4 Custom reminders

```text
create custom reminder
use it on Task
refresh
reuse it
delete it
verify affected Task relation is removed
verify fallback reminder state
```

## 9.5 Part 2 Repeat parity

At minimum recheck:

```text
Daily
Weekly
Monthly
Yearly
Custom Repeat
Repeat Ends Never
Repeat Ends On Date
Repeat Ends After N
repeating Subtask
complete/uncomplete
refresh
```

## 9.6 Backup / Restore

Run ID19 safety regression:

```text
Create Backup
modify/delete representative data
Restore
confirm exact state returns
invalid JSON rejected
orphan/corrupt backup rejected before destructive transaction
Cancel performs no restore
Repeat state does not restart
```

## 9.7 Recent mobile repairs

Confirm this repair does not regress ID21/ID22:

```text
Priority/Tags/Project menus keep keyboard open
Date closes keyboard before Schedule
Schedule Apply/Cancel restores previous field/cursor and keyboard
context menus remain unclipped
New/Edit Task
New/Edit Subtask
```

---

# 10. Console Noise vs Real Failures

During manual testing, do not confuse these with the Part 5 regression unless they have functional impact:

```text
favicon.ico 404
localhost:8081 refresh WebSocket failure
browser-extension/content-script messages
```

The confirmed real failure class is application code throwing runtime exceptions such as:

```text
ReferenceError: AppStateSync is not defined
```

After repair, test with console open and investigate **any new application-origin ReferenceError/TypeError**, even if the UI appears to recover.

---

# 11. Data-Safety Rules

Because some current failures may occur after IndexedDB commit:

```text
never clear IndexedDB to "fix" the mismatch
never reseed sample data
never bump/reset DB schema for this repair
never rewrite Backup format
```

Use normal hydration on refresh to reconcile persisted data into memory.

If a failed-looking operation already persisted, treat that as expected evidence of the old bug, not corruption requiring deletion.

---

# 12. Definition of Done

ID24 is complete only when:

1. All five missing `AppStateSync` imports are fixed.
2. Sidebar no longer depends on the removed Project/Tag config/core globals.
3. Part 5's full changed-file dependency audit has been rerun.
4. Every named import resolves to a real export.
5. Import graph is acyclic.
6. Known migrated application dependencies have zero undeclared lexical references.
7. Every remaining application `window.*` dependency is either one of the five deliberate component bridges or explicitly justified.
8. No old runtime loader/patch infrastructure is restored.
9. Task hierarchy/reorder manual regression passes.
10. ID23 Custom-sort/manual-drag behavior passes.
11. Project/Tag CRUD and taxonomy drag pass.
12. Custom reminder create/delete pass.
13. Repeat regression passes.
14. Backup/Restore safety regression passes.
15. ID21/ID22 mobile focus behavior remains correct.
16. Important writes survive hard refresh.
17. Console has no new application-origin ReferenceError/TypeError during the regression matrix.

Do not mark ID20 tracker problems complete solely from static checks. Manual verification remains required.
