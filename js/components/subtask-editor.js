window.SubtaskEditorComponent = {
  editingSubtaskId: null,
  parentTaskId: null,
  selectedPriority: '',
  selectedTags: [],
  selectedDueDate: null,
  selectedDueTime: null,
  selectedReminders: ['on_time'],
  selectedRepeat: null,
  lastFocusedElement: null,

  init() {
    this.modal = document.getElementById('subtask-modal');
    this.card = document.getElementById('subtask-editor-card');
    this.form = document.getElementById('subtask-form');
    this.heading = document.getElementById('subtask-editor-heading');
    this.parentLabel = document.getElementById('subtask-parent-label');
    this.titleInput = document.getElementById('subtask-title-input');
    this.descInput = document.getElementById('subtask-desc-input');
    this.btnDate = document.getElementById('btn-subtask-date');
    this.btnPriority = document.getElementById('btn-subtask-priority');
    this.btnTags = document.getElementById('btn-subtask-tags');
    this.menuPriority = document.getElementById('subtask-menu-priority');
    this.menuTags = document.getElementById('subtask-menu-tags');
    this.projectLock = document.getElementById('subtask-project-lock');
    this.btnClose = document.getElementById('btn-close-subtask');
    this.btnCancel = document.getElementById('btn-cancel-subtask');
    this.btnSubmit = document.getElementById('btn-submit-subtask');
    this.bindEvents();
    this.initKeyboardAdjustment();
  },

  bindEvents() {
    this.btnClose?.addEventListener('click', () => this.close());
    this.btnCancel?.addEventListener('click', () => this.close());
    this.form?.addEventListener('submit', e => {
      e.preventDefault();
      this.submit();
    });
    this.modal?.addEventListener('click', e => {
      if (e.target === this.modal) this.close();
    });
    this.modal?.addEventListener('keydown', e => this.handleKeydown(e));
    this.btnDate?.addEventListener('click', () => this.openSchedule());
    this.btnPriority?.addEventListener('click', e => {
      e.stopPropagation();
      this.toggleMenu(this.menuPriority);
    });
    this.btnTags?.addEventListener('click', e => {
      e.stopPropagation();
      this.toggleMenu(this.menuTags);
    });
    this.menuPriority?.addEventListener('click', e => {
      const item = e.target.closest('[data-subtask-priority]');
      if (!item) return;
      e.stopPropagation();
      this.selectedPriority = item.dataset.subtaskPriority;
      this.syncPriorityUI();
      this.closeMenus();
    });
    this.menuTags?.addEventListener('click', e => {
      const item = e.target.closest('[data-subtask-tag]');
      if (!item) return;
      e.stopPropagation();
      const tagId = item.dataset.subtaskTag;
      if (this.selectedTags.includes(tagId)) this.selectedTags = this.selectedTags.filter(id => id !== tagId);
      else this.selectedTags.push(tagId);
      this.syncTagUI();
    });
    document.addEventListener('click', () => this.closeMenus());
  },

  openCreate(parentTaskId, trigger = null) {
    const parent = window.AppState.validateParentTaskId(parentTaskId);
    if (!parent) return;
    this.lastFocusedElement = trigger || document.activeElement;
    this.editingSubtaskId = null;
    this.parentTaskId = parent.id;
    this.titleInput.value = '';
    this.descInput.value = '';
    this.resetDraft();
    this.heading.textContent = 'New Subtask';
    this.btnSubmit.textContent = 'Add Subtask';
    this.open(parent);
  },

  openEdit(subtaskId, trigger = null) {
    const task = window.AppState.getTask(subtaskId);
    if (!task?.parentTaskId) return;
    const parent = window.AppState.validateParentTaskId(task.parentTaskId);
    if (!parent) return;
    this.lastFocusedElement = trigger || document.activeElement;
    this.editingSubtaskId = task.id;
    this.parentTaskId = parent.id;
    const normalized = window.AppState.normalizeTask(task);
    this.titleInput.value = normalized.title;
    this.descInput.value = normalized.description || '';
    this.selectedPriority = normalized.priority || '';
    this.selectedTags = [...normalized.tags];
    this.selectedDueDate = normalized.dueDate;
    this.selectedDueTime = normalized.dueTime;
    this.selectedReminders = Array.isArray(normalized.reminders) ? [...normalized.reminders] : ['on_time'];
    this.selectedRepeat = normalized.repeat ? JSON.parse(JSON.stringify(normalized.repeat)) : null;
    this.heading.textContent = 'Edit Subtask';
    this.btnSubmit.textContent = 'Save Changes';
    this.open(parent);
  },

  open(parent) {
    window.TasksComponent?.closeTaskActionMenu(false);
    this.parentLabel.textContent = `Parent: ${parent.title}`;
    const project = parent.project ? window.AppState.getProject(parent.project) : null;
    this.projectLock.textContent = project ? `${project.icon} ${project.name} 🔑` : 'Inbox 🔑';
    this.renderTagMenu();
    this.syncPriorityUI();
    this.syncTagUI();
    this.syncScheduleUI();
    this.closeMenus();
    this.modal.classList.add('active');
    this.modal.setAttribute('aria-hidden', 'false');
    window.TasksComponent?.syncTaskModalBodyState();
    requestAnimationFrame(() => this.titleInput?.focus());
  },

  close() {
    if (!this.modal?.classList.contains('active')) return;
    this.closeMenus();
    this.modal.classList.remove('active');
    this.modal.setAttribute('aria-hidden', 'true');
    if (this.card) this.card.style.marginBottom = '0px';
    const focusTarget = this.lastFocusedElement;
    this.editingSubtaskId = null;
    this.parentTaskId = null;
    this.lastFocusedElement = null;
    window.TasksComponent?.syncTaskModalBodyState();
    if (focusTarget?.isConnected) focusTarget.focus();
  },

  resetDraft() {
    this.selectedPriority = '';
    this.selectedTags = [];
    this.selectedDueDate = null;
    this.selectedDueTime = null;
    this.selectedReminders = ['on_time'];
    this.selectedRepeat = null;
  },

  async submit() {
    const title = this.titleInput?.value.trim();
    if (!title) return this.titleInput?.reportValidity();
    const payload = {
      title,
      description: this.descInput?.value.trim() || '',
      dueDate: this.selectedDueDate,
      dueTime: this.selectedDueTime,
      reminders: [...this.selectedReminders],
      repeat: this.selectedRepeat ? JSON.parse(JSON.stringify(this.selectedRepeat)) : null,
      priority: this.selectedPriority,
      tags: [...this.selectedTags]
    };
    this.btnSubmit.disabled = true;
    try {
      if (this.editingSubtaskId) await window.AppDataService.updateTask(this.editingSubtaskId, payload);
      else await window.AppDataService.createTask({ ...payload, parentTaskId: this.parentTaskId });
      this.close();
      window.TasksComponent?.refreshAfterTaskMutation();
    } catch (error) {
      window.AppPersistence.reportError('Could not save this subtask. Your form has been kept open.', error);
    } finally {
      this.btnSubmit.disabled = false;
    }
  },

  openSchedule() {
    this.closeMenus();
    window.ScheduleComponent?.open(
      this.selectedDueDate,
      this.selectedDueTime,
      this.selectedReminders,
      this.selectedRepeat,
      result => {
        this.selectedDueDate = result?.dueDate ?? null;
        this.selectedDueTime = result?.dueTime ?? null;
        this.selectedReminders = Array.isArray(result?.reminders) ? [...result.reminders] : ['on_time'];
        this.selectedRepeat = result?.repeat ? JSON.parse(JSON.stringify(result.repeat)) : null;
        this.syncScheduleUI();
      }
    );
  },

  syncScheduleUI() {
    const hasSchedule = Boolean(
      this.selectedDueDate ||
      this.selectedDueTime ||
      (this.selectedRepeat && this.selectedRepeat.mode !== 'none')
    );
    this.btnDate?.classList.toggle('active', hasSchedule);
    if (!this.btnDate) return;
    const datePart = this.selectedDueDate || 'No date';
    const timePart = this.selectedDueTime ? `, ${this.selectedDueTime}` : '';
    const repeatPart = this.selectedRepeat && this.selectedRepeat.mode !== 'none' ? ' 🔁' : '';
    this.btnDate.title = hasSchedule ? `Scheduled: ${datePart}${timePart}${repeatPart}` : 'Set Date';
  },

  renderTagMenu() {
    if (!this.menuTags) return;
    this.menuTags.innerHTML = '';
    const renderLevel = (parentId, depth = 0) => {
      window.TaxonomyOrder.getChildren('tag', parentId).forEach(tag => {
        const item = document.createElement('div');
        item.className = 'context-menu-item multiselect';
        item.dataset.subtaskTag = tag.id;
        item.style.paddingLeft = `${12 + depth * 16}px`;
        item.innerHTML = `<span class="check-box-icon"></span><span>${tag.icon} ${this.escapeText(tag.name)}</span>`;
        this.menuTags.appendChild(item);
        renderLevel(tag.id, depth + 1);
      });
    };
    renderLevel(null);
  },

  syncPriorityUI() {
    this.menuPriority?.querySelectorAll('[data-subtask-priority]').forEach(item => {
      item.classList.toggle('selected', item.dataset.subtaskPriority === this.selectedPriority);
    });
    this.btnPriority?.classList.toggle('active', Boolean(this.selectedPriority));
  },

  syncTagUI() {
    this.menuTags?.querySelectorAll('[data-subtask-tag]').forEach(item => {
      item.classList.toggle('selected', this.selectedTags.includes(item.dataset.subtaskTag));
    });
    this.btnTags?.classList.toggle('active', this.selectedTags.length > 0);
  },

  toggleMenu(menu) {
    if (!menu) return;
    const open = menu.classList.contains('open');
    this.closeMenus();
    window.TasksComponent?.closeTaskActionMenu(false);
    if (!open) menu.classList.add('open');
  },

  closeMenus() {
    this.menuPriority?.classList.remove('open');
    this.menuTags?.classList.remove('open');
  },

  handleKeydown(e) {
    if (e.key === 'Escape') {
      if (this.menuPriority?.classList.contains('open') || this.menuTags?.classList.contains('open')) {
        this.closeMenus();
      } else {
        e.preventDefault();
        this.close();
      }
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...this.modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  },

  initKeyboardAdjustment() {
    if (!window.visualViewport) return;
    const adjust = () => {
      if (!this.modal?.classList.contains('active')) return;
      const viewport = window.visualViewport;
      const height = window.innerHeight - viewport.height - viewport.offsetTop;
      this.card.style.marginBottom = height > 50 ? `${height}px` : '0px';
    };
    window.visualViewport.addEventListener('resize', adjust);
    window.visualViewport.addEventListener('scroll', adjust);
  },

  escapeText(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }
};
