window.TaskActionMethods = {
  initTaskActions() {
    this.taskActionMenu = document.getElementById('task-action-menu');
    this.taskActionAddBtn = this.taskActionMenu?.querySelector('[data-task-action="add-subtask"]');
    this.taskActionDeleteBtn = this.taskActionMenu?.querySelector('[data-task-action="delete"]');
    this.taskActionTargetId = null;
    this.taskActionAnchor = null;

    this.taskActionMenu?.addEventListener('click', e => {
      const action = e.target.closest('[data-task-action]')?.dataset.taskAction;
      if (!action) return;
      e.stopPropagation();
      if (action === 'add-subtask') this.handleTaskActionAddSubtask();
      if (action === 'delete') this.handleTaskActionDelete();
    });
    document.addEventListener('click', () => this.closeTaskActionMenu(false));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.taskActionMenu?.hidden) {
        e.preventDefault();
        this.closeTaskActionMenu(true);
      }
    });
  },

  createTaskMoreButton(task) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action-btn task-more-btn';
    button.textContent = '•••';
    button.title = 'Task actions';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', `More actions for ${task.title}`);
    button.addEventListener('click', e => {
      e.stopPropagation();
      this.openTaskActionMenu(task.id, button);
    });
    return button;
  },

  openTaskActionMenu(taskId, anchor) {
    const task = window.AppState.getTask(taskId);
    if (!task || !this.taskActionMenu) return;

    this.closeTaskActionMenu(false);
    window.WorkspaceControls?.closeMenu();
    window.SidebarComponent?.closeSidebarActionMenus();
    this.closeAllContextMenus();
    window.SubtaskEditorComponent?.closeMenus();

    this.taskActionTargetId = task.id;
    this.taskActionAnchor = anchor;
    this.taskActionAddBtn.hidden = window.AppState.isSubtask(task);
    this.taskActionMenu.hidden = false;
    anchor?.setAttribute('aria-expanded', 'true');
    this.positionTaskActionMenu(anchor);
    const first = this.taskActionMenu.querySelector('button:not([hidden])');
    first?.focus();
  },

  positionTaskActionMenu(anchor) {
    if (!anchor || !this.taskActionMenu) return;
    const rect = anchor.getBoundingClientRect();
    const menuRect = this.taskActionMenu.getBoundingClientRect();
    const gap = 6;
    const left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, rect.right - menuRect.width));
    let top = rect.bottom + gap;
    if (top + menuRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuRect.height - gap);
    }
    this.taskActionMenu.style.left = `${left}px`;
    this.taskActionMenu.style.top = `${top}px`;
  },

  closeTaskActionMenu(restoreFocus = false) {
    if (!this.taskActionMenu || this.taskActionMenu.hidden) return;
    const anchor = this.taskActionAnchor;
    this.taskActionMenu.hidden = true;
    anchor?.setAttribute('aria-expanded', 'false');
    this.taskActionTargetId = null;
    this.taskActionAnchor = null;
    if (restoreFocus && anchor?.isConnected) anchor.focus();
  },

  handleTaskActionAddSubtask() {
    const task = window.AppState.getTask(this.taskActionTargetId);
    const trigger = this.taskActionAnchor;
    if (!task || window.AppState.isSubtask(task)) return;
    this.closeTaskActionMenu(false);
    window.SubtaskEditorComponent?.openCreate(task.id, trigger);
  },

  handleTaskActionDelete() {
    const task = window.AppState.getTask(this.taskActionTargetId);
    if (!task) return;
    const subtaskCount = window.AppState.getSubtasks(task.id).length;
    if (!task.parentTaskId && subtaskCount > 0) {
      const ok = window.confirm(`Delete "${task.title}" and its ${subtaskCount} ${subtaskCount === 1 ? 'subtask' : 'subtasks'}?`);
      if (!ok) return;
    }
    this.closeTaskActionMenu(false);
    window.AppState.deleteTask(task.id);
    this.refreshAfterTaskMutation?.();
  }
};
