const PHONE_REGEX = /\+?\d{10,15}/g;
const COUNTRY_CODES = ['233', '234', '254', '255', '256', '27', '20', '1', '44', '33', '49', '91', '86', '971', '966'];
const processedNumbers = new Set();

// Blocked numbers (agent numbers - significant last 9 digits)
const BLOCKED_NUMBERS = new Set([
  '596922421',
  '596922420',
]);

let lastDialedNumber = '';
let lastDetectedIncomingNumber = '';
let incomingNumberTimeout = null;

function init() {
  console.log('[CRM Extension] Detector initializing...');
  listenForFreshcallerEvents();
  listenForWebRTCEvents();
  watchXcallyDialer();
  watchForCallIndicators();
}

function listenForFreshcallerEvents() {
  window.addEventListener('freshcaller-call-detected', function (event) {
    const { phone, type, isActualCall } = event.detail;

    console.log('[CRM Extension] Freshcaller event received:', { phone, type, isActualCall });

    if (isActualCall) {
      const callType = type === 'outgoing' ? 'Outgoing' : 'Incoming';
      console.log('[CRM Extension] Processing Freshcaller call:', callType);
      sendPhoneNumber(phone, callType, 'Freshdesk');
    }
  });
}

function listenForWebRTCEvents() {
  window.addEventListener('webrtc-call-detected', function (event) {
    console.log('[CRM Extension] WebRTC call detected - searching for phone number...');

    let phone = null;
    let callType = 'Unknown';

    // Priority 1: Check last dialed number (outgoing)
    if (lastDialedNumber && lastDialedNumber.length >= 10) {
      phone = lastDialedNumber;
      callType = 'Outgoing';
      console.log('[CRM Extension] Found outgoing number:', phone);
    }
    // Priority 2: Check last detected incoming
    else if (lastDetectedIncomingNumber) {
      phone = lastDetectedIncomingNumber;
      callType = 'Incoming';
      console.log('[CRM Extension] Found incoming number:', phone);
    }
    // Priority 3: Search the page
    else {
      phone = findPhoneNumberOnPage();
      if (phone) {
        callType = 'Unknown';
        console.log('[CRM Extension] Found number on page:', phone);
      }
    }

    if (phone) {
      sendPhoneNumber(phone, callType, 'Xcally');
      // Clear after processing
      lastDialedNumber = '';
      lastDetectedIncomingNumber = '';

      // Clear timeout since we processed it
      if (incomingNumberTimeout) {
        clearTimeout(incomingNumberTimeout);
        incomingNumberTimeout = null;
      }
    } else {
      console.warn('[CRM Extension] WebRTC call detected but no phone number found');
    }
  });
}

// Check if a number is blocked (agent number)
function isBlockedNumber(phone) {
  const digits = phone.replace(/\D/g, '');

  // Check if the number ends with any of the blocked sequences
  for (const blocked of BLOCKED_NUMBERS) {
    if (digits.endsWith(blocked)) {
      console.log('[CRM Extension] ✗ Number is blocked (agent):', digits);
      return true;
    }
  }

  return false;
}

// NEW: Check if number looks like a DID (starts with 2335969)
function isDIDNumber(phone) {
  const digits = phone.replace(/\D/g, '');
  // DID numbers follow pattern: 2335969xxxxx
  if (digits.startsWith('2335969') && digits.length === 12) {
    console.log('[CRM Extension] Number looks like DID:', digits);
    return true;
  }
  return false;
}

function findPhoneNumberOnPage() {
  const callSelectors = [
    '[class*="active-call"]',
    '[class*="in-call"]',
    '[class*="calling"]',
    '[class*="caller-id"]',
    '[class*="call-number"]',
    '[class*="phone-number"]',
    '[class*="dialed"]',
  ];

  for (const selector of callSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.value || el.textContent || '';
      const match = text.match(/\+?\d{10,15}/);
      if (match) {
        // Skip if it's a blocked number or DID
        if (!isBlockedNumber(match[0]) && !isDIDNumber(match[0])) {
          console.log('[CRM Extension] Found phone in element:', selector, match[0]);
          return match[0];
        } else {
          console.log('[CRM Extension] Skipping blocked/DID number in element:', selector);
        }
      }
    }
  }

  const inputSelectors = [
    'input[type="tel"]',
    'input[class*="phone"]',
    'input[class*="number"]'
  ];

  for (const selector of inputSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.value || el.textContent || '';
      const match = text.match(/\+?\d{10,15}/);
      if (match) {
        // Skip if it's a blocked number or DID
        if (!isBlockedNumber(match[0]) && !isDIDNumber(match[0])) {
          console.log('[CRM Extension] Found phone in input:', selector, match[0]);
          return match[0];
        } else {
          console.log('[CRM Extension] Skipping blocked/DID number in input:', selector);
        }
      }
    }
  }

  return null;
}

function watchXcallyDialer() {
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;

    const value = target.value || '';
    const digits = value.replace(/\D/g, '');

    if (digits.length >= 10) {
      lastDialedNumber = digits;
      console.log('[CRM Extension] Dialer input captured:', digits.substring(0, 5) + '...');
    }
  }, true);
}

function watchForCallIndicators() {
  const STARTUP_DELAY = 2000;
  let isReady = false;

  setTimeout(() => {
    isReady = true;
    console.log('[CRM Extension] Call indicator monitoring ready');
  }, STARTUP_DELAY);

  const startObserver = () => {
    const observer = new MutationObserver((mutations) => {
      if (!isReady) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (looksLikeCallUI(node)) {
              checkForIncomingNumber(node);
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  if (document.body) {
    startObserver();
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver);
    } else {
      const checkBody = setInterval(() => {
        if (document.body) {
          clearInterval(checkBody);
          startObserver();
        }
      }, 10);
    }
  }
}

function looksLikeCallUI(element) {
  const className = (typeof element.className === 'string' ? element.className : '').toLowerCase();
  const id = (element.id || '').toLowerCase();

  const callKeywords = [
    'call', 'phone', 'dialer', 'incoming', 'outgoing',
    'ringing', 'modal', 'popup', 'dialog', 'notification',
    'webrtc', 'voip', 'softphone', 'toast', 'alert'
  ];

  const elementText = className + ' ' + id;
  return callKeywords.some(keyword => elementText.includes(keyword));
}

function checkForIncomingNumber(element) {
  const text = element.textContent || '';
  const className = (typeof element.className === 'string' ? element.className : '').toLowerCase();

  console.log('[CRM Extension] 🔍 Checking element for incoming number');

  // Find ALL phone numbers in the element
  const allPhones = text.match(/\+?\d{10,15}/g);

  if (allPhones && allPhones.length > 0) {
    console.log('[CRM Extension] Found', allPhones.length, 'phone number(s):', allPhones);

    const isIncomingIndicator =
      text.toLowerCase().includes('from:') ||
      text.toLowerCase().includes('incoming') ||
      text.toLowerCase().includes('ringing') ||
      text.toLowerCase().includes('call from') ||
      text.toLowerCase().includes('queue:') ||
      className.includes('incoming') ||
      className.includes('caller');

    if (isIncomingIndicator) {
      console.log('[CRM Extension] Element looks like incoming call UI');

      // NEW: Detect platform based on text patterns
      const isFreshdesk =
        text.includes('CS_MTN_DID') ||
        text.includes('QUEUE') ||
        (text.includes('Incoming Call') && allPhones.length >= 2);

      const isXcally = text.includes('From:') || text.includes('Queue:');

      console.log('[CRM Extension] Platform detection - Freshdesk:', isFreshdesk, 'Xcally:', isXcally);

      // FRESHDESK LOGIC: Skip first number (DID), use second number (caller)
      if (isFreshdesk && allPhones.length >= 2) {
        console.log('[CRM Extension] Freshdesk popup detected');

        // Skip first number (DID), pick second number (caller)
        const callerNumber = allPhones[1];

        if (!isBlockedNumber(callerNumber)) {
          lastDetectedIncomingNumber = callerNumber;
          console.log('[CRM Extension] ✓ Freshdesk caller (2nd number):', callerNumber);

          if (incomingNumberTimeout) {
            clearTimeout(incomingNumberTimeout);
          }

          incomingNumberTimeout = setTimeout(() => {
            if (lastDetectedIncomingNumber === callerNumber) {
              console.log('[CRM Extension] Sending Freshdesk incoming call');
              sendPhoneNumber(callerNumber, 'Incoming', 'Freshdesk');  // ← Changed to Freshdesk
              lastDetectedIncomingNumber = '';
            }
          }, 3000);

          return;
        } else {
          console.log('[CRM Extension] Freshdesk 2nd number is blocked:', callerNumber);
        }
      }

      // XCALLY LOGIC: Look for "From:" or filter blocked/DID numbers
      if (isXcally || !isFreshdesk) {
        console.log('[CRM Extension] Xcally popup detected (or fallback)');

        // Try to find number after "From:"
        const fromMatch = text.match(/From[:\s]+(\+?\d{10,15})/i);
        if (fromMatch && fromMatch[1]) {
          const fromNumber = fromMatch[1];
          if (!isBlockedNumber(fromNumber) && !isDIDNumber(fromNumber)) {
            lastDetectedIncomingNumber = fromNumber;
            console.log('[CRM Extension] ✓ Xcally caller after "From:":', fromNumber);

            if (incomingNumberTimeout) {
              clearTimeout(incomingNumberTimeout);
            }

            incomingNumberTimeout = setTimeout(() => {
              if (lastDetectedIncomingNumber === fromNumber) {
                console.log('[CRM Extension] Sending Xcally incoming call');
                sendPhoneNumber(fromNumber, 'Incoming', 'Xcally');
                lastDetectedIncomingNumber = '';
              }
            }, 3000);

            return;
          }
        }

        // Fallback: Filter out blocked/DID and pick first valid
        for (const phone of allPhones) {
          if (!isBlockedNumber(phone) && !isDIDNumber(phone)) {
            lastDetectedIncomingNumber = phone;
            console.log('[CRM Extension] ✓ Xcally caller (filtered):', phone);

            if (incomingNumberTimeout) {
              clearTimeout(incomingNumberTimeout);
            }

            incomingNumberTimeout = setTimeout(() => {
              if (lastDetectedIncomingNumber === phone) {
                console.log('[CRM Extension] Sending Xcally incoming call (fallback)');
                sendPhoneNumber(phone, 'Incoming', 'Xcally');
                lastDetectedIncomingNumber = '';
              }
            }, 3000);

            return;
          } else {
            console.log('[CRM Extension] Skipping blocked/DID:', phone);
          }
        }
      }

      console.log('[CRM Extension] ⚠️ No valid caller number found');
    }
  }
}

function normalizePhone(phone) {
  let digits = phone.replace(/\D/g, '');

  if (digits.length > 12) {
    const rest = digits.substring(3);
    const hasCountryCode = COUNTRY_CODES.some(c => rest.startsWith(c));
    if (hasCountryCode) {
      digits = rest;
      console.log('[CRM Extension] Stripped agent prefix, normalized to:', digits);
    }
  }

  return '+' + digits;
}

function sendPhoneNumber(phone, callType, platform = 'Unknown') {
  const normalized = normalizePhone(phone);

  // Final check - don't send if it's a blocked number or DID
  if (isBlockedNumber(normalized) || isDIDNumber(normalized)) {
    console.log('[CRM Extension] ✗ Blocking agent/DID number before sending:', normalized);
    return;
  }

  if (processedNumbers.has(normalized)) {
    console.log('[CRM Extension] ✗ Duplicate number blocked:', normalized);
    return;
  }

  processedNumbers.add(normalized);
  setTimeout(() => {
    processedNumbers.delete(normalized);
    console.log('[CRM Extension] Number removed from duplicate cache:', normalized);
  }, 120000);

  console.log('[CRM Extension] ✓ Sending to background:', {
    phone: normalized,
    callType: callType,
    platform: platform
  });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({
        action: 'phoneDetected',
        phoneNumber: normalized,
        callType: callType,
        platform: platform
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[CRM Extension] Message send error:', chrome.runtime.lastError);
        } else {
          console.log('[CRM Extension] Message sent successfully:', response);
        }
      });
    } catch (e) {
      console.error('[CRM Extension] Failed to send message:', e);
    }
  }
}

init();
console.log('[CRM Extension] Detector initialized and ready');
