window.SidebarTagConfig = Object.freeze({
  entityType: 'tag',
  stem: 'Tag',
  pluralStem: 'Tags',
  childLabel: 'Sub-tag',
  topLevelLabel: 'No parent (top-level tag)',
  deletePrompt: name => `Delete tag "${name}"? Child tags will become top-level tags.`
});

window.SidebarTagMethods = window.SidebarTaxonomyCore.createMethods(window.SidebarTagConfig);
