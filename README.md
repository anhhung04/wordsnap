# ⚡ WordSnap

A lightweight Chrome extension for language learning - popup translation with Google Translate + Cambridge Dictionary + optional AI enhancement, and vocabulary notes.

## Features

- **Popup Translation** - Select text on any webpage → instant translation via Google Translate
- **AI Enhancement** - Optional Gemini AI for deeper word analysis, usage notes, grammar
- **Cambridge Dictionary** - IPA phonetics, definitions, and example sentences for words
- **Vocabulary Notes** - Save words with context, browse/search/export later
- **Zero Tracking** - No analytics, no telemetry, your data stays local
- **Lightweight** - Content script < 20KB, lazy-loaded popup via Shadow DOM
- **Dark Mode** - Follows system preference automatically
- **Auto Language Detection** - Detects source language automatically

## Installation

1. Clone/download this repository
2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
3. Open Chrome → `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked" → select the `dist/` folder
6. (Optional) Configure a Gemini API key in extension options for AI analysis

## Getting a Gemini API Key (Optional, Free)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key and paste it in extension options

The free tier allows 15 requests/minute and 1M tokens/day - more than enough for personal use.
Translation works without an API key via Google Translate.

## Usage

| Action | Result |
|--------|--------|
| Select text | Trigger icon appears near selection |
| Click trigger icon | Popup with translation + dictionary |
| Click Save | Word saved to vocabulary notes |
| Click extension icon | Open vocabulary notes page |
| `Ctrl+Shift+E` | Open vocabulary notes (keyboard shortcut) |
| Escape | Dismiss popup |

## Configuration

Open extension options to configure:
- **API Key** - Google Gemini API key (optional, for AI analysis)
- **Target Language** - Vietnamese, Chinese, Japanese, Korean, Spanish, French, etc.
- **Trigger Method** - Show on text selection or double-click
- **Theme** - Light, dark, or auto (system)

## Development

```bash
npm install          # Install dependencies
npm run dev          # Watch mode (rebuilds on change)
npm run build        # Production build
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
```

## Architecture

```
src/
├── content/         # Content script (injected into pages)
│   └── index.ts     # Text selection → trigger icon → popup (Shadow DOM)
├── background/      # Service worker
│   └── index.ts     # Message router, API calls
├── options/         # Options page
├── notes/           # Vocabulary notes page
├── lib/             # Shared utilities
│   ├── ai.ts        # Gemini API client (optional)
│   ├── cambridge.ts # Cambridge Dictionary parser
│   ├── google-translate.ts # Google Translate (primary)
│   ├── lru-cache.ts # Bounded LRU cache utility
│   ├── db.ts        # IndexedDB (Dexie.js)
│   ├── storage.ts   # Chrome sync storage
│   └── types.ts     # TypeScript types
└── assets/icons/    # Extension icons
```

## Tech Stack

- **Manifest V3** - Modern Chrome extension format
- **TypeScript** - Type safety
- **Vite** - Fast bundling with tree-shaking
- **Dexie.js** - IndexedDB wrapper for notes
- **Shadow DOM** - Popup style isolation from host pages
- **Google Translate** - Primary translation (free, no key needed)
- **Google Gemini** - Optional AI enhancement (free tier)
- **Cambridge Dictionary** - Definitions and phonetics

## Privacy

- No analytics or tracking scripts
- No data sent to third parties (only Google Translate for translation, Cambridge for dictionary, optionally Gemini for AI)
- All vocabulary data stored locally in your browser (IndexedDB)
- API key stored in Chrome sync storage (your Google account only)

## License

MIT
