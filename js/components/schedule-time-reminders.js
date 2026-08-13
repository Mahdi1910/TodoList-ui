window.ScheduleTimeReminderMethods = {
  getCustomReminders() {
    return (window.AppState.reminderDefinitions || [])
      .map(definition => window.TodoStorageMappers.definitionToCustomReminder(definition))
      .filter(Boolean);
  },

  scrollWheelsToDraftTime() {
    if (!this.draftTime) this.draftTime = this.getCurrentTimeObj();
    const hours = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
    const hourIndex = Math.max(0, hours.indexOf(this.draftTime.hour));
    const minuteIndex = Math.max(0, minutes.indexOf(this.draftTime.minute));
    const periodIndex = this.draftTime.period === 'PM' ? 1 : 0;
    requestAnimationFrame(() => {
      this.scrollWheelToIndex(this.wheelHour, hourIndex, false, 'hour');
      this.scrollWheelToIndex(this.wheelMinute, minuteIndex, false, 'minute');
      this.scrollWheelToIndex(this.wheelPeriod, periodIndex, false, 'period');
    });
  },

  resetTime() { this.draftTime = this.getCurrentTimeObj(); this.draftReminders = []; this.scrollWheelsToDraftTime(); this.updateReminderUI(); },
  getCurrentTimeObj() {
    const now = new Date(); let hours = now.getHours(); const minute = String(now.getMinutes()).padStart(2, '0'); const period = hours >= 12 ? 'PM' : 'AM'; hours %= 12; if (!hours) hours = 12;
    return { hour: String(hours).padStart(2, '0'), minute, period };
  },
  parseTimeString(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return this.getCurrentTimeObj();
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i); if (!match) return this.getCurrentTimeObj();
    return { hour: String(parseInt(match[1], 10)).padStart(2, '0'), minute: match[2], period: match[3].toUpperCase() };
  },
  toggleReminderMenu() { this.menuReminder?.classList.contains('open') ? this.closeReminderMenu() : this.openReminderMenu(); },
  openReminderMenu() { this.renderReminderMenuContent(); this.menuReminder?.classList.add('open'); this.btnReminderTrigger?.setAttribute('aria-expanded', 'true'); },
  closeReminderMenu() { this.menuReminder?.classList.remove('open'); this.btnReminderTrigger?.setAttribute('aria-expanded', 'false'); },

  toggleReminderSelection(key) {
    if (key === 'none') this.draftReminders = ['none'];
    else {
      this.draftReminders = this.draftReminders.filter(value => value !== 'none');
      this.draftReminders = this.draftReminders.includes(key) ? this.draftReminders.filter(value => value !== key) : [...this.draftReminders, key];
      if (!this.draftReminders.length) this.draftReminders = ['none'];
    }
    this.updateReminderUI(); this.renderReminderMenuContent();
  },

  renderReminderMenuContent() {
    if (!this.menuReminder) return;
    this.menuReminder.querySelectorAll('.reminder-menu-item').forEach(item => {
      const key = item.dataset.reminder; if (!key) return;
      const selected = this.draftReminders.includes(key); item.classList.toggle('selected', selected); item.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    if (!this.customRemindersContainer) return;
    this.customRemindersContainer.innerHTML = '';
    this.getCustomReminders().forEach(custom => {
      const selected = this.draftReminders.includes(custom.id);
      const div = document.createElement('div'); div.className = `reminder-menu-item ${selected ? 'selected' : ''}`; div.dataset.reminder = custom.id; div.setAttribute('role', 'menuitemcheckbox'); div.setAttribute('aria-checked', selected ? 'true' : 'false');
      const label = document.createElement('span'); label.textContent = custom.label;
      const actions = document.createElement('div'); actions.style.cssText = 'display:flex;align-items:center;gap:6px;';
      const check = document.createElement('span'); check.className = 'rem-check-icon'; check.textContent = '✓';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn-del-custom-rem'; remove.dataset.id = custom.id; remove.title = 'Remove custom reminder'; remove.textContent = '×';
      actions.append(check, remove); div.append(label, actions); this.customRemindersContainer.appendChild(div);
    });
  },

  updateReminderUI() {
    if (!this.reminderValDisplay) return;
    if (!this.draftReminders.length || this.draftReminders.includes('none')) { this.reminderValDisplay.textContent = 'None'; return; }
    const customs = this.getCustomReminders();
    this.reminderValDisplay.textContent = this.draftReminders.map(key => {
      const builtin = window.TodoStorageMappers.BUILTIN_REMINDERS.find(item => item.id === key);
      return builtin?.label || customs.find(custom => custom.id === key)?.label || key;
    }).join(', ');
  },

  async deleteCustomReminder(id) {
    try {
      await window.AppDataService.deleteReminderDefinition(id);
      this.draftReminders = this.draftReminders.filter(key => key !== id); if (!this.draftReminders.length) this.draftReminders = ['none'];
      this.updateReminderUI(); this.renderReminderMenuContent();
    } catch (error) { window.AppPersistence?.reportError('Could not delete this custom reminder.', error); }
  },

  openCustomReminderModal() {
    if (!this.customReminderModal) return;
    this.draftCustomWheel = { min: 0, hr: 0, day: 0 };
    requestAnimationFrame(() => {
      this.scrollWheelToIndex(this.wheelCustomMin, 0, false, 'customMin'); this.scrollWheelToIndex(this.wheelCustomHr, 0, false, 'customHr'); this.scrollWheelToIndex(this.wheelCustomDay, 0, false, 'customDay');
    });
    window.ModalFocusManager.open(this.customReminderModal, { trigger: this.btnOpenCustomReminder, initialFocus: this.wheelCustomMin, fallbackFocus: this.btnOpenCustomReminder });
  },
  closeCustomReminderModal() { if (this.customReminderModal?.classList.contains('active')) window.ModalFocusManager.close(this.customReminderModal, { fallbackFocus: this.btnOpenCustomReminder }); },

  async submitCustomReminder() {
    const { min, hr, day } = this.draftCustomWheel || { min: 0, hr: 0, day: 0 };
    if (!min && !hr && !day) return this.closeCustomReminderModal();
    const parts = []; if (day) parts.push(`${day}d`); if (hr) parts.push(`${hr}h`); if (min) parts.push(`${min}m`);
    const custom = { id: `custom-${day}d-${hr}h-${min}m`, label: `${parts.join(' ')} before`, min, hr, day };
    try {
      await window.AppDataService.saveReminderDefinition(custom);
      this.toggleReminderSelection(custom.id); this.closeCustomReminderModal();
    } catch (error) { window.AppPersistence?.reportError('Could not save this custom reminder.', error); }
  }
};
