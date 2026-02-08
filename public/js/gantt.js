'use strict';

/**
 * BidWriter — Gantt Chart Builder
 */

const GanttModule = {
  workPackages: [],
  projectDuration: 36,
  nextId: 1,
  colors: ['#4361ee', '#f72585', '#4cc9f0', '#7209b7', '#3a0ca3', '#f77f00', '#06d6a0', '#118ab2'],

  init() {
    this.bindEvents();
    this.addWorkPackage(); // Start with one WP
  },

  bindEvents() {
    const addBtn = document.getElementById('gantt-add-wp');
    if (addBtn) addBtn.addEventListener('click', () => this.addWorkPackage());

    const durInput = document.getElementById('gantt-duration');
    if (durInput) {
      durInput.value = this.projectDuration;
      durInput.addEventListener('change', (e) => {
        this.projectDuration = parseInt(e.target.value) || 36;
        this.render();
      });
    }

    const genBtn = document.getElementById('gantt-generate');
    if (genBtn) genBtn.addEventListener('click', () => this.generateFromProposal());

    const exportBtn = document.getElementById('gantt-export');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportImage());
  },

  addWorkPackage(data = {}) {
    const wp = {
      id: this.nextId++,
      name: data.name || `Work Package ${this.workPackages.length + 1}`,
      start: data.start || 1,
      duration: data.duration || 6,
      lead: data.lead || '',
      milestones: data.milestones || '',
      deliverables: data.deliverables || '',
      color: this.colors[(this.workPackages.length) % this.colors.length],
    };
    this.workPackages.push(wp);
    this.renderForm();
    this.render();
  },

  removeWorkPackage(id) {
    this.workPackages = this.workPackages.filter(wp => wp.id !== id);
    this.renderForm();
    this.render();
  },

  updateWorkPackage(id, field, value) {
    const wp = this.workPackages.find(w => w.id === id);
    if (wp) {
      if (field === 'start' || field === 'duration') {
        wp[field] = parseInt(value) || 1;
      } else {
        wp[field] = value;
      }
      this.render();
    }
  },

  renderForm() {
    const container = document.getElementById('gantt-wp-list');
    if (!container) return;

    container.innerHTML = this.workPackages.map(wp => `
      <div class="gantt-wp-item card" style="border-left: 4px solid ${wp.color}">
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label>Name</label>
            <input type="text" value="${wp.name}" onchange="GanttModule.updateWorkPackage(${wp.id},'name',this.value)">
          </div>
          <div class="form-group" style="flex:1">
            <label>Start (month)</label>
            <input type="number" min="1" max="${this.projectDuration}" value="${wp.start}" onchange="GanttModule.updateWorkPackage(${wp.id},'start',this.value)">
          </div>
          <div class="form-group" style="flex:1">
            <label>Duration (months)</label>
            <input type="number" min="1" max="${this.projectDuration}" value="${wp.duration}" onchange="GanttModule.updateWorkPackage(${wp.id},'duration',this.value)">
          </div>
          <div class="form-group" style="flex:1">
            <label>Lead</label>
            <input type="text" value="${wp.lead}" placeholder="PI name" onchange="GanttModule.updateWorkPackage(${wp.id},'lead',this.value)">
          </div>
          <button class="btn btn-danger btn-sm" onclick="GanttModule.removeWorkPackage(${wp.id})" title="Remove">✕</button>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>Milestones</label>
            <input type="text" value="${wp.milestones}" placeholder="e.g. M3: Data collected, M6: Analysis complete" onchange="GanttModule.updateWorkPackage(${wp.id},'milestones',this.value)">
          </div>
          <div class="form-group" style="flex:1">
            <label>Deliverables</label>
            <input type="text" value="${wp.deliverables}" placeholder="e.g. D1.1: Report, D1.2: Dataset" onchange="GanttModule.updateWorkPackage(${wp.id},'deliverables',this.value)">
          </div>
        </div>
      </div>
    `).join('');
  },

  render() {
    const chart = document.getElementById('gantt-chart');
    if (!chart) return;

    const months = Array.from({length: this.projectDuration}, (_, i) => i + 1);
    const colWidth = Math.max(30, Math.min(50, 900 / this.projectDuration));

    let html = `
      <div class="gantt-container" style="overflow-x:auto">
        <table class="gantt-table">
          <thead>
            <tr>
              <th class="gantt-label-col">Work Package</th>
              ${months.map(m => `<th class="gantt-month" style="min-width:${colWidth}px">${m}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    for (const wp of this.workPackages) {
      html += `<tr>`;
      html += `<td class="gantt-label"><span class="gantt-dot" style="background:${wp.color}"></span>${wp.name}</td>`;
      for (let m = 1; m <= this.projectDuration; m++) {
        const active = m >= wp.start && m < wp.start + wp.duration;
        const isFirst = m === wp.start;
        const isLast = m === wp.start + wp.duration - 1;
        const cls = active ? 'gantt-bar' : '';
        const radius = isFirst && isLast ? '4px' : isFirst ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : '0';
        const bg = active ? wp.color : 'transparent';
        html += `<td class="${cls}" style="background:${bg};border-radius:${radius}"></td>`;
      }
      html += `</tr>`;
    }

    html += `</tbody></table></div>`;

    // Legend
    if (this.workPackages.some(wp => wp.milestones || wp.deliverables)) {
      html += `<div class="gantt-legend"><h4>Milestones & Deliverables</h4><ul>`;
      for (const wp of this.workPackages) {
        if (wp.milestones) html += `<li><span class="gantt-dot" style="background:${wp.color}"></span><strong>${wp.name}:</strong> ${wp.milestones}</li>`;
        if (wp.deliverables) html += `<li><span class="gantt-dot" style="background:${wp.color}"></span><strong>${wp.name}:</strong> ${wp.deliverables}</li>`;
      }
      html += `</ul></div>`;
    }

    chart.innerHTML = html;
  },

  async generateFromProposal() {
    const objectives = document.getElementById('gantt-objectives');
    if (!objectives || !objectives.value.trim()) {
      window.app?.showToast?.('Enter objectives to auto-generate work packages', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/generate/proposal', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          type: 'gantt',
          objectives: objectives.value,
          duration: this.projectDuration,
        }),
      });
      const data = await res.json();
      if (data.workPackages) {
        this.workPackages = [];
        this.nextId = 1;
        data.workPackages.forEach(wp => this.addWorkPackage(wp));
      }
    } catch (e) {
      window.app?.showToast?.('Failed to generate: ' + e.message, 'error');
    }
  },

  exportImage() {
    const chart = document.getElementById('gantt-chart');
    if (!chart) return;
    // Print-friendly export
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Gantt Chart</title><style>
      body{font-family:-apple-system,sans-serif;padding:20px}
      .gantt-table{border-collapse:collapse;width:100%}
      .gantt-table th,.gantt-table td{border:1px solid #ddd;padding:4px 6px;text-align:center;font-size:11px}
      .gantt-label-col{text-align:left;min-width:200px}
      .gantt-label{text-align:left;font-weight:500}
      .gantt-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
      .gantt-legend{margin-top:20px}
      .gantt-legend ul{list-style:none;padding:0}
      .gantt-legend li{margin:4px 0}
    </style></head><body>${chart.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  },
};

// Make globally accessible
window.GanttModule = GanttModule;
