/**
 * Mikoshi BidWriter — Academic Grant Proposal Writing Platform
 * Express server with multi-provider AI, proposal management,
 * version history, compliance checking, and paper search.
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const {
  getProviderConfig,
  generateProposal, generateImpact, polishText,
  generateBudgetJustification, generateLiteratureReview,
  generateMethodology, generateEthics,
  generateAbstract, generatePlainSummary,
  simulateReviewer, findResearchGaps, generateReviewerResponse
} = require('./lib/ai');
const { runComplianceChecks } = require('./lib/templates');
const { calculateBudget } = require('./lib/budget-calc');

const app = express();
const PORT = process.env.PORT || 3000;

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const FUNDERS_DIR = path.join(DATA_DIR, 'funders');
const PROPOSALS_DIR = path.join(__dirname, 'proposals');
const VERSIONS_DIR = path.join(__dirname, 'versions');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch (e) { /* exists */ }
}

// Helper: set up SSE response
function setupSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  return (chunk) => {
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
  };
}

function endSSE(res) {
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
}

function errorSSE(res, err) {
  if (res.headersSent) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  } else {
    res.status(500).json({ error: err.message });
  }
}

// ─── Proposal CRUD ──────────────────────────────────────────

app.get('/api/proposals', async (req, res) => {
  try {
    await ensureDir(PROPOSALS_DIR);
    const files = await fs.readdir(PROPOSALS_DIR);
    const proposals = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(await fs.readFile(path.join(PROPOSALS_DIR, file), 'utf8'));
        proposals.push({
          id: data.id,
          title: data.title || 'Untitled',
          funder: data.funder || '',
          scheme: data.scheme || '',
          status: data.status || 'draft',
          amount: data.amount || 0,
          updatedAt: data.updatedAt || data.createdAt,
          createdAt: data.createdAt
        });
      } catch (e) { /* skip corrupt */ }
    }
    proposals.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json(proposals);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list proposals' });
  }
});

app.post('/api/proposals', async (req, res) => {
  try {
    await ensureDir(PROPOSALS_DIR);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const proposal = { ...req.body, id, createdAt: now, updatedAt: now, status: req.body.status || 'draft' };
    await fs.writeFile(path.join(PROPOSALS_DIR, `${id}.json`), JSON.stringify(proposal, null, 2));
    res.status(201).json(proposal);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save proposal' });
  }
});

app.get('/api/proposals/:id', async (req, res) => {
  try {
    const data = JSON.parse(await fs.readFile(path.join(PROPOSALS_DIR, `${req.params.id}.json`), 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Proposal not found' });
  }
});

app.put('/api/proposals/:id', async (req, res) => {
  try {
    const filePath = path.join(PROPOSALS_DIR, `${req.params.id}.json`);
    const existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const updated = { ...existing, ...req.body, id: req.params.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2));
    res.json(updated);
  } catch (err) {
    res.status(404).json({ error: 'Proposal not found' });
  }
});

app.delete('/api/proposals/:id', async (req, res) => {
  try {
    await fs.unlink(path.join(PROPOSALS_DIR, `${req.params.id}.json`));
    // Also clean up versions
    const vDir = path.join(VERSIONS_DIR, req.params.id);
    try { await fs.rm(vDir, { recursive: true }); } catch (e) { /* no versions */ }
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: 'Proposal not found' });
  }
});

// Duplicate a proposal
app.post('/api/proposals/:id/duplicate', async (req, res) => {
  try {
    const data = JSON.parse(await fs.readFile(path.join(PROPOSALS_DIR, `${req.params.id}.json`), 'utf8'));
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    const dup = { ...data, id: newId, title: `${data.title || 'Untitled'} (Copy)`, createdAt: now, updatedAt: now, status: 'draft' };
    await fs.writeFile(path.join(PROPOSALS_DIR, `${newId}.json`), JSON.stringify(dup, null, 2));
    res.status(201).json(dup);
  } catch (err) {
    res.status(404).json({ error: 'Proposal not found' });
  }
});

// ─── Version History ────────────────────────────────────────

app.get('/api/proposals/:id/versions', async (req, res) => {
  try {
    const vDir = path.join(VERSIONS_DIR, req.params.id);
    await ensureDir(vDir);
    const files = await fs.readdir(vDir);
    const versions = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(await fs.readFile(path.join(vDir, file), 'utf8'));
        versions.push({ versionId: data.versionId, timestamp: data.timestamp, label: data.label || '' });
      } catch (e) { /* skip */ }
    }
    versions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(versions);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/proposals/:id/versions', async (req, res) => {
  try {
    const proposalData = JSON.parse(await fs.readFile(path.join(PROPOSALS_DIR, `${req.params.id}.json`), 'utf8'));
    const vDir = path.join(VERSIONS_DIR, req.params.id);
    await ensureDir(vDir);
    const versionId = crypto.randomUUID();
    const snapshot = { ...proposalData, versionId, timestamp: new Date().toISOString(), label: req.body.label || '' };
    await fs.writeFile(path.join(vDir, `${versionId}.json`), JSON.stringify(snapshot, null, 2));
    res.status(201).json({ versionId, timestamp: snapshot.timestamp, label: snapshot.label });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create version' });
  }
});

app.get('/api/proposals/:id/versions/:versionId', async (req, res) => {
  try {
    const data = JSON.parse(await fs.readFile(path.join(VERSIONS_DIR, req.params.id, `${req.params.versionId}.json`), 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Version not found' });
  }
});

// Restore a version
app.post('/api/proposals/:id/versions/:versionId/restore', async (req, res) => {
  try {
    const vData = JSON.parse(await fs.readFile(path.join(VERSIONS_DIR, req.params.id, `${req.params.versionId}.json`), 'utf8'));
    // Save current as a version first
    const currentData = JSON.parse(await fs.readFile(path.join(PROPOSALS_DIR, `${req.params.id}.json`), 'utf8'));
    const vDir = path.join(VERSIONS_DIR, req.params.id);
    await ensureDir(vDir);
    const autoVid = crypto.randomUUID();
    await fs.writeFile(path.join(vDir, `${autoVid}.json`), JSON.stringify({ ...currentData, versionId: autoVid, timestamp: new Date().toISOString(), label: 'Auto-save before restore' }, null, 2));

    // Restore
    const restored = { ...vData, id: req.params.id, updatedAt: new Date().toISOString() };
    delete restored.versionId;
    delete restored.timestamp;
    delete restored.label;
    await fs.writeFile(path.join(PROPOSALS_DIR, `${req.params.id}.json`), JSON.stringify(restored, null, 2));
    res.json(restored);
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

// ─── Funder Data ────────────────────────────────────────────

app.get('/api/funders', async (req, res) => {
  try {
    const files = await fs.readdir(FUNDERS_DIR);
    const funders = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(await fs.readFile(path.join(FUNDERS_DIR, file), 'utf8'));
        funders.push({ id: data.id, name: data.name, fullName: data.fullName, parent: data.parent || null, schemesCount: data.schemes ? data.schemes.length : 0, priorities: data.priorities || [] });
      } catch (e) { /* skip */ }
    }
    funders.sort((a, b) => a.name.localeCompare(b.name));
    res.json(funders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list funders' });
  }
});

app.get('/api/funders/:id', async (req, res) => {
  try {
    const data = JSON.parse(await fs.readFile(path.join(FUNDERS_DIR, `${req.params.id}.json`), 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Funder not found' });
  }
});

// ─── AI Generation Endpoints (all SSE) ─────────────────────

app.post('/api/generate/proposal', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { formData, funderData } = req.body;
    await generateProposal(formData, funderData, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

app.post('/api/generate/impact', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { formData, funderData } = req.body;
    await generateImpact(formData, funderData, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

app.post('/api/generate/polish', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { text, mode, funderData } = req.body;
    await polishText(text, mode, funderData, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

app.post('/api/generate/budget-justification', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { budgetData, projectContext } = req.body;
    await generateBudgetJustification(budgetData, projectContext, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

app.post('/api/generate/literature', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { papers, topic } = req.body;
    await generateLiteratureReview(papers, topic, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

app.post('/api/generate/methodology', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { formData, funderData } = req.body;
    await generateMethodology(formData, funderData, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

app.post('/api/generate/ethics', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { formData } = req.body;
    await generateEthics(formData, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

app.post('/api/generate/abstract', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { proposal } = req.body;
    await generateAbstract(proposal, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

app.post('/api/generate/plain-summary', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { proposal } = req.body;
    await generatePlainSummary(proposal, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

app.post('/api/generate/reviewer-simulation', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { proposal, funderData } = req.body;
    await simulateReviewer(proposal, funderData, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

app.post('/api/generate/research-gaps', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { text } = req.body;
    await findResearchGaps(text, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

app.post('/api/generate/reviewer-response', async (req, res) => {
  try {
    const onChunk = setupSSE(res);
    const providerOpts = getProviderConfig(req);
    const { reviewerComments, proposalContext } = req.body;
    await generateReviewerResponse(reviewerComments, proposalContext, onChunk, providerOpts);
    endSSE(res);
  } catch (err) { errorSSE(res, err); }
});

// ─── Compliance Check ───────────────────────────────────────

app.post('/api/compliance/check', async (req, res) => {
  try {
    const { proposalText, sections, funderId, schemeIndex, budget, duration } = req.body;
    const funderData = JSON.parse(await fs.readFile(path.join(FUNDERS_DIR, `${funderId}.json`), 'utf8'));
    const results = runComplianceChecks(proposalText, sections, funderData, schemeIndex, budget, duration);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Semantic Scholar Search ────────────────────────────────

app.get('/api/search/papers', async (req, res) => {
  try {
    const { query, offset = 0, limit = 10 } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}&fields=title,authors,year,citationCount,abstract,url,externalIds`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Semantic Scholar API error: ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PDF Export ─────────────────────────────────────────────

app.post('/api/export/pdf', (req, res) => {
  const { proposal } = req.body;
  const { generatePrintHTML } = require('./lib/pdf');
  const html = generatePrintHTML(proposal);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ─── Budget Calculation ─────────────────────────────────────

app.post('/api/budget/calculate', (req, res) => {
  try {
    const result = calculateBudget(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Export/Import JSON ─────────────────────────────────────

app.get('/api/proposals/:id/export', async (req, res) => {
  try {
    const data = JSON.parse(await fs.readFile(path.join(PROPOSALS_DIR, `${req.params.id}.json`), 'utf8'));
    res.setHeader('Content-Disposition', `attachment; filename="${(data.title || 'proposal').replace(/[^a-z0-9]/gi, '_')}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Proposal not found' });
  }
});

app.post('/api/proposals/import', async (req, res) => {
  try {
    await ensureDir(PROPOSALS_DIR);
    const data = req.body;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const imported = { ...data, id, createdAt: now, updatedAt: now, status: 'draft' };
    delete imported.versionId;
    delete imported.timestamp;
    await fs.writeFile(path.join(PROPOSALS_DIR, `${id}.json`), JSON.stringify(imported, null, 2));
    res.status(201).json(imported);
  } catch (err) {
    res.status(500).json({ error: 'Failed to import proposal' });
  }
});

// ─── SPA Fallback ───────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  🎓 Mikoshi BidWriter running at http://localhost:${PORT}\n`);
});
