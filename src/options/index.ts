import type { Settings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';

const targetLangSelect = document.getElementById('targetLang') as HTMLSelectElement;
const triggerMethodSelect = document.getElementById('triggerMethod') as HTMLSelectElement;
const themeSelect = document.getElementById('theme') as HTMLSelectElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLElement;
const notesLink = document.getElementById('notesLink') as HTMLAnchorElement;

notesLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('notes/index.html') });
});

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response?.success) {
      const settings = response.data as Settings;
      targetLangSelect.value = settings.targetLang;
      triggerMethodSelect.value = settings.triggerMethod;
      themeSelect.value = settings.theme;
    }
  } catch (e) {
    showStatus(`Failed to load settings: ${(e as Error).message}`, true);
  }
}

function validateSettings(): string | null {
  const targetLang = targetLangSelect.value;
  if (!targetLang || targetLang.length < 2) return 'Invalid target language';
  if (!['select', 'double-click'].includes(triggerMethodSelect.value)) return 'Invalid trigger method';
  if (!['light', 'dark', 'auto'].includes(themeSelect.value)) return 'Invalid theme';
  return null;
}

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

resetBtn.addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults?')) return;

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

loadSettings();
