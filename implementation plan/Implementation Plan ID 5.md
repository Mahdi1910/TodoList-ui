# Implementation Plan ID 5 — Combined Sort & Group Settings Panel

## Goal
Replace the current two-secondary-menu model (`Sort` submenu + `Group` submenu) with one cleaner **Sort & Group** control.

The top-right `•••` workspace menu should keep the existing View section, but below View there should be only **one trigger row**:

```text
┌────────────────────────────┐
│ VIEW                       │
│      [☷]     ▦      ⇥      │
├────────────────────────────┤
│ Sort & Group             › │
└────────────────────────────┘
```

Clicking `Sort & Group` opens one secondary settings panel containing **two sections inside the same panel**:

```text
┌────────────────────────────────┐
│ SORT                           │
│                                │
│ [Custom] [Due Date]            │
│ [Priority] [Name]              │
│ [Created Date]                 │
│                                │
│ GROUP                          │
│                                │
│ [None] [Priority] [Date]       │
│ [Project] [Tag]                │
└────────────────────────────────┘
```

Each option is a rounded-corner button/chip. The currently selected Sort option and currently selected Group option are visually highlighted.

Do not use checkmarks as the primary selection indicator in this new panel. The selected rounded button itself should communicate selection.

---

## Current Verified GitHub State

### Current controller

`js/components/workspace-controls.js` currently:

- stores `sortKey`, `sortDirection`, `groupKey`, and `viewType`;
- stores `activeSubmenu`;
- creates two separate triggers:
  - `#workspace-sort-trigger`
  - `#workspace-group-trigger`;
- creates two separate secondary menus:
  - `#workspace-sort-menu`
  - `#workspace-group-menu`;
- tracks which submenu is open with values such as `sort` and `group`;
- uses `openSubmenu(type)`, `closeSubmenu()`, `positionSubmenu()`, and `repositionOpenSubmenu()`;
- uses a one-layer-at-a-time outside-click model:
  - if a secondary menu is open, first outside click closes it;
  - a later outside click closes the main menu.

### Current secondary-menu styling

`css/components/workspace-menu.css` still styles Sort/Group as traditional context menus:

```text
Custom
Due Date
Priority
Name
Created Date
```

and:

```text
None
Priority
Date
Project
Tag
```

with one vertical row per option and a selected checkmark.

That model is no longer wanted.

---

## Target Visual Structure

### Main menu

Keep View first exactly as today:

```text
┌────────────────────────────┐
│ VIEW                       │
│                            │
│      [☷]     ▦      ⇥      │
│                            │
├────────────────────────────┤
│ Sort & Group             › │
└────────────────────────────┘
```

Important:

- View icon behavior stays unchanged.
- List and Kanban remain functional.
- Timeline remains visible but disabled.
- Remove the separate visible `Sort` and `Group` rows.
- Replace them with one `Sort & Group` row.

---

## Target Combined Panel

When the user clicks `Sort & Group`, open one secondary panel.

Example:

```text
┌────────────────────────────────┐
│ SORT                           │
│                                │
│ ╭────────╮ ╭──────────╮        │
│ │ Custom │ │ Due Date │        │
│ ╰────────╯ ╰──────────╯        │
│ ╭──────────╮ ╭──────╮          │
│ │ Priority │ │ Name │          │
│ ╰──────────╯ ╰──────╯          │
│ ╭──────────────╮               │
│ │ Created Date │               │
│ ╰──────────────╯               │
│                                │
│ GROUP                          │
│                                │
│ ╭──────╮ ╭──────────╮ ╭──────╮│
│ │ None │ │ Priority │ │ Date ││
│ ╰──────╯ ╰──────────╯ ╰──────╯│
│ ╭─────────╮ ╭─────╮            │
│ │ Project │ │ Tag │            │
│ ╰─────────╯ ╰─────╯            │
└────────────────────────────────┘
```

This is a settings panel, not a traditional vertical context-menu list.

---

## Selected-State Design

Each section is single-select.

### Sort

Exactly one Sort option is selected at a time:

```text
[ Custom ] [ Due Date ] [ PRIORITY ] [ Name ] [ Created Date ]
                         ↑ selected/highlighted
```

### Group

Exactly one Group option is selected at a time:

```text
[ None ] [ Priority ] [ Date ] [ PROJECT ] [ Tag ]
                                  ↑ selected/highlighted
```

The selected button should use the application's existing accent/selected visual language.

Recommended direction:

```text
normal button   → subtle border/background
selected button → stronger background/border/accent
```

Do not rely on a tiny `✓` at the far right as the main selection signal.

Accessibility must still use `aria-checked="true"` / `false` or equivalent radio semantics.

---

## Interaction Contract

### Opening

```text
Tap •••
  ↓
Main menu opens
  ↓
Tap Sort & Group
  ↓
Combined panel opens
```

Only one combined secondary panel exists.

There is no longer a separate Sort submenu and Group submenu.

---

## Selection Behavior

### Change Sort

```text
Combined panel open
        ↓
Tap Priority
        ↓
sortKey = priority
        ↓
Tasks rerender immediately
        ↓
Priority rounded button becomes highlighted
        ↓
Combined panel STAYS OPEN
```

The user should be able to immediately change Group without reopening anything.

### Change Group

```text
Combined panel open
        ↓
Tap Project
        ↓
groupKey = project
        ↓
Tasks rerender immediately
        ↓
Project rounded button becomes highlighted
        ↓
Combined panel STAYS OPEN
```

This is a major difference from the previous context-menu behavior.

Selecting an option should **not close the combined panel**.

---

## Layered Outside-Click Behavior

Preserve the current two-stage dismissal concept.

### Combined panel open

First outside click:

```text
Combined Sort & Group panel closes
Main ••• menu remains open
```

Second outside click:

```text
Main ••• menu closes
```

The new architecture should preserve this exact interaction even though there is now only one type of secondary panel.

---

## Escape Behavior

Keep layered keyboard dismissal:

```text
Combined panel open
        ↓ Escape
Combined panel closes only
        ↓ Escape again
Main menu closes
        ↓
Focus returns to •••
```

If only the main menu is open, one Escape closes it.

---

## Main-Menu Interaction While Combined Panel Is Open

If the combined panel is open and the user interacts with the main menu:

### Click a View icon

Preferred behavior:

```text
Combined panel closes
View changes
Main menu remains open
```

This keeps the visual stack predictable and matches the existing layered model.

### Click Sort & Group trigger again

```text
Combined panel closes
Main menu remains open
```

This makes the trigger a normal toggle.

### Click ••• again

Close both layers.

---

## Implementation Step 1 — Replace Two Main-Menu Triggers With One

**File:** `js/components/workspace-controls.js`

`buildLayeredMenu()` currently generates separate Sort and Group trigger rows.

Remove:

```text
Sort      [current] ›
Group     [current] ›
```

Replace them with one row:

```text
Sort & Group ›
```

Suggested semantic structure:

```html
<button
  type="button"
  class="workspace-submenu-trigger"
  id="workspace-sort-group-trigger"
  aria-haspopup="dialog"
  aria-expanded="false"
>
  <span class="workspace-menu-primary">Sort & Group</span>
  <span class="workspace-menu-chevron" aria-hidden="true">›</span>
</button>
```

The exact role may be `dialog`, `group`, or another appropriate accessible pattern depending on the final panel markup, but do not represent it as two independent submenus anymore.

The current Sort/Group summary texts in the main menu are no longer required unless implementation finds a clean non-cluttered way to display them. The requested design favors one simple row.

---

## Implementation Step 2 — Create One Combined Panel

**File:** `js/components/workspace-controls.js`

Remove creation of:

```text
workspace-sort-menu
workspace-group-menu
```

Replace with one panel, for example:

```text
workspace-sort-group-panel
```

The panel contains:

1. Sort section label.
2. Sort option-button container.
3. Group section label.
4. Group option-button container.

Conceptual DOM:

```html
<div id="workspace-sort-group-panel" class="workspace-settings-panel">
  <section class="workspace-settings-section">
    <div class="workspace-settings-label">Sort</div>
    <div class="workspace-option-chips" role="radiogroup" aria-label="Sort tasks">
      ...
    </div>
  </section>

  <section class="workspace-settings-section">
    <div class="workspace-settings-label">Group</div>
    <div class="workspace-option-chips" role="radiogroup" aria-label="Group tasks">
      ...
    </div>
  </section>
</div>
```

Do not generate two floating panels.

---

## Implementation Step 3 — Preserve Existing Data Values

Do not rename the internal sort/group values.

Sort values stay:

```text
custom
dueDate
priority
name
createdAt
```

Group values stay:

```text
none
priority
date
project
tag
```

This allows the redesign to reuse all current behavior without modifying sorting/grouping algorithms.

---

## Implementation Step 4 — Simplify Secondary-Panel State

**File:** `js/components/workspace-controls.js`

The current state:

```js
activeSubmenu: null | 'sort' | 'group'
```

is no longer necessary because there is only one secondary panel.

Simplify to something clearer, for example:

```js
settingsPanelOpen: false
```

or:

```js
activeSubmenu: null | 'sortGroup'
```

Prefer the simplest state that keeps the existing outside-click/Escape behavior readable.

Do not keep old `sort`/`group` branches around after the redesign.

---

## Implementation Step 5 — Remove Obsolete Two-Submenu Functions

Refactor or remove code that exists only because there are currently two secondary menus.

Candidates include:

```text
createSubmenu(id, options, type)
openSubmenu(type)
closeSubmenu()
handleSubmenuClick(type, e)
repositionOpenSubmenu() branches for sort/group
```

Replace with combined-panel equivalents, for example:

```text
createSortGroupPanel()
openSortGroupPanel()
closeSortGroupPanel()
toggleSortGroupPanel()
handleSortGroupPanelClick(e)
positionSortGroupPanel()
```

The goal is to **simplify** the controller, not add the new design on top of the old submenu architecture.

Keep the module within the project's normal small-module convention when practical.

---

## Implementation Step 6 — Handle Sort and Group Clicks Inside One Panel

Use event delegation inside the combined panel.

Conceptually:

```js
const sortItem = e.target.closest('[data-sort-key]');
const groupItem = e.target.closest('[data-group-key]');
```

For Sort:

```js
this.sortKey = this.normalizeSortKey(sortItem.dataset.sortKey);
this.syncUI();
window.TasksComponent?.render();
```

For Group:

```js
this.groupKey = groupItem.dataset.groupKey;
this.syncUI();
window.TasksComponent?.render();
```

Important:

**Do not close the panel after either selection.**

---

## Implementation Step 7 — Update `syncUI()` for Rounded Selections

**File:** `js/components/workspace-controls.js`

`syncUI()` should update selected states inside the combined panel.

Sort options:

```text
selected class
aria-checked=true
```

only for the current `sortKey`.

Group options:

```text
selected class
aria-checked=true
```

only for the current `groupKey`.

Remove any dependence on selected checkmark pseudo-elements from the old secondary menu styling.

Keep existing View icon synchronization and Sort Direction button synchronization unchanged.

---

## Implementation Step 8 — Position the Combined Panel as One Secondary Layer

**File:** `js/components/workspace-controls.js`

The combined panel should behave as the secondary layer of the main menu.

Use the existing successful main-menu anchoring model rather than opening a side panel.

Recommended target:

```text
combined panel top/right anchor ≈ main menu top/right anchor
combined panel z-index > main menu z-index
```

This means when opened it visually becomes the foreground menu layer while the main menu remains underneath.

If the panel is taller/wider than available space:

- clamp to viewport margins;
- allow internal wrapping of option chips;
- avoid giant fixed width;
- do not open off-screen.

Because the combined panel intentionally contains more controls than the previous compact submenu, it may reasonably be around the same width as the main menu or modestly wider, but it must stay visually compact and mobile-safe.

Do not return to left/right side-opening behavior.

---

## Implementation Step 9 — Replace Old Context-Menu CSS With Settings-Panel CSS

**File:** `css/components/workspace-menu.css`

Remove or refactor old rules that exist only for traditional secondary menu rows, including patterns like:

```text
.workspace-submenu
.workspace-submenu button
.workspace-submenu button.selected::after
```

Replace with dedicated combined-panel classes such as:

```text
.workspace-settings-panel
.workspace-settings-section
.workspace-settings-label
.workspace-option-chips
.workspace-option-chip
```

Do not leave unused old secondary-menu CSS behind.

---

## Implementation Step 10 — Style the Two Sections Clearly

The combined panel must clearly read as two areas:

```text
SORT
[buttons...]

GROUP
[buttons...]
```

Recommended section-label style:

- small uppercase or semibold text;
- muted color;
- consistent with the existing `VIEW` label;
- enough spacing before the chip group.

A subtle divider between Sort and Group is optional, but the sections must be visually distinct even without one.

---

## Implementation Step 11 — Rounded Option Buttons

Each option should be a compact rounded control.

Recommended characteristics:

```text
border-radius: pill-like or medium rounded
height: comfortable touch target
horizontal padding: enough for label
background: subtle
border: subtle
```

Use wrapping layout rather than one huge row.

Conceptual CSS direction:

```css
.workspace-option-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.workspace-option-chip {
  width: auto;
  min-height: 34px;
  padding: 7px 11px;
  border-radius: 999px; /* or existing rounded token */
}
```

The exact radius should match the application's design language. The user asked for rounded-corner buttons; they do not have to be extreme full pills if a slightly softer radius looks better with the rest of the app.

---

## Implementation Step 12 — Selected Rounded Button Styling

Selected state must be obvious but not visually heavy.

Example:

```text
Normal:
╭──────────╮
│ Due Date │
╰──────────╯

Selected:
╭──────────╮
│ PRIORITY │  ← highlighted background/border/accent
╰──────────╯
```

Use existing variables such as:

```text
--accent-color
--bg-hover
--border-color
--text-primary
```

where appropriate.

Do not introduce an unrelated new color palette.

Selected state should work in both dark and light themes.

---

## Implementation Step 13 — Preserve Sort Direction Button

The top-header sort-direction control (`↑`, `↓`, `↕`) is separate functionality and should remain unchanged.

Do not remove it as part of this redesign.

Its existing behavior still depends on `sortKey`:

- Custom disables direction.
- Other sort modes enable Ascending/Descending.

Changing Sort inside the combined panel should continue to update this button immediately through existing `syncUI()` logic.

---

## Implementation Step 14 — Preserve All Sorting and Grouping Algorithms

Do not modify:

- `sortTasks()`;
- Custom ordering;
- Due Date sorting;
- Priority rank;
- Name sorting;
- Created Date sorting;
- Group By None;
- Group By Priority;
- Group By Date;
- Group By Project;
- Group By Tag;
- Kanban grouping behavior;
- drag/drop metadata behavior.

This plan is a menu/UI architecture change only.

---

## Implementation Step 15 — Preserve View Behavior

Do not modify:

- List behavior;
- Kanban behavior;
- project/tag saved view preference;
- `normalizeViewType()`;
- disabled Timeline behavior.

Timeline must remain disabled.

---

## Expected Files to Change

### Primary

- `js/components/workspace-controls.js`
- `css/components/workspace-menu.css`

### Should not need changes

- `index.html` because the workspace menu is currently rebuilt dynamically by JavaScript;
- task renderer files;
- task state files;
- task drag files;
- Group By implementation files;
- Kanban files;
- quick-task / schedule files.

Only change additional files if a real dependency is discovered during implementation.

---

## Explicit Non-Goals

Do not implement:

- Timeline;
- new Sort types;
- new Group types;
- multi-select sorting;
- nested grouping;
- persistence changes;
- drag/drop changes;
- task data-model changes;
- a redesign of the `•••` button itself;
- removal of the sort-direction arrow control.

---

## Desired Final Interaction

```text
•••
 ↓
┌────────────────────────────┐
│ VIEW                       │
│      [☷]     ▦      ⇥      │
├────────────────────────────┤
│ Sort & Group             › │
└────────────────────────────┘
             ↓
             ↓ tap
             ↓
┌────────────────────────────────┐
│ SORT                           │
│ [Custom] [Due Date]            │
│ [PRIORITY] [Name]              │
│ [Created Date]                 │
│                                │
│ GROUP                          │
│ [None] [Priority] [Date]       │
│ [PROJECT] [Tag]                │
└────────────────────────────────┘
```

The user can change Sort and Group repeatedly without reopening the panel.

---

## Acceptance Checks — Main Menu

1. Open `•••`.
2. View appears first exactly as before.
3. List icon works.
4. Kanban icon works.
5. Timeline remains disabled.
6. There is no longer a separate `Sort` row.
7. There is no longer a separate `Group` row.
8. Exactly one `Sort & Group` trigger appears.

---

## Acceptance Checks — Combined Panel

9. Tap `Sort & Group`.
10. Exactly one secondary panel opens.
11. Panel contains a clearly labeled Sort section.
12. Panel contains a clearly labeled Group section.
13. Sort options are rounded buttons, not vertical context-menu rows.
14. Group options are rounded buttons, not vertical context-menu rows.
15. Options wrap naturally to additional rows when needed.
16. Panel does not become unnecessarily wide.
17. Panel stays inside the viewport on phone and desktop.
18. No old Sort or Group secondary menu exists behind/alongside it.

---

## Acceptance Checks — Selection

19. Current Sort option is highlighted when panel opens.
20. Current Group option is highlighted when panel opens.
21. Select Sort `Priority`.
22. Tasks rerender with Priority sorting.
23. `Priority` becomes highlighted.
24. Previous Sort option loses its highlight.
25. Combined panel remains open.
26. Without closing it, select Group `Project`.
27. Tasks rerender grouped by Project.
28. `Project` becomes highlighted.
29. Previous Group option loses its highlight.
30. Combined panel remains open.
31. Sort direction control updates correctly when Sort changes.

---

## Acceptance Checks — Dismissal

32. With combined panel open, click outside.
33. Combined panel closes only.
34. Main `•••` menu stays open.
35. Click outside again.
36. Main menu closes.
37. Reopen combined panel.
38. Press Escape.
39. Combined panel closes only.
40. Press Escape again.
41. Main menu closes and focus returns to `•••`.
42. Clicking `•••` while the combined panel is open closes the complete menu stack.

---

## Acceptance Checks — Regression

43. Custom Sort still preserves manual task ordering.
44. Due Date Sort still works.
45. Priority Sort still works.
46. Name Sort still works.
47. Created Date Sort still works.
48. Group None still works.
49. Group Priority still works.
50. Group Date still works.
51. Group Project still works.
52. Group Tag still works.
53. List/Kanban switching still works.
54. Project/Tag view preference behavior is unchanged.
55. Drag/drop remains unchanged.
56. Timeline remains disabled.
57. No task data/state behavior changes.

---

## Completion Contract

The redesign is complete when the workspace menu has one clean `Sort & Group` trigger and that trigger opens a single compact settings panel with two rounded-button sections:

```text
SORT  → one highlighted rounded choice
GROUP → one highlighted rounded choice
```

The user can change both settings in one place without repeatedly opening separate context menus, and the existing two-stage outside-click/Escape dismissal behavior continues to work.