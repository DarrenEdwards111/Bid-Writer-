/**
 * Draft Polisher Module
 * AI-powered text improvement with track changes.
 */

async function initPolishPage() {
  const modeSelect = document.getElementById('polishMode');
  const funderGroup = document.getElementById('polishFunderGroup');
  const funderSelect = document.getElementById('polishFunder');
  const input = document.getElementById('polishInput');
  const inputWC = document.getElementById('polishInputWC');

  // Show/hide funder dropdown for funder-aligned mode
  modeSelect.addEventListener('change', () => {
    funderGroup.classList.toggle('hidden', modeSelect.value !== 'funder-aligned');
  });

  // Populate funder dropdown
  await populateFunderDropdown(funderSelect);

  // Word count on input
  input.addEventListener('input', () => {
    inputWC.textContent = countWords(input.value);
  });

  // Polish button
  document.getElementById('polishBtn').addEventListener('click', handlePolish);

  // Copy button
  document.getElementById('copyPolishedBtn').addEventListener('click', () => {
    const output = document.getElementById('polishOutput');
    navigator.clipboard.writeText(output.textContent).then(() => {
      showToast('Copied to clipboard', 'success');
    });
  });

  // Accept All — replace input with polished text
  document.getElementById('acceptAllBtn').addEventListener('click', () => {
    const polishedText = window._polishedText;
    if (polishedText) {
      input.value = polishedText;
      inputWC.textContent = countWords(polishedText);
      showToast('Polished text accepted — now in the input field', 'success');
    }
  });
}

async function handlePolish() {
  const text = document.getElementById('polishInput').value.trim();
  if (!text) {
    showToast('Please paste some text to polish', 'warning');
    return;
  }

  const mode = document.getElementById('polishMode').value;
  const btn = document.getElementById('polishBtn');
  const output = document.getElementById('polishOutput');
  const outputWC = document.getElementById('polishOutputWC');
  const diffSpan = document.getElementById('polishWCDiff');

  // Get funder data if funder-aligned mode
  let funderData = null;
  if (mode === 'funder-aligned') {
    const funderId = document.getElementById('polishFunder').value;
    if (funderId) {
      funderData = await loadFunderDetails(funderId);
    }
  }

  btn.disabled = true;
  btn.textContent = '⏳ Polishing...';
  output.innerHTML = '<div class="loading-inline"><div class="spinner spinner-sm"></div><span>Polishing your text...</span></div>';

  let fullText = '';

  await streamAI('/generate/polish', { text, mode, funderData },
    (chunk) => {
      fullText += chunk;
      output.textContent = fullText;
    },
    () => {
      btn.disabled = false;
      btn.textContent = '✨ Polish Text';
      document.getElementById('copyPolishedBtn').disabled = false;
      document.getElementById('acceptAllBtn').disabled = false;

      // Parse polished text and changes
      const { polished, changes } = parsePolishOutput(fullText);
      window._polishedText = polished;

      // Render polished text
      output.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${escapeHtml(polished)}</div>`;

      // Word counts
      const originalWC = countWords(text);
      const polishedWC = countWords(polished);
      outputWC.textContent = polishedWC;
      
      const diff = polishedWC - originalWC;
      if (diff !== 0) {
        const color = diff < 0 ? 'var(--success)' : 'var(--warning)';
        diffSpan.innerHTML = `<span style="color: ${color};">(${diff > 0 ? '+' : ''}${diff})</span>`;
      } else {
        diffSpan.textContent = '';
      }

      // Show changes
      if (changes) {
        document.getElementById('changesSection').classList.remove('hidden');
        document.getElementById('changesList').innerHTML = markdownToHtml(changes);
      }

      showToast('Text polished successfully!', 'success');
    },
    (err) => {
      btn.disabled = false;
      btn.textContent = '✨ Polish Text';
      output.innerHTML = `<div class="empty-state"><p>Polishing failed: ${escapeHtml(err.message)}</p></div>`;
      showToast(err.message, 'error');
    }
  );
}

function parsePolishOutput(text) {
  // Try to split into polished text and changes
  const changesMatch = text.match(/##\s*Changes\s*Made[\s\S]*$/i);
  const polishedMatch = text.match(/##\s*Polished\s*Text\s*\n([\s\S]*?)(?=##\s*Changes|$)/i);

  let polished = text;
  let changes = '';

  if (polishedMatch) {
    polished = polishedMatch[1].trim();
  } else if (changesMatch) {
    polished = text.substring(0, changesMatch.index).trim();
  }

  if (changesMatch) {
    changes = changesMatch[0].replace(/^##\s*Changes\s*Made\s*/i, '').trim();
  }

  return { polished, changes };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
