import type { MessageResponse, MessageType } from './types';

type ExtensionApi = typeof chrome;
type StorageValueMap = Record<string, unknown>;

export type RuntimeInstalledDetails = chrome.runtime.InstalledDetails;
export type RuntimeMessageSender = chrome.runtime.MessageSender;

declare global {
  // eslint-disable-next-line no-var
  var browser: ExtensionApi | undefined;
}

function resolveExtensionApi(): ExtensionApi {
  const api = globalThis.browser ?? globalThis.chrome;
  if (!api) {
    throw new Error('WordSnap extension APIs are unavailable in this context.');
  }
  return api;
}

export const extensionApi = resolveExtensionApi();
export const runtime = extensionApi.runtime;

export async function sendRuntimeMessage<T = unknown>(message: MessageType): Promise<T> {
  if (globalThis.browser?.runtime?.sendMessage) {
    const response = await globalThis.browser.runtime.sendMessage(message) as MessageResponse<T>;
    if (response?.success) {
      return response.data;
    }
    throw new Error(response?.error || 'Unknown error');
  }

  return new Promise<T>((resolve, reject) => {
    extensionApi.runtime.sendMessage(message, (response?: MessageResponse<T>) => {
      if (extensionApi.runtime.lastError) {
        reject(new Error(extensionApi.runtime.lastError.message));
        return;
      }

      if (response?.success) {
        resolve(response.data);
        return;
      }

      reject(new Error(response?.error || 'Unknown error'));
    });
  });
}

export async function getSyncStorageValue<T>(key: string): Promise<T | undefined> {
  if (globalThis.browser?.storage?.sync?.get) {
    const result = await globalThis.browser.storage.sync.get(key) as Record<string, T | undefined>;
    return result[key];
  }

  return new Promise<T | undefined>((resolve, reject) => {
    extensionApi.storage.sync.get(key, (result: StorageValueMap) => {
      if (extensionApi.runtime.lastError) {
        reject(new Error(extensionApi.runtime.lastError.message));
        return;
      }

      resolve(result[key] as T | undefined);
    });
  });
}

export async function setSyncStorageValues(values: StorageValueMap): Promise<void> {
  if (globalThis.browser?.storage?.sync?.set) {
    await globalThis.browser.storage.sync.set(values);
    return;
  }

  return new Promise<void>((resolve, reject) => {
    extensionApi.storage.sync.set(values, () => {
      if (extensionApi.runtime.lastError) {
        reject(new Error(extensionApi.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

export async function openOptionsPage(): Promise<void> {
  if (globalThis.browser?.runtime?.openOptionsPage) {
    await globalThis.browser.runtime.openOptionsPage();
    return;
  }

  return new Promise<void>((resolve, reject) => {
    extensionApi.runtime.openOptionsPage(() => {
      if (extensionApi.runtime.lastError) {
        reject(new Error(extensionApi.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}
