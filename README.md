# WordSnap

WordSnap is a cross-browser popup translation extension for English learning. Select text on a page and it opens a compact popup with translation results plus dictionary data.

## Features

- Popup translation for selected text
- Dictionary lookup with Cambridge and Longman data merged in the background script
- Local vocabulary notes stored in IndexedDB
- Configurable trigger method and theme
- Shared codebase that now builds for both Chromium and Firefox

## Development

```bash
npm install
npm run dev           # watch Chrome build into dist/chrome
npm run dev:firefox   # watch Firefox build into dist/firefox
npm run build         # build both browsers
npm run bundle        # build and pack both browsers
npm run build:chrome
npm run build:firefox
npm run typecheck
npm run lint
```

## Install locally

### Chromium

1. Run `npm run build:chrome`.
2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Click Load unpacked and choose `dist/chrome`.

### Firefox

1. Run `npm run build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click Load Temporary Add-on.
4. Choose any file inside `dist/firefox`, such as `manifest.json`.

## Build output

- `dist/chrome`: Chromium-compatible extension bundle using a Manifest V3 service worker
- `dist/firefox`: Firefox-compatible extension bundle using a Manifest V3 background script plus Gecko metadata
- `wordsnap-chrome.zip`: Chromium distributable created by `npm run bundle`
- `wordsnap-firefox.xpi`: Firefox distributable created by `npm run bundle`

## Notes

- The Firefox build uses `browser_specific_settings.gecko.id = wordsnap@local.addon` as a local default. Change that before publishing a signed add-on.
- `npm run bundle` also creates `wordsnap.crx` when `EXTENSION_KEY` or `EXTENSION_KEY_FILE` is provided.
- Chrome packaging in CI still depends on the `EXTENSION_KEY` secret.

