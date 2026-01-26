
const DEFAULT_SETTINGS = {
  customUrl: 'https://fido.money/call?number={phone}',
  enabled: true
};

const recentNumbers = new Map();
const COOLDOWN_MS = 120000;

function isDuplicate(phoneNumber) {
  const lastTime = recentNumbers.get(phoneNumber);
  if (lastTime && (Date.now() - lastTime) < COOLDOWN_MS) {
    return true;
  }
  return false;
}


function markProcessed(phoneNumber) {
  recentNumbers.set(phoneNumber, Date.now());

  for (const [num, time] of recentNumbers.entries()) {
    if (Date.now() - time > COOLDOWN_MS) {
      recentNumbers.delete(num);
    }
  }
}

async function handlePhoneNumber(phoneNumber, callType, platform, sourceTabId) {
  const startTime = Date.now();
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');

  if (isDuplicate(cleaned)) {
    return;
  }

  const data = await chrome.storage.sync.get('settings');
  const settings = data.settings || DEFAULT_SETTINGS;

  if (!settings.enabled) {
    return;
  }

  markProcessed(cleaned);

  let url = settings.customUrl
    .replace('{phone}', encodeURIComponent(cleaned))
    .replace(/&country=\{country\}/g, '')
    .replace(/&country=%7Bcountry%7D/g, '')
    .replace(/\?country=\{country\}&?/g, '?')
    .replace(/\?$/, '');

  const urlGenTime = Date.now() - startTime;

  const tabStartTime = Date.now();
  await openOrUpdateCrmTab(url);
  const tabSwitchTime = Date.now() - tabStartTime;

  if (sourceTabId) {
    try {
      chrome.tabs.sendMessage(sourceTabId, { action: 'showAlert', message: `CRM URL generated for ${cleaned}` });
    } catch (e) {
    }
  }

  saveCallLog(cleaned, callType, platform || 'Unknown', urlGenTime, tabSwitchTime);

  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon.png'),
      title: 'CRM URL Generated',
      message: `A CRM URL has been generated for ${cleaned}. Click to open.`,
      requireInteraction: true,
      priority: 2,
      buttons: [
        { title: 'Open CRM URL' }
      ]
    }, (notificationId) => {
    });
    chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
      if (btnIdx === 0 && notifId) {
        chrome.tabs.create({ url });
      }
    });
  } catch (e) {
  }
}


async function saveCallLog(phoneNumber, callType, platform, urlGenTime, tabSwitchTime) {
  const logEntry = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    phoneNumber,
    callType,
    platform,
    urlGenTime: urlGenTime || 0,
    tabSwitchTime: tabSwitchTime || 0
  };

  const data = await chrome.storage.local.get('callHistory');
  const history = data.callHistory || [];
  
  // Add to beginning and keep last 50
  history.unshift(logEntry);
  const trimmedHistory = history.slice(0, 50);
  
  await chrome.storage.local.set({ callHistory: trimmedHistory });
}


async function openOrUpdateCrmTab(url) {
  const data = await chrome.storage.local.get('crmTabId');
  let crmTabId = data.crmTabId;

  if (crmTabId) {
    try {
      const tab = await chrome.tabs.get(crmTabId);
      await chrome.tabs.update(crmTabId, { url: url });
      return;
    } catch (e) {
    }
  }

  const newTab = await chrome.tabs.create({ url: url, active: false });
  await chrome.storage.local.set({ crmTabId: newTab.id });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'phoneDetected') {
    const tabId = sender.tab ? sender.tab.id : null;
    handlePhoneNumber(message.phoneNumber, message.callType, message.platform, tabId);
    sendResponse({ success: true });
  }

  if (message.action === 'getSettings') {
    chrome.storage.sync.get('settings', (data) => {
      sendResponse({ settings: data.settings || DEFAULT_SETTINGS });
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get('settings', (data) => {
    if (!data.settings) {
      chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    }
  });
});
