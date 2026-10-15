/**
 * DeepL Translator for Thunderbird - Floating result window (v1.3.0)
 *
 * Replaces the desktop notification: a notification on Windows cannot show
 * more than a few lines, so long translations were truncated. This window
 * shows the whole text, scrollable and selectable.
 *
 * The window is reused: if it is already open, the background focuses it
 * instead of opening a second one, and the new result is pushed through
 * storage.onChanged.
 */

let lastOriginal = '';
let lastTranslation = '';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('translateBtn').addEventListener('click', translate);

  await loadLastResult();

  // A translation triggered elsewhere (context menu, shortcut, popup)
  // arrives here as a storage change.
  browser.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes.deeplLastResult) {
      return;
    }
    applyResult(changes.deeplLastResult.newValue, true);
  });
}

function applyResult(entry, fromExternal) {
  if (!entry || !entry.translation) {
    return;
  }

  // Do not clobber text the user is editing, unless it is untouched.
  const ta = document.getElementById('sourceText');
  if (!fromExternal || ta.value === lastOriginal || ta.value.trim() === '') {
    ta.value = entry.original || '';
  }

  lastOriginal = entry.original || '';
  lastTranslation = entry.translation;

  const el = document.getElementById('resultText');
  el.classList.remove('placeholder');
  el.textContent = entry.translation;

  document.getElementById('statusInline').textContent =
    lastTranslation.length + ' caractères';
}

async function loadLastResult() {
  const stored = await browser.storage.local.get('deeplLastResult');
  if (stored.deeplLastResult) {
    applyResult(stored.deeplLastResult, false);
  }
}

async function translate() {
  const text = document.getElementById('sourceText').value.trim();
  const errorEl = document.getElementById('error');

  if (!text) {
    errorEl.textContent = 'Aucun texte à traduire.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (text.length > 10000) {
    errorEl.textContent = 'Le texte dépasse 10 000 caractères.';
    errorEl.classList.remove('hidden');
    return;
  }

  errorEl.classList.add('hidden');
  setLoading(true);

  try {
    const res = await browser.runtime.sendMessage({ command: 'deeplTranslate', text: text });
    if (res && res.ok && res.translation) {
      lastOriginal = text;
      applyResult({ original: text, translation: res.translation }, false);
    } else {
      const msg = res && res.error ? res.error : 'erreur inconnue';
      errorEl.textContent = msg === 'no_api_key'
        ? 'Clé API DeepL non configurée.'
        : 'Erreur de traduction : ' + msg;
      errorEl.classList.remove('hidden');
    }
  } catch (e) {
    errorEl.textContent = 'Erreur de traduction : ' + e.message;
    errorEl.classList.remove('hidden');
  } finally {
    setLoading(false);
  }
}

function setLoading(loading) {
  const btn = document.getElementById('translateBtn');
  btn.disabled = loading;
  btn.textContent = loading ? 'Traduction...' : 'Traduire en français';
  document.getElementById('statusInline').textContent = loading ? 'appel à DeepL...' : '';
}
