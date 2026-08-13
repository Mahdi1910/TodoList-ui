window.TaskModel = (() => {
  function normalizeTask(task = {}) {
    const legacyTags = Array.isArray(task.tags) ? task.tags : (task.tag ? String(task.tag).split(',') : []);
    return {
      ...task,
      description: typeof task.description === 'string' ? task.description : '',
      dueDate: typeof task.dueDate === 'string' && task.dueDate ? task.dueDate : null,
      dueTime: typeof task.dueTime === 'string' && task.dueTime ? task.dueTime : null,
      reminders: Array.isArray(task.reminders) ? [...task.reminders] : [],
      repeat: typeof task.repeat === 'object' && task.repeat ? task.repeat : null,
      repeatState: task.repeatState && typeof task.repeatState === 'object' ? { ...task.repeatState } : null,
      familySlotId: typeof task.familySlotId === 'string' && task.familySlotId ? task.familySlotId : null,
      priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : '',
      parentTaskId: typeof task.parentTaskId === 'string' && task.parentTaskId ? task.parentTaskId : null,
      project: typeof task.project === 'string' ? task.project : '',
      tags: [...new Set(legacyTags.map(tag => String(tag).toLowerCase().trim()).filter(Boolean))],
      completed: Boolean(task.completed),
      sortOrder: Number.isFinite(task.sortOrder) ? task.sortOrder : 0,
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: task.updatedAt || task.createdAt || new Date().toISOString()
    };
  }

  return { normalizeTask };
})();
