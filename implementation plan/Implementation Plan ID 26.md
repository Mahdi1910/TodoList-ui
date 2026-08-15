# Implementation Plan ID 26 — Taxonomy Keyboard Access + Project Depth + Strict Repeat Dates

> **Status:** Plan only. Do not change application code as part of creating this document.
>
> **Source of truth at planning time:** GitHub `main` at `af6e25cf59d5ede9779e4f1cab0622bf0b781d09`.
>
> **Tracker scope:** Problems **#16, #18, and #23** from `problem is need to be fixed.md`.
>
> **Permanently excluded from this plan:** **#21 — Reduce unnecessary full rerenders.** The current full-render strategy is accepted for this personal-use application. Treat #21 as intentionally skipped unless the user explicitly reopens it in the future.

---

# 1. Verification Result Before Planning

The current GitHub source was checked before this plan was written. These are not stale tracker entries.

## 1.1 Problem #16 — Dynamic Project/Tag rows are not proper keyboard controls

**Status: confirmed real.**

Current owner:

```text
js/components/sidebar-taxonomy-core.js
```

Current generated Project/Tag selection row is built as:

```js
const item = document.createElement('div');
item.className = `sidebar-nav-item ${type}-nav-item`;
```

Mouse/touch activation works because the list has delegated `click` handling and eventually calls:

```text
host.selectFilter(item)
```

But the Project/Tag selection row itself is not naturally focusable and has no Enter/Space activation path.

Static Inbox / Today / Completed controls are real `<button>` elements, so keyboard users can reach and activate those, while generated Project/Tag rows do not offer equivalent selection access.

### Important drag constraint discovered during verification

Current taxonomy drag code in:

```text
js/components/sidebar-taxonomy-drag.js
```

intentionally rejects pointer targets inside native interactive elements:

```js
if (target.closest('button,input,a,select,textarea,.project-more-menu,.tag-more-menu')) return null;
```

Therefore **do not simply convert the whole Project/Tag row into a native `<button>`**. Doing that would make pointer drag initiation from most of the row stop working.

The row also contains a separate `•••` action button, so wrapping the whole row in a native button would create invalid/nested interactive structure.

### Chosen solution for #16

Keep the existing structural `.sidebar-nav-item` row as the pointer/drag surface.

Make the row's **primary selection area** — currently the icon/name `.item-left` area — a complete keyboard activation control:

```text
role="button"
tabindex="0"
clear accessible label / title context
Enter activates selection
Space activates selection and prevents page scrolling
```

The separate `•••` control remains its existing native `<button>`.

This gives keyboard users two clear focus stops:

```text
Project/Tag selection control
Project/Tag more-options button
```

without breaking taxonomy drag.

The keyboard path should call the **same existing selection owner** as pointer clicks:

```text
host.selectFilter(item)
```

Do not create a second filtering implementation.

---

## 1.2 Problem #18 — Task Project picker does not visually show hierarchy depth

**Status: confirmed real.**

Current owners:

```text
js/components/task-taxonomy-menu-order.js
js/components/task-menus.js
```

The Task Project picker already uses the correct hierarchy order:

```js
TaxonomyOrder.flattenTree('project')
```

`flattenTree()` provides both the Project and its depth, but the current code discards the depth:

```js
.forEach(({ item: project }) => {
  this.menuProject.appendChild(this.createProjectMenuItem(project));
});
```

`createProjectMenuItem(project)` then renders every Project at the same left position.

So this stored hierarchy:

```text
Work
  Programming
    Website
Personal
```

can appear in the Task Project picker visually as:

```text
Work
Programming
Website
Personal
```

The ordering is correct, but the parent/child relationship is not visually obvious.

Tags already solve the same problem by carrying `depth` into `createTagMenuItem(tag, depth)` and increasing left padding by depth.

### Chosen solution for #18

Carry the Project depth through the existing Project menu rendering path:

```text
TaxonomyOrder.flattenTree('project')
→ { item: project, depth }
→ createProjectMenuItem(project, depth)
```

Extend the Project item creator to accept:

```js
createProjectMenuItem(project, depth = 0)
```

Apply the same visual indentation model already used by Tags, approximately:

```text
base padding + depth × 16px
```

`Inbox` stays at the normal root position and is not treated as a nested Project.

Do not change Project order, IDs, selection logic, persistence, or hierarchy storage.

---

## 1.3 Problem #23 — Repeat date parser accepts impossible dates

**Status: confirmed real.**

Current owner:

```text
js/repeat/repeat-engine.js
```

Current parser:

```js
function parseDate(value) {
  if (!value || typeof value !== 'string') return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
```

JavaScript `Date` normalizes impossible values instead of necessarily rejecting them.

Examples:

```text
2026-02-31 → can become a date in March
2026-04-31 → can become a date in May
2026-13-01 → can roll into the next year
2026-02-29 → invalid in a non-leap year but can normalize into March
```

The current parser can therefore return a valid `Date` object for an invalid source date.

That matters especially for Repeat Ends validation because this check:

```js
if (repeat.end.type === 'date' && !parseDate(repeat.end.date)) ...
```

cannot reject an impossible date if `parseDate()` silently normalizes it.

### Chosen solution for #23

Make `RepeatEngine.parseDate()` strict in two stages.

### Stage A — exact source format

Accept only the application's canonical date shape:

```text
YYYY-MM-DD
```

Use an exact match rather than loose `split()` parsing.

Reject values such as:

```text
2026-2-03
2026-02-3
2026-02-03-extra
abc
empty/null/non-string
```

### Stage B — round-trip calendar validation

After extracting year/month/day:

1. Create the candidate local-noon date.
2. Compare the resulting calendar fields back to the source fields.
3. Accept only when all three still match exactly:

```text
candidate year  === source year
candidate month === source month
candidate day   === source day
```

If JavaScript normalized the candidate into another month/year/day, return `null`.

Use a construction method that does not accidentally apply JavaScript's special 1900-offset behavior to years `00`–`99` if those values are ever encountered.

---

# 2. Problem #21 — Permanent Product Decision

Problem #21 is **not part of ID26 and should not be implemented in later cleanup work unless explicitly reopened by the user**.

Current strategy:

```text
AppDataService mutation
→ AppStateSync
→ rebuild the authoritative current List/Kanban view
→ update sidebar counts
```

This can do more work than a targeted DOM patch, but it is simple and reduces stale-UI risk across:

```text
filters
sorting
grouping
Kanban
Task hierarchy
completed placement
sidebar counts
Repeat-generated Tasks
```

For the intended personal-use scale, this tradeoff is accepted.

Do **not** build:

```text
per-field DOM invalidation
a virtual DOM
a reactive diff engine
partial Task-card synchronization
```

as part of this or future cleanup unless #21 is explicitly reopened.

Tracker handling:

```text
Do not mark #21 [x] as though it was implemented.
Treat it as intentionally skipped/product-accepted behavior.
```

---

# 3. Expected Production File Scope

Expected files:

```text
js/components/sidebar-taxonomy-core.js
js/components/task-taxonomy-menu-order.js
js/components/task-menus.js
js/repeat/repeat-engine.js
```

Possible small style change only if required to make keyboard focus visibly clear:

```text
css/layout/sidebar-layout.css
```

Do not add CSS merely for #18 if the existing inline depth model used by Tags is sufficient.

### Files that should normally NOT change

```text
js/components/sidebar-taxonomy-drag.js
js/components/sidebar-taxonomy-drag-hierarchy.js
js/components/sidebar-taxonomy-drag-touch.js
js/components/sidebar-taxonomy-drag-commit.js
js/storage/*
js/state.js
js/state-sync.js
js/components/schedule*.js
js/components/subtask-editor.js
index.html
IndexedDB schema/version
Backup format/version
```

If implementation discovers that one of these must change, first prove why from current source rather than expanding scope speculatively.

---

# 4. Implementation Phase A — Project/Tag Keyboard Selection (#16)

## Step A1 — Preserve current taxonomy DOM ownership

Keep:

```text
.sidebar-tree-node
.sidebar-nav-item
entity data attributes
parent/depth data
children host structure
more-options button/menu
```

The existing hierarchy drag system depends on these structures and measurements.

Do not rename or remove drag-facing classes/datasets.

## Step A2 — Make the primary label area keyboard focusable

Inside `SidebarTaxonomyCore.createTreeNode()` use the existing primary icon/name area as the selection control.

Required state:

```text
role="button"
tabindex="0"
data identifying the corresponding entity selection action
accessible label that identifies Project/Tag name
```

Do not put the `•••` action button inside this new keyboard control.

The current `•••` button remains independently focusable.

## Step A3 — Add one delegated keyboard activation path

Inside the shared taxonomy event binding, handle keyboard activation for both Project and Tag through the same generic code.

Required keys:

```text
Enter
Space
```

Behavior:

```text
focus Project/Tag selection control
→ Enter or Space
→ prevent default when appropriate
→ resolve owning .sidebar-nav-item
→ host.selectFilter(item)
```

Do not simulate a second custom filter mutation. Reuse `selectFilter()`.

## Step A4 — Keep pointer/touch behavior unchanged

Existing click delegation remains authoritative for pointer selection.

Do not add duplicate click listeners to every generated row unless required.

## Step A5 — Preserve hierarchy drag

Pointer/touch drag from the normal label/name area must still work.

The chosen `role="button"` keyboard surface is deliberately **not** a native `<button>`, because current drag guards ignore native buttons.

Verify:

```text
mouse long-press / pointer drag from Project name still starts drag
touch hierarchy drag still starts normally
••• button never starts drag
keyboard Enter/Space never starts drag
```

## Step A6 — Visible focus

A keyboard user must be able to see which Project/Tag selection control is focused.

Prefer the browser/current theme focus indication if it is clearly visible.

If it is not sufficient, add one small `:focus-visible` rule in the existing sidebar style owner. Do not redesign sidebar styling.

---

# 5. Implementation Phase B — Project Picker Hierarchy Depth (#18)

## Step B1 — Preserve `flattenTree()` as ordering authority

Do not replace the current hierarchy-order source.

Keep:

```js
TaxonomyOrder.flattenTree('project')
```

## Step B2 — Carry depth instead of discarding it

Change conceptually from:

```js
({ item: project }) => createProjectMenuItem(project)
```

to:

```js
({ item: project, depth }) => createProjectMenuItem(project, depth)
```

## Step B3 — Extend Project item renderer

Make the Project item renderer accept `depth = 0`.

Apply indentation equivalent to the existing Tag menu convention.

Example expected display:

```text
Inbox
Work
  Programming
    Website
Personal
```

The actual icon/name content and selected-state behavior remain unchanged.

## Step B4 — Preserve context-menu/listbox keyboard behavior

Do not change:

```text
role=listbox
role=option
tabindex=-1 roving focus
ArrowUp / ArrowDown
Home / End
Enter / Space selection
Escape focus restoration
mobile context-menu portal positioning
editor keyboard continuity
```

This phase is visual hierarchy only.

---

# 6. Implementation Phase C — Strict Repeat Date Parsing (#23)

## Step C1 — Replace loose split parsing with exact canonical parsing

`parseDate()` should return `null` unless input is exactly a valid canonical date string.

Required source format:

```text
4-digit year
-
2-digit month
-
2-digit day
```

## Step C2 — Validate month/day through round-trip fields

Reject calendar overflow instead of accepting normalized JavaScript dates.

Required invalid examples:

```text
2026-00-10
2026-13-01
2026-01-00
2026-01-32
2026-02-29   (2026 is not leap year)
2026-02-30
2026-02-31
2026-04-31
```

Required valid examples:

```text
2026-01-01
2026-02-28
2024-02-29   (leap year)
2026-04-30
2026-12-31
```

## Step C3 — Preserve local-noon date behavior

The existing Repeat engine intentionally constructs calendar dates at local noon to reduce DST/midnight boundary problems.

Keep that invariant.

Do not convert Repeat dates to UTC timestamps as part of this work.

## Step C4 — Preserve intentional recurrence clamping

Strict **input parsing** and recurrence **month-end clamping** are different behaviors.

Do not break intentional rules such as:

```text
monthly series anchored on Jan 31
→ February occurrence clamps to Feb 28/29
```

or yearly leap-date behavior that deliberately uses `clampDayToMonth()`.

`clampDayToMonth()` is recurrence generation logic and should remain unchanged unless a separate bug is proven.

## Step C5 — Audit all `parseDate()` callers

Before finalizing implementation, verify every internal/external use of `RepeatEngine.parseDate()`.

Expected consumers include:

```text
Repeat Ends validation
initial Repeat state/anchor creation
custom weekly/monthly/yearly calculations
current occurrence parsing
```

Make sure strict rejection does not accidentally change valid recurrence behavior.

Do not add a second competing date parser inside Repeat UI components.

---

# 7. Static Verification Gates

No browser automation is required or wanted.

Mandatory source checks after implementation:

## #16

Confirm:

```text
Project selection control is keyboard focusable
Tag selection control is keyboard focusable
role/button semantics exist on primary selection surface
Enter handler exists
Space handler exists
Space prevents page scrolling
both route through host.selectFilter(...)
••• remains a native button
no nested native button structure introduced
```

Confirm taxonomy drag guard and row structure still match current expectations:

```text
.sidebar-tree-node exists
.sidebar-nav-item remains the direct row used by drag measurement
pointer label surface is not converted into a native button
```

## #18

Confirm:

```text
flattenTree('project') still owns ordering
depth is passed to createProjectMenuItem
Project depth affects visual padding/indent
Tag depth behavior is unchanged
Inbox has no accidental nested offset
```

## #23

Run a pure-JavaScript RepeatEngine date matrix covering valid/invalid examples from Section 6.

Also verify:

```text
normal Daily/Weekly parsing still succeeds
2024-02-29 succeeds
2026-02-29 fails
impossible month/day overflow fails
monthly Jan-31 clamping still works
```

Do not create the full tracker #25 testing architecture as part of ID26. A focused temporary/static verification is sufficient.

## Module/static regression

Run the normal native-module checks used after Part 5:

```text
all changed JS parses as ES modules
relative imports remain valid
no new undeclared application identifier
no new window-global patch layer
no script-loader behavior added
```

---

# 8. Manual Verification Matrix

## 8.1 Project keyboard access

1. Open sidebar.
2. Use Tab until a Project selection control receives focus.
3. Confirm focus is visibly identifiable.
4. Press Enter.
5. Reopen sidebar and repeat with Space.
6. Confirm correct Project becomes active and Task view changes.
7. Confirm sidebar close/focus behavior from ID25 remains correct.
8. Tab to the Project `•••` button separately and confirm its menu still works.

## 8.2 Tag keyboard access

Repeat the same sequence for Tags.

Verify nested Tags too.

## 8.3 Pointer/touch taxonomy regression

For both Project and Tag:

```text
normal click/tap selection
••• menu
Add child
Edit
Delete
hierarchy reorder
indent
outdent
reparent
cycle prevention
```

Most importantly, drag from the Project/Tag icon/name area must still start normally.

## 8.4 Task Project picker depth

Create/prepare a hierarchy such as:

```text
Work
  Programming
    Website
Personal
```

Open New Task and Edit Task Project picker.

Expected:

```text
Inbox
Work
  Programming
    Website
Personal
```

Then verify:

```text
keyboard Arrow navigation still works
Enter selection still works
pointer selection still works
selected Project remains correct
mobile menu portal remains unclipped
Priority/Tags/Project keyboard-continuity behavior remains unchanged
```

## 8.5 Strict Repeat dates

Normal UI regression:

```text
Daily
Weekly
Monthly
Yearly
Custom Daily
Custom Weekly
Custom Monthly
Custom Yearly
Repeat Ends Never
Repeat Ends On Date
Repeat Ends After N
```

Pure date checks must establish that impossible source dates are rejected.

Also verify month-end recurrence remains intentional:

```text
Jan 31 monthly → valid February clamped occurrence
leap-year Feb 29 → expected yearly behavior
```

---

# 9. Data / Architecture Safety Rules

ID26 must not change:

```text
IndexedDB schema/version
Task/Project/Tag stored shapes
Backup JSON format/version
AppState ownership
AppStateSync ownership
AppDataService transaction architecture
Repeat mapper storage shape
ID23 Custom-sort behavior
ID25 sidebar inert lifecycle
```

#16 and #18 are UI/accessibility changes.

#23 is a pure Repeat date-validation correction.

No migration should be necessary.

---

# 10. Tracker Handling

After implementation is complete **and manually verified by the user**:

```text
#16 → [x]
#18 → [x]
#23 → [x]
```

Do not mark them complete from code/static review alone.

For #21:

```text
Do not implement it.
Do not mark it [x] as a fake completion.
Treat it as intentionally skipped unless the user explicitly reopens it.
```

If desired when ID26 is implemented, add a short tracker note under #21 saying it is intentionally skipped by product decision so future cleanup work does not repeatedly propose it.

---

# 11. Definition of Done

ID26 is complete only when all of the following are true:

1. Dynamic Project selection can be reached with keyboard.
2. Dynamic Tag selection can be reached with keyboard.
3. Enter selects the focused Project/Tag.
4. Space selects it without scrolling the page.
5. `•••` remains an independent keyboard-accessible button.
6. Mouse/touch Project/Tag selection still works.
7. Project/Tag hierarchy drag still works from the normal row surface.
8. No nested native-button structure is introduced.
9. Task Project picker visibly indents nested Projects.
10. Project ordering still comes from `TaxonomyOrder`.
11. Project picker keyboard/pointer selection remains correct.
12. `RepeatEngine.parseDate()` rejects malformed format.
13. It rejects impossible calendar dates rather than normalizing them.
14. It accepts valid leap dates.
15. Existing intentional monthly/yearly clamping remains unchanged.
16. Repeat Ends validation uses the stricter parser naturally.
17. Normal Repeat recurrence regression passes.
18. ID25 sidebar focus/inert behavior remains correct.
19. No persistence/schema/Backup format change occurs.
20. #21 remains intentionally skipped.
21. User manual verification is complete before tracker checkboxes #16/#18/#23 are changed to `[x]`.
