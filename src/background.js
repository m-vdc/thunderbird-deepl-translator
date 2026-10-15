/**
 * DeepL Translator for Thunderbird - Background Script
 * Handles context menu, DeepL API calls, and message passing
 */

const DEEPL_API_URLS = {
  free: 'https://api-free.deepl.com/v2/translate',
  pro: 'https://api.deepl.com/v2/translate'
};

let apiKey = '';
let apiType = 'free';

// Load API key from storage on startup
browser.storage.local.get(['deeplApiKey', 'deeplApiType']).then(result => {
  apiKey = result.deeplApiKey || '';
  apiType = result.deeplApiType || 'free';
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.deeplApiKey) {
    apiKey = changes.deeplApiKey.newValue || '';
  }
  if (changes.deeplApiType) {
    apiType = changes.deeplApiType.newValue || 'free';
  }
});

// Create context menu on install/startup
browser.contextMenus.create({
  id: 'deepl-translate-selection',
  title: 'Traduire en français (DeepL)',
  contexts: ['selection'],
  documentUrlPatterns: ['*://*/*', 'mailto:*']
}, () => {
  if (browser.runtime.lastError) {
    console.error('Context menu creation failed:', browser.runtime.lastError);
  }
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'deepl-translate-selection' && info.selectionText) {
    await translateText(info.selectionText, tab);
  }
});

// Handle keyboard shortcut
browser.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'translate-selection') {
    // Get selected text from the active message
    const selectedText = await getSelectedText(tab);
    if (selectedText) {
      await translateText(selectedText, tab);
    }
  }
});

async function getSelectedText(tab) {
  try {
    // For Thunderbird message display, we need to inject a content script
    const results = await browser.tabs.executeScript(tab.id, {
      code: 'window.getSelection().toString()',
      runAt: 'document_start'
    });
    return results && results[0] ? results[0].trim() : '';
  } catch (e) {
    console.error('Failed to get selection:', e);
    return '';
  }
}

async function translateText(text, tab) {
  if (!apiKey) {
    showNotification('Clé API DeepL non configurée', 'Veuillez configurer votre clé API dans les options de l\'extension.', 'warning');
    openOptionsPage();
    return;
  }

  if (!text || text.trim().length === 0) {
    showNotification('Aucun texte sélectionné', 'Veuillez sélectionner du texte à traduire.', 'info');
    return;
  }

  if (text.length > 10000) {
    showNotification('Texte trop long', 'Le texte dépasse 10 000 caractères. Veuillez sélectionner un passage plus court.', 'warning');
    return;
  }

  try {
    showNotification('Traduction en cours...', 'Connexion à DeepL...', 'info');

    const response = await fetch(DEEPL_API_URLS[apiType], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `DeepL-Auth-Key ${apiKey}`
      },
      body: new URLSearchParams({
        text: text,
        target_lang: 'FR',
        preserve_formatting: '1',
        tag_handling: 'html'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`DeepL API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    const translation = data.translations?.[0]?.text || '';

    if (!translation) {
      throw new Error('Aucune traduction reçue');
    }

    // Show result in a notification and offer to copy/replace
    await showTranslationResult(text, translation, tab);

  } catch (error) {
    console.error('Translation error:', error);
    showNotification('Erreur de traduction', error.message || 'Impossible de traduire le texte.', 'error');
  }
}

async function showTranslationResult(original, translation, tab) {
  // Store for potential replacement
  await browser.storage.session.set({
    lastTranslation: { original, translation, tabId: tab.id }
  });

  // Show notification with actions
  const notificationId = 'deepl-result-' + Date.now();
  await browser.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('icons/icon48.png'),
    title: 'Traduction (Français)',
    message: translation.length > 200 ? translation.substring(0, 200) + '...' : translation,
    priority: 2,
    buttons: [
      { title: 'Copier la traduction' },
      { title: 'Remplacer dans le message' }
    ],
    requireInteraction: true
  });

  // Handle notification button clicks
  browser.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
    if (notifId === notificationId) {
      const stored = await browser.storage.session.get('lastTranslation');
      const { translation } = stored.lastTranslation || {};

      if (buttonIndex === 0) {
        // Copy to clipboard
        await copyToClipboard(translation);
        showNotification('Copié !', 'La traduction a été copiée dans le presse-papiers.', 'success');
      } else if (buttonIndex === 1) {
        // Replace in message (requires compose window)
        await replaceInCompose(tab, translation);
      }
    }
  });

  // Auto-close after 30 seconds
  setTimeout(() => browser.notifications.clear(notificationId), 30000);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Fallback for Thunderbird
    await browser.tabs.executeScript({
      code: `navigator.clipboard.writeText(${JSON.stringify(text)})`
    });
  }
}

async function replaceInCompose(tab, translation) {
  try {
    // Check if we're in a compose window
    const tabInfo = await browser.tabs.get(tab.id);
    if (tabInfo.url.includes('compose')) {
      await browser.tabs.executeScript(tab.id, {
        code: `
          const editor = document.querySelector('#msgcomposeWindow') || 
                         document.querySelector('.moz-text-html') ||
                         document.querySelector('[contenteditable="true"]');
          if (editor) {
            const sel = window.getSelection();
            if (sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              range.insertNode(document.createTextNode(${JSON.stringify(translation)}));
            }
          }
        `
      });
      showNotification('Remplacé !', 'Le texte a été remplacé par la traduction.', 'success');
    } else {
      showNotification('Non disponible', 'Le remplacement ne fonctionne que dans une fenêtre de composition.', 'warning');
    }
  } catch (e) {
    console.error('Replace failed:', e);
    showNotification('Erreur', 'Impossible de remplacer le texte.', 'error');
  }
}

function showNotification(title, message, type = 'info') {
  const iconMap = {
    success: 'icons/icon48.png',
    warning: 'icons/icon48.png',
    error: 'icons/icon48.png',
    info: 'icons/icon48.png'
  };

  browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL(iconMap[type] || iconMap.info),
    title: title,
    message: message,
    priority: type === 'error' ? 2 : 1
  });
}

function openOptionsPage() {
  browser.runtime.openOptionsPage();
}

// Listen for messages from popup/content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'translate':
      translateText(message.text, sender.tab).then(() => sendResponse({ success: true }));
      return true;
    case 'getApiKey':
      sendResponse({ apiKey, apiType });
      return true;
  }
});

console.log('DeepL Translator background script loaded');