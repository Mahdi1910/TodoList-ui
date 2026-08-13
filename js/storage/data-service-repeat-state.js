Object.assign(window.AppDataService, {
  repairRepeatState() {
    return this.enqueue(async () => {
      const repaired = window.AppState.tasks.flatMap(live => {
        let familySlotId = live.familySlotId || null;
        let dueDate = live.dueDate || null;
        let repeatState = live.repeatState ? { ...live.repeatState } : null;
        let changed = false;

        if (live.parentTaskId && !familySlotId) {
          familySlotId = this.createId('slot');
          changed = true;
        }
        if (live.repeat && live.repeat.mode !== 'none') {
          if (!dueDate) {
            dueDate = window.RepeatEngine.today();
            changed = true;
          }
          const previous = repeatState || {};
          if (!previous.seriesId || previous._needsRepair) {
            repeatState = window.RepeatEngine.createInitialRepeatState(live.repeat, dueDate, previous);
            repeatState.seriesId = previous.seriesId || this.createId('series');
            changed = true;
          }
          if (repeatState?._needsRepair) {
            const { _needsRepair, ...cleanState } = repeatState;
            repeatState = cleanState;
            changed = true;
          }
        }
        if (!changed) return [];
        return [{
          ...live,
          familySlotId,
          dueDate,
          repeatState,
          tags: [...(live.tags || [])],
          reminders: [...(live.reminders || [])]
        }];
      });

      if (!repaired.length) return 0;
      const stores = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction([stores.TASKS, stores.TASK_REPEAT_RULES], 'readwrite', async tx => {
        for (const task of repaired) {
          await window.TodoRepositories.put(tx, stores.TASKS, window.TodoStorageMappers.taskToRow(task));
          const row = window.TodoStorageMappers.repeatToRow(task.id, task.repeat, task.repeatState);
          if (row) await window.TodoRepositories.put(tx, stores.TASK_REPEAT_RULES, row);
        }
      });

      const byId = new Map(repaired.map(task => [task.id, task]));
      window.AppState.tasks = window.AppState.tasks.map(task => byId.get(task.id) || task);
      window.AppState.rebuildTaskOrder();
      return repaired.length;
    });
  }
});
