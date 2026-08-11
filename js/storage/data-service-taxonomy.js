Object.assign(window.AppDataService, {
  nextEntitySortOrder(items = []) {
    const values = items.map(item => item.sortOrder).filter(Number.isFinite);
    return values.length ? Math.max(...values) + 1 : 0;
  },

  createProject(projectData = {}) {
    return this.enqueue(async () => {
      const name = String(projectData.name || '').trim();
      if (!name) throw new Error('Project name is required.');
      const parentId = projectData.parentId || null;
      if (parentId && !window.AppState.getProject(parentId)) throw new Error('Parent project not found.');
      const now = window.TodoStorageMappers.nowIso();
      const project = {
        id: this.createId('project'), name, icon: projectData.icon || '●',
        viewType: projectData.viewType === 'kanban' ? 'kanban' : 'list', parentId,
        sortOrder: this.nextEntitySortOrder(window.AppState.projects), createdAt: now, updatedAt: now
      };
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction(S.PROJECTS, 'readwrite', tx =>
        window.TodoRepositories.add(tx, S.PROJECTS, project)
      );
      window.AppState.projects.push(project);
      return project;
    });
  },

  updateProject(projectId, projectData = {}) {
    return this.enqueue(async () => {
      const existing = window.AppState.getProject(projectId);
      if (!existing) throw new Error('Project not found.');
      const name = String(projectData.name ?? existing.name).trim();
      if (!name) throw new Error('Project name is required.');
      const parentId = projectData.parentId || null;
      if (parentId) {
        if (!window.AppState.getProject(parentId)) throw new Error('Parent project not found.');
        if (parentId === projectId || window.AppState.isProjectDescendant(parentId, projectId)) {
          throw new Error('Project hierarchy cannot contain a cycle.');
        }
      }
      const updated = {
        ...existing, name, icon: projectData.icon || existing.icon || '●',
        viewType: projectData.viewType === 'kanban' ? 'kanban' : 'list', parentId,
        updatedAt: window.TodoStorageMappers.nowIso()
      };
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction(S.PROJECTS, 'readwrite', tx =>
        window.TodoRepositories.put(tx, S.PROJECTS, updated)
      );
      Object.assign(existing, updated);
      return existing;
    });
  },

  deleteProject(projectId) {
    return this.enqueue(async () => {
      if (!window.AppState.getProject(projectId)) return false;
      const S = window.TodoDbSchema.STORES;
      const now = window.TodoStorageMappers.nowIso();
      await window.TodoDb.withTransaction([S.PROJECTS, S.TASKS], 'readwrite', async tx => {
        const children = await window.TodoRepositories.getAllByIndex(tx, S.PROJECTS, 'by_parent_id', projectId);
        for (const child of children) await window.TodoRepositories.put(tx, S.PROJECTS, { ...child, parentId: null, updatedAt: now });
        const tasks = await window.TodoRepositories.getAllByIndex(tx, S.TASKS, 'by_project_id', projectId);
        for (const task of tasks) await window.TodoRepositories.put(tx, S.TASKS, { ...task, projectId: null, updatedAt: now });
        await window.TodoRepositories.remove(tx, S.PROJECTS, projectId);
      });
      window.AppState.deleteProject(projectId);
      window.AppState.projects.forEach(item => { if (item.parentId === projectId) item.updatedAt = now; });
      window.AppState.tasks.forEach(item => { if (!item.project) item.updatedAt = item.updatedAt || now; });
      return true;
    });
  },

  createTag(tagData = {}) {
    return this.enqueue(async () => {
      const name = String(tagData.name || '').trim();
      if (!name) throw new Error('Tag name is required.');
      const parentId = tagData.parentId || null;
      if (parentId && !window.AppState.getTag(parentId)) throw new Error('Parent tag not found.');
      const now = window.TodoStorageMappers.nowIso();
      const tag = {
        id: this.createId('tag'), name, icon: tagData.icon || '●',
        viewType: tagData.viewType === 'kanban' ? 'kanban' : 'list', parentId,
        sortOrder: this.nextEntitySortOrder(window.AppState.tags), createdAt: now, updatedAt: now
      };
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction(S.TAGS, 'readwrite', tx =>
        window.TodoRepositories.add(tx, S.TAGS, tag)
      );
      window.AppState.tags.push(tag);
      return tag;
    });
  },

  updateTag(tagId, tagData = {}) {
    return this.enqueue(async () => {
      const existing = window.AppState.getTag(tagId);
      if (!existing) throw new Error('Tag not found.');
      const name = String(tagData.name ?? existing.name).trim();
      if (!name) throw new Error('Tag name is required.');
      const parentId = tagData.parentId || null;
      if (parentId) {
        if (!window.AppState.getTag(parentId)) throw new Error('Parent tag not found.');
        if (parentId === tagId || window.AppState.isTagDescendant(parentId, tagId)) {
          throw new Error('Tag hierarchy cannot contain a cycle.');
        }
      }
      const updated = {
        ...existing, name, icon: tagData.icon || existing.icon || '●',
        viewType: tagData.viewType === 'kanban' ? 'kanban' : 'list', parentId,
        updatedAt: window.TodoStorageMappers.nowIso()
      };
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction(S.TAGS, 'readwrite', tx =>
        window.TodoRepositories.put(tx, S.TAGS, updated)
      );
      Object.assign(existing, updated);
      return existing;
    });
  },

  deleteTag(tagId) {
    return this.enqueue(async () => {
      if (!window.AppState.getTag(tagId)) return false;
      const S = window.TodoDbSchema.STORES;
      const now = window.TodoStorageMappers.nowIso();
      await window.TodoDb.withTransaction([S.TAGS, S.TASK_TAGS], 'readwrite', async tx => {
        const children = await window.TodoRepositories.getAllByIndex(tx, S.TAGS, 'by_parent_id', tagId);
        for (const child of children) await window.TodoRepositories.put(tx, S.TAGS, { ...child, parentId: null, updatedAt: now });
        await window.TodoRepositories.deleteByIndex(tx, S.TASK_TAGS, 'by_tag_id', tagId);
        await window.TodoRepositories.remove(tx, S.TAGS, tagId);
      });
      window.AppState.deleteTag(tagId);
      return true;
    });
  },

  setEntityViewType(entityType, entityId, viewType) {
    return this.enqueue(async () => {
      const normalizedView = viewType === 'kanban' ? 'kanban' : 'list';
      const isProject = entityType === 'project';
      const entity = isProject ? window.AppState.getProject(entityId) : window.AppState.getTag(entityId);
      if (!entity) throw new Error(`${isProject ? 'Project' : 'Tag'} not found.`);
      const updated = { ...entity, viewType: normalizedView, updatedAt: window.TodoStorageMappers.nowIso() };
      const storeName = isProject ? window.TodoDbSchema.STORES.PROJECTS : window.TodoDbSchema.STORES.TAGS;
      await window.TodoDb.withTransaction(storeName, 'readwrite', tx =>
        window.TodoRepositories.put(tx, storeName, updated)
      );
      Object.assign(entity, updated);
      return entity;
    });
  },

  saveReminderDefinition(custom) {
    return this.enqueue(async () => {
      const definition = window.TodoStorageMappers.customReminderToDefinition(custom);
      if (!definition) throw new Error('Invalid custom reminder.');
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction(S.REMINDER_DEFINITIONS, 'readwrite', tx =>
        window.TodoRepositories.put(tx, S.REMINDER_DEFINITIONS, definition)
      );
      return definition;
    });
  },

  deleteReminderDefinition(reminderId) {
    return this.enqueue(async () => {
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction([S.REMINDER_DEFINITIONS, S.TASK_REMINDERS], 'readwrite', async tx => {
        const definition = await window.TodoRepositories.get(tx, S.REMINDER_DEFINITIONS, reminderId);
        if (!definition || definition.isBuiltin) return;
        await window.TodoRepositories.deleteByIndex(tx, S.TASK_REMINDERS, 'by_reminder_id', reminderId);
        await window.TodoRepositories.remove(tx, S.REMINDER_DEFINITIONS, reminderId);
      });
      window.AppState.tasks.forEach(task => {
        task.reminders = (task.reminders || []).filter(id => id !== reminderId);
        if (!task.reminders.length) task.reminders = ['none'];
      });
    });
  }
});
