window.TaskOrderMethods = {
  getRootTaskSlots() {
    const slots = [];
    this.tasks.forEach((task, index) => {
      if (!task.parentTaskId) slots.push(index);
    });
    return slots;
  },

  getRootTaskIds() {
    return this.tasks.filter(task => !task.parentTaskId).map(task => task.id);
  },

  getVisibleRootIds(tasks = []) {
    const seen = new Set();
    return tasks.filter(task => {
      if (task.parentTaskId || seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    }).map(task => task.id);
  },

  getRootOrderSnapshot() {
    return this.getRootTaskIds();
  },
  rebaseVisibleRootOrder(orderedVisibleIds = []) {
    const uniqueIds = [...new Set(orderedVisibleIds)];
    if (uniqueIds.length < 2) return false;
    const idSet = new Set(uniqueIds);
    const slots = [];
    const byId = new Map();
    this.tasks.forEach((task, index) => {
      if (!task.parentTaskId && idSet.has(task.id)) {
        slots.push(index);
        byId.set(task.id, task);
      }
    });
    const orderedTasks = uniqueIds.map(id => byId.get(id)).filter(Boolean);
    if (orderedTasks.length !== slots.length) return false;
    slots.forEach((slot, index) => {
      this.tasks[slot] = orderedTasks[index];
    });
    return true;
  },

  restoreRootOrderSnapshot(snapshot = []) {
    return this.rebaseVisibleRootOrder(snapshot);
  },
  moveVisibleRootRelative(taskId, referenceId, placement = 'after', visibleIds = []) {
    const ordered = [...new Set(visibleIds)].filter(id => id !== taskId);
    if (!referenceId) {
      ordered.push(taskId);
      return this.rebaseVisibleRootOrder(ordered);
    }
    const referenceIndex = ordered.indexOf(referenceId);
    if (referenceIndex === -1) return false;
    const insertAt = placement === 'before' ? referenceIndex : referenceIndex + 1;
    ordered.splice(insertAt, 0, taskId);
    return this.rebaseVisibleRootOrder(ordered);
  }
};

Object.assign(window.AppState, window.TaskOrderMethods);
