window.SidebarTagMethods = {
  renderTags() { return window.SidebarTaxonomyUiCore.render(this, 'tag'); },
  createTagTreeNode(tag, depth = 0) { return window.SidebarTaxonomyUiCore.createNode(this, 'tag', tag, depth); },
  openTagModal(tagId = null, parentId = null, trigger = null) { return window.SidebarTaxonomyUiCore.open(this, 'tag', tagId, parentId, trigger); },
  selectTagIcon(icon) { return window.SidebarTaxonomyUiCore.selectIcon(this, 'tag', icon); },
  saveTag() { return window.SidebarTaxonomyUiCore.save(this, 'tag'); },
  deleteTag(tagId) { return window.SidebarTaxonomyUiCore.remove(this, 'tag', tagId); },
  closeTagModal() { return window.SidebarTaxonomyUiCore.close(this, 'tag'); }
};
