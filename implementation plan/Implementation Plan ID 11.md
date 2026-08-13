# Implementation Plan ID 11 — Collapsible Completed Sections in Kanban

## Goal

Extend the existing **Completed expand/collapse behavior** into **Kanban view** without changing the active Kanban task lanes, List-view Completed behavior, Repeat logic, hierarchy rules, or unrelated workspace controls.

The requested behavior is:

```text
Kanban column

Completed                 3  ▼
-----------------------------
Completed Task A
Completed Task B
Completed Task C
```

Click/tap the Completed header:

```text
Completed                 3  ▶
-----------------------------
```

The completed cards in that Kanban column are hidden. Clicking/tapping again restores them.

When Kanban is grouped into multiple columns, **each column's Completed section collapses independently**.

No app implementation is part of this plan commit.

---

## 1. Current-State Findings

### List view already has Completed collapse

Plan ID 10 added a session-only collapse state for the normal List-view Completed section.

That implementation:

- preserves the Completed header/count while collapsed;
- uses `aria-expanded`;
- hides the completed list with native `hidden`;
- removes the completed drop-lane context while collapsed;
- preserves collapse state across rerenders during the current page session.

This behavior must remain unchanged.

### Kanban uses a separate rendering path

`TaskKanbanMethods.renderKanban()` does not use the List-view Completed section.

Every Kanban column is rebuilt through:

```text
createKanbanColumn(groupKey, group)
```

Inside every column it currently creates:

```text
active list
Completed <count>   ← plain div, not interactive
completed list       ← always visible
```

Current completed header:

```js
const completedHeader = document.createElement('div');
completedHeader.className = 'kanban-completed-header';
```

There is currently:

- no click/tap behavior;
- no keyboard behavior;
- no chevron;
- no `aria-expanded`;
- no collapse state;
- no suppression of completed drop geometry while collapsed.

### Existing grouped-list pattern is reusable

`TaskGroupMethods.createTaskGroupSection()` already uses a stable in-memory `Set`:

```js
collapsedTaskGroups = new Set()
```

with keys such as:

```text
priority:high
project:project-id
date:2026-08-13
```

and restores collapsed state whenever grouped List UI rerenders.

Kanban should use the same architectural idea with its own state set.

---

## 2. Required Kanban Behavior

### 2.1 Each Kanban Completed section is independently collapsible

When Group By creates multiple columns, each column owns its own Completed collapse state.

Example:

```text
Priority: High
Completed 2 ▼
  Task A
  Task B

Priority: Medium
Completed 4 ▶

Priority: Low
Completed 1 ▼
  Task C
```

Collapsing `Medium` must not collapse `High` or `Low`.

### 2.2 Single-column Kanban

When:

```text
Group By = None
```

Kanban has one column.

Its Completed section should work exactly the same:

```text
Completed 5 ▼
```

becomes:

```text
Completed 5 ▶
```

with completed cards hidden.

### 2.3 Session-only state

Do not persist Kanban collapse state to IndexedDB or localStorage.

Keep it only for the current page session, matching the List-view Completed behavior.

Use a state structure such as:

```js
collapsedKanbanCompletedGroups = new Set()
```

Stable key:

```text
`${groupKey}:${group.key}`
```

Examples:

```text
none:all
priority:high
priority:
date:2026-08-13
project:project-123
tag:tag-456
```

This means:

```text
collapse High Priority Completed
→ task mutation rerenders Kanban
→ High Priority Completed stays collapsed
```

and:

```text
switch away from Kanban
→ switch back during same page session
→ collapsed Kanban state remains
```

### 2.4 Group changes do not corrupt other states

Collapse state is namespaced by both group type and group key.

Therefore:

```text
priority:high
```

must not collide with:

```text
project:high
```

or any other view.

Changing Group By may expose a different set of state keys. Old keys can remain harmlessly in the session Set so returning to the previous grouping restores the user's state.

### 2.5 Active Kanban tasks are not collapsible

Do not add collapse behavior to:

```text
kanban-active-list
column title
whole Kanban column
```

Only the **Completed portion inside each Kanban column** is affected.

---

## 3. Completed Header Interaction

Replace the passive Kanban Completed header with a real button.

Expected structure conceptually:

```text
<button class="kanban-completed-header"
        aria-expanded="true"
        aria-controls="...">
    <span>Completed</span>
    <span>
        <count>3</count>
        <chevron>▼</chevron>
    </span>
</button>
```

Required interaction support:

```text
mouse click
touch tap
Enter
Space
```

Native `<button>` behavior provides keyboard activation without custom Enter/Space listeners.

### Expanded

```text
aria-expanded="true"
chevron = ▼ / ▾
completed list visible
```

### Collapsed

```text
aria-expanded="false"
chevron = ▶ / ▸
completed list hidden
```

Use the existing UI's small chevron visual language; no large new icons.

---

## 4. Completed List and Drag/Drop Behavior

The completed Kanban list is currently a valid drag/drop lane:

```js
this.setDropLaneContext(completedList, 'completed', groupKey, group.key)
```

When that Completed section is collapsed:

```text
completedList.hidden = true
```

and also:

```text
clearDropLaneContext(completedList)
```

This prevents a hidden completed list from remaining an invisible drag destination.

When expanded again:

```text
completedList.hidden = false
setDropLaneContext(completedList, 'completed', groupKey, group.key)
```

Do not otherwise change drag/drop behavior.

---

## 5. Rendering Contract

Update `createKanbanColumn(groupKey, group)` so it:

1. initializes the Kanban Completed collapse Set if needed;
2. builds a stable `collapseKey` from `groupKey` + `group.key`;
3. reads whether that column's Completed section is collapsed;
4. creates an accessible Completed button;
5. creates a unique completed-list ID for `aria-controls`;
6. renders completed task cards normally;
7. applies initial hidden/drop-lane state from the collapse Set;
8. binds one click handler to toggle the state and UI.

Suggested focused helper methods if needed:

```text
getKanbanCompletedCollapseKey(groupKey, groupKeyValue)
isKanbanCompletedCollapsed(collapseKey)
toggleKanbanCompletedSection(...)
syncKanbanCompletedSection(...)
```

However, do not over-engineer this if a compact implementation can remain clear inside `task-kanban.js`.

### Unique IDs

Every completed list needs a DOM-unique ID for `aria-controls`.

Do not directly trust arbitrary project/tag/group keys as raw HTML IDs if they may contain unsafe/special characters.

Use either:

- a render-local numeric column index/counter; or
- a safely encoded/sanitized ID helper.

The collapse Set still uses the real stable group key internally.

---

## 6. Empty Completed Sections

Do not broaden this request into a redesign of empty Kanban columns.

Preserve the current Kanban rule for whether a `Completed 0` header is shown unless implementation reveals that existing behavior already conditionally hides it elsewhere.

The requested change is specifically **expand/collapse functionality**.

If the Completed count is zero:

- do not create fake task content;
- the button may remain visible according to current Kanban behavior;
- collapse/expand should remain harmless.

A separate request can later align empty Kanban Completed visibility with List view if desired.

---

## 7. Styling

Update `css/components/task-kanban.css` while preserving the current appearance.

Current `.kanban-completed-header` visual style should be retained as closely as possible after changing from `<div>` to `<button>`.

Add/reset as needed:

```text
width: 100%
border-left/right/bottom: 0
background: transparent
font: inherit
cursor: pointer
text-align: left
```

Add a right-side wrapper for:

```text
count + chevron
```

Suggested classes:

```text
.kanban-completed-meta
.kanban-completed-chevron
```

Use existing CSS variables for hover/focus.

Native `[hidden]` must actually remove the completed list:

```css
.kanban-completed-list[hidden] {
  display: none;
}
```

Do not add an animation that leaves the hidden list measurable as a drag target.

---

## 8. Relationship to List-View Collapse State

Keep the two view states separate.

Example:

```text
List Completed = collapsed
Kanban High Completed = expanded
Kanban Medium Completed = collapsed
```

Switching views must not force one state onto the other.

Reason:

- List has one global Completed section;
- grouped Kanban can have multiple independent Completed sections.

Therefore do not reuse `completedSectionCollapsed` as the Kanban state container.

Use a dedicated Kanban Set.

---

## 9. Files Expected to Change

Focused implementation should require only:

```text
js/components/task-kanban.js
css/components/task-kanban.css
```

Potentially no changes should be required in:

```text
index.html
js/components/task-renderer.js
js/components/tasks.js
storage modules
repeat modules
hierarchy modules
```

because Kanban columns are built dynamically inside `task-kanban.js`.

Avoid unrelated changes.

---

## 10. Manual Acceptance Matrix

No Chrome/Playwright/Puppeteer/Selenium/headless testing.

### A. Single-column Kanban

1. Set View = Kanban.
2. Set Group By = None.
3. Have multiple completed tasks.
4. Completed starts expanded.
5. Tap/click Completed.
6. Completed cards disappear.
7. Count/header remain visible.
8. Chevron changes to collapsed direction.
9. Tap again.
10. Completed cards return.

### B. Independent grouped columns

Given Group By = Priority:

```text
High    Completed 2
Medium  Completed 3
Low     Completed 1
```

1. Collapse only Medium Completed.
2. High remains expanded.
3. Low remains expanded.
4. Expand Medium again.
5. Only Medium changes.

### C. Rerender preservation

1. Collapse High Completed.
2. Complete/undo another task so Kanban rerenders.
3. High Completed remains collapsed.
4. Count updates correctly.

### D. View switching

1. Collapse a Kanban Completed section.
2. Switch to List view.
3. Verify List Completed uses its own existing state.
4. Switch back to Kanban.
5. The Kanban column remains collapsed during the same page session.

### E. Group switching

1. Group Kanban by Priority.
2. Collapse `priority:high` Completed.
3. Switch Group By to Project.
4. Collapse one Project Completed section.
5. Switch back to Priority.
6. High Completed returns collapsed.
7. Project state did not overwrite Priority state.

### F. Drag/drop safety

1. Collapse a Kanban Completed section.
2. Drag an active task near where the hidden Completed list used to be.
3. Hidden Completed area must not behave as an invisible destination.
4. Expand Completed.
5. Normal completed drop behavior is restored.

### G. Regression

Verify manually:

```text
active Kanban tasks unchanged
Kanban grouping unchanged
Kanban sorting unchanged
List-view Completed collapse unchanged
completed counts remain correct
Repeat completion still rerenders correctly
Link/Unlink behavior unchanged
```

---

## 11. Explicit Non-Goals

Do not implement:

- collapsing active Kanban task lists;
- collapsing entire Kanban columns;
- persistence across browser restarts;
- one global button that collapses every Kanban Completed section at once;
- redesign of Group By;
- completed-task filtering/sorting changes;
- recurrence changes;
- hierarchy changes;
- Timeline changes;
- List-view collapse redesign.

---

## 12. Implementation Order

1. Add dedicated `collapsedKanbanCompletedGroups` session state.
2. Create a stable collapse key per Kanban column.
3. Convert the Kanban Completed header from a passive div into an accessible button.
4. Add count + chevron state.
5. Apply native `hidden` to collapsed completed lists.
6. Clear/restore completed drop-lane context according to collapsed state.
7. Add focused Kanban CSS for button reset, hover/focus, count/chevron, and `[hidden]`.
8. Perform static integration review.
9. User manually runs the acceptance matrix in the real browser/phone.
