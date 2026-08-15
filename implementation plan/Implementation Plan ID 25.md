# Implementation Plan ID 25 — Sidebar Focus, Mobile Zoom, Repeat Render Purity, and Shared Date Labels

> **Status:** Implementation plan only. No application code is changed by this plan.
>
> **Tracker scope:** Problems **#15, #17, #20, and #22** from `problem is need to be fixed.md`.
>
> **Explicitly excluded:** Problem **#21** is reviewed in this plan but is **not treated as a current correctness defect** and should not be implemented as part of this work.

---

# 1. Verification Result Before Planning

The current GitHub `main` was re-read before creating this plan. The purpose was to make sure these tracker entries still describe real current code rather than old behavior that was already repaired indirectly.

## 1.1 Problem #15 — Hidden-sidebar focus handling

**Status: confirmed real.**

Current owner:

```text
js/components/sidebar.js
index.html
```

The sidebar starts with:

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

A normal filter click currently does:

```text
focus/click a sidebar control
→ update filter
→ closeSidebar()
→ sidebar becomes aria-hidden=true
```

The focused control can therefore remain inside an accessibility-hidden sidebar.

This is the same class of accessibility/focus-order mistake previously fixed for dialogs, but the sidebar is not a dialog and should have its own small lifecycle rather than being forced through `ModalFocusManager`.

---

## 1.2 Problem #17 — Mobile pinch-zoom blocking

**Status: confirmed real.**

Current owner:

```text
index.html
```

The current viewport declaration is:

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content"
>
```

The following two directives still explicitly block normal user zoom:

```text
maximum-scale=1.0
user-scalable=no
```

They are not required by the Task editor, Schedule visual-viewport handling, safe-area support, or `interactive-widget=resizes-content`.

The application should allow the browser/user to zoom while preserving the existing viewport-fit and keyboard-resize behavior.

---

## 1.3 Problem #20 — Repeat label rendering mutates stored data

**Status: confirmed real.**

Current owner:

```text
js/components/task-renderer.js
```

Current custom-week Repeat label logic contains:

```js
custom.weekdays.sort((a, b) => a - b)
```

JavaScript `Array.prototype.sort()` mutates the array it is called on.

Therefore a function whose purpose is only to create display text can reorder the actual `repeatObj.custom.weekdays` array supplied by application state.

The output label is correct, but the rendering operation is not read-only.

The required invariant is:

> **Formatting/rendering functions may inspect application data but must not modify it.**

---

## 1.4 Problem #22 — Duplicate date-label formatting

**Status: confirmed real.**

Current owner:

```text
js/components/task-renderer.js
js/components/task-groups.js
```

`TaskRendererMethods` currently contains both:

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

`task-groups.js` calls `this.formatDueDateLabel(key)` for Date group headings, while Task cards call `formatScheduleLabel()`.

There should be one authoritative date-only formatter used by both paths.

---

## 1.5 Problem #21 — Full rerenders

**Status: technically accurate observation, but not a current correctness problem. Excluded from ID25.**

Current rendering does intentionally rebuild the current List/Kanban view after many Task mutations. `TaskRendererMethods.render()` also updates sidebar counts, and `refreshAfterTaskMutation()` calls the full render path.

That is not a misunderstanding: the full rerender exists.

However, almost every important Task mutation can affect more than one UI concern:

```text
completion → active/completed placement, counts, Repeat generation
priority → sort and/or group placement
project → filter, group, metadata, inherited Subtask project
Tag → filter/group membership
Due Date → Today filter, sort, Date group
Repeat → future completion behavior and labels
hierarchy → root/Subtask structure and ordering
drag → Custom order and group destination
name → Name sorting
```

Replacing the full render with targeted DOM patching therefore requires a reliable invalidation/diff model. For this personal application, current full rendering is simpler and safer, and the tracker itself already says current scale makes it acceptable.

**Decision for ID25:**

```text
Do not build a mini reactive/diff system.
Do not add per-field DOM invalidation.
Do not change Task rendering architecture just to reduce rerenders.
```

Problem #21 should remain deferred as optional optimization. If it is ever pursued, it should receive a separate measured performance plan after the correctness/accessibility tracker is finished.

---

# 2. Goals

ID25 must achieve four narrowly defined outcomes:

1. A closing sidebar must never become `aria-hidden="true"` while focus remains inside it.
2. A closed sidebar must be removed from keyboard/focus interaction through `inert`, and reopening must restore interactivity in the correct order.
3. Mobile browser pinch zoom must no longer be blocked by viewport metadata.
4. Repeat/date display formatting must be read-only and use one source of truth for date labels.

The work must preserve all recent architecture and behavior from ID20 Parts 1–5, ID21/22, ID23, and ID24.

---

# 3. Non-goals

Do not include any of the following in ID25:

```text
Problem #5 reminder notification delivery
Problem #16 Project/Tag row keyboard semantics
Problem #18 visual Project picker indentation
Problem #21 render optimization
Problem #23 strict Repeat date parsing
Problem #25 test-suite expansion
Problem #26 placeholder app removal
Problem #27 CSS import cleanup
```

Also do not:

```text
change IndexedDB schema
change Backup JSON format
change Task sorting semantics
change Custom sort behavior
change Repeat recurrence algorithms
change Project/Tag hierarchy behavior
change Schedule keyboard lifecycle
redesign sidebar visuals
introduce a framework
```

---

# 4. Phase A — Fix Sidebar Focus and Hidden-State Lifecycle (#15)

## 4.1 Ownership

Primary file:

```text
js/components/sidebar.js
```

Possible markup adjustment:

```text
index.html
```

No reason exists to modify `ModalFocusManager` for this problem unless implementation review proves a genuinely reusable primitive is required.

The sidebar is a drawer/navigation surface, not a modal dialog.

---

## 4.2 Required hidden-state invariant

When the sidebar is closed, all of the following must be true:

```text
sidebar does not have .open
backdrop does not have .active
aria-hidden = true
sidebar is inert
aria-expanded on toggle = false
keyboard focus is NOT inside sidebar
```

When the sidebar is open:

```text
sidebar is not inert
aria-hidden = false
sidebar has .open
backdrop has .active
aria-expanded on toggle = true
```

The ordering matters.

### Opening order

Use conceptually:

```text
remove inert
→ aria-hidden=false
→ show/open drawer
→ aria-expanded=true
```

The sidebar must become available to accessibility/focus APIs before the user attempts to interact with it.

### Closing order

Use conceptually:

```text
close sidebar action menus
→ if focus is inside sidebar, move focus to safe outside control
→ verify focus is outside
→ hide visual drawer/backdrop
→ aria-hidden=true
→ inert=true
→ aria-expanded=false
```

Never apply `aria-hidden=true` or `inert` first and then try to move focus afterward.

---

## 4.3 Focus destination

The primary safe destination is:

```text
#btn-toggle-sidebar
```

because it is the control that reopens the drawer.

However, focus should only be forcibly moved when the current active element is actually inside the sidebar.

Required rule:

```js
if (sidebar.contains(document.activeElement)) {
  toggleBtn.focus(...);
}
```

If focus is already outside the sidebar, `closeSidebar()` must not steal it.

This is important for pointer-driven cases and calls that close the sidebar while another legitimate surface already owns focus.

---

## 4.4 Safe helper structure

Prefer a small Sidebar-owned helper rather than duplicating conditions:

```text
isSidebarFocusInside()
moveFocusOutsideSidebar()
setSidebarHiddenState(hidden)
```

Exact names may differ, but the ownership should remain inside `SidebarComponent`.

A reasonable shape is:

```js
hasFocusInsideSidebar() {
  return Boolean(this.sidebarEl?.contains(document.activeElement));
}

moveFocusOutsideSidebar() {
  if (!this.hasFocusInsideSidebar()) return true;
  this.toggleBtn?.focus({ preventScroll: true });
  return !this.hasFocusInsideSidebar();
}
```

Provide a safe fallback if `focus({ preventScroll: true })` is unsupported:

```js
try { ... } catch (_) { this.toggleBtn?.focus(); }
```

If focus somehow still remains inside after the normal fallback, do not immediately mark the sidebar accessibility-hidden. Use one last safe blur/fallback strategy rather than recreating the dialog bug.

---

## 4.5 Initial markup

Because `index.html` currently ships the sidebar with:

```text
aria-hidden="true"
```

it should also ship in a matching non-interactive state:

```html
inert
```

This prevents a short first-paint/startup window where hidden sidebar controls could theoretically participate in keyboard focus before JavaScript initialization.

Expected static shape:

```html
<aside ... aria-hidden="true" inert>
```

`openSidebar()` removes `inert`.

---

## 4.6 Preserve current sidebar behavior

Do not change:

```text
filter selection
Project/Tag actions
Project/Tag drag
sidebar backdrop behavior
sidebar animation
mobile/desktop drawer geometry
WorkspaceControls synchronization
Task rerender after selecting a filter
```

The accessibility fix must be lifecycle-only.

---

# 5. Phase B — Restore Mobile Pinch Zoom (#17)

## 5.1 File

```text
index.html
```

## 5.2 Exact viewport change

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

## 5.3 Do not compensate in JavaScript

Do not add gesture listeners such as:

```text
touchmove preventDefault
gesturestart preventDefault
wheel+Ctrl preventDefault
```

The entire point is to restore normal browser zoom behavior.

---

## 5.4 VisualViewport compatibility

The Task/Subtask editor currently uses `window.visualViewport` for mobile keyboard/sheet positioning.

Allowing pinch zoom changes `visualViewport` dimensions and offsets while zoomed, which is normal browser behavior.

The implementation must not rewrite the existing ID21/ID22 visualViewport logic unless a concrete regression is found.

Manual verification must cover:

```text
pinch zoom while normal workspace is open
open Task editor while zoomed
keyboard opens/closes
Date → Schedule keyboard transition
context menu positioning while zoomed
Subtask editor while zoomed
```

If a zoom-specific positioning bug is discovered during implementation, document it separately before broadening scope.

---

# 6. Phase C — Make Repeat Label Formatting Read-only (#20)

## 6.1 File

```text
js/components/task-renderer.js
```

## 6.2 Current unsafe expression

```js
custom.weekdays.sort((a, b) => a - b)
```

Replace it with a copied/sorted collection, conceptually:

```js
[...custom.weekdays]
  .sort((a, b) => a - b)
  .map(...)
```

or:

```js
const orderedWeekdays = [...custom.weekdays].sort((a, b) => a - b);
```

The original `custom.weekdays` array must remain byte-for-byte/logically unchanged by `formatRepeatLabel()`.

---

## 6.3 Purity audit inside the formatter

While touching `formatRepeatLabel()`, audit all operations in that method for mutation.

Allowed:

```text
reading properties
creating local arrays/strings
sorting a local copy
mapping a local copy
```

Not allowed:

```text
.sort() directly on a state-owned array
.splice()
.reverse()
push/pop/shift/unshift on state-owned arrays
property assignments on repeatObj/custom
```

Do not redesign Repeat normalization; that belongs to `RepeatEngine`.

---

## 6.4 Preserve output exactly

For the same Repeat rule, rendered labels must remain the same.

Examples:

```text
daily → 🔁 Daily
weekly → 🔁 weekly
monthly → 🔁 Monthly
yearly → 🔁 Yearly
custom day → 🔁 Every N day(s)
custom week → 🔁 Every N week(s) on Mon, Wed, Fri
```

ID25 fixes hidden mutation only; it is not a wording/capitalization redesign.

---

# 7. Phase D — One Date-only Formatting Source (#22)

## 7.1 Files

Primary:

```text
js/components/task-renderer.js
```

Consumer to verify:

```text
js/components/task-groups.js
```

Before editing, search the repository for all callers of:

```text
formatScheduleLabel
formatDueDateLabel
```

so no hidden consumer is missed.

---

## 7.2 Add one authoritative helper

Create one date-only helper on the Task rendering owner, for example:

```text
formatDateLabel(dateStr)
```

It owns exactly this logic:

```text
null/empty → ''
today → 'Today'
tomorrow → 'Tomorrow'
other valid app date → 'Aug 15' style output
```

It must preserve the current locale/output behavior:

```js
new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
})
```

Do not introduce Problem #23 strict-date parsing work here.

---

## 7.3 Refactor `formatScheduleLabel()`

Instead of calculating Today/Tomorrow/date itself:

```js
formatScheduleLabel(dateStr, timeStr) {
  const datePart = this.formatDateLabel(dateStr);
  if (datePart && timeStr) return `${datePart}, ${timeStr}`;
  return datePart || timeStr || '';
}
```

This preserves current combinations:

```text
Today
Today, 9:00 AM
Aug 15
Aug 15, 9:00 AM
9:00 AM
```

---

## 7.4 Date group headings

`task-groups.js` currently needs date-only formatting.

Preferred final call:

```js
this.formatDateLabel(key)
```

Then remove `formatDueDateLabel()` if repository audit proves it has no other required consumer.

If compatibility requires keeping the method temporarily, it must become a trivial delegating wrapper:

```js
formatDueDateLabel(dateStr) {
  return this.formatDateLabel(dateStr);
}
```

There must be only **one actual Today/Tomorrow/Intl implementation** after ID25.

---

# 8. Problem #21 — Explicit Deferral Strategy

ID25 must not accidentally turn #21 into a large rendering rewrite.

## 8.1 Why no implementation now

Current full rendering is a valid consistency strategy:

```text
AppDataService mutation
→ AppStateSync
→ render current view from authoritative state
```

It avoids stale DOM after changes that can simultaneously affect:

```text
filter membership
sort order
group membership
hierarchy
counts
Kanban columns
Repeat occurrence behavior
```

A partial-update engine would need to answer those invalidation questions reliably.

For the current personal-scale workload, the complexity/risk is larger than the expected benefit.

## 8.2 What would justify a later plan

Only revisit #21 if one of these becomes true:

```text
measured render latency becomes visible
large Task collections create input lag
mobile devices show measurable frame drops
profiling identifies a specific repeated expensive render
```

A future plan should start with measurement and target the expensive path, not assume every full render must be removed.

---

# 9. Expected File Scope

Expected production changes are intentionally small:

```text
index.html
js/components/sidebar.js
js/components/task-renderer.js
js/components/task-groups.js
```

`task-groups.js` may require only a one-line caller rename.

No other file should change unless implementation-time source audit proves a direct dependency.

Specifically, ID25 should normally **not** touch:

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

---

# 10. Implementation Order

Use this order to keep each change independently understandable.

## Milestone 1 — Sidebar accessibility lifecycle

```text
1. Add initial inert state in index.html.
2. Add Sidebar focus-inside detection.
3. Add safe focus transfer to toggle button.
4. Update open ordering.
5. Update close ordering.
6. Verify selection/backdrop/toggle paths.
```

## Milestone 2 — Mobile zoom

```text
1. Remove maximum-scale=1.0.
2. Remove user-scalable=no.
3. Preserve viewport-fit and interactive-widget directives.
```

## Milestone 3 — Repeat render purity

```text
1. Copy weekdays before sorting.
2. Audit formatter for any other mutation.
3. Preserve exact text output.
```

## Milestone 4 — Date formatter consolidation

```text
1. Add formatDateLabel().
2. Route formatScheduleLabel() through it.
3. Route Date group labels through it.
4. Remove/delegate formatDueDateLabel().
5. Confirm only one Today/Tomorrow/Intl implementation remains.
```

---

# 11. Static Verification

After implementation, perform repository/source checks for the following.

## 11.1 Sidebar

Confirm closed-sidebar code contains the equivalent of:

```text
focus transfer before aria-hidden/inert
aria-hidden=true
inert=true
```

Confirm open path removes inert.

Search to ensure no other code directly hides `#secondary-sidebar` in a conflicting order.

## 11.2 Viewport

Confirm `index.html` contains neither:

```text
maximum-scale=1.0
user-scalable=no
```

and still contains:

```text
viewport-fit=cover
interactive-widget=resizes-content
```

## 11.3 Repeat purity

Search the Task rendering path for:

```js
custom.weekdays.sort(
```

Expected result:

```text
zero direct state-owned sorts
```

## 11.4 Date duplication

Search for the duplicated blocks involving:

```text
Today
Tomorrow
Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
```

The Task rendering date-only logic should have one owner.

## 11.5 Module health

Because the app is native ES modules after ID20 Part 5:

```text
all changed JS files parse as ES modules
all added imports resolve
no new global dependency is introduced
no runtime patch layer is introduced
```

---

# 12. Mandatory Manual Regression Tests

## 12.1 Sidebar focus — keyboard

On desktop and phone-width layout where practical:

1. Open sidebar from `#btn-toggle-sidebar`.
2. Tab to Inbox.
3. Activate Inbox.
4. Confirm sidebar closes.
5. Confirm focus is not left inside hidden sidebar.
6. Confirm toggle can immediately reopen sidebar.
7. Repeat for Today and Completed.
8. Repeat for a Project row and a Tag row.
9. Tab to `+` Add Project / Add Tag; open/close their modal and confirm normal focus restoration.

No browser warning should say an `aria-hidden` element retained focused content.

## 12.2 Sidebar focus — pointer/touch

```text
open sidebar
select Inbox/Today/Project/Tag by pointer
close using backdrop
close using toggle
```

Expected:

```text
no stuck focus inside hidden sidebar
no broken Project/Tag menu
no missing click/touch response
```

## 12.3 Sidebar + modal interaction

Test:

```text
Sidebar → Add Project → Cancel
Sidebar → Edit Project → Cancel
Sidebar → Add Tag → Cancel
Sidebar → Edit Tag → Cancel
```

The modal focus lifecycle from ID13/ID21/ID22 must remain correct.

## 12.4 Mobile pinch zoom

On a real phone browser:

```text
pinch zoom in
pinch zoom out
pan while zoomed
open/close sidebar while zoomed
open Task editor while zoomed
open keyboard while zoomed
Priority/Tags/Project menus while zoomed
Date → Schedule while zoomed
Schedule Apply/Cancel while zoomed
Subtask editor while zoomed
```

The user must be able to zoom; the UI must remain operable.

## 12.5 Repeat render purity

Create/edit a Custom Weekly Repeat with weekdays selected in a non-sorted interaction order if the UI permits.

Before/after rendering labels, verify behavior remains identical:

```text
Repeat rule still works
selected weekday state is unchanged
label is ordered correctly
refresh preserves same rule
completion generates expected next occurrence
```

The important source invariant is that rendering does not mutate the stored rule.

## 12.6 Date labels

Verify Task cards and Date group headings for:

```text
Today
Tomorrow
another date in current month
another date in another month
date + time
time only
no date/no time
```

Task card and group heading must agree on the date wording.

## 12.7 Broader smoke regression

Because these are shared UI files, also test:

```text
List view
Kanban view
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

# 13. Tracker Completion Rules

After implementation and user verification:

Mark:

```text
#15 [x]
#17 [x]
#20 [x]
#22 [x]
```

Do **not** mark #21 complete as part of ID25 because it is intentionally excluded/deferred.

If desired, the tracker wording for #21 can later be changed from a “problem” to an optional performance improvement, but that is a tracker-edit decision separate from this implementation plan.

---

# 14. Definition of Done

ID25 is complete only when all of the following are true:

1. Closing the sidebar never hides a still-focused descendant.
2. Closed sidebar is inert and `aria-hidden=true`.
3. Open sidebar is not inert and `aria-hidden=false`.
4. Focus is transferred outside only when focus was actually inside the closing sidebar.
5. Sidebar filter, Project, Tag, modal, drag, and backdrop behavior is preserved.
6. Mobile pinch zoom works because restrictive viewport directives are gone.
7. Existing safe-area/interactive-widget behavior remains configured.
8. `formatRepeatLabel()` does not mutate `custom.weekdays` or other Repeat state.
9. Repeat label output is unchanged.
10. There is one authoritative Task date-only formatting implementation.
11. Task card schedule labels and Date group headings use that shared date logic.
12. No IndexedDB, Backup, Repeat recurrence, Custom sort, or Schedule focus architecture is changed.
13. Static ES-module checks pass.
14. Manual regression tests above pass.
15. #21 remains deferred rather than being expanded into an unnecessary render-engine rewrite.
