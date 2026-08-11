window.TaskKanbanMethods = {
  renderKanban(tasks) {
    this.listViewEl.hidden = true;
    this.kanbanViewEl.hidden = false;
    this.kanbanBoardEl.innerHTML = '';

    const roots = window.AppState.getRootTasks(tasks);
    const hasTasks = roots.length > 0;
    this.kanbanBoardEl.hidden = !hasTasks;
    this.kanbanEmptyStateEl.style.display = hasTasks ? 'none' : 'flex';
    if (!hasTasks) return;

    const groupKey = window.WorkspaceControls?.groupKey || 'none';
    const groups = groupKey === 'none'
      ? [{ key: 'all', label: '', tasks: [...roots] }]
      : this.getTaskGroups(roots, groupKey);

    this.kanbanBoardEl.classList.toggle('single-column', groupKey === 'none');
    groups.forEach(group => {
      this.kanbanBoardEl.appendChild(this.createKanbanColumn(groupKey, group));
    });
  },

  createKanbanColumn(groupKey, group) {
    const column = document.createElement('section');
    column.className = 'kanban-column';
    column.dataset.groupType = groupKey;
    column.dataset.groupKey = group.key;

    if (groupKey !== 'none') {
      const title = document.createElement('h2');
      title.className = 'kanban-column-title';
      title.textContent = group.label;
      column.appendChild(title);
    }

    const activeList = document.createElement('div');
    activeList.className = 'kanban-task-list kanban-active-list';
    this.setDropLaneContext(activeList, 'active', groupKey, group.key);
    const activeTasks = group.tasks.filter(task => !task.completed);
    const orderedActive = window.WorkspaceControls?.sortTasks(activeTasks) || [...activeTasks];
    orderedActive.forEach(task => activeList.appendChild(this.createTaskFamily(task)));
    column.appendChild(activeList);

    const completedTasks = group.tasks.filter(task => task.completed);
    const completedHeader = document.createElement('div');
    completedHeader.className = 'kanban-completed-header';
    const completedLabel = document.createElement('span');
    completedLabel.textContent = 'Completed';
    const completedCount = document.createElement('span');
    completedCount.className = 'kanban-completed-count';
    completedCount.textContent = String(completedTasks.length);
    completedHeader.append(completedLabel, completedCount);

    const completedList = document.createElement('div');
    completedList.className = 'kanban-task-list kanban-completed-list';
    this.setDropLaneContext(completedList, 'completed', groupKey, group.key);
    const orderedCompleted = window.WorkspaceControls?.sortTasks(completedTasks) || [...completedTasks];
    orderedCompleted.forEach(task => completedList.appendChild(this.createTaskFamily(task)));

    column.append(completedHeader, completedList);
    return column;
  }
};
