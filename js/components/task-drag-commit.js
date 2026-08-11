window.TaskDragCommitMethods = {
  commitTaskDrag() {
    const session = this.dragSession;
    if (!session) return;
    const finalIds = this.collectVisibleDragOrder();
    const destination = this.getDropLaneContext(session.currentLane);
    const orderChanged = !this.areTaskIdOrdersEqual(session.baselineIds, finalIds);
    const metadataChanged = this.hasDragMetadataChange(session.sourceContext, destination);
    if (!orderChanged && !metadataChanged) {
      this.cleanupTaskDrag(true);
      return;
    }

    if (orderChanged) window.AppState.rebaseVisibleRootOrder(finalIds);
    if (metadataChanged) this.applyDragDestinationMutation(session.taskId, session.sourceContext, destination);
    if (window.WorkspaceControls) {
      window.WorkspaceControls.sortKey = 'custom';
      window.WorkspaceControls.syncUI();
    }
    this.cleanupTaskDrag(true);
  },

  areTaskIdOrdersEqual(a = [], b = []) {
    return a.length === b.length && a.every((id, index) => id === b[index]);
  },

  hasDragMetadataChange(source, destination) {
    return Boolean(
      source && destination &&
      source.groupType !== 'none' &&
      source.groupType === destination.groupType &&
      source.groupKey !== destination.groupKey
    );
  },
  applyDragDestinationMutation(taskId, source, destination) {
    const task = window.AppState.getTask(taskId);
    if (!task || source.groupType !== destination.groupType) return false;
    const key = destination.groupKey ?? '';
    if (destination.groupType === 'priority') {
      window.AppState.updateTask(taskId, { priority: key });
      return true;
    }
    if (destination.groupType === 'date') {
      window.AppState.updateTask(taskId, { dueDate: key || null });
      return true;
    }
    if (destination.groupType === 'project') {
      window.AppState.updateTask(taskId, { project: key || '' });
      return true;
    }
    if (destination.groupType === 'tag') {
      const currentTags = [...window.AppState.normalizeTask(task).tags];
      let nextTags;
      if (!key) nextTags = [];
      else {
        nextTags = source.groupKey ? currentTags.filter(tag => tag !== source.groupKey) : currentTags;
        if (!nextTags.includes(key)) nextTags.push(key);
      }
      window.AppState.updateTask(taskId, { tags: nextTags });
      return true;
    }
    return false;
  },

  cancelTaskDrag() {
    if (!this.dragSession) return;
    this.cleanupTaskDrag(true);
  },
  cleanupTaskDrag(render = false) {
    const session = this.dragSession;
    if (!session) return;
    this.stopTaskDragAutoScroll();
    if (session.inputType === 'pointer' && session.pointerId != null) {
      try { this.dragWorkspace.releasePointerCapture(session.pointerId); } catch (_) {}
    }
    this.cancelPendingTouchDrag?.();
    session.family?.remove();
    session.placeholder?.remove();
    document.body.classList.remove('task-drag-active');
    document.querySelectorAll('.task-drop-lane.is-drop-target').forEach(lane => lane.classList.remove('is-drop-target'));
    this.dragSession = null;
    this.dragSuppressClickUntil = performance.now() + 450;
    if (render) this.render();
  },

  getTaskDragEdgeSpeed(position, start, end) {
    const zone = 55;
    const maxSpeed = 18;
    if (position < start + zone) {
      return -maxSpeed * Math.max(0, Math.min(1, (start + zone - position) / zone));
    }
    if (position > end - zone) {
      return maxSpeed * Math.max(0, Math.min(1, (position - (end - zone)) / zone));
    }
    return 0;
  },

  startTaskDragAutoScroll() {
    this.stopTaskDragAutoScroll();
    const tick = () => {
      const session = this.dragSession;
      if (!session) return;
      let scrolled = false;
      const workspaceRect = this.dragWorkspace.getBoundingClientRect();
      const verticalSpeed = this.getTaskDragEdgeSpeed(session.y, workspaceRect.top, workspaceRect.bottom);
      if (verticalSpeed) {
        const before = this.dragWorkspace.scrollTop;
        this.dragWorkspace.scrollTop += verticalSpeed;
        scrolled = scrolled || before !== this.dragWorkspace.scrollTop;
      }
      const kanban = document.getElementById('kanban-view');
      if (kanban && kanban.offsetParent !== null) {
        const rect = kanban.getBoundingClientRect();
        const horizontalSpeed = this.getTaskDragEdgeSpeed(session.x, rect.left, rect.right);
        if (horizontalSpeed) {
          const before = kanban.scrollLeft;
          kanban.scrollLeft += horizontalSpeed;
          scrolled = scrolled || before !== kanban.scrollLeft;
        }
      }
      if (scrolled) this.updateTaskDropTarget(session.x, session.y);
      this.taskDragScrollFrame = requestAnimationFrame(tick);
    };
    this.taskDragScrollFrame = requestAnimationFrame(tick);
  },

  stopTaskDragAutoScroll() {
    if (this.taskDragScrollFrame) cancelAnimationFrame(this.taskDragScrollFrame);
    this.taskDragScrollFrame = null;
  }
};
