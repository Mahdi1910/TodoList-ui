/**
 * Main Application Bootstrapper
 * Loads durable storage, hydrates AppState, then initializes UI modules.
 */

const BOOTSTRAP_SCRIPTS = [
  'js/components/task-drag-hierarchy.js',
  'js/storage/db-schema.js',
  'js/storage/db.js',
  'js/storage/repositories.js',
  'js/storage/mappers.js',
  'js/storage/persistence.js',
  'js/storage/data-service.js',
  'js/storage/data-service-taxonomy.js',
  'js/storage/data-service-drag.js',
  'js/storage/data-service-hierarchy.js',
  'js/storage/ui-persistence-bindings.js'
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-dynamic-src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.dataset.dynamicSrc = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

function showBootstrapError(error) {
  console.error('Todo List startup failed.', error);
  const banner = document.createElement('div');
  banner.textContent = 'Local storage could not be opened. Your existing browser database was not cleared.';
  Object.assign(banner.style, {
    position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)', zIndex: '9999',
    maxWidth: 'min(560px, calc(100vw - 24px))', padding: '10px 14px', borderRadius: '10px',
    background: '#171717', color: '#fff', border: '1px solid #444', boxShadow: '0 8px 30px rgba(0,0,0,.35)',
    fontSize: '13px'
  });
  document.body.appendChild(banner);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Theme remains on its existing localStorage strategy; domain data is IndexedDB-backed.
  window.ThemeManager.init();

  try {
    for (const src of BOOTSTRAP_SCRIPTS) await loadScript(src);
    await window.AppPersistence.initialize();
    await window.AppPersistence.hydrateState();
    window.bindPersistentUiMutations();
  } catch (error) {
    if (window.AppPersistence?.reportError) {
      window.AppPersistence.reportError('Local storage could not be opened. Existing data was not cleared.', error);
    } else {
      showBootstrapError(error);
    }
    return;
  }

  window.SidebarComponent.init();
  window.WorkspaceControls.init();
  window.TasksComponent.init();
  window.ScheduleComponent.init();
  window.SubtaskEditorComponent.init();
  window.SettingsComponent.init();

  console.log('✅ Apple Minimalist To-Do List Application Initialized with IndexedDB persistence.');
});
