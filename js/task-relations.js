(() => {
  const baseAddTask = window.AppState.addTask.bind(window.AppState);
  const baseUpdateTask = window.AppState.updateTask.bind(window.AppState);
  const baseDeleteTask = window.AppState.deleteTask.bind(window.AppState);
  const baseDeleteProject = window.AppState.deleteProject.bind(window.AppState);

  window.TaskRelationMethods = {
    getTask(taskId) {
      return this.tasks.find(task => task.id === taskId) || null;
    },

    isSubtask(taskOrId) {
      const task = typeof taskOrId === 'string' ? this.getTask(taskOrId) : taskOrId;
      return Boolean(task?.parentTaskId);
    },

    getSubtasks(parentTaskId) {
      return this.tasks.filter(task => task.parentTaskId === parentTaskId);
    },

    getSubtaskIds(parentTaskId) {
      return this.getSubtasks(parentTaskId).map(task => task.id);
    },

    hasSubtasks(parentTaskId) {
      return this.tasks.some(task => task.parentTaskId === parentTaskId);
    },

    getRootTasks(tasks = this.tasks) {
      return tasks.filter(task => !task.parentTaskId);
    },

    validateParentTaskId(parentTaskId) {
      if (!parentTaskId || typeof parentTaskId !== 'string') return null;
      const parent = this.getTask(parentTaskId);
      if (!parent || parent.parentTaskId) return null;
      return parent;
    },

    syncSubtaskProjects(parentTaskId, projectId) {
      this.getSubtasks(parentTaskId).forEach(child => {
        child.project = typeof projectId === 'string' ? projectId : '';
      });
    },

    normalizeTaskRelations() {
      this.tasks = this.tasks.map(task => this.normalizeTask(task));
      this.tasks.forEach(task => {
        if (!task.parentTaskId) {
          task.parentTaskId = null;
          return;
        }
        const parent = this.getTask(task.parentTaskId);
        const invalid = !parent || parent.id === task.id || Boolean(parent.parentTaskId);
        if (invalid) {
          task.parentTaskId = null;
          return;
        }
        task.project = parent.project || '';
      });
      return this.tasks;
    },

    addTask(taskData = {}) {
      const parent = this.validateParentTaskId(taskData.parentTaskId);
      const payload = {
        ...taskData,
        parentTaskId: parent?.id || null,
        project: parent ? (parent.project || '') : (typeof taskData.project === 'string' ? taskData.project : '')
      };
      return baseAddTask(payload);
    },

    addSubtask(parentTaskId, taskData = {}) {
      const parent = this.validateParentTaskId(parentTaskId);
      if (!parent) return null;
      return baseAddTask({
        ...taskData,
        parentTaskId: parent.id,
        project: parent.project || ''
      });
    },

    updateTask(taskId, updatedData = {}) {
      const existing = this.getTask(taskId);
      if (!existing) return null;

      if (existing.parentTaskId) {
        const parent = this.validateParentTaskId(existing.parentTaskId);
        if (!parent) {
          existing.parentTaskId = null;
          return baseUpdateTask(taskId, { ...updatedData, parentTaskId: null });
        }
        return baseUpdateTask(taskId, {
          ...updatedData,
          parentTaskId: existing.parentTaskId,
          project: parent.project || ''
        });
      }

      const oldProject = existing.project || '';
      const updated = baseUpdateTask(taskId, {
        ...updatedData,
        parentTaskId: null
      });
      if (updated && oldProject !== (updated.project || '')) {
        this.syncSubtaskProjects(updated.id, updated.project || '');
      }
      return updated;
    },

    deleteTaskFamily(taskId) {
      const task = this.getTask(taskId);
      if (!task) return false;
      if (task.parentTaskId) {
        baseDeleteTask(task.id);
        return true;
      }
      const familyIds = new Set([task.id, ...this.getSubtaskIds(task.id)]);
      this.tasks = this.tasks.filter(item => !familyIds.has(item.id));
      return true;
    },

    deleteTask(taskId) {
      return this.deleteTaskFamily(taskId);
    },

    deleteProject(projectId) {
      const result = baseDeleteProject(projectId);
      this.normalizeTaskRelations();
      return result;
    }
  };

  Object.assign(window.AppState, window.TaskRelationMethods);
  window.AppState.normalizeTaskRelations();
})();
