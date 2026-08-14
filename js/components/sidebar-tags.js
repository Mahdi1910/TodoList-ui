window.SidebarTagMethods = {
  renderTags() {
    if (!this.tagListEl) return;
    this.tagListEl.innerHTML = '';
    this.tagListEl.classList.add('sidebar-tree-root');
    this.tagListEl.dataset.taxonomyType = 'tag';
    this.tagListEl.dataset.treeParentId = '';
    window.TaxonomyOrder.getChildren('tag', null)
      .forEach(tag => this.tagListEl.appendChild(this.createTagTreeNode(tag, 0)));
  },

  createTagTreeNode(tag, depth = 0) {
    const node = document.createElement('div');
    node.className = 'sidebar-tree-node tag-tree-node';
    node.dataset.taxonomyType = 'tag';
    node.dataset.entityId = tag.id;
    node.dataset.parentId = tag.parentId || '';
    node.dataset.depth = String(depth);

    const item = document.createElement('div');
    item.className = 'sidebar-nav-item tag-nav-item';
    item.dataset.tag = tag.id;
    item.dataset.tagId = tag.id;
    item.dataset.title = tag.name;
    item.innerHTML = `<span class="item-left"><span class="tag-icon">${this.escapeHtml(tag.icon)}</span><span class="tag-name">${this.escapeHtml(tag.name)}</span></span><span class="tag-nav-right"><span class="item-count">${window.AppState.countTag(tag.id)}</span><button type="button" class="tag-more-btn" data-tag-menu="${tag.id}" aria-label="More options for ${this.escapeHtml(tag.name)}">⋯</button></span><div class="tag-more-menu" data-tag-menu-panel="${tag.id}"><button type="button" data-tag-add-child="${tag.id}">Add Sub-tag</button><button type="button" data-tag-edit="${tag.id}">Edit</button><button type="button" data-tag-delete="${tag.id}">Delete</button></div>`;
    item.querySelector('[data-tag-menu]').addEventListener('click', e => {
      e.stopPropagation();
      this.toggleSidebarActionMenu(item.querySelector('[data-tag-menu-panel]'));
    });

    const children = document.createElement('div');
    children.className = 'sidebar-tree-children';
    children.dataset.taxonomyType = 'tag';
    children.dataset.treeParentId = tag.id;
    window.TaxonomyOrder.getChildren('tag', tag.id)
      .forEach(child => children.appendChild(this.createTagTreeNode(child, depth + 1)));

    node.append(item, children);
    return node;
  },

  openTagModal(tagId = null, parentId = null) {
    this.editingTagId = tagId;
    const tag = tagId ? window.AppState.getTag(tagId) : null;
    this.tagModalTitle.textContent = tag ? 'Edit Tag' : 'New Tag';
    this.tagSaveBtn.textContent = tag ? 'Save Changes' : 'Create Tag';
    this.selectedTagIcon = tag?.icon || '●';
    this.selectedTagView = tag?.viewType || 'list';
    this.tagNameInput.value = tag?.name || '';
    this.tagIconTrigger.textContent = this.selectedTagIcon;
    this.tagIconPicker.classList.remove('open');
    this.tagIconTrigger.setAttribute('aria-expanded', 'false');
    this.tagIconPicker.querySelectorAll('[data-icon]').forEach(button => button.classList.toggle('selected', button.dataset.icon === this.selectedTagIcon));
    this.tagParentSelect.innerHTML = '<option value="">No parent (top-level tag)</option>';
    window.TaxonomyOrder.flattenTree('tag').forEach(({ item: candidate, depth }) => {
      if (candidate.id === tagId || window.AppState.isTagDescendant(candidate.id, tagId)) return;
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = `${'  '.repeat(depth)}${candidate.icon} ${candidate.name}`;
      this.tagParentSelect.appendChild(option);
    });
    this.tagParentSelect.value = tag?.parentId || parentId || '';
    this.tagModal.querySelectorAll('[data-tag-view]').forEach(button => {
      const selected = button.dataset.tagView === this.selectedTagView;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
      button.onclick = () => {
        this.selectedTagView = button.dataset.tagView;
        this.tagModal.querySelectorAll('[data-tag-view]').forEach(option => {
          const isSelected = option === button;
          option.classList.toggle('selected', isSelected);
          option.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        });
      };
    });
    window.ModalFocusManager.open(this.tagModal, {
      trigger: document.activeElement,
      initialFocus: this.tagNameInput,
      fallbackFocus: document.getElementById('btn-add-tag') || this.toggleBtn
    });
    document.body.classList.add('modal-open');
  },

  selectTagIcon(icon) {
    this.selectedTagIcon = icon;
    this.tagIconTrigger.textContent = icon;
    this.tagIconPicker.querySelectorAll('[data-icon]').forEach(button => button.classList.toggle('selected', button.dataset.icon === icon));
    this.tagIconPicker.classList.remove('open');
    this.tagIconTrigger.setAttribute('aria-expanded', 'false');
    this.tagNameInput?.focus();
  },

  async saveTag() {
    const name = this.tagNameInput.value.trim();
    if (!name) return this.tagNameInput.reportValidity();
    const data = {
      name,
      icon: this.selectedTagIcon,
      viewType: this.selectedTagView,
      parentId: this.tagParentSelect.value || null
    };
    this.tagSaveBtn.disabled = true;
    try {
      if (this.editingTagId) await window.AppDataService.updateTag(this.editingTagId, data);
      else await window.AppDataService.createTag(data);
      this.closeTagModal();
      this.renderTags();
      window.TasksComponent?.renderTagMenu();
      this.syncCurrentView();
      this.updateCounts();
      window.TasksComponent?.render();
    } catch (error) {
      window.AppPersistence.reportError('Could not save this tag.', error);
    } finally {
      this.tagSaveBtn.disabled = false;
    }
  },

  async deleteTag(tagId) {
    const tag = window.AppState.getTag(tagId);
    if (!tag) return;
    if (!window.confirm(`Delete tag "${tag.name}"? Child tags will become top-level tags.`)) return;
    try {
      await window.AppDataService.deleteTag(tagId);
      this.renderTags();
      window.TasksComponent?.renderTagMenu();
      this.syncCurrentView();
      this.updateCounts();
      window.TasksComponent?.render();
    } catch (error) {
      window.AppPersistence.reportError('Could not delete this tag.', error);
    }
  },

  closeTagModal() {
    window.ModalFocusManager.close(this.tagModal, {
      fallbackFocus: document.getElementById('btn-add-tag') || this.toggleBtn
    });
    document.body.classList.remove('modal-open');
    this.tagIconPicker?.classList.remove('open');
    this.editingTagId = null;
  },
};