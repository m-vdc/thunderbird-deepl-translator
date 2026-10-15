/**
 * DeepL Translator for Thunderbird - Background Script (v1.1.0)
 *
 * IMPORTANT ORDER: the runtime.onMessage listener is registered FIRST, before
 * any other API call. In v1.0.0 the script called browser.contextMenus.create()
 * at top level; that API does not exist in Thunderbird (the correct one is
 * browser.menus, with the "menus" permission), so the script threw and died
 * before the listener was registered -> the popup got
 * "Could not establish connection. Receiving end does not exist."
 */

const DEEPL_API_URLS = {
  free: 'https://api-free.deepl.com/v2/translate',
  pro: 'https://api.deepl.com/v2/translate'
};

let apiKey = '';
let apiType = 'free';

// tabId -> last known selected text in that message display tab
const selectionCache = new Map();

/* ------------------------------------------------------------------ *
 * 1. MESSAGE HANDLING - registered first, must never be skipped
 * ------------------------------------------------------------------ */

browser.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.command) {
    return false;
  }

  switch (message.command) {
    // Pushed by the message display script on mouseup / keyup.
    case 'deeplSelectionChanged': {
      const tabId = sender && sender.tab ? sender.tab.id : undefined;
      if (tabId !== undefined) {
        selectionCache.set(tabId, message.text || '');
      }
      return false;
    }

    // The popup asks for the current selection.
    case 'deeplGetSelection':
      resolveSelection(sender && sender.tab)
        .then(function (result) { sendResponse(result); })
        .catch(function (e) {
          sendResponse({ text: '', source: 'error', diagnostics: [String(e)] });
        });
      return true;

    // The popup asks the background to translate.
    case 'deeplTranslate':
      translateText(message.text, sender && sender.tab, { openWindow: message.openWindow !== false })
        .then(function (res) { sendResponse(res); })
        .catch(function (e) {
          sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
        });
      return true;

    // The popup asks to show the result in the floating window.
    case 'deeplOpenResultWindow':
      openResultWindow()
        .then(function () { sendResponse({ ok: true }); })
        .catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
      return true;

    // Health check / diagnostics.
    case 'deeplPing': {
      let manifestScripts = false;
      try {
        const mf = browser.runtime.getManifest();
        manifestScripts = Array.isArray(mf.message_display_scripts) && mf.message_display_scripts.length > 0;
      } catch (e) { /* ignore */ }
      sendResponse({
        ok: true,
        version: '1.3.1',
        hasMenus: !!(browser.menus && browser.menus.create),
        hasMessageDisplayScripts: !!(browser.messageDisplayScripts && browser.messageDisplayScripts.register),
        manifestMessageDisplayScripts: manifestScripts,
        hasMessageDisplay: !!browser.messageDisplay,
        apiKeyConfigured: !!apiKey,
        apiType: apiType,
        cachedTabs: Array.from(selectionCache.keys())
      });
      return true;
    }

    default:
      return false;
  }
});

/* ------------------------------------------------------------------ *
 * 2. Settings
 * ------------------------------------------------------------------ */

function loadSettings() {
  browser.storage.local.get(['deeplApiKey', 'deeplApiType']).then(function (result) {
    apiKey = result.deeplApiKey || '';
    apiType = result.deeplApiType || 'free';
  }).catch(function (e) {
    console.error('[DeepL] loadSettings failed:', e);
  });
}

browser.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'local') {
    return;
  }
  if (changes.deeplApiKey) {
    apiKey = changes.deeplApiKey.newValue || '';
  }
  if (changes.deeplApiType) {
    apiType = changes.deeplApiType.newValue || 'free';
  }
});

loadSettings();

/* ------------------------------------------------------------------ *
 * 3. Context menu - Thunderbird API: browser.menus + "menus" permission
 * ------------------------------------------------------------------ */

function setupMenus() {
  if (!browser.menus || !browser.menus.create) {
    console.warn('[DeepL] browser.menus unavailable - context menu disabled.');
    return;
  }

  browser.menus.create({
    id: 'deepl-translate-selection',
    title: 'Traduire en français (DeepL)',
    contexts: ['selection']
  }, function () {
    if (browser.runtime.lastError) {
      console.error('[DeepL] menus.create failed:', browser.runtime.lastError.message);
    }
  });

  browser.menus.onClicked.addListener(function (info, tab) {
    if (info.menuItemId === 'deepl-translate-selection' && info.selectionText) {
      translateText(info.selectionText, tab).catch(function (e) {
        console.error('[DeepL] menu translation failed:', e);
      });
    }
  });
}

/* ------------------------------------------------------------------ *
 * 4. Message display script - the only way to read the selection
 * ------------------------------------------------------------------ */

function registerMessageDisplayScript() {
  if (!browser.messageDisplayScripts || !browser.messageDisplayScripts.register) {
    console.warn('[DeepL] browser.messageDisplayScripts unavailable - selection capture disabled.');
    return;
  }
  try {
    const p = browser.messageDisplayScripts.register({
      js: [{ file: 'messageDisplay.js' }],
      runAt: 'document_idle'
    });
    if (p && typeof p.catch === 'function') {
      p.catch(function (e) {
        console.error('[DeepL] messageDisplayScripts.register failed:', e);
      });
    }
  } catch (e) {
    console.error('[DeepL] messageDisplayScripts.register threw:', e);
  }
}

/* ------------------------------------------------------------------ *
 * 5. Selection resolution - 3 strategies, with diagnostics
 * ------------------------------------------------------------------ */

async function resolveSelection(senderTab) {
  const diagnostics = [];
  let tabId = senderTab && senderTab.id !== undefined ? senderTab.id : null;

  if (tabId === null) {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        tabId = tabs[0].id;
      }
    } catch (e) {
      diagnostics.push('tabs.query: ' + e.message);
    }
  }

  if (tabId === null) {
    diagnostics.push('aucun onglet identifiable');
    return { text: '', source: 'none', diagnostics: diagnostics };
  }

  // Strategy 1: cached push from the message display script.
  const cached = selectionCache.get(tabId);
  if (cached && cached.trim()) {
    return { text: cached.trim(), source: 'cache (message display script)', diagnostics: diagnostics };
  }
  diagnostics.push('cache vide pour tab ' + tabId);

  // Strategy 2: ask the message display script directly.
  try {
    const resp = await browser.tabs.sendMessage(tabId, { command: 'deeplGetSelection' });
    if (resp && resp.text && resp.text.trim()) {
      return { text: resp.text.trim(), source: 'message display script', diagnostics: diagnostics };
    }
    diagnostics.push('sendMessage OK mais aucune selection active dans le message');
  } catch (e) {
    diagnostics.push('sendMessage KO (script non injecte) : ' + e.message);
  }

  // Strategy 3: inject into all frames (web tabs / older Thunderbird).
  try {
    const results = await browser.tabs.executeScript(tabId, {
      allFrames: true,
      code: [
        '(function () {',
        '  try {',
        '    var mp = document.getElementById("messagepane");',
        '    if (mp && mp.contentDocument) {',
        '      var s = mp.contentDocument.getSelection();',
        '      if (s && String(s).trim()) return String(s).trim();',
        '    }',
        '    var sel = window.getSelection();',
        '    if (sel && String(sel).trim()) return String(sel).trim();',
        '    var frames = document.querySelectorAll("iframe");',
        '    for (var i = 0; i < frames.length; i++) {',
        '      try {',
        '        var d = frames[i].contentDocument || frames[i].contentWindow.document;',
        '        var s2 = d.getSelection();',
        '        if (s2 && String(s2).trim()) return String(s2).trim();',
        '      } catch (e2) {}',
        '    }',
        '  } catch (e3) {}',
        '  return "";',
        '})();'
      ].join('\n')
    });
    if (results && results.length) {
      for (const r of results) {
        if (r && typeof r === 'string' && r.trim()) {
          return { text: r.trim(), source: 'executeScript', diagnostics: diagnostics };
        }
      }
    }
    diagnostics.push('executeScript: aucune selection trouvee');
  } catch (e) {
    diagnostics.push('executeScript: ' + e.message);
  }

  return { text: '', source: 'none', diagnostics: diagnostics };
}

/* ------------------------------------------------------------------ *
 * 6. Translation
 * ------------------------------------------------------------------ */

async function translateText(text, tab, options) {
  // The popup displays the result inline, so it asks for no window.
  const showWindow = !options || options.openWindow !== false;
  if (!apiKey) {
    notify('Clé API DeepL non configurée', 'Ouvrez les options de l\'extension pour saisir votre clé.');
    return { ok: false, error: 'no_api_key' };
  }
  if (!text || !text.trim()) {
    notify('Aucun texte sélectionné', 'Sélectionnez du texte dans un message, puis réessayez.');
    return { ok: false, error: 'no_text' };
  }
  if (text.length > 10000) {
    notify('Texte trop long', 'Le texte dépasse 10 000 caractères.');
    return { ok: false, error: 'too_long' };
  }

  const url = DEEPL_API_URLS[apiType] || DEEPL_API_URLS.free;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'DeepL-Auth-Key ' + apiKey
    },
    body: new URLSearchParams({
      text: text,
      target_lang: 'FR',
      preserve_formatting: '1'
    })
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const err = await response.json();
      detail = err.message || detail;
    } catch (e) { /* not json */ }
    throw new Error('DeepL ' + response.status + ' - ' + detail);
  }

  const data = await response.json();
  const translation = data.translations && data.translations[0] ? data.translations[0].text : '';

  if (!translation) {
    throw new Error('Aucune traduction reçue');
  }

  // Keep the last result so the popup can display it (context-menu path).
  await browser.storage.local.set({
    deeplLastResult: { original: text, translation: translation, at: Date.now() }
  });

  // Show the full result in a floating window. A desktop notification cannot
  // display more than a few lines (truncated on Windows), so it is only used
  // for short error messages.
  if (showWindow) {
    await openResultWindow();
  }
  return { ok: true, translation: translation };
}

/* ------------------------------------------------------------------ *
 * 6b. Floating result window (reused if already open)
 * ------------------------------------------------------------------ */

let resultWindowId = null;

async function openResultWindow() {
  // Reuse the existing window if it is still open.
  if (resultWindowId !== null) {
    try {
      await browser.windows.update(resultWindowId, { focused: true });
      return resultWindowId;
    } catch (e) {
      resultWindowId = null;
    }
  }

  const base = {
    url: browser.runtime.getURL('result.html'),
    width: 560,
    height: 500
  };

  let win;
  try {
    win = await browser.windows.create(Object.assign({ type: 'popup' }, base));
  } catch (e) {
    // Some Thunderbird builds do not accept type:"popup".
    win = await browser.windows.create(base);
  }
  resultWindowId = win.id;
  return resultWindowId;
}

if (browser.windows && browser.windows.onRemoved) {
  browser.windows.onRemoved.addListener(function (windowId) {
    if (windowId === resultWindowId) {
      resultWindowId = null;
    }
  });
}

function notify(title, message) {
  try {
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon48.png'),
      title: title,
      message: message
    });
  } catch (e) {
    console.error('[DeepL] notification failed:', e);
  }
}

/* ------------------------------------------------------------------ *
 * 7. Keyboard shortcut
 * ------------------------------------------------------------------ */

if (browser.commands && browser.commands.onCommand) {
  browser.commands.onCommand.addListener(function (command, tab) {
    if (command !== 'translate-selection') {
      return;
    }
    resolveSelection(tab).then(function (result) {
      if (result.text) {
        return translateText(result.text, tab);
      }
      notify('Aucune sélection', 'Sélectionnez du texte dans un message, puis relancez le raccourci.');
      return null;
    }).catch(function (e) {
      console.error('[DeepL] command failed:', e);
    });
  });
}

/* ------------------------------------------------------------------ *
 * 8. Initialise the optional parts (never fatal)
 * ------------------------------------------------------------------ */

setupMenus();
registerMessageDisplayScript();

console.log('[DeepL] background v1.3.1 ready. menus=' + !!(browser.menus && browser.menus.create) +
  ' messageDisplayScripts=' + !!(browser.messageDisplayScripts && browser.messageDisplayScripts.register));
