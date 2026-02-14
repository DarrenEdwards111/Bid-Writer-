/**
 * BidWriter AI — Multi-provider streaming support
 * Supports: Mikoshi AI (Ollama), Claude (Anthropic), OpenAI
 * Provider selection via x-ai-provider / x-ai-key headers
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma2:2b';

// ── Provider Router ─────────────────────────────────────────

function getProviderConfig(req) {
  const provider = (req && req.headers && req.headers['x-ai-provider']) || 'mikoshi';
  const apiKey = (req && req.headers && req.headers['x-ai-key']) || '';
  return { provider, apiKey };
}

// ── Streaming Core ──────────────────────────────────────────

async function streamGenerate(systemPrompt, userPrompt, onChunk, opts = {}) {
  const { provider = 'mikoshi', apiKey = '' } = opts;

  if (provider === 'claude' && apiKey) {
    return streamClaude(systemPrompt, userPrompt, onChunk, apiKey);
  } else if (provider === 'openai' && apiKey) {
    return streamOpenAI(systemPrompt, userPrompt, onChunk, apiKey);
  } else {
    return streamOllama(systemPrompt, userPrompt, onChunk);
  }
}

// ── Ollama (Mikoshi AI — free) ──────────────────────────────

async function streamOllama(systemPrompt, userPrompt, onChunk) {
  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      stream: true,
      options: { num_predict: 8192 }
    })
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => 'Connection failed');
    throw new Error(`Mikoshi AI error (${resp.status}): ${err}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.message && data.message.content) {
          onChunk(data.message.content);
        }
      } catch (e) { /* skip */ }
    }
  }
  // Process remaining buffer
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      if (data.message && data.message.content) {
        onChunk(data.message.content);
      }
    } catch (e) { /* skip */ }
  }
}

// ── Claude (Anthropic) ──────────────────────────────────────

async function streamClaude(systemPrompt, userPrompt, onChunk, apiKey) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude API error (${resp.status}): ${err}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta && event.delta.text) {
            onChunk(event.delta.text);
          }
        } catch (e) { /* skip */ }
      }
    }
  }
}

// ── OpenAI ──────────────────────────────────────────────────

async function streamOpenAI(systemPrompt, userPrompt, onChunk, apiKey) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 8192,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error (${resp.status}): ${err}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const event = JSON.parse(data);
          const content = event.choices && event.choices[0] && event.choices[0].delta && event.choices[0].delta.content;
          if (content) onChunk(content);
        } catch (e) { /* skip */ }
      }
    }
  }
}

// ── Generation Functions ────────────────────────────────────

async function generateProposal(formData, funderData, onChunk, providerOpts = {}) {
  const funderContext = funderData
    ? `\nFunder: ${funderData.fullName} (${funderData.name})\nScheme: ${formData.scheme || 'General'}\nFunder priorities: ${(funderData.priorities || []).join(', ')}\nReview criteria: ${(funderData.reviewCriteria || []).join(', ')}`
    : '';

  const coIs = (formData.coInvestigators || []).map(ci => `  - ${ci.name} (${ci.institution})`).join('\n');
  const objectives = (formData.objectives || []).map((obj, i) => `  ${i + 1}. ${obj}`).join('\n');

  const systemPrompt = `You are an expert academic grant proposal writer with decades of experience securing funding from UK and international research councils. You write compelling, evidence-based proposals that score highly on novelty, methodology, impact, and feasibility.\n\nWrite in a formal academic style appropriate for peer review. Be specific, avoid vague claims, and demonstrate deep understanding of the research area. Use numbered sections with clear headings.${funderContext}`;

  const userPrompt = `Write a complete, structured grant proposal with the following details:\n\nPROJECT TITLE: ${formData.title || 'Untitled Project'}\nRESEARCH AREA: ${formData.researchArea || 'Not specified'}\nREQUESTED AMOUNT: £${formData.amount || 'TBC'}\nDURATION: ${formData.duration || 'TBC'} months\nPRINCIPAL INVESTIGATOR: ${formData.piName || 'TBC'} (${formData.piInstitution || 'TBC'})\n${coIs ? `CO-INVESTIGATORS:\n${coIs}` : ''}\n\nRESEARCH QUESTION/HYPOTHESIS:\n${formData.researchQuestion || 'Not provided'}\n\nKEY OBJECTIVES:\n${objectives || 'Not provided'}\n\nMETHODOLOGY OVERVIEW:\n${formData.methodology || 'Not provided'}\n\nEXPECTED OUTCOMES:\n${formData.outcomes || 'Not provided'}\n\n${formData.existingNotes ? `EXISTING NOTES TO INCORPORATE:\n${formData.existingNotes}` : ''}\n\nGenerate the following sections with clear markdown headings:\n\n## 1. Case for Support\n## 2. Background and Literature Context\n## 3. Research Questions and Objectives\n## 4. Methodology and Research Design\n## 5. Work Plan and Timeline\n## 6. Expected Outcomes and Deliverables\n## 7. Ethical Considerations\n## 8. Data Management Plan\n## 9. Pathways to Impact\n## 10. References\n\nMake each section substantive and appropriate for the funding amount and duration.`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

async function generateImpact(formData, funderData, onChunk, providerOpts = {}) {
  const funderContext = funderData
    ? `\nFunder: ${funderData.fullName} — tailor the impact statement to their requirements and priorities: ${(funderData.priorities || []).join(', ')}`
    : '';

  const systemPrompt = `You are an expert at writing impact statements for academic research funding applications. You understand pathways to impact, beneficiary mapping, and how to articulate the broader significance of research beyond academia.${funderContext}`;

  const beneficiaries = (formData.beneficiaries || []).join(', ');
  const impactTypes = (formData.impactTypes || []).join(', ');
  const timeframes = (formData.timeframes || []).join(', ');

  const userPrompt = `Generate a comprehensive impact statement for this research:\n\nRESEARCH SUMMARY:\n${formData.researchSummary || 'Not provided'}\n\nTARGET BENEFICIARIES: ${beneficiaries || 'Not specified'}\nTYPES OF IMPACT: ${impactTypes || 'Not specified'}\nTIMEFRAMES: ${timeframes || 'Not specified'}\n\nGenerate the following sections:\n\n## Summary of Impact\n## Beneficiaries and Stakeholders\n## Pathways to Impact\n## Impact Timeline and Milestones\n## Evidence of Demand\n## Impact Measurement Plan\n\nBe specific about activities, engagement strategies, and measurable outcomes. Avoid generic statements.`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

async function polishText(text, mode, funderData, onChunk, providerOpts = {}) {
  const modeInstructions = {
    'academic': 'Rewrite this text in a more formal, academic tone suitable for a peer-reviewed grant proposal.',
    'clarity': 'Rewrite this text for maximum clarity. Simplify complex sentences, remove ambiguity, improve logical flow.',
    'concise': "Reduce this text's word count by approximately 30% while preserving all key content and meaning.",
    'funder-aligned': `Rewrite this text to better align with the funder's priorities. ${funderData ? `Funder: ${funderData.fullName}. Priorities: ${(funderData.priorities || []).join(', ')}.` : ''}`,
    'rewrite': 'Comprehensively rewrite this text to improve its overall quality for a grant proposal.'
  };

  const systemPrompt = 'You are an expert academic editor specialising in grant proposals. Output your response in two sections:\n1. ## Polished Text\n2. ## Changes Made (as a bullet list)';
  const userPrompt = `${modeInstructions[mode] || modeInstructions['academic']}\n\nORIGINAL TEXT:\n${text}`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

async function generateBudgetJustification(budgetData, projectContext, onChunk, providerOpts = {}) {
  const systemPrompt = 'You are an expert at writing Justification of Resources sections for academic grant proposals. Explain why each budget item is necessary, reasonable, and represents value for money.';
  const userPrompt = `Write a Justification of Resources section for this budget:\n\nPROJECT CONTEXT:\n${projectContext || 'Academic research project'}\n\nBUDGET ITEMS:\n${JSON.stringify(budgetData, null, 2)}\n\nWrite a clear, compelling justification covering each major cost category.`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

async function generateLiteratureReview(papers, topic, onChunk, providerOpts = {}) {
  const paperList = papers.map((p, i) =>
    `[${i + 1}] ${(p.authors || []).map(a => a.name).join(', ') || 'Unknown'} (${p.year || 'n.d.'}). ${p.title}. ${p.abstract ? p.abstract.substring(0, 200) + '...' : ''}`
  ).join('\n\n');

  const systemPrompt = 'You are an expert academic writer producing literature reviews for grant proposals. Synthesise research findings into a coherent narrative that identifies gaps, trends, and rationale for new research. Use Harvard-style citations.';
  const userPrompt = `Write a literature review narrative on "${topic}" using these papers:\n\n${paperList}\n\nRequirements:\n- Synthesise themes rather than summarise individually\n- Identify gaps in the literature\n- Use Harvard-style citations: (Author, Year)\n- End with a References section\n- Aim for 1000-1500 words`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

async function generateMethodology(formData, funderData, onChunk, providerOpts = {}) {
  const funderContext = funderData ? `\nFunder: ${funderData.fullName}. Priorities: ${(funderData.priorities || []).join(', ')}` : '';
  const systemPrompt = `You are an expert methodology writer for academic research proposals. You write detailed, rigorous methodological descriptions.${funderContext}`;
  const userPrompt = `Write a detailed methodology section for this research:\n\nTITLE: ${formData.title || 'Not specified'}\nRESEARCH AREA: ${formData.researchArea || 'Not specified'}\nRESEARCH QUESTIONS:\n${formData.researchQuestion || 'Not provided'}\n\nMETHODOLOGY NOTES:\n${formData.methodology || 'Not provided'}\n\nDURATION: ${formData.duration || 'TBC'} months\n\nProvide:\n## Research Design\n## Data Collection Methods\n## Sample/Participants\n## Analysis Strategy\n## Quality Assurance\n## Ethical Considerations\n## Limitations and Mitigation`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

async function generateEthics(formData, onChunk, providerOpts = {}) {
  const systemPrompt = 'You are an expert at writing ethics statements and data management plans for academic research. Be thorough about consent, data protection (GDPR), risk assessment, and institutional requirements.';
  const userPrompt = `Generate an Ethics Statement and Data Management Plan for:\n\nPROJECT: ${formData.title || 'Research project'}\nRESEARCH AREA: ${formData.researchArea || 'Not specified'}\nMETHODOLOGY: ${formData.methodology || 'Not specified'}\nPARTICIPANTS: ${formData.participants || 'Not specified'}\n\nGenerate:\n## Ethics Statement\n### Ethical Approval\n### Informed Consent\n### Risk Assessment\n### Safeguarding\n### Conflicts of Interest\n\n## Data Management Plan\n### Data Collection and Storage\n### Data Protection and GDPR\n### Data Sharing and Access\n### Data Preservation\n### Responsibilities`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

async function generateAbstract(proposal, onChunk, providerOpts = {}) {
  const systemPrompt = 'You are an expert at writing concise, compelling research abstracts for grant proposals. Write exactly 300 words.';
  const sections = proposal.sections || {};
  const text = Object.values(sections).join('\n\n').substring(0, 8000);
  const userPrompt = `Generate a 300-word abstract for this research proposal:\n\nTITLE: ${proposal.title || 'Untitled'}\nFUNDER: ${proposal.funder || 'Not specified'}\n\nPROPOSAL TEXT:\n${text}\n\nWrite a clear, structured abstract covering: background, aims, methods, expected outcomes, and significance.`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

async function generatePlainSummary(proposal, onChunk, providerOpts = {}) {
  const systemPrompt = 'You are an expert science communicator. Write a plain language summary that a non-specialist member of the public can understand. Avoid jargon. Be engaging and accessible.';
  const sections = proposal.sections || {};
  const text = Object.values(sections).join('\n\n').substring(0, 8000);
  const userPrompt = `Write a plain language summary (250-400 words) of this research proposal:\n\nTITLE: ${proposal.title || 'Untitled'}\n\n${text}\n\nMake it accessible to a general audience. Explain why this research matters, what will be done, and what difference it could make.`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

async function simulateReviewer(proposal, funderData, onChunk, providerOpts = {}) {
  const funderContext = funderData ? `\nYou are reviewing for: ${funderData.fullName}\nReview criteria: ${(funderData.reviewCriteria || []).join(', ')}` : '';
  const systemPrompt = `You are an experienced peer reviewer for academic funding bodies. Provide a thorough, constructive critique of this proposal.${funderContext}\n\nScore each criterion out of 5 and provide overall feedback with specific suggestions for improvement.`;
  const sections = proposal.sections || {};
  const text = Object.values(sections).join('\n\n').substring(0, 10000);
  const userPrompt = `Review this grant proposal:\n\nTITLE: ${proposal.title || 'Untitled'}\nBUDGET: £${proposal.amount || 'Not specified'}\nDURATION: ${proposal.duration || 'Not specified'} months\n\n${text}\n\nProvide:\n## Overall Assessment\n## Scores (out of 5 for each criterion)\n## Strengths\n## Weaknesses\n## Specific Recommendations\n## Minor Issues`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

async function findResearchGaps(literatureText, onChunk, providerOpts = {}) {
  const systemPrompt = 'You are an expert at identifying gaps and opportunities in academic literature. Analyse the text and identify underexplored areas, methodological gaps, and potential research questions.';
  const userPrompt = `Analyse this literature review and identify research gaps:\n\n${literatureText.substring(0, 10000)}\n\nProvide:\n## Identified Research Gaps\n## Methodological Gaps\n## Under-explored Populations or Contexts\n## Emerging Questions\n## Recommended Research Directions`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

async function generateReviewerResponse(reviewerComments, proposalContext, onChunk, providerOpts = {}) {
  const systemPrompt = 'You are an expert at writing responses to peer reviewer comments for academic grant resubmissions. Be respectful, thorough, and point-by-point in your responses.';
  const userPrompt = `Write a point-by-point response to these reviewer comments:\n\nPROPOSAL CONTEXT:\n${proposalContext || 'Academic research proposal'}\n\nREVIEWER COMMENTS:\n${reviewerComments}\n\nFor each comment:\n1. Acknowledge the point\n2. Explain how you have addressed it (or why you respectfully disagree)\n3. Reference specific changes made\n\nFormat as:\n## Response to Reviewer Comments\n### Comment 1: [summary]\n**Response:** ...\n(continue for each comment)`;

  await streamGenerate(systemPrompt, userPrompt, onChunk, providerOpts);
}

module.exports = {
  getProviderConfig,
  generateProposal,
  generateImpact,
  polishText,
  generateBudgetJustification,
  generateLiteratureReview,
  generateMethodology,
  generateEthics,
  generateAbstract,
  generatePlainSummary,
  simulateReviewer,
  findResearchGaps,
  generateReviewerResponse
};
