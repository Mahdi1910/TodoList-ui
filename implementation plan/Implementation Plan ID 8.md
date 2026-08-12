# Implementation Plan ID 8 — Restore Hierarchy Drag Integration

## Goal

Fix the failed drag implementation from ID 7 without redesigning the hierarchy feature.

The confirmed primary defect is mixin integration order:

- `task-drag.js` defines `window.TaskDragMethods`.
- `tasks.js` copies the methods that exist at that moment into `window.TasksComponent`.
- `task-drag-hierarchy.js` is currently loaded later from `app.js` after `DOMContentLoaded`.
- it therefore augments `TaskDragMethods` too late; `TasksComponent` never receives `resolveHierarchyDrop`, `measureHierarchyAlignment`, `applyHierarchyPreview`, and the other hierarchy methods.
- `updateTaskDropTarget()` uses optional chaining, so the missing resolver silently becomes a no-op instead of producing a visible error.

This causes the floating card to move while the placeholder/destination never changes, which breaks normal reordering, root→subtask, subtask→root, reparenting, forced child-block drops, and subtask reordering.

## Changes

### 1. Explicitly install the hierarchy mixin onto the live TasksComponent during bootstrap

Keep the existing dynamic load of `js/components/task-drag-hierarchy.js`, but immediately after the bootstrap scripts finish loading and before persistence bindings / component initialization, explicitly copy the hierarchy methods onto the already-created component:

```text
load task-drag-hierarchy.js
        ↓
TaskDragMethods receives hierarchy methods
        ↓
TasksComponent receives the same hierarchy methods explicitly
        ↓
bind persistence overrides
        ↓
TasksComponent.init()
```

This directly fixes the copy-vs-reference bug without rewriting the large `index.html` file.

Required invariant before `TasksComponent.init()`:

```text
typeof TasksComponent.resolveHierarchyDrop === 'function'
typeof TasksComponent.measureHierarchyAlignment === 'function'
typeof TasksComponent.buildInitialHierarchyPreview === 'function'
typeof TasksComponent.applyHierarchyPreview === 'function'
```

### 2. Make missing hierarchy integration fail loudly

Update `js/components/task-drag.js`:

- add an initialization assertion that the required hierarchy methods exist on the actual `TasksComponent` instance before drag listeners are registered;
- required methods should include at least:
  - `resolveHierarchyDrop`
  - `measureHierarchyAlignment`
  - `buildInitialHierarchyPreview`
  - `applyHierarchyPreview`
- remove optional no-op behavior from the central hierarchy movement/initialization path;
- call the hierarchy methods directly once integration has been validated.

Do not add browser alerts. A clear thrown initialization error / console failure is preferable to silently enabling a broken drag system.

### 3. Preserve the existing ID 7 hierarchy resolver and persistence service

Do not rewrite the geometry, hierarchy rules, menu Link/Unlink, or IndexedDB transaction model unless source verification finds another concrete blocker.

The existing resolver already contains:

- root/subtask alignment measurement;
- stateful horizontal intent + hysteresis;
- root insertion slots;
- child insertion slots;
- forced child-block precedence;
- candidate-parent validation;
- semantic placeholder relocation.

The existing persistence layer already contains:

- Link to Parent;
- Unlink;
- root ordering;
- child ordering;
- reparenting;
- project inheritance;
- transactional `sortOrder` updates.

The immediate goal is to reconnect those implemented pieces to the active drag component.

### 4. Static integration verification

After implementation, verify from source that:

1. `app.js` loads `task-drag-hierarchy.js` before `bindPersistentUiMutations()` and before `TasksComponent.init()`.
2. `app.js` explicitly assigns `TaskDragHierarchyMethods` onto `TasksComponent` after the script loads.
3. `TasksComponent.initTaskDrag()` validates hierarchy methods before binding drag events.
4. `updateTaskDropTarget()` directly invokes `resolveHierarchyDrop()` rather than silently optional-chaining it.
5. drag session initialization directly uses the hierarchy alignment and initial-preview methods.
6. pointer and touch still call the same `updateTaskDropTarget()` path.
7. the persistence binding still overrides `commitTaskDrag()` with `AppDataService.commitHierarchyDrag()` before `TasksComponent.init()` runs.
8. Link/Unlink behavior is untouched.
9. no whole-lane blue highlight is reintroduced.

## Manual acceptance tests

No headless/browser automation.

Test manually on the real browser/phone:

1. Root reorder: A/B/C → drag B below C → placeholder moves → release gives A/C/B.
2. Refresh → root order remains.
3. Root→subtask: drag root B right under A → placeholder visibly snaps to A child indentation → release makes B child of A.
4. Refresh → B remains child of A.
5. Subtask→root: hold B → initial placeholder is indented → move left → placeholder snaps to root level → release makes B root.
6. Reparent: A→B, C root → hold B and move under C while child intent remains → B becomes child of C.
7. Subtask reorder: A has B1/B2/B3 → drag B3 between B1/B2 → order persists after refresh.
8. Forced child block: drag root C between A/B1 or B1/B2, even with pointer moved left → placeholder stays child-level and C becomes child of A.
9. `••• → Link to Parent` still works.
10. `••• → Unlink` still works.
11. Existing Add Subtask remains unchanged.

## Scope

Fix only the broken drag integration and any directly proven blocker discovered during implementation. Do not redesign the feature, Timeline, Sort & Group, persistence schema, or unrelated UI.