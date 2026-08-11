/**
 * Settings Component Manager
 * Handles preferences modal lifecycle and theme changes.
 */

window.SettingsComponent = {
  lastFocusedElement: null,

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
    this.openBtn?.addEventListener('click', () => this.openModal());
    this.mobileOpenBtn?.addEventListener('click', () => this.openModal());
    this.closeBtn?.addEventListener('click', () => this.closeModal());
    this.saveBtn?.addEventListener('click', () => this.closeModal());
    this.themeToggle?.addEventListener('change', e => {
      window.ThemeManager.setTheme(e.target.checked ? 'light' : 'dark');
    });
    this.modal?.addEventListener('click', e => {
      if (e.target === this.modal) this.closeModal();
    });
    this.modal?.addEventListener('keydown', e => this.handleKeydown(e));
  },

  openModal() {
    this.lastFocusedElement = document.activeElement;
    if (this.themeToggle) this.themeToggle.checked = window.AppState.theme === 'light';
    this.modal?.classList.add('active');
    this.modal?.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => this.themeToggle?.focus());
  },

  closeModal() {
    this.modal?.classList.remove('active');
    this.modal?.setAttribute('aria-hidden', 'true');
    if (this.lastFocusedElement?.isConnected) this.lastFocusedElement.focus();
    this.lastFocusedElement = null;
  },

  handleKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.closeModal();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...this.modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
};
