import type { MessageType, Settings } from '@/lib/types';

let triggerEl: HTMLElement | null = null;
let popupEl: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let currentSettings: Settings | null = null;
let selectedText = '';
let triggerX = 0;
let triggerY = 0;

// Debounce timer
let selectionTimeout: ReturnType<typeof setTimeout> | null = null;

// Request tracking to prevent race conditions
let currentRequestId = 0;

// Clean translate icon (Lucide-style)
const TRIGGER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>`;

async function init() {
  currentSettings = await sendMessage({ type: 'GET_SETTINGS' }) as Settings;
  if (!currentSettings?.popupEnabled) return;

  if (currentSettings.triggerMethod === 'double-click') {
    document.addEventListener('dblclick', onDoubleClick);
  } else {
    document.addEventListener('mouseup', onMouseUp);
  }
  document.addEventListener('keydown', onKeyDown);
}

function onMouseUp(e: MouseEvent) {
  // Ignore clicks inside our elements
  if (triggerEl?.contains(e.target as Node)) return;
  if (popupEl?.contains(e.target as Node)) return;

  if (selectionTimeout) clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(() => handleSelection(e), 150);
}

function onDoubleClick(e: MouseEvent) {
  // On double-click, skip the trigger icon and directly show popup
  if (triggerEl?.contains(e.target as Node)) return;
  if (popupEl?.contains(e.target as Node)) return;

  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (!text || text.length < 1 || text.length > 500) return;
  if (!selection || selection.rangeCount === 0) return;
  if (isNonTranslatable(text)) return;

  selectedText = text;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  showPopup(text, rect.right, rect.top);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    hideTrigger();
    hidePopup();
  }
}

function handleSelection(_e: MouseEvent) {
  const selection = window.getSelection();
  const text = selection?.toString().trim();

  if (!text || text.length < 1 || text.length > 500) {
    hideTrigger();
    return;
  }

  if (!selection || selection.rangeCount === 0) {
    hideTrigger();
    return;
  }

  // Skip non-translatable content
  if (isNonTranslatable(text)) {
    hideTrigger();
    return;
  }

  selectedText = text;

  // Position based on the highlighted text bounds, not cursor
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  triggerX = rect.right;
  triggerY = rect.top;
  showTrigger(rect);
}

function isNonTranslatable(text: string): boolean {
  // URLs
  if (/^https?:\/\/\S+$/i.test(text)) return true;
  // Email addresses
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(text)) return true;
  // Pure numbers / dates
  if (/^[\d\s.,/:%-]+$/.test(text)) return true;
  // Code-like content (has lots of special chars)
  const specialRatio = (text.match(/[{}()[\];=<>|&^~`$#@!]/g) || []).length / text.length;
  if (specialRatio > 0.15) return true;
  // File paths
  if (/^[/\\]?[\w.-]+([/\\][\w.-]+)+$/.test(text)) return true;
  return false;
}

// --- Trigger Icon ---

function showTrigger(rect: DOMRect) {
  hidePopup();

  if (!triggerEl) {
    createTrigger();
  }

  // Position at top-right corner of the selection
  const margin = 4;
  const size = 32;
  let left = rect.right + margin;
  let top = rect.top - size / 2 + rect.height / 2;

  // Prevent overflow right
  if (left + size > window.innerWidth) {
    left = rect.left - size - margin;
  }
  // Prevent overflow top/bottom
  if (top < margin) top = margin;
  if (top + size > window.innerHeight) top = window.innerHeight - size - margin;

  triggerEl!.style.left = `${left}px`;
  triggerEl!.style.top = `${top}px`;
  triggerEl!.style.display = 'flex';
}

function hideTrigger() {
  if (triggerEl) {
    triggerEl.style.display = 'none';
  }
}

function createTrigger() {
  triggerEl = document.createElement('div');
  triggerEl.id = 'wordsnap-trigger';
  triggerEl.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    display: none;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #2563EB;
    box-shadow: 0 2px 12px rgba(37,99,235,0.4), 0 1px 3px rgba(0,0,0,0.1);
    cursor: pointer;
    align-items: center;
    justify-content: center;
    transition: transform 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1);
  `;
  triggerEl.innerHTML = TRIGGER_ICON_SVG;
  triggerEl.title = 'Translate with WordSnap';
  document.body.appendChild(triggerEl);

  triggerEl.addEventListener('mouseenter', () => {
    if (triggerEl) triggerEl.style.transform = 'scale(1.1)';
    if (triggerEl) triggerEl.style.boxShadow = '0 4px 16px rgba(37,99,235,0.5), 0 2px 4px rgba(0,0,0,0.1)';
  });
  triggerEl.addEventListener('mouseleave', () => {
    if (triggerEl) triggerEl.style.transform = 'scale(1)';
    if (triggerEl) triggerEl.style.boxShadow = '0 2px 12px rgba(37,99,235,0.4), 0 1px 3px rgba(0,0,0,0.1)';
  });
  triggerEl.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideTrigger();
    if (selectedText) {
      showPopup(selectedText, triggerX, triggerY);
    }
  });

  // Click outside to dismiss trigger
  document.addEventListener('mousedown', (e) => {
    if (triggerEl && !triggerEl.contains(e.target as Node) && triggerEl.style.display !== 'none') {
      if (!popupEl?.contains(e.target as Node)) {
        hideTrigger();
      }
    }
  });
}

// --- Translation Popup ---

// Store position anchor so we can reposition after content loads
let popupAnchorX = 0;
let popupAnchorY = 0;

function showPopup(text: string, x: number, y: number) {
  if (!popupEl) {
    createPopup();
  }

  // Apply theme class to shadow host
  applyThemeClass();

  popupAnchorX = x;
  popupAnchorY = y;
  popupEl!.style.display = 'block';
  positionPopup(x, y);
  renderLoading(text);
  fetchData(text);
}

function applyThemeClass() {
  if (!popupEl || !currentSettings) return;
  popupEl.classList.remove('theme-light', 'theme-dark');
  if (currentSettings.theme === 'light') {
    popupEl.classList.add('theme-light');
  } else if (currentSettings.theme === 'dark') {
    popupEl.classList.add('theme-dark');
  }
  // 'auto' uses the @media query fallback (no class needed)
}

function repositionPopup() {
  // Re-run positioning with actual dimensions after content renders
  if (popupEl && popupEl.style.display !== 'none') {
    positionPopup(popupAnchorX, popupAnchorY);
  }
}

function hidePopup() {
  if (popupEl) {
    popupEl.style.display = 'none';
  }
}

function createPopup() {
  popupEl = document.createElement('div');
  popupEl.id = 'wordsnap-popup';
  popupEl.setAttribute('role', 'dialog');
  popupEl.setAttribute('aria-label', 'Translation popup');
  popupEl.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    display: none;
    max-width: 420px;
    min-width: 300px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
  shadowRoot = popupEl.attachShadow({ mode: 'closed' });
  document.body.appendChild(popupEl);

  // Click outside to dismiss
  document.addEventListener('mousedown', (e) => {
    if (popupEl && !popupEl.contains(e.target as Node) && popupEl.style.display !== 'none') {
      if (!triggerEl?.contains(e.target as Node)) {
        hidePopup();
      }
    }
  });
}

function positionPopup(x: number, y: number) {
  if (!popupEl) return;

  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Measure actual popup dimensions (use estimates if not yet rendered)
  const popupRect = popupEl.getBoundingClientRect();
  const pw = popupRect.width > 0 ? popupRect.width : 420;
  const ph = popupRect.height > 0 ? popupRect.height : 300;

  let left = x + margin;
  let top = y + margin;

  // Flip horizontally if overflows right edge
  if (left + pw > vw - margin) {
    left = x - pw - margin;
  }
  // Flip vertically if overflows bottom edge
  if (top + ph > vh - margin) {
    top = y - ph - margin;
  }

  // Clamp to viewport boundaries
  left = Math.max(margin, Math.min(left, vw - pw - margin));
  top = Math.max(margin, Math.min(top, vh - ph - margin));

  popupEl.style.left = `${left}px`;
  popupEl.style.top = `${top}px`;
  popupEl.style.maxHeight = `${vh - margin * 2}px`;
}

function renderLoading(text: string) {
  if (!shadowRoot) return;
  shadowRoot.innerHTML = `
    <style>${getStyles()}</style>
    <div class="popup-container">
      <div class="popup-header">
        <span class="popup-word">${escapeHtml(text)}</span>
        <button class="popup-close" title="Close" aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="popup-body">
        <div class="loading">
          <div class="spinner"></div>
          <span>Translating...</span>
        </div>
      </div>
    </div>
  `;
  shadowRoot.querySelector('.popup-close')?.addEventListener('click', hidePopup);
}

async function fetchData(text: string) {
  const requestId = ++currentRequestId;
  const wordCount = text.split(/\s+/).length;
  const isSingleWord = wordCount === 1;
  const isWord = wordCount <= 2;
  const isPhrase = wordCount <= 6;

  // Fetch Google Translate (primary) + dictionary for single words only
  const [translationRes, dictionaryRes] = await Promise.allSettled([
    sendMessage({ type: 'TRANSLATE', text }),
    isSingleWord ? sendMessage({ type: 'LOOKUP_DICTIONARY', word: text }) : Promise.resolve(null),
  ]);

  // Discard stale response if user selected new text
  if (requestId !== currentRequestId) return;

  const translation = translationRes.status === 'fulfilled' ? translationRes.value : null;
  const dictionary = dictionaryRes.status === 'fulfilled' ? dictionaryRes.value : null;

  renderResult(text, translation, dictionary, isWord, isPhrase);

  // Lazy-load AI enhancement if API key is configured
  loadAiEnhancement(text, isWord, isPhrase, requestId);
}

async function loadAiEnhancement(text: string, isWord: boolean, isPhrase: boolean, requestId: number) {
  try {
    const aiResult = await sendMessage({ type: 'TRANSLATE_AI', text });
    // Discard if stale
    if (requestId !== currentRequestId || !aiResult || !shadowRoot) return;

    const ai = aiResult as {
      translated?: string;
      explanation?: string;
      examples?: string[];
      collocations?: string[];
      antonyms?: string[];
      grammar?: string;
    };
    const aiSection = shadowRoot.querySelector('.ai-section');

    if (aiSection && ai.translated) {
      const titleLabel = isWord ? 'AI Word Analysis' : isPhrase ? 'AI Explanation' : 'AI Analysis';
      const explanationHtml = ai.explanation ? `<div class="explanation">${escapeHtml(ai.explanation)}</div>` : '';
      const grammarHtml = ai.grammar ? `<div class="ai-meta-line"><span class="ai-meta-label">Grammar:</span><span>${escapeHtml(ai.grammar)}</span></div>` : '';
      const collocationsHtml = ai.collocations?.length
        ? `<div class="ai-meta-line"><span class="ai-meta-label">AI Collocations:</span> ${ai.collocations.map((item) => `<span class="ai-meta-chip">${escapeHtml(item)}</span>`).join(' ')}</div>`
        : '';
      const antonymsHtml = ai.antonyms?.length
        ? `<div class="ai-meta-line"><span class="ai-meta-label">Antonyms:</span> ${ai.antonyms.map((item) => `<span class="ai-meta-chip">${escapeHtml(item)}</span>`).join(' ')}</div>`
        : '';

      aiSection.innerHTML = `
        <div class="section-title"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-1px;margin-right:4px"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>${titleLabel}</div>
        <div class="translated-text">${escapeHtml(ai.translated)}</div>
        ${explanationHtml}
        ${grammarHtml}
        ${collocationsHtml}
        ${antonymsHtml}
        ${ai.examples?.length ? `<div class="ai-details">${ai.examples.map((ex) => `<div class="ai-detail-item">${escapeHtml(ex)}</div>`).join('')}</div>` : ''}
      `;
      aiSection.classList.remove('loading-ai');
      repositionPopup();
    }
  } catch {
    // AI not available - show subtle message instead of removing
    if (requestId !== currentRequestId) return;
    const aiSection = shadowRoot?.querySelector('.ai-section');
    if (aiSection) {
      aiSection.innerHTML = `<div class="ai-unavailable">AI analysis unavailable</div>`;
      aiSection.classList.remove('loading-ai');
    }
  }
}

function renderResult(text: string, translation: unknown, dictionary: unknown, isWord: boolean, isPhrase: boolean) {
  if (!shadowRoot) return;

  const t = translation as {
    translated?: string;
    type?: string;
    sourceLang?: string;
    transliteration?: string;
    alternatives?: string[];
    definitions?: { pos: string; meanings: string[] }[];
    examples?: string[];
    synonyms?: string[];
    collocations?: string[];
    antonyms?: string[];
    grammar?: string;
  } | null;
  const d = dictionary as {
    found?: boolean;
    phonetics?: { ipa: string; audioUrl?: string; region?: 'UK' | 'US' }[];
    definitions?: { partOfSpeech: string; meaning: string; examples: string[] }[];
    examples?: string[];
    synonyms?: string[];
    collocations?: string[];
  } | null;

  // --- Header info (IPA + transliteration + word class for words) ---
  let phoneticsHtml = '';
  // Prefer Cambridge IPA, fall back to GT transliteration
  if (d?.found && d.phonetics?.length) {
    phoneticsHtml = `<div class="phonetics">${d.phonetics.map((p) =>
      `<span class="ipa-group">${p.region ? `<span class="ipa-label">${escapeHtml(p.region)}</span>` : ''}<span class="ipa">${escapeHtml(p.ipa)}</span>${p.audioUrl ? `<button class="audio-btn" data-url="${p.audioUrl}" title="Play pronunciation" aria-label="Play pronunciation"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg></button>` : ''}</span>`
    ).join(' ')}</div>`;
  } else if (t?.transliteration) {
    phoneticsHtml = `<div class="phonetics"><span class="ipa transliteration">${escapeHtml(t.transliteration)}</span></div>`;
  }

  // Word class badges (noun, verb, adj, etc.) from GT definitions or Cambridge
  let wordClassHtml = '';
  if (isWord) {
    const posSet = new Set<string>();
    if (t?.definitions?.length) {
      t.definitions.forEach((def) => posSet.add(def.pos.toLowerCase()));
    } else if (d?.found && d.definitions?.length) {
      d.definitions.forEach((def) => posSet.add(def.partOfSpeech.toLowerCase()));
    }
    if (posSet.size > 0) {
      wordClassHtml = `<div class="word-classes">${[...posSet].map((pos) =>
        `<span class="word-class-badge">${escapeHtml(pos)}</span>`
      ).join('')}</div>`;
    }
  }

  // --- Translation section with TTS + copy ---
  let translationHtml = '';
  const isSameLang = t?.sourceLang && currentSettings?.targetLang
    && t.sourceLang.toLowerCase() === currentSettings.targetLang.toLowerCase();

  if (isSameLang && t?.translated) {
    // Same language detected - show dictionary info without translation
    translationHtml = `
      <div class="section same-lang-notice">
        <span class="lang-badge">${t.sourceLang!.toUpperCase()}</span>
        <span class="same-lang-text">Already in your target language</span>
      </div>
    `;
  } else if (t?.translated) {
    const langBadge = t.sourceLang && t.sourceLang !== 'und'
      ? `<span class="lang-badge">${t.sourceLang.toUpperCase()} > ${currentSettings?.targetLang?.toUpperCase() || 'VI'}</span>`
      : '';
    const ttsBtn = `<button class="tts-btn" data-text="${escapeHtml(text)}" data-lang="${t.sourceLang || 'en'}" title="Listen to original" aria-label="Listen to original text"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg></button>`;
    const copyBtn = `<button class="copy-btn" data-text="${escapeHtml(t.translated)}" title="Copy" aria-label="Copy translation"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>`;
    translationHtml = `
      <div class="section translation">
        <div class="section-title">Translation ${langBadge}</div>
        <div class="translation-row">
          <div class="translated-text">${escapeHtml(t.translated)}</div>
          <div class="translation-actions">${ttsBtn}${copyBtn}</div>
        </div>
      </div>
    `;
  } else {
    translationHtml = `<div class="section error"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>Translation failed. Check your internet connection.</div>`;
  }

  // --- Alternatives (for words) ---
  let alternativesHtml = '';
  if (t?.alternatives?.length && isWord) {
    alternativesHtml = `
      <div class="section alternatives">
        <div class="section-title">Other Meanings</div>
        <div class="alt-list">${t.alternatives.map((a) => `<span class="alt-chip">${escapeHtml(a)}</span>`).join('')}</div>
      </div>
    `;
  }

  // --- Definitions (collapsible if >3) ---
  let definitionsHtml = '';
  if (t?.definitions?.length && isWord) {
    const defs = t.definitions;
    const visibleDefs = defs.slice(0, 3);
    const hiddenDefs = defs.slice(3);
    definitionsHtml = `
      <div class="section gt-definitions">
        <div class="section-title">Definitions</div>
        ${visibleDefs.map((def) => `
          <div class="gt-def-entry">
            <span class="pos">${escapeHtml(def.pos)}</span>
            <span class="gt-meanings">${def.meanings.slice(0, 4).map((m) => escapeHtml(m)).join(', ')}</span>
          </div>
        `).join('')}
        ${hiddenDefs.length ? `
          <div class="defs-collapsed" style="display:none">
            ${hiddenDefs.map((def) => `<div class="gt-def-entry"><span class="pos">${escapeHtml(def.pos)}</span><span class="gt-meanings">${def.meanings.slice(0, 4).map((m) => escapeHtml(m)).join(', ')}</span></div>`).join('')}
          </div>
          <button class="expand-btn" data-target="defs-collapsed">+${hiddenDefs.length} more</button>
        ` : ''}
      </div>
    `;
  }

  const mergedSynonyms = uniqueItems([...(t?.synonyms || []), ...(d?.synonyms || [])], 12);
  const mergedCollocations = uniqueItems([...(t?.collocations || []), ...(d?.collocations || [])], 12);
  const mergedExamples = uniqueItems([...(t?.examples || []), ...(d?.examples || [])], 10);

  let cambridgeDefinitionsHtml = '';
  if (d?.found && d.definitions?.length) {
    const visibleCam = d.definitions.slice(0, 3);
    const hiddenCam = d.definitions.slice(3);
    cambridgeDefinitionsHtml = `
      <div class="section dictionary dictionary-panel-section">
        <div class="section-title">Cambridge Dictionary</div>
        ${visibleCam.map((def) => `
          <div class="def-entry">
            <span class="pos">${escapeHtml(def.partOfSpeech)}</span>
            <span class="meaning">${escapeHtml(def.meaning)}</span>
            ${def.examples.length ? `<div class="def-examples">${def.examples.map((ex) => `<div class="def-example">"${escapeHtml(ex)}"</div>`).join('')}</div>` : ''}
          </div>
        `).join('')}
        ${hiddenCam.length ? `
          <div class="cam-collapsed" style="display:none">
            ${hiddenCam.map((def) => `
              <div class="def-entry">
                <span class="pos">${escapeHtml(def.partOfSpeech)}</span>
                <span class="meaning">${escapeHtml(def.meaning)}</span>
                ${def.examples.length ? `<div class="def-examples">${def.examples.map((ex) => `<div class="def-example">"${escapeHtml(ex)}"</div>`).join('')}</div>` : ''}
              </div>
            `).join('')}
          </div>
          <button class="expand-btn" data-target="cam-collapsed">+${hiddenCam.length} more</button>
        ` : ''}
      </div>
    `;
  }

  const overviewTabId = 'tab-overview';
  const detailsTabId = 'tab-details';
  const synonymsTabId = 'tab-synonyms';
  const collocationsTabId = 'tab-collocations';
  const examplesTabId = 'tab-examples';

  const overviewPanelId = 'panel-overview';
  const detailsPanelId = 'panel-details';
  const synonymsPanelId = 'panel-synonyms';
  const collocationsPanelId = 'panel-collocations';
  const examplesPanelId = 'panel-examples';

  const tabButtons = [
    { id: overviewTabId, label: 'Overview', panelId: overviewPanelId, active: true },
    { id: detailsTabId, label: 'Definitions', panelId: detailsPanelId, active: false },
    ...(mergedSynonyms.length ? [{ id: synonymsTabId, label: 'Synonyms', panelId: synonymsPanelId, active: false }] : []),
    ...(mergedCollocations.length ? [{ id: collocationsTabId, label: 'Collocations', panelId: collocationsPanelId, active: false }] : []),
    ...(mergedExamples.length ? [{ id: examplesTabId, label: 'Examples', panelId: examplesPanelId, active: false }] : []),
  ];

  const tabsHtml = `
    <div class="tabs" role="tablist" aria-label="Dictionary details">
      ${tabButtons.map((tab) => `
        <button class="tab-btn${tab.active ? ' active' : ''}" role="tab" id="${tab.id}" aria-selected="${tab.active ? 'true' : 'false'}" aria-controls="${tab.panelId}" data-panel="${tab.panelId}">${tab.label}</button>
      `).join('')}
    </div>
  `;

  const overviewPanelHtml = `
    <section class="tab-panel active" id="${overviewPanelId}" role="tabpanel" aria-labelledby="${overviewTabId}">
      ${translationHtml}
      ${alternativesHtml}
      ${cambridgeDefinitionsHtml}
    </section>
  `;

  const detailsPanelHtml = `
    <section class="tab-panel" id="${detailsPanelId}" role="tabpanel" aria-labelledby="${detailsTabId}" hidden>
      ${definitionsHtml || '<div class="section empty-state">No Google definition groups available for this selection.</div>'}
      ${d?.found ? '' : '<div class="section empty-state">Cambridge dictionary data is only available when a word entry is found.</div>'}
    </section>
  `;

  const synonymsPanelHtml = mergedSynonyms.length ? `
    <section class="tab-panel" id="${synonymsPanelId}" role="tabpanel" aria-labelledby="${synonymsTabId}" hidden>
      <div class="section synonyms">
        <div class="section-title">Synonyms</div>
        <div class="syn-list">${mergedSynonyms.map((s) => `<span class="syn-chip">${escapeHtml(s)}</span>`).join('')}</div>
      </div>
    </section>
  ` : '';

  const collocationsPanelHtml = mergedCollocations.length ? `
    <section class="tab-panel" id="${collocationsPanelId}" role="tabpanel" aria-labelledby="${collocationsTabId}" hidden>
      <div class="section collocations-section">
        <div class="section-title">Collocations</div>
        <div class="syn-list">${mergedCollocations.map((item) => `<span class="syn-chip collocation-chip">${escapeHtml(item)}</span>`).join('')}</div>
      </div>
    </section>
  ` : '';

  const examplesPanelHtml = mergedExamples.length ? `
    <section class="tab-panel" id="${examplesPanelId}" role="tabpanel" aria-labelledby="${examplesTabId}" hidden>
      <div class="section examples-section">
        <div class="section-title">Examples</div>
        <div class="examples">${mergedExamples.map((ex) => `<div class="example">${escapeHtml(ex)}</div>`).join('')}</div>
      </div>
    </section>
  ` : '';

  // --- AI section placeholder (lazy-loaded) ---
  const aiHtml = `<div class="section ai-section loading-ai"><div class="ai-loading-hint"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-1px;margin-right:4px"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>Loading AI analysis...</div></div>`;

  // --- Meta info for long text ---
  let metaHtml = '';
  if (!isWord && !isPhrase) {
    const wc = text.split(/\s+/).length;
    const sc = text.split(/[.!?]+/).filter(Boolean).length;
    metaHtml = `<div class="section meta-info"><span class="meta-badge">${wc} words</span><span class="meta-badge">${sc} sentence${sc > 1 ? 's' : ''}</span></div>`;
  }

  // --- Header with tooltip for full text ---
  const displayText = text.length > 60 ? text.substring(0, 57) + '...' : text;
  const titleAttr = text.length > 60 ? ` title="${escapeHtml(text.substring(0, 200))}"` : '';

  shadowRoot.innerHTML = `
    <style>${getStyles()}</style>
    <div class="popup-container">
      <div class="popup-header">
        <div class="popup-header-left">
          <span class="popup-word"${titleAttr}>${escapeHtml(displayText)}</span>
          ${phoneticsHtml}
        </div>
        <button class="popup-close" title="Close" aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      ${wordClassHtml}
      <div class="popup-body">
        ${metaHtml}
        ${tabsHtml}
        <div class="tab-panels">
          ${overviewPanelHtml}
          ${detailsPanelHtml}
          ${synonymsPanelHtml}
          ${collocationsPanelHtml}
          ${examplesPanelHtml}
        </div>
        ${aiHtml}
      </div>
      <div class="popup-footer">
        <button class="save-btn" title="Save to notes"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save</button>
      </div>
    </div>
  `;

  // Event listeners
  shadowRoot.querySelector('.popup-close')?.addEventListener('click', hidePopup);
  shadowRoot.querySelector('.save-btn')?.addEventListener('click', () => saveWord(text, t?.translated || ''));
  shadowRoot.querySelectorAll('.audio-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = (btn as HTMLElement).dataset.url;
      if (url) new Audio(url).play();
    });
  });
  // TTS - browser speech synthesis for translation
  shadowRoot.querySelectorAll('.tts-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ttsText = (btn as HTMLElement).dataset.text;
      const lang = (btn as HTMLElement).dataset.lang || 'vi';
      if (ttsText && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(ttsText);
        u.lang = lang;
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
      }
    });
  });
  // Copy translation to clipboard
  shadowRoot.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const copyText = (btn as HTMLElement).dataset.text;
      if (copyText) {
        await navigator.clipboard.writeText(copyText);
        (btn as HTMLElement).classList.add('copied');
        setTimeout(() => (btn as HTMLElement).classList.remove('copied'), 1500);
      }
    });
  });
  // Expand/collapse sections
  shadowRoot.querySelectorAll('.expand-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = (btn as HTMLElement).dataset.target;
      if (!target || !shadowRoot) return;
      const el = shadowRoot.querySelector(`.${target}`) as HTMLElement;
      if (el) {
        const hidden = el.style.display === 'none';
        el.style.display = hidden ? 'block' : 'none';
        (btn as HTMLElement).textContent = hidden ? 'Show less' : btn.textContent || '';
        repositionPopup();
      }
    });
  });

  shadowRoot.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!shadowRoot) return;
      const panelId = (btn as HTMLElement).dataset.panel;
      if (!panelId) return;

      shadowRoot.querySelectorAll('.tab-btn').forEach((tab) => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
      });
      shadowRoot.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.remove('active');
        panel.setAttribute('hidden', 'true');
      });

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const panel = shadowRoot.querySelector(`#${panelId}`);
      if (panel) {
        panel.classList.add('active');
        panel.removeAttribute('hidden');
      }
      repositionPopup();
    });
  });

  // Reposition now that content is rendered with actual dimensions
  requestAnimationFrame(repositionPopup);
}

async function saveWord(word: string, translation: string) {
  const saveBtn = shadowRoot?.querySelector('.save-btn') as HTMLButtonElement | null;
  if (!saveBtn || saveBtn.disabled) return;

  // Disable immediately to prevent double-clicks
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const context = getSelectionContext();
    await sendMessage({
      type: 'SAVE_NOTE',
      note: {
        word,
        translation,
        context,
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        tags: [],
      },
    });
    saveBtn.textContent = '✓ Saved!';
  } catch {
    saveBtn.textContent = '✗ Failed';
    saveBtn.disabled = false; // Allow retry on failure
  }
}

function getSelectionContext(): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return '';

  const range = selection.getRangeAt(0);
  const container = range.startContainer.parentElement;
  return container?.textContent?.substring(0, 200) || '';
}

async function sendMessage(message: MessageType): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || 'Unknown error'));
      }
    });
  });
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getStyles(): string {
  return `
    :host {
      --color-primary: #2563EB;
      --color-primary-hover: #1d4ed8;
      --color-bg: #ffffff;
      --color-surface: #f8fafc;
      --color-text: #1e293b;
      --color-text-secondary: #64748b;
      --color-text-muted: #94a3b8;
      --color-border: #e2e8f0;
      --color-success: #16a34a;
      --color-error: #dc2626;
      --radius: 12px;
      --shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
      --transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
      --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .popup-container {
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      font-size: 14px;
      font-family: var(--font);
      line-height: 1.5;
      color: var(--color-text);
      overflow: hidden;
      max-height: calc(100vh - 16px);
      display: flex;
      flex-direction: column;
      animation: popupIn 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes popupIn {
      from { opacity: 0; transform: translateY(4px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .popup-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
    }
    .popup-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }
    .popup-word {
      font-weight: 600;
      font-size: 15px;
      color: var(--color-primary);
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .word-classes {
      display: flex;
      gap: 6px;
      padding: 6px 14px;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      flex-wrap: wrap;
    }
    .word-class-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      text-transform: lowercase;
    }
    .popup-close {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 18px;
      color: var(--color-text-muted);
      padding: 4px 6px;
      border-radius: 6px;
      line-height: 1;
      transition: all var(--transition);
    }
    .popup-close:hover { background: var(--color-border); color: var(--color-text); }
    .popup-body {
      padding: 14px;
      overflow-y: auto;
      overscroll-behavior: contain;
      flex: 1;
      min-height: 0;
    }
    .popup-body::-webkit-scrollbar { width: 4px; }
    .popup-body::-webkit-scrollbar-track { background: transparent; }
    .popup-body::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }
    .popup-footer {
      padding: 10px 14px;
      border-top: 1px solid var(--color-border);
      display: flex;
      justify-content: flex-end;
      background: var(--color-surface);
    }
    .save-btn {
      background: var(--color-primary);
      color: white;
      border: none;
      padding: 7px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      font-family: var(--font);
      transition: all var(--transition);
    }
    .save-btn:hover { background: var(--color-primary-hover); transform: translateY(-1px); }
    .save-btn:active { transform: translateY(0); }
    .save-btn:disabled { background: #93c5fd; cursor: default; transform: none; }
    .section { margin-bottom: 14px; }
    .section:last-child { margin-bottom: 0; }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--color-text-muted);
      margin-bottom: 6px;
      letter-spacing: 0.05em;
    }
    .translated-text {
      font-size: 15px;
      font-weight: 500;
      color: var(--color-text);
      line-height: 1.4;
    }
    .explanation {
      font-size: 13px;
      color: var(--color-text-secondary);
      margin-top: 4px;
      line-height: 1.5;
    }
    .examples { margin-top: 8px; }
    .example {
      font-size: 13px;
      color: var(--color-text-secondary);
      font-style: italic;
      margin-bottom: 3px;
      padding-left: 8px;
      border-left: 2px solid var(--color-border);
    }
    .phonetics {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .ipa-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .ipa-label {
      font-size: 10px;
      font-weight: 600;
      color: var(--color-text-muted);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .ipa {
      font-size: 13px;
      color: var(--color-text-secondary);
      font-style: italic;
    }
    .ipa.transliteration {
      font-style: normal;
      font-size: 12px;
      color: var(--color-text-muted);
    }
    .audio-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background var(--transition);
    }
    .audio-btn:hover { background: var(--color-border); }
    .dictionary .def-entry {
      margin-bottom: 10px;
      padding-left: 10px;
      border-left: 3px solid var(--color-border);
    }
    .pos {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--color-text-muted);
      background: var(--color-surface);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid var(--color-border);
      margin-right: 8px;
      letter-spacing: 0.03em;
    }
    .meaning { font-size: 13px; color: var(--color-text); line-height: 1.5; }
    .def-examples { margin-top: 4px; }
    .def-example {
      font-size: 12px;
      color: var(--color-text-muted);
      font-style: italic;
      line-height: 1.4;
    }
    .loading {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 0;
      color: var(--color-text-muted);
      font-size: 13px;
    }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error {
      color: var(--color-error);
      font-size: 13px;
      padding: 8px 12px;
      background: #fef2f2;
      border-radius: 6px;
      border: 1px solid #fecaca;
    }
    .ai-section {
      border-top: 1px dashed var(--color-border);
      padding-top: 12px;
      margin-top: 12px;
    }
    .ai-loading-hint {
      font-size: 12px;
      color: var(--color-text-muted);
    }
    .loading-ai .ai-loading-hint { display: block; }
    .ai-section:empty { display: none; }
    .ai-unavailable {
      font-size: 12px;
      color: var(--color-text-muted);
      font-style: italic;
    }
    .ai-details { margin-top: 6px; }
    .ai-detail-item {
      font-size: 13px;
      color: var(--color-text-secondary);
      padding: 3px 0;
      padding-left: 8px;
      border-left: 2px solid var(--color-border);
      margin-bottom: 4px;
    }
    .ai-meta-line {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
      font-size: 12px;
    }
    .ai-meta-label {
      font-weight: 600;
      color: var(--color-text-muted);
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.04em;
    }
    .ai-meta-chip {
      display: inline-block;
      font-size: 12px;
      padding: 1px 8px;
      border-radius: 10px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
    }
    .translation-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .translation-row .translated-text { flex: 1; }
    .translation-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
      padding-top: 2px;
    }
    .tts-btn, .copy-btn {
      background: none;
      border: 1px solid var(--color-border);
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 5px;
      color: var(--color-text-muted);
      transition: all var(--transition);
      line-height: 1;
    }
    .tts-btn:hover, .copy-btn:hover {
      background: var(--color-surface);
      color: var(--color-primary);
      border-color: var(--color-primary);
    }
    .copy-btn.copied {
      background: var(--color-success);
      border-color: var(--color-success);
      color: white;
    }
    .expand-btn {
      background: none;
      border: none;
      color: var(--color-primary);
      font-size: 12px;
      cursor: pointer;
      padding: 4px 0;
      font-weight: 500;
      transition: opacity var(--transition);
    }
    .expand-btn:hover { opacity: 0.7; }
    .tabs {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
      margin-bottom: 12px;
      scrollbar-width: thin;
    }
    .tab-btn {
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all var(--transition);
    }
    .tab-btn:hover {
      color: var(--color-primary);
      border-color: var(--color-primary);
    }
    .tab-btn.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #fff;
    }
    .tab-panels {
      min-height: 80px;
    }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .empty-state {
      color: var(--color-text-muted);
      font-size: 13px;
      font-style: italic;
      padding: 8px 0;
    }
    .dictionary-panel-section {
      margin-bottom: 0;
    }
    .collocation-chip {
      background: #f5f3ff;
      border-color: #c4b5fd;
      color: #6d28d9;
    }
    .alt-list, .syn-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .alt-chip, .syn-chip {
      display: inline-block;
      font-size: 12px;
      padding: 3px 10px;
      border-radius: 14px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
    }
    .alt-chip { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
    .gt-definitions .gt-def-entry {
      margin-bottom: 6px;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .gt-meanings { font-size: 13px; color: var(--color-text-secondary); }
    .meta-info {
      display: flex;
      gap: 8px;
      margin-bottom: 4px;
    }
    .meta-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text-muted);
      font-weight: 500;
    }
    .lang-badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text-muted);
      margin-left: 6px;
      letter-spacing: 0.03em;
      vertical-align: middle;
    }
    .same-lang-notice {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--color-surface);
      border-radius: 6px;
      border: 1px solid var(--color-border);
    }
    .same-lang-notice .lang-badge { margin-left: 0; }
    .same-lang-text {
      font-size: 13px;
      color: var(--color-text-muted);
      font-style: italic;
    }

    @media (prefers-color-scheme: dark) {
      :host(:not(.theme-light)) {
        --color-bg: #1e293b;
        --color-surface: #0f172a;
        --color-text: #f1f5f9;
        --color-text-secondary: #94a3b8;
        --color-text-muted: #64748b;
        --color-border: #334155;
        --color-primary: #60a5fa;
        --color-primary-hover: #3b82f6;
        --shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3);
      }
      :host(:not(.theme-light)) .popup-container { border-color: #475569; }
      :host(:not(.theme-light)) .error { background: #450a0a; border-color: #991b1b; color: #fca5a5; }
      :host(:not(.theme-light)) .pos { background: #334155; border-color: #475569; color: #94a3b8; }
      :host(:not(.theme-light)) .save-btn { background: #3b82f6; }
      :host(:not(.theme-light)) .save-btn:hover { background: #2563eb; }
      :host(:not(.theme-light)) .save-btn:disabled { background: #1e40af; opacity: 0.6; }
      :host(:not(.theme-light)) .alt-chip { background: #1e3a5f; border-color: #2563eb; color: #93c5fd; }
      :host(:not(.theme-light)) .word-class-badge { background: #1e3a5f; border-color: #2563eb; color: #93c5fd; }
    }
    :host(.theme-dark) {
      --color-bg: #1e293b;
      --color-surface: #0f172a;
      --color-text: #f1f5f9;
      --color-text-secondary: #94a3b8;
      --color-text-muted: #64748b;
      --color-border: #334155;
      --color-primary: #60a5fa;
      --color-primary-hover: #3b82f6;
      --shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3);
    }
    :host(.theme-dark) .popup-container { border-color: #475569; }
    :host(.theme-dark) .error { background: #450a0a; border-color: #991b1b; color: #fca5a5; }
    :host(.theme-dark) .pos { background: #334155; border-color: #475569; color: #94a3b8; }
    :host(.theme-dark) .save-btn { background: #3b82f6; }
    :host(.theme-dark) .save-btn:hover { background: #2563eb; }
    :host(.theme-dark) .save-btn:disabled { background: #1e40af; opacity: 0.6; }
    :host(.theme-dark) .alt-chip { background: #1e3a5f; border-color: #2563eb; color: #93c5fd; }
    :host(.theme-dark) .word-class-badge { background: #1e3a5f; border-color: #2563eb; color: #93c5fd; }
    :host(.theme-dark) .collocation-chip { background: #312e81; border-color: #818cf8; color: #c7d2fe; }
    :host(.theme-dark) .tab-btn.active { color: #0f172a; }

    @media (prefers-reduced-motion: reduce) {
      .popup-container { animation: none; }
      * { transition: none !important; }
    }
  `;
}

function uniqueItems(items: string[], limit = 10): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

// Initialize
init();
