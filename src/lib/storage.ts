import { getSyncStorageValue, setSyncStorageValues } from './extension-api';
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
  try {
    const stored = await getSyncStorageValue<Partial<Settings>>(STORAGE_KEY);
    return deepMergeSettings(DEFAULT_SETTINGS, stored);
  } catch (error) {
    console.warn('[WordSnap] Storage read error:', (error as Error).message);
    return deepMergeSettings(DEFAULT_SETTINGS);
  }
}

export async function updateSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated = deepMergeSettings(current, partial);
  await setSyncStorageValues({ [STORAGE_KEY]: updated });
  return updated;
}
