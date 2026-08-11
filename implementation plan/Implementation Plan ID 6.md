# Implementation Plan ID 6 — SQL-Style Relational Persistence on IndexedDB

## Goal

Add durable browser persistence so Tasks, Projects, Tags, task relationships, custom order, schedule data, and durable application preferences survive:

```text
refresh
browser close/reopen
device restart
```

The storage engine will be **IndexedDB**, but the database design must intentionally follow strong SQL / relational-database principles where they make sense:

- explicit logical tables;
- stable primary keys;
- foreign-key-style relationships;
- normalized many-to-many relationships;
- explicit ordering columns;
- indexes for common lookup paths;
- atomic transactions;
- cascade / set-null delete policies;
- validation constraints;
- schema versioning;
- migrations;
- one source of truth for durable data;
- a clear persistence/repository layer instead of random storage calls spread across UI code.

IndexedDB is not SQL and does not provide SQL joins or enforced foreign keys. Therefore the implementation must **model those concepts deliberately** in object stores and enforce integrity in the application layer.

---

# 1. Current Verified Application State

The current application keeps its durable domain data directly in JavaScript memory:

```text
AppState.projects[]
AppState.tags[]
AppState.tasks[]
```

Current refresh behavior therefore loses runtime-created data.

The current state includes:

### Projects

```text
id
name
icon
viewType
parentId
```

Projects support parent/child hierarchy.

### Tags

```text
id
name
icon
viewType
parentId
```

Tags also support parent/child hierarchy.

### Tasks

Tasks currently contain fields such as:

```text
id
title
description
project
priority
tags[]
completed
createdAt
dueDate
dueTime
reminders[]
repeat
parentTaskId
```

Tasks support one-level subtasks through `parentTaskId`.

### Current relationships

```text
Project
   ↑
   │ task.project
Task
   │
   ├── parentTaskId → Task
   │
   └── tags[] → Tag IDs
```

### Current custom task order

Custom order currently depends on the physical order of records inside:

```text
AppState.tasks[]
```

Drag-and-drop rewrites positions inside this in-memory array.

That is not sufficient for persistent database storage because database record iteration order must not be treated as a relational ordering contract.

### Current startup

The app currently initializes components immediately on `DOMContentLoaded`.

There is no asynchronous database-hydration phase before rendering.

### Current theme

Theme already uses `localStorage`, while the domain data does not persist.

This plan will introduce a unified durable data layer. Theme may be migrated into the settings store, with a tiny localStorage theme cache retained only if needed to prevent a visual flash during startup. IndexedDB remains the canonical durable source.

---

# 2. Relational Design Philosophy

The browser database should be designed conceptually like a normalized SQL database even though it is implemented using IndexedDB object stores.

Use this mental model:

```text
IndexedDB object store = SQL table
IndexedDB keyPath      = PRIMARY KEY
IndexedDB index        = SQL INDEX
composite keyPath      = composite PRIMARY KEY
application validation = FOREIGN KEY / CHECK constraints
readwrite transaction  = SQL transaction
```

Do not simulate SQL syntax unnecessarily.

The goal is relational discipline, not pretending IndexedDB is MySQL/PostgreSQL.

---

# 3. Target Database

Recommended database name:

```text
TodoListDB
```

Initial schema version:

```text
1
```

Do not use an ambiguous name such as `db`.

Expose constants centrally:

```text
DB_NAME = 'TodoListDB'
DB_VERSION = 1
```

---

# 4. Logical SQL Schema

The conceptual relational schema should be:

```text
PROJECTS
TAGS
TASKS
TASK_TAGS
REMINDER_DEFINITIONS
TASK_REMINDERS
TASK_REPEAT_RULES
APP_SETTINGS
APP_META
```

Relationship overview:

```text
┌──────────────┐
│ projects     │
│ PK id        │
│ FK parent_id ├──────┐
└──────┬───────┘      │ self hierarchy
       │              │
       │              └──────────────┐
       │                             │
       ▼                             │
┌──────────────┐                     │
│ tasks        │                     │
│ PK id        │                     │
│ FK project   │                     │
│ FK parent    ├─────────────────────┘ self task hierarchy
└──────┬───────┘
       │
       ├───────────────┐
       │               │
       ▼               ▼
┌──────────────┐  ┌─────────────────┐
│ task_tags    │  │ task_reminders  │
│ PK task+tag  │  │ PK task+reminder│
└──────┬───────┘  └────────┬────────┘
       │                    │
       ▼                    ▼
┌──────────────┐  ┌────────────────────┐
│ tags         │  │ reminder_definitions│
│ PK id        │  │ PK id               │
│ FK parent_id │  └────────────────────┘
└──────────────┘

Tasks 1 ─────── 0..1 task_repeat_rules
```

---

# 5. Table / Object Store: `projects`

IndexedDB object store:

```text
projects
keyPath: id
```

Logical SQL-like shape:

```text
projects
--------------------------------
id              PRIMARY KEY
name            NOT NULL
icon            NOT NULL
view_type       NOT NULL
parent_id       NULL FK projects.id
sort_order      NOT NULL
created_at      NOT NULL
updated_at      NOT NULL
```

Recommended IndexedDB record:

```js
{
  id,
  name,
  icon,
  viewType,
  parentId,
  sortOrder,
  createdAt,
  updatedAt
}
```

### Indexes

Create:

```text
by_parent_id → parentId
by_sort_order → sortOrder
```

### Constraints enforced in code

- `id` immutable and unique;
- non-empty trimmed name;
- `viewType` must be `list` or `kanban`;
- `parentId` is null or refers to an existing project;
- project may not parent itself;
- project hierarchy must contain no cycles;
- preserve existing behavior allowing duplicate project names unless a separate UX decision changes this later.

### Delete policy

Current application behavior must be preserved:

```text
DELETE project
    ↓
child projects.parentId = null      (ON DELETE SET NULL)
tasks.projectId = null              (ON DELETE SET NULL)
```

Perform all related changes inside one IndexedDB `readwrite` transaction.

---

# 6. Table / Object Store: `tags`

IndexedDB object store:

```text
tags
keyPath: id
```

Logical shape:

```text
tags
--------------------------------
id              PRIMARY KEY
name            NOT NULL
icon            NOT NULL
view_type       NOT NULL
parent_id       NULL FK tags.id
sort_order      NOT NULL
created_at      NOT NULL
updated_at      NOT NULL
```

Indexes:

```text
by_parent_id
by_sort_order
```

Constraints:

- immutable unique ID;
- non-empty name;
- valid view type;
- valid parent reference;
- no self-parent;
- no hierarchy cycles.

### Delete policy

Preserve current application semantics:

```text
DELETE tag
    ↓
child tags.parentId = null          (ON DELETE SET NULL)
task_tags rows for tag deleted      (ON DELETE CASCADE)
```

Use one transaction across `tags` and `task_tags`.

---

# 7. Table / Object Store: `tasks`

IndexedDB object store:

```text
tasks
keyPath: id
```

Logical relational shape:

```text
tasks
----------------------------------------
id                PRIMARY KEY
title             NOT NULL
description       NOT NULL DEFAULT ''
project_id        NULL FK projects.id
parent_task_id    NULL FK tasks.id
priority          NOT NULL DEFAULT ''
completed         NOT NULL DEFAULT false
due_date          NULL
due_time          NULL
sort_order        NOT NULL
created_at        NOT NULL
updated_at        NOT NULL
```

Important: do **not** store `tags[]` inside the persisted task record.

Important: do **not** rely on task array position as custom order.

### Recommended IndexedDB record

```js
{
  id,
  title,
  description,
  projectId,
  parentTaskId,
  priority,
  completed,
  dueDate,
  dueTime,
  sortOrder,
  createdAt,
  updatedAt
}
```

### Indexes

Create at minimum:

```text
by_project_id       → projectId
by_parent_task_id   → parentTaskId
by_completed        → completed
by_due_date         → dueDate
by_sort_order       → sortOrder
by_created_at       → createdAt
```

Optionally use compound indexes where useful later, for example:

```text
[parentTaskId, sortOrder]
[completed, sortOrder]
```

Do not create unnecessary indexes without query value because every index increases write cost.

### Task constraints

Application-layer checks should model SQL CHECK / FK constraints:

```text
title must be non-empty
priority ∈ '', low, medium, high
projectId = null OR existing project
parentTaskId = null OR existing task
parentTaskId != id
subtask parent must be a root task
only one subtask level supported
child project must equal parent project under current domain rules
createdAt immutable
ID immutable
sortOrder finite numeric value
```

---

# 8. Normalize Task ↔ Tag Many-to-Many Relationship

Current state stores:

```js
task.tags = ['urgent', 'design']
```

Persist this using a proper join table/object store.

Object store:

```text
task_tags
```

Composite key:

```js
keyPath: ['taskId', 'tagId']
```

Conceptual SQL:

```text
CREATE TABLE task_tags (
    task_id  FK tasks.id,
    tag_id   FK tags.id,
    PRIMARY KEY (task_id, tag_id)
)
```

IndexedDB record:

```js
{
  taskId,
  tagId
}
```

Indexes:

```text
by_task_id → taskId
by_tag_id  → tagId
```

This gives SQL-like normalization:

```text
Task A ─┬─ Tag X
        ├─ Tag Y
        └─ Tag Z
```

instead of embedding foreign IDs in one array column.

### Integrity rules

Before adding relation:

```text
task exists
tag exists
relation does not already exist
```

Deleting a task deletes its task_tags rows.

Deleting a tag deletes all task_tags rows that reference it.

---

# 9. Normalize Task Reminders

Current task records contain `reminders[]`, while the scheduler also supports custom reminder definitions.

Use two stores.

## 9A. `reminder_definitions`

Logical table:

```text
reminder_definitions
--------------------------------
id              PRIMARY KEY
label           NOT NULL
type            NOT NULL
minutes_before  NOT NULL
is_builtin      NOT NULL
created_at      NOT NULL
```

Examples:

```text
on_time
5_min
10_min
15_min
custom-0d-2h-0m
```

A custom reminder must persist its semantic offset, not only a display label.

Recommended record:

```js
{
  id,
  label,
  type: 'builtin' | 'custom',
  minutesBefore,
  isBuiltin,
  createdAt
}
```

Do not treat `'none'` as a real reminder relation. Zero selected reminder rows can represent None internally, while adapters may continue producing `['none']` if the current UI requires that compatibility shape.

## 9B. `task_reminders`

Composite key:

```js
keyPath: ['taskId', 'reminderId']
```

Record:

```js
{
  taskId,
  reminderId,
  sortOrder
}
```

Indexes:

```text
by_task_id
by_reminder_id
```

Logical relationship:

```text
Task 1 ──< TaskReminder >── ReminderDefinition
```

Delete task:

```text
task_reminders ON DELETE CASCADE
```

Delete custom reminder definition:

```text
remove its task_reminders relations transactionally
```

Built-in reminder definitions should not be user-deletable.

---

# 10. One-to-One Repeat Rule Store

Current repeat configuration is a nested object.

Create:

```text
task_repeat_rules
keyPath: taskId
```

This models:

```text
Task 1 ─── 0..1 RepeatRule
```

Recommended fields:

```js
{
  taskId,
  mode,
  interval,
  unit,
  weekdays,
  monthDays,
  yearDates,
  endType,
  endDate,
  endCount,
  updatedAt
}
```

Not every field needs to be populated for every mode.

Because IndexedDB stores structured JavaScript values naturally, arrays such as weekdays/monthDays and the year-date map may remain structured fields inside this one-to-one record.

This is intentional pragmatism: apply SQL normalization where it improves relationship integrity, but do not explode every small repeat configuration array into several extra stores without a real query/use-case.

Delete task:

```text
repeat rule ON DELETE CASCADE
```

When repeat mode becomes `none`, remove the repeat-rule record rather than storing meaningless empty configuration where practical.

---

# 11. Explicit Custom Ordering

Do not persist order by assuming IndexedDB returns records in the same order as `AppState.tasks`.

Add:

```text
sortOrder
```

to tasks, projects, tags, and any ordered relation where needed.

### Tasks

The current visible custom order should be represented by stable numeric ordering.

Recommended initial strategy:

```text
1000
2000
3000
4000
...
```

or simple sequential integers if the implementation rewrites affected positions transactionally.

For this application, rewriting the affected root-task order in one transaction is acceptable and easier to reason about.

Example:

```text
Before
Task A sortOrder 0
Task B sortOrder 1
Task C sortOrder 2

Drag C before A

After transaction
Task C sortOrder 0
Task A sortOrder 1
Task B sortOrder 2
```

### Important

When drag/drop changes both:

```text
order
+
project / tag / priority / date metadata
```

persist both changes in **one transaction**.

This prevents half-applied drag operations.

---

# 12. Application Settings Store

Create:

```text
app_settings
keyPath: key
```

Records:

```js
{ key: 'theme', value: 'dark' }
{ key: 'sortKey', value: 'custom' }
{ key: 'sortDirection', value: 'asc' }
{ key: 'groupKey', value: 'none' }
```

Potentially persist other durable preferences later.

Do not automatically persist transient UI state such as:

```text
open modal
open context menu
active drag session
hover state
keyboard state
```

Current navigation filter may remain session state unless explicitly desired later.

Project/Tag `viewType` remains on the project/tag row because it is entity-specific durable data.

---

# 13. Metadata Store

Create:

```text
app_meta
keyPath: key
```

Use it for records such as:

```js
{ key: 'initialized', value: true }
{ key: 'dataVersion', value: 1 }
```

IndexedDB already has a database schema version, but an explicit initialization marker is important.

Without this marker, an empty `tasks` table cannot distinguish:

```text
first application launch
```

from:

```text
user intentionally deleted every task
```

The application must never recreate demo/default data merely because tables are empty after initialization.

---

# 14. First-Run Seeding

Current `state.js` contains default Projects, Tags, and example Tasks.

Refactor these into clearly named seed data rather than treating them as permanent runtime state.

Example concept:

```text
AppSeedData.projects
AppSeedData.tags
AppSeedData.tasks
```

On first database initialization only:

```text
BEGIN TRANSACTION
  insert default projects
  insert default tags
  insert initial tasks
  normalize task_tags
  normalize reminders
  normalize repeat rules
  assign sortOrder
  set app_meta.initialized = true
COMMIT
```

Never reseed after the initialization marker exists.

If the user deletes all tasks later:

```text
refresh
↓
0 tasks remain
```

That is correct behavior.

---

# 15. ID Strategy

Use immutable stable IDs.

For newly created entities prefer `crypto.randomUUID()`.

Recommended formats:

```text
task-<uuid>
project-<uuid>
tag-<uuid>
```

Existing IDs such as:

```text
personal
work
urgent
task-1
```

must be preserved during first migration/seed so current references remain valid.

Never regenerate an entity ID during update.

Do not use array index as an ID.

Do not use display name as a foreign key.

---

# 16. Foreign-Key Enforcement Layer

IndexedDB does not enforce foreign keys.

Create a domain/repository layer that validates relationships before committing.

Examples:

### Task project

Before:

```text
INSERT/UPDATE tasks.projectId = X
```

check:

```text
X is null OR projects[X] exists
```

### Task parent

Check:

```text
parent exists
parent is a root task
parent != task
```

### Task tag

Before task_tags insert:

```text
task exists
tag exists
```

### Project/tag hierarchy

Validate no cycles before changing parent IDs.

These checks should live in the data/domain layer, not be duplicated across UI components.

---

# 17. Transaction Rules

This is one of the most important SQL principles to preserve.

Do not perform related writes as unrelated individual IndexedDB transactions.

## Create/update task transaction

A task save can affect:

```text
tasks
task_tags
task_reminders
task_repeat_rules
```

All must commit atomically.

Conceptually:

```text
BEGIN
  UPSERT task
  replace task_tags
  replace task_reminders
  UPSERT/DELETE repeat rule
COMMIT
```

If any operation fails:

```text
ABORT EVERYTHING
```

## Delete task family transaction

Root-task deletion currently deletes its subtasks.

Transaction should include:

```text
tasks
 task_tags
 task_reminders
 task_repeat_rules
```

for root + children.

## Delete project transaction

Atomic changes:

```text
delete project
set child project parentId = null
set affected task projectId = null
preserve current domain relation rules
```

## Delete tag transaction

Atomic changes:

```text
delete tag
set child tag parentId = null
delete referencing task_tags
```

## Drag/drop transaction

Atomic changes:

```text
update sortOrder
+
any destination metadata change
+
any inherited child project changes
```

Never allow an ordering update to commit if the corresponding metadata mutation fails.

---

# 18. Storage Architecture

Do not add raw `indexedDB.open()` calls throughout UI components.

Use layers.

Recommended files:

```text
js/storage/db-schema.js
js/storage/db.js
js/storage/repositories.js
js/storage/persistence.js
```

If line limits require more separation, split by responsibility rather than creating one oversized storage file.

## `db-schema.js`

Own:

```text
database name
version
object-store names
index names
schema creation
upgrade/migration steps
```

## `db.js`

Own low-level IndexedDB mechanics:

```text
open database
request → Promise helper
transaction completion Promise
transaction helper
error normalization
```

No application business logic.

## `repositories.js`

Own relational-style storage operations:

```text
get/insert/update/delete
query indexes
replace join rows
cascade helpers
transaction-aware repository functions
```

## `persistence.js`

Own application-level mapping:

```text
seed database
hydrate AppState
map normalized DB records ↔ current in-memory model
validate/repair startup relationships
persistent commands
settings hydration
```

Keep UI code unaware of IndexedDB details.

---

# 19. Keep AppState as an In-Memory Read Model

The current UI is built around synchronous reads such as:

```text
AppState.getTask()
AppState.getProject()
AppState.getFilteredTasks()
AppState.countTag()
```

Do not make every render path query IndexedDB directly.

Use:

```text
IndexedDB = durable source of truth
AppState  = hydrated in-memory read model/cache
```

Startup:

```text
IndexedDB
   ↓ hydrate
AppState
   ↓
UI render
```

Writes:

```text
UI command
   ↓
Data/Persistence Service
   ↓
validate
   ↓
IndexedDB transaction
   ↓ success
update AppState mirror
   ↓
render
```

This preserves fast rendering while making the database durable.

Do not allow random UI code to mutate durable AppState fields directly after this migration.

---

# 20. Replace Direct Durable Mutations With a Command/Data Service

Current components call `AppState` mutation methods directly.

Move durable write ownership behind a service, conceptually:

```text
AppDataService.createTask()
AppDataService.updateTask()
AppDataService.toggleTaskStatus()
AppDataService.deleteTaskFamily()
AppDataService.createProject()
AppDataService.updateProject()
AppDataService.deleteProject()
AppDataService.createTag()
AppDataService.updateTag()
AppDataService.deleteTag()
AppDataService.reorderTasks()
AppDataService.setProjectViewType()
AppDataService.setTagViewType()
```

These methods should be async because IndexedDB writes are async.

UI handlers should await them before assuming durability.

Do not merely mutate memory and schedule a best-effort background save.

The user expectation is:

```text
save action completes
↓
data is durable
```

---

# 21. Known Mutation Callers That Must Be Migrated

Review and update all durable mutation paths.

At minimum:

## `js/components/tasks.js`

Current create/edit task submission must use the persistent task service.

## `js/components/subtask-editor.js`

Create/edit subtask must persist atomically with tags/reminders/repeat data.

## `js/components/task-renderer.js`

Checkbox completion toggle must persist before/with rerender.

## `js/components/task-actions.js`

Task/root-family deletion must use cascade transaction.

## `js/components/sidebar-projects.js`

Project create/edit/delete must persist.

## `js/components/sidebar-tags.js`

Tag create/edit/delete must persist.

## `js/components/task-drag-commit.js`

Custom ordering and cross-group metadata changes must persist in one transaction.

## `js/components/workspace-controls.js`

Current Project/Tag `viewType` persistence mutates the entity object directly.

Replace that direct property write with a persistent entity update command.

Also persist global sort/group/direction preferences if included in `app_settings`.

## `js/task-order.js`

Refactor ordering helpers so explicit `sortOrder` values become the durable ordering model rather than raw array slot order alone.

## `js/task-relations.js`

Keep relationship validation logic, but ensure persistence service applies the same rules transactionally.

---

# 22. Async UI Mutation Pattern

Example conceptual create-task handler:

```text
Submit form
   ↓
disable submit briefly
   ↓
await AppDataService.createTask(payload)
   ↓
DB transaction succeeds
   ↓
AppState updated
   ↓
close modal
   ↓
render
```

On storage failure:

```text
DB transaction fails
   ↓
do NOT pretend save succeeded
   ↓
keep/restore UI state where possible
   ↓
show a concise error
```

Avoid duplicate submissions while an operation is pending.

Do not globally lock the whole application for ordinary fast writes.

---

# 23. Application Startup Must Wait for Hydration

Current startup initializes UI immediately.

Change startup to async initialization.

Conceptually:

```js
document.addEventListener('DOMContentLoaded', async () => {
  await AppPersistence.initialize();
  await AppPersistence.hydrateState();

  ThemeManager.init();
  SidebarComponent.init();
  WorkspaceControls.init();
  TasksComponent.init();
  ScheduleComponent.init();
  SubtaskEditorComponent.init();
  SettingsComponent.init();
});
```

Exact ordering may need adjustment for theme/settings, but **no task/project/tag rendering should occur before hydration finishes**.

Otherwise the user can briefly see seed data before saved data replaces it.

---

# 24. Hydration Algorithm

On startup:

```text
1. Open TodoListDB.
2. Run schema upgrade if needed.
3. Check app_meta.initialized.
4. If first run → seed once transactionally.
5. Read projects.
6. Read tags.
7. Read tasks ordered by sortOrder.
8. Read task_tags.
9. Read reminder definitions.
10. Read task_reminders.
11. Read repeat rules.
12. Read app settings.
13. Validate relationships.
14. Reconstruct current AppState-compatible objects.
15. Initialize/render UI.
```

Use maps for efficient joining:

```text
projectById
tagById
taskById
tagsByTaskId
remindersByTaskId
repeatRuleByTaskId
```

Do not perform nested O(N²) scans unnecessarily during hydration.

---

# 25. Persistence Mapper

The normalized DB shape does not have to equal the existing UI state shape.

Use a mapping layer.

Database:

```js
{
  id: 'task-x',
  projectId: 'project-y'
}
```

AppState compatibility model:

```js
{
  id: 'task-x',
  project: 'project-y',
  tags: ['tag-a', 'tag-b'],
  reminders: ['on_time'],
  repeat: {...}
}
```

Hydration should reconstruct these arrays/objects from normalized relation stores.

This lets the persistence schema be clean without forcing the entire rendering system to understand join tables.

---

# 26. Startup Integrity Validation / Repair

Treat corrupted/orphaned records defensively.

Examples:

### Missing project

If task.projectId references a project that does not exist:

```text
set projectId = null
```

and persist repair if safe.

### Missing tag

Delete orphaned `task_tags` row.

### Missing parent task

Set `parentTaskId = null`.

### Invalid subtask chain

If a task points to another subtask under the current one-level model:

```text
repair to root/null according to current normalization semantics
```

### Cyclic project/tag hierarchy

Detect and break invalid parent link rather than allowing infinite recursion.

Log a clear warning for development.

Do not silently delete primary domain records unless unavoidable.

---

# 27. Schema Versioning and Migrations

Use IndexedDB's versioned upgrade mechanism correctly.

All schema changes happen inside:

```text
onupgradeneeded
```

Organize migration logic explicitly:

```text
if (oldVersion < 1) create v1 stores/indexes
if (oldVersion < 2) run future v2 migration
...
```

Do not delete/recreate the entire database for routine schema changes.

Future upgrade example:

```text
DB_VERSION 1 → 2
add notification scheduling data
migrate existing reminder rows
preserve all user records
```

Every future migration must preserve user data unless a destructive migration is explicitly approved.

---

# 28. IndexedDB Transaction Helper

Create a Promise-based transaction utility so persistence code remains readable.

Conceptual API:

```text
withTransaction(storeNames, mode, async tx => {...})
```

Requirements:

- resolve only after transaction `complete`;
- reject on `error` or `abort`;
- do not resolve merely because the last individual request succeeded;
- allow repository methods to reuse the same transaction;
- do not accidentally open nested independent transactions for one atomic command.

This is the IndexedDB equivalent of respecting SQL transaction boundaries.

---

# 29. Repository Query Practices

Use indexes for relationship queries instead of scanning every table when practical.

Examples:

```text
get tasks for project
→ tasks.index('by_project_id')

get subtasks
→ tasks.index('by_parent_task_id')

get tags for task
→ task_tags.index('by_task_id')

get tasks for tag
→ task_tags.index('by_tag_id')
```

The in-memory AppState may still use arrays for rendering after hydration, but persistence operations should have proper indexed query paths.

---

# 30. Controlled Denormalization Rule

SQL best practice does not mean maximum normalization at any cost.

Use this rule:

```text
Normalize relationships that have independent identity/cardinality/query value.
Keep small structured value objects together when splitting them creates complexity without integrity benefit.
```

Therefore:

### Normalize

```text
Task ↔ Tags
Task ↔ Reminders
Task ↔ Repeat Rule (one-to-one separate row)
Task → Project
Task → Parent Task
Project → Parent Project
Tag → Parent Tag
```

### Structured fields may remain inside repeat rule

```text
weekdays[]
monthDays[]
yearDates{}
```

This is a deliberate IndexedDB adaptation of relational principles.

---

# 31. Theme and Settings Migration

Current theme uses `localStorage`.

Recommended durable architecture:

```text
app_settings.theme = canonical value
```

To avoid a light/dark startup flash, implementation may retain:

```text
localStorage.theme
```

as a tiny synchronous **cache only**.

Rules:

- changing theme writes both DB setting and cache;
- DB is canonical after hydration;
- cache may be repaired from DB;
- do not duplicate Tasks/Projects/Tags into localStorage.

If simpler, leave theme's current localStorage persistence untouched in the first implementation and document it as an existing independent preference store. The core requirement is that all domain data uses IndexedDB relational storage.

Choose one approach explicitly during implementation; do not create ambiguous competing sources of truth.

---

# 32. Storage Failure Behavior

IndexedDB can fail because of browser restrictions, quota problems, corruption, or unusual private-browser behavior.

Do not silently swallow failures.

Startup failure:

```text
show a clear non-blocking/appropriate storage error
avoid overwriting existing database
```

Write failure:

```text
do not report success
preserve user's unsaved form input where practical
allow retry
```

Do not automatically clear/delete the database as an error-recovery strategy.

---

# 33. No Full-Database Rewrite After Every Edit

Do not implement persistence as:

```text
one task changed
↓
delete every object store
↓
rewrite entire AppState
```

That is simple but violates the relational architecture requested and creates unnecessary write risk.

Use targeted CRUD and transactional relation updates.

Full-state snapshot operations may be useful later for export/import, but not as the normal persistence path.

---

# 34. Data Mutation Examples

## Create Task

```text
generate immutable ID
validate project
validate parent task
validate tags
validate reminders
assign sortOrder
BEGIN transaction
  insert tasks row
  insert task_tags rows
  insert task_reminders rows
  insert repeat rule if enabled
COMMIT
update AppState
render
```

## Edit Task Tags

```text
BEGIN
  update tasks basic row
  delete old task_tags for task
  insert current task_tags
COMMIT
```

## Complete Task

```text
BEGIN
  update tasks.completed
  update updatedAt
COMMIT
```

## Delete Root Task

```text
find root + direct children
BEGIN
  delete dependent task_tags
  delete dependent task_reminders
  delete dependent repeat rules
  delete child tasks
  delete root task
COMMIT
```

## Delete Project

```text
BEGIN
  update child projects parentId = null
  update affected tasks projectId = null
  delete project
COMMIT
```

## Delete Tag

```text
BEGIN
  update child tags parentId = null
  delete task_tags referencing tag
  delete tag
COMMIT
```

## Drag Task Across Project Group

```text
BEGIN
  update moved root task.projectId
  update child task projectIds to same value
  update affected sortOrder values
COMMIT
```

---

# 35. Preserve Existing Domain Behavior

Persistence must not unintentionally redesign app behavior.

Preserve:

- Inbox means no project;
- Today uses due date;
- one-level subtasks;
- subtask project inheritance;
- task tags;
- priorities including None;
- List and Kanban;
- Group By behavior;
- Custom drag order;
- Group/Sort UI;
- Project hierarchy;
- Tag hierarchy;
- project/tag viewType;
- schedule data;
- existing delete semantics;
- current Timeline-disabled status.

This plan is primarily a persistence architecture change.

---

# 36. Files Expected to Be Added

Recommended new modules:

```text
js/storage/db-schema.js
js/storage/db.js
js/storage/repositories.js
js/storage/persistence.js
```

If `repositories.js` becomes too large, split into focused files such as:

```text
js/storage/task-repository.js
js/storage/taxonomy-repository.js
js/storage/settings-repository.js
```

Keep project source files within the existing small-module convention where practical.

---

# 37. Existing Files Expected to Change

Likely:

```text
index.html
js/app.js
js/state.js
js/task-relations.js
js/task-order.js
js/theme.js (if settings migration included)
js/components/tasks.js
js/components/subtask-editor.js
js/components/task-renderer.js
js/components/task-actions.js
js/components/sidebar-projects.js
js/components/sidebar-tags.js
js/components/task-drag-commit.js
js/components/workspace-controls.js
js/components/schedule.js / schedule-time-reminders.js if custom reminder definitions are hydrated globally
```

Do not change unrelated UI/CSS simply because persistence is being added.

---

# 38. Script Load Order

Storage modules must load before `app.js`.

Recommended conceptual order:

```text
state / seed definitions
storage schema
storage DB wrapper
repositories
persistence/data service
domain relation/order modules
UI modules
app bootstrap
```

Exact order must respect dependencies.

Avoid cyclic global dependencies where storage code assumes UI components already exist.

---

# 39. Migration From Current In-Memory Shape

Because there is currently no durable task/project/tag database, the initial IndexedDB version is primarily a first-run normalization import.

Migration mapper should transform:

```text
AppState task.project
→ tasks.projectId

AppState task.tags[]
→ task_tags rows

AppState task.reminders[]
→ task_reminders rows

AppState task.repeat
→ task_repeat_rules row

AppState array position
→ sortOrder
```

Project/tag `parentId` maps directly.

Preserve all existing IDs.

---

# 40. Acceptance Tests — Core Persistence

1. Create a task.
2. Refresh page.
3. Task still exists.
4. Edit title/description.
5. Refresh.
6. Edits remain.
7. Complete task.
8. Refresh.
9. Completion remains.
10. Delete task.
11. Refresh.
12. Deleted task does not reappear.

---

# 41. Acceptance Tests — Projects

13. Create project.
14. Refresh → project remains.
15. Create sub-project.
16. Refresh → hierarchy remains.
17. Assign task to project.
18. Refresh → assignment remains.
19. Rename project.
20. Refresh → new name remains.
21. Delete parent project.
22. Child project becomes top-level after refresh.
23. Affected tasks become Inbox after refresh.

---

# 42. Acceptance Tests — Tags

24. Create tag.
25. Refresh → tag remains.
26. Create sub-tag.
27. Refresh → hierarchy remains.
28. Assign multiple tags to task.
29. Refresh → all tag relations remain.
30. Delete a tag.
31. Refresh → deleted relation does not return.
32. Child tags become top-level according to existing semantics.

---

# 43. Acceptance Tests — Subtasks

33. Create root task.
34. Create subtask.
35. Refresh → hierarchy remains.
36. Edit parent project.
37. Child project inheritance remains after refresh.
38. Delete subtask only → parent remains after refresh.
39. Delete parent with subtasks → entire family remains deleted after refresh.

---

# 44. Acceptance Tests — Ordering

40. Create at least four root tasks.
41. Drag them into a custom order.
42. Refresh.
43. Exact order remains.
44. Reorder inside grouped List view.
45. Refresh → order and grouping metadata remain.
46. Reorder/change group in Kanban.
47. Refresh → both location metadata and order remain.

---

# 45. Acceptance Tests — Schedule Data

48. Set due date.
49. Set due time.
50. Add preset reminder.
51. Add custom reminder.
52. Add repeat rule.
53. Refresh.
54. Reopen task.
55. Date/time/reminders/repeat reconstruct correctly.
56. Custom reminder label/offset is still known after refresh.

---

# 46. Acceptance Tests — Empty Database Semantics

57. Delete every task intentionally.
58. Refresh.
59. Application remains empty.
60. Demo tasks are **not** recreated.
61. Delete user-created project/tag data as allowed.
62. Refresh.
63. Deleted data remains deleted.

This verifies `app_meta.initialized` is working.

---

# 47. Acceptance Tests — Referential Integrity

64. No `task_tags` row may reference missing task.
65. No `task_tags` row may reference missing tag.
66. No task project may reference missing project after hydration repair.
67. No task may parent itself.
68. No subtask may parent another subtask under current one-level rules.
69. No project hierarchy cycle.
70. No tag hierarchy cycle.
71. Deleting an entity leaves no orphan relation rows.

---

# 48. Acceptance Tests — Transactions

Simulate/reason about failure boundaries.

72. Task save with tags is atomic.
73. Task delete + relation cleanup is atomic.
74. Project delete + task migration is atomic.
75. Tag delete + join cleanup is atomic.
76. Drag order + destination metadata update is atomic.

There must not be an intermediate durable state such as:

```text
task saved but tags lost
```

or:

```text
project deleted but tasks still reference deleted project
```

---

# 49. Acceptance Tests — Startup

77. Reload with stored data.
78. No visible flash of default demo state before stored state.
79. UI initializes only after hydration.
80. Counts are correct immediately after startup.
81. List/Kanban view metadata is restored.
82. Sort/group settings restore if included in app_settings.
83. Theme restores according to selected settings strategy.

---

# 50. Manual Browser Database Verification

Using browser DevTools → Application → IndexedDB, verify logical stores exist:

```text
TodoListDB
├── projects
├── tags
├── tasks
├── task_tags
├── reminder_definitions
├── task_reminders
├── task_repeat_rules
├── app_settings
└── app_meta
```

Verify records have stable IDs and relationships rather than one giant serialized application blob.

A task with two tags should look conceptually like:

```text
tasks
-------------------------------------------------
task-123 | Finish project | project-work | ...


task_tags
----------------------
task-123 | urgent
task-123 | design
```

not:

```text
one giant JSON string containing the entire application
```

---

# 51. Non-Goals

Do not implement in this persistence plan:

- server/cloud synchronization;
- user accounts;
- multi-device sync;
- actual SQLite/WASM unless separately requested;
- backend SQL database;
- reminders firing as OS/browser notifications;
- repeat occurrence generation;
- Timeline view;
- encryption system;
- collaboration.

This plan is local browser persistence only.

---

# 52. Final Architecture

Target architecture:

```text
                  UI COMPONENTS
                       │
                       │ commands
                       ▼
                AppDataService
                       │
             validate relationships
                       │
                       ▼
              Repository Layer
                       │
                       ▼
             IndexedDB Transactions
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
      tasks         projects          tags
        │                                │
        ├──────── task_tags ─────────────┘
        ├──────── task_reminders ── reminder_definitions
        └──────── task_repeat_rules

                       │
                 successful commit
                       ▼
                    AppState
               in-memory read model
                       │
                       ▼
                     Render
```

Startup:

```text
Page load
   ↓
Open TodoListDB
   ↓
Run schema migration
   ↓
Seed once if first launch
   ↓
Hydrate normalized records
   ↓
Reconstruct AppState
   ↓
Initialize UI
   ↓
Render saved application
```

Refresh behavior after completion:

```text
Create / edit / delete / reorder
             ↓
IndexedDB transaction
             ↓
Durable normalized records
             ↓
Refresh browser
             ↓
Hydrate records
             ↓
Same Tasks / Projects / Tags / relationships / order
```

---

# Completion Contract

Implementation Plan ID 6 is complete only when:

1. Domain data is persisted in IndexedDB.
2. IndexedDB is designed as normalized logical tables rather than a giant app blob.
3. Stable primary IDs are used.
4. Task ↔ Tag is represented using a join store.
5. Task reminders have durable definitions/relations.
6. Repeat rules persist independently.
7. Parent project/tag/task relationships are validated like foreign keys.
8. Custom order uses explicit `sortOrder`.
9. Cascade and SET NULL semantics are transactional.
10. Durable UI mutations go through a persistence/data service.
11. Startup waits for hydration before rendering.
12. First-run seed data never reappears after intentional deletion.
13. Schema versioning/migration infrastructure exists.
14. Refresh and browser reopen preserve all implemented domain data.
15. Existing app behavior remains unchanged except that data is now durable.
