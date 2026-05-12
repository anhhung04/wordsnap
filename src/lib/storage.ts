import { Settings, DEFAULT_SETTINGS } from './types';

const STORAGE_KEY = 'wordsnap_settings';

export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(STORAGE_KEY, (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[WordSnap] Storage read error:', chrome.runtime.lastError.message);
          resolve({ ...DEFAULT_SETTINGS });
          return;
        }
        const stored = result[STORAGE_KEY] as Partial<Settings> | undefined;
        resolve({ ...DEFAULT_SETTINGS, ...stored });
      });
    } catch {
      resolve({ ...DEFAULT_SETTINGS });
    }
  });
}

export async function updateSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.set({ [STORAGE_KEY]: updated }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(updated);
      });
    } catch (e) {
      reject(e);
    }
  });
}
