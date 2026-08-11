window.TodoStorageMappers = (() => {
  const BUILTIN_REMINDERS = Object.freeze([
    { id: 'on_time', label: 'On time', minutesBefore: 0 },
    { id: '5_min', label: '5m before', minutesBefore: 5 },
    { id: '10_min', label: '10m before', minutesBefore: 10 },
    { id: '15_min', label: '15m before', minutesBefore: 15 },
    { id: '30_min', label: '30m before', minutesBefore: 30 },
    { id: '1_hour', label: '1h before', minutesBefore: 60 },
    { id: '2_hour', label: '2h before', minutesBefore: 120 },
    { id: '3_hour', label: '3h before', minutesBefore: 180 },
    { id: '1_day', label: '1d before', minutesBefore: 1440 }
  ]);

  function nowIso() {
    return new Date().toISOString();
  }

  function taskToRow(task) {
    return {
      id: task.id,
      title: String(task.title || '').trim(),
      description: typeof task.description === 'string' ? task.description : '',
      projectId: task.project || null,
      parentTaskId: task.parentTaskId || null,
      priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : '',
      completed: task.completed ? 1 : 0,
      dueDate: task.dueDate || null,
      dueTime: task.dueTime || null,
      sortOrder: Number.isFinite(task.sortOrder) ? task.sortOrder : 0,
      createdAt: task.createdAt || nowIso(),
      updatedAt: task.updatedAt || nowIso()
    };
  }

  function taskFromRow(row, tags = [], reminders = [], repeat = null) {
    return {
      id: row.id,
      title: row.title,
      description: row.description || '',
      project: row.projectId || '',
      parentTaskId: row.parentTaskId || null,
      priority: row.priority || '',
      completed: Boolean(row.completed),
      dueDate: row.dueDate || null,
      dueTime: row.dueTime || null,
      tags: [...tags],
      reminders: reminders.length ? [...reminders] : [],
      repeat,
      sortOrder: Number.isFinite(row.sortOrder) ? row.sortOrder : 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt || row.createdAt
    };
  }

  function repeatToRow(taskId, repeat) {
    if (!repeat || repeat.mode === 'none') return null;
    const custom = repeat.custom || {};
    return {
      taskId,
      mode: repeat.mode,
      interval: Number.isFinite(custom.interval) ? custom.interval : 1,
      unit: custom.unit || 'day',
      weekdays: Array.isArray(custom.weekdays) ? [...custom.weekdays] : [],
      monthDays: Array.isArray(custom.monthDays) ? [...custom.monthDays] : [],
      yearDates: custom.yearDates && typeof custom.yearDates === 'object'
        ? JSON.parse(JSON.stringify(custom.yearDates)) : {},
      endType: custom.endType || null,
      endDate: custom.endDate || null,
      endCount: Number.isFinite(custom.endCount) ? custom.endCount : null,
      updatedAt: nowIso()
    };
  }

  function repeatFromRow(row) {
    if (!row) return null;
    return {
      mode: row.mode,
      custom: {
        interval: Number.isFinite(row.interval) ? row.interval : 1,
        unit: row.unit || 'day',
        weekdays: Array.isArray(row.weekdays) ? [...row.weekdays] : [],
        monthDays: Array.isArray(row.monthDays) ? [...row.monthDays] : [],
        yearDates: row.yearDates && typeof row.yearDates === 'object'
          ? JSON.parse(JSON.stringify(row.yearDates)) : {},
        endType: row.endType || null,
        endDate: row.endDate || null,
        endCount: Number.isFinite(row.endCount) ? row.endCount : null
      }
    };
  }

  function builtinDefinitions() {
    const createdAt = nowIso();
    return BUILTIN_REMINDERS.map(item => ({
      ...item,
      type: 'builtin',
      isBuiltin: 1,
      createdAt
    }));
  }

  function customReminderToDefinition(custom) {
    if (!custom?.id) return null;
    const minutesBefore = Number(custom.day || 0) * 1440 + Number(custom.hr || 0) * 60 + Number(custom.min || 0);
    return {
      id: custom.id,
      label: custom.label || custom.id,
      type: 'custom',
      minutesBefore,
      isBuiltin: 0,
      createdAt: custom.createdAt || nowIso()
    };
  }

  function definitionToCustomReminder(definition) {
    if (!definition || definition.isBuiltin) return null;
    let total = Math.max(0, Number(definition.minutesBefore) || 0);
    const day = Math.floor(total / 1440);
    total -= day * 1440;
    const hr = Math.floor(total / 60);
    const min = total - hr * 60;
    return { id: definition.id, label: definition.label, day, hr, min };
  }

  return {
    BUILTIN_REMINDERS,
    nowIso,
    taskToRow,
    taskFromRow,
    repeatToRow,
    repeatFromRow,
    builtinDefinitions,
    customReminderToDefinition,
    definitionToCustomReminder
  };
})();
