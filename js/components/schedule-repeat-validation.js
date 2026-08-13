window.ScheduleRepeatValidationMethods = {
  installRepeatEnhancements() {
    if (this._repeatEnhancementsInstalled) return;
    this._repeatEnhancementsInstalled = true;
    const engine = () => window.RepeatEngine;

    const baseOpen = this.open;
    this.open = function enhancedScheduleOpen(...args) {
      const result = baseOpen.apply(this, args);
      this.draftRepeat = engine().normalizeRepeatRule(this.draftRepeat);
      this.renderRepeatEndRow?.();
      return result;
    };

    const baseSelectPreset = this.selectRepeatPreset;
    this.selectRepeatPreset = function enhancedRepeatPreset(mode) {
      baseSelectPreset.call(this, mode);
      this.draftRepeat = engine().normalizeRepeatRule(this.draftRepeat);
      if (mode !== 'none' && !this.draftDate) this.selectDate(engine().today());
      this.clearRepeatValidationError?.();
      this.renderRepeatEndRow?.();
    };

    const baseCustomSubmit = this.submitCustomRepeat;
    this.submitCustomRepeat = function enhancedCustomSubmit() {
      const candidate = engine().normalizeRepeatRule({ ...this.draftRepeat, mode: 'custom' });
      const check = engine().validateRepeatRule(candidate);
      if (!check.valid) return this.showRepeatValidationError(check.message);
      this.clearRepeatValidationError();
      this.draftRepeat = check.repeat;
      if (!this.draftDate) this.selectDate(engine().today());
      baseCustomSubmit.call(this);
      this.draftRepeat = engine().normalizeRepeatRule(this.draftRepeat);
      this.renderRepeatEndRow();
    };

    const baseApply = this.apply;
    this.apply = function enhancedScheduleApply() {
      this.draftRepeat = engine().normalizeRepeatRule(this.draftRepeat);
      if (this.draftRepeat.mode !== 'none' && !this.draftDate) this.selectDate(engine().today());
      const check = engine().validateRepeatRule(this.draftRepeat);
      if (!check.valid) {
        this.switchTab('repeat');
        return this.showRepeatValidationError(check.message);
      }
      if (check.repeat.end.type === 'date') {
        const start = this.draftDate || engine().today();
        if (check.repeat.end.date < start) {
          this.switchTab('repeat');
          return this.showRepeatValidationError('Repeat end date cannot be before the task date.');
        }
      }
      this.clearRepeatValidationError();
      this.draftRepeat = check.repeat;
      return baseApply.call(this);
    };
  },

  ensureRepeatValidationMessage() {
    if (this.repeatValidationMessage || !this.customRepeatForm) return;
    const message = document.createElement('div');
    message.className = 'repeat-validation-message';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    this.customRepeatForm.querySelector('.custom-repeat-footer')?.insertAdjacentElement('beforebegin', message);
    this.repeatValidationMessage = message;
  },

  showRepeatValidationError(message) {
    this.ensureRepeatValidationMessage();
    const text = message || 'Complete the repeat settings.';
    if (this.repeatValidationMessage) this.repeatValidationMessage.textContent = text;
    if (this.repeatMainValidationMessage) this.repeatMainValidationMessage.textContent = text;
    return false;
  },

  clearRepeatValidationError() {
    if (this.repeatValidationMessage) this.repeatValidationMessage.textContent = '';
    if (this.repeatMainValidationMessage) this.repeatMainValidationMessage.textContent = '';
  }
};
