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
    this.projectListEl = document.getElementById('project-list');
    this.projectModal = document.getElementById('project-modal');
    this.projectForm = document.getElementById('project-form');
    this.projectNameInput = document.getElementById('project-name-input');
    this.projectIconTrigger = document.getElementById('project-icon-trigger');
    this.projectIconPicker = document.getElementById('project-icon-picker');
    this.projectParentSelect = document.getElementById('project-parent-select');
    this.projectModalTitle = document.getElementById('project-modal-title');
    this.projectSaveBtn = document.getElementById('btn-save-project');
    this.tagListEl = document.getElementById('tag-list');
    this.tagModal = document.getElementById('tag-modal');
    this.tagForm = document.getElementById('tag-form');
    this.tagNameInput = document.getElementById('tag-name-input');
    this.tagIconTrigger = document.getElementById('tag-icon-trigger');
    this.tagIconPicker = document.getElementById('tag-icon-picker');
    this.tagParentSelect = document.getElementById('tag-parent-select');
    this.tagModalTitle = document.getElementById('tag-modal-title');
    this.tagSaveBtn = document.getElementById('btn-save-tag');
    this.selectedProjectIcon = '●';
    this.selectedProjectView = 'list';
    this.editingProjectId = null;
    this.bindEvents();
    this.renderProjects();
    this.renderTags();
    this.updateCounts();
  },

  bindEvents() {
    this.toggleBtn?.addEventListener('click', () => this.toggleSidebar());
    this.backdropEl?.addEventListener('click', () => this.closeSidebar());

    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.addEventListener('click', e => this.selectFilter(e.currentTarget));
    });
    document.getElementById('btn-add-project')?.addEventListener('click', () => this.openProjectModal());
    document.getElementById('btn-add-tag')?.addEventListener('click', () => this.openTagModal());
    document.getElementById('btn-close-project-modal')?.addEventListener('click', () => this.closeProjectModal());
    document.getElementById('btn-close-tag-modal')?.addEventListener('click', () => this.closeTagModal());
    this.tagModal?.addEventListener('click', e => {
      if (e.target === this.tagModal) this.closeTagModal();
    });
    this.tagForm?.addEventListener('submit', e => {
      e.preventDefault();
      this.saveTag();
    });
    this.tagIconTrigger?.addEventListener('click', e => {
      e.stopPropagation();
      this.tagIconPicker?.classList.toggle('open');
      this.tagIconTrigger?.setAttribute('aria-expanded', this.tagIconPicker?.classList.contains('open') ? 'true' : 'false');
    });
    this.tagIconPicker?.querySelectorAll('[data-icon]').forEach(button => {
      button.addEventListener('click', () => this.selectTagIcon(button.dataset.icon));
    });
    this.projectModal?.addEventListener('click', e => {
      if (e.target === this.projectModal) this.closeProjectModal();
    });
    this.projectForm?.addEventListener('submit', e => {
      e.preventDefault();
      this.saveProject();
    });
    this.projectIconTrigger?.addEventListener('click', e => {
      e.stopPropagation();
      this.projectIconPicker?.classList.toggle('open');
      this.projectIconTrigger?.setAttribute('aria-expanded', this.projectIconPicker?.classList.contains('open') ? 'true' : 'false');
    });
    this.projectIconPicker?.querySelectorAll('[data-icon]').forEach(button => {
      button.addEventListener('click', () => this.selectProjectIcon(button.dataset.icon));
    });
    this.projectModal?.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeProjectModal();
    });
    this.tagModal?.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeTagModal();
    });
    document.addEventListener('click', () => {
      this.projectIconPicker?.classList.remove('open');
      this.tagIconPicker?.classList.remove('open');
      this.closeSidebarActionMenus();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeSidebarActionMenus();
    });
    this.tagListEl?.addEventListener('click', e => {
      const addChild = e.target.closest('[data-tag-add-child]');
      const edit = e.target.closest('[data-tag-edit]');
      const remove = e.target.closest('[data-tag-delete]');
      const item = e.target.closest('[data-tag-id]');
      if (addChild) {
        e.stopPropagation();
        this.closeSidebarActionMenus();
        this.openTagModal(null, addChild.dataset.tagAddChild);
      } else if (edit) {
        e.stopPropagation();
        this.closeSidebarActionMenus();
        this.openTagModal(edit.dataset.tagEdit);
      } else if (remove) {
        e.stopPropagation();
        this.closeSidebarActionMenus();
        this.deleteTag(remove.dataset.tagDelete);
      } else if (item) this.selectFilter(item);
    });
    this.projectListEl?.addEventListener('click', e => {
      const addChild = e.target.closest('[data-project-add-child]');
      const edit = e.target.closest('[data-project-edit]');
      const remove = e.target.closest('[data-project-delete]');
      const item = e.target.closest('[data-project-id]');
      if (addChild) {
        e.stopPropagation();
        this.closeSidebarActionMenus();
        this.openProjectModal(null, addChild.dataset.projectAddChild);
      } else if (edit) {
        e.stopPropagation();
        this.closeSidebarActionMenus();
        this.openProjectModal(edit.dataset.projectEdit);
      } else if (remove) {
        e.stopPropagation();
        this.closeSidebarActionMenus();
        this.deleteProject(remove.dataset.projectDelete);
      } else if (item) this.selectFilter(item);
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
    this.projectListEl?.querySelectorAll('.project-more-menu.open').forEach(menu => menu.classList.remove('open'));
    this.tagListEl?.querySelectorAll('.tag-more-menu.open').forEach(menu => menu.classList.remove('open'));
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
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    set('count-inbox', window.AppState.countInbox());
    set('count-today', window.AppState.countToday());
    set('count-completed', window.AppState.countCompleted());
    this.projectListEl?.querySelectorAll('[data-project-id]').forEach(item => {
      const count = item.querySelector('.item-count');
      if (count) count.textContent = window.AppState.countProject(item.dataset.projectId);
    });
    this.tagListEl?.querySelectorAll('[data-tag-id]').forEach(item => {
      const count = item.querySelector('.item-count');
      if (count) count.textContent = window.AppState.countTag(item.dataset.tagId);
    });
  }

};
Object.assign(window.SidebarComponent, window.SidebarProjectMethods, window.SidebarTagMethods);
