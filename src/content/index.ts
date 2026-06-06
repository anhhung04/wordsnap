import type { MessageType, Settings } from '@/lib/types';
import { sendRuntimeMessage } from '@/lib/extension-api';

let triggerEl: HTMLElement | null = null;
let popupEl: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let currentSettings: Settings | null = null;
let selectedText = '';
let triggerX = 0;
let triggerY = 0;

// Debounce timer
let selectionTimeout: ReturnType<typeof setTimeout> | null = null;
let copyFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

// Request tracking to prevent race conditions
let currentRequestId = 0;
let activePopupCleanup: (() => void) | null = null;
let lastFocusedElement: HTMLElement | null = null;

// Clean translate icon (Lucide-style)
const TRIGGER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>`;

async function init() {
  currentSettings = await sendMessage({ type: 'GET_SETTINGS' }) as Settings;
  if (!currentSettings?.popupEnabled) return;

  if (currentSettings.triggerMethod === 'double-click') {
    document.addEventListener('dblclick', onDoubleClick);
  } else {
    document.addEventListener('mouseup', onMouseUp);
  }
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('beforeunload', cleanup);
  document.addEventListener('visibilitychange', onVisibilityChange);
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
  const rawText = selection?.toString() || '';
  const text = rawText.trim();
  if (!text || !selection || selection.rangeCount === 0) return;
  if (text.length === 1 || isNonTranslatable(text)) return;

  selectedText = text;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  showPopup(text, rect.right, rect.top);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    hideTrigger();
    hidePopup();
    return;
  }

  if (e.key === 'Tab') {
    trapFocus(e);
  }
}

function onVisibilityChange() {
  if (document.hidden) {
    cleanup();
  }
}

function handleSelection(_e: MouseEvent) {
  const selection = window.getSelection();
  const rawText = selection?.toString() || '';
  const text = rawText.trim();

  if (!text) {
    hideTrigger();
    return;
  }

  if (!selection || selection.rangeCount === 0) {
    hideTrigger();
    return;
  }

  if (text.length === 1 || isNonTranslatable(text)) {
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
  const size = 28;
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
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid #ddd;
    background: #fafafa;
    color: #666;
    cursor: pointer;
    align-items: center;
    justify-content: center;
  `;
  triggerEl.innerHTML = TRIGGER_ICON_SVG;
  triggerEl.title = 'Translate with WordSnap';
  document.body.appendChild(triggerEl);

  triggerEl.addEventListener('mouseenter', () => {
    if (triggerEl) triggerEl.style.opacity = '0.7';
  });
  triggerEl.addEventListener('mouseleave', () => {
    if (triggerEl) triggerEl.style.opacity = '1';
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
let popupViewportMode: 'anchored' | 'sheet' = 'anchored';

function showPopup(text: string, x: number, y: number) {
  if (!popupEl) {
    createPopup();
  }

  cleanupPopupSession();

  // Apply theme class to shadow host
  applyThemeClass();

  popupAnchorX = x;
  popupAnchorY = y;
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  popupEl!.style.display = 'block';
  popupEl!.dataset.viewportMode = 'anchored';
  popupEl!.style.removeProperty('left');
  popupEl!.style.removeProperty('top');
  popupEl!.style.removeProperty('right');
  popupEl!.style.removeProperty('bottom');
  popupEl!.style.removeProperty('width');
  popupEl!.style.removeProperty('maxHeight');
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
  cleanupPopupSession();
  if (popupEl) {
    popupEl.style.display = 'none';
  }
  if (lastFocusedElement && document.contains(lastFocusedElement)) {
    lastFocusedElement.focus({ preventScroll: true });
  }
  lastFocusedElement = null;
}

function cleanupPopupSession() {
  currentRequestId += 1;
  if (copyFeedbackTimeout) {
    clearTimeout(copyFeedbackTimeout);
    copyFeedbackTimeout = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (activePopupCleanup) {
    activePopupCleanup();
    activePopupCleanup = null;
  }
}

function cleanup() {
  cleanupPopupSession();
  hidePopup();
  hideTrigger();
  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
    selectionTimeout = null;
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
    width: min(420px, calc(100vw - 24px));
    min-width: min(300px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
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

  const margin = 12;
  const desktopMargin = 12;
  const viewportOffsetTop = window.visualViewport?.offsetTop || 0;
  const viewportOffsetLeft = window.visualViewport?.offsetLeft || 0;
  const safeTop = Math.max(margin, margin + viewportOffsetTop);
  const safeLeft = Math.max(margin, margin + viewportOffsetLeft);
  const safeRight = margin;
  const safeBottom = margin;
  const vw = window.visualViewport?.width || window.innerWidth;
  const vh = window.visualViewport?.height || window.innerHeight;
  const popupRect = popupEl.getBoundingClientRect();
  const availableWidth = Math.max(260, vw - safeLeft - safeRight);
  const availableHeight = Math.max(220, vh - safeTop - safeBottom);
  const boundedWidth = Math.min(420, availableWidth);
  const boundedHeight = Math.min(560, availableHeight);
  const measuredWidth = popupRect.width > 0 ? popupRect.width : boundedWidth;
  const measuredHeight = popupRect.height > 0 ? popupRect.height : boundedHeight;
  const pw = Math.min(measuredWidth, boundedWidth);
  const ph = Math.min(measuredHeight, boundedHeight);
  const useSheetMode = vw <= 480 || availableWidth < 280;

  popupViewportMode = useSheetMode ? 'sheet' : 'anchored';
  popupEl.dataset.viewportMode = popupViewportMode;

  popupEl.style.maxWidth = `${boundedWidth}px`;
  popupEl.style.maxHeight = `${boundedHeight}px`;

  if (useSheetMode) {
    const sheetWidth = Math.min(380, boundedWidth);
    popupEl.style.left = `${Math.max(safeLeft, Math.min((vw - sheetWidth) / 2, vw - safeRight - sheetWidth))}px`;
    popupEl.style.right = 'auto';
    popupEl.style.top = `${Math.max(safeTop, Math.min((vh - ph) / 2, vh - safeBottom - ph))}px`;
    popupEl.style.bottom = 'auto';
    popupEl.style.width = `${sheetWidth}px`;
    return;
  }

  popupEl.style.removeProperty('right');
  popupEl.style.removeProperty('bottom');
  popupEl.style.width = `${pw}px`;

  const horizontalCandidates = [
    { left: x + desktopMargin, score: 0 },
    { left: x - pw - desktopMargin, score: 1 },
    { left: Math.min(Math.max(x - pw / 2, safeLeft), vw - safeRight - pw), score: 2 },
  ];

  const verticalCandidates = [
    { top: y + desktopMargin, score: 0 },
    { top: y - ph - desktopMargin, score: 1 },
    { top: Math.min(Math.max(y - ph / 2, safeTop), vh - safeBottom - ph), score: 2 },
  ];

  let bestLeft = safeLeft;
  let bestTop = safeTop;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const horizontal of horizontalCandidates) {
    for (const vertical of verticalCandidates) {
      const clampedLeft = Math.max(safeLeft, Math.min(horizontal.left, vw - safeRight - pw));
      const clampedTop = Math.max(safeTop, Math.min(vertical.top, vh - safeBottom - ph));
      const overflowX = Math.abs(horizontal.left - clampedLeft);
      const overflowY = Math.abs(vertical.top - clampedTop);
      const distancePenalty = Math.abs(clampedLeft - x) * 0.08 + Math.abs(clampedTop - y) * 0.12;
      const directionPenalty = horizontal.score * 6 + vertical.score * 8;
      const totalPenalty = overflowX * 2 + overflowY * 3 + distancePenalty + directionPenalty;

      if (totalPenalty < bestPenalty) {
        bestPenalty = totalPenalty;
        bestLeft = clampedLeft;
        bestTop = clampedTop;
      }
    }
  }

  popupEl.style.left = `${bestLeft}px`;
  popupEl.style.top = `${bestTop}px`;
  popupEl.style.maxHeight = `${boundedHeight}px`;
}

function renderLoading(_text: string) {
  if (!shadowRoot) return;
  shadowRoot.innerHTML = `
    <style>${getStyles()}</style>
    <div class="popup-container">
      <div class="popup-body loading-state">Loading...</div>
    </div>
  `;
}

async function fetchData(text: string) {
  const requestId = ++currentRequestId;
  const wordCount = text.split(/\s+/).length;
  const isSingleWord = wordCount === 1;
  const isWord = wordCount <= 2;
  const isPhrase = wordCount <= 6;
  const isLongText = text.length > 500;
  const normalizedLookupText = isSingleWord ? singularizeSelectedWord(text) : text;

  const [translationRes, dictionaryRes] = await Promise.allSettled([
    sendMessage({ type: 'TRANSLATE', text: normalizedLookupText }),
    isSingleWord && !isLongText ? sendMessage({ type: 'LOOKUP_DICTIONARY', word: normalizedLookupText }) : Promise.resolve(null),
  ]);

  if (requestId !== currentRequestId) return;

  const translation = translationRes.status === 'fulfilled' ? translationRes.value : null;
  const dictionary = dictionaryRes.status === 'fulfilled' ? dictionaryRes.value : null;
  const hasTranslationError = translationRes.status === 'rejected';
  const hasDictionaryError = dictionaryRes.status === 'rejected';

  renderResult(text, translation, dictionary, isWord, isPhrase, {
    translationFailed: hasTranslationError,
    dictionaryFailed: hasDictionaryError,
    longTextOnly: isLongText,
  });
}

function singularizeSelectedWord(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return text;

  const match = trimmed.match(/^([^a-zA-Z]*)([a-zA-Z]+)([^a-zA-Z]*)$/);
  if (!match) return text;

  const [, leading, core, trailing] = match;
  const singularCore = singularizeEnglishWord(core);
  return singularCore === core ? text : `${leading}${singularCore}${trailing}`;
}

function singularizeEnglishWord(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length <= 2 || !lower.endsWith('s')) return word;

  const irregularMap: Record<string, string> = {
    men: 'man',
    women: 'woman',
    children: 'child',
    teeth: 'tooth',
    feet: 'foot',
    geese: 'goose',
    mice: 'mouse',
    lice: 'louse',
    people: 'person',
    data: 'datum',
  };

  const invariantWords = new Set([
    'news',
    'series',
    'species',
    'means',
    'headquarters',
    'scissors',
    'trousers',
    'glasses',
    'thanks',
  ]);

  if (invariantWords.has(lower)) return word;
  if (irregularMap[lower]) return preserveWordCase(word, irregularMap[lower]);
  if (/(ss|us|is)$/.test(lower)) return word;
  if (/ies$/.test(lower) && lower.length > 3) return preserveWordCase(word, `${lower.slice(0, -3)}y`);
  if (/(xes|zes|ches|shes)$/.test(lower)) return preserveWordCase(word, lower.slice(0, -2));
  if (/ses$/.test(lower) && !/(sses|uses)$/.test(lower)) return preserveWordCase(word, lower.slice(0, -1));
  if (/s$/.test(lower) && !/ss$/.test(lower)) return preserveWordCase(word, lower.slice(0, -1));
  return word;
}

function preserveWordCase(source: string, target: string): string {
  if (source === source.toUpperCase()) return target.toUpperCase();
  if (source[0] === source[0].toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}

function renderResult(
  text: string,
  translation: unknown,
  dictionary: unknown,
  isWord: boolean,
  isPhrase: boolean,
  state: { translationFailed: boolean; dictionaryFailed: boolean; longTextOnly: boolean }
) {
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
    definitions?: {
      partOfSpeech: string;
      senses: {
        definition: string;
        examples?: { text: string }[];
        labels?: string[];
        register?: string;
        domain?: string;
        synonyms?: { cefr?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' }[];
      }[];
    }[];
    synonyms?: { word: string }[];
    collocations?: { phrase: string }[];
    grammar?: { patterns?: string[]; notes?: string[]; inflections?: string[] };
    technicalUsage?: { term: string; domain: string; meaning?: string; examples?: string[] }[];
    idioms?: { phrase: string; definition: string; example?: string }[];
    usageNotes?: { title: string; text: string }[];
    wordForms?: { form: string; value: string }[];
  } | null;

  let phoneticsHtml = '';
  if (d?.found && d.phonetics?.length) {
    phoneticsHtml = `<div class="phonetics">${d.phonetics.map((p) =>
      `<span class="ipa-group">${p.region ? `<span class="ipa-label">${escapeHtml(p.region)}</span>` : ''}<span class="ipa">${escapeHtml(p.ipa)}</span>${p.audioUrl ? `<button class="audio-btn" data-url="${p.audioUrl}" title="Play pronunciation" aria-label="Play pronunciation"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg></button>` : ''}</span>`
    ).join(' ')}</div>`;
  } else if (t?.transliteration) {
    phoneticsHtml = `<div class="phonetics"><span class="ipa transliteration">${escapeHtml(t.transliteration)}</span></div>`;
  }

  const isSameLang = t?.sourceLang && currentSettings?.targetLang
    && t.sourceLang.toLowerCase() === currentSettings.targetLang.toLowerCase();
  const sourceLabel = t?.sourceLang && t.sourceLang !== 'und' ? t.sourceLang.toUpperCase() : 'Source text';
  const targetLabel = currentSettings?.targetLang?.toUpperCase() || 'VI';
  const retryHtml = `<button class="retry-btn" type="button" aria-label="Retry lookup">Retry</button>`;
  const ttsBtn = t?.translated
    ? `<button class="tts-btn" data-text="${escapeHtml(text)}" data-lang="${t.sourceLang || 'en'}" title="Listen to original" aria-label="Listen to original text"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg></button>`
    : '';
  const copyBtn = t?.translated
    ? `<button class="copy-btn" data-text="${escapeHtml(t.translated)}" title="Copy translation" aria-label="Copy translation"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>`
    : '';

  const hasDictionaryContent = Boolean(d?.found && d.definitions?.length);
  const hasAnyContent = Boolean(
    t?.translated
    || hasDictionaryContent
    || t?.alternatives?.length
    || t?.definitions?.length
    || d?.phonetics?.length
  );
  const statusHtml = state.translationFailed && state.dictionaryFailed
    ? `<div class="error-text" role="status">Everything failed to load. Please check your connection and try again. ${retryHtml}</div>`
    : !hasAnyContent
      ? `<div class="meta-text" role="status">No results found for this selection.</div>`
      : state.longTextOnly
        ? `<div class="meta-text" role="status">Long text detected. Showing translation only for faster results.</div>`
        : '';

  let alternativesHtml = '';
  if (t?.alternatives?.length && isWord) {
    alternativesHtml = `
      <section class="section-block">
        <div class="section-heading">Other meanings</div>
        <div class="chip-list">${t.alternatives.map((a) => `<span class="chip">${escapeHtml(a)}</span>`).join('')}</div>
      </section>
    `;
  }

  const flattenedSenses = (d?.definitions || []).flatMap((def) =>
    (def.senses || []).map((sense) => ({
      pos: def.partOfSpeech || 'other',
      definition: sense.definition,
      examples: (sense.examples || []).map((ex) => ex.text).slice(0, 3),
      labels: sense.labels || [],
      register: sense.register,
      domain: sense.domain,
      cefr: (sense as { cefr?: string }).cefr,
    }))
  );

  const unifiedDefinitionsHtml = flattenedSenses.length ? `
    <section class="section-block">
      <div class="section-heading">Definitions</div>
      <div class="definition-list">
        ${flattenedSenses.map((sense, index) => {
    const labels = [
      sense.cefr,
      sense.register,
      sense.domain,
      ...sense.labels,
    ].filter(Boolean) as string[];

    return `
            <div class="definition-item">
              <div class="definition-line"><span class="definition-index">${index + 1}.</span><span class="definition-text">${escapeHtml(sense.definition)}</span></div>
              <div class="definition-example">${escapeHtml(sense.pos)}</div>
              ${labels.length ? `<div class="chip-list">${labels.map((label) => `<span class="chip">${escapeHtml(label)}</span>`).join('')}</div>` : ''}
              ${sense.examples.length ? `<div class="example-list">${sense.examples.map((ex) => `<div class="definition-example">${escapeHtml(ex)}</div>`).join('')}</div>` : ''}
            </div>
          `;
  }).join('')}
      </div>
    </section>
  ` : '';

  const mergedSynonyms = uniqueItems([...(t?.synonyms || []), ...((d?.synonyms || []).map((s) => s.word))], 12);
  const mergedCollocations = uniqueItems([...(t?.collocations || []), ...((d?.collocations || []).map((c) => c.phrase))], 12);
  const mergedExamples = uniqueItems([
    ...(t?.examples || []),
    ...flattenedSenses.flatMap((sense) => sense.examples || []),
  ], 10);
  const grammarPatterns = uniqueItems(d?.grammar?.patterns || [], 8);
  const grammarNotes = uniqueItems([
    ...(d?.grammar?.notes || []),
    ...(t?.grammar ? [t.grammar] : []),
  ], 8);
  const grammarInflections = uniqueItems(d?.grammar?.inflections || [], 6);
  const technicalUsage = (d?.technicalUsage || []).slice(0, 8);

  const idioms = d?.idioms || [];
  const usageNotes = d?.usageNotes || [];
  const wordForms = d?.wordForms || [];

  const sectionItems = [
    {
      key: 'definitions',
      label: 'Definitions',
      tone: 'neutral',
      visible: Boolean(unifiedDefinitionsHtml),
      content: unifiedDefinitionsHtml,
    },
    {
      key: 'grammar',
      label: 'Grammar',
      tone: 'neutral',
      visible: grammarInflections.length > 0 || grammarPatterns.length > 0 || grammarNotes.length > 0,
      content: `
        ${grammarInflections.length ? `
          <section class="section-block">
            <div class="section-heading">Forms & inflections</div>
            <div class="chip-list">${grammarInflections.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div>
          </section>
        ` : ''}
        ${grammarPatterns.length ? `
          <section class="section-block">
            <div class="section-heading">Patterns</div>
            <div class="example-list">${grammarPatterns.map((item) => `<div class="definition-example">${escapeHtml(item)}</div>`).join('')}</div>
          </section>
        ` : ''}
        ${grammarNotes.length ? `
          <section class="section-block">
            <div class="section-heading">Usage notes</div>
            <div class="example-list">${grammarNotes.map((item) => `<div class="definition-example">${escapeHtml(item)}</div>`).join('')}</div>
          </section>
        ` : ''}
      `,
    },
    {
      key: 'collocations',
      label: 'Common phrases',
      tone: 'accent',
      visible: mergedCollocations.length > 0,
      content: `
        <section class="section-block">
          <div class="section-heading">Common phrases</div>
          <div class="chip-list">${mergedCollocations.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div>
        </section>
      `,
    },
    {
      key: 'synonyms',
      label: 'Synonyms',
      tone: 'neutral',
      visible: mergedSynonyms.length > 0,
      content: `
        <section class="section-block">
          <div class="section-heading">Synonyms</div>
          <div class="chip-list">${mergedSynonyms.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join('')}</div>
        </section>
      `,
    },
    {
      key: 'technical-usage',
      label: 'Technical usage',
      tone: 'neutral',
      visible: technicalUsage.length > 0,
      content: `
        <section class="section-block">
          <div class="section-heading">Domain-specific usage</div>
          <div class="definition-list">${technicalUsage.map((item, index) => `
            <div class="definition-item">
              <div class="definition-line"><span class="definition-index">${index + 1}.</span><span class="definition-text">${escapeHtml(item.term)} (${escapeHtml(item.domain)})${item.meaning ? ` — ${escapeHtml(item.meaning)}` : ''}</span></div>
              ${item.examples?.length ? `<div class="definition-example">${escapeHtml(item.examples[0])}</div>` : ''}
            </div>
          `).join('')}</div>
        </section>
      `,
    },
    {
      key: 'examples',
      label: 'Examples',
      tone: 'neutral',
      visible: mergedExamples.length > 0,
      content: `
        <section class="section-block">
          <div class="section-heading">Examples</div>
          <div class="example-list">${mergedExamples.map((ex) => `<div class="definition-example">${escapeHtml(ex)}</div>`).join('')}</div>
        </section>
      `,
    },
    {
      key: 'word-forms',
      label: 'Word forms',
      tone: 'neutral',
      visible: wordForms.length > 0,
      content: `
        <section class="section-block">
          <div class="section-heading">Word forms</div>
          <div class="chip-list">${wordForms.map((item) => `<span class="chip">${escapeHtml(item.form)}: ${escapeHtml(item.value)}</span>`).join('')}</div>
        </section>
      `,
    },
    {
      key: 'idioms',
      label: 'Idioms',
      tone: 'neutral',
      visible: idioms.length > 0,
      content: `
        <section class="section-block">
          <div class="section-heading">Idioms</div>
          <div class="definition-list">${idioms.map((item, index) => `
            <div class="definition-item">
              <div class="definition-line"><span class="definition-index">${index + 1}.</span><span class="definition-text">${escapeHtml(item.phrase)} — ${escapeHtml(item.definition)}</span></div>
              ${item.example ? `<div class="definition-example">${escapeHtml(item.example)}</div>` : ''}
            </div>
          `).join('')}</div>
        </section>
      `,
    },
    {
      key: 'usage-notes',
      label: 'Usage notes',
      tone: 'neutral',
      visible: usageNotes.length > 0,
      content: `
        <section class="section-block">
          <div class="section-heading">Usage notes</div>
          <div class="definition-list">${usageNotes.map((item, index) => `
            <div class="definition-item">
              <div class="definition-line"><span class="definition-index">${index + 1}.</span><span class="definition-text">${escapeHtml(item.title)}</span></div>
              <div class="definition-example">${escapeHtml(item.text)}</div>
            </div>
          `).join('')}</div>
        </section>
      `,
    },
  ].filter((section) => section.visible);

  const detailSectionsHtml = sectionItems.map((section) => `
    <section class="detail-group" data-section="${section.key}">
      ${section.content}
    </section>
  `).join('');

  let metaHtml = '';
  if (!isWord && !isPhrase) {
    const wc = text.split(/\s+/).length;
    const sc = text.split(/[.!?]+/).filter(Boolean).length;
    metaHtml = `<div class="meta-text">${wc} words · ${sc} sentence${sc > 1 ? 's' : ''}</div>`;
  }

  const displayText = text.length > 60 ? text.substring(0, 57) + '...' : text;
  const titleAttr = text.length > 60 ? ` title="${escapeHtml(text.substring(0, 200))}"` : '';
  const translationDisplayHtml = isSameLang && t?.translated
    ? `<div class="meta-text">Already in your target language</div>`
    : t?.translated
      ? `
        <div class="translation-row">
          <div class="translated-text">${escapeHtml(t.translated)}</div>
          <div class="translation-actions">${ttsBtn}${copyBtn}</div>
        </div>
        <div class="meta-text">${t.sourceLang && t.sourceLang !== 'und' ? `${sourceLabel} → ${targetLabel}` : ''}</div>
      `
      : `<div class="error-text">Translation failed. Check your internet connection.</div>`;

  shadowRoot.innerHTML = `
    <style>${getStyles()}</style>
    <div class="popup-container">
      <div class="popup-header">
        <div class="popup-header-copy">
          <div class="popup-title-row">
            <span class="popup-word"${titleAttr}>${escapeHtml(displayText)}</span>
            <button class="popup-close" title="Close" aria-label="Close"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          ${phoneticsHtml}
        </div>
      </div>
      <div class="popup-body">
        ${metaHtml}
        <section class="section-block translation-block">
          ${translationDisplayHtml}
        </section>
        ${statusHtml}
        ${alternativesHtml}
        <div class="detail-stack">
          ${detailSectionsHtml}
        </div>
      </div>
    </div>
  `;

  const disposers: Array<() => void> = [];
  const registerListener = <K extends keyof HTMLElementEventMap>(
    element: Element | Window | VisualViewport,
    type: K | 'scroll',
    listener: EventListenerOrEventListenerObject
  ) => {
    element.addEventListener(type, listener);
    disposers.push(() => element.removeEventListener(type, listener));
  };

  // Event listeners
  const closeButton = shadowRoot.querySelector('.popup-close');
  if (closeButton) {
    registerListener(closeButton, 'click', hidePopup);
  }
  shadowRoot.querySelectorAll('.audio-btn').forEach((btn) => {
    registerListener(btn, 'click', () => {
      const url = (btn as HTMLElement).dataset.url;
      if (url) new Audio(url).play();
    });
  });
  // TTS - browser speech synthesis for translation
  shadowRoot.querySelectorAll('.tts-btn').forEach((btn) => {
    registerListener(btn, 'click', () => {
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
    registerListener(btn, 'click', async () => {
      const copyText = (btn as HTMLElement).dataset.text;
      if (copyText) {
        await navigator.clipboard.writeText(copyText);
        (btn as HTMLElement).classList.add('copied');
        if (copyFeedbackTimeout) clearTimeout(copyFeedbackTimeout);
        copyFeedbackTimeout = setTimeout(() => (btn as HTMLElement).classList.remove('copied'), 1500);
      }
    });
  });
  // Expand/collapse sections
  shadowRoot.querySelectorAll('.expand-btn').forEach((btn) => {
    registerListener(btn, 'click', () => {
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

  shadowRoot.querySelectorAll('.retry-btn').forEach((btn) => {
    registerListener(btn, 'click', () => {
      renderLoading(text);
      fetchData(text);
    });
  });

  const handleViewportChange = () => repositionPopup();
  registerListener(window, 'resize', handleViewportChange);
  if (window.visualViewport) {
    registerListener(window.visualViewport, 'resize', handleViewportChange);
    registerListener(window.visualViewport, 'scroll', handleViewportChange);
  }

  activePopupCleanup = () => {
    disposers.forEach((dispose) => dispose());
  };

  focusFirstInteractiveElement();

  // Reposition now that content is rendered with actual dimensions
  requestAnimationFrame(repositionPopup);
}

function focusFirstInteractiveElement() {
  const focusable = getFocusableElements();
  focusable[0]?.focus({ preventScroll: true });
}

function getFocusableElements(): HTMLElement[] {
  if (!shadowRoot) return [];
  return Array.from(
    shadowRoot.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);
}

function trapFocus(event: KeyboardEvent) {
  if (!popupEl || popupEl.style.display === 'none') return;
  const focusable = getFocusableElements();
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = shadowRoot?.activeElement as HTMLElement | null;

  if (event.shiftKey && (active === first || !active)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}


async function sendMessage(message: MessageType): Promise<unknown> {
  return sendRuntimeMessage(message);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getStyles(): string {
  return `
    :host {
      --bg: #fafafa;
      --bg-alt: #f0f0f0;
      --text: #1a1a1a;
      --text-secondary: #666;
      --border: #ddd;
      --accent: #2563eb;
      --error: #dc2626;
      --radius: 6px;
      --font: system-ui, -apple-system, 'Segoe UI', sans-serif;
    }
    * {
      box-sizing: border-box;
      font-family: var(--font);
      line-height: 1.3;
    }
    .popup-container {
      width: 100%;
      max-width: 420px;
      max-height: min(560px, calc(100vh - 24px));
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-family: var(--font);
    }
    .popup-header {
      padding: 8px;
      border-bottom: 1px solid var(--border);
      background: var(--bg);
    }
    .popup-header-copy {
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    .popup-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      min-width: 0;
    }
    .popup-word {
      font-size: 16px;
      font-weight: 600;
      color: var(--text);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .popup-body {
      padding: 8px;
      overflow-y: auto;
      overscroll-behavior: contain;
      flex: 1;
      min-height: 0;
      display: grid;
      align-content: start;
      gap: 6px;
      background: var(--bg);
    }
    .loading-state {
      padding: 8px;
      font-size: 13px;
      color: var(--text);
      text-align: center;
      justify-content: center;
    }
    .popup-close,
    .tts-btn,
    .copy-btn,
    .audio-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 4px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg);
      color: var(--text-secondary);
      cursor: pointer;
      flex-shrink: 0;
    }
    .popup-close:hover,
    .tts-btn:hover,
    .copy-btn:hover,
    .audio-btn:hover,
    .expand-btn:hover,
    .retry-btn:hover {
      opacity: 0.7;
      background: var(--bg-alt);
    }
    .copy-btn.copied {
      color: var(--accent);
      border-color: var(--accent);
      background: var(--bg-alt);
    }
    .phonetics {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      min-width: 0;
    }
    .ipa-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .ipa-label {
      font-size: 11px;
      color: var(--text-secondary);
    }
    .ipa,
    .meta-text,
    .definition-example,
    .chip,
    .expand-btn,
    .retry-btn {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .ipa {
      padding: 2px 4px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-alt);
      font-style: italic;
    }
    .ipa.transliteration {
      font-style: normal;
    }
    .translation-block,
    .section-block {
      padding: 4px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-alt);
      display: grid;
      gap: 6px;
    }
    .translation-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .translated-text {
      flex: 1;
      min-width: 0;
      font-size: 18px;
      font-weight: 500;
      color: var(--text);
      word-break: break-word;
    }
    .translation-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .section-heading {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .detail-stack,
    .detail-group,
    .definition-list,
    .example-list {
      display: grid;
      gap: 6px;
    }
    .definition-item {
      display: grid;
      gap: 4px;
      padding: 2px 4px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg);
    }
    .definition-line {
      display: flex;
      gap: 4px;
      align-items: flex-start;
    }
    .definition-index,
    .definition-text {
      font-size: 13px;
      color: var(--text);
    }
    .definition-index {
      flex-shrink: 0;
    }
    .chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 4px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-alt);
    }
    .error-text {
      font-size: 12px;
      color: var(--error);
    }
    .expand-btn,
    .retry-btn {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg);
      padding: 2px 4px;
      cursor: pointer;
      color: var(--accent);
      text-decoration: none;
      justify-self: start;
    }
    .popup-close:focus-visible,
    .tts-btn:focus-visible,
    .copy-btn:focus-visible,
    .audio-btn:focus-visible,
    .expand-btn:focus-visible,
    .retry-btn:focus-visible {
      outline: 1px solid var(--accent);
      outline-offset: 1px;
    }
    @media (max-width: 640px) {
      .translation-row {
        flex-direction: column;
      }
      .translation-actions {
        justify-content: flex-start;
      }
      .popup-word {
        white-space: normal;
      }
    }
    @media (prefers-color-scheme: dark) {
      :host(:not(.theme-light)) {
        --bg: #1e1e1e;
        --bg-alt: #2a2a2a;
        --text: #e0e0e0;
        --text-secondary: #999;
        --border: #444;
        --accent: #60a5fa;
        --error: #f87171;
      }
    }
  `;
}

function uniqueItems(items: string[], limit = 10): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

// Initialize
init();
