# Implementation Plan ID 22 — Date/Schedule Keyboard Close-and-Restore Flow

## Status

Planning only. **Do not implement ID20 Part 3 as part of this work.**

This is a focused correction to the ID21 mobile keyboard work. ID21 correctly keeps the keyboard open for inline Task/Subtask context menus, but the Date/Schedule button needs different behavior.

Current source-of-truth base when this plan was written:

`main` = `2abc0faae026876add20c193498f2508da646200`

---

## Correct user-visible behavior

### Priority / Tags / Project

Keep the existing ID21 behavior:

- if the user is typing in Title or Description, tapping Priority/Tags/Project keeps the software keyboard open;
- inline context-menu selection must not steal the editor input focus;
- the existing context-menu clipping/portal repair must remain intact.

### Date / Schedule

Date is intentionally different:

1. User is typing in a Task/Subtask Title or Description field.
2. User taps the Date icon.
3. Remember the exact field and cursor/selection position.
4. Close the software keyboard immediately.
5. Wait for the mobile visual viewport to expand after the keyboard dismissal.
6. Open Schedule normally, with the full available screen and normal Schedule focus behavior.
7. User chooses Apply, Cancel, closes Schedule, or uses another normal Schedule-close path.
8. Schedule closes first.
9. Return focus to the exact original editor field.
10. Restore the original cursor/selection position.
11. The software keyboard opens again immediately.

This must work in:

- New Task
- Edit Task
- New Subtask
- Edit Subtask
- Title field
- Description field

If Date is opened when no editor text field was active, Schedule should behave normally and closing Schedule must **not** force a keyboard to open.

---

# Current problem in the source

ID21 currently treats Date like Priority/Tags/Project.

In `tasks.js` and `subtask-editor.js`, Date is included in the generic auxiliary focus guard. That guard prevents the toolbar control from taking focus while a text input is active.

The Date handler then passes the active editor input into Schedule as:

```js
{ preserveEditorFocus }
```

`ScheduleComponent.open()` stores that input as `preservedEditorFocusTarget`, and `ModalFocusManager.open()` receives it through its `preserveFocus` option.

In that mode:

- Schedule opens while the original Task/Subtask input remains focused;
- the parent editor is deliberately not inerted;
- Schedule pointer controls are prevented from stealing focus;
- the software keyboard therefore remains open.

That is exactly the behavior that must now be removed for Date/Schedule.

The keyboard remaining open leaves the visual viewport reduced, so the Schedule window can be partially hidden or constrained.

---

# Implementation Steps

## Step 1 — Start from current `main` on a dedicated repair branch

Before changing code:

- verify `main` still contains ID21 and the context-menu clipping repair;
- create a separate branch for ID22;
- do not modify ID20 Part 3 implementation files or begin architecture work;
- do not change persistence, Repeat behavior, task data, taxonomy data, hierarchy, or backup/restore.

This is a UI focus/keyboard transition repair only.

---

## Step 2 — Separate Date from the inline-menu focus policy

In both `TasksComponent` and `SubtaskEditorComponent`, stop treating Date as an inline auxiliary context-menu button.

The generic “keep editor input focused” guard should continue to apply to:

Main Task:

- Priority
- Tags
- Project

Subtask:

- Priority
- Tags

But **Date must be removed from that generic guard**.

Date gets its own transition logic because it opens a full child dialog instead of an inline context menu.

Do not weaken or remove the context-menu focus-preservation logic for Priority/Tags/Project.

---

## Step 3 — Capture the exact typing context before Date causes blur

Add a focused helper to Task and Subtask editors to capture the current typing state before the Date tap transfers or clears focus.

Capture only when the active element is a valid editor input:

Main Task:

- `#task-title-input`
- `#task-desc-input`

Subtask:

- `#subtask-title-input`
- `#subtask-desc-input`

The snapshot should include at least:

```js
{
  element,
  selectionStart,
  selectionEnd,
  selectionDirection,
  scrollTop,
  scrollLeft
}
```

Use `pointerdown`/`mousedown` to capture this **before** the browser can move focus from the text field to the Date button.

Do not call `preventDefault()` for the Date button in this path. Date is supposed to end the temporary typing focus while Schedule is open.

If there is no valid active Title/Description input, store no return snapshot.

---

## Step 4 — Explicitly dismiss the software keyboard before opening Schedule

When Date is activated from an active editor text field:

- close any inline context menus;
- explicitly blur the captured input if it is still focused;
- allow the Date control / document to take focus normally;
- do not immediately open Schedule in the same reduced keyboard viewport.

The intent is deterministic:

**typing input -> blur -> keyboard begins closing -> viewport expands -> Schedule opens.**

Do not rely only on the button naturally stealing focus, because mobile browser behavior varies.

For physical-keyboard activation when no editor text input is active, skip the soft-keyboard transition and open Schedule normally.

---

## Step 5 — Wait for the mobile viewport to recover before showing Schedule

The important visual problem is not only focus: keyboard dismissal and viewport expansion are asynchronous on mobile.

Add a small bounded helper for the Date-open path that waits for the software-keyboard viewport transition to settle before calling `ScheduleComponent.open()`.

Preferred behavior:

- after blur, observe `window.visualViewport` resize when available;
- wait until the viewport has expanded/stabilized enough for the keyboard-closing transition;
- use `requestAnimationFrame` to avoid opening Schedule in the same pre-dismiss frame;
- include a short maximum timeout fallback so Schedule can never become stuck if a browser does not emit the expected resize event;
- on desktop or when no keyboard transition is occurring, open without unnecessary delay.

Avoid a long fixed `setTimeout` as the only mechanism.

The user should see the keyboard disappear first, then Schedule should occupy the correctly recovered screen.

---

## Step 6 — Cancel stale delayed Schedule opens safely

Because Schedule opening may wait briefly for the visual viewport to recover, protect against stale work.

Use a small token/generation/cancellation mechanism so a pending Date open is abandoned if, before Schedule actually opens:

- the Task/Subtask editor closes;
- another Date-open request supersedes it;
- the captured editor/input is no longer valid.

Do not let a delayed callback open Schedule after its parent editor has already closed.

Clear pending transition state when Task/Subtask closes.

---

## Step 7 — Return Schedule to normal modal focus behavior

Schedule should **not** preserve the Task/Subtask input as the active DOM focus while Schedule is open.

Open Schedule as a normal child modal:

- Schedule receives focus inside its own UI;
- the parent Task/Subtask modal becomes inert through the normal `ModalFocusManager` path;
- Schedule calendar/tabs/buttons/wheels can take focus normally;
- no Schedule-wide pointer guard is needed to keep the hidden parent editor input active;
- the keyboard remains closed while Schedule is being used.

The original Task/Subtask input still needs to be remembered as the **return target**, but it must not remain actively focused while Schedule is open.

---

## Step 8 — Replace `preserveEditorFocus` with an explicit return-focus contract

Change the Date/Schedule contract so the caller can give Schedule a return target without asking Schedule to preserve it while open.

Conceptually, use an option such as:

```js
{
  returnFocusTarget: typingSnapshot?.element,
  afterClose: () => restoreTypingContext(typingSnapshot)
}
```

Exact naming may differ during implementation, but the meaning must be explicit:

- `returnFocusTarget` = where focus should go after Schedule closes;
- it is **not** kept focused while Schedule is open;
- `afterClose` = restore cursor/selection details after the parent is active again.

`ScheduleComponent.open()` should pass this return target into the normal `ModalFocusManager.open()` trigger/return-focus mechanism.

Normal Schedule callers that do not provide a return target must keep current normal behavior.

---

## Step 9 — Simplify/remove the ID21 Schedule preserved-focus mode

The ID21 Schedule-specific preservation machinery is no longer needed for Date after this correction.

Review and remove Schedule-only code such as:

- `preservedEditorFocusTarget`
- `resolvePreservedEditorFocusTarget()`
- `getPreservedEditorFocusTarget()`
- `clearPreservedFocusSession()` where it exists only for this mode
- `initPreservedFocusGuard()` and its Schedule-wide `mousedown` prevention
- `preserveFocus` propagation to Custom Reminder
- `preserveFocus` propagation to Custom Repeat
- `preserveFocus` propagation to Repeat Ends

Nested Schedule dialogs should return to normal modal focus behavior because the software keyboard is already intentionally closed while Schedule is active.

Do not remove unrelated ModalFocusManager fixes from earlier repairs.

---

## Step 10 — Simplify `ModalFocusManager` only if the special mode has no remaining caller

After all Schedule callers are updated, audit repository usage of the ID21 `preserveFocus` option.

If no legitimate caller remains, remove the special preserved-focus branch from `ModalFocusManager` and return it to one clear modal behavior:

1. child modal opens;
2. child receives initial focus;
3. parent becomes inert;
4. child closes;
5. parent is uninerted;
6. focus returns to the explicit trigger/return target.

This should include removal of now-unused record fields/functions such as `preserveFocus`, `preserveCancelled`, `parentWasInerted`, and `clearPreservedFocus()` **only if repository audit proves they are unused**.

Do not blindly revert `modal-focus.js` to an older commit. Preserve all unrelated modal activation/inert/focus-stack fixes already made.

---

## Step 11 — Restore exact editor field and cursor after Schedule closes

Schedule close must restore the typing context on both Apply and Cancel.

After the Schedule modal has been removed from the active stack and the parent editor is no longer inert:

- validate that the original editor is still active;
- validate that the saved input is connected and visible;
- focus the saved Title/Description input;
- restore `selectionStart` / `selectionEnd` / `selectionDirection` when supported;
- restore textarea/input scroll offsets where useful;
- do this synchronously in the Schedule close interaction where possible so mobile browsers treat it as part of the user's Apply/Cancel action and reopen the software keyboard immediately.

Do not focus the Date button when a valid typing snapshot exists.

Expected result:

```text
Description focused at cursor position N
        -> Date
keyboard closes
        -> Schedule
        -> Apply or Cancel
Schedule closes
        -> Description focused again at position N
keyboard opens
```

The same must work for Task Title, Task Description, Subtask Title, and Subtask Description.

---

## Step 12 — Make every normal Schedule-close path consistent

The return-to-editor behavior should be centralized in `ScheduleComponent.close()` rather than duplicated only in Apply and Cancel button handlers.

This ensures the same cleanup/return behavior for:

- Apply
- Cancel
- Schedule overlay/tap-outside close if currently supported
- Escape/Back close paths that call the same Schedule close method

`apply()` must keep its existing data callback behavior and then close.

`close(true)` must keep existing discard semantics.

The focus restoration must not change Schedule draft/apply/cancel data semantics.

---

## Step 13 — Do not reopen a keyboard when there was no typing context

If Date was opened while:

- no Task/Subtask editor text input was active; or
- the active element was a toolbar button rather than Title/Description;

then Schedule closing should follow normal focus behavior and must not artificially focus a text input.

This protects desktop/physical-keyboard behavior and prevents unexpected keyboard popups.

---

## Step 14 — Preserve Priority/Tags/Project behavior from ID21

This correction must not undo the good part of ID21.

After implementation:

- Priority keeps keyboard open while typing;
- Tags keeps keyboard open while typing;
- Project keeps keyboard open while typing;
- clicking/tapping menu options keeps that same editor input focused;
- physical keyboard menu navigation remains accessible;
- context menus still use the clipping/portal repair and remain visible outside the scrolling Task card.

Date is the only toolbar control changing to close-then-restore behavior.

---

## Step 15 — Keep data/application architecture unchanged

Do not change:

- Task/Subtask payloads
- Schedule date/time/reminder/repeat values
- `AppDataService`
- ID20 Part 2 Repeat recurrence behavior
- IndexedDB schema/version
- hierarchy/drag code
- taxonomy ordering
- Backup/Restore
- ID20 Part 3 architecture work
- context-menu selection semantics

This repair is only about mobile focus, keyboard dismissal/restoration, and viewport timing.

---

# Expected implementation files

Likely files:

- `js/components/tasks.js`
- `js/components/subtask-editor.js`
- `js/components/schedule.js`
- `js/components/modal-focus.js`

Also likely to remove no-longer-needed `preserveFocus` propagation from:

- `js/components/schedule-time-reminders.js`
- `js/components/schedule-repeat.js`
- `js/components/schedule-repeat-end.js`

`js/components/task-menus.js` should ideally remain unchanged unless static review finds a necessary small adjustment. Its ID21 inline-menu focus behavior is supposed to remain.

No CSS change should be necessary unless real manual testing proves a viewport style problem remains after Schedule waits for keyboard dismissal.

---

# Static Verification Before Merge

Before publishing:

1. Compare repair branch against current `main`.
2. Confirm changes are limited to Date/Schedule focus-transition code and removal of obsolete Schedule preserved-focus code.
3. Confirm Priority/Tags/Project context-menu preservation remains intact.
4. Confirm the existing context-menu portal/clipping code remains intact.
5. Confirm no Part 3/data/persistence/Repeat/hierarchy/backup files changed.
6. Search for leftover `preserveEditorFocus`, Schedule `preserveFocus`, and preserved Schedule focus guards; remove only code proven obsolete.
7. Confirm all Schedule close paths clear temporary callbacks/snapshots so state cannot leak into later Schedule openings.
8. Confirm pending delayed Date-open callbacks are cancelled when parent editor closes.
9. Confirm no browser automation is introduced.

Do not mark unrelated tracker items complete merely because this repair is implemented.

---

# Manual Phone Verification Checklist

The user will manually verify on the real phone.

## New Task — Title

1. Hard refresh.
2. Open New Task.
3. Tap Title and type text.
4. Put cursor somewhere in the middle of the text.
5. Tap Date.
6. **Keyboard must close immediately.**
7. **Schedule must become fully visible after the keyboard closes.**
8. Choose a date and press Apply.
9. Schedule closes.
10. Title receives focus again.
11. Keyboard reopens immediately.
12. Cursor returns to the same position.

## New Task — Cancel

Repeat the test but press Cancel.

Expected:

- keyboard closes for Schedule;
- Cancel discards Schedule changes as before;
- keyboard reopens in the same original field/cursor position.

## Description

Repeat Apply and Cancel while Description is active.

The application must return to Description, not Title or Date.

## Edit Task

Repeat Title and Description tests while editing an existing Task.

Confirm existing data remains unchanged except for explicitly applied Schedule changes.

## New Subtask

Repeat the same Date Apply/Cancel tests for:

- Subtask Title
- Subtask Description

## Edit Subtask

Repeat the same tests while editing an existing Subtask.

## Inline controls regression

While keyboard is open in Title/Description:

- Priority -> keyboard stays open;
- Tags -> keyboard stays open;
- Project -> keyboard stays open;
- select menu values -> keyboard stays open.

This confirms Date's new behavior did not undo ID21 for inline menus.

## Date when keyboard/typing field is not active

Dismiss focus from Title/Description or navigate to Date with a physical keyboard.

Open and close Schedule.

Expected: no text field is forcibly focused and no unwanted software keyboard is opened.

## Schedule nested dialogs

With Schedule open and keyboard closed, test:

- Time tab
- Reminder menu
- Custom Reminder
- Repeat
- Custom Repeat
- Repeat Ends

They should behave as normal modal controls with no hidden parent input retaining focus.

---

# Stop Point

After ID22 is implemented and manually verified, stop.

**Do not automatically begin `Implementation Plan ID 20 Part 3.md`.**

Part 3 starts only after an explicit user request.