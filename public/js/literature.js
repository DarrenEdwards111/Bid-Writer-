'use strict';

const LiteratureModule = {
  results: [],
  selected: [],

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const searchBtn = document.getElementById('lit-search-btn');
    if (searchBtn) searchBtn.addEventListener('click', () => this.search());

    const searchInput = document.getElementById('lit-search-input');
    if (searchInput) searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.search();
    });

    const generateBtn = document.getElementById('lit-generate');
    if (generateBtn) generateBtn.addEventListener('click', () => this.generateReview());

    const exportBtn = document.getElementById('lit-export');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportReferences());
  },

  async search() {
    const input = document.getElementById('lit-search-input');
    const query = input?.value?.trim();
    if (!query) return;

    const resultsDiv = document.getElementById('lit-results');
    if (resultsDiv) resultsDiv.innerHTML = '<div class="loading-spinner"></div>';

    try {
      const res = await fetch(`/api/search/papers?q=${encodeURIComponent(query)}&limit=20`);
      const data = await res.json();
      this.results = data.papers || [];
      this.renderResults();
    } catch (e) {
      if (resultsDiv) resultsDiv.innerHTML = '<p class="error">Search failed. Try again.</p>';
    }
  },

  renderResults() {
    const container = document.getElementById('lit-results');
    if (!container) return;

    if (this.results.length === 0) {
      container.innerHTML = '<p>No papers found. Try different keywords.</p>';
      return;
    }

    container.innerHTML = this.results.map((p, i) => {
      const isSelected = this.selected.some(s => s.paperId === p.paperId);
      const authors = (p.authors || []).slice(0, 3).map(a => a.name).join(', ');
      const moreAuthors = (p.authors || []).length > 3 ? ' et al.' : '';
      return `
        <div class="lit-paper card ${isSelected ? 'selected' : ''}">
          <div class="lit-paper-header">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="LiteratureModule.togglePaper(${i})">
            <h4>${p.title || 'Untitled'}</h4>
          </div>
          <div class="lit-paper-meta">
            <span class="lit-authors">${authors}${moreAuthors}</span>
            <span class="lit-year">${p.year || 'n.d.'}</span>
            <span class="lit-citations">📚 ${p.citationCount || 0} citations</span>
          </div>
          ${p.abstract ? `<p class="lit-abstract">${p.abstract.slice(0, 250)}${p.abstract.length > 250 ? '...' : ''}</p>` : ''}
          ${p.url ? `<a href="${p.url}" target="_blank" class="lit-link">View paper →</a>` : ''}
        </div>
      `;
    }).join('');

    this.renderSelected();
  },

  togglePaper(index) {
    const paper = this.results[index];
    if (!paper) return;

    const existingIdx = this.selected.findIndex(s => s.paperId === paper.paperId);
    if (existingIdx >= 0) {
      this.selected.splice(existingIdx, 1);
    } else {
      this.selected.push(paper);
    }
    this.renderResults();
  },

  renderSelected() {
    const container = document.getElementById('lit-selected');
    if (!container) return;

    if (this.selected.length === 0) {
      container.innerHTML = '<p>No papers selected. Search and tick papers to include.</p>';
      return;
    }

    container.innerHTML = `
      <h4>${this.selected.length} paper(s) selected</h4>
      <ul class="lit-selected-list">
        ${this.selected.map((p, i) => {
          const authors = (p.authors || []).slice(0, 3).map(a => a.name).join(', ');
          return `<li>
            ${authors} (${p.year || 'n.d.'}). <em>${p.title}</em>
            <button class="btn btn-sm btn-danger" onclick="LiteratureModule.removeSelected(${i})">✕</button>
          </li>`;
        }).join('')}
      </ul>
    `;
  },

  removeSelected(index) {
    this.selected.splice(index, 1);
    this.renderResults();
  },

  async generateReview() {
    if (this.selected.length === 0) {
      window.app?.showToast?.('Select papers first', 'warning');
      return;
    }

    const output = document.getElementById('lit-review-output');
    if (output) output.innerHTML = '<div class="loading-spinner"></div><p>Generating literature review...</p>';

    try {
      const res = await fetch('/api/generate/literature', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ papers: this.selected }),
      });
      const data = await res.json();
      if (output) output.innerHTML = `<div class="lit-review-text">${data.review || data.text || 'No review generated'}</div>`;
    } catch (e) {
      if (output) output.innerHTML = '<p class="error">Failed to generate review</p>';
    }
  },

  exportReferences() {
    if (this.selected.length === 0) return;

    // Harvard style references
    const refs = this.selected.map(p => {
      const authors = (p.authors || []).map(a => a.name).join(', ');
      return `${authors} (${p.year || 'n.d.'}) '${p.title}', ${p.venue || p.journal || ''}.`;
    });

    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>References</title><style>body{font-family:serif;padding:40px;line-height:1.8}h1{font-size:18px}p{text-indent:-2em;padding-left:2em;margin:8px 0}</style></head><body><h1>References</h1>${refs.map(r => `<p>${r}</p>`).join('')}</body></html>`);
    win.document.close();
    win.print();
  },
};

window.LiteratureModule = LiteratureModule;
