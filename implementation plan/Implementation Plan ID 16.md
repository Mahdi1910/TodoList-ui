# Implementation Plan ID 16 — Safe DOM Rendering for Task Project/Tag Menus

## Goal

Fix Problem #3 from `problem is need to be fixed.md`:

> Task Project/Tag menu rows currently use `innerHTML` with user-controlled Project/Tag names/icons, while the helper named `escapeText()` does not actually produce HTML-safe output.

The fix must make Project and Tag values render strictly as **text**, never as HTML, while preserving the current menu appearance, selection behavior, hierarchy ordering, keyboard navigation, and accessibility attributes.

This is a focused safety/correctness cleanup. It does **not** redesign the Task editor, taxonomy hierarchy, menu UX, Project/Tag persistence, or modal focus.

No application implementation is part of this plan commit.

---

# 1. Confirmed Current Problem

Relevant files:

```text
js/components/task-menus.js
js/components/task-taxonomy-menu-order.js
```

The base Task menu renderer currently builds Project rows with code conceptually equivalent to:

```js
item.innerHTML = `<span class="project-icon">${project.icon}</span> ${this.escapeText(project.name)}`;
```

and Tag rows with:

```js
item.innerHTML = `<span class="check-box-icon"></span><span>${this.escapeText(tag.icon)} ${this.escapeText(tag.name)}</span>`;
```

`task-taxonomy-menu-order.js` repeats the same pattern in the runtime ordering override.

The helper in `task-menus.js` is currently:

```js
escapeText(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.textContent;
}
```

This returns plain text, not an HTML-escaped string.

Example:

```text
Project name = <b>Work</b>
```

`escapeText()` returns:

```text
<b>Work</b>
```

and placing that result inside `innerHTML` allows the browser to interpret it as markup.

Therefore the current helper name suggests safety that it does not actually provide.

---

# 2. Required Safety Invariant

For Project/Tag values shown in Task menus:

```text
Project name
Project icon
Tag name
Tag icon
```

must always be inserted using DOM text APIs such as:

```js
node.textContent = value;
```

or equivalent safe DOM creation.

Required rule:

> No user-controlled Project/Tag display value may be concatenated into `innerHTML`.

The browser must never parse these values as markup.

Example input:

```text
<b>Work</b>
```

Required visible output:

```text
<b>Work</b>
```

including the literal angle brackets, not bold formatting.

---

# 3. Prefer DOM Construction, Not String Escaping

Do **not** solve this by inventing another custom HTML escaping function unless there is a concrete need.

Preferred approach:

```js
const icon = document.createElement('span');
icon.className = 'project-icon';
icon.textContent = project.icon;

const label = document.createElement('span');
label.textContent = project.name;

item.append(icon, label);
```

For Tags:

```js
const check = document.createElement('span');
check.className = 'check-box-icon';

const label = document.createElement('span');
label.textContent = `${tag.icon} ${tag.name}`;

item.append(check, label);
```

This makes the safety property structural rather than dependent on remembering to escape every string correctly.

---

# 4. Preserve Existing DOM/CSS Contract

The safe rewrite must preserve the classes and structure relied on by current CSS and behavior.

## Project row

Preserve at minimum:

```text
.context-menu-item
.project-icon
```

and the existing dataset / ARIA state:

```text
data-project
role="option"
tabindex="-1"
aria-selected
```

The Project icon and Project name must still appear in the same visual order.

If a new label span is introduced for the Project name, ensure it does not change spacing, wrapping, or menu sizing unexpectedly.

## Tag row

Preserve:

```text
.context-menu-item.multiselect
.check-box-icon
```

and:

```text
data-tag
role="option"
tabindex="-1"
aria-selected
```

Keep the existing hierarchy indentation based on:

```js
item.style.paddingLeft = `${12 + depth * 16}px`;
```

unless the current taxonomy menu ordering module already supplies equivalent depth handling.

No CSS change should be necessary unless the DOM-safe rewrite exposes a concrete spacing regression.

---

# 5. Remove the Unsafe Duplicate Implementation From Both Paths

There are currently two render paths:

```text
TaskMenuMethods.renderProjectMenu / renderTagMenu
TaskTaxonomyMenuOrderMethods.renderProjectMenu / renderTagMenu
```

The second path overrides the first at runtime to use taxonomy ordering.

Do **not** fix only the final override while leaving the base implementation unsafe.

Why:

- future load-order changes could expose the unsafe base implementation again;
- a developer reading the base file could copy the unsafe pattern into new code;
- the repository should not contain two contradictory render implementations.

The final implementation should ensure both paths are safe, preferably by sharing row-construction helpers.

---

# 6. Recommended Shared Menu-Item Builders

Add small focused helper methods to `TaskMenuMethods`, for example:

```text
createProjectMenuItem(project)
createTagMenuItem(tag, depth)
```

or similarly named helpers.

Responsibilities:

## `createProjectMenuItem(project)`

- create `.context-menu-item`;
- set `data-project`;
- set selected class;
- create Project icon span using `textContent`;
- create Project name text node/span using `textContent`;
- set `role`, `tabindex`, `aria-selected`;
- return the completed DOM element.

## `createTagMenuItem(tag, depth)`

- create `.context-menu-item.multiselect`;
- set `data-tag`;
- set selected class;
- set hierarchy padding;
- create static `.check-box-icon` span;
- create visible Tag icon/name using `textContent`;
- set `role`, `tabindex`, `aria-selected`;
- return the completed DOM element.

Then both the base renderer and taxonomy-order renderer can reuse these builders.

This keeps the safety rule in one place and reduces duplicate DOM-building logic.

---

# 7. Keep Ordering Responsibilities Separate From Rendering Safety

`task-taxonomy-menu-order.js` exists to make Project/Tag menus follow the recursive taxonomy ordering system.

Preserve that purpose.

Recommended structure:

```text
task-menus.js
    → owns safe DOM row construction
    → owns generic menu interaction

task-taxonomy-menu-order.js
    → owns which Projects/Tags are visited and in what hierarchy order
    → calls the safe row builders
```

Do not make `task-taxonomy-menu-order.js` duplicate the full HTML/DOM construction again.

For Projects, preserve:

```text
TaxonomyOrder.flattenTree('project')
```

For Tags, preserve:

```text
TaxonomyOrder.getChildren('tag', parentId)
```

and recursive depth traversal.

This plan must not regress the hierarchy ordering introduced by Project/Tag drag work.

---

# 8. `escapeText()` Cleanup

After removing unsafe `innerHTML` usage from Project/Tag row rendering, review whether `TaskMenuMethods.escapeText()` is used anywhere else.

If it is no longer needed:

```text
remove it
```

Do not keep a misleading helper named `escapeText()` that simply returns `textContent` unchanged.

If another legitimate caller still needs it, either:

- replace that caller with DOM/text construction as well; or
- rename/redefine the helper so its contract is truthful.

The preferred result is no custom HTML escaping helper for this menu path.

---

# 9. Clearing the Menu Is Not the Same Problem

Code such as:

```js
this.menuProject.innerHTML = '';
this.menuTags.innerHTML = '';
```

contains no user-controlled value and is not itself an injection risk.

It may remain if desired.

`replaceChildren()` is also acceptable:

```js
this.menuProject.replaceChildren();
```

but converting the clear operation is optional and should not expand the scope of this fix.

The important rule is that **dynamic Project/Tag content must not enter through `innerHTML`.**

---

# 10. Preserve Existing Menu Interaction

The fix must not change:

```text
Project single-select behavior
Tag multi-select behavior
selected CSS classes
aria-selected synchronization
Arrow Up / Arrow Down navigation
Home / End navigation
Enter / Space selection
Escape return-to-trigger behavior
menu open/close logic
```

No event listeners should depend on the old `innerHTML` structure beyond the existing `.context-menu-item` container and static class hooks.

After the DOM rewrite, verify:

```text
item.dataset.project
item.dataset.tag
item.closest('.context-menu-item')
```

continue to work exactly as before.

---

# 11. Preserve Taxonomy Hierarchy Ordering

The safe rendering fix must not regress the ordering behavior introduced by `task-taxonomy-menu-order.js`.

Required examples:

```text
Project A
    Project B
Project C
```

must remain in taxonomy order in the Project picker.

For Tags:

```text
Tag A
    Tag B
        Tag C
Tag D
```

must keep recursive order and existing indentation.

This problem is about HTML interpretation, not sorting.

---

# 12. Treat Icons as Text Too

Even though Project/Tag icons are normally chosen from the application's icon picker, do not assume they are always safe strings.

Possible future sources include:

```text
imported backup data
manually edited IndexedDB data
future free-text icon support
legacy/corrupt records
```

Therefore both:

```text
project.icon
tag.icon
```

must also use `textContent` rather than string interpolation into `innerHTML`.

This makes the safety boundary complete.

---

# 13. Manual Acceptance Matrix

Use literal text values that would be interpreted as HTML if the fix were incomplete.

## Project names

Create or temporarily test Projects named:

```text
<b>Work</b>
Work & Personal
"Quoted" <Project>
<img src=x onerror=alert(1)>
```

Expected:

- each value appears literally as text;
- no bold formatting from `<b>`;
- `<Project>` remains visible text;
- no image element is created;
- no event handler executes;
- menu selection still works.

## Tag names

Use the same strings for Tags.

Expected identical text-only behavior.

## Icons

If test data can be manipulated safely, use an icon-like value containing markup characters, e.g.:

```text
<>
```

Expected literal text only.

Do not deliberately execute arbitrary scripts as part of normal testing; visual DOM inspection is sufficient to confirm the value is rendered as text.

---

# 14. DOM Inspection Acceptance

For a Project named:

```text
<b>Work</b>
```

inspect the menu row.

Expected DOM conceptually:

```html
<div class="context-menu-item">
  <span class="project-icon">●</span>
  <span>&lt;b&gt;Work&lt;/b&gt;</span>
</div>
```

or equivalent text-node structure.

There must **not** be a real nested `<b>` element created from the Project name.

For malicious-looking `<img ...>` text, there must be no real `<img>` element created inside the menu row.

---

# 15. Static Source Acceptance

After implementation, search the relevant render files.

Required:

- no `item.innerHTML = ... project.name ...`;
- no `item.innerHTML = ... tag.name ...`;
- no Project/Tag icon interpolated into `innerHTML`;
- no unsafe duplicate implementation remaining in either menu renderer;
- no misleading `escapeText()` left solely to support these rows.

It is acceptable for unrelated static markup elsewhere in the application to use `innerHTML`; this plan is not a repository-wide ban.

---

# 16. Expected Files

Primary files:

```text
js/components/task-menus.js
js/components/task-taxonomy-menu-order.js
```

Likely responsibilities:

### `task-menus.js`

- add safe Project/Tag row builders;
- migrate base render methods to them;
- remove/clean up misleading `escapeText()` if unused.

### `task-taxonomy-menu-order.js`

- preserve taxonomy ordering;
- reuse safe row builders instead of rebuilding menu rows with `innerHTML`.

Expected no changes to:

```text
js/storage/*
js/state.js
js/taxonomy-order.js
css/*
index.html
```

unless a concrete integration issue is discovered.

No database schema/version change is needed.

---

# 17. Out of Scope

Do not expand this implementation into:

```text
modal focus lifecycle (Implementation Plan ID 13)
Subtask Tag ordering (separate tracker Problem #4)
Project/Tag sidebar refactor
full application innerHTML removal
CSP changes
HTML sanitizer libraries
framework migration
menu visual redesign
```

If the implementation audit finds the exact same unsafe dynamic-value pattern in a directly adjacent Project/Tag picker, record it separately rather than silently expanding scope unless the change is trivial and uses the same safe builder.

---

# 18. Tracker Update Rule

Problem #3 in:

```text
problem is need to be fixed.md
```

must remain:

```text
[ ]
```

while this is only a plan.

After implementation and verification of the text-only acceptance cases, update it to:

```text
[x]
```

and add:

```text
Implementation Plan: implementation plan/Implementation Plan ID 16.md
```

Do not mark it complete merely because code was written.

---

# 19. Final Definition of Done

Problem #3 is complete when all of the following are true:

- Task Project menu uses safe DOM/text construction for dynamic Project values;
- Task Tag menu uses safe DOM/text construction for dynamic Tag values;
- taxonomy-ordered overrides reuse the same safe construction path;
- Project/Tag names containing HTML-looking text display literally;
- Project/Tag icons are also treated as text;
- no dynamic Project/Tag value is concatenated into `innerHTML` in these menu paths;
- selection, hierarchy order, indentation, keyboard navigation, and ARIA state still work;
- no persistence or schema behavior changed;
- Problem #3 is manually verified and then marked complete in the permanent tracker.
