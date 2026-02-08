/**
 * Proposal Generator Module
 * Handles the new proposal form, AI generation, and section editing.
 */

// Also handles the dashboard page init
async function initDashboardPage() {
  try {
    const proposals = await api('/proposals');
    
    // Update stats
    const total = proposals.length;
    const inProgress = proposals.filter(p => p.status === 'in-progress' || p.status === 'draft').length;
    const complete = proposals.filter(p => p.status === 'complete' || p.status === 'submitted').length;
    const rate = total > 0 ? Math.round((complete / total) * 100) : 0;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statInProgress').textContent = inProgress;
    document.getElementById('statComplete').textContent = complete;
    document.getElementById('statRate').textContent = `${rate}%`;

    // Render proposals list
    const listEl = document.getElementById('proposalsList');
    if (proposals.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <h3>No proposals yet</h3>
          <p>Create your first grant proposal to get started.</p>
          <a href="#/new-proposal" class="btn btn-primary">+ New Proposal</a>
        </div>`;
      return;
    }

    listEl.innerHTML = `<div class="proposals-list">
      ${proposals.map(p => `
        <div class="proposal-item" onclick="location.hash='#/edit-proposal?id=${p.id}'">
          <div class="proposal-info">
            <div class="proposal-title">${escapeHtml(p.title)}</div>
            <div class="proposal-meta">
              ${p.funder ? `<span>${escapeHtml(p.funder)}</span>` : ''}
              ${p.amount ? `<span>${formatCurrency(p.amount)}</span>` : ''}
              <span>${formatDate(p.updatedAt)}</span>
            </div>
          </div>
          <div class="proposal-actions">
            <span class="status-badge status-${p.status}">${p.status}</span>
            <button class="btn-icon" onclick="event.stopPropagation(); deleteProposal('${p.id}')" title="Delete">🗑️</button>
          </div>
        </div>
      `).join('')}
    </div>`;
  } catch (e) {
    document.getElementById('proposalsList').innerHTML = 
      `<div class="empty-state"><p>Failed to load proposals.</p></div>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function deleteProposal(id) {
  if (!confirm('Delete this proposal? This cannot be undone.')) return;
  try {
    await api(`/proposals/${id}`, { method: 'DELETE' });
    showToast('Proposal deleted', 'success');
    initDashboardPage(); // refresh
  } catch (e) {
    showToast('Failed to delete proposal', 'error');
  }
}

// ─── New Proposal Page ──────────────────────────────────────

let proposalState = {
  id: null,
  sections: {},
  formData: {},
  funderData: null
};

async function initNewProposalPage(params) {
  // Populate funder dropdown
  await populateFunderDropdown(document.getElementById('pFunder'));

  // Funder → Scheme cascade
  document.getElementById('pFunder').addEventListener('change', async (e) => {
    await populateSchemeDropdown(document.getElementById('pScheme'), e.target.value);
  });

  // Tab switching
  document.querySelectorAll('#proposalTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#proposalTabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isForm = tab.dataset.tab === 'form';
      document.getElementById('tabForm').classList.toggle('hidden', !isForm);
      document.getElementById('tabOutput').classList.toggle('hidden', isForm);
    });
  });

  // Co-Investigators dynamic list
  setupCoInvestigators();

  // Objectives dynamic list
  createDynamicList('objectives', 'Enter an objective...');

  // Generate button
  document.getElementById('proposalForm').addEventListener('submit', handleGenerate);
  document.getElementById('saveDraftBtn').addEventListener('click', handleSaveDraft);
  document.getElementById('clearFormBtn').addEventListener('click', clearForm);
  document.getElementById('backToFormBtn').addEventListener('click', switchToForm);
  document.getElementById('exportPdfBtn').addEventListener('click', handleExportPdf);
  document.getElementById('saveProposalBtn').addEventListener('click', () => handleSaveProposal('in-progress'));

  // Load existing proposal if editing
  if (params.id) {
    try {
      const proposal = await api(`/proposals/${params.id}`);
      loadProposalIntoForm(proposal);
      proposalState.id = params.id;
      document.getElementById('proposalPageTitle').textContent = 'Edit Proposal';
    } catch (e) {
      showToast('Failed to load proposal', 'error');
    }
  } else {
    proposalState.id = null;
    proposalState.sections = {};
  }
}

function setupCoInvestigators() {
  const container = document.getElementById('coInvestigators');

  function addCI(name = '', inst = '') {
    const item = document.createElement('div');
    item.className = 'dynamic-list-item';
    item.innerHTML = `
      <input type="text" class="form-input ci-name" placeholder="Name" value="${name.replace(/"/g, '&quot;')}">
      <input type="text" class="form-input ci-inst" placeholder="Institution" value="${inst.replace(/"/g, '&quot;')}">
      <button type="button" class="btn-remove" title="Remove">×</button>
    `;
    item.querySelector('.btn-remove').addEventListener('click', () => item.remove());
    container.insertBefore(item, document.getElementById('addCI'));
  }

  document.getElementById('addCI').addEventListener('click', () => addCI());

  return { addCI };
}

function getFormData() {
  const coIs = Array.from(document.querySelectorAll('#coInvestigators .dynamic-list-item')).map(item => ({
    name: item.querySelector('.ci-name')?.value?.trim() || '',
    institution: item.querySelector('.ci-inst')?.value?.trim() || ''
  })).filter(ci => ci.name);

  const objectives = Array.from(document.querySelectorAll('#objectives .dynamic-list-item input'))
    .map(input => input.value.trim())
    .filter(v => v);

  return {
    title: document.getElementById('pTitle').value.trim(),
    researchArea: document.getElementById('pResearchArea').value.trim(),
    funder: document.getElementById('pFunder').selectedOptions[0]?.text || '',
    funderId: document.getElementById('pFunder').value,
    scheme: document.getElementById('pScheme').selectedOptions[0]?.text || '',
    schemeIndex: document.getElementById('pScheme').value,
    amount: document.getElementById('pAmount').value,
    duration: document.getElementById('pDuration').value,
    piName: document.getElementById('pPIName').value.trim(),
    piInstitution: document.getElementById('pPIInstitution').value.trim(),
    coInvestigators: coIs,
    researchQuestion: document.getElementById('pResearchQuestion').value.trim(),
    objectives,
    methodology: document.getElementById('pMethodology').value.trim(),
    outcomes: document.getElementById('pOutcomes').value.trim(),
    existingNotes: document.getElementById('pExistingNotes').value.trim()
  };
}

function loadProposalIntoForm(proposal) {
  document.getElementById('pTitle').value = proposal.title || '';
  document.getElementById('pResearchArea').value = proposal.researchArea || '';
  document.getElementById('pAmount').value = proposal.amount || '';
  document.getElementById('pDuration').value = proposal.duration || '';
  document.getElementById('pPIName').value = proposal.piName || '';
  document.getElementById('pPIInstitution').value = proposal.piInstitution || '';
  document.getElementById('pResearchQuestion').value = proposal.researchQuestion || '';
  document.getElementById('pMethodology').value = proposal.methodology || '';
  document.getElementById('pOutcomes').value = proposal.outcomes || '';
  document.getElementById('pExistingNotes').value = proposal.existingNotes || '';

  // Load sections if they exist
  if (proposal.sections && Object.keys(proposal.sections).length > 0) {
    proposalState.sections = proposal.sections;
    renderSections(proposal.sections);
    // Switch to output tab
    document.querySelectorAll('#proposalTabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#proposalTabs .tab')[1].classList.add('active');
    document.getElementById('tabForm').classList.add('hidden');
    document.getElementById('tabOutput').classList.remove('hidden');
  }

  // Set funder (async, need to wait for dropdown)
  if (proposal.funderId) {
    setTimeout(async () => {
      document.getElementById('pFunder').value = proposal.funderId;
      await populateSchemeDropdown(document.getElementById('pScheme'), proposal.funderId);
      if (proposal.schemeIndex !== undefined) {
        document.getElementById('pScheme').value = proposal.schemeIndex;
      }
    }, 500);
  }

  // CIs
  if (proposal.coInvestigators?.length) {
    // Clear existing
    document.querySelectorAll('#coInvestigators .dynamic-list-item').forEach(el => el.remove());
    const container = document.getElementById('coInvestigators');
    const addBtn = document.getElementById('addCI');
    proposal.coInvestigators.forEach(ci => {
      const item = document.createElement('div');
      item.className = 'dynamic-list-item';
      item.innerHTML = `
        <input type="text" class="form-input ci-name" placeholder="Name" value="${(ci.name || '').replace(/"/g, '&quot;')}">
        <input type="text" class="form-input ci-inst" placeholder="Institution" value="${(ci.institution || '').replace(/"/g, '&quot;')}">
        <button type="button" class="btn-remove" title="Remove">×</button>
      `;
      item.querySelector('.btn-remove').addEventListener('click', () => item.remove());
      container.insertBefore(item, addBtn);
    });
  }

  // Objectives
  if (proposal.objectives?.length) {
    createDynamicList('objectives', 'Enter an objective...', proposal.objectives);
  }
}

async function handleGenerate(e) {
  e.preventDefault();
  const formData = getFormData();

  if (!formData.title || !formData.researchQuestion) {
    showToast('Please fill in the project title and research question', 'warning');
    return;
  }

  proposalState.formData = formData;

  // Load funder data if selected
  let funderData = null;
  if (formData.funderId) {
    funderData = await loadFunderDetails(formData.funderId);
    proposalState.funderData = funderData;
  }

  // Switch to output tab
  document.querySelectorAll('#proposalTabs .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#proposalTabs .tab')[1].classList.add('active');
  document.getElementById('tabForm').classList.add('hidden');
  document.getElementById('tabOutput').classList.remove('hidden');

  // Show loading state
  const sectionsEl = document.getElementById('proposalSections');
  sectionsEl.innerHTML = `
    <div class="card">
      <div class="loading-inline">
        <div class="spinner spinner-sm"></div>
        <span>Generating your proposal... This may take a minute.</span>
      </div>
      <div class="ai-output ai-streaming-cursor" id="streamOutput"></div>
    </div>`;

  const generateBtn = document.getElementById('generateBtn');
  generateBtn.disabled = true;
  document.getElementById('outputStatus').textContent = 'Generating...';

  let fullText = '';

  await streamAI('/generate/proposal', { formData, funderData }, 
    (chunk) => {
      fullText += chunk;
      document.getElementById('streamOutput').textContent = fullText;
      // Auto-scroll
      document.getElementById('streamOutput').scrollTop = document.getElementById('streamOutput').scrollHeight;
    },
    () => {
      // Done - parse sections and render editors
      generateBtn.disabled = false;
      document.getElementById('outputStatus').textContent = `Generated (${countWords(fullText)} words)`;
      proposalState.sections = parseSections(fullText);
      proposalState.rawText = fullText;
      renderSections(proposalState.sections);
      showToast('Proposal generated successfully!', 'success');
    },
    (err) => {
      generateBtn.disabled = false;
      document.getElementById('outputStatus').textContent = 'Generation failed';
      sectionsEl.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <h3>Generation Failed</h3>
            <p>${escapeHtml(err.message)}</p>
            <button class="btn btn-primary" onclick="switchToForm()">← Back to Form</button>
          </div>
        </div>`;
      showToast(err.message, 'error');
    }
  );
}

function parseSections(text) {
  const sections = {};
  // Match ## numbered or unnumbered headings
  const regex = /^##\s+(?:\d+\.\s*)?(.+)$/gm;
  let matches = [...text.matchAll(regex)];

  if (matches.length === 0) {
    // No sections found, treat as single block
    sections['Full Proposal'] = text;
    return sections;
  }

  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
    sections[name] = text.substring(start, end).trim();
  }

  return sections;
}

function renderSections(sections) {
  const container = document.getElementById('proposalSections');
  container.innerHTML = '';

  for (const [name, content] of Object.entries(sections)) {
    const wc = countWords(content);
    const section = document.createElement('div');
    section.className = 'section-editor';
    section.innerHTML = `
      <div class="section-editor-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
        <h3>${escapeHtml(name)}</h3>
        <span class="word-count">${wc} words</span>
      </div>
      <div class="section-editor-content">
        <textarea data-section="${escapeHtml(name)}">${escapeHtml(content)}</textarea>
      </div>
    `;
    container.appendChild(section);

    // Word count update
    const textarea = section.querySelector('textarea');
    const wcSpan = section.querySelector('.word-count');
    textarea.addEventListener('input', debounce(() => {
      wcSpan.textContent = `${countWords(textarea.value)} words`;
      proposalState.sections[name] = textarea.value;
    }));
  }
}

function switchToForm() {
  document.querySelectorAll('#proposalTabs .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#proposalTabs .tab')[0].classList.add('active');
  document.getElementById('tabForm').classList.remove('hidden');
  document.getElementById('tabOutput').classList.add('hidden');
}

function clearForm() {
  if (!confirm('Clear all form fields?')) return;
  document.getElementById('proposalForm').reset();
  proposalState = { id: null, sections: {}, formData: {}, funderData: null };
}

async function handleSaveDraft() {
  const formData = getFormData();
  await saveProposal(formData, 'draft');
}

async function handleSaveProposal(status = 'in-progress') {
  // Collect sections from editors
  const sections = {};
  document.querySelectorAll('#proposalSections textarea[data-section]').forEach(ta => {
    sections[ta.dataset.section] = ta.value;
  });

  const formData = getFormData();
  await saveProposal({ ...formData, sections }, status);
}

async function saveProposal(data, status) {
  const payload = {
    ...data,
    status,
    sections: data.sections || proposalState.sections
  };

  try {
    if (proposalState.id) {
      await api(`/proposals/${proposalState.id}`, { method: 'PUT', body: payload });
      showToast('Proposal updated', 'success');
    } else {
      const result = await api('/proposals', { method: 'POST', body: payload });
      proposalState.id = result.id;
      showToast('Proposal saved', 'success');
      // Update URL without triggering navigation
      history.replaceState(null, '', `#/edit-proposal?id=${result.id}`);
    }
  } catch (e) {
    showToast('Failed to save: ' + e.message, 'error');
  }
}

async function handleExportPdf() {
  const sections = {};
  document.querySelectorAll('#proposalSections textarea[data-section]').forEach(ta => {
    sections[ta.dataset.section] = ta.value;
  });

  const formData = getFormData();

  try {
    const res = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposal: {
          title: formData.title,
          piName: formData.piName,
          piInstitution: formData.piInstitution,
          funder: formData.funder,
          scheme: formData.scheme,
          amount: formData.amount,
          duration: formData.duration,
          sections
        }
      })
    });

    const html = await res.text();
    // Open in new window for printing
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    showToast('PDF opened in new tab — use Print to save as PDF', 'info');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
}
