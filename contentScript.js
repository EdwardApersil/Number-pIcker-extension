
const PHONE_REGEX = /\+?\d{10,15}/g;
const COUNTRY_CODES = ['233', '234', '254', '255', '256', '27', '20', '1', '44', '33', '49', '91', '86', '971', '966'];
const processedNumbers = new Set();

const seenElements = new WeakSet();

let lastDialedNumber = '';
let lastDetectedIncomingNumber = '';

function init() {
  listenForFreshcallerEvents();  
  listenForWebRTCEvents();       
  watchXcallyDialer();    
  watchForNewPopups();           
}


function listenForFreshcallerEvents() {
  window.addEventListener('freshcaller-call-detected', function(event) {
    const { phone, type } = event.detail;
    sendPhoneNumber(phone, type === 'outgoing' ? 'Outgoing' : 'Incoming', 'Freshdesk');
  });
}


function listenForWebRTCEvents() {
  window.addEventListener('webrtc-call-detected', function(event) {
    
    let phone = null;
    let callType = 'Unknown';

      
    if (lastDialedNumber && lastDialedNumber.length >= 10) {
      phone = lastDialedNumber;
      callType = 'Outgoing';
    }

    else if (lastDetectedIncomingNumber) {
      phone = lastDetectedIncomingNumber;
      callType = 'Incoming';
    }

    else {
      phone = findPhoneNumberOnPage();
      if (phone) {
        callType = 'Unknown';
      }
    }
    
    if (phone) {
      sendPhoneNumber(phone, callType, 'Xcally');
      lastDialedNumber = '';
      lastDetectedIncomingNumber = '';
    }
  });
}


function findPhoneNumberOnPage() {
  const selectors = [
    '[class*="phone-number"]',
    '[class*="caller-id"]',
    '[class*="call-number"]',
    '[class*="dialed"]',
    '[class*="calling"]',
    'input[type="tel"]',
    'input[class*="phone"]',
    'input[class*="number"]'
  ];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.value || el.textContent || '';
      const match = text.match(/\+?\d{10,15}/);
      if (match) {
        return match[0];
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
    }
  }, true);
}


function watchForNewPopups() {
  const STARTUP_DELAY = 1500;  
  let isReady = false;
  
  setTimeout(() => {
    isReady = true;
  }, STARTUP_DELAY);
  
  const startObserver = () => {
    const observer = new MutationObserver((mutations) => {
      if (!isReady) return;
      
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (!seenElements.has(node)) {
              seenElements.add(node);
              checkIfCallScreen(node);
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

function checkIfCallScreen(element) {
  const text = element.textContent || '';
  const className = (typeof element.className === 'string' ? element.className : '').toLowerCase();

  const phoneInText = text.match(/\+?\d{10,15}/);

  if (phoneInText) {
    const phone = phoneInText[0];

    const isIncomingIndicator = 
      text.includes('From:') ||
      text.includes('Incoming') ||
      text.includes('Ringing') ||
      text.includes('call from') ||
      className.includes('incoming');
    
    if (isIncomingIndicator) {
      lastDetectedIncomingNumber = phone;
      sendPhoneNumber(phone, 'Incoming', 'Xcally');
    }
  }
  
}


function extractPhone(text) {
  const fromMatch = text.match(/From:\s*(\+\d{10,15})/i);
  if (fromMatch) return fromMatch[1];

  const fromMatch2 = text.match(/from\s+(\+\d{10,15})/i);
  if (fromMatch2) return fromMatch2[1];

  const telMatch = text.match(/tel:(\+?\d{10,15})/i);
  if (telMatch) return telMatch[1];
  
  // Try standalone phone
  const phoneMatch = text.match(PHONE_REGEX);
  if (phoneMatch && phoneMatch.length === 1) {
    return phoneMatch[0];
  }
  
  return null;
}

function normalizePhone(phone) {
  let digits = phone.replace(/\D/g, '');
  
  // Strip agent initials (e.g., 413) if number is too long
  if (digits.length > 12) {
    const rest = digits.substring(3);
    const hasCountryCode = COUNTRY_CODES.some(c => rest.startsWith(c));
    if (hasCountryCode) {
      digits = rest;
    }
  }
  
  return '+' + digits;
}

function sendPhoneNumber(phone, callType, platform = 'Unknown') {
  const normalized = normalizePhone(phone);
  
  // Duplicate check
  if (processedNumbers.has(normalized)) {
    return;
  }
  
  processedNumbers.add(normalized);
  setTimeout(() => processedNumbers.delete(normalized), 120000);
  
  // Send to background
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({
        action: 'phoneDetected',
        phoneNumber: normalized,
        callType: callType,
        platform: platform
      }).catch(() => {});
    } catch (e) {}
  }
}

init();
