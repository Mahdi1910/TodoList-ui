# Review — Implementation Plan ID 25

## Overall verdict

**Status: Approved with small implementation notes.**

Implementation Plan ID 25 is well scoped and matches the current GitHub `main`. The four problems it proposes to fix are still real:

- #15 Hidden-sidebar focus handling
- #17 Mobile pinch-zoom blocking
- #20 Repeat render-time mutation
- #22 Duplicated date-label formatting

Problem #21 is correctly treated as a separate low-priority optimization and should remain outside this implementation.

The plan does not need a redesign. It is safe to implement after applying the small clarifications in this review.

---

# 1. Current-code verification

## 1.1 Problem #15 — Confirmed

Current files:

```text
js/components/sidebar.js
index.html
css/layout/sidebar-layout.css
```

`closeSidebar()` currently hides the sidebar using `aria-hidden="true"` without first checking whether `document.activeElement` is still inside the sidebar.

The sidebar also has no `inert` lifecycle.

The plan is correct that this can leave keyboard focus inside a region that accessibility APIs have been told is hidden.

The proposed owner is also correct: this behavior belongs in `SidebarComponent`, not `ModalFocusManager`.

### Desktop/mobile layout check

The current CSS keeps `.secondary-sidebar` translated off-screen and non-interactive unless `.open` is present on both desktop and mobile.

Therefore adding static `inert` to the initially closed sidebar is compatible with the current layout.

---

## 1.2 Problem #17 — Confirmed

Current `index.html` still contains:

```text
maximum-scale=1.0
user-scalable=no
```

The plan correctly removes only those restrictions while preserving:

```text
width=device-width
initial-scale=1.0
viewport-fit=cover
interactive-widget=resizes-content
```

No gesture-blocking JavaScript should be added as compensation.

---

## 1.3 Problem #20 — Confirmed

Current `task-renderer.js` still contains:

```js
custom.weekdays.sort((a, b) => a - b)
```

This mutates the original array.

The plan's proposed copied-array solution is correct:

```js
[...custom.weekdays].sort((a, b) => a - b)
```

This should be a behavior-neutral change: the displayed Repeat label must remain identical while rendering becomes read-only.

---

## 1.4 Problem #22 — Confirmed

`task-renderer.js` currently contains two independent implementations of the same date-only formatting behavior:

```text
formatScheduleLabel()
formatDueDateLabel()
```

Both independently calculate Today, Tomorrow, and the normal abbreviated date.

`task-groups.js` currently calls `formatDueDateLabel()` for Date group headings.

The proposed shared `formatDateLabel()` helper is a clean solution.

---

# 2. What the plan does well

## 2.1 Scope is appropriately small

Expected production changes are limited mainly to:

```text
index.html
js/components/sidebar.js
js/components/task-renderer.js
js/components/task-groups.js
```

This is good. None of these problems requires changes to IndexedDB, AppDataService, Repeat recurrence generation, sorting, Custom order, Project/Tag hierarchy, Backup, or Schedule persistence.

## 2.2 It protects recent fixes

The plan explicitly protects earlier work including:

```text
ID20 Parts 1–5
ID21 / ID22 keyboard behavior
ID23 Custom-sort behavior
ID24 Part-5 regression repairs
```

That boundary should be respected during implementation.

## 2.3 Problem #21 is correctly deferred

The current full rerender strategy is not a correctness defect.

Trying to solve #21 now would expand a small accessibility/render-purity cleanup into a much larger invalidation/rendering architecture project.

The plan is correct to leave it unchecked and create a separate performance plan only if measured performance later justifies it.

## 2.4 Manual testing requirements are strong

The plan correctly requires real interaction testing for:

```text
sidebar keyboard focus
sidebar pointer/touch behavior
Project/Tag modal interaction
mobile pinch zoom
Task/Subtask editor while zoomed
Date/Schedule keyboard transitions
Repeat rendering
Date group labels
```

These are exactly the places where a small-looking change could create a user-visible regression.

---

# 3. Required implementation clarifications

These are small corrections/clarifications, not reasons to rewrite the plan.

## 3.1 Sidebar closing order should disable interaction immediately after focus transfer

The plan currently describes the closing order approximately as:

```text
move focus outside
→ hide visual drawer
→ aria-hidden=true
→ inert=true
```

The safer order is:

```text
close sidebar action menus
→ if focus is inside, move it outside
→ verify focus is outside
→ set inert=true
→ set aria-hidden=true
→ aria-expanded=false
→ remove .open / backdrop active state
```

The important rule is:

> **Never set `inert` or `aria-hidden` while focus is still inside the sidebar.**

But once focus has safely moved outside, making the sidebar inert immediately is preferable. It prevents keyboard/pointer interaction during the closing animation.

Exact visual-class ordering can remain flexible as long as this invariant is preserved.

## 3.2 Do not steal focus when the sidebar is already unfocused

`closeSidebar()` may be called for many reasons.

It must only focus `#btn-toggle-sidebar` when the active element is actually inside the sidebar.

Correct rule:

```js
if (this.sidebarEl?.contains(document.activeElement)) {
  // move focus outside
}
```

If focus already belongs to a modal, Task editor, workspace control, or another valid element, sidebar closing must leave that focus alone.

## 3.3 Prefer the native `inert` property or a consistent attribute helper

Either of these is acceptable:

```js
sidebar.inert = true;
sidebar.inert = false;
```

or a small helper that adds/removes the `inert` attribute.

Do not mix several different inert-management patterns across open/close paths.

## 3.4 Keep the date helper behavior exactly equivalent

`formatDateLabel()` should be a refactor, not a date-parser redesign.

It must preserve today's behavior for:

```text
Today
Tomorrow
Aug 15-style labels
empty date
```

Problem #23 (strict date parsing) must remain separate.

## 3.5 Keep Repeat label wording unchanged

ID25 should not use the purity cleanup as an opportunity to rename existing Repeat labels.

For example, if the current output says:

```text
🔁 Daily
🔁 weekly
🔁 Monthly
```

those exact strings should remain unless a different tracker item explicitly changes them later.

---

# 4. Recommended implementation shape

## Phase 1 — Sidebar lifecycle

Modify:

```text
index.html
js/components/sidebar.js
```

Add initial `inert` to the closed sidebar.

Add small Sidebar-owned helpers for:

```text
checking whether focus is inside
moving focus to the toggle only when necessary
setting open/closed accessibility state
```

Do not involve `ModalFocusManager`.

## Phase 2 — Viewport zoom

Modify only the viewport metadata in:

```text
index.html
```

Remove:

```text
maximum-scale=1.0
user-scalable=no
```

Do not change VisualViewport code unless actual manual testing proves a separate problem.

## Phase 3 — Repeat formatter purity

Modify:

```text
js/components/task-renderer.js
```

Sort a copied weekday array.

Audit the rest of `formatRepeatLabel()` to ensure it contains no mutation of state-owned objects or arrays.

## Phase 4 — Shared date formatter

Modify:

```text
js/components/task-renderer.js
js/components/task-groups.js
```

Create one `formatDateLabel()` implementation.

Make `formatScheduleLabel()` call it.

Make Date grouping call it directly.

Remove `formatDueDateLabel()` if there are no other callers; otherwise temporarily make it a trivial delegating wrapper.

---

# 5. Static verification required before merge

Before publishing the implementation, verify:

```text
1. Closed sidebar starts inert and aria-hidden.
2. Opening removes inert before interaction.
3. Closing never hides/inerts the sidebar while focus remains inside it.
4. No second code path directly hides the sidebar in a conflicting order.
5. maximum-scale=1.0 is absent.
6. user-scalable=no is absent.
7. viewport-fit=cover remains.
8. interactive-widget=resizes-content remains.
9. No direct custom.weekdays.sort(...) remains in rendering.
10. There is one real Today/Tomorrow/Intl date-only implementation.
11. task-groups.js uses that shared date formatter.
12. Changed JavaScript remains valid native ES-module code.
13. No new runtime patch/global dependency is introduced.
14. No unrelated Part 5/ID24 architecture is changed.
```

---

# 6. Manual verification required before tracker completion

## Sidebar

Test keyboard and pointer/touch paths:

```text
open sidebar
focus Inbox / Today / Completed
select Project
select Tag
open Project/Tag action menus
close with backdrop
close with toggle
open Add/Edit Project modal
open Add/Edit Tag modal
```

Expected:

```text
no focus remains in a hidden sidebar
no aria-hidden focus warning
no broken Project/Tag controls
no focus stealing when focus is already outside the sidebar
```

## Mobile zoom

On a real phone:

```text
pinch zoom in/out
open Task editor while zoomed
open Subtask editor while zoomed
open Priority/Tag/Project menu while zoomed
Date → Schedule → Apply
Date → Schedule → Cancel
keyboard open/close transitions
```

## Repeat purity

Verify Custom Weekly Repeat labels display correctly and rendering does not alter the Repeat rule.

## Date labels

Verify Task cards and Date-group headings agree for:

```text
Today
Tomorrow
normal future/past date
date + time
time only
no date
```

---

# 7. Risk assessment

| Area | Risk | Notes |
|---|---|---|
| Sidebar focus/inert | Medium | Small code change, but focus lifecycle is user-visible and accessibility-sensitive. |
| Pinch zoom | Low–Medium | Metadata change is tiny; real-phone VisualViewport testing is important. |
| Repeat render purity | Very Low | Copy-before-sort is behavior-neutral. |
| Shared date formatter | Low | Straightforward deduplication if output is preserved exactly. |
| Persistence/data | None expected | ID25 should not touch persistence. |
| Custom sorting/drag | None expected | ID23 files should remain untouched. |
| Part 5 module architecture | Very Low if scope is respected | Do not introduce new globals or loader behavior. |

---

# 8. Final review decision

**Implementation Plan ID 25 is approved for implementation.**

No major architectural change is required before starting.

The implementation should follow the plan with these review constraints:

1. Move focus out before hiding/inerting the sidebar.
2. Once focus is safely outside, disable sidebar interaction immediately during close.
3. Do not steal focus when focus is already outside the sidebar.
4. Keep mobile VisualViewport behavior unchanged unless a real zoom regression is observed.
5. Preserve Repeat label output exactly while removing mutation.
6. Keep one authoritative date-only formatter without adding Problem #23 work.
7. Keep Problem #21 deferred.
8. Do not mark #15, #17, #20, or #22 complete until implementation and manual verification both pass.

**Review rating: 9/10 — ready to implement with the small sidebar lifecycle clarification above.**
