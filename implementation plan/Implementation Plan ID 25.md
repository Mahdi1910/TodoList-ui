# Implementation Plan ID 25 — Sidebar Focus, Mobile Zoom, Repeat Render Purity, and Shared Date Labels

> **Status:** Implementation plan only. No application code is changed by this plan.
>
> **Tracker scope:** Problems **#15, #17, #20, and #22** from `problem is need to be fixed.md`.
>
> **Explicitly excluded:** Problem **#21** is a real performance observation but **not a current correctness defect**. It is deferred and must not be implemented as part of ID25.
>
> **Review incorporated:** `implementation plan/review.md` was checked claim-by-claim against current GitHub `main`. Its technical claims were confirmed. The most important plan change is the safer sidebar closing order: after focus is safely outside, make the sidebar inert/hidden **before** beginning the visual close animation.

---

# 1. Verification Result Before Planning

The current GitHub `main` was re-read before creating and revising this plan. The goal is to make sure these tracker entries describe current code, not behavior that was already fixed indirectly.

## 1.1 Problem #15 — Hidden-sidebar focus handling

**Status: confirmed real.**

Current owners:

```text
js/components/sidebar.js
index.html
css/layout/sidebar-layout.css
```

The sidebar currently starts as:

```html
<aside
  class="secondary-sidebar"
  id="secondary-sidebar"
  aria-label="To-Do filters and projects"
  aria-hidden="true"
>
```

The current close path is conceptually:

```js
closeSidebar() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('active');
  sidebar.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-expanded', 'false');
}
```

There is no check for:

```text
document.activeElement being inside the sidebar
```

and there is no sidebar `inert` lifecycle.

A normal keyboard path can therefore become:

```text
focus Inbox / Today / Completed
→ activate it
→ closeSidebar()
→ aria-hidden=true
→ focus can still remain inside that hidden sidebar
```

That is the same class of focus/accessibility lifecycle problem previously fixed for dialogs.

The sidebar is **not** a modal dialog, so this behavior belongs in `SidebarComponent`, not in `ModalFocusManager`.

### CSS/layout compatibility check

Current `.secondary-sidebar` behavior already makes the closed drawer:

```text
translated off-screen
opacity: 0
pointer-events: none
```

and `.open` restores the visual/interactable drawer.

Therefore adding static `inert` to the initially closed sidebar is compatible with the current desktop/mobile layout and animation model.

---

## 1.2 Problem #17 — Mobile pinch-zoom blocking

**Status: confirmed real.**

Current owner:

```text
index.html
```

Current viewport metadata still contains:

```text
maximum-scale=1.0
user-scalable=no
```

Those directives explicitly prevent normal pinch zoom.

The application should remove only those restrictions while preserving:

```text
width=device-width
initial-scale=1.0
viewport-fit=cover
interactive-widget=resizes-content
```

The Task/Subtask editor VisualViewport logic does not require pinch zoom to be disabled.

---

## 1.3 Problem #20 — Repeat label rendering mutates stored data

**Status: confirmed real.**

Current owner:

```text
js/components/task-renderer.js
```

Current Custom Weekly label formatting contains:

```js
custom.weekdays.sort((a, b) => a - b)
```

`Array.prototype.sort()` mutates the original array. Therefore a formatting function can reorder `repeatObj.custom.weekdays` while merely preparing display text.

The displayed wording is currently correct; the defect is the hidden state mutation.

Required invariant:

> **Rendering/formatting may read application data but must not modify it.**

---

## 1.4 Problem #22 — Duplicate date-label formatting

**Status: confirmed real.**

Current owners:

```text
js/components/task-renderer.js
js/components/task-groups.js
```

`TaskRendererMethods` contains both:

```text
formatScheduleLabel(dateStr, timeStr)
formatDueDateLabel(dateStr)
```

Both independently implement the same date-only logic:

```text
empty date
Today
Tomorrow
otherwise Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
```

`task-groups.js` uses `formatDueDateLabel()` for Date-group headings, while Task cards use `formatScheduleLabel()`.

There should be one authoritative date-only formatter.

---

## 1.5 Problem #21 — Full rerenders

**Status: observation is accurate, but it is not a current correctness problem. Excluded from ID25.**

The application intentionally rebuilds the current Task view after many mutations. This is a simple consistency strategy:

```text
AppDataService mutation
→ AppStateSync
→ render current List/Kanban from authoritative state
```

A Task mutation can simultaneously affect:

```text
filter membership
sort order
group membership
hierarchy
sidebar counts
Kanban columns
Repeat occurrence behavior
```

Replacing that with targeted DOM patching would require a reliable invalidation/diff system. For the current personal-use scale, the complexity and regression risk are larger than the expected gain.

**ID25 decision:**

```text
Do not build a mini reactive/diff system.
Do not add per-field DOM invalidation.
Do not change Task rendering architecture for #21.
```

Only revisit #21 later if measured performance actually becomes a problem.

---

# 2. Review Reconciliation

The external review in `implementation plan/review.md` was checked against current source before this revision.

## 2.1 Claims accepted as correct

The following review claims are confirmed:

1. #15, #17, #20, and #22 are all still real.
2. #21 should stay outside this implementation.
3. Static `inert` on the initially closed sidebar is compatible with current CSS/layout behavior.
4. Removing only `maximum-scale=1.0` and `user-scalable=no` is the correct zoom change.
5. Copy-before-sort is the correct #20 repair.
6. `task-groups.js` is a real consumer of the duplicated date-only formatter.
7. Production scope should normally remain limited to:

```text
index.html
js/components/sidebar.js
js/components/task-renderer.js
js/components/task-groups.js
```

8. No persistence, Repeat recurrence, Custom sort, Project/Tag hierarchy, Backup, or Schedule-persistence change is required.
9. Repeat wording must remain exactly as it is today.
10. Date formatting must remain behavior-equivalent; Problem #23 strict parsing is separate.
11. Sidebar closing must not steal focus if focus is already outside the sidebar.
12. One consistent `inert` management pattern should be used.

## 2.2 Material plan improvement from the review

The original plan described this closing order:

```text
move focus outside
→ visually close drawer
→ aria-hidden=true
→ inert=true
```

The reviewed and preferred order is:

```text
close sidebar action menus
→ move focus outside only if necessary
→ verify focus is outside
→ inert=true
→ aria-hidden=true
→ aria-expanded=false
→ remove .open / backdrop .active
```

This is better because, once focus is safely outside, the sidebar becomes non-interactive immediately instead of staying interactive during the closing animation.

The invariant remains:

> **Never apply `inert` or `aria-hidden="true"` while focus is still inside the sidebar.**

---

# 3. Goals

ID25 must achieve these four outcomes:

1. Closing the sidebar never leaves focus inside an accessibility-hidden drawer.
2. A closed sidebar is inert; an open sidebar is interactive.
3. Mobile browser pinch zoom is allowed again.
4. Repeat/date display formatting is read-only and date-only formatting has one owner.

All recent architecture/behavior from ID20 Parts 1–5, ID21/22, ID23, and ID24 must remain intact.

---

# 4. Non-goals

Do not include:

```text
#5 reminder notification delivery
#16 Project/Tag row keyboard semantics
#18 Project picker indentation
#21 render optimization
#23 strict Repeat date parsing
#25 test-suite expansion
#26 placeholder app removal
#27 CSS import cleanup
```

Also do not:

```text
change IndexedDB schema
change Backup JSON format
change Task sorting semantics
change Custom-sort behavior
change Repeat recurrence algorithms
change Project/Tag hierarchy behavior
change Schedule keyboard lifecycle
redesign sidebar visuals
introduce a framework
restore runtime patch layers/globals
```

---

# 5. Phase A — Fix Sidebar Focus and Hidden-State Lifecycle (#15)

## 5.1 Ownership

Primary production file:

```text
js/components/sidebar.js
```

Static markup:

```text
index.html
```

`css/layout/sidebar-layout.css` is an audit/reference file only; no CSS change is expected.

Do not modify `ModalFocusManager` unless implementation review proves a genuinely reusable primitive is necessary.

---

## 5.2 Closed/open invariants

### Closed sidebar

All must be true:

```text
keyboard focus is NOT inside sidebar
sidebar.inert === true
aria-hidden = true
aria-expanded on toggle = false
sidebar does not have .open
backdrop does not have .active
```

### Open sidebar

All must be true:

```text
sidebar.inert === false
aria-hidden = false
sidebar has .open
backdrop has .active
aria-expanded on toggle = true
```

---

## 5.3 Opening order

Use one consistent Sidebar-owned state transition. Conceptually:

```text
remove inert
→ aria-hidden=false
→ add .open / backdrop .active
→ aria-expanded=true
```

No focus should be forced into the sidebar merely because it opens unless a future explicit keyboard UX requirement asks for that.

---

## 5.4 Closing order — reviewed final rule

Use conceptually:

```text
1. close sidebar action menus
2. check whether document.activeElement is inside the sidebar
3. only if it is inside, move focus to a safe outside control
4. verify focus is outside
5. set sidebar inert=true
6. set aria-hidden=true
7. set toggle aria-expanded=false
8. remove sidebar .open
9. remove backdrop .active
```

Steps 5–9 are allowed only after focus is safely outside.

Making the drawer inert before removing `.open` intentionally prevents keyboard/pointer interaction during the visual closing animation.

If safe focus transfer somehow fails, do **not** recreate the old bug by hiding/inerting a still-focused descendant. Use the fallback strategy in the next section; if focus still cannot leave, abort the accessibility-hidden transition rather than violating the invariant.

---

## 5.5 Do not steal focus

`closeSidebar()` is called for multiple reasons. It must move focus only when focus is actually inside the sidebar.

Required condition:

```js
if (this.sidebarEl?.contains(document.activeElement)) {
  // move focus outside
}
```

If focus is already in:

```text
Project/Tag modal
Task/Subtask editor
Workspace control
another valid external control
```

closing the sidebar must leave that focus untouched.

This matters because Project/Tag modals can be opened from sidebar controls while the sidebar itself remains present behind the modal.

---

## 5.6 Focus destination and fallback

Primary destination:

```text
#btn-toggle-sidebar
```

Use `preventScroll` where supported:

```js
try {
  this.toggleBtn?.focus({ preventScroll: true });
} catch (_) {
  this.toggleBtn?.focus();
}
```

Then verify:

```js
!this.sidebarEl?.contains(document.activeElement)
```

If needed, use one final safe outside fallback/blur strategy. Do not set `aria-hidden`/`inert` while the active element remains inside.

---

## 5.7 Use one consistent native inert helper

Prefer one Sidebar-owned helper such as:

```js
setSidebarInert(value) {
  if (this.sidebarEl) this.sidebarEl.inert = Boolean(value);
}
```

or an equivalent single helper that consistently adds/removes the `inert` attribute.

Do not mix multiple unrelated inert-management patterns.

`inert` belongs to the Sidebar lifecycle; do not route the drawer through the dialog focus manager.

---

## 5.8 Initial static state

Because the sidebar ships closed with:

```text
aria-hidden="true"
```

it must also ship with:

```html
inert
```

Expected markup shape:

```html
<aside ... aria-hidden="true" inert>
```

This prevents hidden sidebar controls from entering keyboard focus before JavaScript initialization.

---

## 5.9 Preserve existing behavior

Do not change:

```text
filter selection
Project/Tag actions
Project/Tag drag
backdrop behavior
sidebar animation
mobile/desktop drawer geometry
WorkspaceControls synchronization
Task render after filter selection
Project/Tag modal focus lifecycle
```

---

# 6. Phase B — Restore Mobile Pinch Zoom (#17)

## 6.1 File

```text
index.html
```

## 6.2 Exact viewport change

Current:

```html
content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content"
```

Target:

```html
content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content"
```

Remove only:

```text
maximum-scale=1.0
user-scalable=no
```

Preserve:

```text
width=device-width
initial-scale=1.0
viewport-fit=cover
interactive-widget=resizes-content
```

---

## 6.3 Do not compensate with gesture blocking

Do not add:

```text
touchmove preventDefault
gesturestart preventDefault
wheel+Ctrl preventDefault
```

No JavaScript should be added to re-disable zoom through another path.

---

## 6.4 Preserve VisualViewport logic

Task/Subtask editor code already uses `window.visualViewport` for keyboard/sheet positioning.

Pinch zoom normally changes VisualViewport dimensions/offsets. Do not rewrite the ID21/ID22 VisualViewport logic merely because zoom is now allowed.

Manual testing must decide whether a **separate real zoom-positioning regression** exists. If one appears, document it before broadening scope.

---

# 7. Phase C — Make Repeat Label Formatting Read-only (#20)

## 7.1 File

```text
js/components/task-renderer.js
```

## 7.2 Repair

Replace direct mutation:

```js
custom.weekdays.sort((a, b) => a - b)
```

with a copied array:

```js
[...custom.weekdays]
  .sort((a, b) => a - b)
```

or equivalent local-copy logic.

The source `custom.weekdays` array must remain unchanged by `formatRepeatLabel()`.

---

## 7.3 Purity audit

While touching the formatter, confirm it performs no state mutation.

Allowed:

```text
read properties
create local arrays/strings
sort/map local copies
```

Forbidden on state-owned Repeat values:

```text
.sort()
.reverse()
.splice()
push/pop/shift/unshift
property assignment
```

Do not redesign Repeat normalization or recurrence.

---

## 7.4 Preserve wording exactly

This is a purity fix, not a wording cleanup.

Current outputs must remain unchanged, including current capitalization:

```text
🔁 Daily
🔁 weekly
🔁 Monthly
🔁 Yearly
🔁 Every N day(s)
🔁 Every N week(s) on Mon, Wed, Fri
```

Do not opportunistically change `weekly` to `Weekly` or alter any other label text.

---

# 8. Phase D — One Date-only Formatting Source (#22)

## 8.1 Files

```text
js/components/task-renderer.js
js/components/task-groups.js
```

Before editing, audit all callers of:

```text
formatScheduleLabel
formatDueDateLabel
```

---

## 8.2 Add one authoritative helper

Create one Task-rendering method, for example:

```text
formatDateLabel(dateStr)
```

It owns exactly the existing date-only behavior:

```text
null/empty → ''
today → 'Today'
tomorrow → 'Tomorrow'
other app date → 'Aug 15' style output
```

Preserve:

```js
new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
})
```

This is a refactor only. **Do not implement #23 strict date parsing here.**

---

## 8.3 Route schedule labels through it

Target shape:

```js
formatScheduleLabel(dateStr, timeStr) {
  const datePart = this.formatDateLabel(dateStr);
  if (datePart && timeStr) return `${datePart}, ${timeStr}`;
  return datePart || timeStr || '';
}
```

Preserve all existing results:

```text
Today
Today, 9:00 AM
Tomorrow
Aug 15
Aug 15, 9:00 AM
9:00 AM
'' for no date/no time
```

---

## 8.4 Route Date groups through the same helper

`task-groups.js` should preferably use:

```js
this.formatDateLabel(key)
```

Then remove `formatDueDateLabel()` if the caller audit confirms no other consumer.

If temporary compatibility requires it, keep only a delegating wrapper:

```js
formatDueDateLabel(dateStr) {
  return this.formatDateLabel(dateStr);
}
```

After ID25 there must be **one actual Today/Tomorrow/Intl implementation**, not two copies.

---

# 9. Problem #21 — Explicit Deferral Strategy

Do not change rerender architecture in ID25.

Only revisit #21 if there is evidence such as:

```text
visible render latency
input lag with large Task collections
mobile frame drops
profiling showing a specific expensive render path
```

A future #21 plan should begin with measurement and optimize the measured bottleneck, not assume that all full renders are wrong.

---

# 10. Expected Production File Scope

Expected changes:

```text
index.html
js/components/sidebar.js
js/components/task-renderer.js
js/components/task-groups.js
```

`task-groups.js` should require only the date-formatter caller adjustment.

Do not touch unless a direct dependency is proven:

```text
js/storage/*
js/state.js
js/state-sync.js
js/repeat/repeat-engine.js
js/components/modal-focus.js
js/components/tasks.js
js/components/subtask-editor.js
js/components/schedule*.js
css/*
```

No new runtime globals, patch layers, or loader behavior may be introduced.

---

# 11. Implementation Order

## Milestone 1 — Sidebar lifecycle

```text
1. Add static inert to the closed sidebar in index.html.
2. Add focus-inside detection.
3. Add safe outside focus transfer only when necessary.
4. Add one consistent inert helper.
5. Update opening accessibility order.
6. Update closing order to focus-out → inert → aria-hidden → aria-expanded → visual close.
7. Verify filter, backdrop, toggle, and modal-adjacent paths.
```

## Milestone 2 — Mobile zoom

```text
1. Remove maximum-scale=1.0.
2. Remove user-scalable=no.
3. Preserve viewport-fit and interactive-widget.
4. Add no compensating gesture block.
```

## Milestone 3 — Repeat render purity

```text
1. Copy weekdays before sorting.
2. Audit the formatter for any other mutation.
3. Preserve exact output text.
```

## Milestone 4 — Date formatter consolidation

```text
1. Audit all current formatter callers.
2. Add formatDateLabel().
3. Route formatScheduleLabel() through it.
4. Route Date groups through it.
5. Remove/delegate formatDueDateLabel().
6. Confirm one Today/Tomorrow/Intl implementation remains.
```

---

# 12. Static Verification Before Merge

## 12.1 Sidebar

Verify all of the following:

```text
1. Static closed sidebar has aria-hidden=true and inert.
2. Opening removes inert before interaction.
3. closeSidebar() moves focus only if focus is inside.
4. Focus is verified outside before inert/aria-hidden are applied.
5. inert=true occurs before the visual close animation begins.
6. aria-hidden=true is applied only after focus is outside.
7. aria-expanded=false is synchronized with close state.
8. No second code path directly hides #secondary-sidebar in a conflicting order.
9. One consistent inert-management helper/pattern is used.
```

## 12.2 Viewport

Confirm absent:

```text
maximum-scale=1.0
user-scalable=no
```

Confirm retained:

```text
width=device-width
initial-scale=1.0
viewport-fit=cover
interactive-widget=resizes-content
```

Confirm no new gesture-prevention JavaScript was added.

## 12.3 Repeat purity

Search rendering code for:

```js
custom.weekdays.sort(
```

Expected:

```text
zero direct state-owned weekday sorts
```

Confirm `formatRepeatLabel()` has no other mutation of `repeatObj`/`custom`.

Confirm label literals/wording remain unchanged.

## 12.4 Date formatting

Confirm:

```text
one real Today/Tomorrow/Intl date-only implementation
formatScheduleLabel() uses it
task-groups.js uses it
formatDueDateLabel() is removed or only delegates
```

Do not introduce strict-date parsing changes.

## 12.5 Module/scope health

Because the app is native ES modules:

```text
changed JS parses as ES modules
all imports resolve
no new global dependency
no runtime patch layer
no Part 5 loader change
no storage/data layer change
no ID23 Custom-sort file change
```

---

# 13. Mandatory Manual Regression Tests

## 13.1 Sidebar — keyboard

Test:

```text
open sidebar from toggle
Tab to Inbox → activate
Today → activate
Completed → activate
Project → select
Tag → select
Add Project
Add Tag
Project action menu
Tag action menu
```

Expected:

```text
sidebar closes normally where expected
focus never remains inside hidden sidebar
no aria-hidden focus warning
toggle can immediately reopen sidebar
Project/Tag controls still work
```

---

## 13.2 Sidebar — pointer/touch

Test:

```text
open sidebar
select Inbox/Today/Project/Tag
close with backdrop
close with toggle
```

Expected:

```text
no stuck focus
no broken touch/click
no broken action menu
```

---

## 13.3 Do-not-steal-focus cases

Specifically verify:

```text
Sidebar → Add Project modal
Sidebar → Edit Project modal
Sidebar → Add Tag modal
Sidebar → Edit Tag modal
```

If focus is already in the modal/outside the sidebar, a sidebar close operation must **not** move it back to `#btn-toggle-sidebar`.

Existing modal focus restoration must remain correct.

---

## 13.4 Mobile zoom — real phone

Test:

```text
pinch zoom in/out
pan while zoomed
open/close sidebar while zoomed
open Task editor while zoomed
open keyboard while zoomed
Priority/Tags/Project menus while zoomed
Date → Schedule → Apply while zoomed
Date → Schedule → Cancel while zoomed
Subtask editor while zoomed
```

Expected:

```text
browser zoom works
UI remains operable
ID21/ID22 keyboard behavior remains intact
context menus remain usable/unclipped
```

---

## 13.5 Repeat purity

Use Custom Weekly Repeat and verify:

```text
label wording is unchanged
weekday selection is unchanged by rendering
Repeat still functions after refresh
completion still generates the expected next occurrence
```

Rendering must not alter the stored Repeat rule.

---

## 13.6 Date labels

Verify Task cards and Date-group headings for:

```text
Today
Tomorrow
normal past date
normal future date
date + time
time only
no date/no time
```

Task card and Date-group wording must agree.

---

## 13.7 Broader smoke regression

Also verify:

```text
List
Kanban
Group by Date
Group by Priority
Group by Project
Group by Tag
Custom sort
Name sort
Task create/edit
Subtask create/edit
Project/Tag sidebar operations
```

No persistence/data behavior should change.

---

# 14. Tracker Completion Rules

Only after implementation **and user manual verification** mark:

```text
#15 [x]
#17 [x]
#20 [x]
#22 [x]
```

Do **not** mark #21 complete as part of ID25.

---

# 15. Definition of Done

ID25 is complete only when:

1. Closing never hides/inerts a still-focused sidebar descendant.
2. Focus is moved only when it was inside the sidebar.
3. Once focus is outside, the sidebar becomes inert/accessibility-hidden before the closing animation remains interactable.
4. Closed sidebar is `inert` + `aria-hidden=true`; open sidebar is non-inert + `aria-hidden=false`.
5. Sidebar filters, Project/Tag controls, drag, backdrop, and modal interactions remain correct.
6. Pinch zoom works because only the restrictive viewport directives were removed.
7. Existing safe-area, `interactive-widget`, and VisualViewport behavior remains intact.
8. `formatRepeatLabel()` performs no mutation of Repeat state.
9. Repeat label output remains exactly unchanged.
10. There is one authoritative date-only formatter.
11. Task card schedule labels and Date-group headings both use that formatter.
12. Problem #23 strict date parsing remains untouched.
13. No IndexedDB, Backup, recurrence, Custom-sort, or Part 5 architecture changes are introduced.
14. Static ES-module/scope checks pass.
15. The full manual regression matrix passes.
16. #21 remains deferred as an optional measured optimization.
