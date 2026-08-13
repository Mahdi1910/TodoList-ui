# Implementation Plan ID 9 — Real Repeat Task Recurrence

## Goal

Turn the existing Repeat UI/storage feature into a real completion-driven recurrence system while preserving the application's one-level parent/subtask model and the user's exact completion semantics.

This plan covers:

- real repeat execution for `Daily`, `Weekly`, `Monthly`, `Yearly`, and `Custom`;
- immediate creation of the next occurrence when a repeating task is directly completed;
- repeat ownership transferring forward instead of remaining on historical direct occurrences;
- parent-family completion rules that override child repeat execution;
- correct parent/subtask regeneration behavior;
- undo behavior that never steals a Repeat rule back from a newer occurrence;
- monthly/yearly invalid-day fallback to the last valid day without changing the intended anchor day;
- a new `Ends` control with `Never`, `On date`, and `After` modes;
- `After` count wheel from 1–200;
- normal calendar UI for `On date`;
- automatic Today date when Repeat is enabled without a date;
- strict Custom Repeat validation;
- durable IndexedDB state required to make recurrence deterministic.

No Timeline work, reminder notification delivery, or unrelated UI redesign is included.

---

## 1. Current-State Findings

### Repeat UI already exists

The Schedule dialog currently supports:

```text
None
Daily
Weekly
Monthly
Yearly
Custom...
```

Custom Repeat already supports:

```text
Every 1–99 days
Every 1–99 weeks + selected weekdays
Every 1–99 months + selected month days
Every 1–99 years + selected dates across Jan–Dec
```

The existing wheel engine is reusable for the new End mode/count controls.

### Repeat persistence already exists

`task_repeat_rules` is keyed by `taskId` and currently stores:

```text
mode
interval
unit
weekdays[]
monthDays[]
yearDates{}
endType
endDate
endCount
updatedAt
```

However, `endType/endDate/endCount` are not exposed by the current UI and no recurrence execution state exists.

### Completion currently has no family/recurrence semantics

The persistent checkbox path calls one generic `AppDataService.toggleTaskStatus(taskId)` method.

That method currently only toggles one `tasks.completed` value. It does not:

- complete a root's subtasks;
- distinguish direct completion from parent-caused completion;
- generate another occurrence;
- transfer a Repeat rule;
- clone a repeating parent family;
- keep child Repeat rules on a non-repeating parent cascade;
- track recurrence counts/anchors.

### Repeat is currently configuration only

Hydration restores repeat rows into `task.repeat`, but startup does not execute recurrence. This plan intentionally keeps recurrence **completion-driven** rather than adding midnight/background generation.

---

## 2. Product Rules — Source of Truth

### 2.1 Recurrence is triggered immediately by completion

Example:

```text
A — Aug 13 — Daily
```

When A is directly completed, immediately persist:

```text
Completed:
A — Aug 13 — no Repeat rule

Active:
A — Aug 14 — Daily
```

Do not wait for Aug 14 to arrive.

### 2.2 Exactly one direct series occurrence owns the active Repeat rule

For a directly repeating task:

```text
Aug 13 A ☑  Repeat: none
Aug 14 A ☐  Repeat: Daily
```

Completing Aug 14 produces Aug 15 and removes Repeat ownership from Aug 14.

Historical directly completed occurrences must not retain the Repeat rule that was transferred forward.

### 2.3 Undo does not rewind Repeat ownership

If:

```text
Aug 13 A ☑  Repeat: none
Aug 14 A ☐  Repeat: Daily
```

and Aug 13 is uncompleted:

```text
Aug 13 A ☐  Repeat: none
Aug 14 A ☐  Repeat: Daily
```

Undo only changes `completed` on the selected historical task. It never deletes the newer occurrence and never moves the Repeat rule backward.

### 2.4 Root completion controls the whole family

When the user directly completes a root/main task, that action owns the family behavior.

Child Repeat rules do **not** independently execute during a parent-caused completion.

#### Non-repeating parent + repeating child

```text
A  Repeat: None
└─ B  Repeat: Daily
```

Directly complete A:

```text
A ☑
└─ B ☑  Repeat: Daily remains stored on B
```

Create nothing new.

Important:

- B's Daily rule does not fire because B was not directly completed;
- because no new B was created to receive the rule, B keeps its own Repeat rule while completed;
- if B is later uncompleted directly, B still has Daily.

This is intentionally different from a directly completed repeating B, where Repeat transfers to B-next and old B loses it.

### 2.5 Repeating parent regenerates a new family

```text
A  Daily
└─ B  Repeat: None
```

Directly complete A:

```text
Old family:
A-1 ☑
└─ B-1 ☑

Immediately create:
A-2 ☐  tomorrow  Daily
└─ B-2 ☐
```

All generated tasks receive new IDs. `B-2.parentTaskId = A-2.id`.

The old family remains intact as history.

### 2.6 Parent and child Repeat rules are independently meaningful, but parent completion suppresses child execution

Example:

```text
A  Daily
└─ B  Every 2 days
```

Directly complete B:

```text
B-old ☑  loses Repeat
B-next ☐  +2 days  Every 2 days
```

A is unaffected.

Directly complete A instead:

- execute A's Daily rule only;
- mark the old family completed;
- generate the next A family;
- do not calculate a separate `+2 day` occurrence for B as a side effect of A completion.

If B's Repeat configuration is part of the child template and a new parent family is generated, transfer that child Repeat ownership to B's corresponding clone **without incrementing B's recurrence occurrence count**, because B itself did not execute a recurrence.

If the parent does not generate a next family, child Repeat ownership stays on the completed child.

### 2.7 Undo is task-local and never executes recurrence

For any completed task:

```text
completed true → false
```

must never generate another occurrence.

The task keeps whatever Repeat ownership is currently stored on that exact task:

- directly completed historical repeat occurrence: usually no Repeat, because it transferred forward;
- child completed only by a non-repeating parent cascade: keeps its Repeat rule;
- old child whose Repeat rule was transferred into a cloned next parent family: no Repeat.

Do not attempt to rewind a recurrence series during undo.

### 2.8 Parent completion cascade is one transaction

A root false→true completion must atomically update the root and its old family and, if applicable, create the next family.

Do not implement this as repeated calls to the normal child completion command, because that would incorrectly trigger child recurrence.

---

## 3. Recurrence Date Rules

Use local calendar dates, not UTC date arithmetic. Reuse the existing noon-local parsing strategy to avoid DST/timezone date drift.

### 3.1 Daily preset

```text
current due date + 1 calendar day
```

### 3.2 Weekly preset

```text
current due date + 7 calendar days
```

This preserves the original weekday.

### 3.3 Monthly preset

Preserve the intended original day-of-month.

Example:

```text
Jan 30
→ Feb 28/29
→ Mar 30
→ Apr 30
```

Algorithm:

```text
desiredDay = original monthly anchor day
actualDay = min(desiredDay, lastDayOfTargetMonth)
```

A February fallback must not permanently change the anchor from 30 to 28/29.

### 3.4 Yearly preset

Preserve original month + intended day.

Example:

```text
Feb 29, 2028
→ Feb 28, 2029
→ Feb 28, 2030
→ Feb 28, 2031
→ Feb 29, 2032
```

The original February 29 anchor remains intact.

### 3.5 Custom every N days

```text
current due date + N calendar days
```

### 3.6 Custom every N weeks

- weekdays must contain at least one selected day;
- the start/anchor date defines the active week cycle;
- selected weekdays are evaluated in calendar order inside each active week;
- after the selected weekdays in the current active week are exhausted, move to the next active week separated by `interval` weeks.

Example:

```text
Every 2 weeks
Mon, Wed, Fri
```

produces all selected weekdays in one active week, skips the next week, then repeats in the following active week.

### 3.7 Custom every N months

- `monthDays` must contain at least one day;
- active months are separated by `interval` months from the anchor month;
- selected day numbers are evaluated in ascending order inside each active month;
- each intended day clamps to the last available day of that target month;
- if multiple intended days clamp to the same actual date, de-duplicate that actual occurrence.

Example:

```text
Days 15 and 30
February 2027
→ Feb 15
→ Feb 28

March
→ Mar 15
→ Mar 30
```

### 3.8 Custom every N years

- `yearDates` must contain at least one selected month/day;
- active years are separated by `interval` years from the anchor year;
- evaluate selected month/day pairs in calendar order;
- invalid days clamp to the last valid day of that month;
- de-duplicate actual dates when multiple intended selections clamp to the same date.

### 3.9 Pure calculator API

Add a pure recurrence module, preferably:

```text
js/repeat/repeat-engine.js
```

Responsibilities:

```text
normalizeRepeatRule()
validateRepeatRule()
createInitialRepeatState()
calculateNextOccurrence()
calculatePresetNextDate()
calculateCustomNextDate()
clampDayToMonth()
canGenerateNextOccurrence()
```

Keep DOM, IndexedDB, and AppState out of this module so the date rules are independently auditable.

---

## 4. Repeat End UI

### 4.1 Main Repeat page

Keep the existing list:

```text
None
Daily
Weekly
Monthly
Yearly
Custom...
```

When `Repeat = None`:

```text
Ends row hidden
```

When any repeat mode is active:

```text
None
Daily
Weekly
Monthly
Yearly
Custom...

Ends                         Never  >
```

Use the concise label `Ends`.

The row is separate from the repeat preset radiogroup and appears directly under `Custom...`.

### 4.2 Repeat Ends modal

Add a secondary modal consistent with the existing Custom Repeat/Custom Reminder layers.

Suggested visible structure:

```text
Repeat Ends

End by

      Never
    [ On date ]
      After

<conditional content>

Cancel            Done
```

The first selector is one existing-style vertical wheel with exactly:

```text
Never
On date
After
```

Default is `Never`.

### 4.3 Never

No extra control is shown.

Persist:

```text
endType = "never"
endDate = null
endCount = null
```

### 4.4 On date

Do **not** use Year/Month/Day rollers.

Show the normal calendar-style date picker already used in the Schedule Date tab:

```text
month/year header
previous / next month
weekday header
calendar grid
```

The end date is inclusive.

Example:

```text
Daily
Ends: Aug 20
```

Completing Aug 19 may create Aug 20.
Completing Aug 20 must not create Aug 21.

Persist:

```text
endType = "date"
endDate = "YYYY-MM-DD"
endCount = null
```

Reject an end date earlier than the current/starting occurrence date.

### 4.5 After

Show one vertical number wheel using the existing wheel engine:

```text
1
2
3
...
200
```

with a `times`/`occurrences` label.

Persist:

```text
endType = "count"
endDate = null
endCount = 1..200
```

Interpret `After N` as **N total occurrences including the current first/current occurrence**.

Therefore:

```text
After 1
```

means the current occurrence is the only occurrence; when completed, no next task is generated.

### 4.6 End draft/cancel behavior

Opening the Ends modal must snapshot the current ending configuration.

- `Cancel`/X restores the snapshot.
- `Done` commits the ending draft to the Schedule dialog's repeat draft.
- the main Schedule `Apply` remains the final commit into the task editor.

---

## 5. Repeat UI Data Model

Normalize the user-facing Repeat object to separate recurrence pattern from ending policy:

```js
{
  mode: "daily" | "weekly" | "monthly" | "yearly" | "custom" | "none",
  custom: {
    interval: 1,
    unit: "day" | "week" | "month" | "year",
    weekdays: [],
    monthDays: [],
    yearDates: {}
  },
  end: {
    type: "never" | "date" | "count",
    date: null,
    count: null
  }
}
```

`end` applies to every repeat mode, not only Custom.

For backward compatibility, the mapper must still read existing flat row fields and any legacy `custom.endType/endDate/endCount` values if encountered.

---

## 6. Automatic Date Anchoring

The existing Schedule Apply already assigns Today when a time exists without a date.

Extend that rule:

```text
if dueTime exists and dueDate is empty
→ dueDate = Today

if Repeat mode != None and dueDate is empty
→ dueDate = Today
```

This must happen before repeat state/anchor metadata is created.

Existing repeat tasks loaded from IndexedDB with no due date should be repaired to Today once, then persisted, so they can participate in the real recurrence engine.

---

## 7. Custom Repeat Validation

Do not allow incomplete Custom rules.

### Day

Valid with only:

```text
interval 1–99
unit = day
```

### Week

Require:

```text
weekdays.length >= 1
```

### Month

Require:

```text
monthDays.length >= 1
```

### Year

Require at least one selected month/day across `yearDates`.

### Validation UX

- keep the Custom Repeat modal open when invalid;
- show a small inline validation message/accessible status near the relevant selector;
- do not silently invent missing weekdays/month days/year dates;
- main Schedule Apply must also call repeat validation as a final guard.

---

## 8. Durable Repeat Execution State

The current repeat row contains only the user rule. Add internal execution metadata to `task_repeat_rules`.

Recommended fields:

```text
taskId                    existing key
seriesId                  stable UUID/string for this repeat lineage
occurrenceNumber          current occurrence number; starts at 1
anchorDate                original/re-anchored YYYY-MM-DD
anchorDay                 intended day-of-month when relevant
anchorMonth               intended month when relevant (0–11)
mode / interval / ...     existing rule fields
endType
endDate
endCount
updatedAt
```

These extra properties do not require a new IndexedDB object store because IndexedDB rows are schemaless. Avoid a database-version bump unless implementation discovers a real need for a new index/store.

### Repeat transfer rules

#### Direct repeat execution

Old row:

```text
taskId = old task
occurrenceNumber = N
```

After successful next generation:

```text
remove repeat row from old task
create repeat row for new task
same seriesId
occurrenceNumber = N + 1
same anchor metadata
same user rule/end policy
```

#### Parent-family clone transfers a child's rule without executing it

If child B has a Repeat rule and A's recurrence creates a new family:

```text
B-old repeat row
→ move to B-new
```

but:

```text
B occurrenceNumber does NOT increment
B anchor does NOT advance
```

because B did not execute its own recurrence.

#### Suppressed child with no next family

If parent completion creates no new family:

```text
keep child repeat row on completed child
```

This is required for the non-repeating-parent + repeating-child undo behavior.

---

## 9. Logical Child Slot Identity

A repeating child can create multiple historical child occurrences under the same parent. Later, if the parent itself repeats, cloning every historical child would duplicate the family incorrectly.

Add an internal logical slot identifier to subtask rows, e.g.:

```text
familySlotId
```

Rules:

- new ordinary subtask: generate one stable `familySlotId`;
- direct child recurrence: next child preserves the same `familySlotId`;
- parent-family cloning: corresponding child clone preserves the same `familySlotId`;
- link root → subtask: assign a new `familySlotId`;
- subtask → root unlink/outdent: clear `familySlotId`;
- subtask reparent A → C: preserve its existing globally unique `familySlotId`;
- old existing subtasks missing the field: repair deterministically/persistently (for example derive an initial stable slot from the current task ID).

### Selecting one child template per slot during parent recurrence

For each `familySlotId` under the old parent, clone exactly one representative:

1. prefer the task that currently owns a repeat row for that slot;
2. otherwise use the latest occurrence for that slot by stable task order/creation metadata.

This prevents:

```text
B-old completed
B-current active
```

from both being cloned into the next A family.

When the next family is created, every chosen child clone is reset to:

```text
completed = false
new task ID
parentTaskId = new parent ID
```

Child title/description/project-inherited state/priority/tags/dueTime/reminders and existing schedule fields are copied as task information. Parent completion must **not** run the child's own recurrence date calculator.

Relative child-date shifting is not introduced in this plan; child scheduling remains independently stored as it is today.

---

## 10. Completion Command Architecture

Add a dedicated service module, preferably:

```text
js/storage/data-service-repeat.js
```

Load it after the base data service and before `ui-persistence-bindings.js`.

Do not grow `data-service.js` into a large all-purpose file.

### Public command

Replace the checkbox's business operation with one recurrence-aware command such as:

```text
AppDataService.setTaskCompletion(taskId, completed)
```

or:

```text
AppDataService.toggleTaskCompletion(taskId)
```

Internally branch by transition and hierarchy:

```text
completed true → false
    → undo only

root false → true
    → completeRootFamily()

subtask false → true
    → completeSubtaskDirectly()
```

### 10.1 Undo path

- update only the selected task's completed state to false;
- keep whatever Repeat row is currently attached to it;
- do not generate/delete another occurrence;
- do not rewind series state.

### 10.2 Direct non-repeating subtask completion

- mark selected subtask completed;
- create nothing.

### 10.3 Direct repeating subtask completion

In one transaction:

1. calculate next child occurrence;
2. mark old child completed;
3. if end policy allows next occurrence:
   - create new child with new ID under the same parent;
   - copy normal task data;
   - set calculated next due date;
   - reset completed=false;
   - preserve `familySlotId`;
   - transfer repeat row/state to new child and increment occurrenceNumber;
   - remove repeat row from old child;
4. if recurrence has ended:
   - mark old child completed;
   - remove old repeat row;
   - create no next child.

### 10.4 Direct root completion — parent has Repeat None

In one transaction:

- mark root completed;
- mark every direct child under that root completed;
- create no next root/family;
- do not execute any child recurrence;
- keep every child's existing Repeat row on that completed child.

### 10.5 Direct root completion — parent repeats and next occurrence is allowed

In one transaction:

1. calculate next root due date;
2. identify one child template representative per `familySlotId`;
3. mark old root and all of its old direct children completed;
4. create new root with new ID, calculated due date, completed=false;
5. transfer root Repeat row/state to new root and increment root occurrenceNumber;
6. remove root Repeat row from old root;
7. clone one new child per logical child slot using new task IDs and new parent ID;
8. reset new children completed=false;
9. for each chosen child with an owned Repeat row:
   - transfer that exact child Repeat row/state to its clone;
   - do not increment child occurrenceNumber;
   - do not calculate a child next date;
   - remove the transferred rule from the old child;
10. old historical children without transferred rules remain unchanged except completed=true.

### 10.6 Direct root completion — parent Repeat ends on this occurrence

If the root end policy disallows another root occurrence:

- complete old root and all old children;
- remove the root's Repeat row because its series is finished;
- create no new family;
- do not execute child recurrence;
- because no child clone exists to receive a child's Repeat rule, keep each child's own Repeat row on that completed child.

This intentionally follows the same child behavior as a non-repeating parent completion.

---

## 11. Atomic Persistence

Every completion operation that can affect recurrence/family structure must be one IndexedDB transaction across the required stores:

```text
tasks
task_tags
task_reminders
task_repeat_rules
```

Include reminder definitions only if implementation actually needs to create missing definitions; cloned tasks should normally reuse existing reminder IDs.

Transaction-first rule:

```text
build copies/new rows
→ write entire transaction
→ wait for commit
→ mutate AppState
→ rerender
```

If the transaction fails:

- no partial completed family;
- no orphan generated occurrence;
- no repeat row left on the wrong task;
- AppState remains at the previously committed state;
- reuse existing nonblocking persistence error reporting.

---

## 12. Mapper / Hydration Changes

Update `mappers.js` so the user-facing repeat config and internal repeat state round-trip separately and existing rows remain readable.

Recommended AppState task shape:

```text
repeat       user-visible rule or null
repeatState  internal execution metadata or null
familySlotId internal subtask slot ID or null
```

### Existing repeat-row repair

During hydration, repair old repeat rows that lack the new metadata:

```text
seriesId          create stable new ID
occurrenceNumber  1
anchorDate         task.dueDate or Today
anchorDay          derived from anchorDate
anchorMonth        derived from anchorDate
endType            existing value or "never"
endDate            existing/null
endCount           existing/null
```

If an old repeating task has no due date:

```text
set task.dueDate = Today
anchorDate = Today
```

Persist the repair once.

### Existing subtasks

If a subtask has no `familySlotId`, assign and persist one during repair.

Do not clear the database and do not reseed existing users.

---

## 13. Editing an Existing Repeat Owner

### Unrelated task edits

Changing title/description/priority/tags/project/time/reminders without changing the recurrence pattern must preserve:

```text
seriesId
occurrenceNumber
anchorDate / anchorDay / anchorMonth
```

### Change only Ends policy

Preserve the existing series and occurrence count.

If a new end count is already reached, the current task remains the owner until it is completed; that completion creates no next occurrence.

### Change recurrence pattern or recurrence anchor date

Treat the current task as the first/current occurrence of a newly anchored sequence:

```text
new seriesId
occurrenceNumber = 1
anchorDate = current dueDate
```

This avoids carrying a monthly/yearly anchor from an incompatible old rule.

### Change Repeat to None

Remove that task's repeat row/state. Do not delete historical tasks.

---

## 14. UI Wiring

### `index.html`

Add:

- the conditional `Ends` row beneath `Custom...`;
- a new Repeat Ends modal;
- one `End by` wheel;
- one conditional calendar container for `On date`;
- one conditional 1–200 wheel for `After`;
- any new static component script such as `schedule-repeat-end.js` before `schedule.js`.

### `schedule.js`

Add DOM references and draft/snapshot state for:

```text
Ends row
Ends summary
Repeat Ends modal
end type wheel
end date calendar
end count wheel
```

Update Escape focus trapping so the Ends modal is treated like the existing nested schedule modals.

### `schedule-repeat.js`

Add:

- default end normalization (`Never`);
- show/hide Ends row based on repeat mode;
- Ends summary text;
- Custom rule validation;
- final Repeat validation helper.

### New `schedule-repeat-end.js`

Prefer a separate module to keep source files small.

Responsibilities:

```text
open/close Repeat Ends modal
snapshot/cancel behavior
end type selection
conditional UI
end date calendar rendering/selection
end count selection
submit End settings
summary formatting
```

For `On date`, reuse the visual/calendar conventions from `schedule-date.js`; do not introduce Year/Month/Day rollers.

### `schedule-wheels.js`

Reuse/generalize the current wheel engine for:

```text
repeatEndType: Never / On date / After
repeatEndCount: 1..200
```

Avoid a second independent wheel implementation.

### `schedule-events.js`

Bind:

- Ends row click;
- Repeat Ends form Done/Cancel/X;
- end calendar navigation;
- conditional selection events.

### `schedule-repeat.css`

Extend existing Repeat modal styles for:

- Ends row;
- Ends modal;
- conditional end sections;
- end-count label;
- validation message.

Keep the existing Apple/minimal dark visual language.

---

## 15. Hierarchy Integration

Update hierarchy persistence so `familySlotId` remains correct when task level changes:

### Link root → parent

```text
parentTaskId = selected parent
familySlotId = new stable slot ID
```

### Drag root → subtask

Same as Link: assign a new slot ID.

### Reparent subtask A → C

Preserve existing globally unique `familySlotId`.

### Unlink/outdent subtask → root

```text
parentTaskId = null
familySlotId = null
```

This is required so future parent-family recurrence can identify one logical child template per slot.

Do not otherwise change ID 7/8 drag behavior.

---

## 16. Rendering Rules

Existing task cards already render a Repeat badge from `task.repeat`.

The recurrence transaction must therefore update AppState so rendering naturally shows:

```text
old direct occurrence  → no Repeat badge
new current occurrence → Repeat badge
```

For a child completed only by a non-repeating parent cascade:

```text
completed child → Repeat badge remains
```

because the Repeat rule intentionally remains on that child.

Do not create a second visual "series" badge in this plan.

---

## 17. Files Expected to Change

### New files

Prefer:

```text
js/repeat/repeat-engine.js
js/components/schedule-repeat-end.js
js/storage/data-service-repeat.js
```

Keep each source file under the project's general ~300-line modularity convention.

### Existing files likely changed

```text
index.html
css/components/schedule-repeat.css
js/state.js
js/task-relations.js                 only if normalization helpers need slot support
js/components/schedule.js
js/components/schedule-events.js
js/components/schedule-wheels.js
js/components/schedule-repeat.js
js/components/schedule-date.js       only if extracting a safely reusable calendar helper is cleaner
js/components/subtask-editor.js      schedule payload compatibility only if needed
js/components/tasks.js / renderer    no redesign; checkbox wiring is overridden by persistence binding
js/storage/db-schema.js              only if implementation proves a schema/index change is necessary
js/storage/mappers.js
js/storage/persistence.js
js/storage/data-service.js           minimal integration only
js/storage/data-service-hierarchy.js
js/storage/ui-persistence-bindings.js
js/app.js
```

Avoid putting the recurrence engine directly into `ui-persistence-bindings.js`.

---

## 18. Manual Acceptance Matrix

No browser/headless automation. Validate manually on the real browser/phone.

### A. Basic direct recurrence

1. Create A for Today, Daily.
2. Complete A.
3. Old A is completed and has no Repeat badge.
4. New A appears immediately with Tomorrow date and Daily.
5. Refresh; both states persist.
6. Undo old A; it becomes active without Daily; new Tomorrow A remains Daily.

### B. Every N days

1. A due Aug 13, Every 2 days.
2. Complete A.
3. New owner is immediately Aug 15.

### C. Monthly fallback

1. A due Jan 30, Monthly.
2. Complete Jan occurrence.
3. Next is Feb 28/29.
4. Complete February occurrence.
5. Next is Mar 30, proving the intended day remained 30.

### D. Yearly leap fallback

1. A due Feb 29 in a leap year, Yearly.
2. Next non-leap occurrence is Feb 28.
3. Continue through next leap year and verify it returns to Feb 29.

### E. Custom validation

1. Every 2 weeks with no weekday → Done blocked.
2. Select Monday → valid.
3. Every 2 months with no day → blocked.
4. Select day 30 → valid.
5. Every 2 years with no annual date → blocked.
6. Select at least one date → valid.

### F. End — Never

1. Select Daily.
2. Ends row appears and defaults to Never.
3. Complete multiple occurrences; recurrence continues.

### G. End — On date

1. Select Daily, Ends → On date.
2. Verify normal calendar UI, not rollers.
3. Set Aug 20.
4. Completing Aug 19 creates Aug 20.
5. Completing Aug 20 creates nothing and removes Repeat ownership from the completed Aug 20 task.

### H. End — After

1. Select Daily, Ends → After → 3.
2. Current task is occurrence 1.
3. Complete it → occurrence 2.
4. Complete occurrence 2 → occurrence 3.
5. Complete occurrence 3 → no occurrence 4.

### I. Auto Today

1. Create task with Repeat Daily but no date.
2. Apply schedule.
3. Due date becomes Today.
4. Same verification for setting Time with no Date.

### J. Non-repeating parent + repeating child

```text
A None
└─ B Daily
```

1. Complete A.
2. A and B become completed.
3. No new A or B is created.
4. Completed B still has Daily.
5. Undo B directly.
6. B is restored and still has Daily.
7. Directly complete restored B.
8. Now B's own Daily recurrence executes and a new B is generated.

### K. Repeating parent + non-repeating child

```text
A Daily
└─ B None
```

1. Complete A.
2. Old A/B family is completed.
3. New A appears immediately for Tomorrow.
4. New B is cloned under new A with completed=false.
5. IDs and parent linkage are new/correct.

### L. Repeating parent + repeating child

```text
A Daily
└─ B Every 2 days
```

1. Directly complete B first.
2. B's own next occurrence is +2 days and keeps the same family slot.
3. A is unaffected.
4. Then complete A.
5. A's Daily rule alone determines the new parent date.
6. No extra child recurrence is triggered by A completion.
7. Exactly one logical B slot is cloned into the new A family, not every historical B occurrence.
8. B's Repeat ownership transfers to its corresponding new-family clone without incrementing B's recurrence count.

### M. Parent recurrence reaches its end

1. A Daily with child B Daily.
2. Configure A so current A is its final allowed occurrence.
3. Complete A.
4. Old family becomes completed.
5. No new A family is created.
6. B's Daily row remains on completed B because there was no child clone to receive it.
7. Undo B; Daily is still present.

### N. Link/Unlink/drag hierarchy compatibility

1. Link root B under A; verify B receives a logical family slot.
2. Reparent B from A to C; slot remains stable.
3. Unlink B to root; slot clears.
4. Drag root→subtask and subtask→root and repeat the same verification.
5. Existing drag ordering behavior remains unchanged.

### O. Persistence failure safety

Verify by code review/static transaction paths that a failed recurrence transaction cannot leave:

```text
old owner completed + no new owner + repeat row deleted
```

or any partially cloned parent family.

---

## 19. Explicit Non-Goals

Do not implement:

- midnight/background occurrence creation;
- startup catch-up generation;
- browser notification delivery;
- Timeline;
- nested sub-subtasks;
- relative child due-date offsets when a parent repeats;
- deletion/editing of historical series as a bulk operation;
- new recurrence analytics/history UI.

The engine advances only when the relevant task is directly completed or when a repeating parent completion creates its next family.

---

## 20. Implementation Order

Implement in this order so each layer has a clear contract:

1. Normalize Repeat/end data shape and define pure validation/date helpers.
2. Add internal repeat execution metadata + `familySlotId` mapping/repair.
3. Implement the pure recurrence engine and date fallback tests by static reasoning/manual fixtures.
4. Add the Ends UI and strict Custom validation.
5. Add auto-Today behavior for Repeat-without-date.
6. Add recurrence-aware transactional completion service.
7. Wire checkbox persistence to the new completion command.
8. Integrate `familySlotId` with Link/Unlink/drag hierarchy changes.
9. Verify hydration/backward compatibility for existing repeat rows.
10. Perform the manual acceptance matrix on phone/browser.

Do not start by patching the checkbox UI. The storage model, date engine, and transaction semantics must be established first so completion cannot produce partial or contradictory recurrence state.
