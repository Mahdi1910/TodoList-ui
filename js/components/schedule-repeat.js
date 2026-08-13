window.ScheduleRepeatMethods = {
  selectRepeatPreset(presetMode) {
    this.draftRepeat = window.RepeatEngine.normalizeRepeatRule({ ...(this.draftRepeat || {}), mode: presetMode });
    if (presetMode !== 'none' && !this.draftDate) this.selectDate(window.RepeatEngine.today());
    this.clearRepeatValidationError?.();
    this.renderRepeatPresetList();
    this.renderRepeatEndRow?.();
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
    const repeat = window.RepeatEngine.normalizeRepeatRule(this.draftRepeat);
    if (repeat.mode === 'none') return void (this.repeatSummaryText.textContent = 'Does not repeat');
    if (repeat.mode === 'daily') return void (this.repeatSummaryText.textContent = 'Repeats daily');
    if (repeat.mode === 'weekly') return void (this.repeatSummaryText.textContent = 'Repeats weekly');
    if (repeat.mode === 'monthly') return void (this.repeatSummaryText.textContent = 'Repeats monthly');
    if (repeat.mode === 'yearly') return void (this.repeatSummaryText.textContent = 'Repeats yearly');

    const custom = repeat.custom;
    const unitLabel = custom.interval === 1 ? custom.unit : `${custom.unit}s`;
    let text = `Repeats every ${custom.interval} ${unitLabel}`;
    if (custom.unit === 'week' && custom.weekdays.length) {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      text += ` on ${[...custom.weekdays].sort((a, b) => a - b).map(day => names[day]).join(', ')}`;
    } else if (custom.unit === 'month' && custom.monthDays.length) {
      text += ` on the ${[...custom.monthDays].sort((a, b) => a - b).map(day => `${day}${this.getOrdinalSuffix(day)}`).join(', ')}`;
    } else if (custom.unit === 'year') {
      const total = Object.values(custom.yearDates).reduce((sum, days) => sum + days.length, 0);
      if (total) text += ` across ${total} date${total > 1 ? 's' : ''}`;
    }
    this.repeatSummaryText.textContent = text;
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
    this.customRepeatSnapshot = window.RepeatEngine.clone(this.draftRepeat);
    this.draftRepeat = window.RepeatEngine.normalizeRepeatRule({ ...(this.draftRepeat || {}), mode: 'custom' });
    const custom = this.draftRepeat.custom;
    const units = ['day', 'week', 'month', 'year'];
    requestAnimationFrame(() => {
      this.scrollWheelToIndex(this.wheelRepeatLabel, 0, false, '');
      this.scrollWheelToIndex(this.wheelRepeatInterval, Math.max(0, custom.interval - 1), false, 'repeatInterval');
      this.scrollWheelToIndex(this.wheelRepeatUnit, Math.max(0, units.indexOf(custom.unit)), false, 'repeatUnit');
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
    if (!commit && this.customRepeatSnapshot) this.draftRepeat = window.RepeatEngine.clone(this.customRepeatSnapshot);
    window.ModalFocusManager.close(this.customRepeatModal, { fallbackFocus: this.btnOpenCustomRepeat });
    this.customRepeatSnapshot = null;
    this.renderRepeatPresetList();
    this.renderRepeatEndRow?.();
    this.updateRepeatSummary();
  },

  submitCustomRepeat() {
    const candidate = window.RepeatEngine.normalizeRepeatRule({ ...this.draftRepeat, mode: 'custom' });
    const check = window.RepeatEngine.validateRepeatRule(candidate);
    if (!check.valid) return this.showRepeatValidationError?.(check.message);
    this.clearRepeatValidationError?.();
    this.draftRepeat = check.repeat;
    if (!this.draftDate) this.selectDate(window.RepeatEngine.today());
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
      button.setAttribute('aria-pressed', selectedDays.includes(parseInt(button.dataset.day, 10)) ? 'true' : 'false');
    });
  },

  toggleCustomRepeatWeekday(day) {
    const values = this.draftRepeat.custom.weekdays || [];
    this.draftRepeat.custom.weekdays = values.includes(day) ? values.filter(value => value !== day) : [...values, day];
    this.renderCustomRepeatWeekdays();
  }
};
