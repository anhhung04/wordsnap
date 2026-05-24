// Shared types for WordSnap

export interface TranslationResult {
  original: string;
  translated: string;
  targetLang: string;
  sourceLang?: string;
  transliteration?: string;
  type: 'word' | 'phrase' | 'sentence' | 'paragraph';
  explanation?: string;
  alternatives?: string[];
  definitions?: { pos: string; meanings: string[] }[];
  examples?: string[];
  synonyms?: string[];
  collocations?: string[];
  antonyms?: string[];
  grammar?: string;
  cached?: boolean;
}

export interface DictionaryDefinition {
  partOfSpeech: string;
  meaning: string;
  examples: string[];
  labels?: string[];
  domain?: string;
}

export interface GrammarInfo {
  patterns: string[];
  notes: string[];
  inflections: string[];
}

export interface TechnicalUsageItem {
  term: string;
  domain: string;
  meaning?: string;
  examples?: string[];
}

export interface DictionaryEntry {
  word: string;
  phonetics: {
    ipa: string;
    audioUrl?: string;
    region?: 'UK' | 'US';
  }[];
  definitions: DictionaryDefinition[];
  examples?: string[];
  synonyms?: string[];
  collocations?: string[];
  grammar?: GrammarInfo;
  technicalUsage?: TechnicalUsageItem[];
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
  targetLang: string;
  triggerMethod: 'select' | 'double-click';
  theme: 'light' | 'dark' | 'auto';
  popupEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  targetLang: 'vi',
  triggerMethod: 'select',
  theme: 'auto',
  popupEnabled: true,
};

// Message types between content script and service worker
export type MessageType =
  | { type: 'TRANSLATE'; text: string }
  | { type: 'LOOKUP_DICTIONARY'; word: string }
  | { type: 'SAVE_NOTE'; note: Omit<VocabNote, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'GET_NOTES'; query?: string }
  | { type: 'DELETE_NOTE'; id: number }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> };

export type MessageResponse =
  | { success: true; data: unknown }
  | { success: false; error: string };
