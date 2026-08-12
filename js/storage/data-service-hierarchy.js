Object.assign(window.AppDataService, {
  hierarchyScopeIds(parentTaskId = null, excludeTaskId = null) {
    return window.AppState.getSiblingTaskIds(parentTaskId)
      .filter(id => id !== excludeTaskId);
  },

  insertHierarchyRelative(ids, taskId, beforeTaskId = null, afterTaskId = null) {
    const ordered = [...ids].filter(id => id !== taskId);
    const beforeIndex = beforeTaskId ? ordered.indexOf(beforeTaskId) : -1;
    if (beforeIndex >= 0) {
      ordered.splice(beforeIndex, 0, taskId);
      return ordered;
    }
    const afterIndex = afterTaskId ? ordered.indexOf(afterTaskId) : -1;
    if (afterIndex >= 0) {
      ordered.splice(afterIndex + 1, 0, taskId);
      return ordered;
    }
    ordered.push(taskId);
    return ordered;
  },

  validateHierarchyLink(taskId, parentId) {
    const task = window.AppState.getTask(taskId);
    const parent = window.AppState.getTask(parentId);
    if (!task) throw new Error('Task not found.');
    if (!parent || parent.parentTaskId) throw new Error('Parent must be a normal task.');
    if (task.id === parent.id) throw new Error('A task cannot be its own parent.');
    if (!task.parentTaskId && window.AppState.hasSubtasks(task.id)) {
      throw new Error('Move or unlink this task’s subtasks first.');
    }
    return { task, parent };
  },

  applyHierarchyScope(copies, parentTaskId, orderedIds, changedIds) {
    orderedIds.forEach((id, sortOrder) => {
      const copy = copies.get(id);
      if (!copy) return;
      copy.parentTaskId = parentTaskId || null;
      copy.sortOrder = sortOrder;
      changedIds.add(id);
    });
  },

  applyHierarchyMemory(copies, changedIds) {
    changedIds.forEach(id => {
      const live = window.AppState.getTask(id);
      const copy = copies.get(id);
      if (live && copy) Object.assign(live, copy, { tags: [...(copy.tags || [])] });
    });
    window.AppState.rebuildTaskOrder();
  },

  async persistHierarchyCopies(copies, changedIds, extraWork = null, storeNames = []) {
    const S = window.TodoDbSchema.STORES;
    const stores = [...new Set([S.TASKS, ...storeNames])];
    await window.TodoDb.withTransaction(stores, 'readwrite', async tx => {
      for (const id of changedIds) {
        const copy = copies.get(id);
        if (copy) {
          await window.TodoRepositories.put(tx, S.TASKS, window.TodoStorageMappers.taskToRow(copy));
        }
      }
      if (extraWork) await extraWork(tx);
    });
  },

  linkTaskToParent(taskId, parentId) {
    return this.enqueue(async () => {
      const { task, parent } = this.validateHierarchyLink(taskId, parentId);
      if (task.parentTaskId) throw new Error('Task is already linked to a parent.');
      const copies = new Map(window.AppState.tasks.map(item => [item.id, { ...item, tags: [...(item.tags || [])] }]));
      const changed = new Set();
      const now = window.TodoStorageMappers.nowIso();
      const rootIds = this.hierarchyScopeIds(null, task.id);
      const childIds = [...this.hierarchyScopeIds(parent.id, task.id), task.id];
      const moved = copies.get(task.id);
      moved.parentTaskId = parent.id;
      moved.project = parent.project || '';
      moved.updatedAt = now;
      changed.add(task.id);
      this.applyHierarchyScope(copies, null, rootIds, changed);
      this.applyHierarchyScope(copies, parent.id, childIds, changed);
      await this.persistHierarchyCopies(copies, changed);
      this.applyHierarchyMemory(copies, changed);
      return window.AppState.getTask(task.id);
    });
  },

  unlinkTask(taskId) {
    return this.enqueue(async () => {
      const task = window.AppState.getTask(taskId);
      if (!task?.parentTaskId) throw new Error('Task is not linked to a parent.');
      const formerParentId = task.parentTaskId;
      const copies = new Map(window.AppState.tasks.map(item => [item.id, { ...item, tags: [...(item.tags || [])] }]));
      const changed = new Set();
      const now = window.TodoStorageMappers.nowIso();
      const childIds = this.hierarchyScopeIds(formerParentId, task.id);
      const rootBase = this.hierarchyScopeIds(null, task.id);
      const rootIds = this.insertHierarchyRelative(rootBase, task.id, null, formerParentId);
      const moved = copies.get(task.id);
      moved.parentTaskId = null;
      moved.updatedAt = now;
      changed.add(task.id);
      this.applyHierarchyScope(copies, formerParentId, childIds, changed);
      this.applyHierarchyScope(copies, null, rootIds, changed);
      await this.persistHierarchyCopies(copies, changed);
      this.applyHierarchyMemory(copies, changed);
      return window.AppState.getTask(task.id);
    });
  },

  commitHierarchyDrag({
    taskId,
    targetLevel = 'root',
    targetParentId = null,
    beforeTaskId = null,
    afterTaskId = null,
    sourceContext = null,
    destinationContext = null
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

      const copies = new Map(window.AppState.tasks.map(item => [item.id, { ...item, tags: [...(item.tags || [])] }]));
      const changed = new Set();
      const now = window.TodoStorageMappers.nowIso();
      const moved = copies.get(task.id);
      const sourceIds = this.hierarchyScopeIds(sourceParentId, task.id);
      const targetBase = sourceParentId === targetParentId
        ? sourceIds
        : this.hierarchyScopeIds(targetParentId, task.id);
      const targetIds = this.insertHierarchyRelative(targetBase, task.id, beforeTaskId, afterTaskId);

      moved.parentTaskId = targetParentId || null;
      if (targetLevel === 'subtask') moved.project = parent.project || '';
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
      let nextTags = [...(moved.tags || [])];
      let rootProjectChanged = false;

      if (sameGroup) {
        const key = destinationContext.groupKey ?? '';
        if (destinationContext.groupType === 'priority') {
          if (!['', 'low', 'medium', 'high'].includes(key)) throw new Error('Invalid priority destination.');
          moved.priority = key;
        } else if (destinationContext.groupType === 'date') {
          moved.dueDate = key || null;
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
      await this.persistHierarchyCopies(copies, changed, async tx => {
        if (tagChanged) {
          await window.TodoRepositories.replaceRelations(
            tx, S.TASK_TAGS, 'by_task_id', task.id,
            nextTags.map(tagId => ({ taskId: task.id, tagId }))
          );
        }
        await window.TodoRepositories.put(tx, S.APP_SETTINGS, { key: 'sortKey', value: 'custom' });
      }, extraStores);

      this.applyHierarchyMemory(copies, changed);
      window.AppState.settings.sortKey = 'custom';
      return window.AppState.getTask(task.id);
    });
  }
});
