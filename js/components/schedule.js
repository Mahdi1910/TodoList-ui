/**
 * Schedule Component Manager
 * Owns schedule draft state and coordinates Date/Time/Repeat submodules.
 */
window.ScheduleComponent = {
  activeTab: 'date',
  currentViewDate: new Date(),
  draftDate: null,
  draftTime: null,
  draftReminders: ['on_time'],
  customReminders: [],
  draftRepeat: { mode: 'none', custom: { interval: 1, unit: 'day', weekdays: [], monthDays: [], yearDates: {} } },
  onApplyCallback: null,
  ITEM_HEIGHT: 40,
  VISIBLE_ITEMS: 5,

  init() {
    this.modalEl = document.getElementById('schedule-modal');
    this.monthYearEl = document.getElementById('calendar-month-year');
    this.gridEl = document.getElementById('calendar-days-grid');
    this.btnCalPrev = document.getElementById('btn-cal-prev');
    this.btnCalNext = document.getElementById('btn-cal-next');
    this.btnQuickToday = document.getElementById('btn-sched-today');
    this.btnQuickTomorrow = document.getElementById('btn-sched-tomorrow');
    this.btnQuickNextWeek = document.getElementById('btn-sched-next-week');
    this.btnQuickNextMonth = document.getElementById('btn-sched-next-month');
    this.btnQuickClear = document.getElementById('btn-sched-clear');
    this.tabDate = document.getElementById('tab-sched-date');
    this.tabTime = document.getElementById('tab-sched-time');
    this.tabRepeat = document.getElementById('tab-sched-repeat');
    this.panelDate = document.getElementById('panel-sched-date');
    this.panelTime = document.getElementById('panel-sched-time');
    this.panelRepeat = document.getElementById('panel-sched-repeat');
    this.repeatOptionsList = document.querySelector('.repeat-options-list');
    this.btnOpenCustomRepeat = document.getElementById('btn-open-custom-repeat');
    this.repeatSummaryText = document.getElementById('repeat-summary-text');
    this.customRepeatModal = document.getElementById('custom-repeat-modal');
    this.customRepeatForm = document.getElementById('custom-repeat-form');
    this.wheelRepeatLabel = document.getElementById('wheel-repeat-label');
    this.wheelRepeatInterval = document.getElementById('wheel-repeat-interval');
    this.wheelRepeatUnit = document.getElementById('wheel-repeat-unit');
    this.subviewRepeatWeek = document.getElementById('subview-repeat-week');
    this.subviewRepeatMonth = document.getElementById('subview-repeat-month');
    this.subviewRepeatYear = document.getElementById('subview-repeat-year');
    this.repeatMonthGridTitle = document.getElementById('repeat-month-grid-title');
    this.repeatMonthDaysGrid = document.getElementById('repeat-month-days-grid');
    this.repeatYearGridTitle = document.getElementById('repeat-year-grid-title');
    this.repeatYearDaysGrid = document.getElementById('repeat-year-days-grid');
    this.btnRepeatYearPrev = document.getElementById('btn-repeat-year-prev');
    this.btnRepeatYearNext = document.getElementById('btn-repeat-year-next');
    this.btnCloseCustomRepeat = document.getElementById('btn-close-custom-repeat');
    this.btnCustomRepCancel = document.getElementById('btn-custom-rep-cancel');
    this.wheelHour = document.getElementById('wheel-hour');
    this.wheelMinute = document.getElementById('wheel-minute');
    this.wheelPeriod = document.getElementById('wheel-period');
    this.btnResetTime = document.getElementById('btn-sched-reset-time');
    this.btnReminderTrigger = document.getElementById('btn-sched-reminder-trigger');
    this.menuReminder = document.getElementById('menu-sched-reminder');
    this.reminderValDisplay = document.getElementById('reminder-value-display');
    this.customRemindersContainer = document.getElementById('custom-reminders-list');
    this.btnOpenCustomReminder = document.getElementById('btn-open-custom-reminder');
    this.customReminderModal = document.getElementById('custom-reminder-modal');
    this.customReminderForm = document.getElementById('custom-reminder-form');
    this.wheelCustomMin = document.getElementById('wheel-custom-min');
    this.wheelCustomHr = document.getElementById('wheel-custom-hr');
    this.wheelCustomDay = document.getElementById('wheel-custom-day');
    this.btnCloseCustomReminder = document.getElementById('btn-close-custom-reminder');
    this.btnCustomRemCancel = document.getElementById('btn-custom-rem-cancel');
    this.btnCancel = document.getElementById('btn-sched-cancel');
    this.btnApply = document.getElementById('btn-sched-apply');
    this.initWheels();
    this.bindEvents();
  },

  open(initialDueDateStr = null, initialTimeStr = null, initialReminders = null, initialRepeat = null, onApply = null) {
    this.draftDate = initialDueDateStr || null;
    this.onApplyCallback = onApply;
    this.draftTime = initialTimeStr ? this.parseTimeString(initialTimeStr) : null;
    this.draftReminders = Array.isArray(initialReminders) && initialReminders.length ? [...initialReminders] : ['on_time'];
    this.draftRepeat = initialRepeat && typeof initialRepeat === 'object'
      ? JSON.parse(JSON.stringify(initialRepeat))
      : { mode: 'none', custom: { interval: 1, unit: 'day', weekdays: [], monthDays: [], yearDates: {} } };
    if (this.draftDate) {
      const parts = this.draftDate.split('-').map(Number);
      this.currentViewDate = new Date(parts[0], parts[1] - 1, parts[2]);
    } else this.currentViewDate = new Date();
    this.switchTab('date');
    this.renderCalendar();
    this.updateReminderUI();
    window.ModalFocusManager.open(this.modalEl, {
      initialFocus: () => this.gridEl?.querySelector('.calendar-day.selected') || this.gridEl?.querySelector('.calendar-day.today') || this.btnQuickToday,
      fallbackFocus: '#btn-open-add-task'
    });
  },

  close(discard = true) {
    if (!this.modalEl?.classList.contains('active')) return;
    this.closeReminderMenu();
    window.ModalFocusManager.close(this.modalEl, { fallbackFocus: '#btn-open-add-task' });
    if (discard) {
      this.draftDate = null;
      this.draftTime = null;
      this.draftReminders = ['on_time'];
      this.draftRepeat = { mode: 'none', custom: { interval: 1, unit: 'day', weekdays: [], monthDays: [], yearDates: {} } };
    }
  },

  apply() {
    if (typeof this.onApplyCallback === 'function') {
      const formattedTime = this.draftTime ? `${this.draftTime.hour}:${this.draftTime.minute} ${this.draftTime.period}` : null;
      let finalDate = this.draftDate;
      if (formattedTime && !finalDate) finalDate = this.formatDateStr(new Date());
      this.onApplyCallback({
        dueDate: finalDate,
        dueTime: formattedTime,
        reminders: [...this.draftReminders],
        repeat: JSON.parse(JSON.stringify(this.draftRepeat))
      });
    }
    this.close(false);
  },

  escapeText(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.textContent;
  },

  handleKeydown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (this.repeatEndModal?.classList.contains('active')) this.closeRepeatEndModal();
    else if (this.customRepeatModal?.classList.contains('active')) this.closeCustomRepeatModal();
    else if (this.customReminderModal?.classList.contains('active')) this.closeCustomReminderModal();
    else if (this.menuReminder?.classList.contains('open')) this.closeReminderMenu();
    else this.close(true);
  }
};
Object.assign(window.ScheduleComponent,
  window.ScheduleEventMethods, window.ScheduleDateMethods, window.ScheduleWheelMethods,
  window.ScheduleTimeReminderMethods, window.ScheduleRepeatMethods, window.ScheduleRepeatCalendarMethods
);
