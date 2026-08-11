# Implementation Plan ID 2 — Keep Quick Task Sheet Above Android Keyboard Accessory

## Goal
Fix the Android phone quick-task modal so that the **entire task sheet stays above all keyboard-related browser UI**, including Chrome's black Autofill / Keyboard Accessory bar that can show password, address/location, and payment options above the software keyboard.

The user must always be able to see and reach:

- task title;
- description;
- date button;
- priority button;
- tag button;
- project button;
- Add Subtask button when editing;
- submit/save button.

This plan is for the existing `+` quick-task sheet. Do not redesign task creation or scheduling behavior.

---

## What the Black Bar Is

The reported black rectangle above the Android keyboard matches Chrome Android's **Keyboard Accessory / manual Autofill bar**.

Chromium uses this surface to manually fill stored data such as:

- passwords and passkeys;
- address profiles;
- payment cards / payment methods.

It is **browser UI**, not an HTML element inside this application.

Therefore the application cannot reliably do something like:

```js
document.querySelector('.chrome-password-payment-bar')
```

because no such DOM element exists.

The correct strategy is to react to the **actual visible viewport geometry** after Chrome/Android has reserved space for the keyboard and its accessory UI.

---

## Current Application Behavior

### Current viewport configuration

`index.html` currently uses:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content">
```

`interactive-widget=resizes-content` tells supporting browsers that interactive UI such as the on-screen keyboard may resize the layout/content viewport.

### Current quick-task modal structure

The quick-task UI is:

```text
.modal-overlay.quick-input-overlay
        ↓
.quick-input-card
        ↓
Title
Description
Toolbar
Submit
```

The shared `.modal-overlay` currently uses:

```css
position: fixed;
width: 100vw;
height: 100vh;
```

The quick-input overlay then bottom-aligns the card:

```css
.quick-input-overlay {
  align-items: flex-end;
}
```

### Current keyboard adjustment code

`js/components/tasks.js` currently does:

```js
initKeyboardAdjustment() {
  if (!window.visualViewport) return;
  const adjustForKeyboard = () => {
    if (!this.addTaskModal?.classList.contains('active')) return;
    const viewport = window.visualViewport;
    const keyboardHeight = window.innerHeight - viewport.height - viewport.offsetTop;
    this.quickCard.style.marginBottom = keyboardHeight > 50 ? `${keyboardHeight}px` : '0px';
  };
  window.visualViewport.addEventListener('resize', adjustForKeyboard);
  window.visualViewport.addEventListener('scroll', adjustForKeyboard);
}
```

This tries to estimate a single `keyboardHeight` and then pushes only the card upward with `marginBottom`.

---

## Verified Design Problem

The current formula assumes:

```text
layout viewport height
        -
visual viewport height
        =
keyboard obstruction height
```

That assumption is not reliable with the current viewport mode.

With `interactive-widget=resizes-content`, the browser may resize **both** the layout viewport and the visual viewport. In that case:

```text
window.innerHeight ≈ visualViewport.height
```

while a keyboard is still visible.

So this value:

```js
window.innerHeight - visualViewport.height - visualViewport.offsetTop
```

can become very small or zero and is not a reliable measurement of all keyboard/browser UI occupying the bottom of the screen.

The Chrome Keyboard Accessory also adds its own browser-controlled inset above the keyboard. The application should not try to guess whether that bar is 40 px, 48 px, 56 px, etc.

### Core architectural mistake

The application currently asks:

```text
"How tall is the keyboard?"
```

and then moves the card by that estimate.

It should instead ask:

```text
"What exact rectangle is visible to the web page right now?"
```

and place the entire quick-input overlay inside that rectangle.

---

## Correct Fix Strategy

Use `window.visualViewport` as the source of truth for the currently visible page area.

Do **not** position the quick card using estimated keyboard height.

Instead:

1. read `visualViewport.offsetTop`;
2. read `visualViewport.height`;
3. optionally read `visualViewport.offsetLeft` and `visualViewport.width`;
4. make the mobile quick-input overlay match that visible rectangle;
5. keep the card bottom-aligned inside that overlay.

Then the layout becomes:

```text
PHONE SCREEN
┌─────────────────────────────┐
│                             │
│     visible web content     │
│                             │
│ ┌─────────────────────────┐ │
│ │ Title                   │ │
│ │ Description             │ │
│ │ Date Priority Tag ... ↑ │ │  ← whole quick sheet
│ └─────────────────────────┘ │
├─────────────────────────────┤ ← visual viewport bottom
│ Chrome Autofill accessory   │
│ Password / Address / Card   │
├─────────────────────────────┤
│ Android keyboard            │
└─────────────────────────────┘
```

The app does not need to know the accessory-bar height. It only needs to keep its overlay inside the final visible viewport.

---

## Implementation Step 1 — Replace Keyboard-Height Estimation

**File:** `js/components/tasks.js`

Replace the current `initKeyboardAdjustment()` approach.

Do not calculate:

```js
const keyboardHeight = window.innerHeight - viewport.height - viewport.offsetTop;
```

Do not use `quickCard.style.marginBottom` as the primary keyboard positioning mechanism.

Create a reusable method such as:

```js
syncQuickInputViewport() {
  if (!this.addTaskModal?.classList.contains('active')) return;

  const viewport = window.visualViewport;
  if (!viewport) return;

  this.addTaskModal.style.setProperty('--quick-vv-top', `${viewport.offsetTop}px`);
  this.addTaskModal.style.setProperty('--quick-vv-left', `${viewport.offsetLeft}px`);
  this.addTaskModal.style.setProperty('--quick-vv-width', `${viewport.width}px`);
  this.addTaskModal.style.setProperty('--quick-vv-height', `${viewport.height}px`);
}
```

Names may vary, but the behavior must match this design.

---

## Implementation Step 2 — Coalesce Viewport Updates with requestAnimationFrame

Keyboard opening on Android can produce several viewport events during one animation.

Do not repeatedly force layout synchronously for every event.

Add a small scheduler, for example:

```js
queueQuickInputViewportSync() {
  cancelAnimationFrame(this.quickViewportFrame);
  this.quickViewportFrame = requestAnimationFrame(() => {
    this.quickViewportFrame = null;
    this.syncQuickInputViewport();
  });
}
```

Use it from viewport event listeners.

This reduces unnecessary layout churn and handles the keyboard/accessory animation more smoothly.

---

## Implementation Step 3 — Listen to the Final Visible-Viewport Geometry

`initKeyboardAdjustment()` should listen to:

```js
window.visualViewport.addEventListener('resize', ...)
window.visualViewport.addEventListener('scroll', ...)
window.addEventListener('resize', ...)
```

The VisualViewport `resize` event is the main signal when:

- Android keyboard opens;
- Android keyboard closes;
- Chrome's keyboard accessory appears/disappears and changes visible content space;
- orientation changes;
- browser UI changes the visible viewport.

`scroll` remains useful because mobile browsers can shift the visual viewport to keep a focused input visible.

Do not use user-agent sniffing for Chrome/Android.

---

## Implementation Step 4 — Make the Overlay Follow the Visual Viewport

**File:** `css/components/quick-task.css`

On mobile, override the inherited `100vh` geometry of `.modal-overlay` for `.quick-input-overlay`.

Conceptual CSS:

```css
@media (max-width: 768px) {
  .quick-input-overlay {
    top: var(--quick-vv-top, 0px);
    left: var(--quick-vv-left, 0px);
    width: var(--quick-vv-width, 100vw);
    height: var(--quick-vv-height, 100dvh);
  }
}
```

The exact fallback can be refined, but the mobile overlay must be bounded by the **currently visible viewport**, not an old/full `100vh` rectangle.

Keep:

```css
align-items: flex-end;
```

because once the overlay itself matches the visible viewport, flex-end naturally places the card directly above the browser/keyboard obstruction.

---

## Implementation Step 5 — Remove the Old marginBottom Hack

**Files:**

- `js/components/tasks.js`
- `css/components/quick-task.css`

The current code changes:

```js
this.quickCard.style.marginBottom
```

based on estimated keyboard height.

Remove that dynamic positioning behavior.

The normal card CSS should remain:

```css
margin-bottom: 0;
```

because the overlay itself will now move/resize correctly.

This avoids double compensation when `interactive-widget=resizes-content` has already reduced the layout viewport.

---

## Implementation Step 6 — Sync Immediately When the Modal Opens

**File:** `js/components/tasks.js`

Current `openModal()` activates the modal and then focuses the title input in `requestAnimationFrame()`.

When the modal opens:

1. activate modal;
2. perform an initial viewport sync;
3. focus the title input;
4. continue responding to VisualViewport resize/scroll events while the keyboard and accessory UI animate into place.

Suggested sequence:

```text
Tap +
  ↓
Modal becomes active
  ↓
Initial visible-viewport sync
  ↓
Title input receives focus
  ↓
Keyboard appears
  ↓
Chrome accessory may appear
  ↓
VisualViewport changes
  ↓
Overlay resizes again
  ↓
Toolbar remains above browser UI
```

Do not depend on only one event firing.

---

## Implementation Step 7 — Reset Viewport Overrides on Close

**File:** `js/components/tasks.js`

When `closeModal()` runs:

- cancel any queued `requestAnimationFrame` viewport update;
- clear the CSS custom properties / inline overlay geometry;
- restore default desktop/mobile modal behavior;
- do not leave stale geometry for the next open.

Create a helper such as:

```js
resetQuickInputViewport() {
  cancelAnimationFrame(this.quickViewportFrame);
  this.quickViewportFrame = null;

  this.addTaskModal.style.removeProperty('--quick-vv-top');
  this.addTaskModal.style.removeProperty('--quick-vv-left');
  this.addTaskModal.style.removeProperty('--quick-vv-width');
  this.addTaskModal.style.removeProperty('--quick-vv-height');
}
```

Do not retain old keyboard dimensions after the modal closes.

---

## Implementation Step 8 — Add a Small-Viewport Safety Net

**File:** `css/components/quick-task.css`

When the keyboard + accessory leaves very little vertical space, the quick card must not become taller than the visible viewport.

On mobile add a limit such as:

```css
.quick-input-card {
  max-height: calc(var(--quick-vv-height, 100dvh) - 4px);
}
```

If content can exceed this height, allow internal scrolling:

```css
overflow-y: auto;
overscroll-behavior: contain;
```

This is especially important when editing a parent task with a visible Subtasks section.

Do not hide the toolbar or submit button.

---

## Implementation Step 9 — Keep the Current Viewport Meta Initially

**File:** `index.html`

Do **not** immediately remove:

```text
interactive-widget=resizes-content
```

The primary fix should work with the current setting by anchoring the modal to `visualViewport` directly.

Changing viewport policy at the same time would broaden the regression surface unnecessarily.

Only change the meta viewport in a later fix if real-device testing proves the current browser ignores or mishandles it.

---

## Implementation Step 10 — Do Not Try to Hide Chrome's Accessory Bar

The application already uses input hints such as:

```html
autocomplete="off"
data-lpignore="true"
data-1p-ignore="true"
```

Do not base this fix on trying to disable Chrome's password/address/payment accessory UI.

Reasons:

- it is browser-controlled UI;
- availability varies by browser/account/settings;
- the user may legitimately use Autofill;
- the requested behavior is to position the app **above** it, not to remove it.

The quick sheet must work correctly whether the accessory appears or not.

---

## Files Expected to Change During Implementation

### Primary

- `js/components/tasks.js`
- `css/components/quick-task.css`

### Read / verify

- `index.html`
- `css/components/modal-controls.css`

### Do not change unless an actual dependency is found

- task state/storage;
- scheduling logic;
- drag/drop logic;
- Group By;
- Kanban;
- subtasks data model;
- sidebar;
- project/tag logic.

---

## Explicit Non-Goals

Do not change:

- task creation data model;
- task editing semantics;
- title/description behavior;
- schedule component behavior;
- reminders/repeat;
- project or tag menus;
- drag and drop;
- Android touch-drag fixes;
- desktop modal design;
- Chrome Autofill settings;
- Android keyboard settings;
- browser detection through user-agent strings.

---

## Desired Visual Behavior

### Without accessory bar

```text
┌────────────────────────────┐
│                            │
│                            │
│ ┌────────────────────────┐ │
│ │ Title                  │ │
│ │ Description            │ │
│ │ 📅  ⚑  Tag  Project ↑ │ │
│ └────────────────────────┘ │
├────────────────────────────┤
│ Android keyboard           │
└────────────────────────────┘
```

### With Chrome Keyboard Accessory

```text
┌────────────────────────────┐
│                            │
│ ┌────────────────────────┐ │
│ │ Title                  │ │
│ │ Description            │ │
│ │ 📅  ⚑  Tag  Project ↑ │ │  ← fully visible
│ └────────────────────────┘ │
├────────────────────────────┤
│ Password | Address | Card  │  ← Chrome UI
├────────────────────────────┤
│ Android keyboard           │
└────────────────────────────┘
```

The quick sheet must never sit underneath the black accessory bar.

---

## Acceptance Checks — Original Bug

1. Open the app on Android Chrome.
2. Tap the `+` button.
3. Title input receives focus and keyboard opens.
4. If Chrome displays its password/address/payment accessory bar, the whole quick-task card remains above it.
5. Title remains visible.
6. Description remains visible.
7. Date button remains visible.
8. Priority button remains visible.
9. Tags button remains visible.
10. Project button remains visible.
11. Submit arrow remains visible and tappable.
12. No part of the quick toolbar is covered by the black browser accessory UI.

---

## Acceptance Checks — Dynamic Accessory Changes

13. Open quick task when the accessory bar is not initially visible.
14. Cause the accessory bar to appear while the keyboard stays open.
15. The quick sheet moves/resizes automatically without closing.
16. Cause the accessory bar to disappear.
17. The quick sheet expands back into the newly visible space.
18. No hardcoded gap remains where the accessory used to be.
19. No visible jump places the sheet behind the keyboard.

---

## Acceptance Checks — Viewport / Device Behavior

20. Portrait Android works.
21. Landscape Android works.
22. Rotate while the task modal is open; it repositions correctly.
23. Opening/closing the keyboard repeatedly does not accumulate margins.
24. Reopening the modal after keyboard close uses fresh geometry.
25. Browser top/bottom toolbar movement does not permanently offset the modal.
26. Android navigation/safe-area padding remains respected.
27. The card does not exceed the visible viewport height.
28. If the card is taller than the available space, its content can scroll and the toolbar remains reachable.

---

## Acceptance Checks — Regression

29. Desktop quick-task modal remains centered as before.
30. Clicking outside still closes the quick-task modal where currently supported.
31. Escape behavior remains unchanged on keyboard-capable devices.
32. Creating a task still works.
33. Editing a task still works.
34. Date/priority/tag/project menus still open correctly.
35. Add Subtask button behavior remains unchanged.
36. No drag/drop source files are changed.
37. No task data is modified merely by opening/closing the keyboard.

---

## Engineering Notes

### Why VisualViewport instead of keyboard height

The application does not actually care how tall the keyboard is.

It cares about this boundary:

```text
bottom edge of currently visible web content
```

`VisualViewport` exposes that usable viewport geometry directly.

This also makes the solution resilient to:

- keyboard height differences;
- Gboard vs other keyboards;
- Chrome Autofill accessory appearing/disappearing;
- address/payment/password accessory modes;
- orientation changes;
- browser UI animations.

### Do not hardcode browser accessory height

Avoid fixes like:

```js
const chromeBlackBarHeight = 48;
```

or:

```css
margin-bottom: 56px;
```

Those values are device-, density-, browser-, configuration-, and version-dependent.

### Fallback without VisualViewport

If `window.visualViewport` is unavailable:

- do not crash;
- use normal CSS modal positioning;
- prefer modern dynamic viewport units (`dvh`) as the fallback where supported;
- do not invent a fake keyboard height.

---

## Completion Rule

This implementation is complete when the quick-task sheet follows the **actual visible viewport** rather than estimating keyboard height.

The key user-visible requirement is:

```text
Chrome keyboard accessory visible
            ↓
Quick-task sheet ends exactly above it
            ↓
Title + description + complete toolbar + submit remain usable
```

No separate detection of the password/address/payment bar itself is required or expected. The implementation should react to the viewport inset that browser/Android UI creates.