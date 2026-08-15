/**
 * Settings Component Manager
 * Handles preferences, theme changes, and backup/restore interaction.
 */

window.SettingsComponent = {
  init() {
    this.openBtn = document.getElementById('btn-open-settings');
    this.mobileOpenBtn = document.getElementById('btn-mobile-open-settings');
    this.modal = document.getElementById('settings-modal');
    this.closeBtn = document.getElementById('btn-close-settings-modal');
    this.saveBtn = document.getElementById('btn-save-settings');
    this.themeToggle = document.getElementById('theme-toggle');
    this.pendingRestoreSnapshot = null;
    this.backupBusy = false;
    this.restoreBusy = false;
    this.bindBackupUi();
    this.bindEvents();
  },

  bindBackupUi() {
    this.createBackupBtn = document.getElementById('btn-create-backup');
    this.restoreBackupBtn = document.getElementById('btn-restore-backup');
    this.restoreInput = document.getElementById('restore-backup-input');
    this.backupStatus = document.getElementById('backup-restore-status');
    this.restoreSummary = document.getElementById('restore-backup-summary');
    this.restoreDetails = document.getElementById('restore-backup-details');
    this.cancelRestoreBtn = document.getElementById('btn-cancel-restore');
    this.confirmRestoreBtn = document.getElementById('btn-confirm-restore');
  },

  bindEvents() {
    this.openBtn?.addEventListener('click', event => this.openModal(event.currentTarget));
    this.mobileOpenBtn?.addEventListener('click', event => this.openModal(event.currentTarget));
    this.closeBtn?.addEventListener('click', () => this.closeModal());
    this.saveBtn?.addEventListener('click', () => this.closeModal());
    this.themeToggle?.addEventListener('change', event => {
      window.ThemeManager.setTheme(event.target.checked ? 'light' : 'dark');
    });
    this.createBackupBtn?.addEventListener('click', () => this.createBackup());
    this.restoreBackupBtn?.addEventListener('click', () => this.chooseRestoreFile());
    this.restoreInput?.addEventListener('change', event => this.readRestoreFile(event.target.files?.[0]));
    this.cancelRestoreBtn?.addEventListener('click', () => this.cancelRestore());
    this.confirmRestoreBtn?.addEventListener('click', () => this.confirmRestore());
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

  loadBackupScript(src) {
    const existing = document.querySelector(`script[data-backup-src="${src}"]`);
    if (existing?.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = existing || document.createElement('script');
      const cleanup = () => {
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
      };
      const onLoad = () => { script.dataset.loaded = 'true'; cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error(`Could not load ${src}`)); };
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      if (!existing) {
        script.src = src;
        script.dataset.backupSrc = src;
        document.head.appendChild(script);
      }
    });
  },

  ensureBackupServices() {
    if (window.AppBackupService && window.AppBackupValidation && typeof window.AppDataService?.whenIdle === 'function') {
      return Promise.resolve();
    }
    if (!this.backupServicesPromise) {
      this.backupServicesPromise = (async () => {
        const scripts = [
          'js/storage/backup-validation.js',
          'js/storage/backup-service.js'
        ];
        for (const src of scripts) await this.loadBackupScript(src);
        if (!window.AppBackupService || !window.AppBackupValidation || typeof window.AppDataService?.whenIdle !== 'function') {
          throw new Error('Backup services could not be initialized.');
        }
      })().catch(error => {
        this.backupServicesPromise = null;
        throw error;
      });
    }
    return this.backupServicesPromise;
  },

  setBackupStatus(message = '', state = '') {
    if (!this.backupStatus) return;
    this.backupStatus.textContent = message;
    this.backupStatus.dataset.state = state;
  },

  setDataBusy(busy) {
    if (this.createBackupBtn) this.createBackupBtn.disabled = busy;
    if (this.restoreBackupBtn) this.restoreBackupBtn.disabled = busy;
    if (this.confirmRestoreBtn) this.confirmRestoreBtn.disabled = busy;
    if (this.cancelRestoreBtn) this.cancelRestoreBtn.disabled = busy;
    if (this.themeToggle) this.themeToggle.disabled = busy;
  },

  async createBackup() {
    if (this.backupBusy || this.restoreBusy) return;
    this.backupBusy = true;
    this.setDataBusy(true);
    this.setBackupStatus('Creating backup…');
    try {
      await this.ensureBackupServices();
      await window.AppBackupService.downloadBackup();
      this.setBackupStatus('Backup downloaded.', 'success');
    } catch (error) {
      this.setBackupStatus(error?.message || 'Could not create the backup.', 'error');
    } finally {
      this.backupBusy = false;
      this.setDataBusy(false);
    }
  },

  chooseRestoreFile() {
    if (this.backupBusy || this.restoreBusy) return;
    this.resetRestoreState(false);
    if (this.restoreInput) {
      this.restoreInput.value = '';
      this.restoreInput.click();
    }
  },

  async readRestoreFile(file) {
    if (!file || this.restoreBusy) return;
    this.setDataBusy(true);
    this.setBackupStatus('Checking backup…');
    try {
      await this.ensureBackupServices();
      const snapshot = await window.AppBackupService.parseBackupFile(file);
      const summary = window.AppBackupService.getRestoreSummary(snapshot);
      this.pendingRestoreSnapshot = snapshot;
      const created = new Date(summary.createdAt).toLocaleString();
      this.restoreDetails.textContent = `${created} · ${summary.tasks} tasks · ${summary.projects} projects · ${summary.tags} tags`;
      this.restoreSummary.hidden = false;
      this.setBackupStatus('Backup file is valid and ready to restore.', 'success');
      this.confirmRestoreBtn?.focus();
    } catch (error) {
      this.resetRestoreState(false);
      this.setBackupStatus(error?.message || 'This backup file could not be validated.', 'error');
    } finally {
      this.setDataBusy(false);
    }
  },

  resetRestoreState(clearStatus = true) {
    this.pendingRestoreSnapshot = null;
    if (this.restoreSummary) this.restoreSummary.hidden = true;
    if (this.restoreDetails) this.restoreDetails.textContent = '';
    if (this.restoreInput) this.restoreInput.value = '';
    if (clearStatus) this.setBackupStatus('');
  },

  cancelRestore() {
    if (this.restoreBusy) return;
    this.resetRestoreState(false);
    this.setBackupStatus('Restore canceled.');
    this.restoreBackupBtn?.focus();
  },

  async confirmRestore() {
    if (!this.pendingRestoreSnapshot || this.restoreBusy || this.backupBusy) return;
    this.restoreBusy = true;
    this.setDataBusy(true);
    this.setBackupStatus('Restoring backup…');
    try {
      await this.ensureBackupServices();
      await window.AppBackupService.restoreBackup(this.pendingRestoreSnapshot);
    } catch (error) {
      this.restoreBusy = false;
      this.setDataBusy(false);
      this.setBackupStatus(error?.message || 'Restore failed. Your existing data was not replaced.', 'error');
    }
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
    if (this.restoreBusy) return;
    this.resetRestoreState(true);
    window.ModalFocusManager.close(this.modal, {
      fallbackFocus: this.openBtn || this.mobileOpenBtn
    });
  }
};
