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
    this.ensureBackupUi();
    this.bindEvents();
  },

  ensureBackupUi() {
    if (!this.modal || document.getElementById('settings-data-section')) return;
    const footer = this.modal.querySelector('.modal-footer');
    const section = document.createElement('section');
    section.id = 'settings-data-section';
    section.className = 'settings-section settings-data-section';
    section.setAttribute('aria-labelledby', 'settings-data-title');
    section.innerHTML = `
      <div class="settings-section-copy">
        <span class="settings-section-title" id="settings-data-title">Data</span>
        <span class="settings-data-note">Backup all saved tasks, projects, tags, reminders, repeat data and preferences.</span>
      </div>
      <div class="settings-data-actions">
        <button type="button" class="btn-secondary" id="btn-create-backup">Create Backup</button>
        <button type="button" class="btn-secondary" id="btn-restore-backup">Restore Backup</button>
        <input class="sr-only" type="file" id="restore-backup-input" accept="application/json,.json" tabindex="-1">
      </div>
      <p class="backup-restore-status" id="backup-restore-status" role="status" aria-live="polite"></p>
      <div class="restore-summary" id="restore-backup-summary" hidden tabindex="-1">
        <strong>Backup ready to restore</strong>
        <span id="restore-backup-details"></span>
        <span class="restore-warning">This replaces all current local TodoList data.</span>
        <div class="restore-confirm-actions">
          <button type="button" class="btn-secondary" id="btn-cancel-restore">Cancel</button>
          <button type="button" class="btn-danger" id="btn-confirm-restore">Restore and Replace</button>
        </div>
      </div>`;
    footer?.before(section);

    this.createBackupBtn = section.querySelector('#btn-create-backup');
    this.restoreBackupBtn = section.querySelector('#btn-restore-backup');
    this.restoreInput = section.querySelector('#restore-backup-input');
    this.backupStatus = section.querySelector('#backup-restore-status');
    this.restoreSummary = section.querySelector('#restore-backup-summary');
    this.restoreDetails = section.querySelector('#restore-backup-details');
    this.cancelRestoreBtn = section.querySelector('#btn-cancel-restore');
    this.confirmRestoreBtn = section.querySelector('#btn-confirm-restore');
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
          'js/storage/data-service-backup.js',
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
    this.createBackupBtn.disabled = busy;
    this.restoreBackupBtn.disabled = busy;
    this.confirmRestoreBtn.disabled = busy;
    this.cancelRestoreBtn.disabled = busy;
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
