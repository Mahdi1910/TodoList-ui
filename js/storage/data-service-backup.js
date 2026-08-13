Object.assign(window.AppDataService, {
  whenIdle() {
    return this.enqueue(async () => undefined);
  }
});
