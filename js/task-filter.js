window.TaskFilter = {
  getDisplayTasks() {
    const state = window.AppState;
    if (!state) return [];

    const roots = typeof state.getSiblingTasks === 'function'
      ? state.getSiblingTasks(null)
      : state.tasks.filter(task => !task.parentTaskId);
    const output = [];

    roots.forEach(parent => {
      if (state.matchesFilter(parent)) {
        output.push(parent);
        return;
      }

      const children = typeof state.getSiblingTasks === 'function'
        ? state.getSiblingTasks(parent.id)
        : state.tasks.filter(task => task.parentTaskId === parent.id);
      children.forEach(child => {
        if (state.matchesFilter(child)) output.push(child);
      });
    });

    return output;
  }
};
