window.SidebarTaxonomyUiCore = (() => {
  const CONFIG = {
    project: {
      label: 'Project', childLabel: 'Sub-project', listKey: 'projectListEl', modalKey: 'projectModal',
      inputKey: 'projectNameInput', iconKey: 'projectIconTrigger', pickerKey: 'projectIconPicker',
      parentKey: 'projectParentSelect', titleKey: 'projectModalTitle', saveKey: 'projectSaveBtn',
      editingKey: 'editingProjectId', selectedIconKey: 'selectedProjectIcon', selectedViewKey: 'selectedProjectView',
      viewSelector: '.project-view-option', viewDataset: 'view', fallback: '#btn-add-project'
    },
    tag: {
      label: 'Tag', childLabel: 'Sub-tag', listKey: 'tagListEl', modalKey: 'tagModal',
      inputKey: 'tagNameInput', iconKey: 'tagIconTrigger', pickerKey: 'tagIconPicker',
      parentKey: 'tagParentSelect', titleKey: 'tagModalTitle', saveKey: 'tagSaveBtn',
      editingKey: 'editingTagId', selectedIconKey: 'selectedTagIcon', selectedViewKey: 'selectedTagView',
      viewSelector: '[data-tag-view]', viewDataset: 'tagView', fallback: '#btn-add-tag'
    }
  };

  const config = type => CONFIG[type];
  const getEntity = (type, id) => type === 'project' ? window.AppState.getProject(id) : window.AppState.getTag(id);
  const getCount = (type, id) => type === 'project' ? window.AppState.countProject(id) : window.AppState.countTag(id);
  const isDescendant = (type, id, ancestorId) => type === 'project'
    ? window.AppState.isProjectDescendant(id, ancestorId)
    : window.AppState.isTagDescendant(id, ancestorId);

  function render(owner, type) {
    const c = config(type);
    const host = owner[c.listKey];
    if (!host) return;
    host.innerHTML = '';
    host.classList.add('sidebar-tree-root');
    host.dataset.taxonomyType = type;
    host.dataset.treeParentId = '';
    window.TaxonomyOrder.getChildren(type, null).forEach(entity => host.appendChild(createNode(owner, type, entity, 0)));
  }

  function createNode(owner, type, entity, depth) {
    const c = config(type);
    const node = document.createElement('div');
    node.className = `sidebar-tree-node ${type}-tree-node`;
    Object.assign(node.dataset, { taxonomyType: type, entityId: entity.id, parentId: entity.parentId || '', depth: String(depth) });

    const row = document.createElement('div');
    row.className = `sidebar-nav-item ${type}-nav-item`;
    row.dataset[type] = entity.id;
    row.dataset[`${type}Id`] = entity.id;
    row.dataset.title = entity.name;

    const left = document.createElement('span');
    left.className = 'item-left';
    const icon = document.createElement('span');
    icon.className = `${type}-icon`;
    icon.textContent = entity.icon;
    const name = document.createElement('span');
    name.className = `${type}-name`;
    name.textContent = entity.name;
    left.append(icon, name);

    const right = document.createElement('span');
    right.className = `${type}-nav-right`;
    const count = document.createElement('span');
    count.className = 'item-count';
    count.textContent = String(getCount(type, entity.id));
    const more = document.createElement('button');
    more.type = 'button';
    more.className = `${type}-more-btn`;
    more.dataset[`${type}Menu`] = entity.id;
    more.textContent = '⋯';
    more.setAttribute('aria-label', `More options for ${entity.name}`);
    right.append(count, more);

    const menu = document.createElement('div');
    menu.className = `${type}-more-menu`;
    menu.dataset[`${type}MenuPanel`] = entity.id;
    [[`${type}AddChild`, `Add ${c.childLabel}`], [`${type}Edit`, 'Edit'], [`${type}Delete`, 'Delete']].forEach(([datasetKey, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset[datasetKey] = entity.id;
      button.textContent = label;
      menu.appendChild(button);
    });
    more.addEventListener('click', event => {
      event.stopPropagation();
      owner.toggleSidebarActionMenu(menu);
    });

    const children = document.createElement('div');
    children.className = 'sidebar-tree-children';
    children.dataset.taxonomyType = type;
    children.dataset.treeParentId = entity.id;
    window.TaxonomyOrder.getChildren(type, entity.id).forEach(child => children.appendChild(createNode(owner, type, child, depth + 1)));

    row.append(left, right, menu);
    node.append(row, children);
    return node;
  }

  function open(owner, type, entityId = null, parentId = null, trigger = null) {
    const c = config(type);
    const entity = entityId ? getEntity(type, entityId) : null;
    owner[c.editingKey] = entityId;
    owner[c.titleKey].textContent = entity ? `Edit ${c.label}` : `New ${c.label}`;
    owner[c.saveKey].textContent = entity ? 'Save Changes' : `Create ${c.label}`;
    owner[c.selectedIconKey] = entity?.icon || '●';
    owner[c.selectedViewKey] = entity?.viewType || 'list';
    owner[c.inputKey].value = entity?.name || '';
    owner[c.iconKey].textContent = owner[c.selectedIconKey];
    owner[c.pickerKey].classList.remove('open');
    owner[c.iconKey].setAttribute('aria-expanded', 'false');
    owner[c.pickerKey].querySelectorAll('[data-icon]').forEach(button => button.classList.toggle('selected', button.dataset.icon === owner[c.selectedIconKey]));

    const parentSelect = owner[c.parentKey];
    parentSelect.innerHTML = '';
    const rootOption = document.createElement('option');
    rootOption.value = '';
    rootOption.textContent = `No parent (top-level ${c.label.toLowerCase()})`;
    parentSelect.appendChild(rootOption);
    window.TaxonomyOrder.flattenTree(type).forEach(({ item, depth }) => {
      if (item.id === entityId || isDescendant(type, item.id, entityId)) return;
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${'  '.repeat(depth)}${item.icon} ${item.name}`;
      parentSelect.appendChild(option);
    });
    parentSelect.value = entity?.parentId || parentId || '';

    owner[c.modalKey].querySelectorAll(c.viewSelector).forEach(button => {
      const selected = button.dataset[c.viewDataset] === owner[c.selectedViewKey];
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
      button.onclick = () => selectView(owner, type, button);
    });
    document.body.classList.add('modal-open');
    window.ModalFocusManager.open(owner[c.modalKey], { trigger, initialFocus: owner[c.inputKey], fallbackFocus: c.fallback });
  }

  function selectView(owner, type, button) {
    const c = config(type);
    owner[c.selectedViewKey] = button.dataset[c.viewDataset];
    owner[c.modalKey].querySelectorAll(c.viewSelector).forEach(option => {
      const selected = option === button;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
  }

  function selectIcon(owner, type, value) {
    const c = config(type);
    owner[c.selectedIconKey] = value;
    owner[c.iconKey].textContent = value;
    owner[c.pickerKey].querySelectorAll('[data-icon]').forEach(button => button.classList.toggle('selected', button.dataset.icon === value));
    owner[c.pickerKey].classList.remove('open');
    owner[c.iconKey].setAttribute('aria-expanded', 'false');
    owner[c.inputKey].focus();
  }

  function refresh(owner, type) {
    render(owner, type);
    if (type === 'project') window.TasksComponent?.renderProjectMenu();
    else window.TasksComponent?.renderTagMenu();
    owner.syncCurrentView();
    owner.updateCounts();
    window.TasksComponent?.render();
  }

  async function save(owner, type) {
    const c = config(type);
    const name = owner[c.inputKey].value.trim();
    if (!name) return owner[c.inputKey].reportValidity();
    const data = { name, icon: owner[c.selectedIconKey], viewType: owner[c.selectedViewKey], parentId: owner[c.parentKey].value || null };
    owner[c.saveKey].disabled = true;
    try {
      const entityId = owner[c.editingKey];
      if (type === 'project') entityId ? await window.AppDataService.updateProject(entityId, data) : await window.AppDataService.createProject(data);
      else entityId ? await window.AppDataService.updateTag(entityId, data) : await window.AppDataService.createTag(data);
      close(owner, type);
      refresh(owner, type);
      document.querySelector(c.fallback)?.focus();
    } catch (error) {
      window.AppPersistence?.reportError(`Could not save this ${type}.`, error);
    } finally {
      owner[c.saveKey].disabled = false;
    }
  }

  async function remove(owner, type, entityId) {
    const c = config(type);
    const entity = getEntity(type, entityId);
    if (!entity) return;
    const question = type === 'project'
      ? `Delete project "${entity.name}"? Its direct sub-projects will become top-level.`
      : `Delete tag "${entity.name}"? Child tags will become top-level tags.`;
    if (!window.confirm(question)) return;
    try {
      if (type === 'project') await window.AppDataService.deleteProject(entityId);
      else await window.AppDataService.deleteTag(entityId);
      refresh(owner, type);
    } catch (error) {
      window.AppPersistence?.reportError(`Could not delete this ${type}.`, error);
    }
  }

  function close(owner, type) {
    const c = config(type);
    if (!owner[c.modalKey]?.classList.contains('active')) return;
    owner[c.pickerKey]?.classList.remove('open');
    window.ModalFocusManager.close(owner[c.modalKey], { fallbackFocus: c.fallback });
    document.body.classList.remove('modal-open');
    owner[c.editingKey] = null;
  }

  return { render, createNode, open, selectIcon, save, remove, close };
})();
