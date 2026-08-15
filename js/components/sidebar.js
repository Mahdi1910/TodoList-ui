/**
 * Sidebar Component Handler
 * Manages drawer state, filters, counts, and accessible navigation state.
 */

window.SidebarComponent = {
  init() {
    this.sidebarEl = document.getElementById('secondary-sidebar');
    this.backdropEl = document.getElementById('sidebar-backdrop');
    this.toggleBtn = document.getElementById('btn-toggle-sidebar');
    this.viewTitleEl = document.getElementById('current-view-title');
    this.taxonomyConfigs = [window.SidebarProjectConfig, window.SidebarTagConfig].filter(Boolean);
    this.taxonomyConfigs.forEach(config => window.SidebarTaxonomyCore.initialize(this, config));
    this.bindEvents();
    this.renderProjects();
    this.renderTags();
    this.updateCounts();
  },

  bindEvents() {
    this.toggleBtn?.addEventListener('click', () => this.toggleSidebar());
    this.backdropEl?.addEventListener('click', () => this.closeSidebar());

    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.addEventListener('click', event => this.selectFilter(event.currentTarget));
    });

    this.taxonomyConfigs.forEach(config => window.SidebarTaxonomyCore.bindEvents(this, config));

    document.addEventListener('click', () => {
      this.taxonomyConfigs.forEach(config => window.SidebarTaxonomyCore.closeIconPicker(this, config));
      this.closeSidebarActionMenus();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.closeSidebarActionMenus();
    });
  },

  selectFilter(targetBtn) {
    this.closeSidebarActionMenus();
    document.querySelectorAll('.sidebar-nav-item').forEach(item => item.classList.remove('active'));
    targetBtn.classList.add('active');

    if (targetBtn.dataset.filter) {
      window.AppState.currentFilter = targetBtn.dataset.filter;
      window.AppState.currentFilterType = 'smart';
    } else if (targetBtn.dataset.project) {
      window.AppState.currentFilter = targetBtn.dataset.project;
      window.AppState.currentFilterType = 'project';
    } else if (targetBtn.dataset.tag) {
      window.AppState.currentFilter = targetBtn.dataset.tag;
      window.AppState.currentFilterType = 'tag';
    }

    const title = targetBtn.dataset.title || targetBtn.querySelector('.item-left')?.textContent.trim() || 'Inbox';
    if (this.viewTitleEl) this.viewTitleEl.textContent = title;
    window.WorkspaceControls?.syncViewFromCurrentFilter();
    this.closeSidebar();
    window.TasksComponent?.render();
  },

  syncCurrentView() {
    const items = [...document.querySelectorAll('.sidebar-nav-item')];
    let target = null;
    if (window.AppState.currentFilterType === 'smart') {
      target = items.find(item => item.dataset.filter === window.AppState.currentFilter);
    } else if (window.AppState.currentFilterType === 'project') {
      target = items.find(item => item.dataset.project === window.AppState.currentFilter);
    } else if (window.AppState.currentFilterType === 'tag') {
      target = items.find(item => item.dataset.tag === window.AppState.currentFilter);
    }
    if (!target) {
      window.AppState.currentFilter = 'inbox';
      window.AppState.currentFilterType = 'smart';
      target = items.find(item => item.dataset.filter === 'inbox');
    }
    items.forEach(item => item.classList.toggle('active', item === target));
    const title = target?.dataset.title || target?.querySelector('.item-left')?.textContent.trim() || 'Inbox';
    if (this.viewTitleEl) this.viewTitleEl.textContent = title;
    window.WorkspaceControls?.syncViewFromCurrentFilter();
  },

  closeSidebarActionMenus() {
    this.taxonomyConfigs.forEach(config => {
      this[`${config.entityType}ListEl`]?.querySelectorAll(`.${config.entityType}-more-menu.open`)
        .forEach(menu => menu.classList.remove('open'));
    });
  },

  toggleSidebarActionMenu(menu) {
    const wasOpen = menu?.classList.contains('open');
    window.WorkspaceControls?.closeMenu();
    window.TasksComponent?.closeTaskActionMenu(false);
    this.closeSidebarActionMenus();
    if (menu && !wasOpen) menu.classList.add('open');
  },

  escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  },

  toggleSidebar() {
    if (this.sidebarEl?.classList.contains('open')) this.closeSidebar();
    else this.openSidebar();
  },

  openSidebar() {
    this.sidebarEl?.classList.add('open');
    this.backdropEl?.classList.add('active');
    this.sidebarEl?.setAttribute('aria-hidden', 'false');
    this.toggleBtn?.setAttribute('aria-expanded', 'true');
  },

  closeSidebar() {
    this.sidebarEl?.classList.remove('open');
    this.backdropEl?.classList.remove('active');
    this.sidebarEl?.setAttribute('aria-hidden', 'true');
    this.toggleBtn?.setAttribute('aria-expanded', 'false');
  },

  updateCounts() {
    const set = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    set('count-inbox', window.AppState.countInbox());
    set('count-today', window.AppState.countToday());
    set('count-completed', window.AppState.countCompleted());

    this.taxonomyConfigs.forEach(config => {
      const list = this[`${config.entityType}ListEl`];
      const countMethod = `count${config.stem}`;
      list?.querySelectorAll(`[data-${config.entityType}-id]`).forEach(item => {
        const count = item.querySelector('.item-count');
        if (count) count.textContent = window.AppState[countMethod](item.dataset[`${config.entityType}Id`]);
      });
    });
  }
};

Object.assign(window.SidebarComponent, window.SidebarProjectMethods, window.SidebarTagMethods);
