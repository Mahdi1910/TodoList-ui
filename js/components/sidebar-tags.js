window.SidebarTagMethods = {
  renderTags() {
    if (!this.tagListEl) return;
    this.tagListEl.innerHTML = '';
    const renderLevel = (parentId, depth = 0) => {
      window.AppState.tags.filter(tag => (tag.parentId || null) === parentId).forEach(tag => {
        const item = document.createElement('div');
        item.className = 'sidebar-nav-item tag-nav-item';
        item.dataset.tag = tag.id;
        item.dataset.tagId = tag.id;
        item.dataset.title = tag.name;
        item.style.paddingLeft = `${8 + depth * 18}px`;
        item.innerHTML = `<span class="item-left"><span class="tag-icon">${this.escapeHtml(tag.icon)}</span><span class="tag-name">${this.escapeHtml(tag.name)}</span></span><span class="tag-nav-right"><span class="item-count">${window.AppState.countTag(tag.id)}</span><button type="button" class="tag-more-btn" data-tag-menu="${tag.id}" aria-label="More options for ${this.escapeHtml(tag.name)}">⋯</button></span><div class="tag-more-menu" data-tag-menu-panel="${tag.id}"><button type="button" data-tag-add-child="${tag.id}">Add Sub-tag</button><button type="button" data-tag-edit="${tag.id}">Edit</button><button type="button" data-tag-delete="${tag.id}">Delete</button></div>`;
        item.querySelector('[data-tag-menu]').addEventListener('click', e => {
          e.stopPropagation();
          this.toggleSidebarActionMenu(item.querySelector('[data-tag-menu-panel]'));
        });
        this.tagListEl.appendChild(item);
        renderLevel(tag.id, depth + 1);
      });
    };
    renderLevel(null);
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
    window.AppState.tags.filter(candidate => candidate.id !== tagId && !window.AppState.isTagDescendant(candidate.id, tagId)).forEach(candidate => {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = `${candidate.icon} ${candidate.name}`;
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
    this.tagModal.classList.add('active');
    this.tagModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => this.tagNameInput?.focus());
  },

  selectTagIcon(icon) {
    this.selectedTagIcon = icon;
    this.tagIconTrigger.textContent = icon;
    this.tagIconPicker.querySelectorAll('[data-icon]').forEach(button => button.classList.toggle('selected', button.dataset.icon === icon));
    this.tagIconPicker.classList.remove('open');
    this.tagIconTrigger.setAttribute('aria-expanded', 'false');
    this.tagNameInput?.focus();
  },
  saveTag() {
    const name = this.tagNameInput.value.trim();
    if (!name) return this.tagNameInput.reportValidity();
    const parentId = this.tagParentSelect.value || null;
    const data = { name, icon: this.selectedTagIcon, viewType: this.selectedTagView, parentId };
    if (this.editingTagId) window.AppState.updateTag(this.editingTagId, data);
    else window.AppState.addTag(data);
    this.closeTagModal();
    this.renderTags();
    window.TasksComponent?.renderTagMenu();
    this.syncCurrentView();
    this.updateCounts();
    window.TasksComponent?.render();
  },

  deleteTag(tagId) {
    const tag = window.AppState.getTag(tagId);
    if (!tag) return;
    if (!window.confirm(`Delete tag "${tag.name}"? Child tags will become top-level tags.`)) return;
    window.AppState.deleteTag(tagId);
    this.renderTags();
    window.TasksComponent?.renderTagMenu();
    this.syncCurrentView();
    this.updateCounts();
    window.TasksComponent?.render();
  },

  closeTagModal() {
    this.tagModal?.classList.remove('active');
    this.tagModal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    this.tagIconPicker?.classList.remove('open');
    this.editingTagId = null;
  },
};
