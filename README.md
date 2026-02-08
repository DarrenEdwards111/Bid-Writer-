# 🎓 BidWriter

**Academic Grant Proposal Platform** — AI-powered bid writing for UK and EU research funding.

Generate full proposals, polish drafts, build budgets, create Gantt charts, search literature, and check compliance — all in one place.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green) ![License](https://img.shields.io/badge/license-Apache%202.0-blue) ![Express](https://img.shields.io/badge/Express-4.x-lightgrey)

---

## Features

| Feature | Description |
|---|---|
| **📝 Proposal Generator** | Research idea → full structured bid with Case for Support, methodology, objectives, work plan, ethics, data management |
| **✏️ Draft Polisher** | Paste rough text → polished academic prose. Modes: Academic Tone, Clarity, Concise, Funder-Aligned, Full Rewrite |
| **💥 Impact Statements** | Generate impact summaries, beneficiary analysis, pathways to impact, measurement plans |
| **📊 Gantt Chart Builder** | Visual timeline with work packages, milestones, deliverables. Auto-generate from objectives |
| **💰 Budget Calculator** | Staff costs (with on-costs), travel, equipment, consumables, subcontracting. Full fEC calculation |
| **📚 Literature Review** | Search Semantic Scholar, select papers, generate narrative review with Harvard citations |
| **✅ Compliance Checker** | Validate against funder requirements — word limits, budget caps, required sections, duration |
| **📄 PDF Export** | Print-friendly academic formatting (12pt, 1.5 spacing, numbered sections) |

## Supported Funders

**12 funder templates** with scheme-specific requirements, word limits, and eligibility criteria:

| Funder | Council | Focus |
|---|---|---|
| EPSRC | UKRI | Engineering & Physical Sciences |
| AHRC | UKRI | Arts & Humanities |
| ESRC | UKRI | Economic & Social Research |
| BBSRC | UKRI | Biosciences |
| MRC | UKRI | Medical Research |
| NERC | UKRI | Natural Environment |
| STFC | UKRI | Science & Technology Facilities |
| Horizon Europe | EU | Cross-border collaborative research |
| Wellcome Trust | Independent | Biomedical & health research |
| Leverhulme Trust | Independent | Any discipline |
| British Academy | Independent | Humanities & social sciences |
| Internal University | — | Seed funding / pump-priming |

Each template includes grant schemes, maximum amounts, duration limits, required sections with word counts, cost models (fEC rates), strategic priorities, and review criteria.

## Quick Start

```bash
# Clone
git clone https://github.com/DarrenEdwards111/Bid-Writer-.git
cd Bid-Writer-

# Install
npm install

# Run
npm start
```

Open **http://localhost:3000** in your browser.

### With AI Generation

Set your Anthropic API key to enable AI-powered features:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Without an API key, the app runs fully — you just won't have AI generation for proposals, polishing, impact statements, or literature reviews. All other features (budget calculator, Gantt chart, compliance checker) work standalone.

## Architecture

```
bidwriter/
├── server.js                 # Express server (port 3000)
├── lib/
│   ├── ai.js                 # Claude API wrapper with streaming
│   ├── budget-calc.js        # Budget calculation logic
│   ├── pdf.js                # PDF generation
│   └── templates.js          # Funder template loader
├── public/
│   ├── index.html            # SPA shell with sidebar nav
│   ├── css/style.css         # Modern responsive CSS
│   ├── js/
│   │   ├── app.js            # Router & core logic
│   │   ├── proposal.js       # Proposal generator
│   │   ├── polish.js         # Draft polisher
│   │   ├── impact.js         # Impact statement generator
│   │   ├── gantt.js          # Gantt chart builder
│   │   ├── budget.js         # Budget calculator
│   │   ├── literature.js     # Literature review
│   │   └── compliance.js     # Compliance checker
│   └── templates/            # HTML partials for each view
├── data/funders/             # 12 funder template JSON files
└── proposals/                # Saved proposals (gitignored)
```

## Budget Calculator

The budget calculator supports full economic costing (fEC) as used by UK research councils:

- **Staff Costs** — Salary × FTE% × months + on-costs (default 25%)
- **Travel & Subsistence** — Per-trip costs × number of trips
- **Equipment** — Individual items with justification
- **Consumables** — Lab supplies, materials, etc.
- **Other Costs** — Publication fees, access charges, etc.
- **Subcontracting** — External partners

Calculates:
- Direct costs → Indirect costs (overheads) → Full economic cost
- Funder contribution (80% fEC for UKRI, 100% for others)
- Institution contribution

## API Endpoints

```
GET  /api/proposals              List saved proposals
POST /api/proposals              Save a proposal
GET  /api/proposals/:id          Get a proposal
PUT  /api/proposals/:id          Update a proposal
DELETE /api/proposals/:id        Delete a proposal

POST /api/generate/proposal      Generate proposal sections (AI)
POST /api/generate/impact        Generate impact statement (AI)
POST /api/generate/polish        Polish draft text (AI)
POST /api/generate/budget-justification  Budget justification (AI)
POST /api/generate/literature    Generate literature review (AI)

POST /api/compliance/check       Run compliance checks
GET  /api/funders                List all funders
GET  /api/funders/:id            Get funder details
GET  /api/search/papers          Search Semantic Scholar
```

## Tech Stack

- **Backend:** Node.js + Express (single dependency)
- **Frontend:** Vanilla HTML/CSS/JS (no framework, no build step)
- **AI:** Anthropic Claude API (optional — app works without it)
- **Academic Search:** Semantic Scholar API (free, no key needed)
- **PDF:** Print-friendly CSS with `@media print`

Zero build tools. Zero framework lock-in. Just `npm start`.

## Screenshots

*Coming soon*

## License

Apache License 2.0 — see [LICENSE](LICENSE)
