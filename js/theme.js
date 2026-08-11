/**
 * Theme Manager: Dark Mode & Light Mode Switcher
 */

window.ThemeManager = {
  init() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    this.setTheme(savedTheme);
  },

  setTheme(themeName) {
    window.AppState.theme = themeName;
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('theme', themeName);

    // Update settings modal toggle state
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.checked = themeName === 'light';
    }
  },

  toggleTheme() {
    const nextTheme = window.AppState.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }
};
