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
        sortOrder: window.TaxonomyOrder.nextSortOrder('project', parentId), createdAt: now, updatedAt: now
      };
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction(S.PROJECTS, 'readwrite', tx =>
        window.TodoRepositories.add(tx, S.PROJECTS, project)
      );
      window.AppStateSync.upsertTaxonomyEntity('project', project);
      return window.AppState.getProject(project.id);
    });
  },

  updateProject(projectId, projectData = {}) {
    return this.enqueue(() => this.updateTaxonomyEntityWithOrder('project', projectId, projectData));
  },

  deleteProject(projectId) {
    return this.enqueue(async () => {
      if (!window.AppState.getProject(projectId)) return false;
      const plan = this.prepareTaxonomyDelete('project', projectId);
      const affectedTasks = window.AppState.tasks
        .filter(item => item.project === projectId)
        .map(item => ({ ...item, project: '', updatedAt: plan.now }));
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction([S.PROJECTS, S.TASKS], 'readwrite', async tx => {
        for (const id of plan.changed) {
          const copy = plan.copies.get(id);
          if (copy) await window.TodoRepositories.put(tx, S.PROJECTS, copy);
        }
        const tasks = await window.TodoRepositories.getAllByIndex(tx, S.TASKS, 'by_project_id', projectId);
        for (const task of tasks) {
          await window.TodoRepositories.put(tx, S.TASKS, { ...task, projectId: null, updatedAt: plan.now });
        }
        await window.TodoRepositories.remove(tx, S.PROJECTS, projectId);
      });
      this.applyTaxonomyMemory('project', plan.copies, plan.changed);
      window.AppStateSync.removeTaxonomyEntity('project', projectId);
      window.AppStateSync.replaceTasks(affectedTasks);
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
        sortOrder: window.TaxonomyOrder.nextSortOrder('tag', parentId), createdAt: now, updatedAt: now
      };
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction(S.TAGS, 'readwrite', tx =>
        window.TodoRepositories.add(tx, S.TAGS, tag)
      );
      window.AppStateSync.upsertTaxonomyEntity('tag', tag);
      return window.AppState.getTag(tag.id);
    });
  },

  updateTag(tagId, tagData = {}) {
    return this.enqueue(() => this.updateTaxonomyEntityWithOrder('tag', tagId, tagData));
  },

  deleteTag(tagId) {
    return this.enqueue(async () => {
      if (!window.AppState.getTag(tagId)) return false;
      const plan = this.prepareTaxonomyDelete('tag', tagId);
      const affectedTasks = window.AppState.tasks
        .filter(task => (task.tags || []).includes(tagId))
        .map(task => ({ ...task, tags: (task.tags || []).filter(id => id !== tagId) }));
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction([S.TAGS, S.TASK_TAGS], 'readwrite', async tx => {
        for (const id of plan.changed) {
          const copy = plan.copies.get(id);
          if (copy) await window.TodoRepositories.put(tx, S.TAGS, copy);
        }
        await window.TodoRepositories.deleteByIndex(tx, S.TASK_TAGS, 'by_tag_id', tagId);
        await window.TodoRepositories.remove(tx, S.TAGS, tagId);
      });
      this.applyTaxonomyMemory('tag', plan.copies, plan.changed);
      window.AppStateSync.removeTaxonomyEntity('tag', tagId);
      window.AppStateSync.replaceTasks(affectedTasks);
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
      window.AppStateSync.upsertTaxonomyEntity(isProject ? 'project' : 'tag', updated);
      return isProject ? window.AppState.getProject(entityId) : window.AppState.getTag(entityId);
    });
  }
});
