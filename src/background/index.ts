import { translate as geminiTranslate } from '@/lib/ai';
import { googleTranslate } from '@/lib/google-translate';
import { lookupWord } from '@/lib/cambridge';
import { saveNote, getNotes, deleteNote } from '@/lib/db';
import { getSettings, updateSettings } from '@/lib/storage';
import type { MessageType, MessageResponse } from '@/lib/types';

// Service Worker message handler
chrome.runtime.onMessage.addListener(
  (message: MessageType, _sender, sendResponse: (response: MessageResponse) => void) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message || 'Unknown error' });
    });
    return true; // Keep message channel open for async response
  }
);

async function handleMessage(message: MessageType): Promise<MessageResponse> {
  switch (message.type) {
    case 'TRANSLATE': {
      // Google Translate is primary (free, no API key needed)
      // Gemini is optional enhancement (requires API key)
      const result = await googleTranslate(message.text);
      return { success: true, data: result };
    }
    case 'TRANSLATE_AI': {
      // Optional AI-enhanced translation via Gemini
      const settings = await getSettings();
      if (!settings.geminiApiKey) {
        return { success: false, error: 'Gemini API key not configured' };
      }
      const result = await geminiTranslate(message.text);
      return { success: true, data: result };
    }
    case 'TEST_API_KEY': {
      const testResult = await testGeminiKey(message.apiKey);
      return testResult;
    }
    case 'LOOKUP_DICTIONARY': {
      const entry = await lookupWord(message.word);
      return { success: true, data: entry };
    }
    case 'SAVE_NOTE': {
      const id = await saveNote(message.note);
      return { success: true, data: { id } };
    }
    case 'GET_NOTES': {
      const notes = await getNotes(message.query);
      return { success: true, data: notes };
    }
    case 'DELETE_NOTE': {
      await deleteNote(message.id);
      return { success: true, data: null };
    }
    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { success: true, data: settings };
    }
    case 'UPDATE_SETTINGS': {
      const updated = await updateSettings(message.settings);
      return { success: true, data: updated };
    }
    default:
      return { success: false, error: 'Unknown message type' };
  }
}

async function testGeminiKey(apiKey: string): Promise<MessageResponse> {
  if (!apiKey.trim()) {
    return { success: false, error: 'API key is empty' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say "ok" in one word.' }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    });

    if (response.ok) {
      return { success: true, data: { valid: true, message: 'API key is valid!' } };
    }

    const err = await response.json().catch(() => ({}));
    const errorMsg = (err as { error?: { message?: string } })?.error?.message || `HTTP ${response.status}`;

    if (response.status === 400) {
      return { success: false, error: `Invalid API key: ${errorMsg}` };
    }
    if (response.status === 403) {
      return { success: false, error: `Access denied: ${errorMsg}` };
    }
    if (response.status === 429) {
      // Rate limited but key is valid
      return { success: true, data: { valid: true, message: 'API key is valid (rate limited, try again later)' } };
    }

    return { success: false, error: `API error: ${errorMsg}` };
  } catch (e) {
    return { success: false, error: `Network error: ${(e as Error).message}` };
  }
}

// Open notes page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('notes/index.html') });
});

// Open options page on install if no API key set
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const settings = await getSettings();
    if (!settings.geminiApiKey) {
      chrome.runtime.openOptionsPage();
    }
  }
});
