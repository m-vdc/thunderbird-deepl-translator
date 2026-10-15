/**
 * DeepL Translator for Thunderbird - Popup Script (v1.3.0)
 *
 * All privileged work (reading the selection, calling DeepL) goes through the
 * background script. The popup only renders.
 *
 * The selection is captured automatically when the popup opens, so there is no
 * "Sélection" button anymore: a popup closes as soon as you click in the
 * message, so it could never fetch a *new* selection anyway.
 */

const diagLines = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('translateBtn').addEventListener('click', translate);
  document.getElementById('windowBtn').addEventListener('click', openResultWindow);
  document.getElementById('settingsLink').addEventListener('click', function (e) {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });

  await pingBackground();
  await checkApiKey();
  await showLastResult();
  await getSelectionFromMessage();
}

function diag(line) {
  diagLines.push(line);
  const el = document.getElementById('diag');
  el.classList.remove('hidden');
  el.textContent = diagLines.join('\n');
}

/* ------------------------------------------------------------------ */

async function pingBackground() {
  try {
    const info = await browser.runtime.sendMessage({ command: 'deeplPing' });
    if (!info) {
      diag('background: pas de reponse au ping');
      return;
    }
    document.getElementById('versionLabel').textContent = 'v' + info.version;
    diag('background v' + info.version + ' OK');
    diag('menus=' + info.hasMenus +
         ' messageDisplayScripts=' + info.hasMessageDisplayScripts +
         ' manifestScripts=' + info.manifestMessageDisplayScripts +
         ' messageDisplay=' + info.hasMessageDisplay);
  } catch (e) {
    diag('background injoignable: ' + e.message);
  }
}

async function checkApiKey() {
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const btn = document.getElementById('translateBtn');

  const stored = await browser.storage.local.get(['deeplApiKey', 'deeplApiType']);
  const key = stored.deeplApiKey || '';
  const type = stored.deeplApiType || 'free';

  if (!key) {
    statusEl.className = 'status disconnected';
    statusText.textContent = 'Clé API non configurée';
    btn.disabled = true;
    return;
  }

  const usageUrl = type === 'pro'
    ? 'https://api.deepl.com/v2/usage'
    : 'https://api-free.deepl.com/v2/usage';

  try {
    const resp = await fetch(usageUrl, {
      headers: { 'Authorization': 'DeepL-Auth-Key ' + key }
    });
    if (resp.ok) {
      const usage = await resp.json();
      statusEl.className = 'status connected';
      statusText.textContent = 'Connecté à DeepL (' + type + ') — ' +
        usage.character_count + '/' + usage.character_limit + ' caractères';
      btn.disabled = false;
      diag('cle API valide (' + type + ')');
    } else {
      statusEl.className = 'status disconnected';
      statusText.textContent = 'Clé API refusée (HTTP ' + resp.status + ')';
      btn.disabled = true;
      diag('cle API refusee: HTTP ' + resp.status);
    }
  } catch (e) {
    statusEl.className = 'status disconnected';
    statusText.textContent = 'Impossible de joindre DeepL';
    btn.disabled = false;
    diag('verification cle: ' + e.message);
  }
}

async function showLastResult() {
  const stored = await browser.storage.local.get('deeplLastResult');
  const last = stored.deeplLastResult;
  if (last && last.translation) {
    showResult(last.translation);
    document.getElementById('sourceText').value = last.original || '';
    diag('dernier resultat restaure');
  }
}

/* ------------------------------------------------------------------ */

async function getSelectionFromMessage() {
  hideError();
  diag('--- recuperation de la selection ---');

  let result;
  try {
    result = await browser.runtime.sendMessage({ command: 'deeplGetSelection' });
  } catch (e) {
    diag('sendMessage a echoue: ' + e.message);
    showError('Le script d\'arriere-plan ne repond pas. Redemarrez Thunderbird.');
    return;
  }

  if (!result) {
    diag('reponse vide du background');
    showError('Pas de reponse du script d\'arriere-plan.');
    return;
  }

  if (result.diagnostics && result.diagnostics.length) {
    result.diagnostics.forEach(function (d) { diag('  - ' + d); });
  }

  if (result.text) {
    document.getElementById('sourceText').value = result.text;
    diag('selection OK via: ' + result.source + ' (' + result.text.length + ' car.)');
    hideError();
  } else {
    diag('aucune selection (source: ' + result.source + ')');
    showError('Aucun texte selectionne dans le message. Selectionnez du texte puis cliquez l\'icone, ' +
              'ou utilisez le clic droit → « Traduire en français (DeepL) ».');
  }
}

async function translate() {
  const sourceText = document.getElementById('sourceText').value.trim();
  if (!sourceText) {
    showError('Veuillez saisir ou selectionner du texte a traduire.');
    return;
  }
  if (sourceText.length > 10000) {
    showError('Le texte depasse 10 000 caracteres.');
    return;
  }

  hideError();
  setLoading(true);

  try {
    const res = await browser.runtime.sendMessage({ command: 'deeplTranslate', text: sourceText, openWindow: false });
    if (res && res.ok && res.translation) {
      showResult(res.translation);
      diag('traduction OK (' + res.translation.length + ' car.)');
    } else {
      const msg = res && res.error ? res.error : 'erreur inconnue';
      if (msg === 'no_api_key') {
        showError('Cle API DeepL non configuree. Cliquez sur « Configurer la cle API DeepL ».');
      } else {
        showError('Erreur de traduction : ' + msg);
      }
      diag('traduction KO: ' + msg);
    }
  } catch (e) {
    showError('Erreur de traduction : ' + e.message);
    diag('traduction KO: ' + e.message);
  } finally {
    setLoading(false);
  }
}

async function openResultWindow() {
  try {
    await browser.runtime.sendMessage({ command: 'deeplOpenResultWindow' });
    window.close();
  } catch (e) {
    diag('ouverture fenetre KO: ' + e.message);
  }
}

/* ------------------------------------------------------------------ */

function showResult(translation) {
  document.getElementById('resultText').textContent = translation;
  document.getElementById('resultArea').classList.remove('hidden');
}

function showError(message) {
  const el = document.getElementById('error');
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('error').classList.add('hidden');
}

function setLoading(loading) {
  const btn = document.getElementById('translateBtn');
  if (loading) {
    btn.disabled = true;
    btn.textContent = 'Traduction...';
  } else {
    btn.disabled = false;
    btn.textContent = 'Traduire en francais';
  }
}
