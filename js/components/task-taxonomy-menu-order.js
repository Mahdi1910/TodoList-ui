window.TaskTaxonomyMenuOrderMethods = {
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

    window.TaxonomyOrder.flattenTree('project').forEach(({ item: project }) => {
      const item = document.createElement('div');
      item.className = `context-menu-item${project.id === this.selectedProject ? ' selected' : ''}`;
      item.dataset.project = project.id;
      item.innerHTML = `<span class="project-icon">${this.escapeText(project.icon)}</span> ${this.escapeText(project.name)}`;
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '-1');
      item.setAttribute('aria-selected', project.id === this.selectedProject ? 'true' : 'false');
      this.menuProject.appendChild(item);
    });
  },

  renderTagMenu() {
    if (!this.menuTags) return;
    this.menuTags.innerHTML = '';
    const renderLevel = (parentId, depth = 0) => {
      window.TaxonomyOrder.getChildren('tag', parentId).forEach(tag => {
        const item = document.createElement('div');
        item.className = `context-menu-item multiselect${this.selectedTags.includes(tag.id) ? ' selected' : ''}`;
        item.dataset.tag = tag.id;
        item.style.paddingLeft = `${12 + depth * 16}px`;
        item.innerHTML = `<span class="check-box-icon"></span><span>${this.escapeText(tag.icon)} ${this.escapeText(tag.name)}</span>`;
        item.setAttribute('role', 'option');
        item.setAttribute('tabindex', '-1');
        item.setAttribute('aria-selected', this.selectedTags.includes(tag.id) ? 'true' : 'false');
        this.menuTags.appendChild(item);
        renderLevel(tag.id, depth + 1);
      });
    };
    renderLevel(null);
    this.bindTagMenuItems();
  }
};

Object.assign(window.TaskMenuMethods, window.TaskTaxonomyMenuOrderMethods);
Object.assign(window.TasksComponent, window.TaskTaxonomyMenuOrderMethods);
