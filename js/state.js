(() => {
  const seedTime = new Date().toISOString();
  window.AppSeedData = {
    projects: [
      { id: 'personal', name: 'Personal', icon: '●', viewType: 'list', parentId: null },
      { id: 'work', name: 'Work', icon: '◆', viewType: 'list', parentId: null }
    ],
    tags: [
      { id: 'urgent', name: 'Urgent', icon: '!', viewType: 'list', parentId: null },
      { id: 'design', name: 'Design', icon: '◆', viewType: 'list', parentId: null },
      { id: 'personal', name: 'Personal', icon: '●', viewType: 'list', parentId: null },
      { id: 'work', name: 'Work', icon: '◆', viewType: 'list', parentId: null }
    ],
    tasks: [
      { id: 'task-1', title: 'Design Apple-style UI layout for Todo app', description: '', project: 'personal', priority: 'high', tags: ['design'], completed: false, createdAt: seedTime },
      { id: 'task-2', title: 'Setup modular CSS variables and dark/light themes', description: '', project: 'work', priority: 'medium', tags: ['urgent'], completed: true, createdAt: seedTime }
    ]
  };
})();

window.AppState = {
  theme: 'dark',
  isSidebarCollapsed: false,
  currentFilter: 'inbox',
  currentFilterType: 'smart',
  projects: [],
  tags: [],
  tasks: [],
  reminderDefinitions: [],
  settings: { sortKey: 'custom', sortDirection: 'asc', groupKey: 'none' },

  hydrate({ projects = [], tags = [], tasks = [], reminderDefinitions = [], settings = {} } = {}) {
    this.projects = projects.map(item => ({ ...item }));
    this.tags = tags.map(item => ({ ...item }));
    this.tasks = tasks.map(task => window.TaskModel.normalizeTask(task));
    this.reminderDefinitions = reminderDefinitions.map(item => ({ ...item }));
    this.settings = { sortKey: 'custom', sortDirection: 'asc', groupKey: 'none', ...settings };
    this.rebuildTaskOrder();
  },

  rebuildTaskOrder() {
    const compare = (a, b) => (a.sortOrder - b.sortOrder) || String(a.createdAt).localeCompare(String(b.createdAt));
    const roots = this.tasks.filter(task => !task.parentTaskId).sort(compare);
    const children = new Map();
    this.tasks.filter(task => task.parentTaskId).forEach(task => {
      if (!children.has(task.parentTaskId)) children.set(task.parentTaskId, []);
      children.get(task.parentTaskId).push(task);
    });
    children.forEach(items => items.sort(compare));
    const ordered = [];
    roots.forEach(root => ordered.push(root, ...(children.get(root.id) || [])));
    const included = new Set(ordered.map(task => task.id));
    this.tasks.filter(task => !included.has(task.id)).sort(compare).forEach(task => ordered.push(task));
    this.tasks = ordered;
    return this.tasks;
  },

  getProject(projectId) { return this.projects.find(project => project.id === projectId) || null; },
  getProjectDescendantIds(projectId) {
    const ids = [];
    const walk = parentId => this.projects.filter(project => project.parentId === parentId).forEach(child => {
      ids.push(child.id);
      walk(child.id);
    });
    walk(projectId);
    return ids;
  },
  isProjectDescendant(projectId, possibleAncestorId) {
    let current = this.getProject(projectId);
    while (current?.parentId) {
      if (current.parentId === possibleAncestorId) return true;
      current = this.getProject(current.parentId);
    }
    return false;
  },

  getTag(tagId) { return this.tags.find(tag => tag.id === tagId) || null; },
  getTagDescendantIds(tagId) {
    const ids = [];
    const walk = parentId => this.tags.filter(tag => tag.parentId === parentId).forEach(child => {
      ids.push(child.id);
      walk(child.id);
    });
    walk(tagId);
    return ids;
  },
  getTagTreeTaskIds(tagId) { return [tagId, ...this.getTagDescendantIds(tagId)]; },
  isTagDescendant(tagId, possibleAncestorId) {
    let current = this.getTag(tagId);
    while (current?.parentId) {
      if (current.parentId === possibleAncestorId) return true;
      current = this.getTag(current.parentId);
    }
    return false;
  },

  matchesFilter(task) {
    if (this.currentFilterType === 'project') {
      return [this.currentFilter, ...this.getProjectDescendantIds(this.currentFilter)].includes(task.project);
    }
    if (this.currentFilterType === 'tag') {
      const ids = this.getTagTreeTaskIds(this.currentFilter);
      return (task.tags || []).some(tagId => ids.includes(tagId));
    }
    if (this.currentFilter === 'completed') return task.completed;
    if (this.currentFilter === 'today') return this.isTodayDate(task.dueDate);
    if (this.currentFilter === 'inbox') return !task.project;
    return !task.completed;
  },

  getTodayDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  },
  isTodayDate(dateStr) { return typeof dateStr === 'string' && dateStr === this.getTodayDateStr(); },
  getFilteredTasks() { return this.tasks.filter(task => this.matchesFilter(task)); },
  getActiveTasks() { return this.tasks.filter(task => !task.completed); },
  getCompletedTasks() { return this.tasks.filter(task => task.completed); },
  countInbox() { return this.tasks.filter(task => !task.completed && !task.project).length; },
  countToday() { return this.tasks.filter(task => !task.completed && this.isTodayDate(task.dueDate)).length; },
  countCompleted() { return this.tasks.filter(task => task.completed).length; },
  countProject(projectId) {
    const ids = [projectId, ...this.getProjectDescendantIds(projectId)];
    return this.tasks.filter(task => !task.completed && ids.includes(task.project)).length;
  },
  countTag(tagId) {
    const ids = this.getTagTreeTaskIds(tagId);
    return this.tasks.filter(task => !task.completed && (task.tags || []).some(id => ids.includes(id))).length;
  }
};
