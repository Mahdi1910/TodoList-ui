# Implementation Plan ID 3 — Layered Workspace View / Sort / Group Menu

## Goal
Redesign the existing top-right `•••` workspace menu so it becomes smaller, cleaner, and more visually polished without changing the underlying task sorting, grouping, List/Kanban behavior, or any unrelated application logic.

The new menu must use a **layered context-menu interaction**:

1. `View` appears first.
2. List / Kanban / Timeline appear as three icon-only controls in one horizontal row.
3. The main menu shows only two option rows below View: `Sort` and `Group`.
4. Clicking `Sort` opens a second context menu containing only sort choices.
5. Clicking `Group` opens a second context menu containing only group choices.
6. Only one secondary submenu may be open at a time.
7. Choosing a value closes only the secondary submenu; the main `•••` menu remains open.
8. Clicking outside the complete menu stack closes everything.

Do not implement Timeline behavior in this plan. Timeline is currently disabled and must remain disabled.

---

## Current Verified GitHub Behavior

### Current markup

`index.html` currently renders the workspace menu in this order:

```text
Sort
  Custom
  Due Date
  Priority
  Name
  Created Date

Group By
  None
  Priority
  Date
  Project
  Tag

View
  List
  Kanban
  Timeline (disabled)
```

All choices are visible in one 180px-wide vertical menu.

### Current JavaScript behavior

`js/components/workspace-controls.js` currently:

- owns `sortKey`, `sortDirection`, `groupKey`, and `viewType`;
- listens to a single click handler on `#workspace-menu`;
- finds `[data-sort-key]`, `[data-group-key]`, or `[data-view-type]`;
- updates state;
- calls `syncUI()`;
- **always calls `closeMenu()` after a selection**;
- renders tasks again.

The existing `normalizeViewType()` only supports:

```text
list
kanban
```

Anything else normalizes to `list`.

Therefore Timeline must stay visually present but disabled.

### Current CSS behavior

`css/layout/workspace-layout.css` currently:

- positions `.workspace-menu` under the `•••` button;
- uses `width: 180px`;
- styles every menu button as a full-width text row;
- adds a `✓` pseudo-element to `.workspace-menu button.selected`;
- has no nested/secondary submenu styling.

This generic selected rule cannot be reused unchanged for icon-only View buttons because an icon selector should use a visual selected background/border, not append a text checkmark beside the icon.

---

## Target Visual Structure

The main menu should become:

```text
┌────────────────────────────┐
│ View                       │
│                            │
│      [☷]     ▦      ⇥      │
│                            │
├────────────────────────────┤
│ Sort              Custom › │
│ Group                None › │
└────────────────────────────┘
```

Important visual rules:

- `View` is the first section.
- View choices are in one horizontal row.
- View choices are **icon-only**.
- No `List`, `Kanban`, or `Timeline` text is visible inside the row.
- Use `title` and `aria-label` so the icons remain understandable and accessible.
- The selected view receives a subtle selected background/border.
- Timeline appears as the third icon but remains disabled.
- Sort and Group are each one full-width trigger row.
- A right-pointing chevron communicates that each row opens another context menu.
- A muted current-value summary such as `Custom`, `Priority`, `None`, etc. may appear inside the same trigger row; this is still one button, not additional controls.

Recommended semantic layout:

```text
[Sort]   [current value]   ›
[Group]  [current value]   ›
```

---

## Target Interaction Model

### Main menu

```text
Tap •••
   ↓
Main menu opens
```

The main menu remains open until one of these happens:

- user taps `•••` again;
- user clicks/taps outside the entire menu stack;
- Escape is pressed while no secondary submenu is open.

Selecting a View icon should update the view but should not require reopening the `•••` menu for the next adjustment.

---

## Sort submenu

Clicking the Sort trigger opens a separate secondary context panel:

```text
        ┌─────────────────────┐
        │ ✓ Custom            │
        │   Due Date          │
        │   Priority          │
        │   Name              │
        │   Created Date      │
        └─────────────────────┘

┌────────────────────────────┐
│ View                       │
│      [☷]     ▦      ⇥      │
├────────────────────────────┤
│ Sort              Custom › │
│ Group                None › │
└────────────────────────────┘
```

The secondary menu must visually sit above the main menu layer using a higher z-index.

Because the main menu is anchored near the right edge of the screen, prefer opening the secondary panel to the **left** of the main menu when space allows.

On small screens or unusual viewport widths, calculate/clamp the secondary panel position so it never renders off-screen.

---

## Group submenu

Clicking Group opens:

```text
        ┌─────────────────────┐
        │ ✓ None              │
        │   Priority          │
        │   Date              │
        │   Project           │
        │   Tag               │
        └─────────────────────┘

┌────────────────────────────┐
│ View                       │
│      [☷]     ▦      ⇥      │
├────────────────────────────┤
│ Sort              Custom › │
│ Group                None › │
└────────────────────────────┘
```

If Sort is open and the user taps Group:

```text
Sort submenu closes
        ↓
Group submenu opens
```

If Group is open and the user taps Sort, perform the inverse.

Never show both secondary menus at once.

---

## Selection Behavior

### Selecting Sort

Example:

```text
Sort submenu open
        ↓
Tap Priority
        ↓
sortKey = priority
        ↓
tasks rerender
        ↓
Sort submenu closes
        ↓
MAIN MENU STAYS OPEN
```

Then the main menu can show:

```text
Sort            Priority ›
```

The user can immediately open Group or choose another View without reopening `•••`.

### Selecting Group

Same rule:

```text
Choose Project
        ↓
groupKey = project
        ↓
tasks rerender
        ↓
Group submenu closes
        ↓
MAIN MENU STAYS OPEN
```

### Selecting View

Clicking List or Kanban should:

- call the existing `setViewType()` behavior;
- preserve Project/Tag view persistence;
- rerender as today;
- update selected icon styling;
- keep the main menu open.

Timeline remains disabled and must not call `setViewType()`.

---

## Outside Click Behavior

The closing logic needs to distinguish between two menu layers.

### Click inside secondary submenu

Do not close the main menu.

If an option is selected:

- apply selection;
- close secondary submenu;
- keep main menu open.

### Click inside main menu but outside secondary submenu

Close the secondary submenu first, then allow the main-menu action to continue.

Examples:

- Sort submenu is open → tap Group → close Sort, open Group.
- Sort submenu is open → tap List icon → close Sort, change view, keep main menu open.

### Click outside both menus

Close:

```text
secondary submenu
+
main workspace menu
```

### Click `•••` while menu is open

Close both layers.

---

## Escape / Keyboard Behavior

Use layered dismissal:

```text
Secondary submenu open
        ↓ Escape
Close secondary submenu only
        ↓ Escape again
Close main menu and return focus to •••
```

If only the main menu is open, Escape closes it and returns focus to `#btn-workspace-menu`.

---

## Implementation Step 1 — Restructure Workspace Menu Markup

**File:** `index.html`

Replace the existing long vertical Sort / Group / View option list with three areas.

### A. View section first

Create a compact view switcher row:

```html
<div class="workspace-menu-label">View</div>
<div class="workspace-view-switcher" role="group" aria-label="Task view">
  <button data-view-type="list" ...>...</button>
  <button data-view-type="kanban" ...>...</button>
  <button disabled aria-disabled="true" ...>...</button>
</div>
```

Use inline SVG icons consistent with the rest of the application.

Suggested icon concepts:

- List: stacked horizontal lines/cards.
- Kanban: 2–3 vertical columns.
- Timeline: horizontal timeline/calendar-track symbol.

Do not show text inside these three buttons.

Provide:

- `aria-label="List view"`;
- `aria-label="Kanban view"`;
- `aria-label="Timeline view (unavailable)"`;
- matching `title` values.

### B. Sort trigger row

Use one button:

```html
<button id="workspace-sort-trigger" class="workspace-submenu-trigger" ...>
  <span>Sort</span>
  <span class="workspace-menu-current" id="workspace-sort-current">Custom</span>
  <span class="workspace-menu-chevron">›</span>
</button>
```

### C. Group trigger row

Same structure:

```text
Group    None    ›
```

### D. Secondary menus

Create two separate hidden secondary menu containers so the choices remain clear and semantically independent:

- `#workspace-sort-menu`
- `#workspace-group-menu`

Sort menu retains the existing values:

```text
Custom
Due Date
Priority
Name
Created Date
```

Group menu retains:

```text
None
Priority
Date
Project
Tag
```

Do not rename the data values used by JavaScript.

---

## Implementation Step 2 — Add Explicit Secondary Menu State

**File:** `js/components/workspace-controls.js`

During `init()`, cache:

- main menu;
- Sort trigger;
- Group trigger;
- Sort secondary menu;
- Group secondary menu;
- current-value labels.

Add explicit state such as:

```js
activeSubmenu: null
```

where allowed values are:

```text
null
sort
group
```

Do not infer submenu state only from incidental DOM classes.

---

## Implementation Step 3 — Separate Main Menu and Secondary Menu Actions

The existing `handleMenuClick()` currently handles all option types and then calls `closeMenu()`.

Refactor this behavior.

Recommended separation:

```text
handleMainMenuClick()
handleSortMenuClick()
handleGroupMenuClick()
openSubmenu(type)
closeSubmenu()
closeMenu()
```

`closeMenu()` must always also close any secondary submenu.

Do not duplicate task sorting/grouping algorithms; only change menu orchestration.

---

## Implementation Step 4 — Preserve Existing State Mutation

Keep these behaviors exactly as they currently work:

### Sort

```js
this.sortKey = this.normalizeSortKey(...)
```

### Group

```js
this.groupKey = ...
```

### View

Continue using:

```js
this.setViewType(viewType, { persist: true, render: false })
```

then render once.

Do not alter:

- `sortTasks()`;
- priority ranking;
- Date grouping semantics;
- Project/Tag grouping;
- Custom order behavior;
- Project/Tag saved `viewType` behavior.

---

## Implementation Step 5 — Stop Closing Main Menu After Selection

Current behavior ends every selection with:

```js
this.closeMenu();
```

That must change.

### Sort selection

After applying Sort:

```text
sync UI
render tasks
close Sort submenu only
main menu remains open
```

### Group selection

Same behavior.

### View selection

Apply List/Kanban and keep the main menu open.

This is a key acceptance requirement.

---

## Implementation Step 6 — Position Secondary Context Menu Robustly

Secondary menus should be independent floating panels.

Recommended implementation:

1. read the main menu and clicked trigger with `getBoundingClientRect()`;
2. calculate the submenu's width/height;
3. prefer left-side placement because the main menu sits at the right edge;
4. if insufficient left space, place it to the right if possible;
5. clamp top/bottom to a small viewport margin;
6. update position whenever opened.

Example target geometry:

```text
secondary.right ≈ main.left - 6px
secondary.top   ≈ trigger.top
```

Use `position: fixed` for the secondary panel if that makes viewport clamping simpler and avoids clipping by parent containers.

Do not hardcode one phone-specific position.

---

## Implementation Step 7 — Redesign Main Menu CSS

**File:** `css/layout/workspace-layout.css`

Update the main menu to feel closer to a polished native context menu.

Recommended characteristics:

- width approximately 200–220px;
- slightly more breathing room than current 180px menu;
- consistent 8–10px internal spacing;
- subtle border and current shadow language;
- rounded corners consistent with existing variables;
- clean section separation.

Keep the current application color system; do not introduce a new visual theme.

---

## Implementation Step 8 — Style Icon-Only View Row

Create dedicated rules for `.workspace-view-switcher` and its buttons.

Target:

```text
┌────────────────────────┐
│    [icon] [icon] [icon]│
└────────────────────────┘
```

Each icon control should:

- have equal width;
- be around 36–40px tall;
- center its SVG;
- have no visible text;
- have a subtle hover state;
- use a selected background and/or border;
- use `aria-checked` for List/Kanban.

The disabled Timeline icon should:

- stay visible;
- use muted opacity/color;
- not respond to activation;
- not receive the normal selected state.

Important: scope the current generic checkmark rule so it applies to option rows in the Sort/Group secondary menus only.

Do **not** allow:

```css
.workspace-menu button.selected::after
```

to append `✓` to the icon-only View buttons.

---

## Implementation Step 9 — Style Sort / Group Trigger Rows

The main trigger buttons should look like context-navigation rows, not selected options.

Conceptual visual:

```text
Sort       Priority      ›
Group      Project       ›
```

Use three alignment zones:

```text
label | current value | chevron
```

The current value should be muted compared with the primary label.

The chevron should stay aligned at the far right.

When its submenu is open, the trigger may receive the normal hover/active background.

Do not show a checkmark on these trigger rows.

---

## Implementation Step 10 — Style Secondary Menus

Add a reusable class such as:

```text
.workspace-submenu
```

It should visually match the main menu:

- same background;
- same border;
- same radius;
- same shadow language;
- slightly higher z-index;
- option rows with hover state;
- selected option with checkmark.

Keep the secondary menu compact.

Only one `.open` secondary panel at a time.

---

## Implementation Step 11 — Improve `syncUI()`

`syncUI()` must update all three layers correctly.

### Sort menu

Keep selected state / `aria-checked` on the active sort option.

Also update the main Sort summary text:

```text
custom    → Custom
dueDate   → Due Date
priority  → Priority
name      → Name
createdAt → Created Date
```

### Group menu

Update selected state and summary:

```text
none     → None
priority → Priority
date     → Date
project  → Project
tag      → Tag
```

### View icons

Update selected state only for List/Kanban.

Do not modify Timeline availability.

### Sort direction

Preserve the existing external `#btn-sort-direction` behavior exactly unless a later request explicitly redesigns it.

This plan changes the `•••` menu only. The separate ascending/descending control in the header is outside this requested scope.

---

## Implementation Step 12 — Layered Outside-Click Handling

The current global document click simply calls `closeMenu()`.

Replace it with logic aware of the complete menu stack.

Conceptually:

```text
if click is inside main menu:
    do not close main

if click is inside active secondary menu:
    do not close main

if click is outside both:
    closeMenu()
```

Because secondary panels may use `position: fixed` and live outside the main menu DOM subtree, do not depend only on `mainMenu.contains(event.target)`.

Check both main and active submenu elements.

---

## Implementation Step 13 — Focus and Accessibility

Preserve useful keyboard semantics.

Required:

- `#btn-workspace-menu` keeps `aria-haspopup="menu"` and `aria-expanded`.
- Sort/Group triggers use `aria-haspopup="menu"`.
- Update trigger `aria-expanded` as secondary menus open/close.
- Sort/Group options keep `role="menuitemradio"` and `aria-checked`.
- View icon buttons expose meaningful `aria-label`s.
- Timeline uses both native `disabled` and `aria-disabled="true"`.
- Escape follows topmost-layer-first dismissal.

Optional polish if straightforward:

- when opening a submenu by keyboard, focus its selected option;
- when Escape closes a submenu, restore focus to its trigger.

Do not make accessibility behavior worse than the current menu.

---

## Files Expected to Change

### Primary

- `index.html`
- `js/components/workspace-controls.js`
- `css/layout/workspace-layout.css`

### Do not change unless an actual dependency is discovered

- task rendering files;
- task state/data model;
- drag/drop files;
- quick-task keyboard fix;
- sidebar files;
- scheduling files;
- Kanban rendering implementation;
- Project/Tag storage logic.

---

## Explicit Non-Goals

Do not implement or change:

- Timeline functionality;
- task sorting algorithms;
- Group By algorithms;
- drag-and-drop ordering;
- Custom sort semantics;
- sort-direction semantics;
- Project/Tag view persistence;
- task data model;
- persistence/storage;
- quick-task modal;
- mobile keyboard handling;
- sidebar menus;
- task action menus.

---

## Desired Final Visual

### Main context menu

```text
┌────────────────────────────┐
│ View                       │
│                            │
│      [☷]     ▦      ⇥      │
│                            │
├────────────────────────────┤
│ Sort              Custom › │
│ Group                None › │
└────────────────────────────┘
```

### Sort open

```text
        ┌─────────────────────┐
        │ ✓ Custom            │
        │   Due Date          │
        │   Priority          │
        │   Name              │
        │   Created Date      │
        └─────────────────────┘

┌────────────────────────────┐
│ View                       │
│      [☷]     ▦      ⇥      │
├────────────────────────────┤
│ Sort              Custom › │
│ Group                None › │
└────────────────────────────┘
```

### After selecting Priority

```text
┌────────────────────────────┐
│ View                       │
│      [☷]     ▦      ⇥      │
├────────────────────────────┤
│ Sort            Priority › │
│ Group                None › │
└────────────────────────────┘
```

The Sort submenu is gone, but the main menu is still visible.

---

## Acceptance Checks — Main Layout

1. Tap/click `•••`.
2. `View` is the first section at the top.
3. List, Kanban, Timeline are on one horizontal row.
4. No visible List/Kanban/Timeline text appears in the row.
5. List and Kanban have meaningful tooltips/accessibility labels.
6. Timeline appears as an icon but remains disabled.
7. Only Sort and Group rows appear below View.
8. Full Sort choices are not visible until Sort is opened.
9. Full Group choices are not visible until Group is opened.

---

## Acceptance Checks — Sort Layer

10. Click Sort.
11. A secondary context menu opens.
12. Main menu remains visible underneath/beside it.
13. Current sort option has a selected/check state.
14. Select Priority.
15. Task sorting changes correctly.
16. Secondary Sort menu closes.
17. Main menu stays open.
18. Main Sort row now communicates Priority.
19. Existing ascending/descending button behavior still works.
20. Custom still disables direction behavior exactly as before.

---

## Acceptance Checks — Group Layer

21. Click Group.
22. Group submenu opens.
23. Select Project.
24. Tasks group by Project exactly as before.
25. Group submenu closes.
26. Main menu stays open.
27. Main Group row now communicates Project.
28. Open Sort, then click Group.
29. Sort submenu closes before Group submenu opens.
30. Both secondary menus are never visible simultaneously.

---

## Acceptance Checks — View

31. Click List icon.
32. List becomes selected and renders correctly.
33. Main menu stays open.
34. Click Kanban icon.
35. Kanban becomes selected and renders correctly.
36. Project/Tag saved `viewType` behavior remains intact.
37. Timeline icon cannot be activated.
38. Clicking Timeline does not switch to List accidentally.

---

## Acceptance Checks — Dismissal

39. Open Sort submenu and press Escape.
40. Sort submenu closes but main menu remains.
41. Press Escape again.
42. Main menu closes and focus returns to `•••`.
43. Open a submenu and click outside both panels.
44. Both menus close.
45. Open a submenu and click another control inside the main menu.
46. Secondary submenu closes appropriately while main menu remains usable.
47. Clicking `•••` while any layer is open closes the entire stack.

---

## Acceptance Checks — Responsive / Visual

48. Main menu stays inside the viewport on desktop.
49. Main menu stays inside the viewport on Android phone.
50. Secondary menu prefers a natural position beside the main menu.
51. Secondary menu never extends off the left/right screen edge.
52. Secondary menu never becomes inaccessible below the viewport.
53. View icons have equal dimensions and alignment.
54. Selected View icon is visually obvious without a textual checkmark.
55. Sort/Group selected values use normal text/check treatment only inside their secondary menus.
56. Existing app colors, radius, hover behavior, and shadow language remain consistent.

---

## Completion Rule

This redesign is complete when the three-dot menu behaves as a **two-layer compact context menu**:

```text
•••
 ↓
MAIN MENU
 ├── View: [List icon] [Kanban icon] [Timeline disabled icon]
 ├── Sort  › → secondary Sort menu
 └── Group › → secondary Group menu
```

Selecting a Sort or Group choice must close only the secondary menu and leave the main menu open. The existing task sorting, grouping, List/Kanban functionality, Custom ordering, and sort-direction logic must continue working unchanged.