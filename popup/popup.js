/**
 * JSON Beautifier Pro - Popup Script
 * Core formatting, validation, history, and UI logic.
 */

(function () {
  'use strict';

  // =============================================
  // State
  // =============================================
  const STATE = {
    currentResult: null,
    history: [],
    theme: 'light'
  };

  const MAX_HISTORY = 20;
  const STORAGE_KEYS = {
    history: 'jsonFormatterHistory',
    theme: 'jsonFormatterTheme'
  };

  // =============================================
  // DOM References
  // =============================================
  const $ = (id) => document.getElementById(id);

  const jsonInput = $('jsonInput');
  const lineNumbers = $('lineNumbers');
  const formatBtn = $('formatBtn');
  const minifyBtn = $('minifyBtn');
  const copyBtn = $('copyBtn');
  const copyLabel = $('copyLabel');
  const statusBar = $('statusBar');
  const statusMessage = $('statusMessage');
  const outputSection = $('outputSection');
  const jsonOutput = $('jsonOutput');
  const copyOutputBtn = $('copyOutputBtn');
  const historyList = $('historyList');
  const clearHistoryBtn = $('clearHistoryBtn');
  const themeToggle = $('themeToggle');
  const donateBtn = $('donateBtn');

  // =============================================
  // i18n: Replace __MSG_xxx__ placeholders
  // =============================================
  function applyI18n() {
    document.querySelectorAll('[class]:not([data-i18n-done])').forEach(el => {
      el.setAttribute('data-i18n-done', 'true');
    });

    // Replace __MSG_xxx__ in text nodes and attributes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    const replacements = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent.includes('__MSG_')) {
        const newText = node.textContent.replace(/__MSG_(\w+)__/g, (_, key) => {
          return chrome.i18n.getMessage(key) || key;
        });
        replacements.push({ node, newText });
      }
    }
    replacements.forEach(({ node, newText }) => {
      node.textContent = newText;
    });

    // Update placeholders and attributes
    const placeholderEls = document.querySelectorAll('[placeholder]');
    placeholderEls.forEach(el => {
      el.placeholder = el.placeholder.replace(/__MSG_(\w+)__/g, (_, key) => {
        return chrome.i18n.getMessage(key) || key;
      });
    });

    const titleEls = document.querySelectorAll('[title]');
    titleEls.forEach(el => {
      el.setAttribute('data-original-title', el.title);
      el.title = el.title.replace(/__MSG_(\w+)__/g, (_, key) => {
        return chrome.i18n.getMessage(key) || key;
      });
    });

    const ariaEls = document.querySelectorAll('[aria-label]');
    ariaEls.forEach(el => {
      el.setAttribute('aria-label', el.getAttribute('aria-label').replace(/__MSG_(\w+)__/g, (_, key) => {
        return chrome.i18n.getMessage(key) || key;
      }));
    });
  }

  // =============================================
  // Theme Management
  // =============================================
  function setTheme(theme) {
    STATE.theme = theme;
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    chrome.storage.local.set({ [STORAGE_KEYS.theme]: theme });
  }

  function toggleTheme() {
    const newTheme = STATE.theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  }

  // =============================================
  // Line Numbers
  // =============================================
  function updateLineNumbers() {
    const lines = jsonInput.value.split('\n');
    const count = Math.max(lines.length, 1);
    lineNumbers.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const span = document.createElement('span');
      span.textContent = i;
      lineNumbers.appendChild(span);
    }
    // Sync scroll
    jsonInput.addEventListener('scroll', () => {
      lineNumbers.scrollTop = jsonInput.scrollTop;
    }, { once: false });
  }

  // Clean up duplicate scroll listeners
  let scrollHandlerAttached = false;
  function ensureScrollSync() {
    if (!scrollHandlerAttached) {
      jsonInput.addEventListener('scroll', () => {
        lineNumbers.scrollTop = jsonInput.scrollTop;
      });
      scrollHandlerAttached = true;
    }
  }

  // =============================================
  // Status Display
  // =============================================
  function showStatus(message, type = '') {
    statusBar.classList.remove('hidden', 'success', 'error');
    statusMessage.textContent = message;
    if (type) {
      statusBar.classList.add(type);
    }
    // Auto-hide success after 3s
    if (type === 'success') {
      clearTimeout(statusBar._hideTimeout);
      statusBar._hideTimeout = setTimeout(() => {
        statusBar.classList.add('hidden');
      }, 3000);
    }
  }

  function hideStatus() {
    statusBar.classList.add('hidden');
    clearTimeout(statusBar._hideTimeout);
  }

  // =============================================
  // Core JSON Operations
  // =============================================
  function formatJSON(text) {
    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      return { success: true, result: formatted, parsed };
    } catch (e) {
      // Try to find where the error is
      const match = e.message.match(/position\s+(\d+)/);
      let errorMsg = `Invalid JSON: ${e.message}`;
      if (match) {
        const pos = parseInt(match[1]);
        const lines = text.substring(0, pos).split('\n');
        const line = lines.length;
        const col = lines[lines.length - 1].length + 1;
        errorMsg = `Invalid JSON at line ${line}, col ${col}: ${e.message}`;
      }
      return { success: false, error: errorMsg };
    }
  }

  function minifyJSON(text) {
    try {
      const parsed = JSON.parse(text);
      const minified = JSON.stringify(parsed);
      return { success: true, result: minified, parsed };
    } catch (e) {
      return { success: false, error: `Invalid JSON: ${e.message}` };
    }
  }

  function validateJSON(text) {
    try {
      JSON.parse(text);
      return { valid: true, message: chrome.i18n.getMessage('validJson') || 'Valid JSON' };
    } catch (e) {
      const match = e.message.match(/position\s+(\d+)/);
      let errorMsg = e.message;
      if (match) {
        const pos = parseInt(match[1]);
        const lines = text.substring(0, pos).split('\n');
        const line = lines.length;
        const col = lines[lines.length - 1].length + 1;
        errorMsg = `Error at line ${line}, col ${col}: ${e.message}`;
      }
      return { valid: false, error: errorMsg };
    }
  }

  // =============================================
  // History Management
  // =============================================
  function loadHistory() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.history], (result) => {
        STATE.history = result[STORAGE_KEYS.history] || [];
        resolve();
      });
    });
  }

  function saveHistory() {
    chrome.storage.local.set({ [STORAGE_KEYS.history]: STATE.history });
  }

  function addToHistory(input, output) {
    const entry = {
      id: Date.now(),
      input: input.substring(0, 200),
      output: output.substring(0, 500),
      timestamp: Date.now()
    };
    STATE.history.unshift(entry);
    if (STATE.history.length > MAX_HISTORY) {
      STATE.history = STATE.history.slice(0, MAX_HISTORY);
    }
    saveHistory();
    renderHistory();
  }

  function clearHistory() {
    STATE.history = [];
    saveHistory();
    renderHistory();
  }

  function formatTimestamp(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  }

  function renderHistory() {
    if (STATE.history.length === 0) {
      historyList.innerHTML = `<div class="history-empty">${chrome.i18n.getMessage('emptyHistory') || 'No recent items'}</div>`;
      return;
    }

    historyList.innerHTML = '';
    STATE.history.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.dataset.id = entry.id;

      // Truncate display text
      const displayText = entry.output.length > 80
        ? entry.output.substring(0, 80) + '...'
        : entry.output;

      item.innerHTML = `
        <div class="history-item-content">
          <div class="history-item-text">${escapeHtml(displayText)}</div>
          <div class="history-item-time">${formatTimestamp(entry.timestamp)}</div>
        </div>
        <div class="history-item-actions">
          <button class="icon-btn small history-copy" title="Copy" data-output="${escapeHtml(entry.output)}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
      `;

      // Click to load into editor
      item.querySelector('.history-item-content').addEventListener('click', () => {
        jsonInput.value = entry.output;
        updateLineNumbers();
        showStatus(`Loaded from history (${formatTimestamp(entry.timestamp)})`, 'success');
      });

      // Copy button
      item.querySelector('.history-copy').addEventListener('click', (e) => {
        e.stopPropagation();
        const text = entry.output;
        copyToClipboard(text);
        showStatus('Copied!', 'success');
      });

      historyList.appendChild(item);
    });
  }

  // =============================================
  // Clipboard
  // =============================================
  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
  }

  // =============================================
  // Display Output
  // =============================================
  function showOutput(text) {
    jsonOutput.textContent = text;
    outputSection.classList.remove('hidden');
  }

  function hideOutput() {
    outputSection.classList.add('hidden');
    jsonOutput.textContent = '';
  }

  // =============================================
  // Main Format Action
  // =============================================
  function handleFormat() {
    const input = jsonInput.value.trim();
    if (!input) {
      showStatus(chrome.i18n.getMessage('errorEmpty') || 'Please enter some JSON to format.', 'error');
      return;
    }

    const result = formatJSON(input);
    if (result.success) {
      jsonInput.value = result.result;
      updateLineNumbers();
      showOutput(result.result);
      showStatus(chrome.i18n.getMessage('validJson') || 'Valid JSON', 'success');
      addToHistory(input, result.result);
      STATE.currentResult = result.result;
    } else {
      showStatus(result.error, 'error');
      hideOutput();
      STATE.currentResult = null;
    }
  }

  function handleMinify() {
    const input = jsonInput.value.trim();
    if (!input) {
      showStatus(chrome.i18n.getMessage('errorEmpty') || 'Please enter some JSON to minify.', 'error');
      return;
    }

    const result = minifyJSON(input);
    if (result.success) {
      jsonInput.value = result.result;
      updateLineNumbers();
      showOutput(result.result);
      showStatus('Minified successfully', 'success');
      addToHistory(input, result.result);
      STATE.currentResult = result.result;
    } else {
      showStatus(result.error, 'error');
      STATE.currentResult = null;
    }
  }

  function handleCopy() {
    const text = jsonInput.value.trim();
    if (!text) {
      showStatus('Nothing to copy.', 'error');
      return;
    }
    copyToClipboard(text);
    copyLabel.textContent = chrome.i18n.getMessage('copied') || 'Copied!';
    showStatus('Copied to clipboard!', 'success');
    setTimeout(() => {
      copyLabel.textContent = chrome.i18n.getMessage('copyBtn') || 'Copy';
    }, 2000);
  }

  // =============================================
  // Keyboard Shortcuts inside popup
  // =============================================
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Enter / Cmd+Enter = Format
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleFormat();
      }
      // Escape = close popup
      if (e.key === 'Escape') {
        window.close();
      }
      // Ctrl+Shift+C = Copy
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        handleCopy();
      }
    });
  }

  // =============================================
  // Helper: Escape HTML
  // =============================================
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // =============================================
  // Auto-detect JSON from current page
  // =============================================
  function requestPageJSON() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) return;
      chrome.tabs.sendMessage(tabs[0].id, { action: 'get-page-json' }, (response) => {
        if (chrome.runtime.lastError) return; // No content script
        if (response?.json) {
          jsonInput.value = response.json;
          updateLineNumbers();
          showStatus(chrome.i18n.getMessage('autoDetected') || 'Auto-detected JSON from this page', 'success');
          handleFormat();
        }
      });
    });
  }

  // =============================================
  // Donate Button
  // =============================================
  function setupDonate() {
    donateBtn.addEventListener('click', () => {
      const email = chrome.i18n.getMessage('donateEmail') || 'jsonbeautifierpro@proton.me';
      const subject = encodeURIComponent('Support JSON Beautifier Pro');
      const body = encodeURIComponent('Hi! I\'d like to support your work on JSON Beautifier Pro.\n\n---\nSent from JSON Beautifier Pro');
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    });
  }

  // =============================================
  // Theme from storage
  // =============================================
  function loadTheme() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.theme], (result) => {
        const savedTheme = result[STORAGE_KEYS.theme] || 'light';
        setTheme(savedTheme);
        resolve();
      });
    });
  }

  // =============================================
  // Init
  // =============================================
  async function init() {
    // Apply i18n
    applyI18n();

    // Load theme
    await loadTheme();

    // Load history
    await loadHistory();
    renderHistory();

    // Update line numbers initially
    updateLineNumbers();
    ensureScrollSync();

    // Sync line numbers on input
    let lineTimeout;
    jsonInput.addEventListener('input', () => {
      clearTimeout(lineTimeout);
      lineTimeout = setTimeout(updateLineNumbers, 100);
      hideOutput();
      hideStatus();
    });

    // Tab support in textarea
    jsonInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = jsonInput.selectionStart;
        const end = jsonInput.selectionEnd;
        jsonInput.value = jsonInput.value.substring(0, start) + '  ' + jsonInput.value.substring(end);
        jsonInput.selectionStart = jsonInput.selectionEnd = start + 2;
        updateLineNumbers();
      }
    });

    // Button handlers
    formatBtn.addEventListener('click', handleFormat);
    minifyBtn.addEventListener('click', handleMinify);
    copyBtn.addEventListener('click', handleCopy);
    copyOutputBtn.addEventListener('click', () => {
      const text = jsonOutput.textContent;
      if (text) {
        copyToClipboard(text);
        showStatus('Output copied!', 'success');
      }
    });
    clearHistoryBtn.addEventListener('click', clearHistory);
    themeToggle.addEventListener('click', toggleTheme);

    // Keyboard shortcuts
    setupKeyboardShortcuts();

    // Donate
    setupDonate();

    // Auto-detect JSON from page after a short delay
    setTimeout(requestPageJSON, 300);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
