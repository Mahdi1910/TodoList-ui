window.ScheduleRepeatMethods = {
  selectRepeatPreset(presetMode) {
    if (!this.draftRepeat) this.draftRepeat = { mode: 'none', custom: { interval: 1, unit: 'day', weekdays: [], monthDays: [], yearDates: {} } };
    this.draftRepeat.mode = presetMode;
    this.renderRepeatPresetList();
    this.updateRepeatSummary();
  },

  renderRepeatPresetList() {
    if (!this.repeatOptionsList) return;
    const currentMode = this.draftRepeat?.mode || 'none';
    this.repeatOptionsList.querySelectorAll('.repeat-option-item').forEach(item => {
      const mode = item.dataset.repeatPreset;
      if (!mode) return;
      const selected = currentMode === mode;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    if (this.btnOpenCustomRepeat) {
      const selected = currentMode === 'custom';
      this.btnOpenCustomRepeat.classList.toggle('selected', selected);
      this.btnOpenCustomRepeat.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
  },

  updateRepeatSummary() {
    if (!this.repeatSummaryText) return;
    const mode = this.draftRepeat?.mode || 'none';
    if (mode === 'none') this.repeatSummaryText.textContent = 'Does not repeat';
    else if (mode === 'daily') this.repeatSummaryText.textContent = 'Repeats daily';
    else if (mode === 'weekly') this.repeatSummaryText.textContent = 'Repeats weekly';
    else if (mode === 'monthly') this.repeatSummaryText.textContent = 'Repeats monthly';
    else if (mode === 'yearly') this.repeatSummaryText.textContent = 'Repeats yearly';
    else if (mode === 'custom') {
      const custom = this.draftRepeat.custom || { interval: 1, unit: 'day' };
      const unitLabel = custom.interval === 1 ? custom.unit : `${custom.unit}s`;
      let text = `Repeats every ${custom.interval} ${unitLabel}`;
      if (custom.unit === 'week' && custom.weekdays?.length) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        text += ` on ${custom.weekdays.sort((a, b) => a - b).map(day => dayNames[day]).join(', ')}`;
      } else if (custom.unit === 'month' && custom.monthDays?.length) {
        text += ` on the ${custom.monthDays.sort((a, b) => a - b).map(day => `${day}${this.getOrdinalSuffix(day)}`).join(', ')}`;
      } else if (custom.unit === 'year' && custom.yearDates && Object.keys(custom.yearDates).length) {
        let count = 0;
        Object.values(custom.yearDates).forEach(days => count += days.length);
        text += ` across ${count} date${count > 1 ? 's' : ''}`;
      }
      this.repeatSummaryText.textContent = text;
    }
  },

  getOrdinalSuffix(value) {
    const j = value % 10, k = value % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  },

  openCustomRepeatModal() {
    if (!this.customRepeatModal) return;
    this.customRepeatSnapshot = JSON.parse(JSON.stringify(
      this.draftRepeat || { mode: 'none', custom: { interval: 1, unit: 'day', weekdays: [], monthDays: [], yearDates: {} } }
    ));
    if (!this.draftRepeat) this.draftRepeat = { mode: 'custom', custom: { interval: 1, unit: 'day', weekdays: [], monthDays: [], yearDates: {} } };
    this.draftRepeat.mode = 'custom';
    if (!this.draftRepeat.custom) this.draftRepeat.custom = { interval: 1, unit: 'day', weekdays: [], monthDays: [], yearDates: {} };
    const custom = this.draftRepeat.custom;
    const intervalIndex = Math.max(0, custom.interval - 1);
    const units = ['day', 'week', 'month', 'year'];
    const unitIndex = Math.max(0, units.indexOf(custom.unit));
    requestAnimationFrame(() => {
      this.scrollWheelToIndex(this.wheelRepeatLabel, 0, false, '');
      this.scrollWheelToIndex(this.wheelRepeatInterval, intervalIndex, false, 'repeatInterval');
      this.scrollWheelToIndex(this.wheelRepeatUnit, unitIndex, false, 'repeatUnit');
    });
    this.updateCustomRepeatSubviews(custom.unit);
    window.ModalFocusManager.open(this.customRepeatModal, {
      trigger: this.btnOpenCustomRepeat,
      initialFocus: this.wheelRepeatInterval,
      fallbackFocus: this.btnOpenCustomRepeat
    });
  },

  closeCustomRepeatModal(commit = false) {
    if (!this.customRepeatModal?.classList.contains('active')) return;
    if (!commit && this.customRepeatSnapshot) this.draftRepeat = JSON.parse(JSON.stringify(this.customRepeatSnapshot));
    window.ModalFocusManager.close(this.customRepeatModal, { fallbackFocus: this.btnOpenCustomRepeat });
    this.customRepeatSnapshot = null;
    this.renderRepeatPresetList();
    this.updateRepeatSummary();
  },

  submitCustomRepeat() {
    this.draftRepeat.mode = 'custom';
    this.closeCustomRepeatModal(true);
  },

  updateCustomRepeatSubviews(unit) {
    if (this.subviewRepeatWeek) this.subviewRepeatWeek.style.display = unit === 'week' ? 'block' : 'none';
    if (this.subviewRepeatMonth) this.subviewRepeatMonth.style.display = unit === 'month' ? 'block' : 'none';
    if (this.subviewRepeatYear) this.subviewRepeatYear.style.display = unit === 'year' ? 'block' : 'none';
    if (unit === 'week') this.renderCustomRepeatWeekdays();
    else if (unit === 'month') this.renderCustomRepeatMonthGrid();
    else if (unit === 'year') {
      this.repeatYearViewMonthIndex = (this.currentViewDate || new Date()).getMonth();
      this.renderCustomRepeatYearGrid();
    }
  },

  renderCustomRepeatWeekdays() {
    if (!this.subviewRepeatWeek) return;
    const selectedDays = this.draftRepeat.custom.weekdays || [];
    this.subviewRepeatWeek.querySelectorAll('.weekday-circle-btn').forEach(button => {
      const day = parseInt(button.dataset.day, 10);
      button.setAttribute('aria-pressed', selectedDays.includes(day) ? 'true' : 'false');
    });
  },

  toggleCustomRepeatWeekday(day) {
    if (!this.draftRepeat.custom.weekdays) this.draftRepeat.custom.weekdays = [];
    const values = this.draftRepeat.custom.weekdays;
    this.draftRepeat.custom.weekdays = values.includes(day) ? values.filter(value => value !== day) : [...values, day];
    this.renderCustomRepeatWeekdays();
  }
};
