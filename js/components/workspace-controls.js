window.WorkspaceControls = {
  sortKey: 'custom',
  sortDirection: 'asc',
  groupKey: 'none',
  viewType: 'list',

  init() {
    this.directionBtn = document.getElementById('btn-sort-direction');
    this.menuBtn = document.getElementById('btn-workspace-menu');
    this.menu = document.getElementById('workspace-menu');
    if (!this.directionBtn || !this.menuBtn || !this.menu) return;

    this.directionBtn.addEventListener('click', () => this.toggleDirection());
    this.menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      this.menu.classList.contains('open') ? this.closeMenu() : this.openMenu();
    });
    this.menu.addEventListener('click', e => this.handleMenuClick(e));
    document.addEventListener('click', () => this.closeMenu());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.menu.classList.contains('open')) {
        this.closeMenu();
        this.menuBtn.focus();
      }
    });
    this.syncUI();
  },

  openMenu() {
    window.SidebarComponent?.closeSidebarActionMenus();
    window.TasksComponent?.closeAllContextMenus();
    window.TasksComponent?.closeTaskActionMenu(false);
    this.menu.classList.add('open');
    this.menuBtn.setAttribute('aria-expanded', 'true');
  },

  closeMenu() {
    this.menu?.classList.remove('open');
    this.menuBtn?.setAttribute('aria-expanded', 'false');
  },

  normalizeSortKey(sortKey) {
    return sortKey === 'default' ? 'custom' : sortKey;
  },

  normalizeViewType(viewType) {
    return viewType === 'kanban' ? 'kanban' : 'list';
  },

  setViewType(viewType, { persist = true, render = true } = {}) {
    this.viewType = this.normalizeViewType(viewType);
    if (persist) this.persistViewToCurrentEntity();
    this.syncUI();
    if (render) window.TasksComponent?.render();
    return this.viewType;
  },

  syncViewFromCurrentFilter() {
    let viewType = this.viewType;
    if (window.AppState.currentFilterType === 'project') {
      viewType = window.AppState.getProject(window.AppState.currentFilter)?.viewType || 'list';
    } else if (window.AppState.currentFilterType === 'tag') {
      viewType = window.AppState.getTag(window.AppState.currentFilter)?.viewType || 'list';
    }
    this.viewType = this.normalizeViewType(viewType);
    this.syncUI();
    return this.viewType;
  },

  persistViewToCurrentEntity() {
    if (window.AppState.currentFilterType === 'project') {
      const project = window.AppState.getProject(window.AppState.currentFilter);
      if (project) project.viewType = this.viewType;
    } else if (window.AppState.currentFilterType === 'tag') {
      const tag = window.AppState.getTag(window.AppState.currentFilter);
      if (tag) tag.viewType = this.viewType;
    }
  },

  handleMenuClick(e) {
    const sortItem = e.target.closest('[data-sort-key]');
    const groupItem = e.target.closest('[data-group-key]');
    const viewItem = e.target.closest('[data-view-type]');
    if (!sortItem && !groupItem && !viewItem) return;

    if (sortItem) this.sortKey = this.normalizeSortKey(sortItem.dataset.sortKey);
    if (groupItem) this.groupKey = groupItem.dataset.groupKey;
    if (viewItem) this.setViewType(viewItem.dataset.viewType, { persist: true, render: false });

    this.syncUI();
    this.closeMenu();
    window.TasksComponent?.render();
  },

  toggleDirection() {
    if (this.normalizeSortKey(this.sortKey) === 'custom') return;
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.syncUI();
    window.TasksComponent?.render();
  },

  syncUI() {
    this.sortKey = this.normalizeSortKey(this.sortKey);
    this.menu?.querySelectorAll('[data-sort-key]').forEach(item => {
      const selected = this.normalizeSortKey(item.dataset.sortKey) === this.sortKey;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    this.menu?.querySelectorAll('[data-group-key]').forEach(item => {
      const selected = item.dataset.groupKey === this.groupKey;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    this.menu?.querySelectorAll('[data-view-type]').forEach(item => {
      const selected = item.dataset.viewType === this.viewType;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    if (this.directionBtn) {
      const custom = this.sortKey === 'custom';
      const ascending = this.sortDirection === 'asc';
      this.directionBtn.disabled = custom;
      this.directionBtn.textContent = custom ? '↕' : (ascending ? '↑' : '↓');
      this.directionBtn.title = custom
        ? 'Custom order — long-press a task to reorder'
        : (ascending ? 'Ascending — click for Descending' : 'Descending — click for Ascending');
      this.directionBtn.setAttribute('aria-label', this.directionBtn.title);
    }
  },

  sortTasks(tasks) {
    const sorted = [...tasks];
    const sortKey = this.normalizeSortKey(this.sortKey);
    const direction = this.sortDirection === 'desc' ? -1 : 1;
    if (sortKey === 'custom') return sorted;

    const compareText = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
    const priorityRank = { high: 0, medium: 1, low: 2, '': 3 };
    sorted.sort((a, b) => {
      let result = 0;
      if (sortKey === 'dueDate') {
        const aScheduled = Boolean(a.dueDate);
        const bScheduled = Boolean(b.dueDate);
        if (aScheduled !== bScheduled) return aScheduled ? -1 : 1;
        if (!aScheduled) return 0;
        result = compareText(`${a.dueDate}|${a.dueTime || ''}`, `${b.dueDate}|${b.dueTime || ''}`);
      } else if (sortKey === 'priority') {
        result = (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1);
      } else if (sortKey === 'name') {
        result = compareText(a.title, b.title);
      } else if (sortKey === 'createdAt') {
        result = compareText(a.createdAt, b.createdAt);
      }
      return result * direction;
    });
    return sorted;
  }
};
