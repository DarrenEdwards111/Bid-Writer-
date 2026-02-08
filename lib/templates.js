/**
 * Funder Template Logic & Compliance Checking
 * Validates proposals against funder requirements.
 */

/**
 * Count words in a string
 */
function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Estimate pages (assuming ~300 words/page for academic text)
 */
function estimatePages(text) {
  return Math.ceil(countWords(text) / 300);
}

/**
 * Run compliance checks against funder requirements
 * @param {string} proposalText - Full proposal text (can include section markers)
 * @param {Object} sections - Map of section name → text content
 * @param {Object} funderData - Full funder template
 * @param {number} schemeIndex - Index of selected scheme
 * @param {number} budget - Total budget amount
 * @param {number} duration - Project duration in months
 * @returns {Object} Check results with pass/warn/fail statuses
 */
function runComplianceChecks(proposalText, sections, funderData, schemeIndex = 0, budget = 0, duration = 0) {
  const results = [];
  const scheme = funderData.schemes && funderData.schemes[schemeIndex];

  if (!scheme) {
    return {
      overall: 'fail',
      results: [{
        check: 'Scheme Selection',
        status: 'fail',
        message: 'No valid scheme selected for compliance checking.',
        advice: 'Select a specific grant scheme from the funder dropdown.'
      }]
    };
  }

  // ── Budget Limits ──
  if (scheme.maxAmount) {
    const budgetNum = parseFloat(budget) || 0;
    if (budgetNum > scheme.maxAmount) {
      results.push({
        check: 'Budget Maximum',
        status: 'fail',
        message: `Budget £${budgetNum.toLocaleString()} exceeds maximum £${scheme.maxAmount.toLocaleString()}.`,
        advice: `Reduce your budget to under £${scheme.maxAmount.toLocaleString()} for this scheme.`
      });
    } else if (budgetNum > scheme.maxAmount * 0.95) {
      results.push({
        check: 'Budget Maximum',
        status: 'warn',
        message: `Budget £${budgetNum.toLocaleString()} is within 5% of the £${scheme.maxAmount.toLocaleString()} maximum.`,
        advice: 'Consider whether you need budget headroom for adjustments.'
      });
    } else {
      results.push({
        check: 'Budget Maximum',
        status: 'pass',
        message: `Budget £${budgetNum.toLocaleString()} is within the £${scheme.maxAmount.toLocaleString()} limit.`
      });
    }
  }

  if (scheme.minAmount) {
    const budgetNum = parseFloat(budget) || 0;
    if (budgetNum < scheme.minAmount && budgetNum > 0) {
      results.push({
        check: 'Budget Minimum',
        status: 'fail',
        message: `Budget £${budgetNum.toLocaleString()} is below the minimum £${scheme.minAmount.toLocaleString()}.`,
        advice: `This scheme requires a minimum budget of £${scheme.minAmount.toLocaleString()}.`
      });
    } else if (budgetNum >= scheme.minAmount) {
      results.push({
        check: 'Budget Minimum',
        status: 'pass',
        message: `Budget meets the minimum £${scheme.minAmount.toLocaleString()} threshold.`
      });
    }
  }

  // ── Duration ──
  if (scheme.maxDuration) {
    const dur = parseFloat(duration) || 0;
    if (dur > scheme.maxDuration) {
      results.push({
        check: 'Duration',
        status: 'fail',
        message: `Duration ${dur} months exceeds maximum ${scheme.maxDuration} months.`,
        advice: `Reduce project duration to ${scheme.maxDuration} months or less.`
      });
    } else if (dur > 0) {
      results.push({
        check: 'Duration',
        status: 'pass',
        message: `Duration ${dur} months is within the ${scheme.maxDuration} month limit.`
      });
    }
  }

  if (scheme.minDuration) {
    const dur = parseFloat(duration) || 0;
    if (dur < scheme.minDuration && dur > 0) {
      results.push({
        check: 'Duration Minimum',
        status: 'fail',
        message: `Duration ${dur} months is below the minimum ${scheme.minDuration} months.`,
        advice: `This scheme requires at least ${scheme.minDuration} months duration.`
      });
    }
  }

  // ── Section Checks ──
  if (scheme.sections) {
    for (const reqSection of scheme.sections) {
      const sectionText = findSection(sections, proposalText, reqSection.name);

      // Required section present?
      if (reqSection.required) {
        if (!sectionText || sectionText.trim().length < 50) {
          results.push({
            check: `Section: ${reqSection.name}`,
            status: 'fail',
            message: `Required section "${reqSection.name}" is missing or too short.`,
            advice: `Add a substantive "${reqSection.name}" section to your proposal.`
          });
          continue;
        } else {
          results.push({
            check: `Section: ${reqSection.name} (Present)`,
            status: 'pass',
            message: `Required section "${reqSection.name}" is present.`
          });
        }
      }

      // Word limit check
      if (reqSection.maxWords && sectionText) {
        const wc = countWords(sectionText);
        if (wc > reqSection.maxWords) {
          results.push({
            check: `Section: ${reqSection.name} (Word Limit)`,
            status: 'fail',
            message: `"${reqSection.name}" is ${wc} words (limit: ${reqSection.maxWords}).`,
            advice: `Reduce by ${wc - reqSection.maxWords} words. Current: ${wc}/${reqSection.maxWords}.`
          });
        } else if (wc > reqSection.maxWords * 0.9) {
          results.push({
            check: `Section: ${reqSection.name} (Word Limit)`,
            status: 'warn',
            message: `"${reqSection.name}" is ${wc}/${reqSection.maxWords} words (${Math.round(wc/reqSection.maxWords*100)}%).`,
            advice: 'Close to the word limit. Leave some margin for final edits.'
          });
        } else if (wc > 0) {
          results.push({
            check: `Section: ${reqSection.name} (Word Limit)`,
            status: 'pass',
            message: `"${reqSection.name}" is ${wc}/${reqSection.maxWords} words.`
          });
        }
      }

      // Page limit check
      if (reqSection.maxPages && sectionText) {
        const pages = estimatePages(sectionText);
        if (pages > reqSection.maxPages) {
          results.push({
            check: `Section: ${reqSection.name} (Page Limit)`,
            status: 'fail',
            message: `"${reqSection.name}" is approximately ${pages} pages (limit: ${reqSection.maxPages}).`,
            advice: `Estimated at ~300 words/page. Reduce content to fit within ${reqSection.maxPages} page(s).`
          });
        } else {
          results.push({
            check: `Section: ${reqSection.name} (Page Limit)`,
            status: 'pass',
            message: `"${reqSection.name}" fits within ${reqSection.maxPages} page(s).`
          });
        }
      }
    }
  }

  // ── Overall text checks ──
  const fullText = proposalText || Object.values(sections || {}).join('\n');

  if (fullText) {
    // Check for common issues
    const totalWords = countWords(fullText);
    results.push({
      check: 'Total Word Count',
      status: 'pass',
      message: `Total proposal text: ${totalWords.toLocaleString()} words.`
    });

    // Check for first-person usage (some funders discourage)
    const firstPersonCount = (fullText.match(/\bI\b/g) || []).length;
    if (firstPersonCount > 10) {
      results.push({
        check: 'First Person Usage',
        status: 'warn',
        message: `Found ${firstPersonCount} instances of "I". Most funders prefer "we" or passive voice.`,
        advice: 'Consider using "we" for team applications or passive constructions.'
      });
    }

    // Check for vague language
    const vagueTerms = ['very', 'quite', 'somewhat', 'fairly', 'rather', 'extremely'];
    const vagueCount = vagueTerms.reduce((count, term) => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      return count + (fullText.match(regex) || []).length;
    }, 0);
    if (vagueCount > 15) {
      results.push({
        check: 'Vague Language',
        status: 'warn',
        message: `Found ${vagueCount} instances of vague qualifiers (very, quite, somewhat, etc.).`,
        advice: 'Replace vague qualifiers with specific, evidence-based language.'
      });
    }
  }

  // ── Eligibility Note ──
  if (scheme.eligibility) {
    results.push({
      check: 'Eligibility',
      status: 'warn',
      message: `Eligibility requirement: ${scheme.eligibility}`,
      advice: 'Ensure you meet this eligibility criterion before submitting.'
    });
  }

  // ── Required Attachments ──
  if (scheme.sections) {
    const attachmentSections = scheme.sections.filter(s =>
      ['CV', 'Letter of Support', 'Ethics Approval', 'Data Management Plan'].some(a =>
        s.name.toLowerCase().includes(a.toLowerCase())
      )
    );
    if (attachmentSections.length > 0) {
      results.push({
        check: 'Required Attachments',
        status: 'warn',
        message: `Don't forget: ${attachmentSections.map(s => s.name).join(', ')}`,
        advice: 'Ensure all required attachments are prepared before submission.'
      });
    }
  }

  // Calculate overall status
  const hasFailures = results.some(r => r.status === 'fail');
  const hasWarnings = results.some(r => r.status === 'warn');
  const overall = hasFailures ? 'fail' : hasWarnings ? 'warn' : 'pass';

  return { overall, results };
}

/**
 * Try to find a section's text from sections map or by parsing the full text
 */
function findSection(sections, fullText, sectionName) {
  // First check the sections map
  if (sections) {
    // Direct match
    if (sections[sectionName]) return sections[sectionName];
    // Case-insensitive match
    const key = Object.keys(sections).find(k =>
      k.toLowerCase().includes(sectionName.toLowerCase()) ||
      sectionName.toLowerCase().includes(k.toLowerCase())
    );
    if (key) return sections[key];
  }

  // Try to extract from full text using heading patterns
  if (fullText) {
    const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `(?:^|\\n)#+\\s*(?:\\d+\\.?\\s*)?${escapedName}[\\s\\S]*?(?=\\n#+\\s|$)`,
      'i'
    );
    const match = fullText.match(pattern);
    if (match) return match[0];
  }

  return null;
}

module.exports = { runComplianceChecks, countWords, estimatePages };
