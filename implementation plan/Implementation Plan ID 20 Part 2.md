# Implementation Plan ID 20 — Part 2 of 5

## Make Repeat Mapping, State, Repair, and Completion Explicit (#7)

> **Status:** Plan only. No application code is implemented by this file.
>
> **Source plan:** `implementation plan/Implementation Plan ID 20.md`.
>
> **Prerequisite:** Complete and stabilize Part 1 first.

---

# 1. Goal of This Part

Remove Repeat monkey-patching and make Repeat behavior explicit in the real mapper/service owners.

This Part addresses:

```text
Priority 2 Problem #7
```

Current runtime patch files:

```text
js/storage/repeat-storage.js
js/storage/data-service-repeat.js
```

Current hidden behavior includes replacement of:

```text
TodoStorageMappers.taskToRow
TodoStorageMappers.repeatToRow
TodoStorageMappers.repeatFromRow
TodoStorageMappers.taskFromRow
AppDataService.buildTask
AppDataService.writeTaskAggregate
AppDataService.toggleTaskStatus
```

The goal is one explicit Repeat path, with no hidden later replacement.

---

# 2. Why This Part Is Isolated

Repeat is the highest-risk architecture migration because completion can create new Task occurrences and preserve historical ones.

Do not mix this Part with:

```text
ES-module conversion
Project/Tag shared-core refactor
stable-markup cleanup
large AppState restructuring
```

Those belong to later Parts.

Preserve current behavior first; simplify ownership only.

---

# 3. Durable Repeat Invariants

These fields must survive unchanged:

```text
TASKS.familySlotId
TASK_REPEAT_RULES.endType
TASK_REPEAT_RULES.endDate
TASK_REPEAT_RULES.endCount
TASK_REPEAT_RULES.seriesId
TASK_REPEAT_RULES.occurrenceNumber
TASK_REPEAT_RULES.anchorDate
TASK_REPEAT_RULES.anchorDay
TASK_REPEAT_RULES.anchorMonth
```

No IndexedDB schema/version bump is expected.

Repeat behavior to preserve:

```text
Daily
Weekly
Monthly
Yearly
Custom day/week/month/year
Repeat Ends: Never / On Date / After count
month-end anchor behavior
leap behavior
historical completed occurrences
Subtask familySlotId semantics
parent-family recurrence behavior
```

---

# 4. Step 1 — Make Base Mappers Repeat-Aware

Real owner:

```text
js/storage/mappers.js
```

Task row mapping should directly include:

```text
familySlotId
```

Repeat row mapping should directly include:

```text
mode
interval
unit
weekdays
monthDays
yearDates
endType
endDate
endCount
seriesId
occurrenceNumber
anchorDate
anchorDay
anchorMonth
```

Do not rely on `repeat-storage.js` to decorate these mappers after load.

---

# 5. Step 2 — Remove Hidden `__repeatState` Transport

Current code transports recurrence state using a non-enumerable property on the Repeat object.

Remove that hidden channel.

Use an explicit mapper contract, for example:

```text
repeatFromRow(row)
→ {
    repeat,
    repeatState
  }
```

or an equivalent explicit structure.

Hydration must pass rule/state explicitly into Task construction.

Static target:

```text
__repeatState = zero production references
```

---

# 6. Step 3 — Make `AppDataService.buildTask()` Explicitly Repeat-Aware

Preserve exact current semantics:

```text
normalize Repeat with RepeatEngine
Repeat enabled + no due date → Today
root Task familySlotId → null
Subtask familySlotId → preserve existing or create stable slot
same Repeat pattern + same due date → preserve series state
changed Repeat pattern/date → create fresh series state
Repeat removed → repeatState = null
```

Do not accidentally restart a Repeat series on an ordinary edit that does not change its recurrence pattern/date.

---

# 7. Step 4 — Make Aggregate Persistence Explicitly Repeat-Aware

The one real Task aggregate writer must own persistence for:

```text
tasks
task_tags
reminder_definitions
task_reminders
task_repeat_rules
```

It must persist Repeat rule + Repeat state explicitly.

No later file should replace `writeTaskAggregate()`.

Persistence order still follows the global rule:

```text
transaction first
→ successful commit
→ memory synchronization
```

---

# 8. Step 5 — Keep Repeat Repair as an Explicit Service Responsibility

Preserve repair behavior for legacy/current stored data:

```text
Subtask missing familySlotId
repeating Task without due date
missing seriesId
missing anchorDate
missing anchorDay
missing anchorMonth
```

Repair must persist transactionally.

Do not attach `repairRepeatState()` through late monkey-patching.

Current startup stage:

```text
DATABASE_REPAIR
```

must remain meaningful and preserve existing #12 error classification.

---

# 9. Step 6 — Make Recurrence-Aware Completion the Only Completion Path

Use one explicit completion owner/service.

There must not be:

```text
base completion
+
later Repeat replacement
```

The final completion implementation must directly handle all cases below.

---

# 10. Completion Case A — Historical Uncomplete

Current required behavior:

```text
completed historical occurrence
→ user unchecks
→ that occurrence becomes active again
→ NO extra recurrence is generated
```

This is important. Uncomplete is not the same operation as completing a repeating Task again.

---

# 11. Completion Case B — Plain Subtask

```text
active non-repeating Subtask
→ complete only that Subtask
```

No new occurrence.

No unrelated parent state change.

---

# 12. Completion Case C — Repeating Subtask

Required behavior:

```text
complete old child occurrence
→ old child becomes historical/completed
→ old child loses active Repeat ownership
→ immediate next child occurrence is created
→ same parent
→ same familySlotId
→ next recurrence state advances
```

If Repeat Ends says there is no next occurrence:

```text
complete old child
→ create no next child
```

---

# 13. Completion Case D — Plain Root Task

Required family behavior:

```text
complete root
→ complete current children as the same Task family
```

A child with Repeat must not independently spawn a recurrence merely because the parent family was completed through the root action.

Preserve current parent-driven suppression semantics.

---

# 14. Completion Case E — Repeating Root Task

Required behavior:

```text
complete old family
old root becomes historical/completed
old root loses active Repeat ownership
create immediate next root occurrence
clone logical child slots into new family
preserve each logical child's familySlotId
transfer active child Repeat ownership correctly
```

Important distinction:

```text
Task id changes per occurrence
familySlotId identifies the same logical child position across parent occurrences
```

Do not replace this with naive cloning that creates duplicate child recurrence chains.

---

# 15. Step 7 — Preserve Repeat Ends Semantics

Supported end modes:

```text
Never
On Date
After count
```

Preserve current meaning:

```text
On Date is inclusive
After N means total occurrence count semantics already used by current app
```

When recurrence ends:

```text
old occurrence/family becomes completed history
no next occurrence is generated
```

---

# 16. Step 8 — Preserve Calendar Anchor Semantics

Regression-sensitive behavior includes:

```text
monthly anchor day
month-end fallback
return to original anchor when possible
leap-year handling
yearly anchor month/day
custom weekday selection
custom month-day selection
custom yearly date selection
```

Do not rewrite RepeatEngine math unless a proven bug requires it.

This Part is mainly ownership consolidation, not recurrence redesign.

---

# 17. Step 9 — Delete Repeat Patch Files Atomically

Only after explicit parity implementation exists:

```text
remove js/storage/repeat-storage.js
remove js/storage/data-service-repeat.js
remove their bootstrap/load references
```

Static gate:

```text
repeat-storage.js       gone
data-service-repeat.js  gone
__repeatState           zero refs
one Task mapper path
one Repeat mapper path
one Task build path
one aggregate write path
one Repeat repair path
one completion path
```

Never delete the patch first and then attempt to recreate behavior from memory.

---

# 18. Manual Repeat Regression Matrix

This Part requires deeper manual testing than the others.

## Plain Task

- Complete.
- Uncomplete.
- Confirm no recurrence.
- Refresh.

## Preset repeating root

- Daily.
- Weekly.
- Monthly.
- Yearly.
- Complete each and confirm exactly one next occurrence.
- Refresh.

## Custom repeating root

- Every N days.
- Every N weeks + selected weekdays.
- Every N months + selected dates.
- Every N years + selected dates.

## Repeating Subtask

- Complete directly.
- Confirm next occurrence stays under same parent.
- Confirm `familySlotId` remains stable.
- Confirm old occurrence remains historical.

## Parent/child combinations

Test combinations of:

```text
repeating root + plain child
repeating root + repeating child
plain root + repeating child
multiple child slots
```

Ensure parent completion does not create duplicate child recurrence chains.

## Repeat Ends

- Never.
- On Date, including final inclusive date.
- After 1.
- After N.

## Historical undo

- Complete a repeating occurrence.
- Find the old completed occurrence.
- Uncomplete it.
- Confirm no second future occurrence is generated.

## Calendar anchors

- Month end, such as 31st → shorter month → later 31st month.
- February/leap behavior.
- Custom monthly selected dates.
- Custom yearly selected dates.

## Persistence

Refresh after important cases and confirm:

```text
seriesId
occurrenceNumber
anchor state
familySlotId
Repeat Ends fields
```

behave consistently.

---

# 19. Backup/Restore Regression for Repeat

Because Backup/Restore stores raw durable rows, verify Part 2 does not change or lose Repeat data.

Create data containing:

```text
repeating root
repeating Subtask
Repeat Ends
current recurrence state
familySlotId
```

Then:

1. Create Backup.
2. Change/advance Repeat data.
3. Restore Backup.
4. Confirm the exact backed-up occurrence/series state returns.
5. Confirm the series does not restart at occurrence 1 unless that was actually the backed-up state.

No Backup format redesign is required.

---

# 20. Definition of Done for Part 2

Part 2 is complete when:

1. `mappers.js` directly understands `familySlotId` and full Repeat persistence.
2. Repeat rule/state mapping is explicit.
3. `__repeatState` is removed.
4. `buildTask()` is explicitly Repeat-aware.
5. aggregate persistence is explicitly Repeat-aware.
6. Repeat repair has a real owner.
7. exactly one recurrence-aware completion implementation exists.
8. repeating root family behavior is preserved.
9. repeating Subtask behavior is preserved.
10. Repeat Ends semantics are preserved.
11. calendar anchor behavior is preserved.
12. `repeat-storage.js` is deleted.
13. `data-service-repeat.js` is deleted.
14. their loader references are removed.
15. full manual Repeat regression passes.
16. Backup/Restore preserves Repeat state.
17. Problem #7 is marked complete only after manual verification.

---

# 21. Stop Point / Handoff to Part 3

Do not continue until Repeat is stable.

Part 3 begins with:

```text
one explicit Repeat path
no Repeat monkey-patching
no ui-persistence runtime patch layer
```

Then continue with:

```text
Implementation Plan ID 20 Part 3.md
```
