Object.assign(window.AppDataService, {
  resolveReminders(reminders = []) {
    const ids = [...new Set(reminders)].filter(id => id && id !== 'none');
    const builtin = new Set(window.TodoStorageMappers.BUILTIN_REMINDERS.map(item => item.id));
    const definitions = [];

    for (const id of ids) {
      if (builtin.has(id)) continue;

      const stored = window.AppState.getReminderDefinition(id);
      if (stored && !stored.isBuiltin) {
        definitions.push({ ...stored });
        continue;
      }

      const match = id.match(/^custom-(\d+)d-(\d+)h-(\d+)m$/);
      if (!match) throw new Error(`Unknown reminder: ${id}`);
      const day = Number(match[1]);
      const hr = Number(match[2]);
      const min = Number(match[3]);
      const parts = [];
      if (day) parts.push(`${day}d`);
      if (hr) parts.push(`${hr}h`);
      if (min) parts.push(`${min}m`);
      const definition = window.TodoStorageMappers.customReminderToDefinition({
        id,
        day,
        hr,
        min,
        label: `${parts.join(' ')} before`
      });
      if (definition) definitions.push(definition);
    }

    return { ids, definitions };
  },

  saveReminderDefinition(custom) {
    return this.enqueue(async () => {
      const builtinIds = new Set(window.TodoStorageMappers.BUILTIN_REMINDERS.map(item => item.id));
      if (builtinIds.has(custom?.id)) throw new Error('Built-in reminders cannot be replaced.');
      const definition = window.TodoStorageMappers.customReminderToDefinition(custom);
      if (!definition) throw new Error('Invalid custom reminder.');
      const S = window.TodoDbSchema.STORES;
      await window.TodoDb.withTransaction(S.REMINDER_DEFINITIONS, 'readwrite', tx =>
        window.TodoRepositories.put(tx, S.REMINDER_DEFINITIONS, definition)
      );
      window.AppStateSync.upsertReminderDefinitions([definition]);
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
      window.AppStateSync.removeReminderDefinition(reminderId);
      window.AppStateSync.removeReminderFromTasks(reminderId);
      return true;
    });
  }
});
