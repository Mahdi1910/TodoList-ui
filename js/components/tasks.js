window.TasksComponent = {
  editingTaskId: null,
  selectedPriority: '',
  selectedProject: '',
  selectedTags: [],
  selectedDueDate: null,
  selectedDueTime: null,
  selectedReminders: ['on_time'],
  selectedRepeat: null,

  init() {
    this.activeListEl = document.getElementById('active-task-list');
    this.completedListEl = document.getElementById('completed-task-list');
    this.completedSectionEl = document.getElementById('completed-tasks-container');
    this.activeEmptyStateEl = document.getElementById('active-empty-state');
    this.activeCountEl = document.getElementById('active-tasks-count');
    this.completedCountEl = document.getElementById('completed-tasks-count');
    this.listViewEl = document.getElementById('list-view');
    this.kanbanViewEl = document.getElementById('kanban-view');
    this.kanbanBoardEl = document.getElementById('kanban-board');
    this.kanbanEmptyStateEl = document.getElementById('kanban-empty-state');
    this.addTaskModal = document.getElementById('add-task-modal');
    this.quickCard = document.getElementById('quick-input-card');
    this.openAddTaskBtn = document.getElementById('btn-open-add-task');
    this.submitTaskBtn = document.getElementById('btn-submit-quick-task');
    this.form = document.getElementById('add-task-form');
    this.titleInput = document.getElementById('task-title-input');
    this.descInput = document.getElementById('task-desc-input');
    this.btnDate = document.getElementById('btn-pop-date');
    this.btnPriority = document.getElementById('btn-pop-priority');
    this.btnTags = document.getElementById('btn-pop-tags');
    this.btnProject = document.getElementById('btn-pop-project');
    this.btnAddSubtask = document.getElementById('btn-add-subtask-from-editor');
    this.menuPriority = document.getElementById('menu-priority');
    this.menuTags = document.getElementById('menu-tags');
    this.menuProject = document.getElementById('menu-project');
    this.parentSubtasksSection = document.getElementById('parent-subtasks-section');
    this.parentSubtasksList = document.getElementById('parent-subtasks-list');
    this.parentSubtasksCount = document.getElementById('parent-subtasks-count');
    this.renderProjectMenu();
    this.renderTagMenu();
    this.initTaskActions();
    this.initTaskHierarchy();
    this.initTaskDrag();
    this.bindEvents();
    this.bindDateTrigger();
    this.initKeyboardAdjustment();
    this.render();
  },

  bindDateTrigger() {
    if (!this.btnDate) return;
    this.btnDate.addEventListener('click', () => {
      window.ScheduleComponent?.open(this.selectedDueDate, this.selectedDueTime, this.selectedReminders, this.selectedRepeat, result => {
        if (typeof result === 'object' && result !== null) {
          this.selectedDueDate = result.dueDate;
          this.selectedDueTime = result.dueTime;
          this.selectedReminders = result.reminders || ['on_time'];
          this.selectedRepeat = result.repeat || null;
        } else this.selectedDueDate = result;
        this.syncDateButton();
      });
    });
  },

  bindEvents() {
    this.openAddTaskBtn?.addEventListener('click', event => this.openModal(null, event.currentTarget));
    this.addTaskModal?.addEventListener('click', event => { if (event.target === this.addTaskModal) this.closeModal(); });
    this.form?.addEventListener('submit', event => { event.preventDefault(); this.submitTask(); });
    this.addTaskModal?.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.closeModal(); }
    });
    this.btnAddSubtask?.addEventListener('click', () => {
      const parent = this.editingTaskId ? window.AppState.getTask(this.editingTaskId) : null;
      if (!parent || parent.parentTaskId) return;
      this.closeAllContextMenus();
      window.SubtaskEditorComponent?.openCreate(parent.id, this.btnAddSubtask);
    });
    document.addEventListener('click', () => this.closeAllContextMenus());
    this.bindContextMenu(this.btnPriority, this.menuPriority, 'single', 'priority');
    this.bindProjectMenuTrigger();
    this.bindTagMenuTrigger();
  },

  initKeyboardAdjustment() {
    const queueSync = () => {
      if (this.quickViewportFrame != null) cancelAnimationFrame(this.quickViewportFrame);
      this.quickViewportFrame = requestAnimationFrame(() => {
        this.quickViewportFrame = null;
        this.syncQuickInputViewport();
      });
    };
    this.queueQuickInputViewportSync = queueSync;
    window.visualViewport?.addEventListener('resize', queueSync);
    window.visualViewport?.addEventListener('scroll', queueSync);
    window.addEventListener('resize', queueSync);
  },

  syncQuickInputViewport() {
    if (!this.addTaskModal?.classList.contains('active')) return;
    const viewport = window.visualViewport;
    const values = {
      '--quick-vv-top': viewport?.offsetTop ?? 0,
      '--quick-vv-left': viewport?.offsetLeft ?? 0,
      '--quick-vv-width': viewport?.width ?? window.innerWidth,
      '--quick-vv-height': viewport?.height ?? window.innerHeight
    };
    Object.entries(values).forEach(([property, value]) => this.addTaskModal.style.setProperty(property, `${Math.max(0, value)}px`));
  },

  resetQuickInputViewport() {
    if (this.quickViewportFrame != null) cancelAnimationFrame(this.quickViewportFrame);
    this.quickViewportFrame = null;
    ['--quick-vv-top', '--quick-vv-left', '--quick-vv-width', '--quick-vv-height']
      .forEach(property => this.addTaskModal?.style.removeProperty(property));
  },

  syncUIFromState() {
    this.menuPriority?.querySelectorAll('.context-menu-item').forEach(item => item.classList.toggle('selected', item.dataset.priority === this.selectedPriority));
    this.btnPriority?.classList.toggle('active', Boolean(this.selectedPriority));
    this.menuProject?.querySelectorAll('.context-menu-item').forEach(item => item.classList.toggle('selected', item.dataset.project === this.selectedProject));
    this.btnProject?.classList.toggle('active', Boolean(this.selectedProject));
    this.menuTags?.querySelectorAll('.context-menu-item').forEach(item => item.classList.toggle('selected', this.selectedTags.includes(item.dataset.tag)));
    this.btnTags?.classList.toggle('active', this.selectedTags.length > 0);
    [this.menuPriority, this.menuTags, this.menuProject].forEach(menu => menu && this.syncMenuSelection(menu));
    this.syncDateButton();
  },

  syncDateButton() {
    const hasSchedule = Boolean(this.selectedDueDate || this.selectedDueTime || (this.selectedRepeat && this.selectedRepeat.mode !== 'none'));
    this.btnDate?.classList.toggle('active', hasSchedule);
    if (!this.btnDate) return;
    const datePart = this.selectedDueDate || 'No date';
    const timePart = this.selectedDueTime ? `, ${this.selectedDueTime}` : '';
    const repeatPart = this.selectedRepeat && this.selectedRepeat.mode !== 'none' ? ' 🔁' : '';
    this.btnDate.title = hasSchedule ? `Scheduled: ${datePart}${timePart}${repeatPart}` : 'Set Date';
  },

  async submitTask() {
    if (!this.titleInput?.value.trim()) return this.titleInput?.reportValidity();
    const payload = {
      title: this.titleInput.value.trim(), description: this.descInput?.value.trim() || '',
      dueDate: this.selectedDueDate, dueTime: this.selectedDueTime,
      reminders: [...this.selectedReminders],
      repeat: this.selectedRepeat ? JSON.parse(JSON.stringify(this.selectedRepeat)) : null,
      project: this.selectedProject, priority: this.selectedPriority, tags: [...this.selectedTags]
    };
    this.submitTaskBtn.disabled = true;
    try {
      if (this.editingTaskId) await window.AppDataService.updateTask(this.editingTaskId, payload);
      else await window.AppDataService.createTask({ ...payload, parentTaskId: null });
      this.closeModal();
      this.render();
    } catch (error) {
      window.AppPersistence?.reportError('Could not save this task. Your form has been kept open.', error);
    } finally {
      this.submitTaskBtn.disabled = false;
    }
  },

  resetSelections(useCurrentContext = false) {
    this.selectedPriority = '';
    this.selectedProject = '';
    this.selectedTags = [];
    this.selectedDueDate = null;
    if (useCurrentContext) {
      if (window.AppState.currentFilterType === 'project') this.selectedProject = window.AppState.currentFilter;
      else if (window.AppState.currentFilterType === 'tag') this.selectedTags = [window.AppState.currentFilter];
      else if (window.AppState.currentFilterType === 'smart' && window.AppState.currentFilter === 'today') this.selectedDueDate = window.AppState.getTodayDateStr();
    }
    this.selectedDueTime = null;
    this.selectedReminders = ['on_time'];
    this.selectedRepeat = null;
    this.syncUIFromState();
    this.closeAllContextMenus();
  },

  openModal(taskToEdit = null, trigger = null) {
    if (taskToEdit && window.AppState.isSubtask(taskToEdit)) {
      window.SubtaskEditorComponent?.openEdit(taskToEdit.id, trigger);
      return;
    }
    if (taskToEdit) {
      const normalized = window.AppState.normalizeTask(taskToEdit);
      this.editingTaskId = normalized.id;
      this.titleInput.value = normalized.title;
      this.descInput.value = normalized.description || '';
      this.selectedPriority = normalized.priority || '';
      this.selectedProject = normalized.project || '';
      this.selectedTags = [...normalized.tags];
      this.selectedDueDate = normalized.dueDate;
      this.selectedDueTime = normalized.dueTime;
      this.selectedReminders = Array.isArray(normalized.reminders) ? [...normalized.reminders] : ['on_time'];
      this.selectedRepeat = normalized.repeat ? JSON.parse(JSON.stringify(normalized.repeat)) : null;
      this.syncUIFromState();
      this.btnAddSubtask.hidden = false;
      this.renderParentEditSubtasks();
      this.submitTaskBtn.title = 'Save Changes';
      this.submitTaskBtn.setAttribute('aria-label', 'Save Changes');
    } else {
      this.editingTaskId = null;
      this.titleInput.value = '';
      this.descInput.value = '';
      this.resetSelections(true);
      this.btnAddSubtask.hidden = true;
      this.parentSubtasksSection.hidden = true;
      this.parentSubtasksList.innerHTML = '';
      this.submitTaskBtn.title = 'Add Task';
      this.submitTaskBtn.setAttribute('aria-label', 'Add Task');
    }
    window.ModalFocusManager.open(this.addTaskModal, {
      trigger,
      initialFocus: this.titleInput,
      fallbackFocus: '#btn-open-add-task'
    });
    this.syncTaskModalBodyState();
    this.syncQuickInputViewport();
  },

  closeModal() {
    if (!this.addTaskModal?.classList.contains('active')) return;
    this.closeAllContextMenus();
    this.closeTaskActionMenu(false);
    window.ModalFocusManager.close(this.addTaskModal, { fallbackFocus: '#btn-open-add-task' });
    this.resetQuickInputViewport();
    this.editingTaskId = null;
    this.titleInput.value = '';
    this.descInput.value = '';
    this.btnAddSubtask.hidden = true;
    this.parentSubtasksSection.hidden = true;
    this.parentSubtasksList.innerHTML = '';
    this.resetSelections();
    this.syncTaskModalBodyState();
  },

  syncTaskModalBodyState() {
    const rootOpen = this.addTaskModal?.classList.contains('active');
    const childOpen = document.getElementById('subtask-modal')?.classList.contains('active');
    document.body.classList.toggle('modal-open', Boolean(rootOpen || childOpen));
  }
};

Object.assign(
  window.TasksComponent,
  window.TaskMenuMethods,
  window.TaskActionMethods,
  window.TaskGroupMethods,
  window.TaskHierarchyMethods,
  window.TaskKanbanMethods,
  window.TaskDragMethods,
  window.TaskDragTouchMethods,
  window.TaskDragCommitMethods,
  window.TaskRendererMethods
);
