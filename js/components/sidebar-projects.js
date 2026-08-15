window.SidebarProjectConfig = Object.freeze({
  entityType: 'project',
  stem: 'Project',
  pluralStem: 'Projects',
  childLabel: 'Sub-project',
  topLevelLabel: 'No parent (top-level project)',
  deletePrompt: name => `Delete project "${name}"? Its direct sub-projects will become top-level.`
});

window.SidebarProjectMethods = window.SidebarTaxonomyCore.createMethods(window.SidebarProjectConfig);
