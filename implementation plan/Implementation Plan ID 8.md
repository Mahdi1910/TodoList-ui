# Implementation Plan ID 8 — Restore Hierarchy Drag Integration

## Goal

Fix the failed drag implementation from ID 7 without redesigning the hierarchy feature.

The confirmed primary defect is script/mixin load order:

- `task-drag.js` defines `window.TaskDragMethods`.
- `tasks.js` copies the methods that exist at that moment into `window.TasksComponent`.
- `task-drag-hierarchy.js` is currently loaded later from `app.js` after `DOMContentLoaded`.
- it therefore augments `TaskDragMethods` too late; `TasksComponent` never receives `resolveHierarchyDrop`, `measureHierarchyAlignment`, `applyHierarchyPreview`, and the other hierarchy methods.
- `updateTaskDropTarget()` uses optional chaining, so the missing resolver silently becomes a no-op instead of producing a visible error.

This causes the floating card to move while the placeholder/destination never changes, which breaks normal reordering, root→subtask, subtask→root, reparenting, forced child-block drops, and subtask reordering.

## Changes

### 1. Load the hierarchy resolver in the static component dependency chain

Update `index.html` so:

```text
task-drag.js
→ task-drag-hierarchy.js
→ task-drag-touch.js
→ task-drag-commit.js
→ ...
→ tasks.js
```

`task-drag-hierarchy.js` must run after `task-drag.js` exists but before `tasks.js` copies the drag mixin methods into `TasksComponent`.

### 2. Remove the late dynamic hierarchy load

Update `js/app.js` and remove `js/components/task-drag-hierarchy.js` from the dynamic bootstrap list.

The dynamic bootstrap should remain responsible for persistence/storage modules, not for a component mixin that must exist before `TasksComponent` is assembled.

This also prevents the same hierarchy module from being executed twice.

### 3. Make missing hierarchy integration fail loudly

Update `js/components/task-drag.js`:

- add an initialization assertion that the required hierarchy methods exist on the actual `TasksComponent` instance before drag listeners are registered;
- required methods should include at least:
  - `resolveHierarchyDrop`
  - `measureHierarchyAlignment`
  - `buildInitialHierarchyPreview`
  - `applyHierarchyPreview`
- remove optional no-op behavior from the central movement path where appropriate so a future load-order regression cannot silently produce a floating-but-nonfunctional drag UI.

Do not add browser alerts. A clear thrown initialization error / console failure is preferable to silently enabling a broken drag system.

### 4. Preserve the existing ID 7 hierarchy resolver and persistence service

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

### 5. Static integration verification

After implementation, verify from source that:

1. `task-drag-hierarchy.js` appears in `index.html` after `task-drag.js` and before `tasks.js`.
2. `app.js` no longer dynamically loads `task-drag-hierarchy.js`.
3. when `tasks.js` runs, `window.TaskDragMethods.resolveHierarchyDrop` already exists.
4. `TasksComponent.initTaskDrag()` validates the hierarchy methods before binding events.
5. pointer and touch still call the same `updateTaskDropTarget()` path.
6. the persistence binding still overrides `commitTaskDrag()` with `AppDataService.commitHierarchyDrag()` before `TasksComponent.init()` runs.
7. Link/Unlink behavior is untouched.
8. no whole-lane blue highlight is reintroduced.

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