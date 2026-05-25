import type { Settings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';

const targetLangSelect = document.getElementById('targetLang') as HTMLSelectElement;
const triggerMethodSelect = document.getElementById('triggerMethod') as HTMLSelectElement;
const themeSelect = document.getElementById('theme') as HTMLSelectElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLElement;

let statusTimeout: ReturnType<typeof setTimeout> | null = null;

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

function setActionState(isSaving: boolean) {
  saveBtn.disabled = isSaving;
  resetBtn.disabled = isSaving;
  saveBtn.textContent = isSaving ? 'Saving settings...' : 'Save settings';
}

function applySettingsToForm(settings: Pick<Settings, 'targetLang' | 'triggerMethod' | 'theme'>) {
  targetLangSelect.value = settings.targetLang;
  triggerMethodSelect.value = settings.triggerMethod;
  themeSelect.value = settings.theme;
}

saveBtn.addEventListener('click', async () => {
  const error = validateSettings();
  if (error) {
    showStatus(error, true);
    return;
  }

  setActionState(true);

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
      showStatus('Settings saved successfully.', false);
    } else {
      showStatus(response?.error || 'Failed to save settings', true);
    }
  } catch (e) {
    showStatus(`Error: ${(e as Error).message}`, true);
  } finally {
    setActionState(false);
  }
});

resetBtn.addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults?')) return;

  setActionState(true);
  applySettingsToForm(DEFAULT_SETTINGS);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: DEFAULT_SETTINGS,
    });

    if (response?.success) {
      showStatus('Default settings restored.', false);
    } else {
      applySettingsToForm(DEFAULT_SETTINGS);
      showStatus(response?.error || 'Failed to reset settings', true);
    }
  } catch (e) {
    applySettingsToForm(DEFAULT_SETTINGS);
    showStatus(`Error: ${(e as Error).message}`, true);
  } finally {
    setActionState(false);
  }
});

function showStatus(message: string, isError: boolean) {
  if (statusTimeout) {
    clearTimeout(statusTimeout);
  }

  statusEl.textContent = message;
  statusEl.className = isError ? 'status error' : 'status';
  statusEl.dataset.visible = 'true';

  statusTimeout = setTimeout(() => {
    statusEl.dataset.visible = 'false';
  }, 3200);
}

loadSettings();
