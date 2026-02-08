'use strict';

const ComplianceModule = {
  init() {
    this.bindEvents();
    this.loadFunders();
  },

  bindEvents() {
    const funderSelect = document.getElementById('compliance-funder');
    if (funderSelect) funderSelect.addEventListener('change', (e) => this.loadSchemes(e.target.value));

    const checkBtn = document.getElementById('compliance-check-btn');
    if (checkBtn) checkBtn.addEventListener('click', () => this.runCheck());
  },

  async loadFunders() {
    try {
      const res = await fetch('/api/funders');
      const funders = await res.json();
      const select = document.getElementById('compliance-funder');
      if (select) {
        select.innerHTML = '<option value="">Select funder...</option>' +
          funders.map(f => `<option value="${f.id}">${f.parent ? f.parent + ' - ' : ''}${f.name}</option>`).join('');
      }
    } catch (e) {}
  },

  async loadSchemes(funderId) {
    if (!funderId) return;
    try {
      const res = await fetch(`/api/funders/${funderId}`);
      const funder = await res.json();
      const select = document.getElementById('compliance-scheme');
      if (select && funder.schemes) {
        select.innerHTML = '<option value="">Select scheme...</option>' +
          funder.schemes.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
        select.style.display = 'block';
      }
    } catch (e) {}
  },

  async runCheck() {
    const funderId = document.getElementById('compliance-funder')?.value;
    const schemeIdx = document.getElementById('compliance-scheme')?.value;
    const text = document.getElementById('compliance-text')?.value;
    const amount = parseFloat(document.getElementById('compliance-amount')?.value) || 0;
    const duration = parseInt(document.getElementById('compliance-duration')?.value) || 0;

    if (!funderId) {
      window.app?.showToast?.('Select a funder first', 'warning');
      return;
    }

    const resultsDiv = document.getElementById('compliance-results');
    if (resultsDiv) resultsDiv.innerHTML = '<div class="loading-spinner"></div>';

    try {
      const res = await fetch('/api/compliance/check', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ funderId, schemeIndex: parseInt(schemeIdx) || 0, text, amount, duration }),
      });
      const data = await res.json();
      this.renderResults(data.checks || []);
    } catch (e) {
      if (resultsDiv) resultsDiv.innerHTML = '<p class="error">Compliance check failed</p>';
    }
  },

  renderResults(checks) {
    const container = document.getElementById('compliance-results');
    if (!container) return;

    const icons = { pass: '✅', warning: '⚠️', fail: '❌' };
    const passCount = checks.filter(c => c.status === 'pass').length;
    const warnCount = checks.filter(c => c.status === 'warning').length;
    const failCount = checks.filter(c => c.status === 'fail').length;

    let html = `
      <div class="compliance-summary">
        <div class="compliance-stat pass"><span class="count">${passCount}</span> Passed</div>
        <div class="compliance-stat warning"><span class="count">${warnCount}</span> Warnings</div>
        <div class="compliance-stat fail"><span class="count">${failCount}</span> Failed</div>
      </div>
      <div class="compliance-checks">
    `;

    for (const check of checks) {
      html += `
        <div class="compliance-check ${check.status}">
          <span class="compliance-icon">${icons[check.status]}</span>
          <div class="compliance-detail">
            <strong>${check.name}</strong>
            <p>${check.message}</p>
            ${check.advice ? `<p class="compliance-advice">💡 ${check.advice}</p>` : ''}
          </div>
        </div>
      `;
    }

    html += '</div>';
    container.innerHTML = html;
  },
};

window.ComplianceModule = ComplianceModule;
