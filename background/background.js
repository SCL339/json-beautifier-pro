/**
 * JSON Beautifier Pro - Background Service Worker
 * Handles context menus, keyboard shortcuts, and cross-tab messaging.
 */

// Create context menus on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'format-json-selection',
    title: chrome.i18n.getMessage('contextMenuFormat'),
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'validate-json-selection',
    title: chrome.i18n.getMessage('contextMenuValidate'),
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'format-json-selection' || info.menuItemId === 'validate-json-selection') {
    chrome.tabs.sendMessage(tab.id, {
      action: info.menuItemId,
      text: info.selectionText
    });
  }
});

// Handle keyboard shortcut command
chrome.commands.onCommand.addListener((command) => {
  if (command === 'format-json') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'keyboard-shortcut-format' });
      }
    });
  }
});

// Listen for auto-detected JSON from content script - show badge
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'json-detected' && sender.tab?.id) {
    chrome.action.setBadgeText({
      text: 'JSON',
      tabId: sender.tab.id
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#4CAF50',
      tabId: sender.tab.id
    });
  }

  if (message.action === 'json-detected-clear' && sender.tab?.id) {
    chrome.action.setBadgeText({
      text: '',
      tabId: sender.tab.id
    });
  }

  // Simple forward for validation/formatting from popup
  if (message.action === 'forward-to-content' && sender.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, message.payload);
  }

  return true;
});
