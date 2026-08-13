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
    this.tasks = tasks.map(task => this.normalizeTask(task));
    this.reminderDefinitions = reminderDefinitions.map(item => ({ ...item }));
    this.settings = { sortKey: 'custom', sortDirection: 'asc', groupKey: 'none', ...settings };
    this.rebuildTaskOrder();
  },

  normalizeTask(task) {
    const legacyTags = Array.isArray(task.tags) ? task.tags : (task.tag ? String(task.tag).split(',') : []);
    return {
      ...task,
      description: typeof task.description === 'string' ? task.description : '',
      dueDate: typeof task.dueDate === 'string' && task.dueDate ? task.dueDate : null,
      dueTime: typeof task.dueTime === 'string' && task.dueTime ? task.dueTime : null,
      reminders: Array.isArray(task.reminders) ? [...task.reminders] : [],
      repeat: typeof task.repeat === 'object' && task.repeat ? task.repeat : null,
      priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : '',
      parentTaskId: typeof task.parentTaskId === 'string' && task.parentTaskId ? task.parentTaskId : null,
      project: typeof task.project === 'string' ? task.project : '',
      tags: [...new Set(legacyTags.map(tag => String(tag).toLowerCase().trim()).filter(Boolean))],
      sortOrder: Number.isFinite(task.sortOrder) ? task.sortOrder : 0,
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: task.updatedAt || task.createdAt || new Date().toISOString()
    };
  },

  normalizeAllTasks() { this.tasks = this.tasks.map(task => this.normalizeTask(task)); },
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

  addProject(projectData) {
    const project = { id: this.createId('project'), name: projectData.name.trim(), icon: projectData.icon || '●', viewType: projectData.viewType || 'list', parentId: projectData.parentId || null, sortOrder: Number.isFinite(projectData.sortOrder) ? projectData.sortOrder : this.projects.length, createdAt: projectData.createdAt || new Date().toISOString(), updatedAt: projectData.updatedAt || new Date().toISOString() };
    this.projects.push(project); return project;
  },
  updateProject(projectId, projectData) {
    const project = this.projects.find(item => item.id === projectId); if (!project) return null;
    project.name = projectData.name.trim(); project.icon = projectData.icon || '●'; project.viewType = projectData.viewType || 'list'; project.parentId = projectData.parentId || null; project.updatedAt = projectData.updatedAt || new Date().toISOString(); return project;
  },
  deleteProject(projectId) {
    const childIds = this.projects.filter(project => project.parentId === projectId).map(project => project.id);
    this.projects = this.projects.filter(project => project.id !== projectId);
    this.projects.forEach(project => { if (project.parentId === projectId) project.parentId = null; });
    this.tasks.forEach(task => { if (task.project === projectId) task.project = ''; });
    if (this.currentFilterType === 'project' && this.currentFilter === projectId) { this.currentFilter = 'inbox'; this.currentFilterType = 'smart'; }
    return childIds;
  },
  getProject(projectId) { return this.projects.find(project => project.id === projectId) || null; },
  getProjectDescendantIds(projectId) {
    const ids = []; const walk = parentId => this.projects.filter(project => project.parentId === parentId).forEach(child => { ids.push(child.id); walk(child.id); }); walk(projectId); return ids;
  },
  isProjectDescendant(projectId, possibleAncestorId) {
    let current = this.getProject(projectId); while (current?.parentId) { if (current.parentId === possibleAncestorId) return true; current = this.getProject(current.parentId); } return false;
  },

  addTag(tagData) {
    const tag = { id: this.createId('tag'), name: tagData.name.trim(), icon: tagData.icon || '●', viewType: tagData.viewType || 'list', parentId: tagData.parentId || null, sortOrder: Number.isFinite(tagData.sortOrder) ? tagData.sortOrder : this.tags.length, createdAt: tagData.createdAt || new Date().toISOString(), updatedAt: tagData.updatedAt || new Date().toISOString() };
    this.tags.push(tag); return tag;
  },
  updateTag(tagId, tagData) {
    const tag = this.getTag(tagId); if (!tag) return null;
    tag.name = tagData.name.trim(); tag.icon = tagData.icon || '●'; tag.viewType = tagData.viewType || 'list'; tag.parentId = tagData.parentId || null; tag.updatedAt = tagData.updatedAt || new Date().toISOString(); return tag;
  },
  deleteTag(tagId) {
    const childIds = this.tags.filter(tag => tag.parentId === tagId).map(tag => tag.id);
    this.tags = this.tags.filter(tag => tag.id !== tagId);
    this.tags.forEach(tag => { if (tag.parentId === tagId) tag.parentId = null; });
    this.tasks.forEach(task => { task.tags = this.normalizeTask(task).tags.filter(id => id !== tagId); });
    if (this.currentFilterType === 'tag' && this.currentFilter === tagId) { this.currentFilter = 'inbox'; this.currentFilterType = 'smart'; }
    return childIds;
  },
  getTag(tagId) { return this.tags.find(tag => tag.id === tagId) || null; },
  getTagDescendantIds(tagId) {
    const ids = []; const walk = parentId => this.tags.filter(tag => tag.parentId === parentId).forEach(child => { ids.push(child.id); walk(child.id); }); walk(tagId); return ids;
  },
  getTagTreeTaskIds(tagId) { return [tagId, ...this.getTagDescendantIds(tagId)]; },
  isTagDescendant(tagId, possibleAncestorId) {
    let current = this.getTag(tagId); while (current?.parentId) { if (current.parentId === possibleAncestorId) return true; current = this.getTag(current.parentId); } return false;
  },

  createId(prefix) {
    const value = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${value}`;
  },
  addTask(taskData) {
    const now = new Date().toISOString();
    const task = this.normalizeTask({ id: this.createId('task'), title: taskData.title, description: taskData.description || '', dueDate: taskData.dueDate || null, dueTime: taskData.dueTime || null, reminders: Array.isArray(taskData.reminders) ? [...taskData.reminders] : [], repeat: taskData.repeat || null, parentTaskId: taskData.parentTaskId || null, project: taskData.project || '', priority: taskData.priority || '', tags: Array.isArray(taskData.tags) ? [...taskData.tags] : [], completed: false, sortOrder: Number.isFinite(taskData.sortOrder) ? taskData.sortOrder : 0, createdAt: taskData.createdAt || now, updatedAt: taskData.updatedAt || now });
    this.tasks.push(task); this.rebuildTaskOrder(); return task;
  },
  updateTask(taskId, updatedData) {
    const index = this.tasks.findIndex(task => task.id === taskId); if (index === -1) return null;
    const existing = this.tasks[index];
    const updated = this.normalizeTask({ ...existing, ...updatedData, id: existing.id, completed: existing.completed, createdAt: existing.createdAt, sortOrder: existing.sortOrder, updatedAt: updatedData.updatedAt || new Date().toISOString() });
    this.tasks[index] = updated; return updated;
  },
  toggleTaskStatus(taskId) { const task = this.tasks.find(item => item.id === taskId); if (task) { task.completed = !task.completed; task.updatedAt = new Date().toISOString(); } return task; },
  deleteTask(taskId) { this.tasks = this.tasks.filter(task => task.id !== taskId); },

  matchesFilter(task) {
    if (this.currentFilterType === 'project') return [this.currentFilter, ...this.getProjectDescendantIds(this.currentFilter)].includes(task.project);
    if (this.currentFilterType === 'tag') { const ids = this.getTagTreeTaskIds(this.currentFilter); return this.normalizeTask(task).tags.some(tagId => ids.includes(tagId)); }
    if (this.currentFilter === 'completed') return task.completed;
    if (this.currentFilter === 'today') return this.isTodayDate(task.dueDate);
    if (this.currentFilter === 'inbox') return !task.project;
    return !task.completed;
  },
  getTodayDateStr() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; },
  isTodayDate(dateStr) { return typeof dateStr === 'string' && dateStr === this.getTodayDateStr(); },
  getFilteredTasks() { this.normalizeAllTasks(); return this.tasks.filter(task => this.matchesFilter(task)); },
  getActiveTasks() { return this.tasks.filter(task => !task.completed); },
  getCompletedTasks() { return this.tasks.filter(task => task.completed); },
  countInbox() { return this.tasks.filter(task => !task.completed && !task.project).length; },
  countToday() { return this.tasks.filter(task => !task.completed && this.isTodayDate(task.dueDate)).length; },
  countCompleted() { return this.tasks.filter(task => task.completed).length; },
  countProject(project) { const ids = [project, ...this.getProjectDescendantIds(project)]; return this.tasks.filter(task => !task.completed && ids.includes(task.project)).length; },
  countTag(tag) { const ids = this.getTagTreeTaskIds(tag); return this.tasks.filter(task => !task.completed && this.normalizeTask(task).tags.some(tagId => ids.includes(tagId))).length; }
};
