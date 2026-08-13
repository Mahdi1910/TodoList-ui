window.SidebarProjectMethods = {
  renderProjects() { return window.SidebarTaxonomyUiCore.render(this, 'project'); },
  createProjectTreeNode(project, depth = 0) { return window.SidebarTaxonomyUiCore.createNode(this, 'project', project, depth); },
  openProjectModal(projectId = null, parentId = null, trigger = null) { return window.SidebarTaxonomyUiCore.open(this, 'project', projectId, parentId, trigger); },
  selectProjectIcon(icon) { return window.SidebarTaxonomyUiCore.selectIcon(this, 'project', icon); },
  saveProject() { return window.SidebarTaxonomyUiCore.save(this, 'project'); },
  deleteProject(projectId) { return window.SidebarTaxonomyUiCore.remove(this, 'project', projectId); },
  closeProjectModal() { return window.SidebarTaxonomyUiCore.close(this, 'project'); }
};
