window.TaskDragMethods = {
  initTaskDrag() {
    this.dragWorkspace = document.querySelector('.workspace-content');
    if (!this.dragWorkspace) return;
    this.dragLayer = document.createElement('div');
    this.dragLayer.className = 'task-drag-layer';
    document.body.appendChild(this.dragLayer);
    this.dragPending = null;
    this.dragSession = null;
    this.dragSuppressClickUntil = 0;
    this.dragWorkspace.addEventListener('pointerdown', e => this.onTaskPointerDown(e));
    document.addEventListener('pointermove', e => this.onTaskPointerMove(e), { passive: false });
    document.addEventListener('pointerup', e => this.onTaskPointerUp(e));
    document.addEventListener('pointercancel', e => this.onTaskPointerCancel(e));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.dragSession) {
        e.preventDefault();
        this.cancelTaskDrag();
      }
    });
    window.addEventListener('blur', () => this.dragSession && this.cancelTaskDrag());
    this.dragWorkspace.addEventListener('click', e => {
      if (performance.now() < this.dragSuppressClickUntil) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
    document.addEventListener('contextmenu', e => {
      if (this.dragPending || this.touchDragPending || this.dragSession) e.preventDefault();
    });
    this.initTaskTouchDrag?.();
  },

  setDropLaneContext(element, lane, groupType = 'none', groupKey = 'all') {
    if (!element) return;
    element.classList.add('task-drop-lane');
    element.dataset.taskDropLane = lane;
    element.dataset.groupType = groupType;
    element.dataset.groupKey = groupKey ?? '';
  },

  clearDropLaneContext(element) {
    if (!element) return;
    element.classList.remove('task-drop-lane', 'is-drop-target');
    delete element.dataset.taskDropLane;
    delete element.dataset.groupType;
    delete element.dataset.groupKey;
  },

  getTaskDragTarget(target) {
    if (document.querySelector('.modal-overlay.active')) return null;
    if (target.closest('button,input,a,select,textarea,.task-checkbox-wrapper,.subtask-card')) return null;
    const family = target.closest('.task-family');
    const rootCard = family?.querySelector(':scope > .task-card:not(.subtask-card)');
    if (!family || !rootCard || !rootCard.contains(target)) return null;
    const task = window.AppState.getTask(family.dataset.parentId);
    if (!task || task.parentTaskId) return null;
    return { family, task };
  },

  onTaskPointerDown(e) {
    if (e.pointerType === 'touch') return;
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const target = this.getTaskDragTarget(e.target);
    if (!target) return;
    const { family, task } = target;
    this.cancelPendingTaskDrag();
    this.dragPending = {
      pointerId: e.pointerId,
      family,
      taskId: task.id,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => this.activatePointerTaskDrag(), 300)
    };
  },

  cancelPendingTaskDrag() {
    if (this.dragPending?.timer) clearTimeout(this.dragPending.timer);
    this.dragPending = null;
  },

  onTaskPointerMove(e) {
    if (this.dragSession?.pointerId === e.pointerId) {
      e.preventDefault();
      this.dragSession.x = e.clientX;
      this.dragSession.y = e.clientY;
      this.positionFloatingFamily(e.clientX, e.clientY);
      this.updateTaskDropTarget(e.clientX, e.clientY);
      return;
    }
    if (!this.dragPending || this.dragPending.pointerId !== e.pointerId) return;
    this.dragPending.x = e.clientX;
    this.dragPending.y = e.clientY;
    const distance = Math.hypot(e.clientX - this.dragPending.startX, e.clientY - this.dragPending.startY);
    if (distance > 8) this.cancelPendingTaskDrag();
  },
  activatePointerTaskDrag() {
    const pending = this.dragPending;
    if (!pending?.family?.isConnected || this.dragSession) return this.cancelPendingTaskDrag();
    this.dragPending = null;
    this.beginTaskDragSession(pending, 'pointer');
  },

  beginTaskDragSession(pending, inputType) {
    const task = window.AppState.getTask(pending.taskId);
    const sourceLane = pending.family.closest('[data-task-drop-lane]');
    if (!task || !sourceLane) return;

    this.closeTaskActionMenu?.(false);
    this.closeAllContextMenus?.();
    window.WorkspaceControls?.closeMenu();
    window.SidebarComponent?.closeSidebarActionMenus();
    window.SubtaskEditorComponent?.closeMenus();

    const rect = pending.family.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = 'task-drop-placeholder';
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.width = `${rect.width}px`;
    sourceLane.insertBefore(placeholder, pending.family);
    this.dragLayer.appendChild(pending.family);
    pending.family.classList.add('is-dragging');
    pending.family.style.width = `${rect.width}px`;
    pending.family.style.left = `${rect.left}px`;
    pending.family.style.top = `${rect.top}px`;

    this.dragSession = {
      inputType,
      pointerId: inputType === 'pointer' ? pending.pointerId : null,
      touchIdentifier: inputType === 'touch' ? pending.identifier : null,
      taskId: task.id,
      completed: Boolean(task.completed),
      family: pending.family,
      placeholder,
      sourceLane,
      currentLane: sourceLane,
      sourceContext: this.getDropLaneContext(sourceLane),
      offsetX: pending.x - rect.left,
      offsetY: pending.y - rect.top,
      x: pending.x,
      y: pending.y,
      startSortKey: window.WorkspaceControls?.sortKey || 'custom',
      baselineIds: []
    };
    document.body.classList.add('task-drag-active');
    sourceLane.classList.add('is-drop-target');
    this.dragSession.baselineIds = this.collectVisibleDragOrder();
    this.dragSuppressClickUntil = performance.now() + 700;
    if (inputType === 'pointer') {
      try { this.dragWorkspace.setPointerCapture(pending.pointerId); } catch (_) {}
    }
    this.positionFloatingFamily(this.dragSession.x, this.dragSession.y);
    this.startTaskDragAutoScroll();
  },

  positionFloatingFamily(x, y) {
    const session = this.dragSession;
    if (!session) return;
    session.family.style.left = `${x - session.offsetX}px`;
    session.family.style.top = `${y - session.offsetY}px`;
  },

  getDropLaneContext(lane) {
    return {
      lane: lane?.dataset.taskDropLane || '',
      groupType: lane?.dataset.groupType || 'none',
      groupKey: lane?.dataset.groupKey ?? 'all'
    };
  },

  isCompatibleDropLane(lane) {
    if (!lane || lane.offsetParent === null) return false;
    const expected = this.dragSession?.completed ? 'completed' : 'active';
    return lane.dataset.taskDropLane === expected;
  },

  findDropLaneAtPoint(x, y) {
    for (const element of document.elementsFromPoint(x, y)) {
      const lane = element.closest?.('[data-task-drop-lane]');
      if (this.isCompatibleDropLane(lane)) return lane;
    }
    return null;
  },
  updateTaskDropTarget(x, y) {
    const session = this.dragSession;
    if (!session) return;
    const lane = this.findDropLaneAtPoint(x, y);
    if (!lane) return;
    const oldLane = session.currentLane;
    const siblings = [...lane.children].filter(element =>
      element.classList?.contains('task-family') && element.dataset.parentId !== session.taskId
    );
    const before = siblings.find(element => {
      const rect = element.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    }) || null;
    const desiredNext = before;
    const alreadyPlaced = session.placeholder.parentElement === lane && session.placeholder.nextElementSibling === desiredNext;
    if (alreadyPlaced || (!desiredNext && session.placeholder.parentElement === lane && session.placeholder === lane.lastElementChild)) {
      session.currentLane = lane;
      return;
    }

    const rects = this.captureDragFamilyRects([oldLane, lane]);
    if (before) lane.insertBefore(session.placeholder, before);
    else lane.appendChild(session.placeholder);
    session.currentLane = lane;
    document.querySelectorAll('.task-drop-lane.is-drop-target').forEach(item => item.classList.remove('is-drop-target'));
    lane.classList.add('is-drop-target');
    this.animateDragFamilyShift(rects);
  },

  captureDragFamilyRects(lanes) {
    const rects = new Map();
    [...new Set(lanes.filter(Boolean))].forEach(lane => {
      [...lane.children].forEach(element => {
        if (element.classList?.contains('task-family') && !element.classList.contains('is-dragging')) {
          rects.set(element, element.getBoundingClientRect());
        }
      });
    });
    return rects;
  },
  animateDragFamilyShift(beforeRects) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    beforeRects.forEach((before, element) => {
      if (!element.isConnected) return;
      const after = element.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (!dx && !dy) return;
      element.style.transition = 'none';
      element.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        element.style.transition = 'transform var(--transition-fast)';
        element.style.transform = '';
      });
    });
  },

  collectVisibleDragOrder() {
    const session = this.dragSession;
    if (!session) return [];
    const laneType = session.completed ? 'completed' : 'active';
    const seen = new Set();
    const ordered = [];
    document.querySelectorAll(`[data-task-drop-lane="${laneType}"]`).forEach(lane => {
      if (lane.offsetParent === null) return;
      [...lane.children].forEach(element => {
        let id = null;
        if (element === session.placeholder) id = session.taskId;
        else if (element.classList?.contains('task-family')) id = element.dataset.parentId;
        if (!id || id === session.taskId && element !== session.placeholder || seen.has(id)) return;
        seen.add(id);
        ordered.push(id);
      });
    });
    return ordered;
  },

  onTaskPointerUp(e) {
    if (this.dragSession?.pointerId === e.pointerId) return this.commitTaskDrag();
    if (this.dragPending?.pointerId === e.pointerId) this.cancelPendingTaskDrag();
  },

  onTaskPointerCancel(e) {
    if (this.dragSession?.pointerId === e.pointerId) this.cancelTaskDrag();
    if (this.dragPending?.pointerId === e.pointerId) this.cancelPendingTaskDrag();
  }
};
