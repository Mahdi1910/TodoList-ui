window.QuickInputViewportMethods = {
  initKeyboardAdjustment() {
    this.quickViewportFrame = null;
    const queueSync = () => this.queueQuickInputViewportSync();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', queueSync);
      window.visualViewport.addEventListener('scroll', queueSync);
    }
    window.addEventListener('resize', queueSync);
  },

  queueQuickInputViewportSync() {
    if (this.quickViewportFrame != null) {
      cancelAnimationFrame(this.quickViewportFrame);
    }
    this.quickViewportFrame = requestAnimationFrame(() => {
      this.quickViewportFrame = null;
      this.syncQuickInputViewport();
    });
  },

  syncQuickInputViewport() {
    if (!this.addTaskModal?.classList.contains('active')) return;

    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const left = viewport?.offsetLeft ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const style = this.addTaskModal.style;

    style.setProperty('--quick-vv-top', `${Math.max(0, top)}px`);
    style.setProperty('--quick-vv-left', `${Math.max(0, left)}px`);
    style.setProperty('--quick-vv-width', `${Math.max(1, width)}px`);
    style.setProperty('--quick-vv-height', `${Math.max(1, height)}px`);
  },

  resetQuickInputViewport() {
    if (this.quickViewportFrame != null) {
      cancelAnimationFrame(this.quickViewportFrame);
      this.quickViewportFrame = null;
    }
    if (!this.addTaskModal) return;

    const style = this.addTaskModal.style;
    ['--quick-vv-top', '--quick-vv-left', '--quick-vv-width', '--quick-vv-height']
      .forEach(property => style.removeProperty(property));
  }
};
