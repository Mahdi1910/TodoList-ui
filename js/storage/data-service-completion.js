(() => {
  const service = window.AppDataService;
  const engine = () => window.RepeatEngine;
  function copyTask(task, overrides = {}) {
    return { ...task, tags: [...(task.tags || [])], reminders: [...(task.reminders || [])], repeat: task.repeat ? engine().clone(task.repeat) : null, repeatState: task.repeatState ? { ...task.repeatState } : null, ...overrides };
  }
  function activeRepeat(task) { return Boolean(task?.repeat && task.repeat.mode !== 'none'); }
  function nextState(task) {
    const current = engine().createInitialRepeatState(task.repeat, task.dueDate, task.repeatState || {});
    return { ...current, seriesId: current.seriesId || service.createId('series'), occurrenceNumber: Math.max(1, Number(current.occurrenceNumber) || 1) + 1 };
  }
  function replaceMemory(copies, additions = []) {
    const byId = new Map(copies.map(task => [task.id, task]));
    window.AppState.tasks = window.AppState.tasks.map(task => byId.get(task.id) || task);
    window.AppState.tasks.push(...additions);
    window.AppState.rebuildTaskOrder();
  }
  async function persistTaskRows(tasks) {
    const S = window.TodoDbSchema.STORES;
    await window.TodoDb.withTransaction(S.TASKS, 'readwrite', async tx => {
      for (const task of tasks) await window.TodoRepositories.put(tx, S.TASKS, window.TodoStorageMappers.taskToRow(task));
    });
  }
  async function persistAggregates(tasks) {
    const S = window.TodoDbSchema.STORES;
    await window.TodoDb.withTransaction([S.TASKS, S.TASK_TAGS, S.REMINDER_DEFINITIONS, S.TASK_REMINDERS, S.TASK_REPEAT_RULES], 'readwrite', async tx => {
      for (const task of tasks) await service.writeTaskAggregate(tx, task, []);
    });
  }
  function chooseSlotTemplates(children) {
    const groups = new Map();
    children.forEach(child => {
      const slot = child.familySlotId || service.createId('slot'); child.familySlotId = slot;
      if (!groups.has(slot)) groups.set(slot, []); groups.get(slot).push(child);
    });
    const score = task => activeRepeat(task) ? 3 : (!task.completed ? 2 : 1);
    return [...groups.values()].map(items => [...items].sort((a, b) => {
      const difference = score(b) - score(a); if (difference) return difference;
      return String(b.dueDate || b.createdAt || '').localeCompare(String(a.dueDate || a.createdAt || ''));
    })[0]);
  }
  async function uncompleteTask(task) {
    const updated = copyTask(task, { completed: false, updatedAt: window.TodoStorageMappers.nowIso() });
    await persistTaskRows([updated]); replaceMemory([updated]); return updated;
  }
  async function completePlainSubtask(task) {
    const updated = copyTask(task, { completed: true, updatedAt: window.TodoStorageMappers.nowIso() });
    await persistTaskRows([updated]); replaceMemory([updated]); return updated;
  }
  async function completeRepeatingSubtask(task) {
    const now = window.TodoStorageMappers.nowIso();
    const slot = task.familySlotId || service.createId('slot');
    const nextDate = engine().calculateNextOccurrence(task.dueDate, task.repeat, task.repeatState || {});
    const oldTask = copyTask(task, { completed: true, familySlotId: slot, repeat: null, repeatState: null, updatedAt: now });
    if (!nextDate) { await persistAggregates([oldTask]); replaceMemory([oldTask]); return oldTask; }
    const nextTask = copyTask(task, { id: service.createId('task'), completed: false, familySlotId: slot, dueDate: nextDate, repeat: engine().clone(task.repeat), repeatState: nextState(task), createdAt: now, updatedAt: now });
    await persistAggregates([oldTask, nextTask]); replaceMemory([oldTask], [nextTask]); return nextTask;
  }
  async function completeNonRepeatingRoot(root) {
    const now = window.TodoStorageMappers.nowIso();
    const family = [root, ...window.AppState.getSubtasks(root.id)].map(task => copyTask(task, { completed: true, updatedAt: now }));
    await persistTaskRows(family); replaceMemory(family); return family[0];
  }
  async function finishRepeatingRootWithoutNext(root, children) {
    const now = window.TodoStorageMappers.nowIso();
    const oldRoot = copyTask(root, { completed: true, repeat: null, repeatState: null, updatedAt: now });
    const oldChildren = children.map(child => copyTask(child, { completed: true, familySlotId: child.familySlotId || service.createId('slot'), updatedAt: now }));
    await persistAggregates([oldRoot, ...oldChildren]); replaceMemory([oldRoot, ...oldChildren]); return oldRoot;
  }
  async function completeRepeatingRoot(root) {
    const children = window.AppState.getSubtasks(root.id).map(child => copyTask(child));
    const nextDate = engine().calculateNextOccurrence(root.dueDate, root.repeat, root.repeatState || {});
    if (!nextDate) return finishRepeatingRootWithoutNext(root, children);
    const now = window.TodoStorageMappers.nowIso();
    const oldRoot = copyTask(root, { completed: true, repeat: null, repeatState: null, updatedAt: now });
    const nextRoot = copyTask(root, { id: service.createId('task'), parentTaskId: null, familySlotId: null, completed: false, dueDate: nextDate, repeat: engine().clone(root.repeat), repeatState: nextState(root), createdAt: now, updatedAt: now });
    const templates = chooseSlotTemplates(children); const templateIds = new Set(templates.map(task => task.id));
    const oldChildren = children.map(child => {
      const transferRepeat = templateIds.has(child.id) && activeRepeat(child);
      return copyTask(child, { completed: true, repeat: transferRepeat ? null : child.repeat, repeatState: transferRepeat ? null : child.repeatState, updatedAt: now });
    });
    const nextChildren = templates.map(template => copyTask(template, { id: service.createId('task'), parentTaskId: nextRoot.id, project: nextRoot.project || '', familySlotId: template.familySlotId, completed: false, repeat: activeRepeat(template) ? engine().clone(template.repeat) : null, repeatState: activeRepeat(template) ? { ...template.repeatState } : null, createdAt: now, updatedAt: now }));
    await persistAggregates([oldRoot, ...oldChildren, nextRoot, ...nextChildren]); replaceMemory([oldRoot, ...oldChildren], [nextRoot, ...nextChildren]); return nextRoot;
  }
  service.toggleTaskStatus = function toggleTaskStatus(taskId) {
    return this.enqueue(async () => {
      const task = window.AppState.getTask(taskId); if (!task) throw new Error('Task not found.');
      if (task.completed) return uncompleteTask(task);
      if (task.parentTaskId) return activeRepeat(task) ? completeRepeatingSubtask(task) : completePlainSubtask(task);
      return activeRepeat(task) ? completeRepeatingRoot(task) : completeNonRepeatingRoot(task);
    });
  };
})();
