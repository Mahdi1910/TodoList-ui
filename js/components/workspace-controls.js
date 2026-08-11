window.WorkspaceControls = {
  sortKey: 'custom',
  sortDirection: 'asc',
  groupKey: 'none',
  viewType: 'list',
  activeSubmenu: null,

  init() {
    this.directionBtn = document.getElementById('btn-sort-direction');
    this.menuBtn = document.getElementById('btn-workspace-menu');
    this.menu = document.getElementById('workspace-menu');
    if (!this.directionBtn || !this.menuBtn || !this.menu) return;

    this.buildLayeredMenu();
    this.directionBtn.addEventListener('click', () => this.toggleDirection());
    this.menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      this.menu.classList.contains('open') ? this.closeMenu() : this.openMenu();
    });
    this.menu.addEventListener('click', e => {
      e.stopPropagation();
      this.handleMainMenuClick(e);
    });
    this.sortMenu.addEventListener('click', e => {
      e.stopPropagation();
      this.handleSubmenuClick('sort', e);
    });
    this.groupMenu.addEventListener('click', e => {
      e.stopPropagation();
      this.handleSubmenuClick('group', e);
    });
    document.addEventListener('click', () => this.closeMenu());
    document.addEventListener('keydown', e => this.handleMenuKeydown(e));
    window.addEventListener('resize', () => this.repositionOpenSubmenu());
    window.visualViewport?.addEventListener('resize', () => this.repositionOpenSubmenu());
    this.syncUI();
  },

  buildLayeredMenu() {
    this.menu.innerHTML = `
      <div class="workspace-menu-label">View</div>
      <div class="workspace-view-switcher" role="group" aria-label="Task view">
        <button type="button" data-view-type="list" role="radio" aria-checked="true" aria-label="List view" title="List view">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <button type="button" data-view-type="kanban" role="radio" aria-checked="false" aria-label="Kanban view" title="Kanban view">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="4" y="5" width="5" height="14" rx="1"/><rect x="11" y="5" width="4" height="9" rx="1"/><rect x="17" y="5" width="3" height="11" rx="1"/></svg>
        </button>
        <button type="button" data-view-type="timeline" disabled aria-disabled="true" aria-label="Timeline view unavailable" title="Timeline view — unavailable">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M5 7h14M5 12h9M5 17h12" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="7" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>
        </button>
      </div>
      <div class="workspace-menu-divider"></div>
      <button type="button" class="workspace-submenu-trigger" id="workspace-sort-trigger" data-workspace-submenu="sort" aria-haspopup="menu" aria-expanded="false">
        <span class="workspace-menu-primary">Sort</span><span class="workspace-menu-current" id="workspace-sort-current">Custom</span><span class="workspace-menu-chevron" aria-hidden="true">›</span>
      </button>
      <button type="button" class="workspace-submenu-trigger" id="workspace-group-trigger" data-workspace-submenu="group" aria-haspopup="menu" aria-expanded="false">
        <span class="workspace-menu-primary">Group</span><span class="workspace-menu-current" id="workspace-group-current">None</span><span class="workspace-menu-chevron" aria-hidden="true">›</span>
      </button>`;

    this.sortTrigger = this.menu.querySelector('#workspace-sort-trigger');
    this.groupTrigger = this.menu.querySelector('#workspace-group-trigger');
    this.sortCurrent = this.menu.querySelector('#workspace-sort-current');
    this.groupCurrent = this.menu.querySelector('#workspace-group-current');
    this.sortMenu = this.createSubmenu('workspace-sort-menu', [
      ['custom', 'Custom'], ['dueDate', 'Due Date'], ['priority', 'Priority'], ['name', 'Name'], ['createdAt', 'Created Date']
    ], 'sort');
    this.groupMenu = this.createSubmenu('workspace-group-menu', [
      ['none', 'None'], ['priority', 'Priority'], ['date', 'Date'], ['project', 'Project'], ['tag', 'Tag']
    ], 'group');
  },

  createSubmenu(id, options, type) {
    document.getElementById(id)?.remove();
    const submenu = document.createElement('div');
    submenu.id = id;
    submenu.className = 'workspace-submenu';
    submenu.setAttribute('role', 'menu');
    submenu.setAttribute('aria-hidden', 'true');
    submenu.innerHTML = options.map(([value, label]) =>
      `<button type="button" data-${type}-key="${value}" role="menuitemradio" aria-checked="false">${label}</button>`
    ).join('');
    document.body.appendChild(submenu);
    return submenu;
  },

  openMenu() {
    window.SidebarComponent?.closeSidebarActionMenus();
    window.TasksComponent?.closeAllContextMenus();
    window.TasksComponent?.closeTaskActionMenu(false);
    this.menu.classList.add('open');
    this.menuBtn.setAttribute('aria-expanded', 'true');
    this.syncUI();
  },

  closeMenu() {
    this.closeSubmenu();
    this.menu?.classList.remove('open');
    this.menuBtn?.setAttribute('aria-expanded', 'false');
  },

  openSubmenu(type) {
    if (!this.menu.classList.contains('open')) return;
    this.closeSubmenu();
    const submenu = type === 'sort' ? this.sortMenu : this.groupMenu;
    const trigger = type === 'sort' ? this.sortTrigger : this.groupTrigger;
    this.activeSubmenu = type;
    submenu.classList.add('open');
    submenu.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('submenu-open');
    this.positionSubmenu(submenu, trigger);
  },

  closeSubmenu() {
    [this.sortMenu, this.groupMenu].forEach(menu => {
      menu?.classList.remove('open');
      menu?.setAttribute('aria-hidden', 'true');
    });
    [this.sortTrigger, this.groupTrigger].forEach(trigger => {
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.classList.remove('submenu-open');
    });
    this.activeSubmenu = null;
  },

  positionSubmenu(submenu, trigger) {
    const margin = 8;
    submenu.style.visibility = 'hidden';
    const menuRect = this.menu.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const subRect = submenu.getBoundingClientRect();
    let left = menuRect.left - subRect.width - 6;
    if (left < margin) left = menuRect.right + 6;
    left = Math.min(Math.max(margin, left), window.innerWidth - subRect.width - margin);
    const top = Math.min(
      Math.max(margin, triggerRect.top),
      window.innerHeight - subRect.height - margin
    );
    submenu.style.left = `${left}px`;
    submenu.style.top = `${Math.max(margin, top)}px`;
    submenu.style.visibility = '';
  },

  repositionOpenSubmenu() {
    if (!this.activeSubmenu) return;
    const submenu = this.activeSubmenu === 'sort' ? this.sortMenu : this.groupMenu;
    const trigger = this.activeSubmenu === 'sort' ? this.sortTrigger : this.groupTrigger;
    if (submenu?.classList.contains('open')) this.positionSubmenu(submenu, trigger);
  },

  handleMainMenuClick(e) {
    const trigger = e.target.closest('[data-workspace-submenu]');
    const viewItem = e.target.closest('[data-view-type]');
    if (trigger) {
      const type = trigger.dataset.workspaceSubmenu;
      this.activeSubmenu === type ? this.closeSubmenu() : this.openSubmenu(type);
      return;
    }
    if (viewItem && !viewItem.disabled) {
      this.closeSubmenu();
      this.setViewType(viewItem.dataset.viewType, { persist: true, render: false });
      this.syncUI();
      window.TasksComponent?.render();
      return;
    }
    if (this.activeSubmenu) this.closeSubmenu();
  },

  handleSubmenuClick(type, e) {
    const item = e.target.closest(type === 'sort' ? '[data-sort-key]' : '[data-group-key]');
    if (!item) return;
    if (type === 'sort') this.sortKey = this.normalizeSortKey(item.dataset.sortKey);
    else this.groupKey = item.dataset.groupKey;
    this.syncUI();
    window.TasksComponent?.render();
    this.closeSubmenu();
  },

  handleMenuKeydown(e) {
    if (e.key !== 'Escape' || !this.menu.classList.contains('open')) return;
    e.preventDefault();
    if (this.activeSubmenu) {
      const trigger = this.activeSubmenu === 'sort' ? this.sortTrigger : this.groupTrigger;
      this.closeSubmenu();
      trigger?.focus();
    } else {
      this.closeMenu();
      this.menuBtn.focus();
    }
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

  toggleDirection() {
    if (this.normalizeSortKey(this.sortKey) === 'custom') return;
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.syncUI();
    window.TasksComponent?.render();
  },

  syncUI() {
    this.sortKey = this.normalizeSortKey(this.sortKey);
    this.sortMenu?.querySelectorAll('[data-sort-key]').forEach(item => {
      const selected = this.normalizeSortKey(item.dataset.sortKey) === this.sortKey;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    this.groupMenu?.querySelectorAll('[data-group-key]').forEach(item => {
      const selected = item.dataset.groupKey === this.groupKey;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    this.menu?.querySelectorAll('[data-view-type]').forEach(item => {
      const selected = !item.disabled && item.dataset.viewType === this.viewType;
      item.classList.toggle('selected', selected);
      if (!item.disabled) item.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    const sortLabels = { custom: 'Custom', dueDate: 'Due Date', priority: 'Priority', name: 'Name', createdAt: 'Created Date' };
    const groupLabels = { none: 'None', priority: 'Priority', date: 'Date', project: 'Project', tag: 'Tag' };
    if (this.sortCurrent) this.sortCurrent.textContent = sortLabels[this.sortKey] || 'Custom';
    if (this.groupCurrent) this.groupCurrent.textContent = groupLabels[this.groupKey] || 'None';

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
