# Implementation Plan ID 1 — Limit Blue Drag Styling to Placeholder Only

## Goal
Fix the drag-and-drop visual state so that **only the placeholder representing the future drop position is blue**.

The drag behavior itself is already working correctly on the phone and must not be redesigned.

## User-Reported Problem
When a task enters the floating drag state, too much of the interface becomes blue:

```text
CURRENT WRONG BEHAVIOR

[ Task A ]   ← blue/tinted because the whole drop lane is highlighted
[ BLUE PLACEHOLDER ]
[ Task C ]   ← blue/tinted because the whole drop lane is highlighted
[ Task D ]   ← blue/tinted because the whole drop lane is highlighted

       [ Task B ] ← floating task also gets blue/accent styling
```

The requested behavior is:

```text
DESIRED BEHAVIOR

[ Task A ]              ← normal appearance
[ BLUE PLACEHOLDER ]    ← the ONLY blue drag indicator
[ Task C ]              ← normal appearance
[ Task D ]              ← normal appearance

       [ Task B ]        ← floating, but normal task colors
```

## Verified Root Cause
The current GitHub source in `css/components/task-drag.css` contains two visual rules that create the unwanted blue styling.

### 1. Whole drop lane becomes blue

Current rule:

```css
body.task-drag-active .task-drop-lane.is-drop-target {
  background: var(--accent-light);
  box-shadow: inset 0 0 0 1px var(--accent-color);
}
```

`is-drop-target` is applied to the current destination lane by `js/components/task-drag.js` while dragging.

Because a drop lane contains multiple task families, styling the lane background causes the whole list/group/Kanban column behind the tasks to appear blue.

### 2. Floating task gets accent-colored border

Current rule:

```css
.task-family.is-dragging > .task-card {
  border-color: var(--accent-color);
  box-shadow: var(--shadow-lg);
}
```

The accent border makes the task currently being held look blue. The user wants the floating task to remain visually normal, except that it may keep a normal elevated shadow to communicate that it is floating.

### 3. Placeholder is already the correct blue indicator

Current rule:

```css
.task-drop-placeholder {
  flex: 0 0 auto;
  min-height: 40px;
  border: 2px solid var(--accent-color);
  border-radius: var(--radius-md);
  background: var(--accent-light);
  box-shadow: inset 0 0 0 1px var(--accent-light);
}
```

This is the visual treatment that should remain blue.

## Scope
This is a **visual CSS-only correction** unless implementation reveals an unexpected dependency.

Primary file:

- `css/components/task-drag.css`

Read for regression understanding only:

- `js/components/task-drag.js`
- `js/components/task-drag-commit.js`
- `js/components/task-drag-touch.js`
- `js/components/task-groups.js`
- `js/components/task-kanban.js`

Do not change drag ordering, touch ownership, placeholder movement, midpoint calculations, grouping metadata, or task state.

## Implementation Step 1 — Remove Blue Drop-Lane Tint
In `css/components/task-drag.css`, change the visual treatment of:

```css
body.task-drag-active .task-drop-lane.is-drop-target
```

The drop lane must no longer receive:

- blue/accent background;
- blue/accent inset border;
- any other full-lane color tint.

Preferred outcome:

```css
body.task-drag-active .task-drop-lane.is-drop-target {
  background: transparent;
  box-shadow: none;
}
```

Alternatively, if the selector becomes unnecessary for styling, remove the visual rule completely while keeping the JavaScript `is-drop-target` class behavior intact.

### Important
Do **not** remove the JavaScript logic that adds/removes `is-drop-target`.

That class is part of the drag destination state and may still be useful logically or for future styling. This fix should remove only the unwanted visual coloration.

## Implementation Step 2 — Restore Normal Floating Task Border
Current floating task styling changes its border to the accent color.

Remove:

```css
border-color: var(--accent-color);
```

from:

```css
.task-family.is-dragging > .task-card
```

The floating card should inherit/retain its normal task border color.

Keep the elevation shadow if it still looks natural:

```css
.task-family.is-dragging > .task-card {
  box-shadow: var(--shadow-lg);
}
```

This communicates that the task has lifted above the page without turning it blue.

## Implementation Step 3 — Keep Placeholder Blue
Do not remove or neutralize the existing `.task-drop-placeholder` accent styling.

The placeholder must remain the single strong blue drag indicator:

```text
Task being dragged       → normal colors + floating elevation
Other tasks              → normal colors
Current list/group/lane  → normal background
Placeholder              → BLUE
```

The placeholder must continue to show:

- blue/accent border;
- translucent accent background;
- current size matching the dragged task/family;
- current position based on midpoint drag calculations.

## Implementation Step 4 — Preserve Subtask Family Appearance
When a parent task with visible subtasks is dragged, the whole family moves together.

Do not add blue coloration to:

- parent task card;
- child/subtask cards;
- subtask container/background.

Existing floating shadows may remain if they are neutral and do not introduce accent coloring.

## Implementation Step 5 — Preserve List and Kanban Behavior
The visual correction must work identically in:

- normal List view;
- Group By sections;
- Kanban columns;
- active tasks;
- completed tasks where dragging is allowed.

Cross-group/column destination logic must not change.

## Explicit Non-Goals
Do not change any of the following:

- long-press activation timing;
- touch-event handling introduced for mobile drag reliability;
- mouse/pen Pointer Events behavior;
- drag auto-scroll;
- 50% midpoint swapping;
- Custom order logic;
- Group By metadata mutation;
- Priority changes;
- Project changes/cascade to subtasks;
- Date changes;
- Tag changes;
- parent/subtask hierarchy;
- completion state;
- task rendering structure;
- multi-select;
- Timeline.

## Expected Source Diff
The ideal implementation should be very small.

### Modify
`css/components/task-drag.css`

Expected conceptual changes:

```diff
 .task-family.is-dragging > .task-card {
-  border-color: var(--accent-color);
   box-shadow: var(--shadow-lg);
 }

 body.task-drag-active .task-drop-lane.is-drop-target {
-  background: var(--accent-light);
-  box-shadow: inset 0 0 0 1px var(--accent-color);
+  background: transparent;
+  box-shadow: none;
 }
```

If the second selector serves no visual purpose after the change, deleting that CSS rule entirely is also acceptable.

### Do Not Modify Unless Necessary
The JavaScript drag files should remain unchanged because the identified defect is visual, not behavioral.

## Acceptance Checks

### Core Visual Checks
1. Long-press a task until it becomes floating.
2. The floating task itself does **not** become blue.
3. The floating task may retain a normal elevation/shadow.
4. Other task cards remain exactly their normal colors.
5. The entire task list does not turn blue.
6. A Group By section does not turn blue.
7. A Kanban column does not turn blue.
8. The blue placeholder remains clearly visible.
9. The placeholder is the only blue drag-position indicator.

### Drag Regression Checks
10. Immediate vertical phone movement after long-press still works.
11. Horizontal/diagonal movement still works.
12. Placeholder still follows the correct destination position.
13. Crossing 50% of another task still swaps the placeholder correctly.
14. Dropping still commits the task to the placeholder position.
15. Same-group reordering still works.
16. Cross-group Priority drag still updates Priority.
17. Cross-group Project drag still updates Project and preserves subtask cascade.
18. Cross-group Date drag still updates the date correctly.
19. Cross-group Tag drag still updates tag membership correctly.
20. Kanban drag still works.
21. Parent + visible subtasks still float/move as one family.
22. Individual subtasks still do not become independent top-level drag items.
23. Cancelled drag still leaves task/order metadata unchanged.

## Visual Contract After Fix

```text
NORMAL

┌───────────────────────┐
│ Task A                │
└───────────────────────┘
┌───────────────────────┐
│ Task B                │
└───────────────────────┘
┌───────────────────────┐
│ Task C                │
└───────────────────────┘

              ↓ long-press Task B

DRAGGING

┌───────────────────────┐
│ Task A                │  normal
└───────────────────────┘
╔═══════════════════════╗
║ BLUE PLACEHOLDER      ║  blue only here
╚═══════════════════════╝
┌───────────────────────┐
│ Task C                │  normal
└───────────────────────┘

        ┌───────────────────────┐
        │ Task B                │  floating, normal colors
        └───────────────────────┘
```

## Completion Rule
This fix is complete when **the placeholder is the only blue element introduced by dragging**.

The application must no longer tint the active lane/list/column blue, and the floating task must no longer receive an accent-colored border.

All existing drag-and-drop behavior must remain unchanged.