/**
 * DeepL Translator for Thunderbird - Options Script
 */

const DEEPL_API_URLS = {
  free: 'https://api-free.deepl.com/v2/translate',
  pro: 'https://api.deepl.com/v2/translate'
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

async function loadSettings() {
  const result = await browser.storage.local.get(['deeplApiKey', 'deeplApiType']);
  if (result.deeplApiKey) {
    document.getElementById('apiKey').value = result.deeplApiKey;
  }
  if (result.deeplApiType) {
    document.querySelector(`input[name="apiType"][value="${result.deeplApiType}"]`).checked = true;
    updateRadioStyles();
  }
}

function setupEventListeners() {
  document.querySelectorAll('input[name="apiType"]').forEach(input => {
    input.addEventListener('change', updateRadioStyles);
  });

  document.getElementById('testBtn').addEventListener('click', testConnection);
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('clearBtn').addEventListener('click', clearSettings);
}

function updateRadioStyles() {
  document.querySelectorAll('.radio-option').forEach(option => {
    const input = option.querySelector('input');
    if (input.checked) {
      option.style.borderColor = '#1976d2';
      option.style.background = '#e8eaf6';
    } else {
      option.style.borderColor = '#ddd';
      option.style.background = 'transparent';
    }
  });
}

async function testConnection() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const apiType = document.querySelector('input[name="apiType"]:checked').value;

  const testResult = document.getElementById('testResult');
  const testBtn = document.getElementById('testBtn');

  if (!apiKey) {
    showTestResult('Veuillez entrer une clé API.', 'error');
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Test en cours...';
  testResult.className = 'test-result hidden';

  const usageUrl = apiType === 'pro'
    ? 'https://api.deepl.com/v2/usage'
    : 'https://api-free.deepl.com/v2/usage';

  try {
    const response = await fetch(usageUrl, {
      headers: { 'Authorization': `DeepL-Auth-Key ${apiKey}` }
    });

    if (response.ok) {
      const data = await response.json();
      const used = data.character_count || 0;
      const limit = data.character_limit || 500000;
      const percent = ((used / limit) * 100).toFixed(1);
      showTestResult(
        `✅ Connexion réussie ! Type: ${document.querySelector('input[name="apiType"]:checked').value === 'pro' ? 'Pro' : 'Free'} | Utilisation: ${used.toLocaleString()} / ${limit.toLocaleString()} caractères (${percent}%)`,
        'success'
      );
    } else {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Erreur ${response.status}: ${error.message || 'Clé invalide'}`);
    }
  } catch (error) {
    showTestResult(`❌ ${error.message}`, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '🔍 Tester la connexion';
  }
}

function showTestResult(message, type) {
  const el = document.getElementById('testResult');
  el.textContent = message;
  el.className = `test-result ${type}`;
}

function showStatus(message, type) {
  const el = document.getElementById('statusMsg');
  el.textContent = message;
  el.className = `status-msg ${type}`;
}

async function saveSettings() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const apiType = document.querySelector('input[name="apiType"]:checked').value;

  if (!apiKey) {
    showStatus('Veuillez entrer une clé API.', 'error');
    return;
  }

  try {
    await browser.storage.local.set({
      deeplApiKey: apiKey,
      deeplApiType: apiType
    });
    showStatus('✅ Configuration enregistrée avec succès !', 'success');
  } catch (e) {
    console.error('Save error:', e);
    showStatus('❌ Erreur lors de l\'enregistrement.', 'error');
  }
}

async function clearSettings() {
  if (!confirm('Êtes-vous sûr de vouloir effacer la configuration ?')) return;

  try {
    await browser.storage.local.remove(['deeplApiKey', 'deeplApiType']);
    document.getElementById('apiKey').value = '';
    document.getElementById('apiFree').checked = true;
    updateRadioStyles();
    showStatus('✅ Configuration effacée.', 'success');
  } catch (e) {
    console.error('Clear error:', e);
    showStatus('❌ Erreur lors de la suppression.', 'error');
  }
}

function showStatus(message, type) {
  const el = document.getElementById('statusMsg');
  el.textContent = message;
  el.className = `status-msg ${type}`;
}