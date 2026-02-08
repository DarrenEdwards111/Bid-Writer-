/**
 * Impact Statement Generator Module
 */

async function initImpactPage() {
  // Populate funder dropdown
  await populateFunderDropdown(document.getElementById('impactFunder'));

  // Tab switching
  document.querySelectorAll('#impactTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#impactTabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isForm = tab.dataset.tab === 'form';
      document.getElementById('impactTabForm').classList.toggle('hidden', !isForm);
      document.getElementById('impactTabOutput').classList.toggle('hidden', isForm);
    });
  });

  // Generate button
  document.getElementById('generateImpactBtn').addEventListener('click', handleGenerateImpact);

  // Back button
  document.getElementById('impactBackBtn').addEventListener('click', () => {
    document.querySelectorAll('#impactTabs .tab')[0].click();
  });

  // Copy button
  document.getElementById('impactCopyBtn').addEventListener('click', () => {
    const output = document.getElementById('impactOutput');
    navigator.clipboard.writeText(output.textContent).then(() => {
      showToast('Copied to clipboard', 'success');
    });
  });

  // Load from proposal
  document.getElementById('loadFromProposal').addEventListener('click', async (e) => {
    e.preventDefault();
    const overlay = document.getElementById('proposalSelectorOverlay');
    const list = document.getElementById('proposalSelectorList');
    
    try {
      const proposals = await api('/proposals');
      if (proposals.length === 0) {
        list.innerHTML = '<p class="text-muted">No saved proposals found.</p>';
      } else {
        list.innerHTML = proposals.map(p => `
          <div class="proposal-item" style="margin-bottom:8px;" onclick="selectProposalForImpact('${p.id}')">
            <div class="proposal-info">
              <div class="proposal-title">${p.title}</div>
              <div class="proposal-meta"><span>${p.funder || 'No funder'}</span></div>
            </div>
          </div>
        `).join('');
      }
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';
    } catch (e) {
      showToast('Failed to load proposals', 'error');
    }
  });
}

async function selectProposalForImpact(id) {
  try {
    const proposal = await api(`/proposals/${id}`);
    // Build summary from sections
    let summary = '';
    if (proposal.researchQuestion) summary += proposal.researchQuestion + '\n\n';
    if (proposal.sections) {
      for (const [name, content] of Object.entries(proposal.sections)) {
        if (name.toLowerCase().includes('case for support') || 
            name.toLowerCase().includes('research question') ||
            name.toLowerCase().includes('methodology')) {
          summary += content.substring(0, 500) + '\n\n';
        }
      }
    }
    if (!summary && proposal.methodology) summary = proposal.methodology;
    
    document.getElementById('impactResearch').value = summary.trim() || proposal.title;
    document.getElementById('proposalSelectorOverlay').classList.add('hidden');
    showToast('Proposal loaded', 'success');
  } catch (e) {
    showToast('Failed to load proposal', 'error');
  }
}

async function handleGenerateImpact() {
  const research = document.getElementById('impactResearch').value.trim();
  if (!research) {
    showToast('Please provide a research summary', 'warning');
    return;
  }

  const beneficiaries = Array.from(document.querySelectorAll('input[name="beneficiaries"]:checked'))
    .map(cb => cb.value);
  const impactTypes = Array.from(document.querySelectorAll('input[name="impactTypes"]:checked'))
    .map(cb => cb.value);
  const timeframes = Array.from(document.querySelectorAll('input[name="timeframes"]:checked'))
    .map(cb => cb.value);

  const funderId = document.getElementById('impactFunder').value;
  let funderData = null;
  if (funderId) {
    funderData = await loadFunderDetails(funderId);
  }

  // Switch to output tab
  document.querySelectorAll('#impactTabs .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#impactTabs .tab')[1].classList.add('active');
  document.getElementById('impactTabForm').classList.add('hidden');
  document.getElementById('impactTabOutput').classList.remove('hidden');

  const output = document.getElementById('impactOutput');
  const btn = document.getElementById('generateImpactBtn');
  btn.disabled = true;
  output.innerHTML = '<div class="loading-inline"><div class="spinner spinner-sm"></div><span>Generating impact statement...</span></div>';

  let fullText = '';

  await streamAI('/generate/impact',
    {
      formData: {
        researchSummary: research,
        beneficiaries,
        impactTypes,
        timeframes
      },
      funderData
    },
    (chunk) => {
      fullText += chunk;
      output.textContent = fullText;
    },
    () => {
      btn.disabled = false;
      output.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${markdownToHtml(fullText)}</div>`;
      document.getElementById('impactOutputStatus').textContent = `Generated (${countWords(fullText)} words)`;
      showToast('Impact statement generated!', 'success');
    },
    (err) => {
      btn.disabled = false;
      output.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
      showToast(err.message, 'error');
    }
  );
}
