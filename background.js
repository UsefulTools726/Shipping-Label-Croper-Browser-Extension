// background.js — left-click crops; right-click action menu for secondary tools

const MENU_CORRECT = 'correctCrop';
const MENU_CLEAR = 'clearTemplates';

function isCroppableUrl(url) {
  if (!url) return false;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('about:') || url.startsWith('moz-extension://') ||
      url.startsWith('edge://')) {
    return false;
  }
  return true;
}

function looksLikePdf(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('.pdf') || lower.startsWith('blob:');
}

async function openProcessor(url) {
  const processUrl = chrome.runtime.getURL(
    `process.html?url=${encodeURIComponent(url)}`
  );
  await chrome.tabs.create({ url: processUrl, active: true });
}

async function openEditor(url) {
  const editorUrl = chrome.runtime.getURL(
    `editor.html?url=${encodeURIComponent(url)}`
  );
  await chrome.tabs.create({ url: editorUrl, active: true });
}

async function flashBadge(text, color = '#b42318', ms = 2000) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
    setTimeout(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await updateBadgeForTab(tab);
    }, ms);
  } catch {
    // ignore
  }
}

async function updateBadgeForTab(tab) {
  try {
    if (tab?.url && looksLikePdf(tab.url) && isCroppableUrl(tab.url)) {
      await chrome.action.setBadgeBackgroundColor({ color: '#3d6f99' });
      await chrome.action.setBadgeText({ text: 'PDF', tabId: tab.id });
      await chrome.action.setTitle({
        title: 'Click to crop label · Right-click for more',
        tabId: tab.id
      });
    } else if (tab?.id != null) {
      await chrome.action.setBadgeText({ text: '', tabId: tab.id });
      await chrome.action.setTitle({
        title: 'Open a shipping label PDF, then click to crop',
        tabId: tab.id
      });
    }
  } catch {
    // ignore
  }
}

async function setupContextMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_CORRECT,
    title: 'Correct / Learn Crop…',
    contexts: ['action']
  });
  chrome.contextMenus.create({
    id: MENU_CLEAR,
    title: 'Clear learned templates',
    contexts: ['action']
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

// Ensure menus exist after service worker restarts
setupContextMenus().catch(() => {});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.url || !isCroppableUrl(tab.url)) {
    await flashBadge('!');
    return;
  }
  try {
    await openProcessor(tab.url);
  } catch (err) {
    console.error(err);
    await flashBadge('!');
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_CORRECT) {
    if (!tab?.url || !isCroppableUrl(tab.url)) {
      await flashBadge('!');
      return;
    }
    try {
      await openEditor(tab.url);
    } catch (err) {
      console.error(err);
      await flashBadge('!');
    }
    return;
  }

  if (info.menuItemId === MENU_CLEAR) {
    await chrome.storage.local.set({ templates: [] });
    await flashBadge('OK', '#3d6f99', 1500);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateBadgeForTab(tab);
  } catch {
    // ignore
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id === tabId) {
      await updateBadgeForTab(tab);
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'cropCurrent') {
    if (!message.url || !isCroppableUrl(message.url)) {
      sendResponse({ error: 'Open a shipping label PDF tab first.' });
      return true;
    }
    openProcessor(message.url).then(() => sendResponse({ message: 'Processing…' }));
    return true;
  }

  if (message.action === 'openEditor') {
    if (!message.url || !isCroppableUrl(message.url)) {
      sendResponse({ error: 'Open a shipping label PDF tab first.' });
      return true;
    }
    openEditor(message.url).then(() => sendResponse({ message: 'Opening crop editor…' }));
    return true;
  }

  if (message.action === 'learnCrop') {
    (async () => {
      const { templates = [] } = await chrome.storage.local.get(['templates']);
      const next = templates.filter(t => t.fingerprint !== message.fingerprint);
      next.push({
        fingerprint: message.fingerprint,
        crop: message.crop,
        timestamp: Date.now()
      });
      await chrome.storage.local.set({ templates: next.slice(-50) });
      sendResponse({ success: true, count: next.length });
    })();
    return true;
  }

  if (message.action === 'clearTemplates') {
    (async () => {
      await chrome.storage.local.set({ templates: [] });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'getTemplateCount') {
    (async () => {
      const { templates = [] } = await chrome.storage.local.get(['templates']);
      sendResponse({ count: templates.length });
    })();
    return true;
  }
});

console.log('Shipping Label Cropper background ready');
