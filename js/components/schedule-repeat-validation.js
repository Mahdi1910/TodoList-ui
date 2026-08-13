window.ScheduleRepeatValidationMethods = {
  ensureRepeatValidationMessage() {
    if (this.repeatValidationMessage || !this.customRepeatForm) return;
    const message = document.createElement('div');
    message.className = 'repeat-validation-message';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    this.customRepeatForm.querySelector('.custom-repeat-footer')?.insertAdjacentElement('beforebegin', message);
    this.repeatValidationMessage = message;
  },
  validateRepeatDraft() {
    this.draftRepeat = window.RepeatEngine.normalizeRepeatRule(this.draftRepeat);
    if (this.draftRepeat.mode !== 'none' && !this.draftDate) this.selectDate(window.RepeatEngine.today());
    const result = window.RepeatEngine.validateRepeatRule(this.draftRepeat);
    if (!result.valid) return { valid: false, message: result.message };
    if (result.repeat.end.type === 'date') {
      const start = this.draftDate || window.RepeatEngine.today();
      if (result.repeat.end.date < start) return { valid: false, message: 'Choose an end date on or after the task date.' };
    }
    this.draftRepeat = result.repeat;
    return { valid: true, repeat: result.repeat };
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

Object.assign(
  window.ScheduleRepeatMethods,
  window.ScheduleRepeatEndMethods || {},
  window.ScheduleRepeatValidationMethods
);
