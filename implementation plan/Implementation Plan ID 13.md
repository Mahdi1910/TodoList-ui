# Implementation Plan ID 13 — Correct Modal Focus, `aria-hidden`, and Nested Dialog Lifecycle

## Goal

Fix the real console/accessibility defect:

```text
Blocked aria-hidden on an element because its descendant retained focus.
```

This plan intentionally ignores the unrelated console noise already identified:

- browser/content-script logging;
- failed development live-refresh WebSocket;
- missing favicon.

The scope is **only modal/dialog focus management and accessibility state**.

The fix must be systemic. Project and Tag currently expose the warning, but the same unsafe lifecycle exists in several other dialogs. We should establish one shared modal-focus contract and migrate every application dialog to it instead of adding isolated `blur()` calls or one-off patches.

No application implementation is part of this plan commit.

---

# 1. Confirmed Root Cause

The current Project close path does this conceptually:

```text
focused input/button is still inside Project modal
↓
remove .active
↓
set aria-hidden="true"
↓
focus remains inside hidden dialog
```

The Tag modal does the same.

Other dialogs often do this:

```text
focus is inside modal
↓
set aria-hidden="true"
↓
then restore focus to opener
```

That is also incorrect because the browser evaluates the `aria-hidden` operation before focus is restored.

The required invariant is:

> **No dialog may become `aria-hidden="true"` or `inert` while `document.activeElement` is still inside that dialog.**

---

# 2. Audit Findings — All Related Dialogs

## 2.1 Project modal

Current behavior:

- opens and focuses `#project-name-input`;
- closes by removing `.active` and setting `aria-hidden="true"`;
- does not remember the opener;
- does not restore focus.

This directly explains the console warning where the Project name input remains focused.

## 2.2 Tag modal

Current behavior:

- opens and focuses `#tag-name-input`;
- closes by removing `.active` and setting `aria-hidden="true"`;
- does not remember the opener;
- does not restore focus.

This directly explains the warning where `#btn-close-tag-modal` remains focused.

## 2.3 Main Task editor

Current behavior is partly correct:

- remembers `lastFocusedElement` before open;
- focuses task title on open;
- traps Tab locally;
- on close, **sets `aria-hidden="true"` first**;
- only afterward focuses `lastFocusedElement`.

Therefore it can produce the same warning even though it attempts focus restoration.

## 2.4 Subtask editor

Same ordering defect:

- remembers trigger;
- focuses title input;
- local Tab trap;
- closes / sets `aria-hidden="true"`;
- restores trigger afterward.

## 2.5 Settings modal

Same ordering defect:

- remembers opener;
- focuses theme toggle;
- local Tab trap;
- hides with `aria-hidden="true"`;
- restores opener afterward.

## 2.6 Schedule modal

Same ordering defect:

- remembers the Date/Schedule trigger;
- focuses selected/today calendar control;
- has a local focus trap;
- hides with `aria-hidden="true"`;
- restores the trigger afterward.

Schedule is especially important because it is commonly opened **on top of the Task or Subtask editor**, creating a nested-dialog stack.

## 2.7 Custom Reminder dialog

Current behavior:

- opens over Schedule;
- sets `.active` + `aria-hidden="false"`;
- does not capture its opener separately;
- does not move focus into the child dialog explicitly;
- closes with `aria-hidden="true"` and no explicit focus restoration.

This is a hidden future instance of the same bug.

## 2.8 Custom Repeat dialog

Current behavior:

- opens over Schedule;
- has no dedicated return-focus state;
- closes with `aria-hidden="true"` while an inner control may still own focus;
- Schedule's own keydown focus trap is attached to the Schedule overlay, while Custom Repeat is a separate overlay, so the nested child should not rely on the parent's Tab trap.

## 2.9 Repeat Ends dialog

Current implementation is better than Custom Reminder/Repeat because it does trap focus and explicitly returns to the Ends row, but the close order is still wrong:

```text
aria-hidden=true
↓
then repeatEndsRow.focus()
```

That can still trigger the exact browser warning.

## 2.10 Menus are not part of this fix

Task action menu, Link-to-Parent picker, context menus, reminder menus, Project/Tag `•••` menus, etc. use menu/hidden semantics rather than `role="dialog"` + `aria-hidden` modal semantics.

Do not expand this plan into a menu accessibility rewrite.

---

# 3. Core Product / Accessibility Contract

Every application dialog must obey the same state model.

## Closed dialog

```text
.active          = false
aria-hidden      = true
inert            = true
focus inside     = impossible
```

## Top/open dialog

```text
.active          = true
aria-hidden      = false
inert            = false
focus            = inside this dialog
Tab              = trapped inside this dialog
```

## Nested dialog

Example:

```text
Task editor
    ↓
Schedule
    ↓
Custom Repeat
```

Only the top dialog is focusable/interactable.

Conceptually:

```text
Task editor       active visually, inert while covered
Schedule          active visually, inert while covered
Custom Repeat     active + not inert + owns focus
```

Closing Custom Repeat:

```text
Custom Repeat closes
↓
Schedule becomes non-inert
↓
focus returns to the Custom Repeat opener in Schedule
```

Closing Schedule:

```text
Schedule closes
↓
Task/Subtask editor becomes non-inert
↓
focus returns to its Date button
```

Closing the root Task/Subtask editor:

```text
root modal closes
↓
focus returns to the page trigger / stable fallback
```

---

# 4. Introduce a Shared Modal Focus Manager

Create one focused module, recommended:

```text
js/components/modal-focus.js
```

Expose something like:

```js
window.ModalFocusManager
```

The exact API can be adjusted during implementation, but responsibilities must remain centralized.

Recommended responsibilities:

```text
init()
register(modal)
open(modal, options)
close(modal, options)
getTopModal()
resolveReturnFocus(...)
focusInitialTarget(...)
trapTopModalTab(event)
setInert(modal, value)
```

Use a stack / per-modal record rather than one global `lastFocusedElement`.

Suggested modal stack record:

```text
modal
trigger / returnFocus
fallbackFocus
parentModal
pendingFocusFrame
```

Use `WeakMap` where practical for per-modal metadata and a small ordered stack for currently open dialogs.

---

# 5. Critical Close Ordering

This is the heart of the fix.

Never do:

```text
aria-hidden=true
→ restore focus
```

Correct root-modal close sequence:

```text
1. Resolve return-focus target.
2. Remove visual active state / begin close.
3. Move focus OUTSIDE the dialog.
4. Only after focus is outside:
      aria-hidden = true
      inert = true
5. Remove modal from focus stack.
```

For a nested modal:

```text
1. Resolve parent modal and child opener.
2. Remove child visual active state.
3. Re-enable parent:
      parent.inert = false
4. Focus opener/fallback inside parent.
5. Verify activeElement is no longer inside child.
6. Set child:
      aria-hidden = true
      inert = true
7. Pop child from modal stack.
```

Do not use `element.blur()` as the fix. Blurring without a deliberate new focus target creates poor keyboard behavior and does not establish a reliable modal lifecycle.

---

# 6. `inert` Strategy

Use the platform `inert` property/attribute for closed and covered dialogs.

Why it is useful here:

- prevents keyboard focus from entering hidden dialogs;
- prevents pointer interaction with hidden/covered descendants;
- prevents accidental focus leakage behind a nested modal;
- matches the browser recommendation from the warning.

## Static dialogs

Add `inert` to static dialogs that begin closed in `index.html`, including the relevant modal overlays such as:

```text
#add-task-modal
#subtask-modal
#schedule-modal
#custom-reminder-modal
#custom-repeat-modal
#project-modal
#tag-modal
#settings-modal
```

Do not rely only on markup. `ModalFocusManager.init()` should normalize registered modal state from `.active` / `aria-hidden` so runtime state cannot drift.

## Dynamic Repeat Ends dialog

`#repeat-end-modal` is created dynamically. Register it immediately after creation and initialize it as:

```text
aria-hidden=true
inert=true
```

---

# 7. Modal Stack and Covered Parent Dialogs

A nested child must temporarily disable its parent modal.

Do not close or visually remove the parent; preserve the existing layered UX.

When opening a child dialog:

```text
1. Capture current focused control as child's return target.
2. Identify current top modal as parent.
3. Open child and make it non-inert.
4. Move focus into child.
5. Mark the covered parent inert.
```

Important ordering requirement:

- do not make the parent inert while focus is still inside the parent;
- first establish focus in the child, then inert the covered parent.

When the child closes, reverse that safely.

This specifically covers:

```text
Task → Schedule
Subtask → Schedule
Schedule → Custom Reminder
Schedule → Custom Repeat
Schedule → Repeat Ends
```

---

# 8. Centralize the Tab Focus Trap

The application currently duplicates Tab-loop logic in Task, Subtask, Schedule, Settings, and Repeat Ends, while some nested dialogs do not have an equivalent trap.

Move the **Tab trapping responsibility** to `ModalFocusManager` so only the top dialog can receive keyboard traversal.

Recommended approach:

- one document-level `keydown` listener installed by `ModalFocusManager.init()`;
- only handle `Tab`;
- get current top modal from stack;
- calculate visible/enabled focusable controls inside top modal;
- wrap first ↔ last;
- do nothing if no modal is open.

Focusable selector should cover the application's controls, e.g.:

```text
button:not(:disabled)
input:not(:disabled)
select:not(:disabled)
textarea:not(:disabled)
a[href]
[tabindex]:not([tabindex="-1"])
```

Filter out:

```text
hidden elements
[hidden]
inert descendants
elements with no rendered box where appropriate
```

Keep dialog-specific Escape behavior in the owning components because Escape may mean Cancel/discard and can have draft semantics.

Remove or delegate the duplicated Tab branches from component-specific `handleKeydown()` methods to avoid two traps acting on one keystroke.

---

# 9. Focus Target Rules Per Dialog

## Project

Open:

```text
initial focus → project name input
```

Close/cancel:

```text
return to exact opener when still connected
fallback → #btn-add-project
```

The opener may be:

- New Project button;
- Add Sub-project menu item;
- Edit menu item.

Pass/store the trigger when opening instead of relying only on `document.activeElement`.

## Tag

Same model:

```text
initial → tag name input
fallback → #btn-add-tag
```

## Task editor

Open:

```text
initial → task title
```

Close:

```text
exact opener when valid
fallback → #btn-open-add-task
```

## Subtask editor

Open:

```text
initial → subtask title
```

Return to explicit trigger where possible.

If the trigger belonged to another open modal, ModalFocusManager must re-enable that parent before restoring focus.

## Settings

Open:

```text
initial → theme toggle (existing behavior)
```

Return to the desktop/mobile Settings trigger that opened it.

## Schedule

Open:

```text
initial → selected date / today / first useful calendar control
```

Return to Date/Schedule button in Task or Subtask editor.

## Custom Reminder

Open:

```text
capture #btn-open-custom-reminder
initial focus → first useful reminder wheel/control
```

Close:

```text
return → #btn-open-custom-reminder
```

## Custom Repeat

Open:

```text
capture Custom Repeat row/button
initial focus → first editable repeat control
```

Close:

```text
return → Custom Repeat opener
```

## Repeat Ends

Keep existing desired behavior:

```text
return → Ends row
```

but move that focus restoration **before** applying hidden/inert state to the child dialog.

---

# 10. Rerender-Safe Focus for Project and Tag Saves

Project/Tag save paths persist data and then rerender their sidebar trees. A trigger inside a Project/Tag row can therefore be destroyed by the rerender.

Do not blindly focus a soon-to-be-removed element.

Use two levels of return target:

```text
exact trigger (preferred when still stable)
stable section fallback
```

Stable fallbacks:

```text
Project → #btn-add-project
Tag     → #btn-add-tag
```

For cancel/X/backdrop/Escape where no rerender occurs, return to the exact opener.

For successful save where a rerender follows, it is acceptable to focus the stable section control, or optionally resolve the newly rendered logical entity control after render.

The implementation should favor reliability over trying to preserve a stale DOM element.

`ui-persistence-bindings.js` must be reviewed because it overrides Project/Tag save methods and currently calls:

```text
close modal
→ rerender tree
```

Ensure the final save flow does not restore focus to an element that is immediately destroyed.

---

# 11. Pending `requestAnimationFrame` Focus Safety

Several open methods use `requestAnimationFrame(() => input.focus())`.

A fast open→close sequence could leave a queued callback that later focuses a now-hidden/inert dialog.

The shared manager should guard against stale focus callbacks.

Recommended:

```text
store pending focus RAF per modal
cancel it on close
or verify modal is still top/open/non-inert before focusing
```

This prevents a race that could recreate the same accessibility problem intermittently.

---

# 12. Focus Validation Before Hiding

Before setting a dialog to `aria-hidden="true"`, the manager should defensively verify:

```js
dialog.contains(document.activeElement) === false
```

If focus is unexpectedly still inside:

1. try resolved return target;
2. try registered stable fallback;
3. last-resort focus a safe document-level fallback.

Do not proceed with `aria-hidden=true` until focus has left the dialog.

This makes the core invariant enforceable even if a future component forgets to supply a perfect opener.

---

# 13. Last-Resort Focus Fallback

The system should never need to strand focus, but have a generic fallback for robustness.

Preferred fallback chain:

```text
registered exact opener
→ registered stable component fallback
→ top surviving parent modal's first focusable control
→ stable application navigation control (e.g. sidebar toggle/FAB)
→ body/document fallback only as last resort
```

Do not permanently add visible UI solely for this fallback.

---

# 14. Component Migration

## `js/components/sidebar-projects.js`

Change Project open/close to use shared manager.

Add trigger/return-focus awareness to `openProjectModal(...)`.

Remove direct unsafe `aria-hidden` close ordering.

## `js/components/sidebar-tags.js`

Same migration as Project.

## `js/components/sidebar.js`

Where Project/Tag dialogs are opened from dynamic menu buttons, pass the actual triggering element/logical fallback information when useful.

## `js/components/tasks.js`

Replace local modal focus lifecycle with manager calls.

Keep Task-specific:

- draft/reset logic;
- context-menu cleanup;
- viewport/keyboard adjustments;
- body modal state.

Remove/delegate only generic focus trapping/restoration.

## `js/components/subtask-editor.js`

Same: manager owns focus stack/trap/restore; component keeps draft and visual state.

## `js/components/settings.js`

Use manager for open/close and remove duplicate Tab-loop logic.

## `js/components/schedule.js`

Use manager for root Schedule open/close.

Keep Schedule draft semantics and Escape decision logic.

## `js/components/schedule-time-reminders.js`

Migrate Custom Reminder open/close to manager and give it explicit initial/return focus.

## `js/components/schedule-repeat.js`

Migrate Custom Repeat open/close to manager.

Preserve snapshot/cancel/commit semantics exactly.

## `js/components/schedule-repeat-end.js`

Register dynamic dialog and migrate its open/close/trap to manager.

Preserve Repeat Ends draft behavior exactly.

## `js/storage/ui-persistence-bindings.js`

Review persistent Task/Project/Tag/Subtask submit overrides to ensure successful saves close through the same focus manager and rerenders do not invalidate focus restoration.

---

# 15. HTML Changes

Update static dialog markup in `index.html` so dialogs that begin closed also begin inert.

Conceptually:

```html
<div
  class="modal-overlay"
  role="dialog"
  aria-modal="true"
  aria-hidden="true"
  inert>
```

Do this only for actual dialog/modal overlays.

Do not add `inert` to normal menus or workspace containers.

Add/load `modal-focus.js` early enough that every component can call it before any user interaction.

Recommended loading options:

1. static script before component scripts in `index.html`; or
2. bootstrap load before component initialization.

Choose one clear strategy and ensure the manager exists before any `open...Modal()` handler can run.

---

# 16. CSS

No visual redesign is required.

Existing `.modal-overlay` / `.modal-overlay.active` styling can remain.

Do not use CSS hacks such as:

```text
visibility:hidden merely to suppress focus
```

The accessibility state belongs in DOM semantics (`inert`, `aria-hidden`, focus movement), not visual styling.

Only add CSS if a tiny focus fallback/helper genuinely requires it; otherwise no CSS changes should be necessary.

---

# 17. Preserve Dialog-Specific Business Semantics

This refactor must not change what Cancel/Done/Apply/Save mean.

Examples:

```text
Schedule Cancel → discard schedule draft exactly as today
Schedule Apply → commit callback exactly as today
Custom Repeat Cancel → restore snapshot exactly as today
Custom Repeat Done → commit repeat draft exactly as today
Repeat Ends Cancel → do not modify main repeat end draft
Repeat Ends Done → commit end draft exactly as today
Project/Tag save → persistence behavior unchanged
Task/Subtask save → persistence behavior unchanged
```

Focus management is infrastructure; it must not alter domain behavior.

---

# 18. Error Paths

If persistence fails while a form modal is open:

```text
modal stays open
focus remains inside modal
modal remains aria-hidden=false
modal remains inert=false
data/form remains available to user
```

Do not close a modal or restore page focus on failed Project/Tag/Task/Subtask save.

This matches the existing persistence error behavior.

---

# 19. Body / Scroll State

Do not redesign the existing `modal-open` body behavior as part of this plan.

Only ensure that changing modal focus infrastructure does not break it.

Nested modal focus stack and `body.modal-open` are separate concerns.

Task/Subtask-specific `syncTaskModalBodyState()` should continue to work unless a minimal integration adjustment is necessary.

---

# 20. Files Expected to Change

Likely new file:

```text
js/components/modal-focus.js
```

Likely existing files:

```text
index.html
js/app.js                                  (only if manager initialization is bootstrap-driven)
js/components/sidebar.js
js/components/sidebar-projects.js
js/components/sidebar-tags.js
js/components/tasks.js
js/components/subtask-editor.js
js/components/settings.js
js/components/schedule.js
js/components/schedule-time-reminders.js
js/components/schedule-repeat.js
js/components/schedule-repeat-end.js
js/storage/ui-persistence-bindings.js      (focus/rerender integration only)
```

No expected changes to:

```text
IndexedDB schema
Task recurrence engine
Project/Tag drag hierarchy
Task hierarchy drag
Completed collapse logic
Kanban behavior
Timeline
```

---

# 21. Implementation Order

1. Add `ModalFocusManager` with registration, stack, inert handling, initial focus, return focus, stale-RAF protection, and top-modal Tab trap.
2. Register/normalize all static closed dialogs at startup.
3. Add `inert` to static initially hidden dialog markup.
4. Migrate Project + Tag first because they reproduce the current warnings directly.
5. Migrate Task, Subtask, Settings, and Schedule root dialogs.
6. Migrate Custom Reminder and Custom Repeat nested Schedule dialogs.
7. Register and migrate dynamic Repeat Ends dialog.
8. Remove/delegate duplicate component-level Tab traps so only the manager traps the active top dialog.
9. Review persistent save overrides for rerender-safe focus restoration.
10. Perform static audit for every direct `aria-hidden` write to a dialog; modal lifecycle writes should route through the manager.
11. Run the manual acceptance matrix below.

---

# 22. Manual Acceptance Matrix

Do **not** run Chrome/Playwright/Puppeteer/Selenium/headless browser automation for this project.

Use manual browser/phone testing and console inspection.

## A. Project — exact reported case

1. Open New Project.
2. Confirm Project name receives focus.
3. Close with X while name input is focused.
4. Console must contain **no** `Blocked aria-hidden` warning.
5. Focus returns to New Project button/fallback.

Repeat with:

- Cancel/backdrop if applicable;
- Escape;
- successful Save.

## B. Tag — exact reported case

1. Open New Tag.
2. Tab until close button is focused.
3. Activate close.
4. No `Blocked aria-hidden` warning.
5. Focus returns outside Tag modal.

Repeat for Edit Tag and Add Sub-tag paths.

## C. Task editor

1. Open task editor from FAB.
2. Confirm focus on task title.
3. Close with Escape/backdrop/save.
4. No warning.
5. Focus returns to FAB or valid opener.

## D. Existing task edit

1. Open an existing task editor from a task UI control.
2. Save so task list rerenders.
3. Ensure focus lands on a valid stable target rather than disappearing into a destroyed DOM node.
4. No warning.

## E. Subtask editor

Open from parent Task editor and separately from workspace task actions.

Verify:

- Subtask is top focus layer;
- parent Task editor cannot be tabbed into while Subtask is open;
- close returns focus correctly;
- no warning.

## F. Settings

Open from desktop Settings and mobile Settings separately.

Verify focus returns to the correct opener and no warning appears.

## G. Task → Schedule nested stack

1. Open Task editor.
2. Open Schedule.
3. Try Tab repeatedly.
4. Focus must remain inside Schedule, never entering Task editor behind it.
5. Close Schedule.
6. Focus returns to Task Date button.
7. Close Task editor.
8. Focus returns to page trigger.
9. No ARIA warning at either close.

## H. Subtask → Schedule

Repeat G with Subtask as parent.

## I. Schedule → Custom Reminder

1. Open Schedule → Time/Reminder → Custom Reminder.
2. Child receives focus.
3. Tab stays inside Custom Reminder.
4. Close.
5. Schedule becomes interactive again.
6. Focus returns to Custom Reminder opener.
7. No warning.

## J. Schedule → Custom Repeat

Repeat I for Custom Repeat.

Verify Cancel still restores its repeat snapshot exactly as before.

## K. Schedule → Repeat Ends

1. Select an active Repeat.
2. Open Ends.
3. Confirm focus is trapped in Repeat Ends.
4. Close with X, Cancel, Escape, and Done in separate runs.
5. Focus returns to Ends row.
6. No `aria-hidden` warning.

## L. Multi-level close sequence

Example:

```text
Task
→ Schedule
→ Custom Repeat
```

Close child layers one by one and verify focus path:

```text
Custom Repeat control
→ Schedule Custom Repeat opener
→ Task Date button
→ page/FAB
```

No focus should jump directly from child to page while a parent modal remains open.

## M. Fast open/close race

1. Open a dialog and close it immediately before the next animation frame.
2. Wait briefly.
3. Focus must not jump back into the closed dialog.
4. Closed dialog stays inert.

This validates stale RAF cancellation/guarding.

## N. Closed-dialog keyboard exclusion

With no modal open, repeatedly press Tab.

No control inside any closed modal should receive focus.

## O. Persistence failure behavior

Where practical, verify an existing persistence failure path keeps the form open and focused rather than closing and losing the user's data.

## P. Console acceptance

After exercising all modal paths above, the console must have **zero** occurrences of:

```text
Blocked aria-hidden on an element because its descendant retained focus
```

---

# 23. Static Acceptance Audit

Before considering implementation complete, inspect source and ensure:

- no component directly sets a dialog `aria-hidden="true"` before focus has been transferred;
- closed dialogs are inert;
- dynamic Repeat Ends is registered as inert when closed;
- every dialog has an explicit initial focus target or safe fallback;
- every dialog has an explicit return-focus target/fallback;
- only the top modal owns Tab trapping;
- nested parent dialogs become inert while covered;
- error paths keep the active form dialog open;
- no business/draft semantics were changed.

---

# 24. Explicit Non-Goals

Do not implement as part of this plan:

- favicon changes;
- refresh WebSocket changes;
- browser extension/content-script changes;
- redesigning modal visuals;
- changing task/project/tag business behavior;
- changing recurrence behavior;
- changing drag-and-drop behavior;
- rewriting menu accessibility;
- adding a third-party focus-trap library;
- database migrations;
- Timeline work.

---

# 25. Definition of Done

This plan is complete when:

```text
all closed dialogs are truly non-focusable
+ only the top open dialog is focusable
+ focus always moves out before aria-hidden=true/inert=true
+ nested dialogs restore focus one layer at a time
+ no stale RAF can refocus a closed dialog
+ Project/Tag save rerenders do not strand focus
+ all existing modal business semantics remain unchanged
+ manual console testing shows zero blocked aria-hidden warnings
```
