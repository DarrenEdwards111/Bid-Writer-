/**
 * PDF Export via Print-friendly HTML
 * Generates a standalone HTML page with @media print CSS
 * that can be printed to PDF from the browser.
 */

function generatePrintHTML(proposal) {
  const {
    title = 'Untitled Proposal',
    piName = '',
    piInstitution = '',
    funder = '',
    scheme = '',
    amount = '',
    duration = '',
    sections = {},
    budget = null,
    ganttHtml = '',
    references = ''
  } = proposal;

  const now = new Date().toLocaleDateString('en-GB', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // Convert markdown-ish content to basic HTML
  function mdToHtml(text) {
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
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  // Build sections HTML
  let sectionsHtml = '';
  const sectionOrder = [
    'Case for Support',
    'Background and Literature Context',
    'Research Questions and Objectives',
    'Methodology and Research Design',
    'Work Plan and Timeline',
    'Expected Outcomes and Deliverables',
    'Ethical Considerations',
    'Data Management Plan',
    'Pathways to Impact',
    'References'
  ];

  let sectionNum = 1;
  for (const name of sectionOrder) {
    const content = sections[name];
    if (content) {
      sectionsHtml += `
        <div class="section">
          <h2>${sectionNum}. ${name}</h2>
          <div class="section-content">${mdToHtml(content)}</div>
        </div>`;
      sectionNum++;
    }
  }

  // Any extra sections not in the standard order
  for (const [name, content] of Object.entries(sections)) {
    if (!sectionOrder.includes(name) && content) {
      sectionsHtml += `
        <div class="section">
          <h2>${sectionNum}. ${name}</h2>
          <div class="section-content">${mdToHtml(content)}</div>
        </div>`;
      sectionNum++;
    }
  }

  // Budget table
  let budgetHtml = '';
  if (budget) {
    budgetHtml = `
      <div class="section page-break">
        <h2>Budget Summary</h2>
        <table class="budget-table">
          <thead>
            <tr><th>Category</th><th>Amount (£)</th></tr>
          </thead>
          <tbody>
            ${Object.entries(budget.categories || {}).map(([cat, data]) => `
              <tr><td>${cat.charAt(0).toUpperCase() + cat.slice(1)}</td><td>£${(data.total || 0).toLocaleString()}</td></tr>
            `).join('')}
            <tr class="total-row"><td><strong>Direct Costs</strong></td><td><strong>£${(budget.summary?.directCosts || 0).toLocaleString()}</strong></td></tr>
            <tr><td>Indirect Costs (${budget.summary?.overheadRate || 0}%)</td><td>£${(budget.summary?.indirectCosts || 0).toLocaleString()}</td></tr>
            <tr class="total-row"><td><strong>Full Economic Cost</strong></td><td><strong>£${(budget.summary?.fullEconomicCost || 0).toLocaleString()}</strong></td></tr>
            <tr><td>Funder Contribution (${budget.summary?.funderRate || 80}%)</td><td>£${(budget.summary?.funderContribution || 0).toLocaleString()}</td></tr>
            <tr><td>Institution Contribution</td><td>£${(budget.summary?.institutionContribution || 0).toLocaleString()}</td></tr>
          </tbody>
        </table>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page {
      size: A4;
      margin: 2.5cm 2cm;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #000;
      background: #fff;
    }
    .title-page {
      text-align: center;
      padding-top: 6cm;
      page-break-after: always;
    }
    .title-page h1 {
      font-size: 24pt;
      margin-bottom: 2cm;
      line-height: 1.3;
    }
    .title-page .meta {
      font-size: 14pt;
      line-height: 2;
    }
    .toc {
      page-break-after: always;
    }
    .toc h2 { margin-bottom: 1cm; }
    .toc ul {
      list-style: none;
      padding: 0;
    }
    .toc li {
      padding: 0.3cm 0;
      border-bottom: 1px dotted #ccc;
    }
    .section {
      margin-bottom: 1cm;
    }
    .section h2 {
      font-size: 14pt;
      margin-bottom: 0.5cm;
      color: #1a1a2e;
    }
    .section h3 {
      font-size: 12pt;
      margin-top: 0.5cm;
      margin-bottom: 0.3cm;
    }
    .section p {
      margin-bottom: 0.4cm;
      text-align: justify;
    }
    .section ul {
      margin-left: 1cm;
      margin-bottom: 0.4cm;
    }
    .budget-table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.5cm 0;
    }
    .budget-table th, .budget-table td {
      border: 1px solid #333;
      padding: 0.3cm 0.5cm;
      text-align: left;
    }
    .budget-table th {
      background: #f0f0f0;
    }
    .total-row {
      background: #f5f5f5;
    }
    .page-break {
      page-break-before: always;
    }
    @media screen {
      body { max-width: 21cm; margin: 2cm auto; padding: 2cm; }
      .print-btn {
        position: fixed;
        top: 1cm;
        right: 1cm;
        padding: 0.5cm 1cm;
        background: #4361ee;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14pt;
        z-index: 1000;
      }
      .print-btn:hover { background: #3451de; }
    }
    @media print {
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>

  <div class="title-page">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      ${piName ? `<div><strong>Principal Investigator:</strong> ${escapeHtml(piName)}</div>` : ''}
      ${piInstitution ? `<div>${escapeHtml(piInstitution)}</div>` : ''}
      ${funder ? `<div><strong>Funder:</strong> ${escapeHtml(funder)}${scheme ? ` — ${escapeHtml(scheme)}` : ''}</div>` : ''}
      ${amount ? `<div><strong>Requested:</strong> £${escapeHtml(String(amount))}</div>` : ''}
      ${duration ? `<div><strong>Duration:</strong> ${escapeHtml(String(duration))} months</div>` : ''}
      <div style="margin-top:2cm">${now}</div>
    </div>
  </div>

  ${sectionsHtml}
  ${budgetHtml}
  ${ganttHtml ? `<div class="section page-break"><h2>Work Plan (Gantt Chart)</h2>${ganttHtml}</div>` : ''}
</body>
</html>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { generatePrintHTML };
