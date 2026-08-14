# Implementation Plan ID 20 — Part 5 of 5

## Native ES-Module / Bootstrap Cutover + Final Audit and Verification (#11, #12)

> **Status:** Plan only. No application code is implemented by this file.
>
> **Source plan:** `implementation plan/Implementation Plan ID 20.md`.
>
> **Prerequisites:** Parts 1–4 must be stable first.

---

# 1. Goal of This Part

Finish ID20 by simplifying application loading and then performing the final ownership/regression audit.

This Part addresses:

```text
#11 Simplify JavaScript module loading / bootstrap order
#12 Preserve/audit the existing staged bootstrap error reporting
```

It also contains the final dead-code audit, manual regression matrix, and tracker update rules for Problems #6–#14.

Do not combine this module conversion with new business-logic refactors.

---

# 2. Pre-Cutover Gate

Do not begin native-module conversion until all of the following are true:

```text
ui-persistence-bindings.js gone
Repeat patch files gone
reminder ownership clean
AppState write surface reduced
Project/Tag shared core stable
stable UI one-source cleanup stable
Backup/Restore passes regression
existing staged bootstrap error reporting still works
```

Create a clean Git rollback checkpoint before the cutover.

---

# 3. Current Loading Problems Being Removed

Current architecture has multiple loading/installation mechanisms:

```text
1. hand-ordered classic <script> list in index.html
2. BOOTSTRAP_SCRIPTS in app.js
3. runtime script injection through loadScript()
4. Settings backup runtime script loading
5. late Object.assign / method installation for behavior ownership
```

Parts 1–4 should already have removed most late behavior ownership.

Part 5 removes the remaining load-order dependency.

---

# 4. Step 1 — Introduce One Explicit Native Module Entry

Preferred final entry:

```html
<script type="module" src="js/bootstrap.js"></script>
```

The exact entry filename may differ, but there should be one explicit application bootstrap entry.

Final production loading must not depend on:

```text
long classic-script ordering
BOOTSTRAP_SCRIPTS
runtime loadScript() injection
SettingsComponent.loadBackupScript()
SettingsComponent.ensureBackupServices() as a script loader
late behavior installation needed only because of script order
```

---

# 5. Step 2 — Convert Dependencies in a Low-Risk Order

Suggested conversion order:

```text
1. pure helpers/models
2. database schema/db/repositories/mappers
3. state/read helpers
4. persistence/data services/reminder/repeat/backup services
5. UI components
6. bootstrap composition
7. remove temporary global bridges
```

Do not convert everything blindly in one giant edit.

Use small checkpoints so an import/circular-dependency problem can be isolated.

---

# 6. Step 3 — Preserve Dependency Direction

Preferred direction:

```text
pure helpers/models
        ↑
state/read model + storage/domain helpers
        ↑
AppDataService / persistence / backup
        ↑
UI components
        ↑
bootstrap composition
```

Data/service modules must not import UI components.

Avoid circular dependencies.

If a circular dependency appears, move shared pure logic downward rather than adding another runtime global patch.

---

# 7. Step 4 — Bring Backup/Restore into the Explicit Module Graph

Backup/Restore must no longer use a special runtime loader.

Explicit module graph must include:

```text
backup-validation
backup-service
AppDataService.whenIdle
TodoDbSchema
TodoDb
TodoRepositories
Settings UI
```

Preserve ID19 behavior exactly:

```text
Create Backup
→ await pending writes
→ read raw stores
→ include persisted theme
→ versioned JSON

Restore
→ parse + validate fully first
→ await pending writes
→ one all-store readwrite transaction
→ apply theme only after DB commit
→ reload through normal startup/hydration
```

Do not redesign the Backup format as part of module conversion.

---

# 8. Step 5 — Remove Classic/Runtime Loader Infrastructure

After imports are working:

```text
remove hand-ordered classic application script list
remove BOOTSTRAP_SCRIPTS
remove app.js loadScript() runtime injection
remove Settings backup script injection
remove loader-specific integration installation no longer needed
```

Keep only deliberate dynamic behavior that is product behavior, not architecture bootstrapping.

---

# 9. Step 6 — Preserve Existing Bootstrap Error Classification (#12)

Problem #12 already has a useful implementation baseline.

Do not replace it with one generic error.

Final bootstrap must still distinguish representative stages such as:

```text
module/import/integration failure
database open failure
database repair failure
hydration failure
UI initialization failure
```

Current labels may remain conceptually equivalent to:

```text
MODULE_LOAD
INTEGRATION
DATABASE_OPEN
DATABASE_REPAIR
HYDRATION
UI_INIT
```

If module syntax changes how module-load errors are caught, adapt the reporting mechanism while preserving the category distinction.

Original exceptions should remain visible in console diagnostics.

No startup failure may clear existing user data.

---

# 10. Step 7 — Remove Temporary Global Bridges Carefully

During migration, temporary `window.*` bridges may be useful.

Remove them only after import-based callers are established.

Do not remove a global merely because a file was converted if another unconverted module still depends on it.

Final goal:

```text
behavior ownership comes from imports/exports
not load order
not window mutation
```

A few intentional browser-global entry points are acceptable if they are deliberate and not required to patch behavior after load.

---

# 11. Step 8 — Final Dead-Code / Ownership Audit

Perform repository-wide static searches after module cutover.

## Problem #6

Expected:

```text
ui-persistence-bindings.js gone
bindPersistentUiMutations = zero production refs
no shadow UI persistence handlers
```

## Problem #7

Expected:

```text
repeat-storage.js gone
data-service-repeat.js gone
__repeatState = zero refs
one Repeat mapper/build/write/repair path
one completion path
```

## Problem #8

Expected:

```text
task-relations no longer captures AppState CRUD
UI does not use old AppState mutation APIs for domain writes
read selectors do not mutate/rebuild state as a side effect
```

## Problem #9

Expected:

```text
common Project/Tag UI behavior lives once
thin wrappers/config remain understandable
```

## Problem #10

Expected:

```text
data/service/persistence refs to ScheduleComponent = 0
reminder commands no longer live in taxonomy service
```

## Problem #11

Expected:

```text
one module entry
BOOTSTRAP_SCRIPTS gone
runtime app script injection gone
Settings backup runtime loader gone
data-service-backup.js gone
no late behavior patch installation required for load order
```

## Problem #12

Expected:

```text
staged startup error reporting still present
original exception available in console
storage-specific message only for storage failure
```

## Problems #13/#14

Audit at least:

```text
workspace menu
Task Project/Tag picker placeholders
Completed header
Task hierarchy action controls
Repeat Ends stylesheet/markup
Settings Backup/Restore markup
```

Each should have one owner.

## Extra drag audit

Audit:

```text
js/storage/data-service-drag.js
```

against the final hierarchy drag implementation.

Delete only if proven unused.

---

# 12. Full Manual Regression Matrix

Run the complete regression before declaring ID20 finished.

## 12.1 Tasks

- Create root Task in Inbox.
- Create under active Project filter.
- Create under active Tag filter.
- Edit title/description.
- Edit priority.
- Date/time.
- built-in reminder.
- custom reminder.
- Repeat.
- Complete/uncomplete.
- Delete.
- Refresh after important writes.

## 12.2 Subtasks / hierarchy

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
- supported group-lane moves.
- refresh persistence.

## 12.3 ID15 family-aware filtering

Verify List and Kanban:

```text
parent matches → show parent family
parent does not match, child matches → child appears standalone visually
stored parentTaskId remains unchanged
```

## 12.4 ID16 safe rendering

Use Project/Tag names/icons containing HTML-sensitive characters.

Confirm Task pickers render literal text safely.

## 12.5 ID17 ordering

Reorder/reparent Tags and verify after refresh:

```text
sidebar order
main Task Tag picker order
Subtask Tag picker order
```

remain consistent.

---

# 13. Full Repeat Regression

Re-run the Part 2 matrix:

```text
plain Task completion/uncomplete
Daily/Weekly/Monthly/Yearly
Custom day/week/month/year
repeating Subtask direct completion
parent/child Repeat combinations
multiple child family slots
Repeat Ends Never/On Date/After N
historical uncomplete
month-end anchors
leap behavior
custom month/year dates
```

Module conversion must not alter recurrence behavior.

---

# 14. Project/Tag Regression

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

---

# 15. Workspace Regression

Test:

```text
List
Kanban
Sort Custom
Sort Due Date
Sort Priority
Sort Name
Sort Created Date
Asc/Desc where applicable
Group None
Group Priority
Group Date
Group Project
Group Tag
hierarchy drag returns Sort to Custom
saved Project/Tag viewType after refresh
Timeline remains unavailable
```

---

# 16. Reminder Regression

Test:

- built-in reminder.
- multiple reminders.
- create custom reminder.
- refresh.
- reuse custom reminder.
- delete custom reminder.
- affected Task relations removed.
- fallback to None where needed.
- Schedule reads correct reminder state after reopen/refresh.

---

# 17. Mandatory Backup/Restore Regression

Create representative data containing:

```text
Project/Tag hierarchy/order
root Task + Subtasks
custom reminders
Repeat rule + series/occurrence state
Sort/Group/view settings
theme
```

Then:

1. Create Backup.
2. Confirm JSON download.
3. Change/delete several pieces of data.
4. Restore Backup.
5. Confirm reload.
6. Confirm pre-backup state returns.
7. Confirm Repeat series/occurrence state did not restart.
8. Confirm empty valid backup does not reseed sample data.
9. Confirm invalid JSON is rejected without data change.
10. Confirm corrupted/orphan backup is rejected before destructive work.
11. Confirm cancel performs no restore.

---

# 18. Startup / #12 Manual Verification

When practical during development, verify representative failures:

```text
module/import/integration failure → module/integration message
database open failure             → database-open message
repair failure                    → repair message
hydration failure                 → hydration message
UI initialization failure         → UI-init message
```

No failure path may clear existing IndexedDB data.

---

# 19. Tracker Update Rule

Problems #6–#14 must be handled individually.

Do not mark all of them complete merely because all five Part files were implemented.

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

```text
code existed before ID20
→ verify baseline
→ preserve through module cutover
→ manually verify representative categories
→ then mark complete
```

Do not edit unrelated tracker items.

---

# 20. Out of Scope

Do not expand ID20 into unrelated work unless a concrete regression requires it:

```text
#2 full modal-focus completion / ID13
#5 real notification delivery
#15 hidden-sidebar focus
#16 generated Project/Tag keyboard semantics
#17 mobile pinch zoom
#18 Project picker visual indentation
#19 read-selector mutation as standalone tracker completion
#20 Repeat rendering mutation
#21 rerender optimization
#22 date formatting deduplication
#23 strict Repeat date parser
#25 broad test suite
#26 placeholder app navigation cleanup
#27 CSS import cleanup
```

Problem #24 Backup/Restore is already implemented. Only architecture integration required to preserve it is in scope.

Do not add:

```text
cloud backup
accounts
sync
encryption
backend
React/Angular/Redux
Vite/Webpack solely for this cleanup
```

Native browser ES modules are sufficient.

---

# 21. Final Definition of Done for Full ID20

ID20 is complete only when all of the following are true:

1. Current-main behavior was inventoried before migrations.
2. Existing #12 staged bootstrap errors were preserved.
3. ID17 Tag-order behavior remains intact.
4. ID19 Backup/Restore remains fully functional and data-safe.
5. `AppDataService.whenIdle()` has a real owner.
6. every former `ui-persistence-bindings.js` command lives in its real owner.
7. `ui-persistence-bindings.js` and `bindPersistentUiMutations` are gone.
8. Repeat mapping/build/write/repair/completion are explicit.
9. Repeat patch files are gone.
10. Repeat family-slot, series/occurrence and Repeat Ends behavior is verified.
11. reminder definitions belong to state/service data, not Schedule UI.
12. AppState is primarily a read model/selectors/navigation state, not a second public write service.
13. common Project/Tag UI behavior uses a shared core with thin understandable wrappers.
14. stable duplicate/runtime-replaced structures have one owner.
15. Settings Backup/Restore stable UI has one owner.
16. application loading uses one explicit native module entry.
17. no runtime ordered script injection remains for application/bootstrap/Backup loading.
18. staged bootstrap error classification still works after conversion.
19. no IndexedDB schema reset/destructive migration occurred.
20. full regression passes and important writes survive refresh.
21. Backup/Restore regression passes after all architecture changes.
22. Problems #6–#14 are marked complete individually only after their verification gates pass.

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
AppState / read selectors
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
