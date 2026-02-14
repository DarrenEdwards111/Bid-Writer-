/**
 * Mikoshi BidWriter — Main SPA Application
 * Single-file application managing all routes, state, and UI
 */

// ─── State ──────────────────────────────────────────────────

const state = {
  proposals: [],
  funders: [],
  currentProposal: null,
  currentFunder: null,
  selectedPapers: [],
  autoSaveTimer: null,
  unsavedChanges: false
};

// ─── Settings (localStorage) ────────────────────────────────

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem('bidwriter-settings') || '{}');
  } catch { return {}; }
}

function saveSettings(s) {
  localStorage.setItem('bidwriter-settings', JSON.stringify(s));
  updateProviderDisplay();
}

function getProvider() {
  const s = getSettings();
  return s.provider || 'mikoshi';
}

function getApiKey() {
  const s = getSettings();
  const p = getProvider();
  if (p === 'claude') return s.claudeKey || '';
  if (p === 'openai') return s.openaiKey || '';
  return '';
}

function aiHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-ai-provider': getProvider(),
    'x-ai-key': getApiKey()
  };
}

function updateProviderDisplay() {
  const el = document.getElementById('sidebarProvider');
  if (!el) return;
  const p = getProvider();
  const names = { mikoshi: 'Mikoshi AI', claude: 'Claude', openai: 'OpenAI' };
  el.querySelector('.provider-name').textContent = names[p] || 'Mikoshi AI';
  el.querySelector('.provider-dot').style.background =
    p === 'mikoshi' ? 'var(--green)' : p === 'claude' ? 'var(--purple)' : 'var(--blue)';
}

// ─── Toast ──────────────────────────────────────────────────

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
  el.innerHTML = `<span>${icons[type] || ''}</span> ${escapeHtml(message)}`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
}

// ─── Router ─────────────────────────────────────────────────

function route() {
  const hash = location.hash.slice(1) || '/';
  const app = document.getElementById('app');

  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const parts = hash.split('/').filter(Boolean);

  if (hash === '/' || hash === '') {
    document.querySelector('[data-route="dashboard"]')?.classList.add('active');
    renderDashboard(app);
  } else if (hash === '/templates') {
    document.querySelector('[data-route="templates"]')?.classList.add('active');
    renderTemplates(app);
  } else if (hash === '/settings') {
    document.querySelector('[data-route="settings"]')?.classList.add('active');
    renderSettings(app);
  } else if (parts[0] === 'proposal' && parts[1]) {
    loadAndRenderEditor(app, parts[1]);
  } else if (parts[0] === 'new') {
    createNewProposal(app);
  } else if (hash === '/ai/reviewer') {
    document.querySelector('[data-route="ai-reviewer"]')?.classList.add('active');
    renderAITool(app, 'reviewer');
  } else if (hash === '/ai/gaps') {
    document.querySelector('[data-route="ai-gaps"]')?.classList.add('active');
    renderAITool(app, 'gaps');
  } else if (hash === '/ai/response') {
    document.querySelector('[data-route="ai-response"]')?.classList.add('active');
    renderAITool(app, 'response');
  } else {
    app.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><h3>Page not found</h3></div>';
  }
}

window.addEventListener('hashchange', route);

// ─── Init ───────────────────────────────────────────────────

async function init() {
  updateProviderDisplay();
  // Load funders
  try {
    const resp = await fetch('/api/funders');
    state.funders = await resp.json();
  } catch (e) { console.error('Failed to load funders:', e); }

  // Sidebar toggle
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (state.currentProposal) saveProposal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      if (state.currentProposal) exportProposal();
    }
  });

  route();
}

document.addEventListener('DOMContentLoaded', init);

// ─── Dashboard ──────────────────────────────────────────────

async function renderDashboard(app) {
  try {
    const resp = await fetch('/api/proposals');
    state.proposals = await resp.json();
  } catch { state.proposals = []; }

  app.innerHTML = `
    <div class="page-header">
      <h1>📊 <span class="accent">Dashboard</span></h1>
      <div style="display:flex;gap:8px">
        <label class="btn btn-sm" style="cursor:pointer">
          📥 Import JSON
          <input type="file" accept=".json" style="display:none" onchange="importProposal(this)">
        </label>
        <a href="#/new" class="btn btn-primary">+ New Proposal</a>
      </div>
    </div>
    <div class="filter-bar">
      <input type="text" class="search-input" placeholder="Search proposals..." oninput="filterProposals(this.value)">
      <select class="filter-select" onchange="filterByStatus(this.value)">
        <option value="">All Status</option>
        <option value="draft">Draft</option>
        <option value="in-progress">In Progress</option>
        <option value="complete">Complete</option>
        <option value="submitted">Submitted</option>
      </select>
    </div>
    <div class="proposals-grid" id="proposalsGrid">
      ${state.proposals.length === 0 ? `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="icon">📝</div>
          <h3>No proposals yet</h3>
          <p>Create your first grant proposal and start writing with AI assistance.</p>
          <a href="#/new" class="btn btn-primary">+ Create Proposal</a>
        </div>
      ` : state.proposals.map(p => proposalCard(p)).join('')}
    </div>
  `;
}

function proposalCard(p) {
  const statusMap = {
    'draft': 'badge-draft', 'in-progress': 'badge-progress',
    'complete': 'badge-complete', 'submitted': 'badge-submitted'
  };
  const badgeClass = statusMap[p.status] || 'badge-draft';
  const statusLabel = (p.status || 'draft').replace('-', ' ');
  const date = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  return `
    <div class="proposal-card" onclick="location.hash='#/proposal/${p.id}'">
      <div class="proposal-actions">
        <button class="btn btn-xs" onclick="event.stopPropagation();duplicateProposal('${p.id}')" title="Duplicate">📋</button>
        <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteProposal('${p.id}')" title="Delete">🗑</button>
      </div>
      <div class="proposal-title">${escapeHtml(p.title || 'Untitled')}</div>
      <div class="proposal-meta">
        ${p.funder ? `<span>📋 ${escapeHtml(p.funder)}</span>` : ''}
        <span>📅 ${date}</span>
        ${p.amount ? `<span>💰 £${Number(p.amount).toLocaleString()}</span>` : ''}
      </div>
      <span class="badge ${badgeClass}">${statusLabel}</span>
    </div>
  `;
}

window.filterProposals = function(query) {
  const grid = document.getElementById('proposalsGrid');
  const q = query.toLowerCase();
  const filtered = state.proposals.filter(p =>
    (p.title || '').toLowerCase().includes(q) || (p.funder || '').toLowerCase().includes(q)
  );
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>No matching proposals</p></div>';
  } else {
    grid.innerHTML = filtered.map(p => proposalCard(p)).join('');
  }
};

window.filterByStatus = function(status) {
  const grid = document.getElementById('proposalsGrid');
  const filtered = status ? state.proposals.filter(p => p.status === status) : state.proposals;
  grid.innerHTML = filtered.length === 0
    ? '<div class="empty-state" style="grid-column:1/-1"><p>No proposals with this status</p></div>'
    : filtered.map(p => proposalCard(p)).join('');
};

window.duplicateProposal = async function(id) {
  try {
    const resp = await fetch(`/api/proposals/${id}/duplicate`, { method: 'POST' });
    const dup = await resp.json();
    toast('Proposal duplicated', 'success');
    route();
  } catch (e) { toast('Failed to duplicate', 'error'); }
};

window.deleteProposal = async function(id) {
  if (!confirm('Delete this proposal? This cannot be undone.')) return;
  try {
    await fetch(`/api/proposals/${id}`, { method: 'DELETE' });
    toast('Proposal deleted', 'success');
    route();
  } catch (e) { toast('Failed to delete', 'error'); }
};

window.importProposal = async function(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const resp = await fetch('/api/proposals/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const imported = await resp.json();
    toast('Proposal imported', 'success');
    location.hash = `#/proposal/${imported.id}`;
  } catch (e) { toast('Invalid JSON file', 'error'); }
};

// ─── Create New Proposal ────────────────────────────────────

async function createNewProposal(app) {
  app.innerHTML = `
    <div class="page-header">
      <h1>📝 New Proposal</h1>
    </div>
    <div class="card" style="max-width:700px">
      <div class="form-group">
        <label class="form-label">Project Title</label>
        <input class="form-input" id="newTitle" placeholder="Enter your project title">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Funder</label>
          <select class="form-select" id="newFunder" onchange="updateSchemes()">
            <option value="">Select a funder</option>
            ${state.funders.map(f => `<option value="${f.id}">${escapeHtml(f.name)} — ${escapeHtml(f.fullName)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Scheme</label>
          <select class="form-select" id="newScheme"><option value="">Select funder first</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Requested Amount (£)</label>
          <input class="form-input" id="newAmount" type="number" placeholder="e.g. 500000">
        </div>
        <div class="form-group">
          <label class="form-label">Duration (months)</label>
          <input class="form-input" id="newDuration" type="number" placeholder="e.g. 36">
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:24px">
        <a href="#/" class="btn">Cancel</a>
        <button class="btn btn-primary" onclick="doCreateProposal()">Create Proposal</button>
      </div>
    </div>
  `;
}

window.updateSchemes = async function() {
  const funderId = document.getElementById('newFunder').value;
  const schemeSelect = document.getElementById('newScheme');
  if (!funderId) {
    schemeSelect.innerHTML = '<option value="">Select funder first</option>';
    return;
  }
  try {
    const resp = await fetch(`/api/funders/${funderId}`);
    const funder = await resp.json();
    schemeSelect.innerHTML = (funder.schemes || []).map((s, i) =>
      `<option value="${i}">${escapeHtml(s.name)}</option>`
    ).join('');
  } catch (e) { schemeSelect.innerHTML = '<option value="">Error loading schemes</option>'; }
};

window.doCreateProposal = async function() {
  const title = document.getElementById('newTitle').value.trim() || 'Untitled Proposal';
  const funderId = document.getElementById('newFunder').value;
  const scheme = document.getElementById('newScheme').selectedOptions[0]?.textContent || '';
  const amount = document.getElementById('newAmount').value;
  const duration = document.getElementById('newDuration').value;

  try {
    const resp = await fetch('/api/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, funder: funderId, funderName: state.funders.find(f => f.id === funderId)?.name || '',
        scheme, amount: Number(amount) || 0, duration: Number(duration) || 0,
        status: 'draft', sections: {}, overview: {}, budget: null, gantt: { workPackages: [] },
        notes: {}, literature: { papers: [], review: '' }
      })
    });
    const proposal = await resp.json();
    toast('Proposal created', 'success');
    location.hash = `#/proposal/${proposal.id}`;
  } catch (e) { toast('Failed to create proposal', 'error'); }
};

// ─── Proposal Editor ────────────────────────────────────────

async function loadAndRenderEditor(app, id) {
  try {
    const resp = await fetch(`/api/proposals/${id}`);
    if (!resp.ok) throw new Error('Not found');
    state.currentProposal = await resp.json();
    renderEditor(app);
    startAutoSave();
  } catch (e) {
    app.innerHTML = '<div class="empty-state"><div class="icon">❌</div><h3>Proposal not found</h3><a href="#/" class="btn">Back to Dashboard</a></div>';
  }
}

function renderEditor(app) {
  const p = state.currentProposal;
  const statusOptions = ['draft', 'in-progress', 'complete', 'submitted'];

  app.innerHTML = `
    <div class="editor-header">
      <input class="editor-title-input" value="${escapeHtml(p.title || '')}" placeholder="Proposal title..." oninput="state.currentProposal.title=this.value;state.unsavedChanges=true">
      <div class="editor-actions">
        <button class="btn btn-sm" onclick="saveVersion()">📸 Snapshot</button>
        <button class="btn btn-sm" onclick="showVersions()">🕐 History</button>
        <button class="btn btn-sm" onclick="exportProposalJSON()">📤 Export</button>
        <button class="btn btn-sm btn-primary" onclick="saveProposal()">💾 Save</button>
      </div>
    </div>
    <div class="editor-meta">
      <span>📋 ${escapeHtml(p.funderName || p.funder || 'No funder')}</span>
      <span>📐 ${escapeHtml(p.scheme || 'No scheme')}</span>
      <select class="filter-select" style="padding:4px 28px 4px 8px;font-size:11px" onchange="state.currentProposal.status=this.value;state.unsavedChanges=true">
        ${statusOptions.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s.replace('-', ' ')}</option>`).join('')}
      </select>
      <span id="autoSaveStatus" style="font-size:11px;color:var(--text-dim)"></span>
    </div>
    <div class="tabs" id="editorTabs">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="case">Case for Support</button>
      <button class="tab" data-tab="methodology">Methodology</button>
      <button class="tab" data-tab="impact">Impact</button>
      <button class="tab" data-tab="literature">Literature</button>
      <button class="tab" data-tab="budget">Budget</button>
      <button class="tab" data-tab="gantt">Gantt</button>
      <button class="tab" data-tab="ethics">Ethics & Data</button>
      <button class="tab" data-tab="compliance">Compliance</button>
      <button class="tab" data-tab="export">Export</button>
    </div>
    <div id="tabContent"></div>
  `;

  // Tab switching
  document.querySelectorAll('#editorTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#editorTabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTab(tab.dataset.tab);
    });
  });

  renderTab('overview');
}

function renderTab(tabName) {
  const container = document.getElementById('tabContent');
  const p = state.currentProposal;
  if (!p.sections) p.sections = {};
  if (!p.overview) p.overview = {};
  if (!p.notes) p.notes = {};

  switch (tabName) {
    case 'overview': renderOverviewTab(container, p); break;
    case 'case': renderSectionTab(container, p, 'Case for Support', 'case'); break;
    case 'methodology': renderMethodologyTab(container, p); break;
    case 'impact': renderImpactTab(container, p); break;
    case 'literature': renderLiteratureTab(container, p); break;
    case 'budget': renderBudgetTab(container, p); break;
    case 'gantt': renderGanttTab(container, p); break;
    case 'ethics': renderEthicsTab(container, p); break;
    case 'compliance': renderComplianceTab(container, p); break;
    case 'export': renderExportTab(container, p); break;
  }
}

// ─── Overview Tab ───────────────────────────────────────────

function renderOverviewTab(container, p) {
  const o = p.overview || {};
  container.innerHTML = `
    <div class="card">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Principal Investigator</label>
          <input class="form-input" value="${escapeHtml(o.piName || '')}" oninput="state.currentProposal.overview.piName=this.value;state.unsavedChanges=true" placeholder="Dr. Jane Smith">
        </div>
        <div class="form-group">
          <label class="form-label">Institution</label>
          <input class="form-input" value="${escapeHtml(o.piInstitution || '')}" oninput="state.currentProposal.overview.piInstitution=this.value;state.unsavedChanges=true" placeholder="University of...">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Department</label>
          <input class="form-input" value="${escapeHtml(o.department || '')}" oninput="state.currentProposal.overview.department=this.value;state.unsavedChanges=true">
        </div>
        <div class="form-group">
          <label class="form-label">ORCID</label>
          <input class="form-input" value="${escapeHtml(o.orcid || '')}" oninput="state.currentProposal.overview.orcid=this.value;state.unsavedChanges=true" placeholder="0000-0000-0000-0000">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Research Area</label>
        <input class="form-input" value="${escapeHtml(o.researchArea || '')}" oninput="state.currentProposal.overview.researchArea=this.value;state.unsavedChanges=true">
      </div>
      <div class="form-group">
        <label class="form-label">Research Question / Hypothesis</label>
        <textarea class="form-textarea" rows="3" oninput="state.currentProposal.overview.researchQuestion=this.value;state.unsavedChanges=true" placeholder="What is the central research question?">${escapeHtml(o.researchQuestion || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start Date</label>
          <input class="form-input" type="date" value="${o.startDate || ''}" oninput="state.currentProposal.overview.startDate=this.value;state.unsavedChanges=true">
        </div>
        <div class="form-group">
          <label class="form-label">Duration (months)</label>
          <input class="form-input" type="number" value="${p.duration || ''}" oninput="state.currentProposal.duration=Number(this.value);state.unsavedChanges=true">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Key Objectives (one per line)</label>
        <textarea class="form-textarea" rows="4" oninput="state.currentProposal.overview.objectives=this.value;state.unsavedChanges=true" placeholder="1. Objective one&#10;2. Objective two">${escapeHtml(o.objectives || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Co-Investigators (Name — Institution, one per line)</label>
        <textarea class="form-textarea" rows="3" oninput="state.currentProposal.overview.coInvestigators=this.value;state.unsavedChanges=true" placeholder="Dr. John Doe — University of Oxford">${escapeHtml(o.coInvestigators || '')}</textarea>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 style="color:var(--text-bright);margin-bottom:12px">📝 Notes</h3>
      <textarea class="form-textarea" rows="4" oninput="state.currentProposal.notes.overview=this.value;state.unsavedChanges=true" placeholder="Add notes about this proposal...">${escapeHtml((p.notes || {}).overview || '')}</textarea>
    </div>
  `;
}

// ─── Section Editor Tab (Case for Support, etc.) ─────────────

function renderSectionTab(container, p, sectionName, key) {
  container.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:var(--text-bright)">${sectionName}</h3>
        <div style="display:flex;gap:8px">
          <select class="filter-select" id="polishMode" style="padding:6px 28px 6px 10px;font-size:12px">
            <option value="academic">Academic Tone</option>
            <option value="clarity">Improve Clarity</option>
            <option value="concise">Make Concise</option>
            <option value="funder-aligned">Funder-Aligned</option>
            <option value="rewrite">Full Rewrite</option>
          </select>
          <button class="btn btn-sm" onclick="polishSection('${key}')">✨ Polish</button>
          <button class="btn btn-sm btn-primary" onclick="generateSection('${key}')">🤖 Generate</button>
        </div>
      </div>
      <textarea class="form-textarea" id="sectionText_${key}" rows="20" style="min-height:400px;font-size:14px;line-height:1.8"
        oninput="state.currentProposal.sections['${sectionName}']=this.value;state.unsavedChanges=true"
        placeholder="Write your ${sectionName.toLowerCase()} here, or use AI to generate it...">${escapeHtml(p.sections[sectionName] || '')}</textarea>
      <div class="form-hint" id="wordCount_${key}"></div>
      <div id="streamOutput_${key}" class="stream-output" style="display:none;margin-top:16px"></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 style="color:var(--text-bright);margin-bottom:12px">📝 Section Notes</h3>
      <textarea class="form-textarea" rows="3" oninput="state.currentProposal.notes['${key}']=this.value;state.unsavedChanges=true">${escapeHtml((p.notes || {})[key] || '')}</textarea>
    </div>
  `;

  // Word count
  updateWordCount(key, sectionName);
  document.getElementById(`sectionText_${key}`).addEventListener('input', () => updateWordCount(key, sectionName));
}

function updateWordCount(key, sectionName) {
  const text = document.getElementById(`sectionText_${key}`)?.value || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const el = document.getElementById(`wordCount_${key}`);
  if (el) el.textContent = `${words} words`;
}

window.generateSection = async function(key) {
  const sectionMap = { case: 'Case for Support' };
  const sectionName = sectionMap[key] || key;
  const p = state.currentProposal;
  const o = p.overview || {};

  const formData = {
    title: p.title, researchArea: o.researchArea, amount: p.amount,
    duration: p.duration, piName: o.piName, piInstitution: o.piInstitution,
    researchQuestion: o.researchQuestion, methodology: o.methodology || '',
    objectives: (o.objectives || '').split('\n').filter(Boolean),
    outcomes: o.outcomes || '', scheme: p.scheme
  };

  let funderData = null;
  if (p.funder) {
    try {
      const resp = await fetch(`/api/funders/${p.funder}`);
      funderData = await resp.json();
    } catch (e) {}
  }

  const output = document.getElementById(`streamOutput_${key}`);
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  try {
    const resp = await fetch('/api/generate/proposal', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ formData, funderData })
    });
    await streamResponse(resp, output, (text) => {
      document.getElementById(`sectionText_${key}`).value = text;
      const sName = sectionMap[key] || key;
      state.currentProposal.sections[sName] = text;
      state.unsavedChanges = true;
      updateWordCount(key, sName);
    });
  } catch (e) { toast('Generation failed: ' + e.message, 'error'); }
};

window.polishSection = async function(key) {
  const sectionMap = { case: 'Case for Support' };
  const text = document.getElementById(`sectionText_${key}`).value;
  if (!text.trim()) return toast('Nothing to polish', 'warning');

  const mode = document.getElementById('polishMode').value;
  const output = document.getElementById(`streamOutput_${key}`);
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  let funderData = null;
  if (state.currentProposal.funder) {
    try { funderData = await (await fetch(`/api/funders/${state.currentProposal.funder}`)).json(); } catch {}
  }

  try {
    const resp = await fetch('/api/generate/polish', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ text, mode, funderData })
    });
    await streamResponse(resp, output);
  } catch (e) { toast('Polish failed: ' + e.message, 'error'); }
};

// ─── Methodology Tab ────────────────────────────────────────

function renderMethodologyTab(container, p) {
  container.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:var(--text-bright)">Methodology & Research Design</h3>
        <button class="btn btn-sm btn-primary" onclick="generateMethodology()">🤖 Generate Methodology</button>
      </div>
      <textarea class="form-textarea" id="methodologyText" rows="20" style="min-height:400px;font-size:14px;line-height:1.8"
        oninput="state.currentProposal.sections['Methodology']=this.value;state.unsavedChanges=true"
        placeholder="Describe your research methodology...">${escapeHtml(p.sections['Methodology'] || '')}</textarea>
      <div id="methodologyStream" class="stream-output" style="display:none;margin-top:16px"></div>
    </div>
  `;
}

window.generateMethodology = async function() {
  const p = state.currentProposal;
  const o = p.overview || {};
  const output = document.getElementById('methodologyStream');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  let funderData = null;
  if (p.funder) { try { funderData = await (await fetch(`/api/funders/${p.funder}`)).json(); } catch {} }

  try {
    const resp = await fetch('/api/generate/methodology', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({
        formData: { title: p.title, researchArea: o.researchArea, researchQuestion: o.researchQuestion, methodology: p.sections['Methodology'] || o.methodology || '', duration: p.duration },
        funderData
      })
    });
    await streamResponse(resp, output, (text) => {
      document.getElementById('methodologyText').value = text;
      state.currentProposal.sections['Methodology'] = text;
      state.unsavedChanges = true;
    });
  } catch (e) { toast('Generation failed: ' + e.message, 'error'); }
};

// ─── Impact Tab ─────────────────────────────────────────────

function renderImpactTab(container, p) {
  container.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:var(--text-bright)">Impact Statement</h3>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="generatePlainSummary()">📖 Plain Summary</button>
          <button class="btn btn-sm btn-primary" onclick="generateImpact()">🤖 Generate Impact</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Research Summary (for impact generation)</label>
        <textarea class="form-textarea" id="impactResearchSummary" rows="3" placeholder="Brief summary of your research...">${escapeHtml(p.overview?.researchQuestion || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Target Beneficiaries (comma-separated)</label>
        <input class="form-input" id="impactBeneficiaries" placeholder="NHS, policymakers, patients, industry">
      </div>
      <textarea class="form-textarea" id="impactText" rows="16" style="min-height:300px;font-size:14px;line-height:1.8"
        oninput="state.currentProposal.sections['Impact']=this.value;state.unsavedChanges=true"
        placeholder="Your impact statement...">${escapeHtml(p.sections['Impact'] || '')}</textarea>
      <div id="impactStream" class="stream-output" style="display:none;margin-top:16px"></div>
    </div>
  `;
}

window.generateImpact = async function() {
  const p = state.currentProposal;
  const output = document.getElementById('impactStream');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  let funderData = null;
  if (p.funder) { try { funderData = await (await fetch(`/api/funders/${p.funder}`)).json(); } catch {} }

  const formData = {
    researchSummary: document.getElementById('impactResearchSummary').value,
    beneficiaries: document.getElementById('impactBeneficiaries').value.split(',').map(s => s.trim()).filter(Boolean)
  };

  try {
    const resp = await fetch('/api/generate/impact', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ formData, funderData })
    });
    await streamResponse(resp, output, (text) => {
      document.getElementById('impactText').value = text;
      state.currentProposal.sections['Impact'] = text;
      state.unsavedChanges = true;
    });
  } catch (e) { toast('Generation failed: ' + e.message, 'error'); }
};

window.generatePlainSummary = async function() {
  const p = state.currentProposal;
  const output = document.getElementById('impactStream');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  try {
    const resp = await fetch('/api/generate/plain-summary', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ proposal: p })
    });
    await streamResponse(resp, output);
  } catch (e) { toast('Generation failed: ' + e.message, 'error'); }
};

// ─── Literature Tab ─────────────────────────────────────────

function renderLiteratureTab(container, p) {
  if (!p.literature) p.literature = { papers: [], review: '' };
  state.selectedPapers = p.literature.papers || [];

  container.innerHTML = `
    <div class="card">
      <h3 style="color:var(--text-bright);margin-bottom:16px">📚 Literature Search</h3>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <input class="form-input" id="paperQuery" placeholder="Search Semantic Scholar..." style="flex:1">
        <button class="btn btn-primary" onclick="searchPapers()">Search</button>
      </div>
      <div id="paperResults" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius)"></div>
    </div>
    <div class="card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="color:var(--text-bright)">Selected Papers (${state.selectedPapers.length})</h3>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="findGapsFromLit()">🔍 Find Gaps</button>
          <button class="btn btn-sm btn-primary" onclick="generateLitReview()">🤖 Generate Review</button>
        </div>
      </div>
      <div id="selectedPapers">${renderSelectedPapers()}</div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 style="color:var(--text-bright);margin-bottom:12px">Literature Review</h3>
      <textarea class="form-textarea" id="litReviewText" rows="16" style="min-height:300px;font-size:14px;line-height:1.8"
        oninput="state.currentProposal.literature.review=this.value;state.currentProposal.sections['Literature Review']=this.value;state.unsavedChanges=true"
        placeholder="Your literature review will appear here...">${escapeHtml(p.literature.review || p.sections['Literature Review'] || '')}</textarea>
      <div id="litStream" class="stream-output" style="display:none;margin-top:16px"></div>
    </div>
  `;
}

function renderSelectedPapers() {
  if (state.selectedPapers.length === 0) return '<p style="color:var(--text-dim);font-size:13px;padding:12px">No papers selected. Search and click to add.</p>';
  return state.selectedPapers.map((p, i) => `
    <div class="paper-item selected" onclick="removeSelectedPaper(${i})">
      <div class="paper-title">${escapeHtml(p.title || 'Untitled')}</div>
      <div class="paper-authors">${(p.authors || []).map(a => a.name).join(', ')}</div>
      <div class="paper-meta"><span>${p.year || 'n.d.'}</span><span>Citations: ${p.citationCount || 0}</span></div>
    </div>
  `).join('');
}

window.searchPapers = async function() {
  const query = document.getElementById('paperQuery').value.trim();
  if (!query) return;
  const results = document.getElementById('paperResults');
  results.innerHTML = '<div class="loading-screen" style="height:100px"><div class="spinner"></div></div>';

  try {
    const resp = await fetch(`/api/search/papers?query=${encodeURIComponent(query)}&limit=10`);
    const data = await resp.json();
    const papers = data.data || [];
    results.innerHTML = papers.length === 0 ? '<p style="padding:16px;color:var(--text-dim)">No results found</p>'
      : papers.map(p => `
        <div class="paper-item" onclick="addSelectedPaper(${JSON.stringify(p).replace(/"/g, '&quot;').replace(/'/g, '&#39;')})">
          <div class="paper-title">${escapeHtml(p.title || 'Untitled')}</div>
          <div class="paper-authors">${(p.authors || []).map(a => a.name).join(', ')}</div>
          <div class="paper-meta"><span>${p.year || 'n.d.'}</span><span>Citations: ${p.citationCount || 0}</span></div>
        </div>
      `).join('');
  } catch (e) { results.innerHTML = `<p style="padding:16px;color:var(--red)">${e.message}</p>`; }
};

// Fix: use data attribute for paper data
window.addSelectedPaper = function(paper) {
  state.selectedPapers.push(paper);
  state.currentProposal.literature.papers = state.selectedPapers;
  state.unsavedChanges = true;
  document.getElementById('selectedPapers').innerHTML = renderSelectedPapers();
};

window.removeSelectedPaper = function(idx) {
  state.selectedPapers.splice(idx, 1);
  state.currentProposal.literature.papers = state.selectedPapers;
  state.unsavedChanges = true;
  document.getElementById('selectedPapers').innerHTML = renderSelectedPapers();
};

window.generateLitReview = async function() {
  if (state.selectedPapers.length === 0) return toast('Select some papers first', 'warning');
  const output = document.getElementById('litStream');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  const topic = document.getElementById('paperQuery')?.value || state.currentProposal.title;
  try {
    const resp = await fetch('/api/generate/literature', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ papers: state.selectedPapers, topic })
    });
    await streamResponse(resp, output, (text) => {
      document.getElementById('litReviewText').value = text;
      state.currentProposal.literature.review = text;
      state.currentProposal.sections['Literature Review'] = text;
      state.unsavedChanges = true;
    });
  } catch (e) { toast('Generation failed: ' + e.message, 'error'); }
};

window.findGapsFromLit = async function() {
  const text = document.getElementById('litReviewText')?.value;
  if (!text?.trim()) return toast('Write or generate a literature review first', 'warning');
  const output = document.getElementById('litStream');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  try {
    const resp = await fetch('/api/generate/research-gaps', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ text })
    });
    await streamResponse(resp, output);
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
};

// ─── Budget Tab ─────────────────────────────────────────────

function renderBudgetTab(container, p) {
  if (!p.budget) p.budget = { staff: [], travel: [], equipment: [], consumables: [], other: [], costModel: 'fEC', fecRate: 80, overheadRate: 25 };
  const b = p.budget;

  container.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:var(--text-bright)">💰 Budget Calculator</h3>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="generateBudgetJustification()">🤖 Justify Budget</button>
          <button class="btn btn-sm btn-primary" onclick="calculateBudget()">📊 Calculate</button>
        </div>
      </div>
      <div class="form-row-3" style="margin-bottom:20px">
        <div class="form-group">
          <label class="form-label">Cost Model</label>
          <select class="form-select" id="budgetCostModel" onchange="state.currentProposal.budget.costModel=this.value;state.unsavedChanges=true">
            <option value="fEC" ${b.costModel === 'fEC' ? 'selected' : ''}>Full Economic Cost (fEC)</option>
            <option value="full" ${b.costModel === 'full' ? 'selected' : ''}>Full Cost</option>
            <option value="custom" ${b.costModel === 'custom' ? 'selected' : ''}>Custom Rate</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Funder Rate (%)</label>
          <input class="form-input" type="number" id="budgetFecRate" value="${b.fecRate || 80}" onchange="state.currentProposal.budget.fecRate=Number(this.value);state.unsavedChanges=true">
        </div>
        <div class="form-group">
          <label class="form-label">Overhead Rate (%)</label>
          <input class="form-input" type="number" id="budgetOverheadRate" value="${b.overheadRate || 25}" onchange="state.currentProposal.budget.overheadRate=Number(this.value);state.unsavedChanges=true">
        </div>
      </div>

      ${budgetCategory('Staff', 'staff', b.staff, ['name:Name', 'role:Role', 'salary:Salary (£)', 'fte:FTE (%)', 'months:Months'])}
      ${budgetCategory('Travel & Subsistence', 'travel', b.travel, ['description:Description', 'costPerTrip:Cost/Trip (£)', 'numTrips:Trips'])}
      ${budgetCategory('Equipment', 'equipment', b.equipment, ['description:Description', 'cost:Cost (£)'])}
      ${budgetCategory('Consumables', 'consumables', b.consumables, ['description:Description', 'cost:Cost (£)'])}
      ${budgetCategory('Other Costs', 'other', b.other, ['description:Description', 'cost:Cost (£)'])}

      <div id="budgetSummary" style="margin-top:20px"></div>
      <div id="budgetJustification" class="stream-output" style="display:none;margin-top:16px"></div>
    </div>
  `;
}

function budgetCategory(label, key, items, fields) {
  const fieldDefs = fields.map(f => { const [k, l] = f.split(':'); return { key: k, label: l }; });
  return `
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h4 style="color:var(--text);font-size:14px">${label}</h4>
        <button class="btn btn-xs" onclick="addBudgetItem('${key}')">+ Add</button>
      </div>
      <table class="budget-table">
        <thead><tr>${fieldDefs.map(f => `<th>${f.label}</th>`).join('')}<th style="width:40px"></th></tr></thead>
        <tbody id="budget_${key}">
          ${(items || []).map((item, i) => `<tr>${fieldDefs.map(f =>
            `<td><input value="${escapeHtml(String(item[f.key] || ''))}" oninput="updateBudgetItem('${key}',${i},'${f.key}',this.value)"></td>`
          ).join('')}<td><button class="btn btn-xs btn-danger" onclick="removeBudgetItem('${key}',${i})">×</button></td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

window.addBudgetItem = function(key) {
  if (!state.currentProposal.budget[key]) state.currentProposal.budget[key] = [];
  state.currentProposal.budget[key].push({});
  state.unsavedChanges = true;
  renderTab('budget');
};

window.removeBudgetItem = function(key, idx) {
  state.currentProposal.budget[key].splice(idx, 1);
  state.unsavedChanges = true;
  renderTab('budget');
};

window.updateBudgetItem = function(key, idx, field, value) {
  if (!state.currentProposal.budget[key][idx]) return;
  state.currentProposal.budget[key][idx][field] = value;
  state.unsavedChanges = true;
};

window.calculateBudget = async function() {
  const b = state.currentProposal.budget;
  try {
    const resp = await fetch('/api/budget/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b)
    });
    const result = await resp.json();
    const s = result.summary;
    document.getElementById('budgetSummary').innerHTML = `
      <div class="card" style="background:var(--accent-subtle);border-color:var(--accent)">
        <h4 style="color:var(--accent);margin-bottom:12px">Budget Summary</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
          <div>Direct Costs:</div><div style="text-align:right;font-family:var(--mono)">£${s.directCosts.toLocaleString()}</div>
          <div>Indirect Costs (${s.overheadRate}%):</div><div style="text-align:right;font-family:var(--mono)">£${s.indirectCosts.toLocaleString()}</div>
          <div style="font-weight:700;color:var(--text-bright)">Full Economic Cost:</div><div style="text-align:right;font-weight:700;color:var(--text-bright);font-family:var(--mono)">£${s.fullEconomicCost.toLocaleString()}</div>
          <div>Funder Contribution (${s.funderRate}%):</div><div style="text-align:right;font-family:var(--mono);color:var(--accent)">£${s.funderContribution.toLocaleString()}</div>
          <div>Institution Contribution:</div><div style="text-align:right;font-family:var(--mono)">£${s.institutionContribution.toLocaleString()}</div>
        </div>
      </div>
    `;
    state.currentProposal.amount = s.funderContribution;
    state.unsavedChanges = true;
    toast('Budget calculated', 'success');
  } catch (e) { toast('Calculation failed: ' + e.message, 'error'); }
};

window.generateBudgetJustification = async function() {
  const b = state.currentProposal.budget;
  const output = document.getElementById('budgetJustification');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  try {
    const resp = await fetch('/api/generate/budget-justification', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ budgetData: b, projectContext: `${state.currentProposal.title}\n${state.currentProposal.overview?.researchQuestion || ''}` })
    });
    await streamResponse(resp, output, (text) => {
      state.currentProposal.sections['Budget Justification'] = text;
      state.unsavedChanges = true;
    });
  } catch (e) { toast('Generation failed: ' + e.message, 'error'); }
};

// ─── Gantt Tab ──────────────────────────────────────────────

function renderGanttTab(container, p) {
  if (!p.gantt) p.gantt = { workPackages: [] };
  const months = p.duration || 36;
  const wps = p.gantt.workPackages || [];

  container.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:var(--text-bright)">📅 Gantt Chart</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:12px;color:var(--text-dim)">Duration: ${months} months</span>
          <button class="btn btn-sm" onclick="addWorkPackage()">+ Work Package</button>
        </div>
      </div>
      <div class="gantt-container">
        <div class="gantt-header">
          <div class="gantt-label-col">Work Package</div>
          <div class="gantt-timeline">
            ${Array.from({length: Math.min(months, 60)}, (_, i) => `<div class="gantt-month">M${i + 1}</div>`).join('')}
          </div>
        </div>
        <div id="ganttRows">
          ${wps.map((wp, i) => ganttRow(wp, i, months)).join('')}
        </div>
      </div>
      ${wps.length === 0 ? '<p style="margin-top:12px;color:var(--text-dim);font-size:13px">Add work packages to build your Gantt chart.</p>' : ''}
    </div>
    <div class="card" style="margin-top:16px">
      <h3 style="color:var(--text-bright);margin-bottom:12px">Work Packages</h3>
      <div id="wpEditor">
        ${wps.map((wp, i) => wpEditorRow(wp, i)).join('')}
      </div>
    </div>
  `;
}

function ganttRow(wp, idx, totalMonths) {
  const start = (wp.start || 1) - 1;
  const end = (wp.end || wp.start || 1) - 1;
  const left = (start / Math.min(totalMonths, 60)) * 100;
  const width = ((end - start + 1) / Math.min(totalMonths, 60)) * 100;
  const colors = ['#f59e0b', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
  const color = colors[idx % colors.length];

  return `
    <div class="gantt-row">
      <div class="gantt-row-label">${escapeHtml(wp.name || `WP${idx + 1}`)}</div>
      <div class="gantt-row-bars">
        <div class="gantt-bar" style="left:${left}%;width:${width}%;background:${color}" title="${wp.name}: M${wp.start}-M${wp.end}"></div>
      </div>
    </div>
  `;
}

function wpEditorRow(wp, idx) {
  return `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm)">
      <input class="form-input" style="flex:2" value="${escapeHtml(wp.name || '')}" placeholder="WP name" oninput="updateWP(${idx},'name',this.value)">
      <input class="form-input" style="width:80px" type="number" value="${wp.start || 1}" placeholder="Start" oninput="updateWP(${idx},'start',Number(this.value))">
      <input class="form-input" style="width:80px" type="number" value="${wp.end || 1}" placeholder="End" oninput="updateWP(${idx},'end',Number(this.value))">
      <input class="form-input" style="flex:1" value="${escapeHtml(wp.deliverable || '')}" placeholder="Deliverable" oninput="updateWP(${idx},'deliverable',this.value)">
      <button class="btn btn-xs btn-danger" onclick="removeWP(${idx})">×</button>
    </div>
  `;
}

window.addWorkPackage = function() {
  if (!state.currentProposal.gantt) state.currentProposal.gantt = { workPackages: [] };
  state.currentProposal.gantt.workPackages.push({ name: '', start: 1, end: 6, deliverable: '' });
  state.unsavedChanges = true;
  renderTab('gantt');
};

window.updateWP = function(idx, field, value) {
  state.currentProposal.gantt.workPackages[idx][field] = value;
  state.unsavedChanges = true;
  // Re-render Gantt visual
  const ganttRows = document.getElementById('ganttRows');
  if (ganttRows) {
    const months = state.currentProposal.duration || 36;
    ganttRows.innerHTML = state.currentProposal.gantt.workPackages.map((wp, i) => ganttRow(wp, i, months)).join('');
  }
};

window.removeWP = function(idx) {
  state.currentProposal.gantt.workPackages.splice(idx, 1);
  state.unsavedChanges = true;
  renderTab('gantt');
};

// ─── Ethics Tab ─────────────────────────────────────────────

function renderEthicsTab(container, p) {
  container.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:var(--text-bright)">Ethics Statement & Data Management Plan</h3>
        <button class="btn btn-sm btn-primary" onclick="generateEthics()">🤖 Generate</button>
      </div>
      <div class="form-group">
        <label class="form-label">Participants / Subjects</label>
        <input class="form-input" id="ethicsParticipants" placeholder="Human participants, animal subjects, sensitive data..." value="${escapeHtml(p.overview?.participants || '')}">
      </div>
      <textarea class="form-textarea" id="ethicsText" rows="20" style="min-height:400px;font-size:14px;line-height:1.8"
        oninput="state.currentProposal.sections['Ethics & Data Management']=this.value;state.unsavedChanges=true"
        placeholder="Ethics statement and data management plan...">${escapeHtml(p.sections['Ethics & Data Management'] || '')}</textarea>
      <div id="ethicsStream" class="stream-output" style="display:none;margin-top:16px"></div>
    </div>
  `;
}

window.generateEthics = async function() {
  const p = state.currentProposal;
  const o = p.overview || {};
  const output = document.getElementById('ethicsStream');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  try {
    const resp = await fetch('/api/generate/ethics', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({
        formData: {
          title: p.title, researchArea: o.researchArea, methodology: p.sections['Methodology'] || '',
          participants: document.getElementById('ethicsParticipants').value
        }
      })
    });
    await streamResponse(resp, output, (text) => {
      document.getElementById('ethicsText').value = text;
      state.currentProposal.sections['Ethics & Data Management'] = text;
      state.unsavedChanges = true;
    });
  } catch (e) { toast('Generation failed: ' + e.message, 'error'); }
};

// ─── Compliance Tab ─────────────────────────────────────────

function renderComplianceTab(container, p) {
  container.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:var(--text-bright)">✅ Compliance Checker</h3>
        <button class="btn btn-sm btn-primary" onclick="runCompliance()">Run Check</button>
      </div>
      <p style="color:var(--text-dim);font-size:13px;margin-bottom:16px">Check your proposal against funder requirements for word counts, required sections, and budget limits.</p>
      <div id="complianceResults">
        <div class="empty-state" style="padding:40px"><p>Click "Run Check" to validate your proposal against ${escapeHtml(p.funderName || p.funder || 'the selected funder')}'s requirements.</p></div>
      </div>
    </div>
  `;
}

window.runCompliance = async function() {
  const p = state.currentProposal;
  if (!p.funder) return toast('No funder selected', 'warning');

  const results = document.getElementById('complianceResults');
  results.innerHTML = '<div class="loading-screen" style="height:100px"><div class="spinner"></div></div>';

  const proposalText = Object.values(p.sections || {}).join('\n\n');

  try {
    const resp = await fetch('/api/compliance/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalText, sections: p.sections || {},
        funderId: p.funder, schemeIndex: 0,
        budget: p.amount || 0, duration: p.duration || 0
      })
    });
    const data = await resp.json();
    const icons = { pass: '✓', warn: '⚠', fail: '✗' };
    results.innerHTML = `
      <div style="padding:12px 16px;background:var(--${data.overall === 'pass' ? 'green' : data.overall === 'warn' ? 'orange' : 'red'});color:#000;border-radius:var(--radius-sm);font-weight:600;margin-bottom:16px;font-size:14px">
        Overall: ${data.overall.toUpperCase()}
      </div>
      ${(data.results || []).map(r => `
        <div class="compliance-item">
          <div class="compliance-icon ${r.status}">${icons[r.status]}</div>
          <div class="compliance-content">
            <div class="compliance-check">${escapeHtml(r.check)}</div>
            <div class="compliance-message">${escapeHtml(r.message)}</div>
            ${r.advice ? `<div class="compliance-advice">${escapeHtml(r.advice)}</div>` : ''}
          </div>
        </div>
      `).join('')}
    `;
    toast(`Compliance check: ${data.overall}`, data.overall === 'pass' ? 'success' : data.overall === 'warn' ? 'warning' : 'error');
  } catch (e) { toast('Check failed: ' + e.message, 'error'); }
};

// ─── Export Tab ──────────────────────────────────────────────

function renderExportTab(container, p) {
  container.innerHTML = `
    <div class="card">
      <h3 style="color:var(--text-bright);margin-bottom:16px">📤 Export Proposal</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card" style="cursor:pointer" onclick="exportPDF()">
          <div style="font-size:32px;margin-bottom:8px">📄</div>
          <h4 style="color:var(--text-bright)">PDF Export</h4>
          <p style="font-size:12px;color:var(--text-dim)">Academic-formatted PDF with title page, sections, and budget.</p>
        </div>
        <div class="card" style="cursor:pointer" onclick="exportProposalJSON()">
          <div style="font-size:32px;margin-bottom:8px">📋</div>
          <h4 style="color:var(--text-bright)">JSON Export</h4>
          <p style="font-size:12px;color:var(--text-dim)">Share with co-authors. Full proposal data for import.</p>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:var(--text-bright)">🤖 AI Summaries</h3>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <button class="btn" onclick="generateAbstractExport()">📝 Generate Abstract</button>
        <button class="btn" onclick="generatePlainSummaryExport()">📖 Plain Language Summary</button>
      </div>
      <div id="exportStream" class="stream-output" style="display:none"></div>
    </div>
  `;
}

window.exportPDF = async function() {
  const p = state.currentProposal;
  try {
    const resp = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposal: {
          title: p.title, piName: p.overview?.piName, piInstitution: p.overview?.piInstitution,
          funder: p.funderName || p.funder, scheme: p.scheme,
          amount: p.amount, duration: p.duration,
          sections: p.sections || {}, budget: p.budgetResult || null
        }
      })
    });
    const html = await resp.text();
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    toast('PDF export opened', 'success');
  } catch (e) { toast('Export failed: ' + e.message, 'error'); }
};

window.exportProposalJSON = function() {
  const p = state.currentProposal;
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(p.title || 'proposal').replace(/[^a-z0-9]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('JSON exported', 'success');
};

window.generateAbstractExport = async function() {
  const output = document.getElementById('exportStream');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';
  try {
    const resp = await fetch('/api/generate/abstract', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ proposal: state.currentProposal })
    });
    await streamResponse(resp, output);
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
};

window.generatePlainSummaryExport = async function() {
  const output = document.getElementById('exportStream');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';
  try {
    const resp = await fetch('/api/generate/plain-summary', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ proposal: state.currentProposal })
    });
    await streamResponse(resp, output);
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
};

// ─── Templates Page ─────────────────────────────────────────

async function renderTemplates(app) {
  let funders = [];
  try {
    const resp = await fetch('/api/funders');
    funders = await resp.json();
  } catch {}

  app.innerHTML = `
    <div class="page-header">
      <h1>📋 Funder <span class="accent">Templates</span></h1>
      <span style="font-size:13px;color:var(--text-dim)">${funders.length} funders available</span>
    </div>
    <div class="templates-grid">
      ${funders.map(f => `
        <div class="template-card" onclick="showFunderDetail('${f.id}')">
          <div class="template-name">${escapeHtml(f.name)}</div>
          <div class="template-full-name">${escapeHtml(f.fullName)}</div>
          <div class="template-schemes">${f.schemesCount} scheme${f.schemesCount !== 1 ? 's' : ''} available</div>
          <div class="template-priorities">
            ${(f.priorities || []).slice(0, 5).map(p => `<span class="tag">${escapeHtml(p)}</span>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
    <div id="funderModal"></div>
  `;
}

window.showFunderDetail = async function(id) {
  try {
    const resp = await fetch(`/api/funders/${id}`);
    const f = await resp.json();
    document.getElementById('funderModal').innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)this.innerHTML=''">
        <div class="modal">
          <div class="modal-title">${escapeHtml(f.fullName)}</div>
          <p style="color:var(--text-dim);margin-bottom:16px">${f.parent ? `Part of ${f.parent}` : 'Independent funder'}</p>
          <h4 style="color:var(--accent);margin-bottom:12px">Available Schemes</h4>
          ${(f.schemes || []).map(s => `
            <div class="card" style="margin-bottom:12px">
              <div class="card-title">${escapeHtml(s.name)}</div>
              <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">
                ${s.maxAmount ? `Up to £${s.maxAmount.toLocaleString()}` : ''} ${s.maxDuration ? `• Max ${s.maxDuration} months` : ''}
              </div>
              ${s.eligibility ? `<div style="font-size:12px;margin-bottom:8px"><strong>Eligibility:</strong> ${escapeHtml(s.eligibility)}</div>` : ''}
              ${s.notes ? `<div style="font-size:12px;color:var(--accent);font-style:italic">${escapeHtml(s.notes)}</div>` : ''}
            </div>
          `).join('')}
          ${f.reviewCriteria ? `<h4 style="color:var(--accent);margin:16px 0 8px">Review Criteria</h4><ul style="font-size:13px;padding-left:20px">${f.reviewCriteria.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''}
          <div class="modal-actions">
            <button class="btn" onclick="this.closest('.modal-overlay').innerHTML=''">Close</button>
          </div>
        </div>
      </div>
    `;
  } catch (e) { toast('Failed to load funder details', 'error'); }
};

// ─── Settings Page ──────────────────────────────────────────

function renderSettings(app) {
  const s = getSettings();

  app.innerHTML = `
    <div class="page-header">
      <h1>⚙️ <span class="accent">Settings</span></h1>
    </div>
    <div class="settings-section">
      <h2>AI Provider</h2>
      <div class="provider-options">
        <div class="provider-option ${s.provider === 'mikoshi' || !s.provider ? 'active' : ''}" onclick="setProvider('mikoshi')">
          <div class="name">🤖 Mikoshi AI</div>
          <div class="desc">Local Ollama model</div>
          <div class="free-badge">Free</div>
        </div>
        <div class="provider-option ${s.provider === 'claude' ? 'active' : ''}" onclick="setProvider('claude')">
          <div class="name">🟣 Claude</div>
          <div class="desc">Anthropic API</div>
        </div>
        <div class="provider-option ${s.provider === 'openai' ? 'active' : ''}" onclick="setProvider('openai')">
          <div class="name">🟢 OpenAI</div>
          <div class="desc">GPT models</div>
        </div>
      </div>
      <div id="providerKeyFields">
        ${s.provider === 'claude' ? `
          <div class="form-group">
            <label class="form-label">Claude API Key</label>
            <input class="form-input" type="password" id="claudeKeyInput" value="${escapeHtml(s.claudeKey || '')}" placeholder="sk-ant-..." oninput="updateApiKey('claude', this.value)">
          </div>
        ` : s.provider === 'openai' ? `
          <div class="form-group">
            <label class="form-label">OpenAI API Key</label>
            <input class="form-input" type="password" id="openaiKeyInput" value="${escapeHtml(s.openaiKey || '')}" placeholder="sk-..." oninput="updateApiKey('openai', this.value)">
          </div>
        ` : `
          <p style="font-size:13px;color:var(--text-dim)">Mikoshi AI uses the local Ollama server. No API key needed.</p>
        `}
      </div>
    </div>
    <div class="settings-section">
      <h2>User Profile</h2>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input class="form-input" value="${escapeHtml(s.userName || '')}" oninput="updateSetting('userName', this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">Institution</label>
          <input class="form-input" value="${escapeHtml(s.userInstitution || '')}" oninput="updateSetting('userInstitution', this.value)">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Department</label>
          <input class="form-input" value="${escapeHtml(s.userDepartment || '')}" oninput="updateSetting('userDepartment', this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">ORCID</label>
          <input class="form-input" value="${escapeHtml(s.userOrcid || '')}" oninput="updateSetting('userOrcid', this.value)" placeholder="0000-0000-0000-0000">
        </div>
      </div>
    </div>
    <div class="settings-section">
      <h2>About</h2>
      <p style="font-size:13px;color:var(--text-dim);line-height:1.8">
        <strong style="color:var(--text-bright)">Mikoshi BidWriter</strong> — AI-powered academic grant proposal platform.<br>
        16 funder templates • Multi-provider AI • Budget calculator • Compliance checker<br>
        © 2025 Mikoshi Ltd — Swansea, Wales
      </p>
    </div>
  `;
}

window.setProvider = function(provider) {
  const s = getSettings();
  s.provider = provider;
  saveSettings(s);
  renderSettings(document.getElementById('app'));
};

window.updateApiKey = function(provider, value) {
  const s = getSettings();
  if (provider === 'claude') s.claudeKey = value;
  if (provider === 'openai') s.openaiKey = value;
  saveSettings(s);
};

window.updateSetting = function(key, value) {
  const s = getSettings();
  s[key] = value;
  saveSettings(s);
};

// ─── AI Tool Pages ──────────────────────────────────────────

function renderAITool(app, tool) {
  if (tool === 'reviewer') {
    app.innerHTML = `
      <div class="page-header"><h1>👁️ Reviewer <span class="accent">Simulator</span></h1></div>
      <div class="card">
        <p style="color:var(--text-dim);margin-bottom:16px;font-size:13px">Paste your proposal text and an AI reviewer will critique it as a funder panel member.</p>
        <div class="form-group">
          <label class="form-label">Proposal Text</label>
          <textarea class="form-textarea" id="reviewerText" rows="10" placeholder="Paste your proposal text here..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Funder (optional)</label>
          <select class="form-select" id="reviewerFunder">
            <option value="">Generic reviewer</option>
            ${state.funders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" onclick="runReviewer()">🤖 Simulate Review</button>
        <div id="reviewerOutput" class="stream-output" style="display:none;margin-top:16px"></div>
      </div>
    `;
  } else if (tool === 'gaps') {
    app.innerHTML = `
      <div class="page-header"><h1>🔍 Research Gap <span class="accent">Finder</span></h1></div>
      <div class="card">
        <p style="color:var(--text-dim);margin-bottom:16px;font-size:13px">Paste your literature review and AI will identify research gaps and opportunities.</p>
        <div class="form-group">
          <label class="form-label">Literature Review Text</label>
          <textarea class="form-textarea" id="gapsText" rows="10" placeholder="Paste your literature review..."></textarea>
        </div>
        <button class="btn btn-primary" onclick="runGapFinder()">🔍 Find Gaps</button>
        <div id="gapsOutput" class="stream-output" style="display:none;margin-top:16px"></div>
      </div>
    `;
  } else if (tool === 'response') {
    app.innerHTML = `
      <div class="page-header"><h1>💬 Response to <span class="accent">Reviewers</span></h1></div>
      <div class="card">
        <p style="color:var(--text-dim);margin-bottom:16px;font-size:13px">Paste reviewer comments and get a structured point-by-point response.</p>
        <div class="form-group">
          <label class="form-label">Proposal Context (brief summary)</label>
          <textarea class="form-textarea" id="responseContext" rows="3" placeholder="Brief summary of your proposal..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Reviewer Comments</label>
          <textarea class="form-textarea" id="responseComments" rows="8" placeholder="Paste reviewer comments here..."></textarea>
        </div>
        <button class="btn btn-primary" onclick="runReviewerResponse()">🤖 Generate Response</button>
        <div id="responseOutput" class="stream-output" style="display:none;margin-top:16px"></div>
      </div>
    `;
  }
}

window.runReviewer = async function() {
  const text = document.getElementById('reviewerText').value;
  if (!text.trim()) return toast('Enter proposal text', 'warning');
  const output = document.getElementById('reviewerOutput');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  const funderId = document.getElementById('reviewerFunder').value;
  let funderData = null;
  if (funderId) { try { funderData = await (await fetch(`/api/funders/${funderId}`)).json(); } catch {} }

  try {
    const resp = await fetch('/api/generate/reviewer-simulation', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ proposal: { sections: { 'Full Text': text }, title: 'Proposal' }, funderData })
    });
    await streamResponse(resp, output);
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
};

window.runGapFinder = async function() {
  const text = document.getElementById('gapsText').value;
  if (!text.trim()) return toast('Enter literature review text', 'warning');
  const output = document.getElementById('gapsOutput');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  try {
    const resp = await fetch('/api/generate/research-gaps', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ text })
    });
    await streamResponse(resp, output);
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
};

window.runReviewerResponse = async function() {
  const comments = document.getElementById('responseComments').value;
  const context = document.getElementById('responseContext').value;
  if (!comments.trim()) return toast('Enter reviewer comments', 'warning');
  const output = document.getElementById('responseOutput');
  output.style.display = 'block';
  output.innerHTML = '<span class="cursor-blink"></span>';

  try {
    const resp = await fetch('/api/generate/reviewer-response', {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ reviewerComments: comments, proposalContext: context })
    });
    await streamResponse(resp, output);
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
};

// ─── Save / Auto-save / Versions ────────────────────────────

async function saveProposal() {
  const p = state.currentProposal;
  if (!p) return;
  try {
    const resp = await fetch(`/api/proposals/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    });
    const updated = await resp.json();
    state.currentProposal = updated;
    state.unsavedChanges = false;
    const el = document.getElementById('autoSaveStatus');
    if (el) el.textContent = `Saved ${new Date().toLocaleTimeString()}`;
    toast('Saved', 'success');
  } catch (e) { toast('Save failed: ' + e.message, 'error'); }
}

window.saveProposal = saveProposal;

function startAutoSave() {
  if (state.autoSaveTimer) clearInterval(state.autoSaveTimer);
  state.autoSaveTimer = setInterval(() => {
    if (state.unsavedChanges && state.currentProposal) {
      saveProposal();
    }
  }, 30000);
}

window.saveVersion = async function() {
  const p = state.currentProposal;
  if (!p) return;
  const label = prompt('Version label (optional):') || '';
  try {
    await fetch(`/api/proposals/${p.id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });
    toast('Version snapshot saved', 'success');
  } catch (e) { toast('Failed to save version', 'error'); }
};

window.showVersions = async function() {
  const p = state.currentProposal;
  if (!p) return;
  try {
    const resp = await fetch(`/api/proposals/${p.id}/versions`);
    const versions = await resp.json();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-title">Version History</div>
        <div class="version-list">
          ${versions.length === 0 ? '<p style="color:var(--text-dim);padding:12px">No versions yet. Click "Snapshot" to save one.</p>'
            : versions.map(v => `
              <div class="version-item">
                <div>
                  <div class="version-time">${new Date(v.timestamp).toLocaleString()}</div>
                  ${v.label ? `<div class="version-label">${escapeHtml(v.label)}</div>` : ''}
                </div>
                <button class="btn btn-xs" onclick="restoreVersion('${p.id}','${v.versionId}');this.closest('.modal-overlay').remove()">Restore</button>
              </div>
            `).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn" onclick="this.closest('.modal-overlay').remove()">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch (e) { toast('Failed to load versions', 'error'); }
};

window.restoreVersion = async function(proposalId, versionId) {
  if (!confirm('Restore this version? Current state will be saved as a version first.')) return;
  try {
    const resp = await fetch(`/api/proposals/${proposalId}/versions/${versionId}/restore`, { method: 'POST' });
    const restored = await resp.json();
    state.currentProposal = restored;
    renderEditor(document.getElementById('app'));
    toast('Version restored', 'success');
  } catch (e) { toast('Restore failed: ' + e.message, 'error'); }
};

window.exportProposal = exportPDF;

// ─── Streaming Response Handler ─────────────────────────────

async function streamResponse(resp, outputEl, onComplete) {
  let fullText = '';
  const reader = resp.body.getReader();
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
          const event = JSON.parse(line.slice(6));
          if (event.type === 'chunk') {
            fullText += event.content;
            outputEl.innerHTML = renderMarkdown(fullText) + '<span class="cursor-blink"></span>';
            outputEl.scrollTop = outputEl.scrollHeight;
          } else if (event.type === 'error') {
            toast(event.message, 'error');
          } else if (event.type === 'done') {
            outputEl.innerHTML = renderMarkdown(fullText);
            if (onComplete) onComplete(fullText);
          }
        } catch (e) { /* skip */ }
      }
    }
  }

  // Final cleanup
  outputEl.innerHTML = renderMarkdown(fullText);
  if (onComplete) onComplete(fullText);
}

// ─── Markdown Renderer (basic) ──────────────────────────────

function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

// ─── Utilities ──────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
