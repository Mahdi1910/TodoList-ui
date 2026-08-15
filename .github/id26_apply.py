from pathlib import Path
import subprocess
import tempfile


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    assert count == 1, f"{path}: expected one match, found {count}"
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "js/components/sidebar-taxonomy-core.js",
    """    const left = document.createElement('span');
    left.className = 'item-left';
    const icon = document.createElement('span');
""",
    """    const left = document.createElement('span');
    left.className = 'item-left taxonomy-select-control';
    left.dataset.taxonomySelect = entity.id;
    left.setAttribute('role', 'button');
    left.setAttribute('tabindex', '0');
    left.setAttribute('aria-label', `Select ${config.stem} ${entity.name}`);
    const icon = document.createElement('span');
""",
)

replace_once(
    "js/components/sidebar-taxonomy-core.js",
    """    list?.addEventListener('click', event => {
      const addChild = event.target.closest(`[data-${type}-add-child]`);
      const edit = event.target.closest(`[data-${type}-edit]`);
      const removeButton = event.target.closest(`[data-${type}-delete]`);
      const item = event.target.closest(`[data-${type}-id]`);
      if (addChild) {
        event.stopPropagation();
        host.closeSidebarActionMenus();
        openModal(host, config, null, addChild.dataset[`${type}AddChild`]);
      } else if (edit) {
        event.stopPropagation();
        host.closeSidebarActionMenus();
        openModal(host, config, edit.dataset[`${type}Edit`]);
      } else if (removeButton) {
        event.stopPropagation();
        host.closeSidebarActionMenus();
        remove(host, config, removeButton.dataset[`${type}Delete`]);
      } else if (item) {
        host.selectFilter(item);
      }
    });
""",
    """    list?.addEventListener('click', event => {
      const addChild = event.target.closest(`[data-${type}-add-child]`);
      const edit = event.target.closest(`[data-${type}-edit]`);
      const removeButton = event.target.closest(`[data-${type}-delete]`);
      const item = event.target.closest(`[data-${type}-id]`);
      if (addChild) {
        event.stopPropagation();
        host.closeSidebarActionMenus();
        openModal(host, config, null, addChild.dataset[`${type}AddChild`]);
      } else if (edit) {
        event.stopPropagation();
        host.closeSidebarActionMenus();
        openModal(host, config, edit.dataset[`${type}Edit`]);
      } else if (removeButton) {
        event.stopPropagation();
        host.closeSidebarActionMenus();
        remove(host, config, removeButton.dataset[`${type}Delete`]);
      } else if (item) {
        host.selectFilter(item);
      }
    });
    list?.addEventListener('keydown', event => {
      const control = event.target.closest('[data-taxonomy-select]');
      if (!control || !list.contains(control) || (event.key !== 'Enter' && event.key !== ' ')) return;
      const item = control.closest(`[data-${type}-id]`);
      if (!item) return;
      event.preventDefault();
      event.stopPropagation();
      host.selectFilter(item);
    });
""",
)

replace_once(
    "css/layout/sidebar-layout.css",
    """.item-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
""",
    """.item-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.taxonomy-select-control:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
""",
)

replace_once(
    "js/components/task-taxonomy-menu-order.js",
    """    TaxonomyOrder.flattenTree('project').forEach(({ item: project }) => {
      this.menuProject.appendChild(this.createProjectMenuItem(project));
    });
""",
    """    TaxonomyOrder.flattenTree('project').forEach(({ item: project, depth }) => {
      this.menuProject.appendChild(this.createProjectMenuItem(project, depth));
    });
""",
)

replace_once(
    "js/components/task-menus.js",
    """  createProjectMenuItem(project) {
    const item = document.createElement('div');
    const selected = project.id === this.selectedProject;
    item.className = `context-menu-item${selected ? ' selected' : ''}`;
    item.dataset.project = project.id;
""",
    """  createProjectMenuItem(project, depth = 0) {
    const item = document.createElement('div');
    const selected = project.id === this.selectedProject;
    item.className = `context-menu-item${selected ? ' selected' : ''}`;
    item.dataset.project = project.id;
    item.style.paddingLeft = `${12 + depth * 16}px`;
""",
)

replace_once(
    "js/repeat/repeat-engine.js",
    """  function parseDate(value) {
    if (!value || typeof value !== 'string') return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
""",
    """  function parseDate(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value);
    if (!match) return null;

    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const candidate = new Date(2000, 0, 1, 12, 0, 0, 0);
    candidate.setFullYear(y, m - 1, d);
    candidate.setHours(12, 0, 0, 0);

    if (
      candidate.getFullYear() !== y ||
      candidate.getMonth() !== m - 1 ||
      candidate.getDate() !== d
    ) return null;

    return candidate;
  }
""",
)

# Static source gates.
sidebar = Path("js/components/sidebar-taxonomy-core.js").read_text(encoding="utf-8")
drag = Path("js/components/sidebar-taxonomy-drag.js").read_text(encoding="utf-8")
menu_order = Path("js/components/task-taxonomy-menu-order.js").read_text(encoding="utf-8")
menus = Path("js/components/task-menus.js").read_text(encoding="utf-8")
repeat = Path("js/repeat/repeat-engine.js").read_text(encoding="utf-8")
css = Path("css/layout/sidebar-layout.css").read_text(encoding="utf-8")

assert "const item = document.createElement('div');" in sidebar
assert "left.setAttribute('role', 'button');" in sidebar
assert "left.setAttribute('tabindex', '0');" in sidebar
assert "left.dataset.taxonomySelect = entity.id;" in sidebar
assert "event.key !== 'Enter' && event.key !== ' '" in sidebar
assert "host.selectFilter(item);" in sidebar
assert "const more = document.createElement('button');" in sidebar
assert "target.closest('button,input,a,select,textarea" in drag
assert ".taxonomy-select-control:focus-visible" in css
assert "flattenTree('project').forEach(({ item: project, depth })" in menu_order
assert "createProjectMenuItem(project, depth)" in menu_order
assert "createProjectMenuItem(project, depth = 0)" in menus
assert "item.style.paddingLeft = `${12 + depth * 16}px`;" in menus
assert "inboxItem.textContent = 'Inbox';" in menu_order
assert "const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value);" in repeat
assert "candidate.getFullYear() !== y" in repeat
assert "candidate.getMonth() !== m - 1" in repeat
assert "candidate.getDate() !== d" in repeat
assert "function clampDayToMonth" in repeat

# Parse changed JavaScript as ES modules.
for file in [
    "js/components/sidebar-taxonomy-core.js",
    "js/components/task-taxonomy-menu-order.js",
    "js/components/task-menus.js",
    "js/repeat/repeat-engine.js",
]:
    with open(file, "rb") as source:
        subprocess.run(["node", "--input-type=module", "--check"], stdin=source, check=True)

# Focused RepeatEngine runtime date matrix.
repeat_source = Path("js/repeat/repeat-engine.js").read_text(encoding="utf-8")
with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False, encoding="utf-8") as module_file:
    module_file.write(repeat_source)
    module_path = module_file.name

test_source = f"""
import {{ RepeatEngine }} from 'file://{module_path}';
const valid = ['2026-01-01','2026-02-28','2024-02-29','2026-04-30','2026-12-31'];
const invalid = ['', 'abc', '2026-2-03', '2026-02-3', '2026-02-03-extra', '2026-00-10', '2026-13-01', '2026-01-00', '2026-01-32', '2026-02-29', '2026-02-30', '2026-02-31', '2026-04-31'];
for (const value of valid) if (!RepeatEngine.parseDate(value)) throw new Error(`Expected valid date: ${{value}}`);
for (const value of invalid) if (RepeatEngine.parseDate(value)) throw new Error(`Expected invalid date: ${{value}}`);
if (RepeatEngine.parseDate(null) !== null) throw new Error('null should be rejected');
const never = {{ type: 'never' }};
const daily = RepeatEngine.calculateNextOccurrence('2026-03-01', {{ mode: 'daily', end: never }});
const weekly = RepeatEngine.calculateNextOccurrence('2026-03-01', {{ mode: 'weekly', end: never }});
const monthly = RepeatEngine.calculateNextOccurrence('2026-01-31', {{ mode: 'monthly', end: never }});
if (daily !== '2026-03-02') throw new Error(`Daily regression: ${{daily}}`);
if (weekly !== '2026-03-08') throw new Error(`Weekly regression: ${{weekly}}`);
if (monthly !== '2026-02-28') throw new Error(`Month-end clamp regression: ${{monthly}}`);
const invalidEnd = RepeatEngine.validateRepeatRule({{ mode: 'daily', end: {{ type: 'date', date: '2026-02-31' }} }});
if (invalidEnd.valid) throw new Error('Impossible Repeat End date should be rejected');
console.log('ID26_REPEAT_DATE_MATRIX_OK');
"""
subprocess.run(["node", "--input-type=module", "-e", test_source], check=True)
print("ID26_STATIC_AND_REPEAT_CHECKS_OK")
