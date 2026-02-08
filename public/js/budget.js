'use strict';

const BudgetModule = {
  staff: [],
  travel: [],
  equipment: [],
  consumables: [],
  other: [],
  subcontracting: [],
  overheadRate: 25,
  fecRate: 80,
  costModel: 'fEC',
  nextId: 1,

  init() {
    this.bindEvents();
    this.addItem('staff');
  },

  bindEvents() {
    ['staff','travel','equipment','consumables','other','subcontracting'].forEach(cat => {
      const btn = document.getElementById(`budget-add-${cat}`);
      if (btn) btn.addEventListener('click', () => this.addItem(cat));
    });

    const modelSelect = document.getElementById('budget-cost-model');
    if (modelSelect) modelSelect.addEventListener('change', (e) => {
      this.costModel = e.target.value;
      this.updateTotals();
    });

    const fecInput = document.getElementById('budget-fec-rate');
    if (fecInput) fecInput.addEventListener('change', (e) => {
      this.fecRate = parseFloat(e.target.value) || 80;
      this.updateTotals();
    });

    const overheadInput = document.getElementById('budget-overhead-rate');
    if (overheadInput) overheadInput.addEventListener('change', (e) => {
      this.overheadRate = parseFloat(e.target.value) || 25;
      this.updateTotals();
    });

    const justifyBtn = document.getElementById('budget-justify');
    if (justifyBtn) justifyBtn.addEventListener('click', () => this.generateJustification());

    const exportBtn = document.getElementById('budget-export');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportTable());
  },

  addItem(category, data = {}) {
    const id = this.nextId++;
    const defaults = {
      staff: { id, role: '', grade: '', fte: 100, months: 12, salary: 35000, oncosts: 25 },
      travel: { id, destination: '', purpose: '', costPerTrip: 0, trips: 1 },
      equipment: { id, item: '', cost: 0, justification: '' },
      consumables: { id, item: '', cost: 0 },
      other: { id, description: '', cost: 0 },
      subcontracting: { id, partner: '', description: '', cost: 0 },
    };
    this[category].push({ ...defaults[category], ...data });
    this.renderCategory(category);
    this.updateTotals();
  },

  removeItem(category, id) {
    this[category] = this[category].filter(item => item.id !== id);
    this.renderCategory(category);
    this.updateTotals();
  },

  updateItem(category, id, field, value) {
    const item = this[category].find(i => i.id === id);
    if (item) {
      item[field] = ['fte','months','salary','oncosts','costPerTrip','trips','cost'].includes(field)
        ? parseFloat(value) || 0 : value;
      this.updateTotals();
    }
  },

  calcStaffCost(item) {
    const annual = item.salary * (1 + item.oncosts / 100);
    return annual * (item.fte / 100) * (item.months / 12);
  },

  calcCategoryTotal(category) {
    switch (category) {
      case 'staff': return this.staff.reduce((sum, i) => sum + this.calcStaffCost(i), 0);
      case 'travel': return this.travel.reduce((sum, i) => sum + i.costPerTrip * i.trips, 0);
      default: return this[category].reduce((sum, i) => sum + (i.cost || 0), 0);
    }
  },

  updateTotals() {
    const categories = ['staff','travel','equipment','consumables','other','subcontracting'];
    let directTotal = 0;

    categories.forEach(cat => {
      const total = this.calcCategoryTotal(cat);
      directTotal += total;
      const el = document.getElementById(`budget-total-${cat}`);
      if (el) el.textContent = `£${total.toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    });

    const indirects = directTotal * (this.overheadRate / 100);
    const fullEconomicCost = directTotal + indirects;
    const funderContribution = this.costModel === 'fEC'
      ? fullEconomicCost * (this.fecRate / 100)
      : fullEconomicCost;
    const institutionContribution = fullEconomicCost - funderContribution;

    const fmt = v => `£${v.toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('budget-direct-total', fmt(directTotal));
    setEl('budget-indirect-total', fmt(indirects));
    setEl('budget-fec-total', fmt(fullEconomicCost));
    setEl('budget-funder-total', fmt(funderContribution));
    setEl('budget-institution-total', fmt(institutionContribution));
    setEl('budget-grand-total', fmt(funderContribution));
  },

  renderCategory(category) {
    const container = document.getElementById(`budget-${category}-list`);
    if (!container) return;

    const m = (id, f) => `BudgetModule.updateItem('${category}',${id},'${f}',this.value)`;
    const r = (id) => `BudgetModule.removeItem('${category}',${id})`;

    const rows = {
      staff: (i) => `
        <div class="budget-row">
          <input type="text" placeholder="Role" value="${i.role}" onchange="${m(i.id,'role')}">
          <input type="text" placeholder="Grade" value="${i.grade}" onchange="${m(i.id,'grade')}" style="width:80px">
          <input type="number" placeholder="FTE%" value="${i.fte}" onchange="${m(i.id,'fte')}" style="width:70px" min="0" max="100">
          <input type="number" placeholder="Months" value="${i.months}" onchange="${m(i.id,'months')}" style="width:70px">
          <input type="number" placeholder="Salary £" value="${i.salary}" onchange="${m(i.id,'salary')}" style="width:100px">
          <span class="budget-item-total">£${this.calcStaffCost(i).toLocaleString('en-GB',{maximumFractionDigits:0})}</span>
          <button class="btn btn-danger btn-sm" onclick="${r(i.id)}">✕</button>
        </div>`,
      travel: (i) => `
        <div class="budget-row">
          <input type="text" placeholder="Destination" value="${i.destination}" onchange="${m(i.id,'destination')}">
          <input type="text" placeholder="Purpose" value="${i.purpose}" onchange="${m(i.id,'purpose')}">
          <input type="number" placeholder="£/trip" value="${i.costPerTrip}" onchange="${m(i.id,'costPerTrip')}" style="width:90px">
          <input type="number" placeholder="Trips" value="${i.trips}" onchange="${m(i.id,'trips')}" style="width:60px">
          <span class="budget-item-total">£${(i.costPerTrip*i.trips).toLocaleString('en-GB')}</span>
          <button class="btn btn-danger btn-sm" onclick="${r(i.id)}">✕</button>
        </div>`,
      equipment: (i) => `
        <div class="budget-row">
          <input type="text" placeholder="Item" value="${i.item}" onchange="${m(i.id,'item')}">
          <input type="number" placeholder="Cost £" value="${i.cost}" onchange="${m(i.id,'cost')}" style="width:100px">
          <input type="text" placeholder="Justification" value="${i.justification}" onchange="${m(i.id,'justification')}">
          <button class="btn btn-danger btn-sm" onclick="${r(i.id)}">✕</button>
        </div>`,
      consumables: (i) => `
        <div class="budget-row">
          <input type="text" placeholder="Item" value="${i.item}" onchange="${m(i.id,'item')}">
          <input type="number" placeholder="Cost £" value="${i.cost}" onchange="${m(i.id,'cost')}" style="width:100px">
          <button class="btn btn-danger btn-sm" onclick="${r(i.id)}">✕</button>
        </div>`,
      other: (i) => `
        <div class="budget-row">
          <input type="text" placeholder="Description" value="${i.description}" onchange="${m(i.id,'description')}">
          <input type="number" placeholder="Cost £" value="${i.cost}" onchange="${m(i.id,'cost')}" style="width:100px">
          <button class="btn btn-danger btn-sm" onclick="${r(i.id)}">✕</button>
        </div>`,
      subcontracting: (i) => `
        <div class="budget-row">
          <input type="text" placeholder="Partner" value="${i.partner}" onchange="${m(i.id,'partner')}">
          <input type="text" placeholder="Description" value="${i.description}" onchange="${m(i.id,'description')}">
          <input type="number" placeholder="Cost £" value="${i.cost}" onchange="${m(i.id,'cost')}" style="width:100px">
          <button class="btn btn-danger btn-sm" onclick="${r(i.id)}">✕</button>
        </div>`,
    };

    container.innerHTML = this[category].map(rows[category]).join('');
  },

  async generateJustification() {
    const data = {
      staff: this.staff, travel: this.travel, equipment: this.equipment,
      consumables: this.consumables, other: this.other, subcontracting: this.subcontracting,
      totals: {
        direct: this.calcCategoryTotal('staff') + this.calcCategoryTotal('travel') + this.calcCategoryTotal('equipment') + this.calcCategoryTotal('consumables') + this.calcCategoryTotal('other') + this.calcCategoryTotal('subcontracting'),
      }
    };
    try {
      const res = await fetch('/api/generate/budget-justification', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data),
      });
      const result = await res.json();
      const output = document.getElementById('budget-justification-text');
      if (output) output.innerHTML = result.text || result.justification || 'No justification generated';
    } catch (e) {
      window.app?.showToast?.('Failed to generate justification', 'error');
    }
  },

  exportTable() {
    const win = window.open('', '_blank');
    const fmt = v => `£${v.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    let html = `<html><head><title>Budget</title><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f4f4f4}.total{font-weight:bold}</style></head><body><h1>Budget Summary</h1><table><tr><th>Category</th><th>Amount</th></tr>`;
    ['staff','travel','equipment','consumables','other','subcontracting'].forEach(cat => {
      html += `<tr><td>${cat.charAt(0).toUpperCase()+cat.slice(1)}</td><td>${fmt(this.calcCategoryTotal(cat))}</td></tr>`;
    });
    html += `<tr class="total"><td>Grand Total (funder contribution)</td><td>${document.getElementById('budget-grand-total')?.textContent || ''}</td></tr></table></body></html>`;
    win.document.write(html);
    win.document.close();
    win.print();
  },
};

window.BudgetModule = BudgetModule;
