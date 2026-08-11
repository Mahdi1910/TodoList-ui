/**
 * Main Application Bootstrapper
 * Initializes all sub-components and modules when DOM is ready.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Theme
  window.ThemeManager.init();

  // Initialize Sidebar (Global rail & secondary collapsible sidebar)
  window.SidebarComponent.init();

  // Initialize workspace sorting / view controls
  window.WorkspaceControls.init();

  // Initialize Tasks (active & completed task containers & modals)
  window.TasksComponent.init();

  // Initialize Schedule Date Picker Component
  window.ScheduleComponent.init();

  // Initialize stacked subtask editor
  window.SubtaskEditorComponent.init();

  // Initialize Settings
  window.SettingsComponent.init();

  console.log('✅ Apple Minimalist To-Do List Application Initialized.');
});
