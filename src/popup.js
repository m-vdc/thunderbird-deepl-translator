/**
 * DeepL Translator for Thunderbird - Popup Script
 */

const DEEPL_API_URLS = {
  free: 'https://api-free.deepl.com/v2/translate',
  pro: 'https://api.deepl.com/v2/translate'
};

let apiKey = '';
let apiType = 'free';
let lastTranslation = '';

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  await checkApiKey();
  await getSelectionFromMessage();
});

async function loadSettings() {
  const result = await browser.storage.local.get(['deeplApiKey', 'deeplApiType']);
  if (result.deeplApiKey) {
    apiKey = result.deeplApiKey;
    apiType = result.deeplApiType || 'free';
  }
}

async function checkApiKey() {
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const translateBtn = document.getElementById('translateBtn');

  if (apiKey) {
    // Test the API key
    try {
      const response = await fetch('https://api-free.deepl.com/v2/usage', {
        headers: { 'Authorization': `DeepL-Auth-Key ${apiKey}` }
      });
      if (response.ok) {
        document.getElementById('status').className = 'status connected';
        document.getElementById('statusText').textContent = 'Connecté à DeepL';
        document.getElementById('translateBtn').disabled = false;
      } else {
        throw new Error('Invalid API key');
      }
    } catch (e) {
      setDisconnected('Clé API invalide');
    }
  } else {
    setDisconnected('Clé API non configurée');
  }
}

function setDisconnected(message) {
  document.getElementById('status').className = 'status disconnected';
  document.getElementById('statusText').textContent = message;
  document.getElementById('translateBtn').disabled = true;
}

function setupEventListeners() {
  document.getElementById('translateBtn').addEventListener('click', translate);
  document.getElementById('getSelectionBtn').addEventListener('click', getSelectionFromMessage);
  document.getElementById('copyBtn').addEventListener('click', copyTranslation);
  document.getElementById('replaceBtn').addEventListener('click', replaceInMessage);
  document.getElementById('settingsLink').addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
}

async function getSelectionFromMessage() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      const results = await browser.tabs.executeScript(tabs[0].id, {
        code: 'window.getSelection().toString()',
        runAt: 'document_start'
      });
      if (results && results[0]) {
        document.getElementById('sourceText').value = results[0].trim();
      }
    }
  } catch (e) {
    console.error('Failed to get selection:', e);
    showError('Impossible de récupérer la sélection. Assurez-vous d\'être sur un message.');
  }
}

async function translate() {
  const sourceText = document.getElementById('sourceText').value.trim();
  if (!sourceText) {
    showError('Veuillez entrer ou sélectionner du texte à traduire.');
    return;
  }

  const result = await browser.storage.local.get(['deeplApiKey', 'deeplApiType']);
  const apiKey = result.deeplApiKey;
  const apiType = result.deeplApiType || 'free';

  if (!apiKey) {
    showError('Clé API DeepL non configurée. Cliquez sur "Configurer la clé API".');
    return;
  }

  if (sourceText.length > 10000) {
    showError('Le texte dépasse 10 000 caractères. Sélectionnez un passage plus court.');
    return;
  }

  setLoading(true);
  hideError();
  hideResult();

  try {
    const apiUrl = apiType === 'pro'
      ? 'https://api.deepl.com/v2/translate'
      : 'https://api-free.deepl.com/v2/translate';

    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `DeepL-Auth-Key ${apiKey}`
      },
      body: new URLSearchParams({
        text: sourceText,
        target_lang: 'FR',
        preserve_formatting: '1'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Erreur DeepL API: ${response.status} - ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    const translation = data.translations?.[0]?.text || '';

    if (!translation) {
      throw new Error('Aucune traduction reçue');
    }

    showResult(translation);

  } catch (error) {
    console.error('Translation error:', error);
    showError(error.message || 'Erreur lors de la traduction');
  } finally {
    setLoading(false);
  }
}

function showResult(translation) {
  document.getElementById('resultText').textContent = translation;
  document.getElementById('resultArea').classList.remove('hidden');
}

function hideResult() {
  document.getElementById('resultArea').classList.add('hidden');
}

function copyTranslation() {
  const translation = document.getElementById('resultText').textContent;
  navigator.clipboard.writeText(translation).then(() => {
    showToast('Copié dans le presse-papiers !');
  }).catch(() => {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = document.getElementById('resultText').textContent;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Copié dans le presse-papiers !');
  });
}

async function replaceInMessage() {
  const translation = document.getElementById('resultText').textContent;
  if (!translation) return;

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      await browser.tabs.executeScript(tabs[0].id, {
        code: `
          const sel = window.getSelection();
          if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(${JSON.stringify(document.getElementById('resultText').textContent)}));
          }
        `
      });
      showToast('Remplacé dans le message !');
    }
  } catch (e) {
    console.error('Replace failed:', e);
    alert('Impossible de remplacer le texte. Fonctionne uniquement dans une fenêtre de composition.');
  }
}

function showError(message) {
  const errorEl = document.getElementById('error');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideError() {
  document.getElementById('error').classList.add('hidden');
}

function setLoading(loading) {
  const btn = document.getElementById('translateBtn');
  const btnText = document.getElementById('btnText');
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Traduction...';
  } else {
    btn.disabled = false;
    btn.innerHTML = 'Traduire en français';
  }
}

function showToast(message) {
  // Simple toast notification
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #333; color: white; padding: 10px 20px;
    border-radius: 6px; font-size: 12px; z-index: 1000;
    animation: fadeIn 0.2s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}