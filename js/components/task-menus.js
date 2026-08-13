window.TaskMenuMethods = {
  createProjectMenuItem(project) {
    const item = document.createElement('div');
    const selected = project.id === this.selectedProject;
    item.className = `context-menu-item${selected ? ' selected' : ''}`;
    item.dataset.project = project.id;
    item.setAttribute('role', 'option');
    item.setAttribute('tabindex', '-1');
    item.setAttribute('aria-selected', selected ? 'true' : 'false');

    const icon = document.createElement('span');
    icon.className = 'project-icon';
    icon.textContent = String(project.icon ?? '');

    const label = document.createElement('span');
    label.textContent = String(project.name ?? '');

    item.append(icon, document.createTextNode(' '), label);
    return item;
  },

  createTagMenuItem(tag, depth = 0) {
    const item = document.createElement('div');
    const selected = this.selectedTags.includes(tag.id);
    item.className = `context-menu-item multiselect${selected ? ' selected' : ''}`;
    item.dataset.tag = tag.id;
    item.style.paddingLeft = `${12 + depth * 16}px`;
    item.setAttribute('role', 'option');
    item.setAttribute('tabindex', '-1');
    item.setAttribute('aria-selected', selected ? 'true' : 'false');

    const check = document.createElement('span');
    check.className = 'check-box-icon';

    const label = document.createElement('span');
    label.textContent = `${String(tag.icon ?? '')} ${String(tag.name ?? '')}`;

    item.append(check, label);
    return item;
  },

  renderProjectMenu() {
    if (!this.menuProject) return;
    this.menuProject.innerHTML = '';

    const inboxItem = document.createElement('div');
    inboxItem.className = `context-menu-item${this.selectedProject === '' ? ' selected' : ''}`;
    inboxItem.dataset.project = '';
    inboxItem.textContent = 'Inbox';
    inboxItem.setAttribute('role', 'option');
    inboxItem.setAttribute('tabindex', '-1');
    inboxItem.setAttribute('aria-selected', this.selectedProject === '' ? 'true' : 'false');
    this.menuProject.appendChild(inboxItem);

    window.AppState.projects.forEach(project => {
      this.menuProject.appendChild(this.createProjectMenuItem(project));
    });
  },

  renderTagMenu() {
    if (!this.menuTags) return;
    this.menuTags.innerHTML = '';
    const renderLevel = (parentId, depth = 0) => {
      window.AppState.tags.filter(tag => (tag.parentId || null) === parentId).forEach(tag => {
        this.menuTags.appendChild(this.createTagMenuItem(tag, depth));
        renderLevel(tag.id, depth + 1);
      });
    };
    renderLevel(null);
    this.bindTagMenuItems();
  },

  bindProjectMenuTrigger() {
    if (!this.btnProject || !this.menuProject) return;
    this.btnProject.setAttribute('aria-haspopup', 'listbox');
    this.btnProject.setAttribute('aria-expanded', 'false');
    this.menuProject.setAttribute('role', 'listbox');
    this.btnProject.addEventListener('click', e => {
      e.stopPropagation();
      this.toggleContextMenu(this.menuProject, this.btnProject);
    });
    this.btnProject.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.openContextMenu(this.menuProject, this.btnProject);
      }
    });
    this.menuProject.addEventListener('click', e => {
      const item = e.target.closest('.context-menu-item');
      if (!item) return;
      e.stopPropagation();
      this.selectMenuItem(item, this.menuProject, 'single', 'project');
    });
    this.menuProject.addEventListener('keydown', e => {
      const item = e.target.closest('.context-menu-item');
      if (item) this.handleMenuKeydown(e, item, this.menuProject, 'single', 'project');
    });
  },

  bindTagMenuTrigger() {
    if (!this.btnTags || !this.menuTags) return;
    this.btnTags.setAttribute('aria-haspopup', 'listbox');
    this.btnTags.setAttribute('aria-expanded', 'false');
    this.menuTags.setAttribute('role', 'listbox');
    this.btnTags.addEventListener('click', e => {
      e.stopPropagation();
      this.toggleContextMenu(this.menuTags, this.btnTags);
    });
    this.btnTags.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.openContextMenu(this.menuTags, this.btnTags);
      }
    });
  },

  bindTagMenuItems() {
    this.menuTags?.querySelectorAll('.context-menu-item').forEach(item => {
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '-1');
      item.addEventListener('click', e => {
        e.stopPropagation();
        this.selectMenuItem(item, this.menuTags, 'multi', 'tag');
      });
      item.addEventListener('keydown', e => this.handleMenuKeydown(e, item, this.menuTags, 'multi', 'tag'));
    });
  },

  bindContextMenu(trigger, menu, mode, key) {
    if (!trigger || !menu) return;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    menu.setAttribute('role', 'listbox');
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '-1');
      item.setAttribute('aria-selected', item.classList.contains('selected') ? 'true' : 'false');
      item.addEventListener('click', e => {
        e.stopPropagation();
        this.selectMenuItem(item, menu, mode, key);
      });
      item.addEventListener('keydown', e => this.handleMenuKeydown(e, item, menu, mode, key));
    });
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      this.toggleContextMenu(menu, trigger);
    });
    trigger.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.openContextMenu(menu, trigger);
      }
    });
  },

  selectMenuItem(item, menu, mode, key) {
    const value = item.dataset[key];
    if (mode === 'multi') {
      item.classList.toggle('selected');
      if (item.classList.contains('selected')) {
        if (!this.selectedTags.includes(value)) this.selectedTags.push(value);
      } else {
        this.selectedTags = this.selectedTags.filter(tag => tag !== value);
      }
    } else {
      menu.querySelectorAll('.context-menu-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      if (key === 'priority') this.selectedPriority = value;
      if (key === 'project') this.selectedProject = value;
    }
    this.syncMenuSelection(menu);
    const trigger = menu.previousElementSibling;
    const shouldBeActive = mode === 'multi'
      ? this.selectedTags.length > 0
      : (key === 'project' ? Boolean(this.selectedProject)
        : key === 'priority' ? Boolean(this.selectedPriority) : true);
    trigger?.classList.toggle('active', shouldBeActive);
    if (mode === 'single') this.closeContextMenu(menu, trigger);
  },

  syncMenuSelection(menu) {
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      item.setAttribute('aria-selected', item.classList.contains('selected') ? 'true' : 'false');
    });
  },
  toggleContextMenu(menu, trigger) {
    if (menu.classList.contains('open')) this.closeContextMenu(menu, trigger);
    else this.openContextMenu(menu, trigger);
  },

  openContextMenu(menu, trigger) {
    window.WorkspaceControls?.closeMenu();
    this.closeTaskActionMenu?.(false);
    this.closeAllContextMenus();
    menu.classList.add('open');
    trigger?.setAttribute('aria-expanded', 'true');
    const first = menu.querySelector('.context-menu-item.selected') || menu.querySelector('.context-menu-item');
    first?.focus();
  },

  closeContextMenu(menu, trigger = menu?.previousElementSibling) {
    menu?.classList.remove('open');
    trigger?.setAttribute('aria-expanded', 'false');
  },

  closeAllContextMenus() {
    [this.menuPriority, this.menuTags, this.menuProject].forEach(menu => {
      if (menu) this.closeContextMenu(menu);
    });
  },

  handleMenuKeydown(e, item, menu, mode, key) {
    const items = [...menu.querySelectorAll('.context-menu-item')];
    const index = items.indexOf(item);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items.at(-1)?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.selectMenuItem(item, menu, mode, key);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const trigger = menu.previousElementSibling;
      this.closeContextMenu(menu, trigger);
      trigger?.focus();
    }
  },

};
