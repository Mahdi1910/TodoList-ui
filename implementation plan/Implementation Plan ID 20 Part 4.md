# Implementation Plan ID 20 — Part 4 of 5

## Project/Tag Shared UI + One-Source Stable UI Cleanup (#9, #13, #14)

> **Status:** Plan only. No application code is implemented by this file.
>
> **Source plan:** `implementation plan/Implementation Plan ID 20.md`.
>
> **Prerequisites:** Parts 1–3 must be stable first.

---

# 1. Goal of This Part

This Part addresses:

```text
#9  Merge duplicated Project and Tag sidebar/modal logic
#13 Remove dead/duplicate HTML immediately replaced by JavaScript
#14 Stop runtime-upgrading permanent UI structures / establish one source of truth
```

The goal is not to redesign the product.

The goal is:

```text
one stable behavior
→ one authoritative owner
```

Dynamic data-driven DOM is still allowed. Duplicate placeholder/replacement ownership is not.

---

# 2. Non-Negotiable Invariants

Preserve:

```text
Project hierarchy
Tag hierarchy
recursive rendering
Project/Tag create/edit/delete
Add Sub-project / Add Sub-tag
parent picker
viewType
counts
current-filter repair
mouse/touch drag
indent/outdent/reparent
cycle prevention
sortOrder persistence
ID16 safe Task Project/Tag DOM rendering
ID17 Subtask Tag ordering
ModalFocusManager
Settings focus integration
Backup/Restore behavior
List/Kanban behavior
Timeline disabled state
```

Do not claim ID13 / tracker Problem #2 is solved merely because Project/Tag modal code is touched.

---

# 3. Step 1 — Consolidate Project/Tag UI Only After Persistence Ownership Is Truthful

Part 1 should already have removed persistence overrides from Project/Tag UI.

Do not build the shared core while a later patch still replaces save/delete behavior.

Recommended structure:

```text
js/components/sidebar-taxonomy-core.js
js/components/sidebar-projects.js   thin Project wrapper/config
js/components/sidebar-tags.js       thin Tag wrapper/config
```

The exact filename may differ, but ownership should remain obvious.

---

# 4. Step 2 — Define the Shared Taxonomy Core

Shared core may own behavior that is genuinely identical:

```text
recursive tree rendering
common node shell
common More-menu lifecycle
icon picker state/helpers
parent-select population via TaxonomyOrder
view-type state
common async save lifecycle
common async delete lifecycle
common refresh sequence
common modal field setup/cleanup
```

Keep domain-specific configuration explicit:

```text
entity type
Project vs Tag labels
DOM references
service command functions
entity getters
Project vs Tag dataset names
Project vs Tag CSS hooks where needed
```

Avoid replacing duplication with one huge function containing many:

```text
if project ... else tag ...
```

branches.

The shared core should reduce duplication while keeping the two domain wrappers understandable.

---

# 5. Step 3 — Preserve Taxonomy Ordering and Hierarchy Rules

Shared Project/Tag UI must continue to use:

```text
TaxonomyOrder.getChildren(...)
TaxonomyOrder.flattenTree(...)
```

where appropriate.

Preserve:

```text
recursive hierarchy
sortOrder
parent relationships
cycle prevention
valid parent-picker filtering
reorder/reparent persistence
```

Critical regression invariant from ID17:

```text
Subtask Tag picker must continue using TaxonomyOrder hierarchy/order
```

Do not accidentally reintroduce raw `AppState.tags` traversal.

---

# 6. Step 4 — Preserve Project/Tag Modal Behavior

Shared modal logic may be consolidated only where behavior is actually identical.

Preserve:

```text
create vs edit title/button state
icon selection
parent selection
view type selection
close/cancel behavior
error recovery
save disabled during persistence
focus behavior equivalent to current implementation
```

Do not remove or weaken `ModalFocusManager`.

Do not expand this Part into full modal accessibility cleanup unless explicitly required by ID13 separately.

---

# 7. Step 5 — One-Source Rule for Stable UI

Apply this rule throughout Part 4:

> A stable permanent control has one authoritative source.

Acceptable patterns:

```text
A. stable semantic markup in index.html + JS binds/updates it

or

B. component creates the stable structure and is its only owner
```

Not acceptable:

```text
static placeholder structure
→ startup
→ component discards/replaces it with another permanent structure
```

---

# 8. Step 6 — Completed Section Header

Current architecture replaces a static header element at runtime with a button.

Target:

```text
correct semantic control exists from its authoritative source
→ component only binds and updates state
```

Recommended:

```text
make the Completed header/toggle the final button in index.html
```

Then simplify `ensureCompletedSectionToggle()` so it no longer replaces permanent DOM.

Preserve:

```text
collapsed/expanded state
completed count
chevron
aria-expanded
aria-controls
empty/completed behavior
```

---

# 9. Step 7 — Task Hierarchy Action Menu

Stable Task actions such as:

```text
Add Subtask
Link to Parent
Unlink
Delete
```

must have one owner.

Audit current markup + runtime insertion/upgrading.

Choose one source and remove duplicate placeholder/insertion behavior.

Preserve:

```text
correct conditional visibility
Link/Unlink rules
family delete confirmation
keyboard/mouse behavior already supported
```

---

# 10. Step 8 — Task Project/Tag Pickers

If choices always come from current taxonomy state:

```text
remove hard-coded sample Project/Tag rows
keep an authoritative empty container
populate from AppState + TaxonomyOrder
```

Do not ship rows such as Personal/Work merely for JavaScript to immediately erase them.

Preserve ID16 safety:

```text
Project/Tag names/icons containing HTML-sensitive characters display as literal text
```

Preserve ID17 ordering for Tag menus.

---

# 11. Step 9 — Workspace Menu

Current architecture has static workspace-menu content and then `buildLayeredMenu()` replaces it.

Choose one owner.

Recommended:

```text
final semantic workspace menu markup in index.html
WorkspaceControls binds it and updates selected state
```

Then remove runtime rebuilding/replacement.

If component-owned creation is deliberately retained instead, remove the duplicate static markup.

Never keep both.

Preserve:

```text
View List/Kanban
Timeline disabled
Sort options
Group options
Sort direction behavior
settings subpanel positioning
Escape behavior
```

---

# 12. Step 10 — Repeat Ends Stable UI Ownership

Repeat Ends currently includes runtime UI/style installation behavior.

Choose one owner for its stable row/modal.

Both of these are acceptable:

```text
A. final stable markup in HTML + component binds it
B. component owns generated markup exclusively
```

But not both.

Important stylesheet rule:

```text
schedule-repeat-end.css must load normally
runtime stylesheet injection must be removed
```

Preserve Repeat Ends behavior already stabilized by Part 2.

---

# 13. Step 11 — Settings Backup/Restore Stable Section

Current Settings creates its permanent Data section through:

```text
SettingsComponent.ensureBackupUi()
```

Recommended authoritative owner:

```text
index.html
```

Put stable markup there for:

```text
Data section
Create Backup button
Restore Backup button
hidden file input
aria-live status
restore summary
Cancel
Restore and Replace
```

Then Settings should only bind/update these controls.

Remove runtime DOM construction from `ensureBackupUi()`.

Preserve exactly:

```text
inline restore confirmation
no nested restore modal
aria-live status
same-file re-selection
busy-state disabling
invalid-file handling
Settings focus-manager behavior
```

This is architecture cleanup only. Do not redesign Backup/Restore.

---

# 14. Step 12 — Audit Other Stable Runtime Replacements

Search current production code for patterns such as:

```text
innerHTML replacing permanent shell
replaceWith() on stable controls
insertAdjacentHTML for permanent controls
createElement() during init for UI that always exists
runtime stylesheet injection
```

Not every dynamic element is a problem.

Keep dynamic creation for data-dependent structures such as:

```text
Task cards
Project/Tag tree rows
Kanban columns
Task groups
calendar days
reminder choices based on current state
```

The test is:

> Is this structure inherently data-driven, or is it a permanent control that should have one stable owner?

---

# 15. Manual Project/Tag Regression

Run for both Project and Tag:

- create top-level entity.
- edit name/icon/view type.
- create child.
- create deeper hierarchy where supported.
- change parent.
- verify invalid descendant/self parent choices are excluded.
- delete parent and confirm child behavior remains as designed.
- drag reorder.
- drag indent/outdent/reparent.
- verify cycle prevention.
- refresh and confirm hierarchy/order persists.
- verify counts.
- verify current filter repairs correctly after deletion.
- verify saved viewType survives refresh.

For Tags also verify:

```text
sidebar order
main Task Tag picker order
Subtask Tag picker order
```

remain consistent after reorder/reparent + refresh.

---

# 16. Manual One-Source UI Regression

## Completed section

- collapse/expand.
- count updates.
- completed list visibility.
- List behavior.

## Task action menu

- Add Subtask.
- Link.
- Unlink.
- Delete.
- conditional controls remain correct.

## Task Project/Tag pickers

- current taxonomy appears.
- hierarchy/order correct.
- no hard-coded stale rows.
- HTML-sensitive names render safely.

## Workspace menu

- open/close.
- View selection.
- Sort/Group subpanel.
- Escape.
- mobile/desktop positioning.

## Repeat Ends

- Never.
- On Date.
- After count.
- open/close/cancel/apply.

## Backup/Restore section

- Create Backup.
- choose valid file.
- validation summary.
- cancel.
- choose same file again.
- invalid file error.
- restore confirmation UI.

---

# 17. Static Gates

For Project/Tag consolidation:

```text
common UI behavior exists once
Project wrapper remains understandable
Tag wrapper remains understandable
no persistence shadow overrides reintroduced
```

For one-source UI:

Audit at least:

```text
workspace menu
Task Project/Tag picker placeholders
Completed header
Task hierarchy action controls
Repeat Ends stylesheet/markup
Settings Backup/Restore markup
```

Each must have one authoritative owner.

---

# 18. Definition of Done for Part 4

Part 4 is complete when:

1. common Project/Tag UI logic is implemented once in a shared core.
2. Project and Tag wrappers/configuration remain explicit and readable.
3. hierarchy/order/drag behavior remains unchanged.
4. ID16 safe text rendering remains intact.
5. ID17 Tag ordering remains intact.
6. Completed header is no longer replaced by another permanent control at runtime.
7. Task hierarchy action controls have one owner.
8. Task Project/Tag picker placeholders are no longer immediately discarded duplicates.
9. workspace menu has one authoritative owner.
10. Repeat Ends stable UI/style has one owner and no runtime stylesheet injection.
11. Settings Backup/Restore permanent controls have one owner.
12. Backup/Restore behavior remains unchanged.
13. modal behavior is preserved without claiming unrelated ID13 completion.
14. Problems #9, #13 and #14 are marked complete individually only after their own verification gates pass.

---

# 19. Stop Point / Handoff to Part 5

Part 5 begins only when business/UI ownership is stable.

Required state before module conversion:

```text
ui-persistence patch gone
Repeat patches gone
reminder ownership clean
AppState write surface reduced
Project/Tag shared core stable
stable UI ownership cleaned up
Backup/Restore still passing regression
```

Then continue with:

```text
Implementation Plan ID 20 Part 5.md
```
