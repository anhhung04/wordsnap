import type { Settings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';

const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const targetLangSelect = document.getElementById('targetLang') as HTMLSelectElement;
const triggerMethodSelect = document.getElementById('triggerMethod') as HTMLSelectElement;
const themeSelect = document.getElementById('theme') as HTMLSelectElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLElement;
const notesLink = document.getElementById('notesLink') as HTMLAnchorElement;
const testKeyBtn = document.getElementById('testKeyBtn') as HTMLButtonElement;
const testResultEl = document.getElementById('testResult') as HTMLElement;

// Fix notes link to open as extension page
notesLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('notes/index.html') });
});

// Load current settings
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response?.success) {
      const settings = response.data as Settings;
      apiKeyInput.value = settings.geminiApiKey;
      targetLangSelect.value = settings.targetLang;
      triggerMethodSelect.value = settings.triggerMethod;
      themeSelect.value = settings.theme;
    }
  } catch (e) {
    showStatus(`Failed to load settings: ${(e as Error).message}`, true);
  }
}

// Validate settings before save
function validateSettings(): string | null {
  const targetLang = targetLangSelect.value;
  if (!targetLang || targetLang.length < 2) return 'Invalid target language';
  const validTriggers = ['select', 'double-click', 'shortcut'];
  if (!validTriggers.includes(triggerMethodSelect.value)) return 'Invalid trigger method';
  const validThemes = ['light', 'dark', 'auto'];
  if (!validThemes.includes(themeSelect.value)) return 'Invalid theme';
  return null;
}

// Save settings
saveBtn.addEventListener('click', async () => {
  const error = validateSettings();
  if (error) {
    showStatus(error, true);
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const settings: Partial<Settings> = {
      geminiApiKey: apiKeyInput.value.trim(),
      targetLang: targetLangSelect.value,
      triggerMethod: triggerMethodSelect.value as Settings['triggerMethod'],
      theme: themeSelect.value as Settings['theme'],
    };

    const response = await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings,
    });

    if (response?.success) {
      showStatus('Settings saved!', false);
    } else {
      showStatus(response?.error || 'Failed to save settings', true);
    }
  } catch (e) {
    showStatus(`Error: ${(e as Error).message}`, true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
  }
});

// Reset
resetBtn.addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults?')) return;

  apiKeyInput.value = DEFAULT_SETTINGS.geminiApiKey;
  targetLangSelect.value = DEFAULT_SETTINGS.targetLang;
  triggerMethodSelect.value = DEFAULT_SETTINGS.triggerMethod;
  themeSelect.value = DEFAULT_SETTINGS.theme;

  await chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: DEFAULT_SETTINGS,
  });

  showStatus('Settings reset to defaults', false);
});

function showStatus(message: string, isError: boolean) {
  statusEl.textContent = message;
  statusEl.className = isError ? 'status error' : 'status';
  statusEl.style.display = 'block';
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

// Test API Key
testKeyBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showTestResult('Please enter an API key first', 'error');
    return;
  }

  testKeyBtn.disabled = true;
  testKeyBtn.textContent = 'Testing...';
  showTestResult('Testing API key...', 'loading');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'TEST_API_KEY', apiKey });

    if (response?.success) {
      const data = response.data as { message: string };
      showTestResult(`✓ ${data.message}`, 'success');
    } else {
      showTestResult(`✗ ${response?.error || 'Test failed'}`, 'error');
    }
  } catch (e) {
    showTestResult(`✗ Network error: ${(e as Error).message}`, 'error');
  } finally {
    testKeyBtn.disabled = false;
    testKeyBtn.textContent = 'Test';
  }
});

function showTestResult(message: string, type: 'success' | 'error' | 'loading') {
  testResultEl.textContent = message;
  testResultEl.className = `test-result ${type}`;
}

loadSettings();
