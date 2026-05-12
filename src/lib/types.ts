// Shared types for WordSnap

export interface TranslationResult {
  original: string;
  translated: string;
  targetLang: string;
  sourceLang?: string;
  type: 'word' | 'phrase' | 'sentence' | 'paragraph';
  explanation?: string;
  alternatives?: string[];
  definitions?: { pos: string; meanings: string[] }[];
  examples?: string[];
  synonyms?: string[];
  cached?: boolean;
}

export interface DictionaryEntry {
  word: string;
  phonetics: {
    ipa: string;
    audioUrl?: string;
  }[];
  definitions: {
    partOfSpeech: string;
    meaning: string;
    examples: string[];
  }[];
  found: boolean;
}

export interface VocabNote {
  id?: number;
  word: string;
  translation: string;
  context: string;
  sourceUrl: string;
  sourceTitle: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  geminiApiKey: string;
  targetLang: string;
  triggerMethod: 'select' | 'double-click';
  theme: 'light' | 'dark' | 'auto';
  popupEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  geminiApiKey: '',
  targetLang: 'vi',
  triggerMethod: 'select',
  theme: 'auto',
  popupEnabled: true,
};

// Message types between content script and service worker
export type MessageType =
  | { type: 'TRANSLATE'; text: string }
  | { type: 'TRANSLATE_AI'; text: string }
  | { type: 'TEST_API_KEY'; apiKey: string }
  | { type: 'LOOKUP_DICTIONARY'; word: string }
  | { type: 'SAVE_NOTE'; note: Omit<VocabNote, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'GET_NOTES'; query?: string }
  | { type: 'DELETE_NOTE'; id: number }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> };

export type MessageResponse =
  | { success: true; data: unknown }
  | { success: false; error: string };
