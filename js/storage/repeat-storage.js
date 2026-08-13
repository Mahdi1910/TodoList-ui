(() => {
  const M = window.TodoStorageMappers;
  const engine = () => window.RepeatEngine;

  function createId(prefix) {
    const value = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${value}`;
  }

  const baseTaskToRow = M.taskToRow;
  M.taskToRow = function repeatAwareTaskToRow(task) {
    return { ...baseTaskToRow(task), familySlotId: task.familySlotId || null };
  };

  const baseRepeatToRow = M.repeatToRow;
  M.repeatToRow = function repeatAwareRepeatToRow(taskId, repeat, repeatState = null) {
    const normalized = engine().normalizeRepeatRule(repeat);
    if (normalized.mode === 'none') return null;
    const row = baseRepeatToRow(taskId, normalized);
    if (!row) return null;
    const state = repeatState || {};
    row.endType = normalized.end.type;
    row.endDate = normalized.end.date;
    row.endCount = normalized.end.count;
    row.seriesId = state.seriesId || createId('series');
    row.occurrenceNumber = Math.max(1, Number(state.occurrenceNumber) || 1);
    row.anchorDate = state.anchorDate || null;
    row.anchorDay = Number.isInteger(state.anchorDay) ? state.anchorDay : null;
    row.anchorMonth = Number.isInteger(state.anchorMonth) ? state.anchorMonth : null;
    return row;
  };

  const baseRepeatFromRow = M.repeatFromRow;
  M.repeatFromRow = function repeatAwareRepeatFromRow(row) {
    if (!row) return null;
    const legacy = baseRepeatFromRow(row);
    const repeat = engine().normalizeRepeatRule({
      ...legacy,
      end: {
        type: row.endType || legacy?.custom?.endType || 'never',
        date: row.endDate || legacy?.custom?.endDate || null,
        count: row.endCount ?? legacy?.custom?.endCount ?? null
      }
    });
    const state = {
      seriesId: row.seriesId || createId('series'),
      occurrenceNumber: Math.max(1, Number(row.occurrenceNumber) || 1),
      anchorDate: row.anchorDate || null,
      anchorDay: Number.isInteger(row.anchorDay) ? row.anchorDay : null,
      anchorMonth: Number.isInteger(row.anchorMonth) ? row.anchorMonth : null,
      _needsRepair: !row.seriesId || !row.anchorDate || !Number.isInteger(row.anchorDay) || !Number.isInteger(row.anchorMonth)
    };
    Object.defineProperty(repeat, '__repeatState', { value: state, enumerable: false, configurable: true });
    return repeat;
  };

  const baseTaskFromRow = M.taskFromRow;
  M.taskFromRow = function repeatAwareTaskFromRow(row, tags = [], reminders = [], repeat = null) {
    const task = baseTaskFromRow(row, tags, reminders, repeat);
    task.familySlotId = row.familySlotId || null;
    if (repeat && repeat.mode !== 'none') {
      const stored = repeat.__repeatState || {};
      if (!task.dueDate) task.dueDate = engine().today();
      task.repeat = engine().normalizeRepeatRule(repeat);
      task.repeatState = engine().createInitialRepeatState(task.repeat, task.dueDate, stored);
      task.repeatState.seriesId = stored.seriesId || createId('series');
      task.repeatState._needsRepair = Boolean(stored._needsRepair || !row.dueDate);
    } else {
      task.repeat = null;
      task.repeatState = null;
    }
    return task;
  };

  const service = window.AppDataService;
  const baseBuildTask = service.buildTask;
  service.buildTask = function repeatAwareBuildTask(taskData = {}, existing = null) {
    const input = { ...taskData };
    const selectedRepeat = input.repeat !== undefined ? input.repeat : existing?.repeat;
    const normalizedRepeat = engine().normalizeRepeatRule(selectedRepeat);
    const selectedDate = input.dueDate !== undefined ? input.dueDate : existing?.dueDate;
    if (normalizedRepeat.mode !== 'none' && !selectedDate) input.dueDate = engine().today();

    const result = baseBuildTask.call(this, input, existing);
    const task = result.task;
    task.repeat = normalizedRepeat.mode === 'none' ? null : normalizedRepeat;
    task.familySlotId = task.parentTaskId
      ? (existing?.familySlotId || taskData.familySlotId || createId('slot'))
      : null;

    if (!task.repeat) {
      task.repeatState = null;
      return result;
    }

    const preserve = existing?.repeat && existing?.repeatState &&
      engine().samePattern(existing.repeat, task.repeat) && existing.dueDate === task.dueDate;
    if (preserve) {
      task.repeatState = { ...existing.repeatState, _needsRepair: false };
    } else {
      const previous = existing?.repeatState || {};
      task.repeatState = engine().createInitialRepeatState(task.repeat, task.dueDate, {
        seriesId: previous.seriesId || createId('series'),
        occurrenceNumber: previous.occurrenceNumber || 1
      });
      task.repeatState.seriesId ||= createId('series');
    }
    return result;
  };

  service.writeTaskAggregate = async function repeatAwareWriteTaskAggregate(tx, task, reminderDefinitions = []) {
    const S = window.TodoDbSchema.STORES;
    const R = window.TodoRepositories;
    await R.put(tx, S.TASKS, M.taskToRow(task));
    await R.replaceRelations(tx, S.TASK_TAGS, 'by_task_id', task.id,
      (task.tags || []).map(tagId => ({ taskId: task.id, tagId })));
    await R.putMany(tx, S.REMINDER_DEFINITIONS, reminderDefinitions);
    const reminderIds = (task.reminders || []).filter(id => id && id !== 'none');
    await R.replaceRelations(tx, S.TASK_REMINDERS, 'by_task_id', task.id,
      reminderIds.map((reminderId, sortOrder) => ({ taskId: task.id, reminderId, sortOrder })));
    const repeatRow = M.repeatToRow(task.id, task.repeat, task.repeatState);
    if (repeatRow) await R.put(tx, S.TASK_REPEAT_RULES, repeatRow);
    else await R.remove(tx, S.TASK_REPEAT_RULES, task.id);
  };

  service.repairRepeatState = async function repairRepeatState() {
    const changed = [];
    for (const task of window.AppState.tasks) {
      let dirty = false;
      if (task.parentTaskId && !task.familySlotId) {
        task.familySlotId = createId('slot');
        dirty = true;
      }
      if (task.repeat && task.repeat.mode !== 'none') {
        if (!task.dueDate) { task.dueDate = engine().today(); dirty = true; }
        const previous = task.repeatState || {};
        if (!previous.seriesId || previous._needsRepair) {
          task.repeatState = engine().createInitialRepeatState(task.repeat, task.dueDate, previous);
          task.repeatState.seriesId = previous.seriesId || createId('series');
          dirty = true;
        }
        delete task.repeatState._needsRepair;
      }
      if (dirty) changed.push(task);
    }
    if (!changed.length) return 0;
    const S = window.TodoDbSchema.STORES;
    await window.TodoDb.withTransaction([S.TASKS, S.TASK_REPEAT_RULES], 'readwrite', async tx => {
      for (const task of changed) {
        await window.TodoRepositories.put(tx, S.TASKS, M.taskToRow(task));
        const row = M.repeatToRow(task.id, task.repeat, task.repeatState);
        if (row) await window.TodoRepositories.put(tx, S.TASK_REPEAT_RULES, row);
      }
    });
    return changed.length;
  };
})();
