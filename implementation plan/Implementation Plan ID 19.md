# Implementation Plan ID 19 — Full Application Backup and Transactional Restore

## 1. Goal

Add a **Backup & Restore** section to Settings so the user can:

1. **Create Backup** — download one JSON file containing every piece of durable TodoList data currently stored by the application.
2. **Restore Backup** — choose one previously exported JSON backup, validate it completely, warn that restore replaces current local data, then replace the current database atomically and reload the application.

The primary requirement is data safety:

> A restore must either replace the complete application dataset successfully, or leave the existing dataset unchanged.

This plan implements tracker Problem **#24 — Add JSON Export / Import backup**.

---

## 2. Important scope definition: what “everything” means

Backup **every saved/durable value** that can affect the application after a page reload.

### IndexedDB — back up every current object store

`TodoListDB` version 1 currently has nine stores:

1. `projects`
2. `tags`
3. `tasks`
4. `task_tags`
5. `reminder_definitions`
6. `task_reminders`
7. `task_repeat_rules`
8. `app_settings`
9. `app_meta`

Do **not** reconstruct these stores from `AppState` during export. Export their raw rows directly from IndexedDB.

This is important because raw storage contains information that can be lost or changed when converted into the in-memory model, including:

- Project IDs, parent IDs, `sortOrder`, view type, timestamps.
- Tag IDs, parent IDs, `sortOrder`, view type, timestamps.
- Task IDs, Project IDs, Subtask `parentTaskId`, completion state, date/time, priority, ordering, timestamps.
- Task ↔ Tag relations.
- Reminder definitions, including user-created custom reminder definitions.
- Task ↔ Reminder relations and their order.
- Repeat rules.
- Repeat-series state added by the Repeat implementation, such as `seriesId`, `occurrenceNumber`, anchor information and `familySlotId` fields stored on raw rows.
- Workspace settings such as Sort, Sort Direction and Group.
- Application metadata such as initialization/data-version records.

### localStorage — back up persisted preferences outside IndexedDB

The theme is currently saved separately as:

```text
localStorage['theme']
```

Include it in the backup envelope.

### Intentionally NOT backed up

Do not pretend transient/session-only state is durable application data. The following should not be exported:

- An open modal/dialog.
- An unsaved Task/Subtask currently being typed.
- An open context menu.
- Drag-in-progress state.
- Current temporary Schedule draft.
- Current filter/navigation position unless it becomes persisted in a later feature.
- Session-only Completed collapse state.

If data has not been saved to IndexedDB/localStorage, it is outside this backup contract.

---

## 3. Current architecture findings that the implementation must respect

### 3.1 IndexedDB is relational and normalized

The application does not store one giant Task object. Important relationships live in separate stores.

For example:

```text
tasks
  ↕
task_tags → tags
  ↕
task_reminders → reminder_definitions
  ↕
task_repeat_rules
```

Therefore a backup that exports only `AppState.tasks` would be incomplete.

### 3.2 Repeat persistence contains runtime-extended raw fields

`repeat-storage.js` currently decorates the mapper/service at runtime and persists Repeat-specific state beyond the basic mapper definition.

For backup purposes, this is another reason to copy raw IndexedDB rows instead of attempting to recreate rows using mapper functions.

### 3.3 Theme is not in IndexedDB

`ThemeManager` reads/writes the theme through `localStorage`, so backup/restore must handle it separately.

### 3.4 Existing hydration/repair logic should remain authoritative

`AppPersistence.hydrateState()` already knows how to:

- read the normalized stores;
- repair invalid persisted relationships;
- reconstruct Task tags/reminders/repeat state;
- hydrate Projects/Tags/Tasks/settings;
- restore custom reminders into the Schedule UI.

After a successful restore, prefer a **full page reload** so normal startup/hydration/repair runs from the newly restored database instead of creating a second hand-written in-memory rehydration path inside Backup code.

### 3.5 Writes are serialized through `AppDataService._writeQueue`

Before creating a snapshot or starting a destructive restore, wait until previously queued writes are finished. Otherwise a backup could be captured halfway between user actions.

Add a tiny public service helper:

```js
whenIdle() {
  return this._writeQueue;
}
```

Backup code should call the public helper instead of directly depending on `_writeQueue`.

---

## 4. Product / Settings UX

Extend the existing Settings dialog below **Appearance Theme** with a new section:

```text
Preferences

Appearance Theme                 [ toggle ]

Data
Backup all saved tasks, projects, tags,
reminders, repeat data and preferences.

[ Create Backup ]   [ Restore Backup ]

(status / selected backup summary)

                           [ Done ]
```

### Create Backup

Button label:

```text
Create Backup
```

Description should make clear that the resulting JSON contains readable personal data, for example:

```text
Downloads all saved application data as a JSON file. Keep the file somewhere safe.
```

### Restore Backup

Button label:

```text
Restore Backup
```

Use a visually hidden file input:

```html
<input type="file" accept="application/json,.json">
```

Clicking Restore triggers that input.

Do **not** add another nested restore modal. Problem #2 already tracks modal focus lifecycle problems. Keep restore confirmation inside the existing Settings dialog.

### Two-step destructive confirmation

After a backup file is selected and passes validation, do **not** restore immediately.

Show an inline summary such as:

```text
Backup ready to restore
Created: Aug 13, 2026, 9:15 PM
42 tasks · 7 projects · 12 tags

This replaces all current local TodoList data.

[ Cancel ] [ Restore and Replace ]
```

Only the second button performs the destructive transaction.

### Status/error feedback

Add a small `aria-live="polite"` status element inside Settings.

Examples:

- `Backup downloaded.`
- `Backup file is valid and ready to restore.`
- `This is not a TodoList backup file.`
- `This backup was created by a newer unsupported data format.`
- `Restore failed. Your existing data was not replaced.`

Do not rely only on console output.

---

## 5. Backup JSON contract

Create a versioned application-owned envelope rather than dumping an anonymous object.

Recommended v1 shape:

```json
{
  "format": "TodoListBackup",
  "formatVersion": 1,
  "createdAt": "2026-08-13T18:15:00.000Z",
  "database": {
    "name": "TodoListDB",
    "schemaVersion": 1,
    "dataVersion": 1
  },
  "preferences": {
    "theme": "dark"
  },
  "stores": {
    "projects": [],
    "tags": [],
    "tasks": [],
    "task_tags": [],
    "reminder_definitions": [],
    "task_reminders": [],
    "task_repeat_rules": [],
    "app_settings": [],
    "app_meta": []
  }
}
```

### Why version the backup itself?

IndexedDB schema version and backup-file format version solve different problems.

Use:

```text
formatVersion
```

for the JSON contract.

Use:

```text
database.schemaVersion
```

for the source IndexedDB schema.

This lets future versions add a backup migration layer instead of guessing how an old JSON file should be interpreted.

### Preserve raw rows exactly

Within each `stores.*` array, preserve all enumerable fields from IndexedDB.

Do not pass rows through `taskFromRow()`, `taskToRow()`, `repeatFromRow()` or `repeatToRow()` just to export them.

That avoids losing Repeat-series fields or future fields unknown to an older mapper path.

---

## 6. New module: `js/storage/backup-service.js`

Create one focused backup module:

```text
window.AppBackupService
```

Suggested responsibilities:

```text
createSnapshot()
serializeSnapshot()
downloadBackup()
parseBackupFile(file)
validateBackup(snapshot)
getRestoreSummary(snapshot)
restoreBackup(snapshot)
```

Keep file-download/file-reading mechanics here rather than bloating `settings.js`.

Settings owns interaction state; BackupService owns backup format, validation and persistence operations.

---

## 7. Export implementation

### Step 7.1 — wait for pending writes

Before reading IndexedDB:

```text
await AppDataService.whenIdle()
```

This prevents a snapshot from racing with a Task/Project/Tag/reminder/drag write.

### Step 7.2 — one readonly transaction over every store

Get store names from the schema rather than duplicating string constants where possible:

```js
const storeNames = Object.values(TodoDbSchema.STORES);
```

Open one readonly transaction containing all stores and `getAll()` each one.

One transaction gives the backup one consistent IndexedDB snapshot.

### Step 7.3 — read backup metadata

Determine `dataVersion` from the exported `app_meta` row where:

```text
key === 'dataVersion'
```

Also write current:

```text
TodoDbSchema.NAME
TodoDbSchema.VERSION
```

into the envelope.

### Step 7.4 — include theme

Use the durable stored value:

```js
localStorage.getItem('theme') || 'dark'
```

Normalize to `dark`/`light` before export.

### Step 7.5 — serialize and download

Use pretty JSON for recoverability/debuggability:

```js
JSON.stringify(snapshot, null, 2)
```

Create a Blob:

```text
application/json
```

Use an object URL + temporary `<a download>` and always revoke the URL afterward.

Recommended filename:

```text
todolist-backup-2026-08-13-211500.json
```

No server/network upload is needed.

---

## 8. Restore implementation — safety first

Restore is destructive, so follow this strict sequence:

```text
Select file
   ↓
Read text
   ↓
Parse JSON
   ↓
Validate backup envelope
   ↓
Validate every store and relationship
   ↓
Show summary + explicit confirmation
   ↓
Wait for pending writes
   ↓
ONE readwrite transaction across ALL stores
   ↓
Clear + repopulate all stores
   ↓ transaction commits successfully
Apply theme to localStorage
   ↓
Reload page
```

**Never clear current IndexedDB data before validation succeeds.**

---

## 9. Backup validation requirements

Validation must happen completely **before** opening the destructive restore transaction.

Do not accept arbitrary JSON merely because `JSON.parse()` succeeds.

### 9.1 Envelope validation

Require:

- plain object;
- `format === 'TodoListBackup'`;
- supported integer `formatVersion`;
- valid ISO-like `createdAt` string;
- `database` object;
- `stores` object;
- `preferences` object.

### 9.2 Version policy

Initial implementation supports:

```text
formatVersion = 1
```

If `formatVersion > 1`, reject with a clear message:

```text
This backup was created by a newer version of the application and cannot be restored safely.
```

Structure validation should be isolated so a future `migrateBackup()` layer can be added without rewriting Settings.

### 9.3 Required stores

For v1 require an array for each known current store:

```text
projects
tags
tasks
task_tags
reminder_definitions
task_reminders
task_repeat_rules
app_settings
app_meta
```

### 9.4 Primary key uniqueness

Before restore, detect duplicate keys.

Examples:

- duplicate Project `id`;
- duplicate Tag `id`;
- duplicate Task `id`;
- duplicate `[taskId, tagId]` relation;
- duplicate reminder-definition `id`;
- duplicate `[taskId, reminderId]` relation;
- duplicate Repeat `taskId`;
- duplicate setting/meta `key`.

Reject the backup rather than depending on an IndexedDB constraint error after current data has begun to be replaced.

### 9.5 Referential integrity

Validate relationships against IDs in the same backup:

#### Projects

- `parentId` is null or points to an existing Project.
- no self-parent.
- no Project parent cycle.

#### Tags

- `parentId` is null or points to an existing Tag.
- no self-parent.
- no Tag parent cycle.

#### Tasks

- `projectId` is null or references a restored Project.
- `parentTaskId` is null or references an existing restored Task.
- no Task can parent itself.
- preserve the current one-level Subtask rule: a Subtask parent must be a root Task, not another Subtask.

#### Task Tags

Every relation must reference both:

```text
existing taskId
existing tagId
```

#### Task Reminders

Every relation must reference both:

```text
existing taskId
existing reminderId
```

#### Repeat rules

Every `taskId` must reference an existing Task.

### 9.6 Basic row-shape checks

Do lightweight validation for fields required by the current app instead of attempting to rewrite all rows.

Examples:

- IDs/keys are non-empty strings.
- `sortOrder` values expected by ordered entities are finite numbers.
- Task completion is compatible with current 0/1 persisted representation.
- arrays such as Repeat weekday/month-date state remain arrays where expected.

The goal is to reject corruption, not normalize legitimate raw storage into a different representation.

### 9.7 Theme validation

Only restore:

```text
dark
light
```

If absent in an otherwise valid v1 backup, use current/default `dark` rather than allowing arbitrary HTML/theme values.

---

## 10. Transactional replace strategy

### One transaction, every store

After validation and user confirmation:

```js
TodoDb.withTransaction(allStoreNames, 'readwrite', async tx => {
  // clear each store
  // repopulate each store
  // enforce safe internal metadata
})
```

IndexedDB transactions are atomic. If any request fails or the transaction aborts, none of the clears/writes should commit.

That gives the required behavior:

```text
SUCCESS → complete restored dataset
FAILURE → old dataset remains
```

### Clear before repopulate inside the same transaction

For each store:

```text
clear(store)
```

Then insert the validated backup rows.

Do not merge by ID. Restore means **replace**, not synchronization.

Merge import would create difficult questions about hierarchy, recurrence series, deleted items and relation conflicts; it is explicitly outside this feature.

### Internal `app_meta` safety

The JSON should contain `app_meta`, but restore should not blindly trust reserved bootstrap keys.

After copying supported imported metadata, enforce:

```text
initialized = true
```

and set/normalize the current supported `dataVersion` value used by the application.

This prevents a successful restore from being mistaken for first-run state and reseeded on the next startup.

Preserve any non-reserved metadata rows that belong to the supported format.

### Built-in reminder definitions

A normal backup includes built-ins because the raw `reminder_definitions` store is exported.

Validation must guarantee every `task_reminders.reminderId` exists in `reminder_definitions`.

Do not silently drop reminder relations during import.

---

## 11. Failure / rollback rules

### Invalid file

If parsing or validation fails:

```text
- do not open destructive transaction;
- do not clear any store;
- do not change theme;
- keep Settings open;
- show exact useful error.
```

### Database write failure

If transaction fails:

```text
- transaction aborts;
- existing IndexedDB stays unchanged;
- theme stays unchanged;
- no page reload;
- show “Restore failed. Your existing data was not replaced.”
```

### Theme is applied last

Because `localStorage` cannot join an IndexedDB transaction, never change the theme before the database transaction commits.

Correct order:

```text
IndexedDB commit succeeds
        ↓
write restored theme to localStorage
        ↓
reload
```

If IndexedDB fails, the old theme remains too.

---

## 12. Post-restore startup

After the restore transaction and theme write both succeed:

```js
window.location.reload()
```

Do not manually mutate:

```text
AppState.projects
AppState.tags
AppState.tasks
ScheduleComponent.customReminders
WorkspaceControls
Sidebar DOM
Task DOM
```

inside the restore code.

Reloading deliberately reuses the current startup pipeline:

```text
ThemeManager.init()
→ IndexedDB initialize
→ hydration
→ relationship repair
→ Repeat-state repair
→ persistent UI binding
→ UI initialization
```

This keeps one authoritative path for turning persisted storage into runtime state.

---

## 13. Settings component changes

### `index.html`

Inside `#settings-modal`, add:

- a `Data` section heading/description;
- `#btn-create-backup`;
- `#btn-restore-backup`;
- hidden `#restore-backup-input` file input;
- inline validation/summary container;
- `#btn-confirm-restore` destructive button, hidden until a file validates;
- `#btn-cancel-restore`;
- `#backup-restore-status` with `aria-live="polite"`.

Keep existing theme and Done controls intact.

### `js/components/settings.js`

Add references and event wiring only.

Suggested Settings-owned state:

```text
pendingRestoreSnapshot
restoreBusy
backupBusy
```

Interactions:

```text
Create Backup click
→ disable backup/restore buttons
→ AppBackupService.downloadBackup()
→ status
→ re-enable

Restore Backup click
→ reset old pending state
→ open file picker

file change
→ AppBackupService.parseBackupFile(file)
→ AppBackupService.validateBackup(snapshot)
→ show summary/confirmation

Cancel
→ clear pending snapshot + file input

Restore and Replace
→ AppBackupService.restoreBackup(snapshot)
```

Clear the file input value after cancel/failure so selecting the same file again still fires `change`.

### Focus behavior

Do not introduce a nested modal.

After selecting a valid file, focus the inline confirmation area / Restore-and-Replace button only if that does not conflict with the existing Settings focus manager.

After canceling restore confirmation, return focus to `Restore Backup`.

---

## 14. CSS changes

Prefer extending `css/components/modal-controls.css` because the Backup UI lives inside Settings and is small.

Add focused styles for:

```text
.settings-section
.settings-section-title
.settings-data-actions
.settings-data-note
.backup-restore-status
.restore-summary
.restore-confirm-actions
.btn-danger / destructive restore button
```

Do not create a large new stylesheet for a handful of Settings controls unless the CSS grows enough to justify it.

Ensure narrow/mobile layout stacks the two Data buttons cleanly.

---

## 15. Bootstrap/load integration

Add:

```text
js/storage/backup-service.js
```

to the current `BOOTSTRAP_SCRIPTS` list **after** the core storage/database/service dependencies it uses and before `SettingsComponent.init()` is called.

Do not convert the application's module architecture as part of this feature. Problem #11 / ID18 owns that broader refactor.

ID19 should work against the current clean `main` architecture.

---

## 16. Recommended implementation sequence / commits

Keep the implementation reviewable.

### Commit 1 — public write-idle boundary

Files:

```text
js/storage/data-service.js
```

Add only the tiny public `whenIdle()` helper.

### Commit 2 — backup format + raw export

Files:

```text
js/storage/backup-service.js
js/app.js
```

Implement:

- store enumeration;
- consistent readonly snapshot;
- envelope v1;
- theme capture;
- JSON download.

Do not add restore yet.

### Commit 3 — validation + transactional restore

File:

```text
js/storage/backup-service.js
```

Implement:

- JSON envelope validation;
- store/key validation;
- relationship/hierarchy validation;
- summary generation;
- all-store transactional replacement;
- app_meta reserved-key enforcement;
- theme-last + reload.

### Commit 4 — Settings UI

Files:

```text
index.html
js/components/settings.js
css/components/modal-controls.css
```

Add Backup/Restore UI, file picker, inline confirmation and status handling.

### Commit 5 — focused cleanup / documentation

Only if static review finds small backup-specific integration issues.

Do not mix unrelated architecture cleanup into ID19.

---

## 17. Static verification before manual testing

No browser automation is required.

Verify by source review/search:

1. Backup store list derives from `TodoDbSchema.STORES` or is checked against it.
2. All nine IndexedDB stores are present in the v1 snapshot.
3. Theme is included separately.
4. Export does not reconstruct rows through `AppState` or mappers.
5. Restore validation happens before any `clear()`.
6. Restore uses one transaction containing all stores.
7. Theme is changed only after transaction success.
8. Restore does not manually mutate live UI/AppState before reload.
9. File input accepts JSON only as UI guidance, while code still validates actual content.
10. No cloud/network API is introduced.
11. `ui-persistence-bindings.js`, Repeat persistence and hierarchy code are not modified unnecessarily.
12. No IndexedDB schema-version bump is needed merely to add export/import logic.

---

## 18. Mandatory manual verification matrix

Use meaningful non-default data before testing.

### Test dataset

Create data covering every persisted domain:

- several root Projects;
- nested Projects with custom order;
- List and Kanban Project view types;
- several root Tags;
- nested Tags with custom order;
- active Tasks;
- completed Tasks;
- root Task with multiple Subtasks;
- reordered Tasks/Subtasks;
- Tasks with descriptions;
- each priority;
- dates and times;
- multiple Tags;
- Projects;
- built-in reminders;
- at least one custom reminder;
- repeating Task;
- custom Repeat rule with an end rule;
- a Repeat series that has already advanced to another occurrence if practical;
- non-default Sort/Group/Direction settings;
- non-default theme.

### A. Backup creation

1. Open Settings.
2. Click Create Backup.
3. Confirm one `.json` file downloads.
4. Open it as text and confirm top-level envelope/version metadata exists.
5. Confirm every current store is represented.
6. Confirm theme is represented.

### B. Exact restore after destructive changes

After creating backup:

1. Delete several Tasks.
2. Delete/change a Project.
3. Change Tag hierarchy/order.
4. Complete/uncomplete Tasks.
5. Change Sort/Group.
6. Change theme.
7. Delete a custom reminder if possible.
8. Then restore the backup.
9. Confirm the page reloads.
10. Verify the pre-backup state has returned.

### C. Task hierarchy

Verify after restore:

- parent Task IDs are preserved;
- Subtasks are still attached to the same parent;
- Subtask order is preserved;
- root order is preserved.

### D. Project/Tag hierarchy

Verify:

- parent links;
- nested depth;
- sibling order;
- icons/names;
- List/Kanban view settings.

### E. Tags and reminders

Verify:

- each Task keeps its Tag membership;
- custom reminder definition returns;
- Tasks referencing custom reminders keep those relations;
- reminder order remains correct.

### F. Repeat

This is a critical data-safety test.

Verify:

- Repeat pattern returns;
- Repeat end rule returns;
- current occurrence number/series identity is not reset by backup/restore;
- calendar anchor fields are not lost;
- completing the restored repeating Task creates the correct next occurrence rather than restarting the series.

### G. Workspace settings + theme

Verify:

- Sort field;
- Sort direction;
- Group field;
- Project/Tag view type;
- theme.

### H. Empty state backup

Restore a valid backup representing a deliberately empty user dataset and verify the application remains intentionally empty rather than reseeding sample data.

This specifically verifies `app_meta.initialized` handling.

### I. Invalid JSON

Choose a `.json` file containing invalid JSON.

Expected:

```text
error shown
current data unchanged
no reload
```

### J. Wrong JSON

Choose valid JSON that is not a `TodoListBackup` envelope.

Expected:

```text
rejected before restore confirmation
current data unchanged
```

### K. Missing store

Remove one required store array from a backup copy.

Expected: reject before destructive transaction.

### L. Duplicate key

Duplicate a Task ID or relation key in a backup copy.

Expected: reject before destructive transaction.

### M. Orphan relationship

Change a `task_tags` row to reference a nonexistent Tag.

Expected: reject before destructive transaction.

### N. Hierarchy cycle

Modify Project/Tag parent IDs in a backup copy to form a cycle.

Expected: reject before destructive transaction.

### O. Future format

Change:

```json
"formatVersion": 999
```

Expected: clear “newer/unsupported backup” error; no database changes.

### P. Cancel restore

Select a valid backup, then Cancel from the inline confirmation.

Expected: no data changes; Restore button regains usable focus; same file can be selected again.

---

## 19. Acceptance criteria

ID19 is complete only when all of the following are true:

- Settings visibly contains **Create Backup** and **Restore Backup**.
- Create Backup downloads a single versioned JSON file.
- Every current IndexedDB object store is included.
- Theme is included.
- Raw persisted IDs/relationships/order/state are preserved.
- Restore is full replacement, not merge.
- Invalid backups are rejected before current data is touched.
- Restore occurs in one all-store IndexedDB transaction.
- Transaction failure cannot leave a half-restored database.
- Theme is not changed unless the database transaction succeeds.
- Successful restore reloads and uses the normal hydration/repair/startup path.
- Project/Tag hierarchy and ordering survive.
- Task/Subtask hierarchy and ordering survive.
- Tags/reminders survive.
- Repeat series/occurrence/anchor state survives.
- Sort/Group/Direction/view settings survive.
- Empty intentionally restored databases do not get sample data reseeded.
- No browser automation is run for this project.
- The permanent tracker Problem #24 is marked `[x]` only after implementation review and important manual verification.

---

## 20. Explicit non-goals

Do not expand ID19 into:

- cloud synchronization;
- Google Drive/Dropbox backup;
- scheduled automatic backups;
- encrypted/password-protected backups;
- merge/import conflict resolution;
- selective Project-only export;
- CSV export;
- account/login support;
- reminder-notification delivery;
- IndexedDB architecture refactor;
- ID18 architecture cleanup;
- ES-module conversion.

Those can be separate work later if desired.

---

## 21. Final intended architecture

```text
Settings UI
   │
   ├── Create Backup
   │       ↓
   │   AppBackupService
   │       ↓ waitForIdle
   │   ONE readonly IndexedDB snapshot of all stores
   │       +
   │   persisted theme
   │       ↓
   │   versioned JSON download
   │
   └── Restore Backup
           ↓
       read + parse
           ↓
       full validation
           ↓
       user confirmation
           ↓
       waitForIdle
           ↓
       ONE readwrite transaction
       clear + restore every store
           ↓ commit success
       restore theme
           ↓
       reload
           ↓
       existing startup/hydration/repair pipeline
```

The most important principle is:

> **Backup copies the storage truth; Restore validates first and replaces the storage truth atomically.**
