Object.assign(window.AppDataService, {
  commitTaskDrag({ taskId, orderedVisibleIds = [], sourceContext = null, destination = null } = {}) {
    return this.enqueue(async () => {
      const task = window.AppState.getTask(taskId);
      if (!task || task.parentTaskId) throw new Error('Only root tasks can be reordered.');

      const currentRootIds = window.AppState.getRootTaskIds();
      const visibleIds = [...new Set(orderedVisibleIds)].filter(id => currentRootIds.includes(id));
      const visibleSet = new Set(visibleIds);
      let visibleIndex = 0;
      const nextRootIds = currentRootIds.map(id => visibleSet.has(id) ? visibleIds[visibleIndex++] : id);
      const orderById = new Map(nextRootIds.map((id, index) => [id, index]));
      const rootCopies = new Map(window.AppState.getRootTasks().map(item => [item.id, {
        ...item, sortOrder: orderById.get(item.id) ?? item.sortOrder
      }]));

      const sameGroup = sourceContext && destination &&
        sourceContext.groupType !== 'none' && sourceContext.groupType === destination.groupType;
      const metadataChanged = Boolean(sameGroup && sourceContext.groupKey !== destination.groupKey);
      const moved = rootCopies.get(taskId);
      const key = destination?.groupKey ?? '';
      let nextTags = [...task.tags];
      let projectChanged = false;

      if (metadataChanged) {
        if (destination.groupType === 'priority') {
          if (!['', 'low', 'medium', 'high'].includes(key)) throw new Error('Invalid priority destination.');
          moved.priority = key;
        } else if (destination.groupType === 'date') {
          moved.dueDate = key || null;
        } else if (destination.groupType === 'project') {
          moved.project = this.validateProjectId(key || '');
          projectChanged = moved.project !== task.project;
        } else if (destination.groupType === 'tag') {
          if (key) this.validateTagIds([key]);
          nextTags = sourceContext.groupKey ? nextTags.filter(tag => tag !== sourceContext.groupKey) : nextTags;
          if (key && !nextTags.includes(key)) nextTags.push(key);
          moved.tags = nextTags;
        }
        moved.updatedAt = window.TodoStorageMappers.nowIso();
      }

      const updatedChildren = projectChanged
        ? window.AppState.getSubtasks(taskId).map(child => ({
          ...child, project: moved.project, updatedAt: moved.updatedAt
        }))
        : [];
      const S = window.TodoDbSchema.STORES;
      const stores = [S.TASKS, S.APP_SETTINGS];
      if (metadataChanged && destination.groupType === 'tag') stores.push(S.TASK_TAGS);

      await window.TodoDb.withTransaction(stores, 'readwrite', async tx => {
        for (const root of rootCopies.values()) {
          await window.TodoRepositories.put(tx, S.TASKS, window.TodoStorageMappers.taskToRow(root));
        }
        for (const child of updatedChildren) {
          await window.TodoRepositories.put(tx, S.TASKS, window.TodoStorageMappers.taskToRow(child));
        }
        if (metadataChanged && destination.groupType === 'tag') {
          await window.TodoRepositories.replaceRelations(tx, S.TASK_TAGS, 'by_task_id', taskId,
            nextTags.map(tagId => ({ taskId, tagId })));
        }
        await window.TodoRepositories.put(tx, S.APP_SETTINGS, { key: 'sortKey', value: 'custom' });
      });

      window.AppStateSync.replaceTasks([...rootCopies.values(), ...updatedChildren]);
      window.AppStateSync.setSetting('sortKey', 'custom');
      return true;
    });
  }
});
