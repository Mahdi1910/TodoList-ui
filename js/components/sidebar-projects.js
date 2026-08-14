window.SidebarProjectMethods = {
  renderProjects() {
    if (!this.projectListEl) return;
    this.projectListEl.innerHTML = '';
    this.projectListEl.classList.add('sidebar-tree-root');
    this.projectListEl.dataset.taxonomyType = 'project';
    this.projectListEl.dataset.treeParentId = '';
    window.TaxonomyOrder.getChildren('project', null)
      .forEach(project => this.projectListEl.appendChild(this.createProjectTreeNode(project, 0)));
  },

  createProjectTreeNode(project, depth = 0) {
    const node = document.createElement('div');
    node.className = 'sidebar-tree-node project-tree-node';
    node.dataset.taxonomyType = 'project';
    node.dataset.entityId = project.id;
    node.dataset.parentId = project.parentId || '';
    node.dataset.depth = String(depth);

    const item = document.createElement('div');
    item.className = 'sidebar-nav-item project-nav-item';
    item.dataset.project = project.id;
    item.dataset.projectId = project.id;
    item.dataset.title = project.name;
    item.innerHTML = `<span class="item-left"><span class="project-icon">${this.escapeHtml(project.icon)}</span><span class="project-name">${this.escapeHtml(project.name)}</span></span><span class="project-nav-right"><span class="item-count">${window.AppState.countProject(project.id)}</span><button type="button" class="project-more-btn" data-project-menu="${project.id}" aria-label="More options for ${this.escapeHtml(project.name)}">⋯</button></span><div class="project-more-menu" data-project-menu-panel="${project.id}"><button type="button" data-project-add-child="${project.id}">Add Sub-project</button><button type="button" data-project-edit="${project.id}">Edit</button><button type="button" data-project-delete="${project.id}">Delete</button></div>`;
    item.querySelector('[data-project-menu]').addEventListener('click', e => {
      e.stopPropagation();
      this.toggleSidebarActionMenu(item.querySelector('[data-project-menu-panel]'));
    });

    const children = document.createElement('div');
    children.className = 'sidebar-tree-children';
    children.dataset.taxonomyType = 'project';
    children.dataset.treeParentId = project.id;
    window.TaxonomyOrder.getChildren('project', project.id)
      .forEach(child => children.appendChild(this.createProjectTreeNode(child, depth + 1)));

    node.append(item, children);
    return node;
  },

  openProjectModal(projectId = null, parentId = null) {
    this.editingProjectId = projectId;
    const project = projectId ? window.AppState.getProject(projectId) : null;
    this.projectModalTitle.textContent = project ? 'Edit Project' : 'New Project';
    this.projectSaveBtn.textContent = project ? 'Save Changes' : 'Create Project';
    this.selectedProjectIcon = project?.icon || '●';
    this.selectedProjectView = project?.viewType || 'list';
    this.projectNameInput.value = project?.name || '';
    this.projectIconTrigger.textContent = this.selectedProjectIcon;
    this.projectIconPicker.classList.remove('open');
    this.projectIconTrigger.setAttribute('aria-expanded', 'false');
    this.projectIconPicker.querySelectorAll('[data-icon]').forEach(button => button.classList.toggle('selected', button.dataset.icon === this.selectedProjectIcon));

    if (this.projectParentSelect) {
      this.projectParentSelect.innerHTML = '<option value="">No parent (top-level project)</option>';
      window.TaxonomyOrder.flattenTree('project').forEach(({ item: candidate, depth }) => {
        if (candidate.id === projectId || window.AppState.isProjectDescendant(candidate.id, projectId)) return;
        const option = document.createElement('option');
        option.value = candidate.id;
        option.textContent = `${'  '.repeat(depth)}${candidate.icon} ${candidate.name}`;
        this.projectParentSelect.appendChild(option);
      });
      this.projectParentSelect.value = project?.parentId || parentId || '';
    }
    this.projectModal.querySelectorAll('.project-view-option').forEach(button => {
      const selected = button.dataset.view === this.selectedProjectView;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
      button.onclick = () => {
        this.selectedProjectView = button.dataset.view;
        this.projectModal.querySelectorAll('.project-view-option').forEach(option => {
          const isSelected = option === button;
          option.classList.toggle('selected', isSelected);
          option.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        });
      };
    });
    this.projectModal.classList.add('active');
    this.projectModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => this.projectNameInput?.focus());
  },

  selectProjectIcon(icon) {
    this.selectedProjectIcon = icon;
    this.projectIconTrigger.textContent = icon;
    this.projectIconPicker.querySelectorAll('[data-icon]').forEach(button => button.classList.toggle('selected', button.dataset.icon === icon));
    this.projectIconPicker.classList.remove('open');
    this.projectIconTrigger.setAttribute('aria-expanded', 'false');
    this.projectNameInput?.focus();
  },

  async saveProject() {
    const name = this.projectNameInput.value.trim();
    if (!name) return this.projectNameInput.reportValidity();
    const data = {
      name,
      icon: this.selectedProjectIcon,
      viewType: this.selectedProjectView,
      parentId: this.projectParentSelect?.value || null
    };
    this.projectSaveBtn.disabled = true;
    try {
      if (this.editingProjectId) await window.AppDataService.updateProject(this.editingProjectId, data);
      else await window.AppDataService.createProject(data);
      this.closeProjectModal();
      this.renderProjects();
      window.TasksComponent?.renderProjectMenu();
      this.syncCurrentView();
      this.updateCounts();
      window.TasksComponent?.render();
    } catch (error) {
      window.AppPersistence.reportError('Could not save this project.', error);
    } finally {
      this.projectSaveBtn.disabled = false;
    }
  },

  async deleteProject(projectId) {
    const project = window.AppState.getProject(projectId);
    if (!project) return;
    if (!window.confirm(`Delete project "${project.name}"? Its direct sub-projects will become top-level.`)) return;
    try {
      await window.AppDataService.deleteProject(projectId);
      this.renderProjects();
      window.TasksComponent?.renderProjectMenu();
      this.syncCurrentView();
      this.updateCounts();
      window.TasksComponent?.render();
    } catch (error) {
      window.AppPersistence.reportError('Could not delete this project.', error);
    }
  },

  closeProjectModal() {
    this.projectModal?.classList.remove('active');
    this.projectModal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    this.projectIconPicker?.classList.remove('open');
    this.editingProjectId = null;
  },
};
