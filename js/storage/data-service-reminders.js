Object.assign(window.AppDataService, {
  saveReminderDefinition(custom) {
    return this.enqueue(async () => {
      const definition = window.TodoStorageMappers.customReminderToDefinition(custom);
      if (!definition) throw new Error('Invalid custom reminder.');
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction(S.REMINDER_DEFINITIONS, 'readwrite', tx =>
        window.TodoRepositories.put(tx, S.REMINDER_DEFINITIONS, definition)
      );
      return definition;
    });
  },

  deleteReminderDefinition(reminderId) {
    return this.enqueue(async () => {
      const S = window.TodoDbSchema.STORES;
      const deleted = await window.TodoDb.withTransaction(
        [S.REMINDER_DEFINITIONS, S.TASK_REMINDERS],
        'readwrite',
        async tx => {
          const definition = await window.TodoRepositories.get(tx, S.REMINDER_DEFINITIONS, reminderId);
          if (!definition || definition.isBuiltin) return false;
          await window.TodoRepositories.deleteByIndex(tx, S.TASK_REMINDERS, 'by_reminder_id', reminderId);
          await window.TodoRepositories.remove(tx, S.REMINDER_DEFINITIONS, reminderId);
          return true;
        }
      );
      if (!deleted) return false;
      window.AppState.tasks.forEach(task => {
        task.reminders = (task.reminders || []).filter(id => id !== reminderId);
        if (!task.reminders.length) task.reminders = ['none'];
      });
      return true;
    });
  }
});
