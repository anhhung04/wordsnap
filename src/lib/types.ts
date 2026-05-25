// =============================================================================
// WordSnap — Shared Type Definitions
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Dictionary Types
// ---------------------------------------------------------------------------

/** CEFR language proficiency level. */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** Register or formality classification for a word or sense. */
export type Register =
  | 'formal'
  | 'informal'
  | 'literary'
  | 'technical'
  | 'slang'
  | 'archaic'
  | 'humorous'
  | 'offensive'
  | 'vulgar'
  | 'dialect'
  | 'rare'
  | 'old-fashioned';

/** A label or tag attached to a definition. */
export type DefinitionLabel =
  | 'British'
  | 'American'
  | 'Australian'
  | 'Canadian'
  | 'Indian'
  | 'Irish'
  | 'New Zealand'
  | 'Scottish'
  | 'South African'
  | 'regional'
  | 'non-standard'
  | 'approving'
  | 'disapproving'
  | 'figurative'
  | 'ironic'
  | 'polite'
  | 'emphatic';

/** A single phonetic transcription. */
export interface Phonetic {
  /** IPA notation, for example `/ˈsæm.pəl/`. */
  ipa: string;
  /** URL to pronunciation audio. */
  audioUrl?: string;
  /** Region variant for the pronunciation. */
  region: 'UK' | 'US';
}

/** A single collocation pair. */
export interface Collocation {
  /** The collocation phrase, for example `take advantage of`. */
  phrase: string;
  /** Optional example sentence. */
  example?: string;
  /** Source dictionary that provided this collocation. */
  source?: string;
}

/** A single example sentence from dictionary data. */
export interface DictionaryExample {
  /** The example text. */
  text: string;
  /** Optional translation of the example. */
  translation?: string;
  /** Source dictionary that provided this example. */
  source?: string;
}

/** A synonym tied to a specific dictionary sense. */
export interface SenseSynonym {
  /** The synonym word. */
  word: string;
  /** Optional usage note for the synonym. */
  note?: string;
  /** CEFR level of the synonym if known. */
  cefr?: CefrLevel;
}

/** A single definition sense representing one meaning of a word. */
export interface DictionarySense {
  /** Stable identifier for this sense, used for merge deduplication. */
  id: string;
  /** The definition text. */
  definition: string;
  /** Examples for this specific sense. */
  examples: DictionaryExample[];
  /** Labels such as regional, register, or domain tags. */
  labels: DefinitionLabel[];
  /** Register classification for the sense. */
  register?: Register;
  /** Domain or subject area, for example `biology` or `law`. */
  domain?: string;
  /** Synonyms specific to this sense. */
  synonyms: SenseSynonym[];
  /** Antonyms specific to this sense. */
  antonyms: string[];
  /** Source dictionary that provided this sense. */
  source: string;
}

/** A single definition group grouped by part of speech. */
export interface DictionaryDefinition {
  /** Part of speech, for example `noun`, `verb`, or `adjective`. */
  partOfSpeech: string;
  /** Individual senses or meanings for this part of speech. */
  senses: DictionarySense[];
  /** Source dictionaries providing this part-of-speech grouping. */
  sources: string[];
}

/** Word form variations. */
export interface WordForm {
  /** Form type, for example `plural` or `past tense`. */
  form: string;
  /** The inflected word value. */
  value: string;
  /** Optional IPA for this form. */
  ipa?: string;
}

/** An idiom or phrasal verb entry. */
export interface IdiomEntry {
  /** The idiom or phrasal verb phrase. */
  phrase: string;
  /** Definition text. */
  definition: string;
  /** Optional example sentence. */
  example?: string;
  /** Source dictionary that provided this entry. */
  source?: string;
}

/** Usage note containing prescriptive or descriptive guidance. */
export interface UsageNote {
  /** Title of the note, for example `Compare` or `Note`. */
  title: string;
  /** The usage note text. */
  text: string;
  /** Source dictionary that provided this note. */
  source?: string;
}

/** Grammar information for a dictionary entry. */
export interface GrammarInfo {
  /** Grammar patterns, for example `verb + to-infinitive`. */
  patterns: string[];
  /** Grammar usage notes. */
  notes: string[];
  /** Inflected forms. */
  inflections: string[];
}

/** Technical or domain-specific usage information. */
export interface TechnicalUsageItem {
  /** The term in technical or specialized usage. */
  term: string;
  /** The domain associated with the term. */
  domain: string;
  /** Optional domain-specific meaning. */
  meaning?: string;
  /** Optional examples for the specialized usage. */
  examples?: string[];
}

/** Frequency or rank metadata for a word. */
export interface FrequencyInfo {
  /** Approximate corpus rank where `1` is most common. */
  rank?: number;
  /** Frequency band label, for example `Top 1000`. */
  band?: string;
  /** Source of the frequency metadata. */
  source?: string;
}

/**
 * Rich dictionary entry merged from multiple dictionary sources.
 */
export interface RichDictionaryEntry {
  /** The canonical headword. */
  word: string;
  /** Phonetic transcriptions from the best available sources. */
  phonetics: Phonetic[];
  /** Definitions grouped by part of speech. */
  definitions: DictionaryDefinition[];
  /** Deduplicated collocations merged from all sources. */
  collocations: Collocation[];
  /** Word form variations. */
  wordForms: WordForm[];
  /** Idioms and phrasal verbs. */
  idioms: IdiomEntry[];
  /** Global and sense-derived synonyms. */
  synonyms: SenseSynonym[];
  /** Global antonyms. */
  antonyms: string[];
  /** Usage notes. */
  usageNotes: UsageNote[];
  /** Grammar information if available. */
  grammar?: GrammarInfo;
  /** Technical or domain-specific usage items. */
  technicalUsage: TechnicalUsageItem[];
  /** Frequency and corpus rank metadata. */
  frequency: FrequencyInfo;
  /** CEFR level if determinable from any source. */
  cefr?: CefrLevel;
  /** Whether any source returned results. */
  found: boolean;
  /** Source identifiers that contributed data. */
  sources: string[];
  /** Timestamp when the entry was merged. */
  mergedAt: number;
}

// ---------------------------------------------------------------------------
// 2. Translation Types (Google Translate)
// ---------------------------------------------------------------------------

/** Type of detected text. */
export type TextType = 'word' | 'phrase' | 'sentence' | 'paragraph';

/** A definition entry from Google Translate's response. */
export interface GtDefinition {
  /** Part of speech label. */
  pos: string;
  /** Meaning candidates. */
  meanings: string[];
}

/** Translation result from Google Translate. */
export interface TranslationResult {
  /** The original input text. */
  original: string;
  /** The translated result text. */
  translated: string;
  /** Target language as an ISO code. */
  targetLang: string;
  /** Detected or specified source language as an ISO code. */
  sourceLang?: string;
  /** Optional transliteration of the original or translated text. */
  transliteration?: string;
  /** Inferred text type. */
  type: TextType;
  /** Optional explanatory text or note. */
  explanation?: string;
  /** Alternative translations. */
  alternatives?: string[];
  /** Definitions from the translation provider. */
  definitions?: GtDefinition[];
  /** Example sentences. */
  examples?: string[];
  /** Synonyms. */
  synonyms?: string[];
  /** Collocations. */
  collocations?: string[];
  /** Antonyms. */
  antonyms?: string[];
  /** Grammar note. */
  grammar?: string;
  /** Whether the result came from cache. */
  cached?: boolean;
}

// ---------------------------------------------------------------------------
// 3. Legacy Compatibility
// ---------------------------------------------------------------------------

/** @deprecated Use `RichDictionaryEntry` instead. */
export type DictionaryEntry = RichDictionaryEntry;

// ---------------------------------------------------------------------------
// 4. Dictionary Source Types
// ---------------------------------------------------------------------------

/** Identifier for a dictionary source. */
export type DictionarySourceId =
  | 'cambridge'
  | 'longman'
  | 'oxford'
  | 'merriam-webster'
  | 'collins'
  | 'google-translate';

/** Status of a dictionary source lookup. */
export type SourceStatus = 'pending' | 'success' | 'failed' | 'skipped';

/** Result from a single dictionary source lookup. */
export interface SourceLookupResult {
  /** Source identifier. */
  source: DictionarySourceId;
  /** Lookup status. */
  status: SourceStatus;
  /** Rich dictionary entry if the lookup succeeded. */
  entry?: RichDictionaryEntry;
  /** Error message if the lookup failed. */
  error?: string;
  /** Response time in milliseconds. */
  durationMs: number;
}

/** Aggregated lookup results for a single word across all sources. */
export interface MultiSourceLookupResult {
  /** The word that was looked up. */
  word: string;
  /** Individual source results. */
  sources: SourceLookupResult[];
  /** Best consolidated merged entry. */
  merged: RichDictionaryEntry;
  /** Total lookup duration in milliseconds. */
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// 5. Vocabulary Notes
// ---------------------------------------------------------------------------

/** A saved vocabulary note. */
export interface VocabNote {
  /** Database identifier. */
  id?: number;
  /** The saved word or phrase. */
  word: string;
  /** Translation at the time of saving. */
  translation: string;
  /** Source context sentence or snippet. */
  context: string;
  /** Source page URL. */
  sourceUrl: string;
  /** Source page title. */
  sourceTitle: string;
  /** User-defined tags. */
  tags: string[];
  /** CEFR level at the time of saving. */
  cefr?: CefrLevel;
  /** Snapshot of dictionary data at save time. */
  dictionaryData?: RichDictionaryEntry;
  /** Creation timestamp. */
  createdAt: number;
  /** Last update timestamp. */
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// 6. Settings
// ---------------------------------------------------------------------------

/** Theme preference. */
export type Theme = 'light' | 'dark' | 'auto';

/** Density or compactness of the popup UI. */
export type Density = 'compact' | 'normal' | 'comfortable';

/** Popup size preset. */
export type PopupSizePreset = 'small' | 'medium' | 'large' | 'custom';

/** Trigger method for showing the popup. */
export type TriggerMethod = 'select' | 'double-click';

/** Popup size constraints. */
export interface PopupSizeSettings {
  /** Selected size preset. */
  preset: PopupSizePreset;
  /** Custom width in pixels, only used when preset is `custom`. */
  width: number;
  /** Maximum popup height in pixels. */
  maxHeight: number;
  /** Minimum popup width in pixels. */
  minWidth: number;
}

/** Toggles controlling which popup content sections are visible. */
export interface ContentSectionToggles {
  /** Show the translation section. */
  translation: boolean;
  /** Show definitions grouped by part of speech. */
  definitions: boolean;
  /** Show example sentences. */
  examples: boolean;
  /** Show the synonyms section. */
  synonyms: boolean;
  /** Show the antonyms section. */
  antonyms: boolean;
  /** Show the collocations section. */
  collocations: boolean;
  /** Show word forms such as plurals and tense variants. */
  wordForms: boolean;
  /** Show idioms and phrasal verbs. */
  idioms: boolean;
  /** Show CEFR level and frequency information. */
  cefrFrequency: boolean;
  /** Show usage notes. */
  usageNotes: boolean;
  /** Show grammar information. */
  grammar: boolean;
  /** Show technical or domain-specific usage. */
  technicalUsage: boolean;
}

/** Selection flags for enabled dictionary sources. */
export interface SourceSelection {
  /** Whether Cambridge Dictionary is enabled. */
  cambridge: boolean;
  /** Whether Longman Dictionary is enabled. */
  longman: boolean;
  /** Whether Oxford Learner's Dictionary is enabled. */
  oxford: boolean;
  /** Whether Merriam-Webster is enabled. */
  merriamWebster: boolean;
  /** Whether Collins is enabled. */
  collins: boolean;
  /** Whether Google Translate dictionary data is enabled. */
  googleTranslate: boolean;
}

/** Popup behavior settings. */
export interface PopupBehaviorSettings {
  /** Auto-close the popup on page scroll. */
  autoCloseOnScroll: boolean;
  /** Auto-close the popup when clicking outside it. */
  autoCloseOnOutsideClick: boolean;
  /** Animation duration in milliseconds, `0` disables animation. */
  animationDuration: number;
  /** Preferred popup position relative to the selection. */
  positionPreference: 'auto' | 'above' | 'below' | 'center';
  /** Show a trigger icon on selection instead of opening immediately. */
  showTriggerIcon: boolean;
}

/** Data management settings. */
export interface DataManagementSettings {
  /** Automatically save looked-up words to vocabulary. */
  autoSaveWords: boolean;
  /** Maximum number of cached dictionary entries. */
  maxCachedEntries: number;
  /** Dictionary cache TTL in seconds. */
  cacheTTLSeconds: number;
}

/** Complete user settings model. */
export interface Settings {
  /** Target translation language as an ISO 639-1 code. */
  targetLang: string;
  /** Source language hint as an ISO 639-1 code, or empty for auto-detect. */
  sourceLang: string;

  /** How the popup is triggered. */
  triggerMethod: TriggerMethod;
  /** Whether the popup feature is enabled. */
  popupEnabled: boolean;

  /** Selected theme. */
  theme: Theme;
  /** UI density preset. */
  density: Density;
  /** Base font size in pixels. */
  fontSize: number;

  /** Popup size constraints. */
  popupSize: PopupSizeSettings;

  /** Content visibility configuration. */
  contentSections: ContentSectionToggles;

  /** Enabled source configuration. */
  sources: SourceSelection;

  /** Popup interaction behavior settings. */
  behavior: PopupBehaviorSettings;

  /** Data management settings. */
  dataManagement: DataManagementSettings;
}

/** Default application settings. */
export const DEFAULT_SETTINGS: Settings = {
  targetLang: 'vi',
  sourceLang: '',
  triggerMethod: 'select',
  popupEnabled: true,
  theme: 'auto',
  density: 'normal',
  fontSize: 14,
  popupSize: {
    preset: 'medium',
    width: 380,
    maxHeight: 520,
    minWidth: 280,
  },
  contentSections: {
    translation: true,
    definitions: true,
    examples: true,
    synonyms: true,
    antonyms: false,
    collocations: true,
    wordForms: true,
    idioms: false,
    cefrFrequency: true,
    usageNotes: false,
    grammar: false,
    technicalUsage: false,
  },
  sources: {
    cambridge: true,
    longman: false,
    oxford: false,
    merriamWebster: false,
    collins: false,
    googleTranslate: true,
  },
  behavior: {
    autoCloseOnScroll: true,
    autoCloseOnOutsideClick: true,
    animationDuration: 200,
    positionPreference: 'auto',
    showTriggerIcon: true,
  },
  dataManagement: {
    autoSaveWords: false,
    maxCachedEntries: 500,
    cacheTTLSeconds: 3600,
  },
};

// ---------------------------------------------------------------------------
// 7. Message Protocol (Content ↔ Background)
// ---------------------------------------------------------------------------

/** Message union exchanged between content and background scripts. */
export type MessageType =
  | { type: 'TRANSLATE'; text: string }
  | { type: 'LOOKUP_DICTIONARY'; word: string }
  | { type: 'LOOKUP_DICTIONARY_MULTI'; word: string; sources?: DictionarySourceId[] }
  | {
    type: 'SAVE_NOTE';
    note: Omit<VocabNote, 'id' | 'createdAt' | 'updatedAt'>;
    dictionaryData?: RichDictionaryEntry;
  }
  | { type: 'UPDATE_NOTE'; id: number; changes: Partial<VocabNote> }
  | { type: 'GET_NOTES'; query?: string }
  | { type: 'DELETE_NOTE'; id: number }
  | { type: 'EXPORT_NOTES'; format?: 'json' | 'csv' }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'EXPORT_SETTINGS' }
  | { type: 'IMPORT_SETTINGS'; settings: Settings }
  | { type: 'CLEAR_CACHE'; source?: DictionarySourceId }
  | { type: 'GET_CACHE_STATS' }
  | { type: 'FETCH_AUDIO'; url: string };

/** Successful response wrapper for extension messages. */
export interface MessageResponseSuccess<T = unknown> {
  /** Indicates a successful operation. */
  success: true;
  /** Response payload. */
  data: T;
}

/** Failed response wrapper for extension messages. */
export interface MessageResponseError {
  /** Indicates a failed operation. */
  success: false;
  /** Error message describing the failure. */
  error: string;
}

/** Generic message response type. */
export type MessageResponse<T = unknown> =
  | MessageResponseSuccess<T>
  | MessageResponseError;

// ---------------------------------------------------------------------------
// 8. Cache Stats
// ---------------------------------------------------------------------------

/** Cache statistics grouped by dictionary source. */
export interface CacheStats {
  /** Total number of cached entries. */
  entries: number;
  /** Maximum allowed cache entries. */
  maxEntries: number;
  /** Per-source cache entry counts. */
  sources: Record<DictionarySourceId, number>;
}

// ---------------------------------------------------------------------------
// 9. Merge/Source Helpers
// ---------------------------------------------------------------------------

/** Priority order for dictionary sources where lower numbers have higher priority. */
export const SOURCE_PRIORITY: Record<DictionarySourceId, number> = {
  oxford: 1,
  cambridge: 2,
  longman: 3,
  collins: 4,
  'merriam-webster': 5,
  'google-translate': 6,
};

/** Human-readable labels for dictionary sources. */
export const SOURCE_LABELS: Record<DictionarySourceId, string> = {
  oxford: 'Oxford',
  cambridge: 'Cambridge',
  longman: 'Longman',
  collins: 'Collins',
  'merriam-webster': 'Merriam-Webster',
  'google-translate': 'Google Translate',
};

/** Short labels for compact source display. */
export const SOURCE_SHORT_LABELS: Record<DictionarySourceId, string> = {
  oxford: 'OXF',
  cambridge: 'CAM',
  longman: 'LON',
  collins: 'COL',
  'merriam-webster': 'MW',
  'google-translate': 'GT',
};

/** Source accent color tokens mapped to popup CSS variables. */
export const SOURCE_COLORS: Record<DictionarySourceId, string> = {
  oxford: '#1a5276',
  cambridge: '#c7510d',
  longman: '#00796b',
  collins: '#6a1b9a',
  'merriam-webster': '#1565c0',
  'google-translate': '#4285f4',
};
