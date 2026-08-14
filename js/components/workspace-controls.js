window.WorkspaceControls = {
  sortKey: 'custom',
  sortDirection: 'asc',
  groupKey: 'none',
  viewType: 'list',
  settingsPanelOpen: false,

  init() {
    const settings = window.AppState.settings || {};
    this.sortKey = this.normalizeSortKey(settings.sortKey || 'custom');
    this.sortDirection = settings.sortDirection === 'desc' ? 'desc' : 'asc';
    this.groupKey = ['none', 'priority', 'date', 'project', 'tag'].includes(settings.groupKey) ? settings.groupKey : 'none';

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
    this.settingsPanel.addEventListener('click', e => {
      e.stopPropagation();
      this.handleSettingsPanelClick(e);
    });
    document.addEventListener('click', () => {
      if (this.settingsPanelOpen) {
        this.closeSettingsPanel();
        return;
      }
      this.closeMenu();
    });
    document.addEventListener('keydown', e => this.handleMenuKeydown(e));
    window.addEventListener('resize', () => this.repositionSettingsPanel());
    window.visualViewport?.addEventListener('resize', () => this.repositionSettingsPanel());
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
      <button type="button" class="workspace-submenu-trigger" id="workspace-sort-group-trigger" aria-haspopup="dialog" aria-controls="workspace-sort-group-panel" aria-expanded="false">
        <span class="workspace-menu-primary">Sort &amp; Group</span>
        <span class="workspace-menu-chevron" aria-hidden="true">›</span>
      </button>`;

    this.settingsTrigger = this.menu.querySelector('#workspace-sort-group-trigger');
    this.settingsPanel = this.createSortGroupPanel();
  },

  createSortGroupPanel() {
    document.getElementById('workspace-sort-group-panel')?.remove();
    const panel = document.createElement('div');
    panel.id = 'workspace-sort-group-panel';
    panel.className = 'workspace-settings-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Sort and group settings');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <section class="workspace-settings-section" aria-labelledby="workspace-sort-label">
        <div class="workspace-settings-label" id="workspace-sort-label">Sort</div>
        <div class="workspace-option-chips" role="radiogroup" aria-label="Sort tasks">
          ${this.optionChip('sort', 'custom', 'Custom')}
          ${this.optionChip('sort', 'dueDate', 'Due Date')}
          ${this.optionChip('sort', 'priority', 'Priority')}
          ${this.optionChip('sort', 'name', 'Name')}
          ${this.optionChip('sort', 'createdAt', 'Created Date')}
        </div>
      </section>
      <div class="workspace-settings-divider"></div>
      <section class="workspace-settings-section" aria-labelledby="workspace-group-label">
        <div class="workspace-settings-label" id="workspace-group-label">Group</div>
        <div class="workspace-option-chips" role="radiogroup" aria-label="Group tasks">
          ${this.optionChip('group', 'none', 'None')}
          ${this.optionChip('group', 'priority', 'Priority')}
          ${this.optionChip('group', 'date', 'Date')}
          ${this.optionChip('group', 'project', 'Project')}
          ${this.optionChip('group', 'tag', 'Tag')}
        </div>
      </section>`;
    document.body.appendChild(panel);
    return panel;
  },

  optionChip(type, value, label) {
    return `<button type="button" class="workspace-option-chip" data-${type}-key="${value}" role="radio" aria-checked="false">${label}</button>`;
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
    this.closeSettingsPanel();
    this.menu?.classList.remove('open');
    this.menuBtn?.setAttribute('aria-expanded', 'false');
  },

  toggleSettingsPanel() {
    this.settingsPanelOpen ? this.closeSettingsPanel() : this.openSettingsPanel();
  },

  openSettingsPanel() {
    if (!this.menu.classList.contains('open')) return;
    this.settingsPanelOpen = true;
    this.settingsPanel.classList.add('open');
    this.settingsPanel.setAttribute('aria-hidden', 'false');
    this.settingsTrigger.setAttribute('aria-expanded', 'true');
    this.settingsTrigger.classList.add('submenu-open');
    this.syncUI();
    this.positionSettingsPanel();
  },

  closeSettingsPanel() {
    this.settingsPanelOpen = false;
    this.settingsPanel?.classList.remove('open');
    this.settingsPanel?.setAttribute('aria-hidden', 'true');
    this.settingsTrigger?.setAttribute('aria-expanded', 'false');
    this.settingsTrigger?.classList.remove('submenu-open');
  },

  positionSettingsPanel() {
    if (!this.settingsPanelOpen) return;
    const margin = 8;
    this.settingsPanel.style.visibility = 'hidden';
    const menuRect = this.menu.getBoundingClientRect();
    const panelRect = this.settingsPanel.getBoundingClientRect();
    let left = menuRect.right - panelRect.width;
    let top = menuRect.top;
    left = Math.min(Math.max(margin, left), window.innerWidth - panelRect.width - margin);
    top = Math.min(Math.max(margin, top), window.innerHeight - panelRect.height - margin);
    this.settingsPanel.style.left = `${Math.max(margin, left)}px`;
    this.settingsPanel.style.top = `${Math.max(margin, top)}px`;
    this.settingsPanel.style.visibility = '';
  },

  repositionSettingsPanel() {
    if (this.settingsPanelOpen) this.positionSettingsPanel();
  },

  async handleMainMenuClick(e) {
    if (e.target.closest('#workspace-sort-group-trigger')) {
      this.toggleSettingsPanel();
      return;
    }
    const viewItem = e.target.closest('[data-view-type]');
    if (viewItem && !viewItem.disabled) {
      this.closeSettingsPanel();
      await this.setViewType(viewItem.dataset.viewType, { persist: true, render: true });
    }
  },

  async handleSettingsPanelClick(e) {
    const sortItem = e.target.closest('[data-sort-key]');
    const groupItem = e.target.closest('[data-group-key]');
    if (!sortItem && !groupItem) return;
    try {
      if (sortItem) {
        const value = this.normalizeSortKey(sortItem.dataset.sortKey);
        await window.AppDataService.setSetting('sortKey', value);
        this.sortKey = value;
      }
      if (groupItem) {
        const value = groupItem.dataset.groupKey;
        await window.AppDataService.setSetting('groupKey', value);
        this.groupKey = value;
      }
      this.syncUI();
      window.TasksComponent?.render();
    } catch (error) {
      window.AppPersistence.reportError('Could not save the Sort & Group setting.', error);
    }
  },

  handleMenuKeydown(e) {
    if (e.key !== 'Escape' || !this.menu.classList.contains('open')) return;
    e.preventDefault();
    if (this.settingsPanelOpen) {
      this.closeSettingsPanel();
      this.settingsTrigger?.focus();
      return;
    }
    this.closeMenu();
    this.menuBtn.focus();
  },

  normalizeSortKey(sortKey) {
    return sortKey === 'default' ? 'custom' : sortKey;
  },

  normalizeViewType(viewType) {
    return viewType === 'kanban' ? 'kanban' : 'list';
  },

  async setViewType(viewType, { persist = true, render = true } = {}) {
    const next = this.normalizeViewType(viewType);
    try {
      if (persist && window.AppState.currentFilterType === 'project') {
        await window.AppDataService.setEntityViewType('project', window.AppState.currentFilter, next);
      } else if (persist && window.AppState.currentFilterType === 'tag') {
        await window.AppDataService.setEntityViewType('tag', window.AppState.currentFilter, next);
      }
      this.viewType = next;
      this.syncUI();
      if (render) window.TasksComponent?.render();
      return next;
    } catch (error) {
      window.AppPersistence.reportError('Could not save the selected view.', error);
      return this.viewType;
    }
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
    return this.setViewType(this.viewType, { persist: true, render: false });
  },

  async toggleDirection() {
    if (this.normalizeSortKey(this.sortKey) === 'custom') return;
    const next = this.sortDirection === 'asc' ? 'desc' : 'asc';
    try {
      await window.AppDataService.setSetting('sortDirection', next);
      this.sortDirection = next;
      this.syncUI();
      window.TasksComponent?.render();
    } catch (error) {
      window.AppPersistence.reportError('Could not save sort direction.', error);
    }
  },

  syncUI() {
    this.sortKey = this.normalizeSortKey(this.sortKey);
    this.settingsPanel?.querySelectorAll('[data-sort-key]').forEach(item => {
      const selected = this.normalizeSortKey(item.dataset.sortKey) === this.sortKey;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    this.settingsPanel?.querySelectorAll('[data-group-key]').forEach(item => {
      const selected = item.dataset.groupKey === this.groupKey;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    this.menu?.querySelectorAll('[data-view-type]').forEach(item => {
      const selected = !item.disabled && item.dataset.viewType === this.viewType;
      item.classList.toggle('selected', selected);
      if (!item.disabled) item.setAttribute('aria-checked', selected ? 'true' : 'false');
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
