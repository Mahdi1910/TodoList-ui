Object.assign(window.AppDataService, {
  repairRepeatState() {
    return this.enqueue(async () => {
      const changed = [];
      for (const task of window.AppState.tasks) {
        let dirty = false;
        if (task.parentTaskId && !task.familySlotId) { task.familySlotId = this.createId('slot'); dirty = true; }
        if (task.repeat && task.repeat.mode !== 'none') {
          if (!task.dueDate) { task.dueDate = window.RepeatEngine.today(); dirty = true; }
          const previous = task.repeatState || {};
          if (!previous.seriesId || previous._needsRepair) {
            task.repeatState = window.RepeatEngine.createInitialRepeatState(task.repeat, task.dueDate, previous);
            task.repeatState.seriesId = previous.seriesId || this.createId('series');
            dirty = true;
          }
          if (task.repeatState?._needsRepair) { delete task.repeatState._needsRepair; dirty = true; }
        }
        if (dirty) changed.push(task);
      }
      if (!changed.length) return 0;
      const S = window.TodoDbSchema.STORES, M = window.TodoStorageMappers, R = window.TodoRepositories;
      await window.TodoDb.withTransaction([S.TASKS, S.TASK_REPEAT_RULES], 'readwrite', async tx => {
        for (const task of changed) {
          await R.put(tx, S.TASKS, M.taskToRow(task));
          const row = M.repeatToRow(task.id, task.repeat, task.repeatState);
          if (row) await R.put(tx, S.TASK_REPEAT_RULES, row); else await R.remove(tx, S.TASK_REPEAT_RULES, task.id);
        }
      });
      return changed.length;
    });
  }
});
