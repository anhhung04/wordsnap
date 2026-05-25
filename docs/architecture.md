# WordSnap Enhanced Architecture

## 1. Extended Type Definitions

All types live in [`src/lib/types.ts`](src/lib/types.ts). The enhanced version replaces the existing interfaces entirely.

### 1.1 Core Lookup Result — `RichDictionaryEntry`

```typescript
// Standardized proficiency levels following CEFR scale
type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

// Usage register (formality / context)
type Register = 'formal' | 'informal' | 'literary' | 'technical' | 'archaic' | 'slang' | 'vulgar' | 'humorous' | 'dialect' | 'neutral';

// Source identifier for attribution
type SourceId = 'cambridge' | 'longman' | 'oxford' | 'merriam-webster' | 'collins' | 'google-translate';

interface SourceAttribution {
  source: SourceId;
  url?: string;
  retrievedAt: number; // epoch ms
  confidence?: 'high' | 'medium' | 'low'; // parser confidence
}

interface Phonetic {
  ipa: string;
  audioUrl?: string;
  region?: 'UK' | 'US';
  source: SourceId; // which dictionary provided this
}

interface WordForm {
  type: 'plural' | 'past-tense' | 'past-participle' | 'present-participle' | 
        'third-person-singular' | 'comparative' | 'superlative' | 'singular' | 'base';
  text: string;
  source: SourceId;
}

interface Sense {
  id: string; // stable ID for dedup: `${pos}::${meaning.substring(0,40)}`
  partOfSpeech: string;
  meaning: string;
  examples: string[];
  labels: string[];
  domain?: string;
  register?: Register;
  cefr?: CEFRLevel;
  sources: SourceId[]; // which dictionaries agree on this sense
  attributions: SourceAttribution[];
}

interface DefinitionBlock {
  partOfSpeech: string;
  senses: Sense[];
  synonyms: string[];
  antonyms: string[];
  sources: SourceId[];
  attributions: SourceAttribution[];
}

interface Collocation {
  text: string;
  type?: 'verb-noun' | 'adjective-noun' | 'adverb-verb' | 'preposition' | 'phrase';
  examples: string[];
  sources: SourceId[];
}

interface Idiom {
  text: string;
  meaning: string;
  examples: string[];
  sources: SourceId[];
}

interface PhrasalVerb {
  verb: string;       // e.g., "give up"
  meaning: string;
  examples: string[];
  sources: SourceId[];
}

interface UsageNote {
  text: string;
  category?: 'grammar' | 'register' | 'regional' | 'common-error' | 'comparison';
  sources: SourceId[];
}

interface GrammarInfo {
  patterns: string[];
  notes: string[];
  inflections: string[];
  sources: SourceId[];
}

interface WordFamily {
  baseWord: string;
  members: Array<{
    word: string;
    partOfSpeech: string;
    relationship: 'derivative' | 'compound' | 'root';
  }>;
  sources: SourceId[];
}

// Frequency band (per-million-words or simplified band)
interface FrequencyInfo {
  band: 'very-high' | 'high' | 'medium' | 'low' | 'rare';
  rank?: number;
  source: SourceId;
}

interface RichDictionaryEntry {
  word: string;
  lookedUp: string; // original query (may differ from headword after lemmatization)

  // Pronunciation
  phonetics: Phonetic[];

  // Core definitions — merged & deduplicated across sources
  definitionBlocks: DefinitionBlock[];

  // Aggregated content
  collocations: Collocation[];
  idioms: Idiom[];
  phrasalVerbs: PhrasalVerb[];
  wordForms: WordForm[];
  synonyms: string[];
  antonyms: string[];
  examples: string[]; // top-level examples not tied to a specific sense

  // Meta
  grammar: GrammarInfo;
  usageNotes: UsageNote[];
  wordFamily?: WordFamily;
  frequency?: FrequencyInfo;
  cefr?: CEFRLevel; // consensus CEFR level across sources

  // Source tracking
  sources: SourceId[];        // which sources were queried
  sourceEntries: Record<SourceId, SourceAttribution>; // per-source metadata
  resolvedFrom?: string;   // if query was lemmatized/redirected, the canonical form

  // Status
  found: boolean;
  cached?: boolean;
}

// For non-word translations (phrases, sentences, paragraphs)
interface TranslationResult {
  original: string;
  translated: string;
  targetLang: string;
  sourceLang?: string;
  transliteration?: string;
  type: 'word' | 'phrase' | 'sentence' | 'paragraph';
  alternatives?: string[];
  definitions?: { pos: string; meanings: string[] }[];
  examples?: string[];
  synonyms?: string[];
  cached?: boolean;
}
```

### 1.2 Extended Settings

```typescript
type ThemeMode = 'light' | 'dark' | 'auto';
type TriggerMethod = 'select' | 'double-click';
type PopupDensity = 'compact' | 'normal' | 'comfortable';
type FontScale = 'small' | 'normal' | 'large';
type AnimationSpeed = 'instant' | 'fast' | 'normal';
type PositionPreference = 'auto' | 'right' | 'left' | 'below' | 'above';
type SourceLanguage = 'auto' | 'en' | 'fr' | 'de' | 'es' | 'ja' | 'ko' | 'zh' | 'vi';

interface PopupSizeSettings {
  width: number;       // px, default 420
  maxWidth: number;    // px, default 480
  minWidth: number;    // px, default 280
  maxHeight: number;   // px, default 560
  minHeight: number;   // px, default 160
}

interface ContentSectionToggles {
  phonetics: boolean;       // default true
  partOfSpeech: boolean;    // default true
  definitions: boolean;     // default true
  translation: boolean;     // default true
  synonyms: boolean;        // default true
  antonyms: boolean;        // default false
  collocations: boolean;    // default true
  wordForms: boolean;       // default true
  wordFamily: boolean;      // default false
  cefr: boolean;            // default true
  frequency: boolean;       // default false
  idioms: boolean;          // default false
  phrasalVerbs: boolean;    // default false
  usageNotes: boolean;      // default true
  examples: boolean;        // default true
  grammar: boolean;         // default true
  sourceBadges: boolean;    // default true
}

interface SourceSelection {
  cambridge: boolean;      // default true
  longman: boolean;        // default false
  oxford: boolean;         // default false
  merriamWebster: boolean; // default false
  collins: boolean;        // default false
  googleTranslate: boolean;// default true
}

interface PopupBehaviorSettings {
  autoClose: boolean;      // close on click outside
  autoCloseDelay: number;  // ms, 0 = immediate
  animationSpeed: AnimationSpeed;
  positionPreference: PositionPreference;
  showTriggerIcon: boolean;
}

interface DataManagementSettings {
  cacheMaxEntries: number;    // per-source, default 500
  cacheTTLHours: number;     // default 24; 0 = session-only
}

interface Settings {
  // Language
  targetLang: string;           // default 'vi'
  sourceLang: SourceLanguage;   // default 'auto'

  // Trigger
  triggerMethod: TriggerMethod; // default 'select'
  popupEnabled: boolean;

  // Theme
  theme: ThemeMode;             // default 'auto'
  density: PopupDensity;        // default 'normal'
  fontScale: FontScale;         // default 'normal'

  // Popup size
  popupSize: PopupSizeSettings;

  // Content sections
  contentSections: ContentSectionToggles;

  // Dictionary sources
  sources: SourceSelection;

  // Behavior
  popupBehavior: PopupBehaviorSettings;

  // Data
  dataManagement: DataManagementSettings;
}

const DEFAULT_SETTINGS: Settings = {
  targetLang: 'vi',
  sourceLang: 'auto',
  triggerMethod: 'select',
  popupEnabled: true,
  theme: 'auto',
  density: 'normal',
  fontScale: 'normal',
  popupSize: {
    width: 420,
    maxWidth: 480,
    minWidth: 280,
    maxHeight: 560,
    minHeight: 160,
  },
  contentSections: {
    phonetics: true,
    partOfSpeech: true,
    definitions: true,
    translation: true,
    synonyms: true,
    antonyms: false,
    collocations: true,
    wordForms: true,
    wordFamily: false,
    cefr: true,
    frequency: false,
    idioms: false,
    phrasalVerbs: false,
    usageNotes: true,
    examples: true,
    grammar: true,
    sourceBadges: true,
  },
  sources: {
    cambridge: true,
    longman: false,
    oxford: false,
    merriamWebster: false,
    collins: false,
    googleTranslate: true,
  },
  popupBehavior: {
    autoClose: true,
    autoCloseDelay: 0,
    animationSpeed: 'normal',
    positionPreference: 'auto',
    showTriggerIcon: true,
  },
  dataManagement: {
    cacheMaxEntries: 500,
    cacheTTLHours: 24,
  },
};
```

### 1.3 VocabNote (Extended)

```typescript
interface VocabNote {
  id?: number;
  word: string;
  translation: string;
  context: string;
  sourceUrl: string;
  sourceTitle: string;
  tags: string[];
  // New fields
  cefr?: CEFRLevel;
  phonetics?: Phonetic[];
  definitionSnapshot?: string; // JSON-stringified first definition block
  createdAt: number;
  updatedAt: number;
  reviewCount?: number;
  lastReviewedAt?: number;
}
```

### 1.4 Message Protocol

```typescript
type MessageType =
  // Translation
  | { type: 'TRANSLATE'; text: string }

  // Dictionary — single source (backward compat) or multi-source
  | { type: 'LOOKUP_DICTIONARY'; word: string }
  | { type: 'LOOKUP_DICTIONARY_MULTI'; word: string; sources: SourceId[] }

  // Notes CRUD
  | { type: 'SAVE_NOTE'; note: Omit<VocabNote, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'GET_NOTES'; query?: string }
  | { type: 'DELETE_NOTE'; id: number }
  | { type: 'UPDATE_NOTE'; id: number; updates: Partial<VocabNote> }

  // Settings
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }

  // Cache management
  | { type: 'CLEAR_CACHE'; source?: SourceId }
  | { type: 'GET_CACHE_STATS' }

  // Audio TTS (proxy for cross-origin audio)
  | { type: 'FETCH_AUDIO'; url: string } // returns base64 blob

  // Data export
  | { type: 'EXPORT_NOTES'; format: 'json' | 'csv' }
  | { type: 'EXPORT_SETTINGS' }
  | { type: 'IMPORT_SETTINGS'; settings: Settings }

  // Analytics / health
  | { type: 'GET_EXTENSION_VERSION' };

type MessageResponse =
  | { success: true; data: unknown }
  | { success: false; error: string };
```

---

## 2. Dictionary Source Adapter Pattern

### 2.1 Adapter Interface

Every dictionary source implements [`IDictionarySource`](src/lib/sources/types.ts):

```typescript
interface IDictionarySource {
  readonly id: SourceId;
  readonly name: string;        // human-readable, e.g. "Cambridge Dictionary"
  readonly baseUrl: string;
  readonly enabledByDefault: boolean;

  // Core lookup — returns a partial RichDictionaryEntry with source-specific data
  lookup(word: string): Promise<SourceDictionaryResult>;

  // Optional: lemmatize a query to canonical form before lookup
  lemmatize?(word: string): Promise<string>;

  // Optional: check if source is available (network, rate limits)
  healthCheck?(): Promise<{ ok: boolean; reason?: string }>;

  // Optional: extract CEFR level from source parsing
  extractCEFR?(html: string): CEFRLevel | undefined;

  // Optional: extract frequency info
  extractFrequency?(html: string): FrequencyInfo | undefined;
}

interface SourceDictionaryResult {
  source: SourceId;
  lookedUp: string;
  resolvedFrom?: string; // if lemmatized/redirected
  phonetics: Phonetic[];
  definitionBlocks: DefinitionBlock[];
  collocations: Collocation[];
  idioms: Idiom[];
  phrasalVerbs: PhrasalVerb[];
  wordForms: WordForm[];
  synonyms: string[];
  antonyms: string[];
  examples: string[];
  grammar: GrammarInfo;
  usageNotes: UsageNote[];
  wordFamily?: WordFamily;
  frequency?: FrequencyInfo;
  cefr?: CEFRLevel;
  found: boolean;
  attribution: SourceAttribution;
}
```

### 2.2 Source Registry

```typescript
// src/lib/sources/registry.ts

class SourceRegistry {
  private sources = new Map<SourceId, IDictionarySource>();

  register(source: IDictionarySource): void {
    this.sources.set(source.id, source);
  }

  get(id: SourceId): IDictionarySource | undefined {
    return this.sources.get(id);
  }

  getAll(): IDictionarySource[] {
    return [...this.sources.values()];
  }

  getEnabled(settings: Settings): IDictionarySource[] {
    const selection = settings.sources;
    return this.getAll().filter(s => {
      if (s.id === 'cambridge') return selection.cambridge;
      if (s.id === 'longman') return selection.longman;
      if (s.id === 'oxford') return selection.oxford;
      if (s.id === 'merriam-webster') return selection.merriamWebster;
      if (s.id === 'collins') return selection.collins;
      if (s.id === 'google-translate') return selection.googleTranslate;
      return false;
    });
  }
}

export const sourceRegistry = new SourceRegistry();
```

### 2.3 Individual Source Implementations

Each source lives in its own file under [`src/lib/sources/`](src/lib/sources/):

| File | Source | Method | Notes |
|------|--------|--------|-------|
| [`cambridge.ts`](src/lib/sources/cambridge.ts) | Cambridge | HTML scraper | Existing; refactored to implement `IDictionarySource` |
| [`longman.ts`](src/lib/sources/longman.ts) | Longman | HTML scraper | `ldoceonline.com`; rich example sentences, CEFR tags |
| [`oxford.ts`](src/lib/sources/oxford.ts) | Oxford | HTML scraper | `oxfordlearnersdictionaries.com`; CEFR, word forms, idioms |
| [`merriam-webster.ts`](src/lib/sources/merriam-webster.ts) | Merriam-Webster | HTML scraper | `merriam-webster.com`; US focus, thesaurus, word history |
| [`collins.ts`](src/lib/sources/collins.ts) | Collins | HTML scraper | `collinsdictionary.com`; frequency bands, bilingual support |
| [`google-translate.ts`](src/lib/sources/google-translate.ts) | Google Translate | Unofficial API | Existing approach; repackaged as adapter |

Each scraper follows the same pattern as the existing [`cambridge.ts`](src/lib/cambridge.ts):
1. Normalize/clean HTML (strip scripts, styles, ads)
2. Extract structured data via regex/DOMParser
3. Return a `SourceDictionaryResult`

### 2.4 Factory / Lazy Registration

```typescript
// src/lib/sources/index.ts
import { sourceRegistry } from './registry';
import { CambridgeSource } from './cambridge';
import { LongmanSource } from './longman';
// ...etc

let initialized = false;

export function initializeSources(): void {
  if (initialized) return;
  sourceRegistry.register(new CambridgeSource());
  sourceRegistry.register(new LongmanSource());
  sourceRegistry.register(new OxfordSource());
  sourceRegistry.register(new MerriamWebsterSource());
  sourceRegistry.register(new CollinsSource());
  sourceRegistry.register(new GoogleTranslateSource());
  initialized = true;
}
```

Sources are initialized lazily in the background service worker only when a lookup is requested. Individual source files are only imported when their corresponding adapter is first needed (dynamic `import()` for non-default sources like Longman/Oxford/Merriam-Webster/Collins).

---

## 3. Data Merge Strategy

### 3.1 Merge Pipeline

The merge happens in the background service worker via [`mergeDictionaryResults()`](src/lib/merge.ts).

```
Query word
  │
  ├─► Source A ──► SourceDictionaryResult A
  ├─► Source B ──► SourceDictionaryResult B
  └─► Source C ──► SourceDictionaryResult C
       │
       ▼
  Merge Engine
       │
       ▼
  RichDictionaryEntry (consolidated)
```

### 3.2 Merge Algorithm

```
function mergeResults(word: string, results: SourceDictionaryResult[]): RichDictionaryEntry

Step 1 — Headword resolution
  - If multiple sources return different resolved forms, use majority vote.
  - Track resolvedFrom for each source.

Step 2 — Phonetics merge
  - Collect all phonetics across sources.
  - Deduplicate by (ipa, region) pair; prefer source order.
  - Preserve unique audio URLs per source.

Step 3 — Sense/Definition merge (most complex)
  3a. Normalize all senses: lowercase POS, strip extra whitespace from meaning.
  3b. Generate stable Sense.id = hash(`${normalizedPOS}::${normalizedMeaning.substring(0, 60)}`).
  3c. Group senses by id across sources.
  3d. For each group:
      - Merge labels (union, dedup).
      - Merge examples (union, cap at 4 per sense).
      - Pick CEFR from highest-confidence source (Oxford > Longman > Cambridge).
      - Merge source IDs.
      - Merge attributions.
  3e. Group senses by partOfSpeech → DefinitionBlock[].
  3f. Order definition blocks: more common POS first (noun, verb, adjective, adverb, others).

Step 4 — Collocations merge
  - Union all collocations across sources.
  - Deduplicate by lowercase normalized text.
  - Merge examples for overlapping collocations.
  - Cap at 12 entries.

Step 5 — Idioms / Phrasal verbs
  - Simple union; dedup by lowercase text.
  - Cap at 8 each.

Step 6 — Word forms
  - Union all forms; dedup by (type, text) pair.

Step 7 — Synonyms / Antonyms
  - Union across sources; dedup case-insensitively.
  - Cap at 15 synonyms, 10 antonyms.

Step 8 — Usage notes
  - Union; dedup by text similarity (substring containment check).
  - Cap at 8 notes.

Step 9 — Grammar info
  - Union patterns, notes, inflections arrays; dedup.

Step 10 — Word family / Frequency / CEFR
  - Word family: prefer source with richest data (Oxford > Longman > Cambridge).
  - Frequency: prefer Collins frequency bands, then other sources.
  - CEFR: consensus — if ≥2 sources agree, use that; else use highest-confidence source.

Step 11 — Assembly
  - Build RichDictionaryEntry with all merged fields.
  - found = any source found results.
  - sources = all queried source IDs.
  - sourceEntries = attribution map per source.
```

### 3.3 Source Priority Order

For deduplication tie-breaking and CEFR/frequency preference:

1. Oxford (best structured data, CEFR)
2. Cambridge
3. Longman
4. Collins (frequency data)
5. Merriam-Webster
6. Google Translate (fallback only)

### 3.4 Caching Strategy

- **Per-source LRU cache**: Each source maintains its own `LRUCache<SourceDictionaryResult>` (configurable size, default 500 entries each).
- **Merged result cache**: A separate `LRUCache<RichDictionaryEntry>` (size 300) for the final merged result, keyed by `word::source1+source2+source3`.
- **TTL**: Entries expire after `settings.dataManagement.cacheTTLHours` (default 24h). Implemented via a stored timestamp; entries older than TTL are evicted on access.
- **Cache clear**: User-triggered via settings page; sends `CLEAR_CACHE` message to background.

---

## 4. Popup Component Architecture

### 4.1 Rendering Approach (Keep Shadow DOM)

The popup continues to render inside a **closed Shadow DOM** attached to a `position: fixed` host `<div>`. All styles are encapsulated. The rendering function is refactored from a single monolithic `renderResult()` into composable section renderers.

### 4.2 Section Breakdown

The popup body is organized into these independently-rendered sections:

```
┌─────────────────────────────────────┐
│ HEADER (sticky)                     │
│  ├─ Eyebrow "WordSnap"              │
│  ├─ Headword + POS badges           │
│  ├─ Phonetics (IPA chips + audio)   │
│  ├─ CEFR badge + frequency badge    │
│  ├─ Source badges row               │
│  └─ Close button                    │
├─────────────────────────────────────┤
│ TRANSLATION HERO                    │
│  ├─ Translated text (large)         │
│  ├─ TTS button + copy button        │
│  └─ Language badge (EN→VI)          │
├─────────────────────────────────────┤
│ SECTION NAV (horizontal chips)      │
│  └─ [Defs] [Synonyms] [Colloc.] ... │
├─────────────────────────────────────┤
│ DEFINITIONS                         │
│  ├─ Per POS group                   │
│  │  ├─ POS header                   │
│  │  └─ Per sense: meaning, examples │
│  │     └─ Source badge (small dot)  │
│  └─ Expand/collapse if >3 senses    │
├─────────────────────────────────────┤
│ SYNONYMS (chip cloud)               │
├─────────────────────────────────────┤
│ ANTONYMS (chip cloud)               │
├─────────────────────────────────────┤
│ COLLOCATIONS (phrase list)          │
├─────────────────────────────────────┤
│ WORD FORMS (inflection table)       │
├─────────────────────────────────────┤
│ IDIOMS / PHRASAL VERBS              │
├─────────────────────────────────────┤
│ USAGE NOTES (callout cards)         │
├─────────────────────────────────────┤
│ EXAMPLES (quoted list)              │
├─────────────────────────────────────┤
│ WORD FAMILY (tree/list)             │
├─────────────────────────────────────┤
│ SOURCE FOOTER                       │
│  └─ "Data from: Cambridge, Oxford"  │
└─────────────────────────────────────┘
```

### 4.3 Renderer Modules

Split [`src/content/index.ts`](src/content/index.ts) into focused modules:

```
src/content/
├── index.ts              — Entry: init, event listeners, message dispatch
├── popup-host.ts         — Shadow DOM host creation, theme class management
├── position.ts           — Viewport-aware positioning logic
├── render/
│   ├── index.ts          — Orchestrator: renderResult(entry, settings)
│   ├── header.ts         — Headword, POS, phonetics, badges
│   ├── translation.ts    — Translation hero
│   ├── definitions.ts    — Definition blocks with source attribution
│   ├── synonyms.ts       — Synonym chip cloud
│   ├── collocations.ts   — Collocation list
│   ├── word-forms.ts     — Inflection/word form table
│   ├── idioms.ts         — Idioms & phrasal verbs section
│   ├── usage-notes.ts    — Usage notes cards
│   ├── examples.ts       — Example sentences
│   ├── word-family.ts    — Word family tree
│   ├── source-footer.ts  — Source attribution footer
│   └── section-nav.ts    — Section navigation chips
└── styles.ts             — CSS template literal (design tokens)
```

### 4.4 State Management

Simple state object held in the content script module scope:

```typescript
interface PopupState {
  visible: boolean;
  loading: boolean;
  currentWord: string;
  currentEntry: RichDictionaryEntry | null;
  currentTranslation: TranslationResult | null;
  expandedSections: Set<string>;
  activeSourceTab: SourceId | null;
  viewportMode: 'anchored' | 'sheet';
  anchorX: number;
  anchorY: number;
  requestId: number; // race condition guard
}
```

### 4.5 Section Visibility & Order

Sections are conditionally rendered based on:
1. [`settings.contentSections`](#12-extended-settings) toggles (user can hide any section)
2. Data availability (empty sections are omitted)
3. The `isWord` / `isPhrase` detection (idioms/phrasal verbs only for single words)

### 4.6 Responsive Behavior

See [Section 8](#8-responsive--popup-position-strategy). The popup switches between:

- **Anchored mode** (desktop): positioned near selection, max 420×560px, dialog-like
- **Sheet mode** (mobile/constrained): centered bottom sheet, max-width, scroll within

Density classes applied to `:host`:
- `data-density="compact"` — tighter padding, smaller gaps, 11px base
- `data-density="normal"` — default (14px base)
- `data-density="comfortable"` — relaxed padding, 16px base

Font scale classes:
- `data-font-scale="small"` — 12px base
- `data-font-scale="normal"` — 14px base
- `data-font-scale="large"` — 16px base

---

## 5. Settings Page Architecture

### 5.1 Page Layout

```
┌──────────────────────────────────────────────────────┐
│ HEADER                                                │
│  ├─ Logo + "WordSnap Settings"                       │
│  └─ Version number                                    │
├─────────────────────┬────────────────────────────────┤
│ MAIN AREA (scroll)   │ SIDEBAR (sticky)               │
│                      │                                │
│ ┌─ Language ───────┐ │ ┌─ Save / Reset ─────────────┐│
│ │ Target language   │ │ │ [Save Settings]             ││
│ │ Source language   │ │ │ [Reset to Defaults]         ││
│ └──────────────────┘ │ │ Status message               ││
│                      │ └──────────────────────────────┘│
│ ┌─ Popup Size ─────┐ │                                │
│ │ Width slider      │ │ ┌─ Data Management ──────────┐│
│ │ Max width         │ │ │ [Clear Cache]               ││
│ │ Max height        │ │ │ [Export Notes]              ││
│ └──────────────────┘ │ │ [Export Settings]            ││
│                      │ │ [Import Settings]            ││
│ ┌─ Appearance ─────┐ │ └──────────────────────────────┘│
│ │ Theme selector     │ │                                │
│ │ Density selector   │ │ ┌─ Preview ──────────────────┐│
│ │ Font scale         │ │ │ (live popup preview)        ││
│ │ Animation speed    │ │ │                              ││
│ └──────────────────┘ │ └──────────────────────────────┘│
│                      │                                │
│ ┌─ Content Sections ┐│ │                                │
│ │ [✓] Phonetics     ││ │                                │
│ │ [✓] Definitions   ││ │                                │
│ │ [✓] Synonyms      ││ │                                │
│ │ [ ] Antonyms      ││ │                                │
│ │ [✓] Collocations  ││ │                                │
│ │ ...checkboxes...   ││ │                                │
│ └──────────────────┘ │                                │
│                      │                                │
│ ┌─ Dictionary ─────┐ │                                │
│ │ [✓] Cambridge     ││ │                                │
│ │ [ ] Longman        ││ │                                │
│ │ [ ] Oxford         ││ │                                │
│ │ [ ] Merriam-Webster││ │                                │
│ │ [ ] Collins        ││ │                                │
│ │ [✓] Google Translate││ │                                │
│ └──────────────────┘ │                                │
│                      │                                │
│ ┌─ Behavior ───────┐ │                                │
│ │ Trigger method    ││ │                                │
│ │ Auto-close toggle ││ │                                │
│ │ Position pref.    ││ │                                │
│ └──────────────────┘ │                                │
└─────────────────────┴────────────────────────────────┘
```

### 5.2 Files

```
src/options/
├── index.html          — Full page markup
├── index.ts            — Entry point: load, save, reset
├── styles.css          — Settings page design tokens + layout
├── components/
│   ├── section-card.ts — Reusable collapsible section component
│   ├── field-group.ts  — Select, slider, checkbox, toggle field wrappers
│   ├── preview-panel.ts— Live popup preview renderer
│   └── import-export.ts— JSON file import/export utilities
└── state.ts            — Local form state management
```

### 5.3 Data Flow

```
Options Page                    Background SW                  chrome.storage.sync
    │                               │                              │
    │── GET_SETTINGS ──────────────►│                              │
    │                               │── chrome.storage.sync.get ──►│
    │◄── { settings } ──────────────│◄── { data } ──────────────────│
    │                               │                              │
    │ (user edits form)             │                              │
    │                               │                              │
    │── UPDATE_SETTINGS {partial} ──►│                              │
    │                               │── chrome.storage.sync.set ──►│
    │◄── { success } ───────────────│◄── { ok } ────────────────────│
    │                               │                              │
    │ (settings propagate via       │                              │
    │  chrome.storage.onChanged     │                              │
    │  → content script reloads)    │                              │
```

Content script listens to `chrome.storage.onChanged` for `wordsnap_settings` key and re-applies theme/density/font-scale classes.

---

## 6. Message Protocol Extensions

### 6.1 New Message Types

All new messages follow the pattern in [Section 1.4](#14-message-protocol). Key additions:

| Type | Direction | Purpose |
|------|-----------|---------|
| `LOOKUP_DICTIONARY_MULTI` | content → background | Lookup word across multiple sources simultaneously |
| `UPDATE_NOTE` | content → background | Update existing vocab note fields |
| `CLEAR_CACHE` | content/options → background | Clear per-source or all caches |
| `GET_CACHE_STATS` | options → background | Return cache hit rates, sizes for diagnostics |
| `FETCH_AUDIO` | content → background | Proxy-fetch audio URL (avoids cross-origin issues in content script) |
| `EXPORT_NOTES` | options → background | Export vocab notes as JSON/CSV string |
| `EXPORT_SETTINGS` | options → background | Export current settings as JSON |
| `IMPORT_SETTINGS` | options → background | Bulk-import settings JSON |
| `GET_EXTENSION_VERSION` | any → background | Return manifest version for display |

### 6.2 Extended Background Router

[`src/background/index.ts`](src/background/index.ts) `handleMessage()` grows new cases:

```typescript
case 'LOOKUP_DICTIONARY_MULTI':
  const entry = await multiSourceLookup(message.word, message.sources);
  return { success: true, data: entry };

case 'CLEAR_CACHE':
  if (message.source) {
    clearSourceCache(message.source);
  } else {
    clearAllCaches();
  }
  return { success: true, data: null };

case 'FETCH_AUDIO':
  const audioData = await fetchAudioAsBase64(message.url);
  return { success: true, data: audioData };

case 'EXPORT_NOTES':
  const notes = await exportNotes(message.format);
  return { success: true, data: notes };

// ...etc
```

### 6.3 Multi-Source Lookup Flow

```
Content Script                          Background SW
    │                                       │
    │── LOOKUP_DICTIONARY_MULTI             │
    │   { word, sources: ['cambridge',      │
    │     'oxford', 'google-translate'] }   │
    │                                       │
    │                                       │── getEnabledSources(settings)
    │                                       │── Promise.allSettled([
    │                                       │     cambridge.lookup(word),
    │                                       │     oxford.lookup(word),
    │                                       │     googleTranslate(word)
    │                                       │   ])
    │                                       │── mergeResults(word, results)
    │                                       │── cache merged result
    │                                       │
    │◄── { success, data: RichDictEntry } ──│
```

---

## 7. File Structure

### 7.1 Proposed Tree

```
src/
├── manifest.json
├── background/
│   └── index.ts                  — Message router, source orchestration
├── content/
│   ├── index.ts                  — Entry: init, event listeners, dispatch
│   ├── popup-host.ts             — Shadow DOM host lifecycle
│   ├── position.ts               — Viewport collision, positioning math
│   ├── state.ts                  — PopupState management
│   ├── render/
│   │   ├── index.ts              — Orchestrator: renders full popup
│   │   ├── header.ts             — Headword + phonetics + badges
│   │   ├── translation.ts        — Translation hero card
│   │   ├── definitions.ts        — Definition blocks (per-POS, per-sense)
│   │   ├── synonyms.ts           — Synonym/antonym chip clouds
│   │   ├── collocations.ts       — Collocations list
│   │   ├── word-forms.ts         — Word form table
│   │   ├── idioms.ts             — Idioms + phrasal verbs
│   │   ├── usage-notes.ts        — Usage note cards
│   │   ├── examples.ts           — Example sentence list
│   │   ├── word-family.ts        — Word family display
│   │   ├── source-footer.ts      — Source attribution footer
│   │   └── section-nav.ts        — Section navigation chips
│   └── styles.ts                 — Complete CSS template literal
├── lib/
│   ├── types.ts                  — All shared TypeScript interfaces
│   ├── storage.ts                — chrome.storage.sync wrapper
│   ├── db.ts                     — IndexedDB (Dexie) for vocab notes
│   ├── lru-cache.ts              — Generic LRU cache (unchanged)
│   ├── merge.ts                  — Multi-source merge algorithm
│   ├── settings-defaults.ts      — DEFAULT_SETTINGS constant
│   ├── sources/
│   │   ├── index.ts              — Registry initialization + re-exports
│   │   ├── registry.ts           — SourceRegistry class
│   │   ├── types.ts              — IDictionarySource interface + SourceDictionaryResult
│   │   ├── cambridge.ts          — Cambridge adapter (refactored)
│   │   ├── longman.ts            — Longman adapter (NEW)
│   │   ├── oxford.ts             — Oxford adapter (NEW)
│   │   ├── merriam-webster.ts    — Merriam-Webster adapter (NEW)
│   │   ├── collins.ts            — Collins adapter (NEW)
│   │   └── google-translate.ts   — Google Translate adapter (repackaged)
│   └── utils/
│       ├── html-cleaner.ts       — Shared HTML sanitization (script/style strip)
│       ├── text.ts               — decodeEntities, cleanText, sanitize
│       └── dedup.ts              — Generic uniqueness + similarity helpers
├── options/
│   ├── index.html                — Settings page markup
│   ├── index.ts                  — Settings page entry
│   ├── styles.css                — Settings page styles
│   ├── state.ts                  — Form state management
│   └── components/
│       ├── section-card.ts       — Reusable section wrapper
│       ├── field-group.ts        — Form control wrappers
│       ├── preview-panel.ts      — Live popup preview
│       └── import-export.ts      — File import/export helpers
└── assets/
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

### 7.2 File Count Summary

| Directory | Files | Purpose |
|-----------|-------|---------|
| `background/` | 1 | Service worker |
| `content/` | 17 | Popup UI: host, position, renderers (13), state, styles |
| `lib/` | 14 | Types, storage, DB, merge, sources (8), utils (3) |
| `lib/sources/` | 8 | Adapter interface + 6 implementations + registry + index |
| `options/` | 8 | Settings page: HTML, TS, CSS, state, 4 components |
| `assets/` | 3 | Icons |
| **Total** | **~51** | Up from ~17 in current codebase |

---

## 8. Responsive / Popup Position Strategy

### 8.1 Viewport Modes

The popup uses two distinct layout modes, auto-detected by viewport width:

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Anchored** | `vw > 480px` AND `availableWidth >= 280px` | Positioned relative to selection point; candidate scoring algorithm |
| **Sheet** | `vw <= 480px` OR `availableWidth < 280px` | Centered horizontally, near vertical center; wider but shorter |

### 8.2 Anchored Mode Positioning Algorithm

(See existing [`positionPopup()`](src/content/index.ts:276) — the enhanced version refines this):

1. **Measure**: Get popup dimensions after render, viewport dimensions
2. **Constrain**: Clamp width to `[minWidth, maxWidth]`, height to `[minHeight, maxHeight]` from settings
3. **Candidate scoring** (9 candidates: 3 horizontal × 3 vertical positions):
   - Horizontal: right-of-selection, left-of-selection, centered
   - Vertical: below-selection, above-selection, centered
4. **Penalty function**: `overflowPenalty + distancePenalty + directionPreference`
5. **Select best**: minimum penalty score
6. **Apply**: Set `left`, `top`, `maxWidth`, `maxHeight` on host element

### 8.3 Sheet Mode

When viewport is narrow (≤480px or available width < 280px):

- `popupEl.dataset.viewportMode = 'sheet'`
- Popup renders as a centered card
- Width: `min(380px, calc(100vw - 24px))`
- Max height: `min(settings.popupSize.maxHeight, calc(100vh - 24px))`
- Position: centered horizontally, vertically near center
- CSS applies sheet-specific border-radius and padding

### 8.4 Viewport Change Handling

- Listen on `window.resize` and `window.visualViewport.resize`
- Debounce repositioning by 100ms
- Re-run position algorithm; mode may switch between anchored/sheet
- On mobile keyboard open (viewport height change), reposition immediately

### 8.5 Overflow Strategy

- Popup body has `overflow-y: auto` with `overscroll-behavior: contain`
- Sticky header stays visible during scroll
- Header has `backdrop-filter: blur()` to obscure scrolled content behind it
- Max height is always constrained to `calc(100vh - 24px)` minimum

---

## 9. Theme / Design Token System

### 9.1 CSS Custom Properties

All tokens are defined on `:host` in the Shadow DOM's style block. Light theme is default; dark theme is applied via `@media (prefers-color-scheme: dark)` or explicit `:host(.theme-dark)`.

### 9.2 Token Categories

```css
:host {
  /* === COLOR SYSTEM === */
  /* Brand */
  --ws-brand-50: #eff6ff;
  --ws-brand-100: #dbeafe;
  --ws-brand-200: #bfdbfe;
  --ws-brand-500: #3b82f6;
  --ws-brand-600: #2563eb;
  --ws-brand-700: #1d4ed8;
  --ws-brand-800: #1e40af;

  /* Neutral */
  --ws-neutral-0: #ffffff;
  --ws-neutral-50: #f8fafc;
  --ws-neutral-100: #f1f5f9;
  --ws-neutral-200: #e2e8f0;
  --ws-neutral-300: #cbd5e1;
  --ws-neutral-400: #94a3b8;
  --ws-neutral-500: #64748b;
  --ws-neutral-600: #475569;
  --ws-neutral-700: #334155;
  --ws-neutral-800: #1e293b;
  --ws-neutral-900: #0f172a;
  --ws-neutral-950: #020617;

  /* Semantic */
  --ws-success: #16a34a;
  --ws-success-soft: #f0fdf4;
  --ws-error: #dc2626;
  --ws-error-soft: #fef2f2;
  --ws-warning: #d97706;
  --ws-warning-soft: #fffbeb;

  /* CEFR level colors */
  --ws-cefr-a1: #22c55e;
  --ws-cefr-a2: #84cc16;
  --ws-cefr-b1: #eab308;
  --ws-cefr-b2: #f97316;
  --ws-cefr-c1: #ef4444;
  --ws-cefr-c2: #a855f7;

  /* Source badge colors */
  --ws-source-cambridge: #e8530e;
  --ws-source-longman: #1e88e5;
  --ws-source-oxford: #002147;
  --ws-source-merriam-webster: #365070;
  --ws-source-collins: #c41230;
  --ws-source-google: #4285f4;

  /* === SURFACE TOKENS === */
  --ws-surface-bg: var(--ws-neutral-0);
  --ws-surface-elevated: var(--ws-neutral-50);
  --ws-surface-card: rgba(255, 255, 255, 0.92);
  --ws-surface-overlay: rgba(255, 255, 255, 0.88);

  /* === TEXT TOKENS === */
  --ws-text-primary: var(--ws-neutral-900);
  --ws-text-secondary: var(--ws-neutral-700);
  --ws-text-tertiary: var(--ws-neutral-500);
  --ws-text-disabled: var(--ws-neutral-400);
  --ws-text-inverse: var(--ws-neutral-0);

  /* === BORDER TOKENS === */
  --ws-border-default: rgba(148, 163, 184, 0.34);
  --ws-border-strong: rgba(71, 85, 105, 0.5);
  --ws-border-focus: var(--ws-brand-500);

  /* === SPACING (density-scaled via data attribute) === */
  /* Normal density (default) */
  --ws-space-xs: 4px;
  --ws-space-sm: 8px;
  --ws-space-md: 12px;
  --ws-space-lg: 16px;
  --ws-space-xl: 20px;
  --ws-space-2xl: 24px;

  /* Compact density overrides */
  /* :host([data-density="compact"]) { --ws-space-md: 8px; --ws-space-lg: 12px; ... } */

  /* === TYPOGRAPHY === */
  --ws-font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --ws-font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Base font size (normal) */
  --ws-font-size-xs: 10px;
  --ws-font-size-sm: 12px;
  --ws-font-size-base: 14px;
  --ws-font-size-lg: 16px;
  --ws-font-size-xl: 20px;
  --ws-font-size-2xl: 24px;

  --ws-font-weight-normal: 400;
  --ws-font-weight-medium: 500;
  --ws-font-weight-semibold: 600;
  --ws-font-weight-bold: 700;
  --ws-font-weight-extrabold: 800;

  --ws-line-height-tight: 1.25;
  --ws-line-height-normal: 1.5;
  --ws-line-height-relaxed: 1.7;

  --ws-letter-spacing-tight: -0.03em;
  --ws-letter-spacing-normal: 0;
  --ws-letter-spacing-wide: 0.04em;
  --ws-letter-spacing-wider: 0.08em;

  /* === RADIUS === */
  --ws-radius-sm: 8px;
  --ws-radius-md: 12px;
  --ws-radius-lg: 16px;
  --ws-radius-xl: 20px;
  --ws-radius-full: 9999px;

  /* === SHADOWS === */
  --ws-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --ws-shadow-md: 0 14px 30px rgba(15,23,42,0.08), 0 4px 10px rgba(15,23,42,0.04);
  --ws-shadow-lg: 0 24px 48px rgba(15,23,42,0.12), 0 8px 16px rgba(15,23,42,0.06);
  --ws-shadow-xl: 0 32px 64px rgba(15,23,42,0.16);

  /* === TRANSITIONS === */
  --ws-transition-fast: 120ms cubic-bezier(0.4, 0, 0.2, 1);
  --ws-transition-normal: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --ws-transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);

  /* === Z-INDEX === */
  --ws-z-base: 2147483647; /* max safe z-index for content scripts */
}
```

### 9.3 Dark Theme Overrides

```css
:host(.theme-dark),
:host(:not(.theme-light)) {
  --ws-surface-bg: var(--ws-neutral-950);
  --ws-surface-elevated: var(--ws-neutral-900);
  --ws-surface-card: rgba(15, 23, 42, 0.92);
  --ws-surface-overlay: rgba(15, 23, 42, 0.88);
  --ws-text-primary: var(--ws-neutral-100);
  --ws-text-secondary: var(--ws-neutral-300);
  --ws-text-tertiary: var(--ws-neutral-500);
  --ws-border-default: rgba(100, 116, 139, 0.62);
  --ws-border-strong: rgba(148, 163, 184, 0.46);
  --ws-shadow-md: 0 14px 30px rgba(2,6,23,0.4), 0 4px 10px rgba(2,6,23,0.2);
  --ws-shadow-lg: 0 24px 48px rgba(2,6,23,0.52), 0 8px 16px rgba(2,6,23,0.3);
}
```

### 9.4 Density Scaling

```css
:host([data-density="compact"]) {
  --ws-space-xs: 2px;
  --ws-space-sm: 4px;
  --ws-space-md: 8px;
  --ws-space-lg: 12px;
  --ws-space-xl: 16px;
  --ws-space-2xl: 20px;
  --ws-font-size-base: 12px;
  --ws-font-size-lg: 14px;
  --ws-font-size-xl: 16px;
  --ws-font-size-2xl: 20px;
  --ws-line-height-normal: 1.4;
}

:host([data-density="comfortable"]) {
  --ws-space-xs: 6px;
  --ws-space-sm: 10px;
  --ws-space-md: 16px;
  --ws-space-lg: 20px;
  --ws-space-xl: 28px;
  --ws-space-2xl: 32px;
  --ws-font-size-base: 16px;
  --ws-font-size-lg: 18px;
  --ws-font-size-xl: 22px;
  --ws-font-size-2xl: 28px;
  --ws-line-height-normal: 1.65;
}
```

### 9.5 Font Scale

```css
:host([data-font-scale="small"]) {
  --ws-font-size-xs: 9px;
  --ws-font-size-sm: 10px;
  --ws-font-size-base: 12px;
  --ws-font-size-lg: 14px;
  --ws-font-size-xl: 17px;
  --ws-font-size-2xl: 20px;
}

:host([data-font-scale="large"]) {
  --ws-font-size-xs: 11px;
  --ws-font-size-sm: 13px;
  --ws-font-size-base: 16px;
  --ws-font-size-lg: 18px;
  --ws-font-size-xl: 24px;
  --ws-font-size-2xl: 30px;
}
```

---

## 10. Performance Considerations

### 10.1 Caching Layers

| Layer | Scope | Size | TTL | Eviction |
|-------|-------|------|-----|----------|
| Per-source LRU | Background SW | 500 entries each | 24h | LRU |
| Merged result LRU | Background SW | 300 entries | 24h | LRU |
| Google Translate LRU | Background SW | 300 entries | 24h | LRU |
| IndexedDB (Dexie) | Background SW | User vocab notes | Permanent | Manual delete |

Cache keys:
- Per-source: `${sourceId}:${normalizedWord}`
- Merged: `merged:${normalizedWord}:${sortedSourceIds.join('+')}`
- Google Translate: `gt:${text.toLowerCase().trim()}`

### 10.2 Lazy Dictionary Source Loading

Non-default sources (Longman, Oxford, Merriam-Webster, Collins) are loaded via dynamic `import()` only when:
1. User enables the source in settings, AND
2. A lookup is actually requested for that source

```typescript
// In background/index.ts
async function getSource(id: SourceId): Promise<IDictionarySource> {
  const existing = sourceRegistry.get(id);
  if (existing) return existing;

  // Dynamic import on first use
  switch (id) {
    case 'longman':
      const { LongmanSource } = await import('@/lib/sources/longman');
      const longman = new LongmanSource();
      sourceRegistry.register(longman);
      return longman;
    case 'oxford':
      // ...similar
  }
  throw new Error(`Unknown source: ${id}`);
}
```

Benefits:
- Default install only loads Cambridge + Google Translate code
- Users who never enable other sources never download that parser code
- Reduces initial service worker bundle size

### 10.3 Bundle Size Awareness

| Concern | Mitigation |
|---------|------------|
| Multiple HTML parsers | Shared utility functions in `lib/utils/html-cleaner.ts`; each adapter is ~200-400 lines of regex/DOMParser logic |
| Large CSS in Shadow DOM | Single `styles.ts` template literal (~800 lines); gzipped this is small; no external CSS files |
| Design tokens | Only ~120 CSS custom properties defined once on `:host` |
| Dexie | Already included; no additional DB libraries |
| No new npm dependencies | All scraping is vanilla fetch + regex/DOMParser |

Estimated bundle impact:
- Current: ~35KB content.js + ~12KB background.js (gzipped)
- Enhanced: ~50KB content.js + ~25KB background.js (gzipped) — well within Chrome Web Store limits

### 10.4 Request Optimization

- **Parallel fetches**: All enabled sources fire simultaneously via `Promise.allSettled()`
- **Timeout**: 8s per source; if source doesn't respond, it's treated as `found: false`
- **Abort controller**: Each source fetch gets its own `AbortController`
- **Race condition guard**: `currentRequestId` counter in content script prevents stale renders
- **Debounced lookups**: If user rapidly selects different words, only the latest request's result is rendered

### 10.5 Content Script Performance

- **Shadow DOM isolation**: No style leaks to/from host page
- **Event delegation**: Single `mousedown` listener on `document` for click-outside-to-close
- **No continuous polling**: Selection detection is event-driven (`mouseup` / `dblclick`)
- **Throttled repositioning**: Viewport change handler debounced at 100ms
- **Conditional rendering**: Sections only rendered if data exists AND section toggle is enabled

### 10.6 Storage Quotas

- `chrome.storage.sync`: Settings only (~2KB JSON); well under 100KB limit
- `chrome.storage.local`: Cache could use this, but LRU is in-memory (service worker lifecycle)
- IndexedDB: Vocab notes; no practical limit for this use case

---

## Appendix: Migration Path from Current Codebase

### Phase 1: Types & Settings Foundation
1. Replace [`src/lib/types.ts`](src/lib/types.ts) with extended interfaces
2. Update [`src/lib/storage.ts`](src/lib/storage.ts) for new settings shape (backward-compatible migration)
3. Update [`src/lib/db.ts`](src/lib/db.ts) for extended `VocabNote` (Dexie schema v2)

### Phase 2: Source Adapter Refactor
1. Create [`src/lib/sources/types.ts`](src/lib/sources/types.ts) with `IDictionarySource` interface
2. Create [`src/lib/sources/registry.ts`](src/lib/sources/registry.ts)
3. Refactor [`src/lib/cambridge.ts`](src/lib/cambridge.ts) → [`src/lib/sources/cambridge.ts`](src/lib/sources/cambridge.ts) implementing `IDictionarySource`
4. Repackage [`src/lib/google-translate.ts`](src/lib/google-translate.ts) → [`src/lib/sources/google-translate.ts`](src/lib/sources/google-translate.ts)
5. Create [`src/lib/merge.ts`](src/lib/merge.ts) with merge algorithm
6. Update [`src/background/index.ts`](src/background/index.ts) to use registry + multi-source orchestration

### Phase 3: Popup UI Redesign
1. Extract positioning logic to [`src/content/position.ts`](src/content/position.ts)
2. Extract styles to [`src/content/styles.ts`](src/content/styles.ts) with design token system
3. Build section renderers one at a time in [`src/content/render/`](src/content/render/)
4. Wire up new render pipeline in [`src/content/index.ts`](src/content/index.ts)
5. Add density/font-scale/theme class toggling

### Phase 4: Settings Page Expansion
1. Expand [`src/options/index.html`](src/options/index.html) with all new controls
2. Build reusable field components in [`src/options/components/`](src/options/components/)
3. Add preview panel
4. Add import/export functionality

### Phase 5: New Dictionary Sources
1. Build Longman adapter
2. Build Oxford adapter
3. Build Merriam-Webster adapter
4. Build Collins adapter
5. Wire into registry with lazy loading

### Phase 6: Polish
1. Animation speed settings
2. Position preference implementation
3. `prefers-reduced-motion` media query respect
4. Accessibility audit (focus management, ARIA labels, keyboard navigation)
