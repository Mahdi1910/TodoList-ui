Object.assign(window.AppDataService, {
  customOrderScopeKey(parentTaskId = null) {
    return parentTaskId || '__root__';
  },

  validateCustomOrderSnapshot(orderSnapshot = []) {
    if (!Array.isArray(orderSnapshot) || !orderSnapshot.length) {
      throw new Error('Custom order snapshot is missing.');
    }

    const scopes = new Map();
    const seenTaskIds = new Set();

    orderSnapshot.forEach(rawScope => {
      const parentTaskId = rawScope?.parentTaskId || null;
      const key = this.customOrderScopeKey(parentTaskId);
      if (scopes.has(key)) throw new Error('Custom order snapshot contains a duplicate sibling scope.');
      if (!Array.isArray(rawScope?.orderedIds)) throw new Error('Custom order snapshot contains an invalid scope.');

      const localIds = new Set();
      const orderedIds = rawScope.orderedIds.map(id => {
        if (typeof id !== 'string' || !id) throw new Error('Custom order snapshot contains an invalid task ID.');
        if (localIds.has(id) || seenTaskIds.has(id)) throw new Error('Custom order snapshot contains a duplicate task.');
        const task = window.AppState.getTask(id);
        if (!task) throw new Error('Custom order snapshot references a missing task.');
        if ((task.parentTaskId || null) !== parentTaskId) {
          throw new Error('Custom order snapshot contains a task in the wrong sibling scope.');
        }
        localIds.add(id);
        seenTaskIds.add(id);
        return id;
      });

      const expectedIds = window.AppState.getSiblingTaskIds(parentTaskId);
      if (orderedIds.length !== expectedIds.length || expectedIds.some(id => !localIds.has(id))) {
        throw new Error('Custom order snapshot does not cover a complete sibling scope.');
      }

      scopes.set(key, { parentTaskId, orderedIds });
    });

    const expectedParents = [
      null,
      ...window.AppState.getRootTasks()
        .filter(task => window.AppState.hasSubtasks(task.id))
        .map(task => task.id)
    ];

    if (scopes.size !== expectedParents.length) {
      throw new Error('Custom order snapshot does not cover the complete task hierarchy.');
    }

    return expectedParents.map(parentTaskId => {
      const scope = scopes.get(this.customOrderScopeKey(parentTaskId));
      if (!scope) throw new Error('Custom order snapshot is missing a sibling scope.');
      return scope;
    });
  },

  applyCustomOrderSnapshot(copies, changedIds, orderSnapshot) {
    const normalized = this.validateCustomOrderSnapshot(orderSnapshot);
    normalized.forEach(scope => {
      scope.orderedIds.forEach((id, sortOrder) => {
        const copy = copies.get(id);
        if (!copy) throw new Error('Custom order snapshot could not be applied.');
        if (copy.sortOrder !== sortOrder) {
          copy.sortOrder = sortOrder;
          changedIds.add(id);
        }
      });
    });
    return normalized;
  },

  getCustomOrderScopeIds(normalizedSnapshot, parentTaskId = null, excludeTaskId = null) {
    const key = this.customOrderScopeKey(parentTaskId);
    const scope = normalizedSnapshot.find(item => this.customOrderScopeKey(item.parentTaskId) === key);
    if (!scope) throw new Error('Custom order snapshot is missing the requested sibling scope.');
    return scope.orderedIds.filter(id => id !== excludeTaskId);
  },

  activateCustomSort(orderSnapshot) {
    return this.enqueue(async () => {
      const copies = new Map(window.AppState.tasks.map(task => [task.id, {
        ...task,
        tags: [...(task.tags || [])],
        reminders: [...(task.reminders || [])]
      }]));
      const changed = new Set();
      this.applyCustomOrderSnapshot(copies, changed, orderSnapshot);

      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction([S.TASKS, S.APP_SETTINGS], 'readwrite', async tx => {
        for (const id of changed) {
          await window.TodoRepositories.put(tx, S.TASKS, window.TodoStorageMappers.taskToRow(copies.get(id)));
        }
        await window.TodoRepositories.put(tx, S.APP_SETTINGS, { key: 'sortKey', value: 'custom' });
      });

      if (changed.size) {
        window.AppStateSync.replaceTasks([...changed].map(id => copies.get(id)));
      }
      window.AppStateSync.setSetting('sortKey', 'custom');
      return true;
    });
  },

  commitSortedHierarchyDrag({
    taskId,
    targetLevel = 'root',
    targetParentId = null,
    beforeTaskId = null,
    afterTaskId = null,
    sourceContext = null,
    destinationContext = null,
    customOrderSnapshot = null
  } = {}) {
    return this.enqueue(async () => {
      const task = window.AppState.getTask(taskId);
      if (!task) throw new Error('Task not found.');
      const sourceParentId = task.parentTaskId || null;
      let parent = null;
      if (targetLevel === 'subtask') {
        ({ parent } = this.validateHierarchyLink(taskId, targetParentId));
      } else {
        targetParentId = null;
      }

      const copies = new Map(window.AppState.tasks.map(item => [item.id, {
        ...item,
        tags: [...(item.tags || [])]
      }]));
      const changed = new Set();
      const normalizedSnapshot = this.applyCustomOrderSnapshot(copies, changed, customOrderSnapshot);
      const getScopeIds = (parentId, excludeId = null) =>
        this.getCustomOrderScopeIds(normalizedSnapshot, parentId, excludeId);

      const now = window.TodoStorageMappers.nowIso();
      const sourceIds = getScopeIds(sourceParentId, task.id);
      const targetBase = sourceParentId === targetParentId
        ? sourceIds
        : getScopeIds(targetParentId, task.id);
      const targetIds = this.insertHierarchyRelative(targetBase, task.id, beforeTaskId, afterTaskId);
      const moved = copies.get(task.id);

      moved.parentTaskId = targetParentId || null;
      if (targetLevel === 'subtask') {
        moved.project = parent.project || '';
        if (!sourceParentId) moved.familySlotId = this.createId('slot');
      } else {
        moved.familySlotId = null;
      }
      moved.updatedAt = now;
      changed.add(task.id);

      if (sourceParentId !== targetParentId) {
        this.applyHierarchyScope(copies, sourceParentId, sourceIds, changed);
      }
      this.applyHierarchyScope(copies, targetParentId, targetIds, changed);

      const sameGroup = sourceContext && destinationContext &&
        sourceContext.groupType !== 'none' &&
        sourceContext.groupType === destinationContext.groupType &&
        sourceContext.groupKey !== destinationContext.groupKey;
      let tagChanged = false;
      let repeatStateChanged = false;
      let nextTags = [...(moved.tags || [])];
      let rootProjectChanged = false;

      if (sameGroup) {
        const key = destinationContext.groupKey ?? '';
        if (destinationContext.groupType === 'priority') {
          if (!['', 'low', 'medium', 'high'].includes(key)) throw new Error('Invalid priority destination.');
          moved.priority = key;
        } else if (destinationContext.groupType === 'date') {
          const nextDate = moved.repeat && moved.repeat.mode !== 'none'
            ? (key || window.RepeatEngine.today())
            : (key || null);
          if (moved.dueDate !== nextDate && moved.repeat && moved.repeat.mode !== 'none') {
            moved.repeatState = window.RepeatEngine.createInitialRepeatState(moved.repeat, nextDate, {
              seriesId: this.createId('series'), occurrenceNumber: 1
            });
            repeatStateChanged = true;
          }
          moved.dueDate = nextDate;
        } else if (destinationContext.groupType === 'project') {
          if (targetLevel === 'root') {
            const nextProject = this.validateProjectId(key || '');
            rootProjectChanged = nextProject !== moved.project;
            moved.project = nextProject;
          }
        } else if (destinationContext.groupType === 'tag') {
          if (key) this.validateTagIds([key]);
          nextTags = sourceContext.groupKey
            ? nextTags.filter(tagId => tagId !== sourceContext.groupKey)
            : nextTags;
          if (key && !nextTags.includes(key)) nextTags.push(key);
          moved.tags = nextTags;
          tagChanged = true;
        }
        moved.updatedAt = now;
      }

      if (targetLevel === 'subtask') moved.project = parent.project || '';
      if (targetLevel === 'root' && rootProjectChanged && window.AppState.hasSubtasks(task.id)) {
        window.AppState.getSubtasks(task.id).forEach(child => {
          const childCopy = copies.get(child.id);
          childCopy.project = moved.project;
          childCopy.updatedAt = now;
          changed.add(child.id);
        });
      }

      const S = window.TodoDbSchema.STORES;
      const extraStores = [S.APP_SETTINGS];
      if (tagChanged) extraStores.push(S.TASK_TAGS);
      if (repeatStateChanged) extraStores.push(S.TASK_REPEAT_RULES);

      await this.persistHierarchyCopies(copies, changed, async tx => {
        if (tagChanged) {
          await window.TodoRepositories.replaceRelations(
            tx, S.TASK_TAGS, 'by_task_id', task.id,
            nextTags.map(tagId => ({ taskId: task.id, tagId }))
          );
        }
        if (repeatStateChanged) {
          await window.TodoRepositories.put(
            tx, S.TASK_REPEAT_RULES,
            window.TodoStorageMappers.repeatToRow(moved.id, moved.repeat, moved.repeatState)
          );
        }
        await window.TodoRepositories.put(tx, S.APP_SETTINGS, { key: 'sortKey', value: 'custom' });
      }, extraStores);

      this.applyHierarchyMemory(copies, changed);
      window.AppStateSync.setSetting('sortKey', 'custom');
      return window.AppState.getTask(task.id);
    });
  },

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
