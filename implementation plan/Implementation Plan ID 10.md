# Implementation Plan ID 10 — Collapsible Completed Section + Active-Only Parent Picker

## Goal

Fix two focused task-list behaviors without changing recurrence, drag hierarchy, active-task rendering, or unrelated menus:

1. Make the **Completed** section itself collapsible/expandable while keeping the active task area unchanged.
2. Prevent **completed root tasks** from appearing as `Link to Parent` candidates, and defensively reject a completed parent at the hierarchy service layer.

No app implementation is part of this plan commit.

---

## 1. Current-State Findings

### Completed section

Current markup uses:

```text
<section id="completed-tasks-container">
  <div class="section-header-title">
    Completed
    <count>
  </div>
  <div id="completed-task-list">...</div>
</section>
```

The header is display-only; it has no click/keyboard behavior, no `aria-expanded`, and no chevron.

`TaskRendererMethods.renderList()` currently:

- calculates completed root tasks;
- toggles `completed-section.has-tasks`;
- always repopulates and exposes the completed list whenever completed tasks exist.

The active section header is already hidden and must remain unchanged.

### Link-to-Parent picker

`TaskActionMethods.getEligibleParentTasks(taskId)` currently does:

```js
AppState.getRootTasks()
  .filter(task => task.id !== taskId)
```

It does not filter `task.completed`, so completed root tasks appear as selectable parent candidates.

`AppDataService.validateHierarchyLink()` also currently validates root-ness/self/nesting but does not reject a completed parent. Therefore the UI bug is not protected at the business-rule layer.

---

## 2. Required Completed-Section Behavior

### 2.1 Only Completed is collapsible

Do not make the active task container collapsible.

Expected expanded state:

```text
Completed                         5  ▾
────────────────────────────────────
Task A
Task B
Task C
...
```

Expected collapsed state:

```text
Completed                         5  ▸
────────────────────────────────────
```

The header and count remain visible while the task list is hidden.

### 2.2 Visibility when there are no completed tasks

Preserve the current rule:

```text
completed count = 0
→ hide the entire Completed section
```

Collapse state must not force an empty Completed header to remain visible.

### 2.3 Default state

Default to **expanded** when the app starts.

This request does not require persistence across browser restarts. Keep the collapse flag as UI/component state unless a later request explicitly asks to remember it across sessions.

Within the same page session, rerenders must preserve the user's chosen collapsed/expanded state.

Examples:

```text
User collapses Completed
→ completes another task
→ render runs
→ Completed remains collapsed
→ count updates
```

and:

```text
User expands Completed
→ undo/completion causes render
→ Completed remains expanded
```

### 2.4 Accessible interaction

Convert the Completed header interaction into a real button or equivalent accessible button structure.

Required attributes/state:

```text
aria-expanded="true|false"
aria-controls="completed-task-list"
```

The control must work with:

```text
mouse click
touch tap
Enter
Space
```

Use a small chevron whose direction reflects state:

```text
expanded  → ▾ / downward chevron
collapsed → ▸ / rightward chevron
```

Keep the current Completed label and task count.

### 2.5 Rendering contract

Add component state such as:

```js
completedSectionCollapsed: false
```

and focused helpers, for example:

```text
initCompletedSection()
toggleCompletedSection()
syncCompletedSectionState()
```

`renderList()` remains responsible for task contents/counts and calls the sync helper after determining whether completed tasks exist.

Do not rebuild the header on every render; keep the static header/control and only update state/count/list visibility.

### 2.6 Drag/drop interaction

When Completed is collapsed:

- `#completed-task-list` is not visible/interactable;
- no invisible completed drop target should remain usable through geometry;
- expanding restores the normal completed list behavior.

Do not otherwise redesign drag/drop in this plan.

---

## 3. Required Link-to-Parent Behavior

### 3.1 Candidate list

For an active root task, `Link to Parent` may show only eligible **active root tasks**.

Candidate predicate:

```text
root task
AND task.id != sourceTaskId
AND task.completed == false
```

Existing one-level hierarchy restrictions still apply.

Never list:

```text
completed root task
subtask
source task itself
invalid hierarchy target
```

### 3.2 Empty candidate state

If every other root task is completed, or there are otherwise no valid active roots:

```text
Link to Parent = disabled
Title/reason = "No eligible parent tasks"
```

Preserve the existing disabled behavior for a source root that already owns subtasks:

```text
"Move or unlink this task’s subtasks first"
```

### 3.3 Defensive hierarchy validation

Update `AppDataService.validateHierarchyLink(taskId, parentId)` so a completed parent is rejected even if a stale UI event or future caller attempts it.

Business invariant:

```text
parent.completed === true
→ throw/reject
```

Suggested error meaning:

```text
"Completed tasks cannot be used as parent tasks."
```

This keeps the rule enforced below the UI.

### 3.4 Drag hierarchy scope

This request is specifically about the `Link to Parent` picker. Do **not** redesign drag-to-parent behavior in this plan unless the existing drag resolver uses the same parent-eligibility function and must be aligned to avoid contradicting the new invariant.

If hierarchy validation is shared by drag commit, completed-parent drops will naturally be rejected by the service guard; keep the visual drag behavior otherwise unchanged.

### 3.5 Source task behavior

Do not broaden this request into a redesign of which actions are shown on completed source tasks. The required fix is that a **completed task cannot be selected as the destination parent**.

If a later product decision should remove `Link to Parent` from completed source tasks entirely, handle that separately.

---

## 4. Files to Change

Expected focused changes:

```text
index.html
js/components/tasks.js
js/components/task-renderer.js
js/components/task-actions.js
js/storage/data-service-hierarchy.js
css/layout/workspace-layout.css
```

Potentially no other files should be needed.

### `index.html`

Change the Completed header from passive display markup to accessible toggle markup while preserving:

```text
Completed label
completed-tasks-count
completed-task-list ID
```

Do not change the hidden Active Tasks header.

### `js/components/tasks.js`

During `init()`:

- cache the Completed toggle/chevron elements;
- initialize `completedSectionCollapsed = false` if not already set;
- bind the Completed toggle once.

### `js/components/task-renderer.js`

After rendering completed tasks/count:

- preserve `has-tasks` behavior;
- synchronize collapsed state;
- hide/show the completed list according to the UI flag;
- update `aria-expanded` and chevron.

Do not change active-task grouping/rendering.

### `js/components/task-actions.js`

Change `getEligibleParentTasks()` to filter out completed roots before sorting.

Keep existing sorting:

```text
sortOrder
then title
```

### `js/storage/data-service-hierarchy.js`

Add completed-parent validation to `validateHierarchyLink()`.

Keep all existing rules:

```text
parent must be root
not self
source-with-children cannot become child
one-level hierarchy only
```

### `css/layout/workspace-layout.css`

Add minimal Completed-toggle styling:

- full-width header control or button reset;
- label/count/chevron alignment;
- hover/focus states consistent with current UI;
- collapsed list hidden via native `hidden` or a small state class;
- no animation that changes active task layout.

Prefer existing CSS variables and transitions.

---

## 5. State and Persistence

No IndexedDB schema or domain data changes are required for collapse/expand.

Do not store collapse state in `tasks`, `app_settings`, or localStorage for this request.

The parent-candidate fix is a query/validation rule only; it does not require migration.

---

## 6. Manual Acceptance Matrix

No Chrome/Playwright/Puppeteer/Selenium/headless testing.

### A. Completed collapse

1. Have at least two completed root tasks.
2. Completed section starts expanded.
3. Tap/click Completed header.
4. Completed list disappears.
5. Header, count, and collapsed chevron remain visible.
6. Tap/click again.
7. Completed list returns.

### B. Rerender preservation

1. Collapse Completed.
2. Complete an active task.
3. Count increases.
4. Completed remains collapsed.
5. Expand Completed and verify the newly completed task exists.

### C. Undo while expanded/collapsed

1. Expand Completed and undo one task.
2. Count decreases correctly.
3. Collapse Completed.
4. Trigger another task mutation.
5. Collapse state remains intact.

### D. Zero completed tasks

1. Undo/delete every completed task.
2. Entire Completed section disappears.
3. Complete a new task.
4. Completed section returns using the current session collapse state.

### E. Parent picker excludes completed roots

Given:

```text
A active
B active
C completed
```

1. Open A → `Link to Parent`.
2. Picker shows B.
3. Picker does not show C.
4. Picker does not show A.

### F. No eligible active parent

Given:

```text
A active
B completed
C completed
```

1. Open A's three-dot menu.
2. `Link to Parent` is disabled.
3. Reason is `No eligible parent tasks`.

### G. Defensive validation

By static review, confirm every path using `validateHierarchyLink()` rejects a completed destination parent even if the picker/filter were bypassed.

### H. Regression

Verify manually:

```text
active task rendering unchanged
completed task undo still works
Link/Unlink still works for active tasks
drag hierarchy still works
Repeat completion still creates its future occurrence correctly
Completed count remains accurate
```

---

## 7. Explicit Non-Goals

Do not implement:

- collapsible Active section;
- persistence of Completed collapse state across restarts;
- new completed-task filters/sorting;
- completed-task bulk actions;
- redesign of three-dot menus;
- removal of Link action from completed source tasks;
- recurrence changes;
- drag hierarchy redesign;
- Timeline changes.

---

## 8. Implementation Order

1. Convert Completed header into an accessible toggle while preserving IDs/count markup.
2. Add component collapse state and one-time event binding.
3. Synchronize Completed list visibility during every render without affecting Active.
4. Add focused Completed toggle styling.
5. Filter completed roots from `getEligibleParentTasks()`.
6. Add completed-parent rejection in `validateHierarchyLink()`.
7. Perform static integration review.
8. User manually runs the acceptance matrix on the real browser/phone.
