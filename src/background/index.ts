import { googleTranslate } from '@/lib/google-translate';
import { lookupWord } from '@/lib/cambridge';
import { saveNote, getNotes, deleteNote } from '@/lib/db';
import { getSettings, updateSettings } from '@/lib/storage';
import type { MessageType, MessageResponse } from '@/lib/types';

chrome.runtime.onMessage.addListener(
  (message: MessageType, _sender: chrome.runtime.MessageSender, sendResponse: (response: MessageResponse) => void) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message || 'Unknown error' });
    });
    return true;
  }
);

async function handleMessage(message: MessageType): Promise<MessageResponse> {
  switch (message.type) {
    case 'TRANSLATE': {
      const result = await googleTranslate(message.text);
      return { success: true, data: result };
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

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('notes/index.html') });
});

chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});
