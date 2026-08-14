# Implementation Plan ID 21 — Preserve Mobile Keyboard While Using Task Editor Toolbar

## Status

Planning only. **Do not implement Part 3 of ID20 as part of this work.**

This is a focused repair after the Part 2/context-menu work and before `Implementation Plan ID 20 Part 3.md`.

## Problem

On phone/mobile, when the user is typing in the **New Task** or **Edit Task** title/description field, the software keyboard is open. Tapping toolbar controls such as:

- Date / Schedule
- Priority
- Tags
- Project

currently moves DOM focus away from the text input. Once the text input loses focus, the phone closes the software keyboard.

The desired behavior is that these toolbar actions are auxiliary editing controls: they must not end the current typing session.

The same focus policy should be applied to the equivalent **Subtask editor** controls so the behavior is consistent.

## Current causes found in the code

### 1. Toolbar buttons can take focus on pointer/touch down

`tasks.js` binds normal click handlers to Date, Priority, Tags, and Project toolbar buttons. On mobile browsers, tapping a normal button can move focus from the active text input to that button before the click handler runs. That alone can close the software keyboard.

### 2. Task context menus explicitly move focus away from the input

`js/components/task-menus.js` currently opens a menu and then does:

```js
const first = menu.querySelector('.context-menu-item.selected') || menu.querySelector('.context-menu-item');
first?.focus();
```

That is correct for keyboard navigation, but wrong for touch interaction while the user is actively typing because it guarantees the title/description input loses focus.

### 3. Tapping menu items can also steal focus

The context-menu items are focusable for accessibility. Even if opening the menu stops calling `focus()` for touch, a pointer/touch selection may still focus the tapped option unless its pointer-focus behavior is controlled.

### 4. Date / Schedule has a deeper focus transition

`tasks.js` calls `ScheduleComponent.open(...)` from the Date toolbar button.

`ScheduleComponent.open()` then calls `ModalFocusManager.open()` with an `initialFocus` inside the Schedule dialog. `ModalFocusManager.open()` focuses that control and makes the parent Task modal inert. This necessarily removes focus from the task title/description input and closes the mobile keyboard.

`ModalFocusManager.close()` later returns focus to the Schedule trigger, which is the Date button, not necessarily the exact text input the user was typing in.

### 5. Subtask editor has the same class of problem

The Subtask editor has Date, Priority, and Tags controls. Pointer interaction can move focus away from `subtask-title-input` / `subtask-desc-input`, and its Date action opens the same Schedule dialog.

## Required user-visible behavior

When an editable text field is currently focused and the software keyboard is open:

1. Tapping **Priority** must keep the keyboard open.
2. Tapping **Tags** must keep the keyboard open.
3. Tapping **Project** must keep the keyboard open.
4. Tapping **Date / Schedule** must keep the keyboard open while Schedule is opened and used.
5. Selecting an item from Priority/Tags/Project must not dismiss the keyboard.
6. Applying or cancelling Schedule must return to the same editor typing context without dismissing the keyboard.
7. The exact field that was active before the auxiliary action must be preserved: title stays title; description stays description.
8. The text value, cursor/selection, draft Project/Tag/Priority/Date/Repeat/Reminder state, and current modal must not be reset.
9. The existing context-menu clipping repair must continue to work.
10. The same behavior must work in **New Task**, **Edit Task**, **New Subtask**, and **Edit Subtask** where equivalent controls exist.

If no title/description input is currently focused, do **not** force the keyboard open. The repair preserves an existing typing session; it must not create a new one unnecessarily.

Submitting, cancelling, or closing the Task/Subtask editor may still close the keyboard as normal.

## Accessibility requirement

Do not remove keyboard accessibility in order to solve a touch problem.

There must be two interaction paths:

- **Pointer/touch activation while an editor text input is active:** preserve the text-input focus and software keyboard.
- **Physical-keyboard activation** (`Enter`, `Space`, arrow-key menu opening, Tab navigation): keep the current accessible behavior and move focus into the opened menu/dialog as appropriate.

Do not use user-agent sniffing as the main decision. Base the behavior on the interaction source and whether a valid editor text input was already focused.

---

# Implementation Steps

## Step 1 — Work from the current repaired `main`

Before implementation:

- fetch current `main`;
- create a dedicated repair branch;
- verify it includes the context-menu clipping repair;
- do not modify ID20 Part 3 files or begin Part 3 architecture work.

Expected repair scope is UI focus/interaction only. No IndexedDB schema, mapper, Repeat persistence, taxonomy persistence, task hierarchy, or backup/restore changes.

## Step 2 — Add a small editor-focus continuity state to Task and Subtask editors

Each editor should be able to identify the exact active editable input:

Main Task:

- `#task-title-input`
- `#task-desc-input`

Subtask:

- `#subtask-title-input`
- `#subtask-desc-input`

Add focused helper logic to:

- recognize whether `document.activeElement` is one of those inputs;
- remember that exact element as the current typing-focus target;
- clear the remembered target when the editor closes;
- never use a stale/disconnected/hidden input as a restore target.

Preserving the existing element focus is preferable to blurring and re-focusing because that better preserves the cursor/selection and avoids keyboard flicker.

## Step 3 — Prevent toolbar pointer activation from taking text-input focus

For the Task toolbar controls that open auxiliary UI:

- Date
- Priority
- Tags
- Project

add a pointer-focus guard.

When all of these are true:

- activation is pointer/touch based;
- the Task modal is active;
- title or description is currently focused;

prevent the pointer's default focus transfer to the toolbar button while still allowing the subsequent click/action to run.

Do the equivalent for Subtask Date/Priority/Tags.

Important:

- do not suppress the click itself;
- do not apply this to Submit/Save/Cancel/Close actions;
- do not block physical keyboard activation of the toolbar controls.

## Step 4 — Make Task context menus interaction-source aware

Update `task-menus.js` so `openContextMenu()` knows whether it was opened by pointer/touch or by keyboard.

### Pointer/touch path with an active editor input

- keep the editor input focused;
- do not call `first?.focus()`;
- keep the newly added context-menu portal/clipping behavior unchanged;
- keep `aria-expanded`, selected state, and menu positioning unchanged.

### Keyboard path

For Enter/Space/ArrowDown opening:

- preserve the existing behavior;
- focus the selected/first menu option so arrow-key navigation works.

Do not infer this only from viewport width. Pass/track the interaction mode explicitly from the event path.

## Step 5 — Prevent pointer selection inside menus from dismissing the keyboard

While a menu is in the preserve-editor-focus pointer mode:

- pointer/touch down on Priority/Tag/Project menu options must not transfer DOM focus away from the active title/description input;
- the normal click handler must still select/toggle the option;
- Priority and Project single-select menus must still close after selection;
- Tag multi-select must remain open according to its current behavior;
- the active toolbar button styling and `aria-selected` values must remain correct.

When the same options are reached with a physical keyboard, normal option focus must continue to work.

## Step 6 — Add an explicit preserve-soft-keyboard option to Schedule opening

The Date button cannot be fixed only at the button event because `ScheduleComponent.open()` currently moves focus into Schedule through `ModalFocusManager`.

Extend the Schedule open contract with an optional focus policy, for example conceptually:

```js
ScheduleComponent.open(..., onApply, {
  preserveEditorFocus: activeInput
});
```

Exact naming can be chosen during implementation, but the contract must be explicit rather than using a hidden global flag.

Normal Schedule callers without this option must keep their current behavior.

## Step 7 — Extend ModalFocusManager safely for pointer-only focus preservation

Add a narrowly scoped option to `ModalFocusManager.open()` for an already-focused parent-editor input.

In preserve-soft-keyboard mode:

- show/register/push the child Schedule modal normally;
- do not immediately focus the Schedule's `initialFocus` target;
- do not make the parent modal inert while doing so, because an element inside an inert parent cannot remain the active focus target;
- retain the preserved editor input as the return-focus target;
- keep the modal stack bookkeeping correct.

This special mode must only be used for pointer/touch Schedule opening from an actively focused Task/Subtask text input.

For normal or physical-keyboard Schedule opening, keep the existing `ModalFocusManager` behavior unchanged: move focus into the child dialog and inert the parent.

## Step 8 — Keep Schedule controls from stealing focus during the preserved mobile typing session

While Schedule was opened in preserve-soft-keyboard mode, pointer interaction with its non-text controls must not steal focus from the preserved editor input.

Use a scoped pointer-down focus guard inside the active Schedule UI for focusable non-text controls such as:

- calendar day buttons;
- quick-date buttons;
- Date/Time/Repeat tabs;
- reminder trigger/options;
- Apply/Cancel;
- other button-based Schedule actions.

The action's click must still execute normally.

Do not block wheel scrolling/dragging or other gesture interactions. Only suppress unwanted focus transfer on controls that would otherwise take focus.

If Schedule opens a nested auxiliary dialog (custom reminder/custom repeat/repeat-end) while the preserved typing session is active, propagate the same focus policy where practical so opening one of those controls does not unexpectedly become the point that closes the keyboard.

## Step 9 — Restore correctly on Schedule Apply/Cancel

When Schedule closes from preserve-soft-keyboard mode:

- keep or restore focus to the exact original Task/Subtask input;
- do not focus the Date button;
- do not reopen a keyboard that the user explicitly dismissed while Schedule was open;
- preserve the Schedule draft/apply/cancel semantics exactly as they work now.

When Schedule was opened normally, retain the normal focus-return behavior.

Clear all temporary focus-policy state after close so it cannot leak into later Schedule openings.

## Step 10 — Preserve the context-menu clipping repair

Do not undo the recently added menu portal behavior.

The repaired menus must continue to:

- escape the `.quick-input-card` overflow clipping;
- stay inside the visible modal viewport;
- reposition on `visualViewport` changes;
- use internal scrolling for long lists;
- restore to their original wrapper after closing.

The keyboard-continuity repair should be layered on top of that behavior, not replace it.

## Step 11 — Keep data behavior completely unchanged

This repair must not change:

- Task/Subtask payload construction;
- Project/Tag/Priority values;
- Schedule date/time/repeat/reminder data;
- `AppDataService` CRUD;
- Repeat completion/generation from ID20 Part 2;
- hierarchy/drag logic;
- IndexedDB stores/version;
- backup/restore;
- taxonomy ordering;
- current context-menu selection semantics.

This is a focus/interaction repair only.

## Step 12 — Static verification before merge

Before publishing:

- compare repair branch against `main`;
- confirm only focus/toolbar/menu/Schedule/modal-focus files needed for this repair changed;
- inspect all pointer handlers to make sure `preventDefault()` does not accidentally suppress click actions;
- confirm physical-keyboard menu opening still calls menu-item focus;
- confirm no Part 3 files or architecture work were introduced;
- do not mark any tracker item complete merely because code exists.

No Playwright, Selenium, Puppeteer, headless Chrome, or browser automation.

---

# Manual Phone Verification Checklist

The user will manually verify on the real phone.

## Main New Task

1. Hard refresh.
2. Open New Task.
3. Tap title and type text; confirm keyboard is open.
4. Tap Priority — keyboard must stay open.
5. Select a priority — keyboard must stay open.
6. Tap Tags — keyboard must stay open.
7. Select/deselect several tags — keyboard must stay open.
8. Tap Project — keyboard must stay open.
9. Select a project — keyboard must stay open.
10. Tap Date — Schedule must open without dismissing the keyboard.
11. Choose a date/time and Apply — return to the Task editor with keyboard still open.
12. Repeat Date and Cancel — keyboard must still be open and draft behavior must be correct.
13. Confirm typed title/description and cursor context were not lost.

## Main Edit Task

Repeat the same Priority/Tags/Project/Date tests while editing an existing task.

Verify saving still persists all changed fields after refresh.

## Description field

Repeat at least Priority and Date while the **description** field, rather than title, is focused.

After closing the auxiliary UI, description must remain the active typing field.

## Subtask

For New Subtask and Edit Subtask:

- title/description keyboard stays open for Priority;
- keyboard stays open for Tags;
- keyboard stays open for Date/Schedule;
- Schedule Apply/Cancel returns to the same subtask input.

## Keyboard already closed

Dismiss the keyboard intentionally before tapping a toolbar action.

The repair must **not** force the keyboard to reopen just because Priority/Tags/Project/Date was used.

## Physical keyboard/accessibility sanity check

Where possible on desktop/physical keyboard:

- Tab to a toolbar button;
- open Priority/Tags/Project with Enter/Space/ArrowDown;
- menu option receives focus;
- arrow-key navigation works;
- Escape closes and returns focus appropriately.

---

# Expected Files During Implementation

Likely files:

- `js/components/tasks.js`
- `js/components/task-menus.js`
- `js/components/subtask-editor.js`
- `js/components/schedule.js`
- `js/components/modal-focus.js`

Possibly one or more Schedule submodules if focus-preservation must be propagated to nested Schedule dialogs.

Do not change CSS unless real implementation/testing proves a visual-viewport adjustment is required while the keyboard remains open.

# Stop Point

After this repair is implemented and manually verified, stop.

**Do not automatically begin `Implementation Plan ID 20 Part 3.md`.** Part 3 starts only after an explicit user request.