import { Settings, DEFAULT_SETTINGS } from './types';

const STORAGE_KEY = 'wordsnap_settings';

function deepMergeSettings(defaults: Settings, stored?: Partial<Settings>): Settings {
  if (!stored) {
    return {
      ...defaults,
      popupSize: { ...defaults.popupSize },
      contentSections: { ...defaults.contentSections },
      sources: { ...defaults.sources },
      behavior: { ...defaults.behavior },
      dataManagement: { ...defaults.dataManagement },
    };
  }

  return {
    ...defaults,
    ...stored,
    popupSize: { ...defaults.popupSize, ...(stored.popupSize || {}) },
    contentSections: { ...defaults.contentSections, ...(stored.contentSections || {}) },
    sources: { ...defaults.sources, ...(stored.sources || {}) },
    behavior: { ...defaults.behavior, ...(stored.behavior || {}) },
    dataManagement: { ...defaults.dataManagement, ...(stored.dataManagement || {}) },
  };
}

export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(STORAGE_KEY, (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[WordSnap] Storage read error:', chrome.runtime.lastError.message);
          resolve(deepMergeSettings(DEFAULT_SETTINGS));
          return;
        }
        const stored = result[STORAGE_KEY] as Partial<Settings> | undefined;
        resolve(deepMergeSettings(DEFAULT_SETTINGS, stored));
      });
    } catch {
      resolve(deepMergeSettings(DEFAULT_SETTINGS));
    }
  });
}

export async function updateSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated = deepMergeSettings(current, partial);
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
