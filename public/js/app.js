/**
 * BidWriter - Main Application Logic
 * Handles routing, template loading, theme management, and shared utilities.
 */

// ═══════════════════════════════════════════════════════════
// Global State & Cache
// ═══════════════════════════════════════════════════════════

const App = {
  templates: {},
  funders: [],
  currentRoute: '',
  
  // Cached funder data (full details)
  funderCache: {},
};

// ═══════════════════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════════════════

const routes = {
  '/': 'dashboard',
  '/new-proposal': 'new-proposal',
  '/edit-proposal': 'new-proposal',   // reuses same template
  '/polish': 'polish',
  '/impact': 'impact',
  '/gantt': 'gantt',
  '/budget': 'budget',
  '/literature': 'literature',
  '/compliance': 'compliance'
};

async function navigate(hash) {
  const path = hash.replace('#', '') || '/';
  const templateName = routes[path.split('?')[0]];
  
  if (!templateName) {
    document.getElementById('app').innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>Page Not Found</h3><p>The page you\'re looking for doesn\'t exist.</p><a href="#/" class="btn btn-primary">Back to Dashboard</a></div>';
    return;
  }

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.route === templateName);
  });

  // Load template
  const html = await loadTemplate(templateName);
  document.getElementById('app').innerHTML = html;
  App.currentRoute = templateName;

  // Initialize the page module
  const initFn = window[`init${capitalize(templateName.replace(/-([a-z])/g, (_, c) => c.toUpperCase()))}Page`];
  if (typeof initFn === 'function') {
    await initFn(getQueryParams(hash));
  }
}

async function loadTemplate(name) {
  if (App.templates[name]) return App.templates[name];
  try {
    const res = await fetch(`/templates/${name}.html`);
    if (!res.ok) throw new Error(`Template ${name} not found`);
    const html = await res.text();
    App.templates[name] = html;
    return html;
  } catch (e) {
    return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error Loading Page</h3><p>${e.message}</p></div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// Theme Management
// ═══════════════════════════════════════════════════════════

function initTheme() {
  const saved = localStorage.getItem('bw-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeButton(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('bw-theme', next);
  updateThemeButton(next);
}

function updateThemeButton(theme) {
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.querySelector('.theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
    const label = btn.querySelector('.nav-label');
    if (label) label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  }
}

// ═══════════════════════════════════════════════════════════
// Sidebar
// ═══════════════════════════════════════════════════════════

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const collapsed = localStorage.getItem('bw-sidebar-collapsed') === 'true';
  if (collapsed) sidebar.classList.add('collapsed');

  document.getElementById('sidebarToggle').addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('bw-sidebar-collapsed', sidebar.classList.contains('collapsed'));
  });
}

// ═══════════════════════════════════════════════════════════
// Toast Notifications
// ═══════════════════════════════════════════════════════════

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ═══════════════════════════════════════════════════════════
// API Helpers
// ═══════════════════════════════════════════════════════════

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

/**
 * Stream an AI generation endpoint (SSE)
 * @param {string} path - API path (e.g. '/generate/proposal')
 * @param {Object} body - Request body
 * @param {function} onChunk - Called with each text chunk
 * @param {function} onDone - Called when complete
 * @param {function} onError - Called on error
 */
async function streamAI(path, body, onChunk, onDone, onError) {
  try {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Generation failed' }));
      throw new Error(err.error || 'Generation failed');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'chunk') onChunk(data.content);
            else if (data.type === 'done') { if (onDone) onDone(); return; }
            else if (data.type === 'error') throw new Error(data.message);
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }
    }
    if (onDone) onDone();
  } catch (e) {
    if (onError) onError(e);
    else showToast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// Funder Helpers
// ═══════════════════════════════════════════════════════════

async function loadFunders() {
  if (App.funders.length) return App.funders;
  try {
    App.funders = await api('/funders');
    return App.funders;
  } catch (e) {
    showToast('Failed to load funders', 'error');
    return [];
  }
}

async function loadFunderDetails(id) {
  if (App.funderCache[id]) return App.funderCache[id];
  try {
    const data = await api(`/funders/${id}`);
    App.funderCache[id] = data;
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Populate a funder dropdown select element
 */
async function populateFunderDropdown(selectEl, includeEmpty = true) {
  const funders = await loadFunders();
  selectEl.innerHTML = includeEmpty ? '<option value="">Select a funder...</option>' : '';
  
  // Group by parent
  const groups = {};
  const standalone = [];
  for (const f of funders) {
    if (f.parent) {
      if (!groups[f.parent]) groups[f.parent] = [];
      groups[f.parent].push(f);
    } else {
      standalone.push(f);
    }
  }

  for (const [parent, children] of Object.entries(groups)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = parent;
    for (const f of children) {
      optgroup.appendChild(new Option(`${f.name} — ${f.fullName}`, f.id));
    }
    selectEl.appendChild(optgroup);
  }

  for (const f of standalone) {
    selectEl.appendChild(new Option(f.fullName, f.id));
  }
}

/**
 * Populate a scheme dropdown based on selected funder
 */
async function populateSchemeDropdown(schemeSelect, funderId) {
  schemeSelect.innerHTML = '<option value="">Select a scheme...</option>';
  if (!funderId) return;
  
  const funder = await loadFunderDetails(funderId);
  if (!funder || !funder.schemes) return;

  funder.schemes.forEach((scheme, idx) => {
    const label = scheme.maxAmount 
      ? `${scheme.name} (up to £${scheme.maxAmount.toLocaleString()})`
      : scheme.name;
    schemeSelect.appendChild(new Option(label, idx));
  });
}

// ═══════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getQueryParams(hash) {
  const parts = hash.split('?');
  if (parts.length < 2) return {};
  const params = {};
  new URLSearchParams(parts[1]).forEach((v, k) => { params[k] = v; });
  return params;
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function formatCurrency(amount) {
  return '£' + Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Convert markdown text to basic HTML
 */
function markdownToHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

/**
 * Create a dynamic add/remove list UI
 */
function createDynamicList(containerId, placeholder = 'Enter item...', initialItems = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  function render() {
    const items = getListItems();
    // Don't re-render, just ensure state
  }

  function addItem(value = '') {
    const item = document.createElement('div');
    item.className = 'dynamic-list-item';
    item.innerHTML = `
      <input type="text" class="form-input" placeholder="${placeholder}" value="${value.replace(/"/g, '&quot;')}">
      <button class="btn-remove" title="Remove">×</button>
    `;
    item.querySelector('.btn-remove').addEventListener('click', () => {
      item.remove();
    });
    // Insert before the add button
    const addBtn = container.querySelector('.btn-add-item');
    container.insertBefore(item, addBtn);
    return item.querySelector('input');
  }

  function getListItems() {
    return Array.from(container.querySelectorAll('.dynamic-list-item input'))
      .map(input => input.value.trim())
      .filter(v => v.length > 0);
  }

  // Clear existing items
  container.querySelectorAll('.dynamic-list-item').forEach(el => el.remove());

  // Add initial items
  if (initialItems.length === 0) {
    addItem();
  } else {
    initialItems.forEach(val => addItem(val));
  }

  // Setup add button
  let addBtn = container.querySelector('.btn-add-item');
  if (!addBtn) {
    addBtn = document.createElement('button');
    addBtn.className = 'btn-add-item';
    addBtn.innerHTML = '+ Add Item';
    container.appendChild(addBtn);
  }
  addBtn.addEventListener('click', () => {
    const input = addItem();
    input.focus();
  });

  return { addItem, getListItems };
}

// ═══════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebar();

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Hash-based routing
  window.addEventListener('hashchange', () => navigate(location.hash));
  navigate(location.hash || '#/');

  // Preload funders
  loadFunders();
});
