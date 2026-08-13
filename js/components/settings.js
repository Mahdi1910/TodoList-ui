/**
 * Settings Component Manager
 * Handles preferences modal lifecycle and theme changes.
 */

window.SettingsComponent = {
  init() {
    this.openBtn = document.getElementById('btn-open-settings');
    this.mobileOpenBtn = document.getElementById('btn-mobile-open-settings');
    this.modal = document.getElementById('settings-modal');
    this.closeBtn = document.getElementById('btn-close-settings-modal');
    this.saveBtn = document.getElementById('btn-save-settings');
    this.themeToggle = document.getElementById('theme-toggle');
    this.bindEvents();
  },

  bindEvents() {
    this.openBtn?.addEventListener('click', event => this.openModal(event.currentTarget));
    this.mobileOpenBtn?.addEventListener('click', event => this.openModal(event.currentTarget));
    this.closeBtn?.addEventListener('click', () => this.closeModal());
    this.saveBtn?.addEventListener('click', () => this.closeModal());
    this.themeToggle?.addEventListener('change', event => {
      window.ThemeManager.setTheme(event.target.checked ? 'light' : 'dark');
    });
    this.modal?.addEventListener('click', event => {
      if (event.target === this.modal) this.closeModal();
    });
    this.modal?.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeModal();
      }
    });
  },

  openModal(trigger = null) {
    if (this.themeToggle) this.themeToggle.checked = window.AppState.theme === 'light';
    window.ModalFocusManager.open(this.modal, {
      trigger,
      initialFocus: this.themeToggle,
      fallbackFocus: trigger || this.openBtn || this.mobileOpenBtn
    });
  },

  closeModal() {
    window.ModalFocusManager.close(this.modal, {
      fallbackFocus: this.openBtn || this.mobileOpenBtn
    });
  }
};
