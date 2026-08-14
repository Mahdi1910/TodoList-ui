window.AppDataService = {
  _writeQueue: Promise.resolve(),

  enqueue(work) {
    const run = this._writeQueue.then(work, work);
    this._writeQueue = run.catch(() => {});
    return run;
  },

  whenIdle() {
    return this.enqueue(async () => undefined);
  },

  createId(prefix) {
    const value = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${value}`;
  },

  validateProjectId(projectId) {
    if (!projectId) return '';
    if (!window.AppState.getProject(projectId)) throw new Error('The selected project no longer exists.');
    return projectId;
  },

  validateTagIds(tagIds = []) {
    return [...new Set(tagIds)].filter(Boolean).map(tagId => {
      if (!window.AppState.getTag(tagId)) throw new Error('A selected tag no longer exists.');
      return tagId;
    });
  },

  resolveReminders(reminders = []) {
    const ids = [...new Set(reminders)].filter(id => id && id !== 'none');
    const builtin = new Set(window.TodoStorageMappers.BUILTIN_REMINDERS.map(item => item.id));
    const definitions = [];
    for (const id of ids) {
      if (builtin.has(id)) continue;
      const custom = window.ScheduleComponent?.customReminders?.find(item => item.id === id);
      if (custom) {
        definitions.push(window.TodoStorageMappers.customReminderToDefinition(custom));
        continue;
      }
      const match = id.match(/^custom-(\d+)d-(\d+)h-(\d+)m$/);
      if (!match) throw new Error(`Unknown reminder: ${id}`);
      const day = Number(match[1]);
      const hr = Number(match[2]);
      const min = Number(match[3]);
      const parts = [];
      if (day) parts.push(`${day}d`);
      if (hr) parts.push(`${hr}h`);
      if (min) parts.push(`${min}m`);
      definitions.push(window.TodoStorageMappers.customReminderToDefinition({
        id, day, hr, min, label: `${parts.join(' ')} before`
      }));
    }
    return { ids, definitions: definitions.filter(Boolean) };
  },

  nextRootSortOrder() {
    const values = window.AppState.getRootTasks().map(task => task.sortOrder).filter(Number.isFinite);
    return values.length ? Math.min(...values) - 1 : 0;
  },

  nextSubtaskSortOrder(parentTaskId) {
    const values = window.AppState.getSubtasks(parentTaskId).map(task => task.sortOrder).filter(Number.isFinite);
    return values.length ? Math.max(...values) + 1 : 0;
  },

  buildTask(taskData = {}, existing = null) {
    const now = window.TodoStorageMappers.nowIso();
    const parentId = existing?.parentTaskId || taskData.parentTaskId || null;
    const parent = parentId ? window.AppState.validateParentTaskId(parentId) : null;
    if (parentId && !parent) throw new Error('The parent task is invalid.');
    const title = String(taskData.title ?? existing?.title ?? '').trim();
    if (!title) throw new Error('Task title is required.');
    const project = parent
      ? (parent.project || '')
      : this.validateProjectId(taskData.project ?? existing?.project ?? '');
    const tags = this.validateTagIds(taskData.tags ?? existing?.tags ?? []);
    const reminderData = this.resolveReminders(taskData.reminders ?? existing?.reminders ?? []);
    const priority = taskData.priority ?? existing?.priority ?? '';
    if (!['', 'low', 'medium', 'high'].includes(priority)) throw new Error('Invalid task priority.');

    return {
      task: window.AppState.normalizeTask({
        id: existing?.id || this.createId('task'),
        title,
        description: String(taskData.description ?? existing?.description ?? ''),
        project,
        parentTaskId: parent?.id || null,
        priority,
        tags,
        reminders: reminderData.ids.length ? reminderData.ids : ['none'],
        repeat: taskData.repeat !== undefined ? taskData.repeat : (existing?.repeat || null),
        dueDate: taskData.dueDate !== undefined ? taskData.dueDate : (existing?.dueDate || null),
        dueTime: taskData.dueTime !== undefined ? taskData.dueTime : (existing?.dueTime || null),
        completed: existing?.completed || false,
        sortOrder: existing?.sortOrder ?? (parent
          ? this.nextSubtaskSortOrder(parent.id)
          : this.nextRootSortOrder()),
        createdAt: existing?.createdAt || now,
        updatedAt: now
      }),
      reminderDefinitions: reminderData.definitions
    };
  },

  async writeTaskAggregate(tx, task, reminderDefinitions = []) {
    const S = window.TodoDbSchema.STORES;
    const R = window.TodoRepositories;
    await R.put(tx, S.TASKS, window.TodoStorageMappers.taskToRow(task));
    await R.replaceRelations(tx, S.TASK_TAGS, 'by_task_id', task.id,
      task.tags.map(tagId => ({ taskId: task.id, tagId })));
    await R.putMany(tx, S.REMINDER_DEFINITIONS, reminderDefinitions);
    const reminderIds = task.reminders.filter(id => id && id !== 'none');
    await R.replaceRelations(tx, S.TASK_REMINDERS, 'by_task_id', task.id,
      reminderIds.map((reminderId, sortOrder) => ({ taskId: task.id, reminderId, sortOrder })));
    const repeatRow = window.TodoStorageMappers.repeatToRow(task.id, task.repeat);
    if (repeatRow) await R.put(tx, S.TASK_REPEAT_RULES, repeatRow);
    else await R.remove(tx, S.TASK_REPEAT_RULES, task.id);
  },

  createTask(taskData = {}) {
    return this.enqueue(async () => {
      const { task, reminderDefinitions } = this.buildTask(taskData);
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction([
        S.TASKS, S.TASK_TAGS, S.REMINDER_DEFINITIONS, S.TASK_REMINDERS, S.TASK_REPEAT_RULES
      ], 'readwrite', tx => this.writeTaskAggregate(tx, task, reminderDefinitions));
      window.AppState.tasks.push(task);
      window.AppState.rebuildTaskOrder();
      return task;
    });
  },

  updateTask(taskId, taskData = {}) {
    return this.enqueue(async () => {
      const existing = window.AppState.getTask(taskId);
      if (!existing) throw new Error('Task not found.');
      const { task, reminderDefinitions } = this.buildTask(taskData, existing);
      const children = !existing.parentTaskId ? window.AppState.getSubtasks(existing.id) : [];
      const projectChanged = !existing.parentTaskId && existing.project !== task.project;
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction([
        S.TASKS, S.TASK_TAGS, S.REMINDER_DEFINITIONS, S.TASK_REMINDERS, S.TASK_REPEAT_RULES
      ], 'readwrite', async tx => {
        await this.writeTaskAggregate(tx, task, reminderDefinitions);
        if (projectChanged) {
          for (const child of children) {
            await window.TodoRepositories.put(tx, S.TASKS,
              window.TodoStorageMappers.taskToRow({ ...child, project: task.project, updatedAt: task.updatedAt }));
          }
        }
      });
      const index = window.AppState.tasks.findIndex(item => item.id === task.id);
      window.AppState.tasks[index] = task;
      if (projectChanged) children.forEach(child => { child.project = task.project; child.updatedAt = task.updatedAt; });
      window.AppState.rebuildTaskOrder();
      return task;
    });
  },

  toggleTaskStatus(taskId) {
    return this.enqueue(async () => {
      const task = window.AppState.getTask(taskId);
      if (!task) throw new Error('Task not found.');
      const updated = { ...task, completed: !task.completed, updatedAt: window.TodoStorageMappers.nowIso() };
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction(S.TASKS, 'readwrite', tx =>
        window.TodoRepositories.put(tx, S.TASKS, window.TodoStorageMappers.taskToRow(updated))
      );
      task.completed = updated.completed;
      task.updatedAt = updated.updatedAt;
      return task;
    });
  },

  deleteTaskFamily(taskId) {
    return this.enqueue(async () => {
      const task = window.AppState.getTask(taskId);
      if (!task) return false;
      const ids = task.parentTaskId ? [task.id] : [task.id, ...window.AppState.getSubtaskIds(task.id)];
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction([
        S.TASKS, S.TASK_TAGS, S.TASK_REMINDERS, S.TASK_REPEAT_RULES
      ], 'readwrite', async tx => {
        for (const id of ids) {
          await window.TodoRepositories.deleteByIndex(tx, S.TASK_TAGS, 'by_task_id', id);
          await window.TodoRepositories.deleteByIndex(tx, S.TASK_REMINDERS, 'by_task_id', id);
          await window.TodoRepositories.remove(tx, S.TASK_REPEAT_RULES, id);
          await window.TodoRepositories.remove(tx, S.TASKS, id);
        }
      });
      const idSet = new Set(ids);
      window.AppState.tasks = window.AppState.tasks.filter(item => !idSet.has(item.id));
      return true;
    });
  },

  setSetting(key, value) {
    return this.enqueue(async () => {
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction(S.APP_SETTINGS, 'readwrite', tx =>
        window.TodoRepositories.put(tx, S.APP_SETTINGS, { key, value })
      );
      window.AppState.settings[key] = value;
      return value;
    });
  }
};
