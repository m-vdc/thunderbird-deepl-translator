/**
 * DeepL Translator - Message Display Script
 *
 * This script is injected by the background script into every message display
 * page (via browser.messageDisplayScripts.register). It runs inside the message
 * content, which is the ONLY place where the user's text selection is visible.
 *
 * It does two things:
 *   1. Answers on-demand "deeplGetSelection" requests from the background/popup.
 *   2. Pushes the current selection to the background on mouseup / keyup, so the
 *      selection survives even if it is lost when the popup takes focus.
 */

(function () {
  // Idempotence guard: this script can be injected twice (once by the
  // "message_display_scripts" manifest key on TB 151+, once by
  // messageDisplayScripts.register() on older versions). Only the first
  // injection must install listeners.
  if (window.__deeplTranslatorInjected) {
    return;
  }
  window.__deeplTranslatorInjected = true;

  const api = typeof browser !== 'undefined' ? browser : (typeof messenger !== 'undefined' ? messenger : null);
  if (!api || !api.runtime) {
    return;
  }

  function currentSelection() {
    try {
      const sel = window.getSelection();
      return sel ? String(sel).trim() : '';
    } catch (e) {
      return '';
    }
  }

  // 1. On-demand request/response.
  api.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message && message.command === 'deeplGetSelection') {
      sendResponse({ text: currentSelection() });
      return true;
    }
    return false;
  });

  // 2. Push the selection to the background so it can be cached.
  let timer = null;
  function pushSelection() {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(function () {
      const text = currentSelection();
      if (!text) {
        return;
      }
      try {
        const p = api.runtime.sendMessage({ command: 'deeplSelectionChanged', text: text });
        if (p && typeof p.catch === 'function') {
          p.catch(function () { /* background may be asleep - harmless */ });
        }
      } catch (e) {
        /* ignore */
      }
    }, 120);
  }

  document.addEventListener('mouseup', pushSelection, true);
  document.addEventListener('keyup', pushSelection, true);
  document.addEventListener('selectionchange', pushSelection, true);
})();
