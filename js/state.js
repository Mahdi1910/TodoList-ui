window.AppState = {
  theme: 'dark',
  isSidebarCollapsed: false,
  currentFilter: 'inbox',
  currentFilterType: 'smart',

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
    {
      id: 'task-1',
      title: 'Design Apple-style UI layout for Todo app',
      description: '',
      project: 'personal',
      priority: 'high',
      tags: ['design'],
      completed: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'task-2',
      title: 'Setup modular CSS variables and dark/light themes',
      description: '',
      project: 'work',
      priority: 'medium',
      tags: ['urgent'],
      completed: true,
      createdAt: new Date().toISOString()
    }
  ],

  normalizeTask(task) {
    const legacyTags = Array.isArray(task.tags)
      ? task.tags
      : (task.tag ? String(task.tag).split(',') : []);

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
      tags: [...new Set(legacyTags.map(tag => String(tag).toLowerCase().trim()).filter(Boolean))]
    };
  },

  normalizeAllTasks() {
    this.tasks = this.tasks.map(task => this.normalizeTask(task));
  },

  addProject(projectData) {
    const project = {
      id: `project-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: projectData.name.trim(),
      icon: projectData.icon || '●',
      viewType: projectData.viewType || 'list',
      parentId: projectData.parentId || null
    };
    this.projects.push(project);
    return project;
  },

  updateProject(projectId, projectData) {
    const project = this.projects.find(item => item.id === projectId);
    if (!project) return null;
    project.name = projectData.name.trim();
    project.icon = projectData.icon || '●';
    project.viewType = projectData.viewType || 'list';
    project.parentId = projectData.parentId || null;
    return project;
  },

  deleteProject(projectId) {
    const childIds = this.projects.filter(project => project.parentId === projectId).map(project => project.id);
    this.projects = this.projects.filter(project => project.id !== projectId);
    this.projects.forEach(project => { if (project.parentId === projectId) project.parentId = null; });
    this.tasks.forEach(task => { if (task.project === projectId) task.project = ''; });
    if (this.currentFilterType === 'project' && this.currentFilter === projectId) {
      this.currentFilter = 'inbox';
      this.currentFilterType = 'smart';
    }
    return childIds;
  },

  getProject(projectId) {
    return this.projects.find(project => project.id === projectId) || null;
  },

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

  addTag(tagData) {
    const tag = {
      id: `tag-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: tagData.name.trim(),
      icon: tagData.icon || '●',
      viewType: tagData.viewType || 'list',
      parentId: tagData.parentId || null
    };
    this.tags.push(tag);
    return tag;
  },

  updateTag(tagId, tagData) {
    const tag = this.getTag(tagId);
    if (!tag) return null;
    tag.name = tagData.name.trim();
    tag.icon = tagData.icon || '●';
    tag.viewType = tagData.viewType || 'list';
    tag.parentId = tagData.parentId || null;
    return tag;
  },

  deleteTag(tagId) {
    const childIds = this.tags.filter(tag => tag.parentId === tagId).map(tag => tag.id);
    this.tags = this.tags.filter(tag => tag.id !== tagId);
    this.tags.forEach(tag => {
      if (tag.parentId === tagId) tag.parentId = null;
    });
    this.tasks.forEach(task => {
      task.tags = this.normalizeTask(task).tags.filter(id => id !== tagId);
    });
    if (this.currentFilterType === 'tag' && this.currentFilter === tagId) {
      this.currentFilter = 'inbox';
      this.currentFilterType = 'smart';
    }
    return childIds;
  },

  getTag(tagId) {
    return this.tags.find(tag => tag.id === tagId) || null;
  },

  getTagDescendantIds(tagId) {
    const ids = [];
    const walk = parentId => {
      this.tags.filter(tag => tag.parentId === parentId).forEach(child => {
        ids.push(child.id);
        walk(child.id);
      });
    };
    walk(tagId);
    return ids;
  },

  getTagTreeTaskIds(tagId) {
    return [tagId, ...this.getTagDescendantIds(tagId)];
  },

  isTagDescendant(tagId, possibleAncestorId) {
    let current = this.getTag(tagId);
    while (current?.parentId) {
      if (current.parentId === possibleAncestorId) return true;
      current = this.getTag(current.parentId);
    }
    return false;
  },

  addTask(taskData) {
    const newTask = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID
        ? `task-${crypto.randomUUID()}`
        : `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: taskData.title,
      description: taskData.description || '',
      dueDate: taskData.dueDate || null,
      dueTime: taskData.dueTime || null,
      reminders: Array.isArray(taskData.reminders) ? [...taskData.reminders] : [],
      repeat: taskData.repeat || null,
      parentTaskId: typeof taskData.parentTaskId === 'string' && taskData.parentTaskId ? taskData.parentTaskId : null,
      project: typeof taskData.project === 'string' ? taskData.project : '',
      priority: ['low', 'medium', 'high'].includes(taskData.priority) ? taskData.priority : '',
      tags: Array.isArray(taskData.tags) ? [...taskData.tags] : [],
      completed: false,
      createdAt: new Date().toISOString()
    };
    this.tasks.unshift(newTask);
    return newTask;
  },

  updateTask(taskId, updatedData) {
    const index = this.tasks.findIndex(t => t.id === taskId);
    if (index === -1) return null;

    const existingTask = this.tasks[index];
    const updatedTask = this.normalizeTask({
      ...existingTask,
      ...updatedData,
      id: existingTask.id, // Preserve immutable properties
      completed: existingTask.completed,
      createdAt: existingTask.createdAt
    });

    this.tasks[index] = updatedTask;
    return updatedTask;
  },
  toggleTaskStatus(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) task.completed = !task.completed;
    return task;
  },

  deleteTask(taskId) {
    this.tasks = this.tasks.filter(t => t.id !== taskId);
  },

  matchesFilter(task) {
    if (this.currentFilterType === 'project') {
      const visibleProjectIds = [this.currentFilter, ...this.getProjectDescendantIds(this.currentFilter)];
      return visibleProjectIds.includes(task.project);
    }
    if (this.currentFilterType === 'tag') {
      const visibleTagIds = this.getTagTreeTaskIds(this.currentFilter);
      return this.normalizeTask(task).tags.some(tagId => visibleTagIds.includes(tagId));
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

  isTodayDate(dateStr) {
    return typeof dateStr === 'string' && dateStr === this.getTodayDateStr();
  },

  getFilteredTasks() {
    this.normalizeAllTasks();
    return this.tasks.filter(task => this.matchesFilter(task));
  },

  getActiveTasks() {
    return this.tasks.filter(t => !t.completed);
  },

  getCompletedTasks() {
    return this.tasks.filter(t => t.completed);
  },

  countInbox() {
    return this.tasks.filter(t => !t.completed && !t.project).length;
  },

  countToday() {
    return this.tasks.filter(t => !t.completed && this.isTodayDate(t.dueDate)).length;
  },

  countCompleted() {
    return this.tasks.filter(t => t.completed).length;
  },

  countProject(project) {
    const visibleProjectIds = [project, ...this.getProjectDescendantIds(project)];
    return this.tasks.filter(t => !t.completed && visibleProjectIds.includes(t.project)).length;
  },

  countTag(tag) {
    const visibleTagIds = this.getTagTreeTaskIds(tag);
    return this.tasks.filter(t => !t.completed && this.normalizeTask(t).tags.some(tagId => visibleTagIds.includes(tagId))).length;
  }
};

window.AppState.normalizeAllTasks();
