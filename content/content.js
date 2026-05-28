/**
 * JSON Beautifier Pro - Content Script
 * Detects JSON on pages, handles right-click formatting, and keyboard shortcuts.
 */

(function () {
  'use strict';

  // JSON detection patterns
  const JSON_PATTERNS = [
    /^\s*\{[\s\S]*\}\s*$/,
    /^\s*\[[\s\S]*\]\s*$/
  ];

  // Detect if selected text looks like JSON
  function looksLikeJSON(text) {
    if (!text || text.trim().length === 0) return false;
    const trimmed = text.trim();
    return JSON_PATTERNS.some(pattern => pattern.test(trimmed));
  }

  // Try to parse JSON (returns parsed value or null)
  function tryParseJSON(text) {
    try {
      return JSON.parse(text.trim());
    } catch (e) {
      return null;
    }
  }

  // Scan page for JSON-like content in <pre>, <code>, or visible text nodes
  function detectJSONOnPage() {
    // Check common JSON containers
    const selectors = 'pre, code, .json, .language-json, [class*="json"], script[type="application/json"]';
    const elements = document.querySelectorAll(selectors);
    
    for (const el of elements) {
      const text = el.textContent.trim();
      if (tryParseJSON(text)) {
        chrome.runtime.sendMessage({ action: 'json-detected' });
        return true;
      }
    }
    return false;
  }

  // Run detection after page loads
  setTimeout(() => {
    if (!detectJSONOnPage()) {
      // Also check the body text quickly for JSON
      const bodyText = document.body?.textContent?.trim() || '';
      if (bodyText.length > 50 && bodyText.length < 500000) {
        // Check first 5000 chars for JSON-like patterns
        const sample = bodyText.substring(0, 5000);
        if (looksLikeJSON(sample) && tryParseJSON(sample)) {
          chrome.runtime.sendMessage({ action: 'json-detected' });
        }
      }
    }
  }, 500);

  // Listen for messages from background or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'format-json-selection' || message.action === 'keyboard-shortcut-format') {
      const text = message.text || window.getSelection()?.toString() || '';
      formatAndSend(text);
      return true;
    }

    if (message.action === 'validate-json-selection') {
      const text = message.text || window.getSelection()?.toString() || '';
      validateAndSend(text);
      return true;
    }

    if (message.action === 'get-page-json') {
      // Extract JSON from page and send back
      const json = extractPageJSON();
      sendResponse({ json });
      return true;
    }
  });

  function formatAndSend(text) {
    if (!text || !looksLikeJSON(text)) {
      chrome.runtime.sendMessage({
        action: 'format-result',
        success: false,
        error: chrome.i18n.getMessage('errorEmpty') || 'No valid JSON found in selection.'
      });
      return;
    }

    try {
      const parsed = JSON.parse(text.trim());
      const formatted = JSON.stringify(parsed, null, 2);
      chrome.runtime.sendMessage({
        action: 'format-result',
        success: true,
        formatted,
        original: text.trim()
      });
    } catch (e) {
      chrome.runtime.sendMessage({
        action: 'format-result',
        success: false,
        error: `Invalid JSON: ${e.message}`
      });
    }
  }

  function validateAndSend(text) {
    if (!text || !looksLikeJSON(text)) {
      chrome.runtime.sendMessage({
        action: 'validate-result',
        valid: false,
        error: 'No JSON found in selection.'
      });
      return;
    }

    try {
      JSON.parse(text.trim());
      chrome.runtime.sendMessage({
        action: 'validate-result',
        valid: true,
        message: chrome.i18n.getMessage('validJson') || 'Valid JSON'
      });
    } catch (e) {
      chrome.runtime.sendMessage({
        action: 'validate-result',
        valid: false,
        error: e.message
      });
    }
  }

  function extractPageJSON() {
    // Try common JSON sources
    const scriptTags = document.querySelectorAll('script[type="application/json"]');
    if (scriptTags.length > 0) {
      try {
        return JSON.stringify(JSON.parse(scriptTags[0].textContent), null, 2);
      } catch (e) {
        // fall through
      }
    }

    // Try <pre> and <code> blocks
    const preBlocks = document.querySelectorAll('pre, code');
    for (const block of preBlocks) {
      const text = block.textContent.trim();
      if (tryParseJSON(text)) {
        return JSON.stringify(tryParseJSON(text), null, 2);
      }
    }

    // Try the whole page body as a last resort
    const body = document.body?.textContent?.trim() || '';
    if (looksLikeJSON(body) && tryParseJSON(body)) {
      return JSON.stringify(tryParseJSON(body), null, 2);
    }

    return null;
  }
})();
