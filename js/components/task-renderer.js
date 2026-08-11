window.TaskRendererMethods = {
  render() {
    const filtered = window.AppState.getFilteredTasks();
    const viewType = window.WorkspaceControls?.viewType || 'list';
    if (viewType === 'kanban') this.renderKanban(filtered);
    else this.renderList(filtered);
    window.SidebarComponent?.updateCounts();
  },

  renderList(filtered) {
    this.listViewEl.hidden = false;
    this.kanbanViewEl.hidden = true;
    const roots = window.AppState.getRootTasks(filtered);
    const activeTasks = roots.filter(task => !task.completed);
    const completedTasks = roots.filter(task => task.completed);
    const groupKey = window.WorkspaceControls?.groupKey || 'none';
    if (groupKey === 'none') this.setDropLaneContext(this.activeListEl, 'active', 'none', 'all');
    else this.clearDropLaneContext(this.activeListEl);
    this.setDropLaneContext(this.completedListEl, 'completed', 'none', 'all');

    this.activeListEl.innerHTML = '';
    this.activeEmptyStateEl.style.display = activeTasks.length ? 'none' : 'flex';
    if (activeTasks.length) {
      if (groupKey === 'none') {
        const ordered = window.WorkspaceControls?.sortTasks(activeTasks) || [...activeTasks];
        ordered.forEach(task => this.activeListEl.appendChild(this.createTaskFamily(task)));
      } else {
        this.renderTaskGroups(activeTasks, groupKey);
      }
    }
    this.activeCountEl.textContent = `${activeTasks.length} ${activeTasks.length === 1 ? 'task' : 'tasks'}`;

    const orderedCompleted = window.WorkspaceControls?.sortTasks(completedTasks) || [...completedTasks];
    this.completedListEl.innerHTML = '';
    this.completedSectionEl.classList.toggle('has-tasks', orderedCompleted.length > 0);
    orderedCompleted.forEach(task => this.completedListEl.appendChild(this.createTaskFamily(task)));
    this.completedCountEl.textContent = `${orderedCompleted.length} ${orderedCompleted.length === 1 ? 'task' : 'tasks'}`;
  },

  createTaskCard(task, options = {}) {
    const {
      isSubtask = false,
      compact = false,
      hideProjectMeta = false,
      showExpander = false,
      subtaskListId = ''
    } = options;
    const normalized = window.AppState.normalizeTask(task);
    const card = document.createElement('div');
    card.className = `task-card${normalized.completed ? ' completed' : ''}${isSubtask ? ' subtask-card' : ''}${compact ? ' compact-subtask-card' : ''}`;
    card.dataset.id = normalized.id;

    const left = document.createElement('div');
    left.className = 'task-left';
    if (showExpander) left.appendChild(this.createSubtaskExpander(normalized, subtaskListId));

    const checkboxWrapper = document.createElement('div');
    checkboxWrapper.className = 'task-checkbox-wrapper';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = normalized.completed;
    checkbox.setAttribute('aria-label', `Mark ${normalized.title} as ${normalized.completed ? 'active' : 'completed'}`);
    const checkIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    checkIcon.classList.add('check-icon');
    checkIcon.setAttribute('viewBox', '0 0 24 24');
    checkIcon.setAttribute('aria-hidden', 'true');
    checkIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />';
    checkboxWrapper.append(checkbox, checkIcon);

    const details = document.createElement('div');
    details.className = 'task-details';
    details.setAttribute('tabindex', '0');
    details.setAttribute('role', 'button');
    details.setAttribute('aria-label', `Edit ${isSubtask ? 'subtask' : 'task'}: ${normalized.title}`);
    details.setAttribute('title',
      `Click or press Enter to edit ${isSubtask ? 'subtask' : 'task'}`);
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = normalized.title;
    details.appendChild(title);

    if (normalized.description && !compact) {
      const description = document.createElement('span');
      description.className = 'task-description';
      description.textContent = normalized.description;
      details.appendChild(description);
    }

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    if (normalized.dueDate || normalized.dueTime) {
      meta.appendChild(this.createBadge(this.formatScheduleLabel(normalized.dueDate, normalized.dueTime), 'due-date'));
    }
    if (normalized.repeat && normalized.repeat.mode !== 'none' && !compact) {
      meta.appendChild(this.createBadge(this.formatRepeatLabel(normalized.repeat), 'repeat'));
    }
    if (normalized.priority) meta.appendChild(this.createBadge(normalized.priority, `priority-${normalized.priority}`));
    if (normalized.project && !hideProjectMeta) {
      const projectName = window.AppState.getProject(normalized.project)?.name || 'Unknown Project';
      meta.appendChild(this.createBadge(projectName));
    }
    normalized.tags.forEach(tagId => {
      const tagName = window.AppState.getTag(tagId)?.name || 'Unknown Tag';
      meta.appendChild(this.createBadge(`#${tagName}`));
    });
    details.appendChild(meta);
    left.append(checkboxWrapper, details);

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    actions.appendChild(this.createTaskMoreButton(normalized));
    card.append(left, actions);

    const handleEditTrigger = e => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'keydown') e.preventDefault();
      e.stopPropagation();
      this.closeTaskActionMenu(false);
      if (isSubtask) window.SubtaskEditorComponent?.openEdit(normalized.id, details);
      else this.openModal(normalized);
    };
    details.addEventListener('click', handleEditTrigger);
    details.addEventListener('keydown', handleEditTrigger);
    checkboxWrapper.addEventListener('click', e => e.stopPropagation());

    checkbox.addEventListener('change', e => {
      e.stopPropagation();
      window.AppState.toggleTaskStatus(normalized.id);
      this.refreshAfterTaskMutation();
    });
    return card;
  },

  createBadge(text, extraClass = '') {
    const badge = document.createElement('span');
    badge.className = `meta-badge ${extraClass}`.trim();
    badge.textContent = text;
    return badge;
  },

  formatRepeatLabel(repeatObj) {
    if (!repeatObj || repeatObj.mode === 'none') return '';
    const mode = repeatObj.mode;
    if (mode === 'daily') return '🔁 Daily';
    if (mode === 'weekly') return '🔁 weekly';
    if (mode === 'monthly') return '🔁 Monthly';
    if (mode === 'yearly') return '🔁 Yearly';
    if (mode === 'custom') {
      const custom = repeatObj.custom || { interval: 1, unit: 'day' };
      const unitLabel = custom.interval === 1 ? custom.unit : `${custom.unit}s`;
      let text = `🔁 Every ${custom.interval} ${unitLabel}`;
      if (custom.unit === 'week' && custom.weekdays?.length) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        text += ` on ${custom.weekdays.sort((a, b) => a - b).map(d => dayNames[d]).join(', ')}`;
      }
      return text;
    }
    return '🔁 repeat';
  },

  formatScheduleLabel(dateStr, timeStr) {
    let datePart = '';
    if (dateStr) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (dateStr === todayStr) {
        datePart = 'Today';
      } else {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        if (dateStr === tomorrowStr) {
          datePart = 'Tomorrow';
        } else {
          const parts = dateStr.split('-').map(Number);
          datePart = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
            .format(new Date(parts[0], parts[1] - 1, parts[2]));
        }
      }
    }
    if (datePart && timeStr) return `${datePart}, ${timeStr}`;
    return datePart || timeStr || '';
  },

  formatDueDateLabel(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (dateStr === todayStr) return 'Today';
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    if (dateStr === tomorrowStr) return 'Tomorrow';
    const parts = dateStr.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
      .format(new Date(parts[0], parts[1] - 1, parts[2]));
  }
};
