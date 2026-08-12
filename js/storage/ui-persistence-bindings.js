window.bindPersistentUiMutations = function bindPersistentUiMutations() {
  const fail = (message, error) => window.AppPersistence.reportError(message, error);

  const originalCreateTaskCard = window.TasksComponent.createTaskCard.bind(window.TasksComponent);
  window.TasksComponent.createTaskCard = function persistentTaskCard(task, options = {}) {
    const card = originalCreateTaskCard(task, options);
    const checkbox = card.querySelector('.task-checkbox');
    if (!checkbox) return card;
    const replacement = checkbox.cloneNode(true);
    replacement.checked = checkbox.checked;
    checkbox.replaceWith(replacement);
    replacement.addEventListener('change', async event => {
      event.stopPropagation();
      const requested = replacement.checked;
      replacement.disabled = true;
      try {
        await window.AppDataService.toggleTaskStatus(task.id);
        this.refreshAfterTaskMutation();
      } catch (error) {
        replacement.checked = !requested;
        replacement.disabled = false;
        fail('Could not save the task completion change.', error);
      }
    });
    return card;
  };

  window.TasksComponent.submitTask = async function submitPersistentTask() {
    if (!this.titleInput?.value.trim()) return this.titleInput?.reportValidity();
    const payload = {
      title: this.titleInput.value.trim(), description: this.descInput?.value.trim() || '',
      dueDate: this.selectedDueDate, dueTime: this.selectedDueTime,
      reminders: [...this.selectedReminders],
      repeat: this.selectedRepeat ? JSON.parse(JSON.stringify(this.selectedRepeat)) : null,
      project: this.selectedProject, priority: this.selectedPriority, tags: [...this.selectedTags]
    };
    this.submitTaskBtn.disabled = true;
    try {
      if (this.editingTaskId) await window.AppDataService.updateTask(this.editingTaskId, payload);
      else await window.AppDataService.createTask({ ...payload, parentTaskId: null });
      this.closeModal();
      this.render();
    } catch (error) {
      fail('Could not save this task. Your form has been kept open.', error);
    } finally {
      this.submitTaskBtn.disabled = false;
    }
  };

  window.SubtaskEditorComponent.submit = async function submitPersistentSubtask() {
    const title = this.titleInput?.value.trim();
    if (!title) return this.titleInput?.reportValidity();
    const payload = {
      title, description: this.descInput?.value.trim() || '', dueDate: this.selectedDueDate,
      dueTime: this.selectedDueTime, reminders: [...this.selectedReminders],
      repeat: this.selectedRepeat ? JSON.parse(JSON.stringify(this.selectedRepeat)) : null,
      priority: this.selectedPriority, tags: [...this.selectedTags]
    };
    this.btnSubmit.disabled = true;
    try {
      if (this.editingSubtaskId) await window.AppDataService.updateTask(this.editingSubtaskId, payload);
      else await window.AppDataService.createTask({ ...payload, parentTaskId: this.parentTaskId });
      this.close();
      window.TasksComponent?.refreshAfterTaskMutation();
    } catch (error) {
      fail('Could not save this subtask. Your form has been kept open.', error);
    } finally {
      this.btnSubmit.disabled = false;
    }
  };

  window.TasksComponent.handleTaskActionLinkParent = async function linkPersistentParent(parentId) {
    const taskId = this.taskActionTargetId;
    if (!taskId || !parentId) return;
    try {
      await window.AppDataService.linkTaskToParent(taskId, parentId);
      this.closeTaskParentPicker(false);
      this.closeTaskActionMenu(false);
      this.refreshAfterTaskMutation();
    } catch (error) {
      fail('Could not link this task to the selected parent.', error);
    }
  };

  window.TasksComponent.handleTaskActionUnlink = async function unlinkPersistentTask() {
    const taskId = this.taskActionTargetId;
    if (!taskId) return;
    try {
      await window.AppDataService.unlinkTask(taskId);
      this.closeTaskActionMenu(false);
      this.refreshAfterTaskMutation();
    } catch (error) {
      fail('Could not unlink this subtask.', error);
    }
  };

  window.TasksComponent.handleTaskActionDelete = async function deletePersistentTask() {
    const task = window.AppState.getTask(this.taskActionTargetId);
    if (!task) return;
    const subtaskCount = window.AppState.getSubtasks(task.id).length;
    if (!task.parentTaskId && subtaskCount > 0) {
      const ok = window.confirm(`Delete "${task.title}" and its ${subtaskCount} ${subtaskCount === 1 ? 'subtask' : 'subtasks'}?`);
      if (!ok) return;
    }
    this.closeTaskActionMenu(false);
    try {
      await window.AppDataService.deleteTaskFamily(task.id);
      this.refreshAfterTaskMutation?.();
    } catch (error) {
      fail('Could not delete this task.', error);
    }
  };

  window.SidebarComponent.saveProject = async function savePersistentProject() {
    const name = this.projectNameInput.value.trim();
    if (!name) return this.projectNameInput.reportValidity();
    const data = {
      name, icon: this.selectedProjectIcon, viewType: this.selectedProjectView,
      parentId: this.projectParentSelect?.value || null
    };
    this.projectSaveBtn.disabled = true;
    try {
      if (this.editingProjectId) await window.AppDataService.updateProject(this.editingProjectId, data);
      else await window.AppDataService.createProject(data);
      this.closeProjectModal(); this.renderProjects();
      window.TasksComponent?.renderProjectMenu(); this.syncCurrentView(); this.updateCounts(); window.TasksComponent?.render();
    } catch (error) {
      fail('Could not save this project.', error);
    } finally {
      this.projectSaveBtn.disabled = false;
    }
  };

  window.SidebarComponent.deleteProject = async function deletePersistentProject(projectId) {
    const project = window.AppState.getProject(projectId);
    if (!project) return;
    if (!window.confirm(`Delete project "${project.name}"? Its direct sub-projects will become top-level.`)) return;
    try {
      await window.AppDataService.deleteProject(projectId);
      this.renderProjects(); window.TasksComponent?.renderProjectMenu();
      this.syncCurrentView(); this.updateCounts(); window.TasksComponent?.render();
    } catch (error) { fail('Could not delete this project.', error); }
  };

  window.SidebarComponent.saveTag = async function savePersistentTag() {
    const name = this.tagNameInput.value.trim();
    if (!name) return this.tagNameInput.reportValidity();
    const data = {
      name, icon: this.selectedTagIcon, viewType: this.selectedTagView,
      parentId: this.tagParentSelect.value || null
    };
    this.tagSaveBtn.disabled = true;
    try {
      if (this.editingTagId) await window.AppDataService.updateTag(this.editingTagId, data);
      else await window.AppDataService.createTag(data);
      this.closeTagModal(); this.renderTags(); window.TasksComponent?.renderTagMenu();
      this.syncCurrentView(); this.updateCounts(); window.TasksComponent?.render();
    } catch (error) {
      fail('Could not save this tag.', error);
    } finally {
      this.tagSaveBtn.disabled = false;
    }
  };

  window.SidebarComponent.deleteTag = async function deletePersistentTag(tagId) {
    const tag = window.AppState.getTag(tagId);
    if (!tag) return;
    if (!window.confirm(`Delete tag "${tag.name}"? Child tags will become top-level tags.`)) return;
    try {
      await window.AppDataService.deleteTag(tagId);
      this.renderTags(); window.TasksComponent?.renderTagMenu();
      this.syncCurrentView(); this.updateCounts(); window.TasksComponent?.render();
    } catch (error) { fail('Could not delete this tag.', error); }
  };

  const originalWorkspaceInit = window.WorkspaceControls.init.bind(window.WorkspaceControls);
  window.WorkspaceControls.init = function persistentWorkspaceInit() {
    const settings = window.AppState.settings || {};
    this.sortKey = this.normalizeSortKey(settings.sortKey || 'custom');
    this.sortDirection = settings.sortDirection === 'desc' ? 'desc' : 'asc';
    this.groupKey = ['none', 'priority', 'date', 'project', 'tag'].includes(settings.groupKey) ? settings.groupKey : 'none';
    originalWorkspaceInit();
  };

  window.WorkspaceControls.handleSettingsPanelClick = async function persistentSortGroupClick(event) {
    const sortItem = event.target.closest('[data-sort-key]');
    const groupItem = event.target.closest('[data-group-key]');
    if (!sortItem && !groupItem) return;
    try {
      if (sortItem) {
        const value = this.normalizeSortKey(sortItem.dataset.sortKey);
        await window.AppDataService.setSetting('sortKey', value);
        this.sortKey = value;
      }
      if (groupItem) {
        const value = groupItem.dataset.groupKey;
        await window.AppDataService.setSetting('groupKey', value);
        this.groupKey = value;
      }
      this.syncUI(); window.TasksComponent?.render();
    } catch (error) { fail('Could not save the Sort & Group setting.', error); }
  };

  window.WorkspaceControls.toggleDirection = async function persistentSortDirection() {
    if (this.normalizeSortKey(this.sortKey) === 'custom') return;
    const next = this.sortDirection === 'asc' ? 'desc' : 'asc';
    try {
      await window.AppDataService.setSetting('sortDirection', next);
      this.sortDirection = next; this.syncUI(); window.TasksComponent?.render();
    } catch (error) { fail('Could not save sort direction.', error); }
  };

  window.WorkspaceControls.setViewType = async function persistentViewType(viewType, { persist = true, render = true } = {}) {
    const next = this.normalizeViewType(viewType);
    try {
      if (persist && window.AppState.currentFilterType === 'project') {
        await window.AppDataService.setEntityViewType('project', window.AppState.currentFilter, next);
      } else if (persist && window.AppState.currentFilterType === 'tag') {
        await window.AppDataService.setEntityViewType('tag', window.AppState.currentFilter, next);
      }
      this.viewType = next; this.syncUI(); if (render) window.TasksComponent?.render();
      return next;
    } catch (error) {
      fail('Could not save the selected view.', error);
      return this.viewType;
    }
  };

  window.WorkspaceControls.handleMainMenuClick = async function persistentMainMenuClick(event) {
    if (event.target.closest('#workspace-sort-group-trigger')) return this.toggleSettingsPanel();
    const viewItem = event.target.closest('[data-view-type]');
    if (viewItem && !viewItem.disabled) {
      this.closeSettingsPanel();
      await this.setViewType(viewItem.dataset.viewType, { persist: true, render: true });
    }
  };

  window.TasksComponent.commitTaskDrag = async function commitPersistentHierarchyDrag() {
    const session = this.dragSession;
    if (!session) return;
    const destination = this.getDropLaneContext(session.currentLane);
    if (this.isHierarchyPreviewUnchanged(session, destination)) {
      this.cleanupTaskDrag(true);
      return;
    }
    try {
      await window.AppDataService.commitHierarchyDrag({
        taskId: session.taskId,
        targetLevel: session.previewLevel,
        targetParentId: session.previewParentId,
        beforeTaskId: session.previewBeforeTaskId,
        afterTaskId: session.previewAfterTaskId,
        sourceContext: session.sourceContext,
        destinationContext: destination
      });
      if (window.WorkspaceControls) {
        window.WorkspaceControls.sortKey = 'custom';
        window.WorkspaceControls.syncUI();
      }
    } catch (error) {
      fail('Could not save the new task hierarchy or position.', error);
    }
    this.cleanupTaskDrag(true);
  };

  window.ScheduleComponent.submitCustomReminder = async function submitPersistentCustomReminder() {
    const { min, hr, day } = this.draftCustomWheel || { min: 0, hr: 0, day: 0 };
    if (min === 0 && hr === 0 && day === 0) return this.closeCustomReminderModal();
    const parts = [];
    if (day) parts.push(`${day}d`); if (hr) parts.push(`${hr}h`); if (min) parts.push(`${min}m`);
    const custom = { id: `custom-${day}d-${hr}h-${min}m`, label: `${parts.join(' ')} before`, min, hr, day };
    try {
      await window.AppDataService.saveReminderDefinition(custom);
      if (!this.customReminders.some(item => item.id === custom.id)) this.customReminders.push(custom);
      this.toggleReminderSelection(custom.id); this.closeCustomReminderModal();
    } catch (error) { fail('Could not save this custom reminder.', error); }
  };

  window.ScheduleComponent.deleteCustomReminder = async function deletePersistentCustomReminder(id) {
    try {
      await window.AppDataService.deleteReminderDefinition(id);
      this.customReminders = this.customReminders.filter(item => item.id !== id);
      this.draftReminders = this.draftReminders.filter(key => key !== id);
      if (!this.draftReminders.length) this.draftReminders = ['none'];
      this.updateReminderUI(); this.renderReminderMenuContent();
    } catch (error) { fail('Could not delete this custom reminder.', error); }
  };
};
