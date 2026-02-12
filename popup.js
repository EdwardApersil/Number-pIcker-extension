
const DEFAULT_SETTINGS = {
  customUrl: 'https://volta.fido.money?number={phone}',
  enabled: true
};


const customUrlInput = document.getElementById('customUrl');
const enabledCheckbox = document.getElementById('enabled');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const statusDiv = document.getElementById('status');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistory');
const exportHistoryBtn = document.getElementById('exportHistory');


document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadHistory();
});


saveBtn.addEventListener('click', saveSettings);
resetBtn.addEventListener('click', resetSettings);
clearHistoryBtn.addEventListener('click', clearHistory);
exportHistoryBtn.addEventListener('click', exportHistory);


function loadSettings() {
  chrome.storage.sync.get('settings', (data) => {
    const settings = data.settings || DEFAULT_SETTINGS;
    customUrlInput.value = settings.customUrl;
    enabledCheckbox.checked = settings.enabled;
  });
}


function saveSettings() {
  const customUrl = customUrlInput.value.trim();
  
  // Validate URL has {phone} placeholder
  if (!customUrl.includes('{phone}')) {
    showStatus('URL must contain {phone} placeholder', 'error');
    return;
  }
  
  const settings = {
    customUrl: customUrl,
    enabled: enabledCheckbox.checked
  };
  
  chrome.storage.sync.set({ settings: settings }, () => {
    showStatus('Settings saved!', 'success');
  });
}


function resetSettings() {
  chrome.storage.sync.set({ settings: DEFAULT_SETTINGS }, () => {
    customUrlInput.value = DEFAULT_SETTINGS.customUrl;
    enabledCheckbox.checked = DEFAULT_SETTINGS.enabled;
    showStatus('Reset to defaults', 'success');
  });
}


function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  
  setTimeout(() => {
    statusDiv.className = 'status';
  }, 3000);
}

function loadHistory() {
  chrome.storage.local.get('callHistory', (data) => {
    const history = data.callHistory || [];
    renderHistory(history);
  });
}

function renderHistory(history) {
  historyList.innerHTML = '';
  
  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-item" style="text-align:center; color:#999; padding: 20px;">No recent calls</div>';
    return;
  }

  history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    
    const date = new Date(item.timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    
    div.innerHTML = `
      <div class="item-row">
        <span class="phone">${item.phoneNumber}</span>
        <span class="time">${dateStr} ${timeStr}</span>
      </div>
      <div class="item-row">
        <span class="meta">${item.callType} • ${item.platform}</span>
        <span class="metrics">Gen:${item.urlGenTime}ms Tab:${item.tabSwitchTime}ms</span>
      </div>
    `;
    historyList.appendChild(div);
  });
}

function clearHistory() {
  chrome.storage.local.set({ callHistory: [] }, () => {
    loadHistory();
    showStatus('History cleared', 'success');
  });
}

function exportHistory() {
  chrome.storage.local.get('callHistory', (data) => {
    const history = data.callHistory || [];
    
    if (history.length === 0) {
      showStatus('No history to export', 'error');
      return;
    }

    // CSV Header
    let csvContent = "Date,Time,Phone Number,Type,Platform,URL Gen Time (ms),Tab Switch Time (ms)\n";

    // CSV Rows
    history.forEach(item => {
      const date = new Date(item.timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString();
      
      // Escape quotes if necessary and format row
      const row = [
        dateStr,
        timeStr,
        `"${item.phoneNumber}"`, // Quote phone number to prevent Excel scientific notation
        item.callType,
        item.platform,
        item.urlGenTime,
        item.tabSwitchTime
      ].join(",");
      
      csvContent += row + "\n";
    });

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    // Generate filename with current date
    const filename = `call_history_${new Date().toISOString().slice(0,10)}.csv`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}
