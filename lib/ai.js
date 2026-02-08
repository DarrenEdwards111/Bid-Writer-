/**
 * AI Generation Wrapper - Claude API Integration
 * Handles all AI-powered text generation with streaming support.
 * Configure via ANTHROPIC_API_KEY environment variable.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

/**
 * Send a streaming request to Claude API
 * @param {string} systemPrompt - System instruction
 * @param {string} userPrompt - User message
 * @param {function} onChunk - Callback for each text chunk
 */
async function streamGenerate(systemPrompt, userPrompt, onChunk) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set. Please set it in your environment variables.');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errBody}`);
  }

  // Parse SSE stream from Claude
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            onChunk(event.delta.text);
          }
        } catch (e) { /* skip non-JSON lines */ }
      }
    }
  }
}

/**
 * Generate a full structured proposal
 */
async function generateProposal(formData, funderData, onChunk) {
  const funderContext = funderData
    ? `\nFunder: ${funderData.fullName} (${funderData.name})
Scheme: ${formData.scheme || 'General'}
Funder priorities: ${(funderData.priorities || []).join(', ')}
Review criteria: ${(funderData.reviewCriteria || []).join(', ')}`
    : '';

  const coIs = (formData.coInvestigators || [])
    .map(ci => `  - ${ci.name} (${ci.institution})`).join('\n');

  const objectives = (formData.objectives || [])
    .map((obj, i) => `  ${i + 1}. ${obj}`).join('\n');

  const systemPrompt = `You are an expert academic grant proposal writer with decades of experience securing funding from UK and international research councils. You write compelling, evidence-based proposals that score highly on novelty, methodology, impact, and feasibility.

Write in a formal academic style appropriate for peer review. Be specific, avoid vague claims, and demonstrate deep understanding of the research area. Use numbered sections with clear headings.${funderContext}`;

  const userPrompt = `Write a complete, structured grant proposal with the following details:

PROJECT TITLE: ${formData.title || 'Untitled Project'}
RESEARCH AREA: ${formData.researchArea || 'Not specified'}
REQUESTED AMOUNT: £${formData.amount || 'TBC'}
DURATION: ${formData.duration || 'TBC'} months
PRINCIPAL INVESTIGATOR: ${formData.piName || 'TBC'} (${formData.piInstitution || 'TBC'})
${coIs ? `CO-INVESTIGATORS:\n${coIs}` : ''}

RESEARCH QUESTION/HYPOTHESIS:
${formData.researchQuestion || 'Not provided'}

KEY OBJECTIVES:
${objectives || 'Not provided'}

METHODOLOGY OVERVIEW:
${formData.methodology || 'Not provided'}

EXPECTED OUTCOMES:
${formData.outcomes || 'Not provided'}

${formData.existingNotes ? `EXISTING NOTES TO INCORPORATE:\n${formData.existingNotes}` : ''}

Please generate the following sections with clear markdown headings (## Section Name):

## 1. Case for Support
## 2. Background and Literature Context
## 3. Research Questions and Objectives
## 4. Methodology and Research Design
## 5. Work Plan and Timeline
## 6. Expected Outcomes and Deliverables
## 7. Ethical Considerations
## 8. Data Management Plan
## 9. Pathways to Impact
## 10. References

Make each section substantive and appropriate for the funding amount and duration. Include realistic timelines, specific methodological details, and concrete deliverables.`;

  await streamGenerate(systemPrompt, userPrompt, onChunk);
}

/**
 * Generate an impact statement
 */
async function generateImpact(formData, funderData, onChunk) {
  const funderContext = funderData
    ? `\nFunder: ${funderData.fullName} — tailor the impact statement to their requirements and priorities: ${(funderData.priorities || []).join(', ')}`
    : '';

  const systemPrompt = `You are an expert at writing impact statements for academic research funding applications. You understand pathways to impact, beneficiary mapping, and how to articulate the broader significance of research beyond academia.${funderContext}`;

  const beneficiaries = (formData.beneficiaries || []).join(', ');
  const impactTypes = (formData.impactTypes || []).join(', ');
  const timeframes = (formData.timeframes || []).join(', ');

  const userPrompt = `Generate a comprehensive impact statement for this research:

RESEARCH SUMMARY:
${formData.researchSummary || 'Not provided'}

TARGET BENEFICIARIES: ${beneficiaries || 'Not specified'}
TYPES OF IMPACT: ${impactTypes || 'Not specified'}
TIMEFRAMES: ${timeframes || 'Not specified'}

Generate the following sections:

## Summary of Impact
## Beneficiaries and Stakeholders
## Pathways to Impact
## Impact Timeline and Milestones
## Evidence of Demand
## Impact Measurement Plan

Be specific about activities, engagement strategies, and measurable outcomes. Avoid generic statements.`;

  await streamGenerate(systemPrompt, userPrompt, onChunk);
}

/**
 * Polish existing draft text
 */
async function polishText(text, mode, funderData, onChunk) {
  const modeInstructions = {
    'academic': 'Rewrite this text in a more formal, academic tone suitable for a peer-reviewed grant proposal. Enhance the scholarly register, use appropriate disciplinary terminology, and ensure precision of expression.',
    'clarity': 'Rewrite this text for maximum clarity. Simplify complex sentences, remove ambiguity, improve logical flow, and ensure each paragraph has a clear purpose. Keep the academic tone.',
    'concise': 'Reduce this text\'s word count by approximately 30% while preserving all key content and meaning. Remove redundancy, tighten sentences, and eliminate filler phrases.',
    'funder-aligned': `Rewrite this text to better align with the funder's priorities and language. ${funderData ? `Funder: ${funderData.fullName}. Priorities: ${(funderData.priorities || []).join(', ')}. Review criteria: ${(funderData.reviewCriteria || []).join(', ')}.` : ''} Use terminology and framing that resonates with this funder.`,
    'rewrite': 'Comprehensively rewrite this text to improve its overall quality for a grant proposal. Enhance argument structure, strengthen evidence claims, improve transitions, and ensure compelling narrative flow.'
  };

  const systemPrompt = `You are an expert academic editor specialising in grant proposals. You improve text while maintaining the author's voice and intent.

IMPORTANT: Output your response in two clearly marked sections:
1. First, the polished text under ## Polished Text
2. Then, a summary of changes under ## Changes Made (as a bullet list)`;

  const userPrompt = `${modeInstructions[mode] || modeInstructions['academic']}

ORIGINAL TEXT:
${text}`;

  await streamGenerate(systemPrompt, userPrompt, onChunk);
}

/**
 * Generate budget justification text
 */
async function generateBudgetJustification(budgetData, projectContext, onChunk) {
  const systemPrompt = `You are an expert at writing Justification of Resources sections for academic grant proposals. You explain why each budget item is necessary, reasonable, and represents value for money.`;

  const userPrompt = `Write a Justification of Resources section for this budget:

PROJECT CONTEXT:
${projectContext || 'Academic research project'}

BUDGET ITEMS:
${JSON.stringify(budgetData, null, 2)}

Write a clear, compelling justification covering each major cost category. Explain why each item is essential, how the costs were calculated, and why they represent value for money. Use numbered paragraphs corresponding to budget categories.`;

  await streamGenerate(systemPrompt, userPrompt, onChunk);
}

/**
 * Generate a literature review narrative
 */
async function generateLiteratureReview(papers, topic, onChunk) {
  const paperList = papers.map((p, i) => 
    `[${i + 1}] ${p.authors?.map(a => a.name).join(', ') || 'Unknown'} (${p.year || 'n.d.'}). ${p.title}. ${p.abstract ? `Abstract: ${p.abstract.substring(0, 200)}...` : ''}`
  ).join('\n\n');

  const systemPrompt = `You are an expert academic writer producing literature reviews for grant proposals. You synthesise research findings into a coherent narrative that identifies gaps, trends, and the rationale for new research. Use Harvard-style in-text citations.`;

  const userPrompt = `Write a literature review narrative on the topic "${topic}" using these papers:

${paperList}

Requirements:
- Synthesise themes rather than summarise each paper individually
- Identify gaps in the current literature
- Build a narrative that justifies further research
- Use Harvard-style citations: (Author, Year)
- End with a "References" section in Harvard format
- Aim for approximately 1000-1500 words`;

  await streamGenerate(systemPrompt, userPrompt, onChunk);
}

module.exports = {
  generateProposal,
  generateImpact,
  polishText,
  generateBudgetJustification,
  generateLiteratureReview
};
