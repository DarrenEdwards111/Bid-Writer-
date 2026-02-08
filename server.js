/**
 * BidWriter - Academic Grant Proposal Writing Platform
 * Express server with API endpoints for proposal management,
 * AI generation, compliance checking, and paper search.
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const { generateProposal, generateImpact, polishText, generateBudgetJustification, generateLiteratureReview } = require('./lib/ai');
const { runComplianceChecks } = require('./lib/templates');
const { calculateBudget } = require('./lib/budget-calc');

const app = express();
const PORT = process.env.PORT || 3000;

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const FUNDERS_DIR = path.join(DATA_DIR, 'funders');
const PROPOSALS_DIR = path.join(__dirname, 'proposals');

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure proposals directory exists
async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch (e) { /* exists */ }
}

// ─── Proposal CRUD ──────────────────────────────────────────

// List all saved proposals
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
      } catch (e) { /* skip corrupt files */ }
    }
    // Sort by most recently updated
    proposals.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json(proposals);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list proposals' });
  }
});

// Save a new proposal
app.post('/api/proposals', async (req, res) => {
  try {
    await ensureDir(PROPOSALS_DIR);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const proposal = {
      ...req.body,
      id,
      createdAt: now,
      updatedAt: now,
      status: req.body.status || 'draft'
    };
    await fs.writeFile(
      path.join(PROPOSALS_DIR, `${id}.json`),
      JSON.stringify(proposal, null, 2)
    );
    res.status(201).json(proposal);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save proposal' });
  }
});

// Get a single proposal
app.get('/api/proposals/:id', async (req, res) => {
  try {
    const filePath = path.join(PROPOSALS_DIR, `${req.params.id}.json`);
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Proposal not found' });
  }
});

// Update a proposal
app.put('/api/proposals/:id', async (req, res) => {
  try {
    const filePath = path.join(PROPOSALS_DIR, `${req.params.id}.json`);
    // Ensure it exists
    await fs.access(filePath);
    const existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const updated = {
      ...existing,
      ...req.body,
      id: req.params.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2));
    res.json(updated);
  } catch (err) {
    res.status(404).json({ error: 'Proposal not found' });
  }
});

// Delete a proposal
app.delete('/api/proposals/:id', async (req, res) => {
  try {
    const filePath = path.join(PROPOSALS_DIR, `${req.params.id}.json`);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: 'Proposal not found' });
  }
});

// ─── Funder Data ────────────────────────────────────────────

// List all funders
app.get('/api/funders', async (req, res) => {
  try {
    const files = await fs.readdir(FUNDERS_DIR);
    const funders = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(await fs.readFile(path.join(FUNDERS_DIR, file), 'utf8'));
        funders.push({
          id: data.id,
          name: data.name,
          fullName: data.fullName,
          parent: data.parent || null,
          schemesCount: data.schemes ? data.schemes.length : 0
        });
      } catch (e) { /* skip */ }
    }
    funders.sort((a, b) => a.name.localeCompare(b.name));
    res.json(funders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list funders' });
  }
});

// Get funder details
app.get('/api/funders/:id', async (req, res) => {
  try {
    const filePath = path.join(FUNDERS_DIR, `${req.params.id}.json`);
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Funder not found' });
  }
});

// ─── AI Generation Endpoints ────────────────────────────────

// Generate full proposal (SSE streaming)
app.post('/api/generate/proposal', async (req, res) => {
  try {
    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const { formData, funderData } = req.body;
    await generateProposal(formData, funderData, (chunk) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    // If headers already sent, send error via SSE
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Generate impact statement (SSE streaming)
app.post('/api/generate/impact', async (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const { formData, funderData } = req.body;
    await generateImpact(formData, funderData, (chunk) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Polish text (SSE streaming)
app.post('/api/generate/polish', async (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const { text, mode, funderData } = req.body;
    await polishText(text, mode, funderData, (chunk) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Generate budget justification (SSE streaming)
app.post('/api/generate/budget-justification', async (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const { budgetData, projectContext } = req.body;
    await generateBudgetJustification(budgetData, projectContext, (chunk) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Generate literature review (SSE streaming)
app.post('/api/generate/literature', async (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const { papers, topic } = req.body;
    await generateLiteratureReview(papers, topic, (chunk) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── Compliance Check ───────────────────────────────────────

app.post('/api/compliance/check', async (req, res) => {
  try {
    const { proposalText, sections, funderId, schemeIndex, budget, duration } = req.body;
    const funderPath = path.join(FUNDERS_DIR, `${funderId}.json`);
    const funderData = JSON.parse(await fs.readFile(funderPath, 'utf8'));
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
    if (!response.ok) {
      throw new Error(`Semantic Scholar API error: ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PDF Export ─────────────────────────────────────────────

app.post('/api/export/pdf', (req, res) => {
  // PDF export is handled client-side via print CSS
  // This endpoint returns a print-ready HTML page
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

// ─── SPA Fallback ───────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  🎓 BidWriter running at http://localhost:${PORT}\n`);
});
