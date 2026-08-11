# Implementation Plan ID 4 — Compact Sort / Group Overlay Submenus

## Goal
Fix the secondary Sort / Group context menus created by Implementation Plan ID 3 so they behave like compact layered context menus instead of large side panels.

The requested behavior is:

1. The secondary submenu must **not open to the left or right** of the main `•••` menu.
2. It must open **on top of the main menu as a higher visual layer**, using the same menu anchor/location.
3. Its width must be based on its real content: longest label + normal horizontal padding + selected checkmark space.
4. It must not reserve a large fixed/minimum width when the content does not need it.
5. The existing layered interaction behavior must remain unchanged:
   - only one secondary submenu at a time;
   - selecting Sort/Group closes only the secondary menu;
   - main menu remains open underneath;
   - outside click closes everything;
   - Escape closes secondary first, then main.

Do not redesign View, sorting behavior, grouping behavior, task rendering, or Timeline.

---

## Current Verified GitHub Behavior

### Current JavaScript positioning

`js/components/workspace-controls.js` currently positions secondary menus with `positionSubmenu()` by explicitly trying the **left side** of the main menu first:

```js
let left = menuRect.left - subRect.width - 6;
```

If there is not enough room, it then tries the **right side**:

```js
if (left < margin) left = menuRect.right + 6;
```

This is why the submenu currently appears beside the main menu.

The current top position is based on the clicked Sort / Group trigger:

```js
triggerRect.top
```

That is also part of the side-panel model and should no longer drive the final submenu location.

### Current CSS sizing

`css/components/workspace-menu.css` currently uses:

```css
.workspace-submenu {
  position: fixed;
  z-index: 90;
  min-width: 170px;
  display: none;
  padding: 6px;
}
```

and every option uses:

```css
.workspace-submenu button {
  width: 100%;
  padding: 8px 30px 8px 10px;
}
```

The `min-width: 170px` means even short menus such as:

```text
None
Priority
Date
Project
Tag
```

cannot naturally shrink to the width their content actually needs.

The user-reported screenshot shows the practical result: the Group menu visually expands into a large horizontal rectangle with substantial unused empty space.

---

## Correct Visual Model

### Main menu

```text
┌────────────────────────────┐
│ VIEW                       │
│      [☷]     ▦      ⇥      │
├────────────────────────────┤
│ Sort              Custom › │
│ Group                None › │
└────────────────────────────┘
```

### Tap Group

The Group submenu should become a **new visual layer in the same menu location**:

```text
             Layer 2
        ┌──────────────┐
        │ None       ✓ │
        │ Priority     │
        │ Date         │
        │ Project      │
        │ Tag          │
        └──────────────┘
             ↑
       same menu anchor

             Layer 1
        ┌────────────────────┐
        │ VIEW               │
        │ ☷     ▦      ⇥     │
        │ Sort      Custom › │
        │ Group        None ›│
        └────────────────────┘
        (still open underneath)
```

Important clarification:

```text
NOT above the main menu vertically
NOT left of the main menu
NOT right of the main menu

YES: overlaid on the main menu as a higher z-index layer
```

The submenu and main menu should share the same top/right menu anchor so the new submenu feels like another context-menu layer replacing the visible foreground.

---

## Compact Width Contract

The secondary menu width should conceptually be:

```text
longest visible option
+ left padding
+ selected checkmark reserve
+ right padding
+ menu border/padding
```

For example, Group should be approximately only large enough for:

```text
Priority      ✓
Project
```

and Sort only large enough for its longest label:

```text
Created Date  ✓
```

Do not force Group and Sort to have identical widths.

Each submenu should size independently from its own labels.

---

## Implementation Step 1 — Replace Side Placement With Overlay Placement

**File:** `js/components/workspace-controls.js`

Refactor `positionSubmenu()`.

Remove the current left/right decision logic:

```js
let left = menuRect.left - subRect.width - 6;
if (left < margin) left = menuRect.right + 6;
```

The submenu should instead use the main menu itself as its positioning reference.

Recommended model:

1. read `this.menu.getBoundingClientRect()`;
2. measure the compact submenu after it becomes measurable;
3. place the submenu using the **same top/right anchor** as the main menu;
4. keep it inside the viewport with a small safety margin only when necessary.

Conceptually:

```text
submenu.top   = mainMenu.top
submenu.right = mainMenu.right
```

Because the submenu uses `position: fixed`, the actual implementation may calculate `left` as:

```text
mainMenu.right - submenu.width
```

This allows a narrow submenu to remain aligned to the same right-hand context-menu anchor without opening beside the main menu.

### Important

Do not use the clicked trigger's `triggerRect.top` as the final vertical anchor anymore.

Sort and Group secondary menus should both open from the same main-menu top position.

---

## Implementation Step 2 — Keep Secondary Menu Above Main Menu in Z-Order

**File:** `css/components/workspace-menu.css`

Keep or strengthen the layering relationship:

```text
main workspace menu  → lower z-index
secondary submenu    → higher z-index
```

Current values are approximately:

```css
.workspace-menu    { z-index: 80; }
.workspace-submenu { z-index: 90; }
```

This relationship is correct and should remain.

The main menu must stay open in the DOM and underneath the submenu.

Do not hide or remove the main menu when opening Sort or Group.

---

## Implementation Step 3 — Remove the Large Minimum Width

**File:** `css/components/workspace-menu.css`

Remove:

```css
min-width: 170px;
```

from `.workspace-submenu`.

Replace the sizing model with content-driven width.

Recommended CSS direction:

```css
.workspace-submenu {
  width: max-content;
  min-width: 0;
  max-width: calc(100vw - 16px);
}
```

The exact syntax can be adjusted if browser behavior requires it, but the result must be intrinsic/content-based rather than a fixed 170px minimum.

---

## Implementation Step 4 — Keep Option Labels on One Line

**File:** `css/components/workspace-menu.css`

Add/retain a no-wrap rule for submenu choices:

```css
.workspace-submenu button {
  white-space: nowrap;
}
```

This allows intrinsic menu sizing to be determined by the longest label instead of wrapping text and making the menu tall or unpredictable.

Keep enough right-side padding for the checkmark.

Current checkmark positioning:

```css
right: 10px;
```

is acceptable if the button padding continues to reserve space for it.

---

## Implementation Step 5 — Preserve Compact but Comfortable Touch Targets

Do not make the menu visually tiny by shrinking row height too aggressively.

The user complaint is about **unused horizontal width**, not the vertical tap target.

Keep approximately the current row height:

```css
min-height: 36px;
```

or an equivalent comfortable touch target.

Target:

```text
small width
normal row height
comfortable touch area
```

not:

```text
small width + cramped unreadable rows
```

---

## Implementation Step 6 — Make Width Independent for Sort and Group

Do not calculate one shared width from both secondary menus.

Desired result:

```text
GROUP
┌─────────────┐
│ None      ✓ │
│ Priority    │
│ Date        │
│ Project     │
│ Tag         │
└─────────────┘

SORT
┌────────────────┐
│ Custom       ✓ │
│ Due Date       │
│ Priority       │
│ Name           │
│ Created Date   │
└────────────────┘
```

Sort can naturally be slightly wider because `Created Date` is longer.

This is intentional.

---

## Implementation Step 7 — Preserve the Existing Open / Close State Machine

**File:** `js/components/workspace-controls.js`

Do not change these existing behaviors:

### One secondary menu only

```text
Sort open
↓ click Group
Sort closes
Group opens
```

### Selection

```text
Select option
↓
update state
↓
rerender tasks
↓
secondary submenu closes
↓
main menu remains open
```

### Escape

```text
secondary open
↓ Escape
secondary closes only
↓ Escape again
main menu closes
```

### Outside click

```text
click outside menu stack
↓
secondary closes
+
main menu closes
```

Only positioning and sizing are being corrected.

---

## Implementation Step 8 — Preserve Selected Checkmark Behavior

Do not remove the existing selected indicator.

The selected item must continue to show:

```text
✓
```

at the right side of the option row.

The compact width calculation must always leave enough horizontal room for this checkmark.

Example:

```text
┌──────────────┐
│ None       ✓ │
│ Priority     │
│ Date         │
└──────────────┘
```

The checkmark must never overlap the label.

---

## Implementation Step 9 — Reposition Correctly on Viewport Changes

The current controller already calls:

```text
repositionOpenSubmenu()
```

on window / VisualViewport resize.

Keep this behavior.

After the positioning model changes, an open submenu should continue to follow the current main menu position if:

- the browser viewport changes;
- phone orientation changes;
- browser chrome changes visible viewport geometry;
- desktop window is resized.

Do not reintroduce left/right placement during these updates.

---

## Implementation Step 10 — Avoid Unnecessary Markup / State Changes

No markup redesign is required for this correction.

Do not change:

- the View icon row;
- Sort labels;
- Group labels;
- current-value summaries;
- `activeSubmenu` state model;
- `createSubmenu()` option values;
- Timeline disabled state;
- sort direction button;
- sorting algorithms;
- grouping algorithms.

This should remain a focused visual/positioning correction.

---

## Expected Files to Change

### Primary

- `js/components/workspace-controls.js`
- `css/components/workspace-menu.css`

### Should not need changes

- `index.html`
- task renderer files;
- task state files;
- drag-and-drop files;
- Kanban implementation;
- Group By implementation;
- schedule/quick-task files.

---

## Expected Conceptual Diff

### JavaScript

From:

```text
position relative to clicked trigger
↓
try left side
↓
otherwise right side
```

To:

```text
measure compact submenu
↓
read main menu rect
↓
use same main-menu top/right anchor
↓
submenu overlays main menu
↓
clamp only to viewport safety margin
```

### CSS

From:

```css
.workspace-submenu {
  min-width: 170px;
}
```

To conceptually:

```css
.workspace-submenu {
  width: max-content;
  min-width: 0;
  max-width: calc(100vw - 16px);
}

.workspace-submenu button {
  white-space: nowrap;
}
```

Do not treat this conceptual diff as a requirement to use those exact property values if testing reveals a more robust intrinsic-sizing equivalent.

---

## Acceptance Checks — Position

1. Open `•••`.
2. Tap Group.
3. Group submenu opens **over the main menu**, not to its left.
4. Group submenu does not open to the right.
5. Group submenu does not open vertically above the main menu.
6. Group submenu shares the same top/right context-menu anchor as the main menu.
7. The main menu remains open underneath it.
8. Repeat with Sort; placement is identical in principle.

---

## Acceptance Checks — Width

9. Group submenu width is only large enough for its longest label, padding, and checkmark.
10. No large unused horizontal rectangle appears.
11. Sort submenu sizes independently and can be slightly wider than Group because `Created Date` is longer.
12. Selected checkmark remains visible.
13. Selected checkmark never overlaps text.
14. Labels stay on one line.
15. Menu does not overflow the viewport on a narrow phone.

---

## Acceptance Checks — Existing Interaction

16. Tap Sort → Sort submenu opens.
17. Tap Group while Sort is open → Sort closes and Group opens.
18. Select Group `Project` → Group submenu closes, main menu stays open.
19. Main menu summary updates to `Project`.
20. Select Sort `Priority` → Sort submenu closes, main menu stays open.
21. Sorting still changes correctly.
22. Grouping still changes correctly.
23. Escape closes secondary submenu first.
24. Second Escape closes main menu.
25. Clicking outside closes the whole menu stack.
26. List/Kanban View controls behave exactly as before.
27. Timeline remains disabled.

---

## Visual Completion Contract

### Wrong current result

```text
┌──────────────────────────────────────────────┐   ┌──────────────┐
│ None                                      ✓ │   │ Main menu    │
│ Priority                                    │   │              │
│ Date                                        │   │              │
│ Project                                     │   │              │
│ Tag                                         │   │              │
└──────────────────────────────────────────────┘   └──────────────┘
      huge + side-by-side
```

### Correct result

```text
          SECONDARY LAYER
          ┌──────────────┐
          │ None       ✓ │
          │ Priority     │
          │ Date         │
          │ Project      │
          │ Tag          │
          └──────────────┘
              ↓ overlays
          MAIN MENU
          ┌────────────────────┐
          │ VIEW               │
          │ ☷     ▦      ⇥     │
          │ Sort      Custom › │
          │ Group        None ›│
          └────────────────────┘
```

The fix is complete when the secondary Sort / Group menu is **compact, content-sized, and layered directly over the main menu at the same anchor**, with no left/right side-panel behavior.