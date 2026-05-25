import type {
  Collocation,
  DefinitionLabel,
  DictionaryDefinition,
  DictionaryEntry,
  DictionaryExample,
  DictionarySense,
  GrammarInfo,
  RichDictionaryEntry,
  SenseSynonym,
  TechnicalUsageItem,
} from './types';
import { LRUCache } from './lru-cache';

const CAMBRIDGE_BASE = 'https://dictionary.cambridge.org/dictionary/english';
const SOURCE_ID = 'cambridge';

const cache = new LRUCache<DictionaryEntry>(500);

export async function lookupWord(word: string): Promise<DictionaryEntry> {
  const normalized = word.toLowerCase().trim();
  const cached = cache.get(normalized);
  if (cached) {
    return cached;
  }

  const url = `${CAMBRIDGE_BASE}/${encodeURIComponent(normalized)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return notFound(word);
    }

    const html = await response.text();
    const entry = parseHtml(html, word);
    cache.set(normalized, entry);
    return entry;
  } catch {
    return notFound(word);
  }
}

function notFound(word: string): DictionaryEntry {
  return {
    word,
    phonetics: [],
    definitions: [],
    collocations: [],
    wordForms: [],
    idioms: [],
    synonyms: [],
    antonyms: [],
    usageNotes: [],
    grammar: { patterns: [], notes: [], inflections: [] },
    technicalUsage: [],
    frequency: {},
    found: false,
    sources: [SOURCE_ID],
    mergedAt: Date.now(),
  };
}

function parseHtml(html: string, word: string): DictionaryEntry {
  const normalizedHtml = normalizeCambridgeHtml(html);
  const phonetics = extractPhonetics(normalizedHtml);
  const definitions = extractDefinitions(normalizedHtml);
  const synonyms = extractKeywordSectionItems(normalizedHtml, ['synonym', 'related words and phrases'], 10).map<SenseSynonym>((item) => ({
    word: item,
  }));
  const collocations = extractKeywordSectionItems(normalizedHtml, ['collocation', 'common learner error', 'related words and phrases'], 10).map<Collocation>((item) => ({
    phrase: item,
    source: SOURCE_ID,
  }));
  const grammar = extractGrammar(normalizedHtml, word, definitions);
  const technicalUsage = extractTechnicalUsage(normalizedHtml, definitions, word);

  return {
    word,
    phonetics,
    definitions,
    collocations,
    wordForms: [],
    idioms: [],
    synonyms,
    antonyms: [],
    usageNotes: [],
    grammar,
    technicalUsage,
    frequency: {},
    found: definitions.some((definition) => definition.senses.length > 0),
    sources: [SOURCE_ID],
    mergedAt: Date.now(),
  };
}

function extractPhonetics(html: string): RichDictionaryEntry['phonetics'] {
  const results: RichDictionaryEntry['phonetics'] = [];
  const ipaRegex = /<span class="ipa dipa lpr-2 lpl-1">([^<]+)<\/span>/g;
  const audioRegex = /data-src-mp3="([^"]+)"/g;

  let match: RegExpExecArray | null;
  const ipas: string[] = [];
  const audios: string[] = [];

  while ((match = ipaRegex.exec(html)) !== null) {
    ipas.push(match[1]);
  }
  while ((match = audioRegex.exec(html)) !== null) {
    audios.push(match[1]);
  }

  for (let i = 0; i < Math.min(ipas.length, 2); i++) {
    const ipa = cleanText(ipas[i]);
    if (!ipa) continue;
    results.push({
      ipa: `/${ipa}/`,
      audioUrl: audios[i] ? `https://dictionary.cambridge.org${audios[i]}` : undefined,
      region: i === 0 ? 'UK' : 'US',
    });
  }

  return results;
}

function extractDefinitions(html: string): DictionaryDefinition[] {
  const grouped = new Map<string, DictionarySense[]>();
  const entryBlockRegex = /<div class="pr entry-body__el[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
  const entryBlocks = html.match(entryBlockRegex) || [];
  let senseCounter = 0;

  for (const block of entryBlocks) {
    const partOfSpeech = cleanText(extractFirstMatch(block, /<span class="pos dpos"[^>]*>([^<]+)<\/span>/i) || '') || 'unknown';
    const defBlockRegex = /<div class="def-block ddef_block[\s\S]*?<\/div>\s*<\/div>/g;
    const defBlocks = block.match(defBlockRegex) || [];
    const senses = grouped.get(partOfSpeech) || [];

    for (const defBlock of defBlocks) {
      const definition = cleanText(extractFirstMatch(defBlock, /<div class="def ddef_d db">([\s\S]*?)<\/div>/i) || '');
      if (!definition) continue;

      const examples = extractMany(defBlock, /<span class="eg deg">([\s\S]*?)<\/span>/g, 2)
        .map(cleanText)
        .filter(Boolean)
        .map<DictionaryExample>((text) => ({ text, source: SOURCE_ID }));

      const labels = uniqueList([
        ...extractMany(defBlock, /<span class="lab dlab">([\s\S]*?)<\/span>/g, 4).map(cleanText),
        ...extractMany(defBlock, /<span class="gram dgram">([\s\S]*?)<\/span>/g, 2).map(cleanText),
      ], 5).filter(isDefinitionLabel);

      const domain = inferDomain(labels, definition);

      senseCounter += 1;
      senses.push({
        id: `${SOURCE_ID}:${partOfSpeech}:${senseCounter}`,
        definition,
        examples,
        labels,
        domain,
        synonyms: [],
        antonyms: [],
        source: SOURCE_ID,
      });

      if (senses.length >= 8) break;
    }

    if (senses.length > 0) {
      grouped.set(partOfSpeech, senses);
    }
  }

  return Array.from(grouped.entries()).map(([partOfSpeech, senses]) => ({
    partOfSpeech,
    senses,
    sources: [SOURCE_ID],
  }));
}

function extractKeywordSectionItems(html: string, keywords: string[], limit = 8): string[] {
  const lowerHtml = html.toLowerCase();
  const items: string[] = [];

  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase();
    const keywordIndex = lowerHtml.indexOf(keywordLower);
    if (keywordIndex === -1) continue;

    const windowStart = Math.max(0, keywordIndex - 600);
    const windowEnd = Math.min(html.length, keywordIndex + 5000);
    const sectionHtml = html.slice(windowStart, windowEnd);
    const anchorRegex = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

    let match: RegExpExecArray | null;
    while ((match = anchorRegex.exec(sectionHtml)) !== null) {
      const href = decodeEntities(match[1]).replace(/\s+/g, ' ').trim();
      const cleaned = cleanText(match[2]);
      const normalized = cleaned.toLowerCase();

      if (!cleaned) continue;
      if (normalized === keywordLower || normalized.includes('translation of') || normalized.includes('add to word list')) continue;
      if (!/dictionary\/english\//i.test(href) && !/topic=/i.test(href)) continue;
      if (/^[a-z][a-z\s+\-/()]{1,80}$/i.test(cleaned)) {
        items.push(cleaned);
      }
    }
  }

  return uniqueList(items, limit);
}

function extractGrammar(html: string, word: string, definitions: DictionaryDefinition[]): GrammarInfo {
  const grammarBlocks = [
    ...extractMany(html, /<div class="pr grammar[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g, 8),
    ...extractMany(html, /<div class="gramb[^>"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g, 8),
  ];

  const notes = uniqueList([
    ...grammarBlocks.flatMap((block) => [
      ...extractMany(block, /<span class="gram dgram">([\s\S]*?)<\/span>/g, 8),
      ...extractMany(block, /<span class="usage dusage">([\s\S]*?)<\/span>/g, 8),
      ...extractMany(block, /<div class="def ddef_d db">([\s\S]*?)<\/div>/g, 8),
      ...extractMany(block, /<div class="examp dexamp">([\s\S]*?)<\/div>/g, 4),
    ]).map(cleanText),
    ...extractMany(html, /<span class="usage dusage">([\s\S]*?)<\/span>/g, 4).map(cleanText),
  ].filter(isUsefulGrammarText), 8);

  const patterns = uniqueList([
    ...grammarBlocks.flatMap((block) => [
      ...extractMany(block, /<span class="dxref hax dxref-w lmt-25">([\s\S]*?)<\/span>/g, 8),
      ...extractMany(block, /<span class="x-h dx-h">([\s\S]*?)<\/span>/g, 8),
      ...extractMany(block, /<h3[^>]*>([\s\S]*?)<\/h3>/g, 4),
    ]).map(cleanText),
    ...definitions
      .flatMap((definition) => definition.senses.map((sense) => ({ partOfSpeech: definition.partOfSpeech, sense })))
      .filter(({ sense }) => /\b(usually|used|followed by|plural|uncountable|countable|past|present participle|infinitive|verb pattern)\b/i.test(`${sense.definition} ${sense.labels.join(' ')}`))
      .map(({ partOfSpeech, sense }) => [partOfSpeech, sense.labels.join(', '), sense.definition].filter(Boolean).join(' — ')),
  ].filter(isUsefulGrammarText), 8);

  const inflections = uniqueList([
    ...extractMany(html, /<span class="inf-group[^"]*">([\s\S]*?)<\/span>/g, 10).map(cleanText),
    ...extractMany(html, /<span class="irreg-infls dinfls">([\s\S]*?)<\/span>/g, 6).map(cleanText),
    ...extractMany(html, /<span class="lab dlab">([\s\S]*?(?:plural|past tense|past participle|present participle)[\s\S]*?)<\/span>/g, 8).map(cleanText),
  ].filter(isUsefulGrammarText), 6);

  if (!patterns.length && word.endsWith('ing')) {
    notes.push('Likely a present participle or gerund form.');
  }

  return {
    patterns,
    notes,
    inflections,
  };
}

function extractTechnicalUsage(html: string, definitions: DictionaryDefinition[], word: string): TechnicalUsageItem[] {
  const byDefinition = definitions
    .flatMap((definition) => definition.senses)
    .filter((sense) => Boolean(sense.domain) || sense.labels.some((label) => isTechnicalLabel(label)))
    .map((sense) => ({
      term: word,
      domain: sense.domain || inferDomain(sense.labels, sense.definition) || 'specialized',
      meaning: sense.definition,
      examples: sense.examples.slice(0, 2).map((example) => example.text),
    }));

  const keywordDomains = ['business', 'law', 'medical', 'technology', 'engineering', 'computing', 'science', 'finance'];
  const bySections = keywordDomains.flatMap((keyword) => {
    const keywordIndex = html.toLowerCase().indexOf(keyword);
    if (keywordIndex === -1) return [];
    const snippet = html.slice(Math.max(0, keywordIndex - 300), Math.min(html.length, keywordIndex + 1200));
    const phrases = extractMany(snippet, />\s*([^<>]{3,100}?)\s*<\/a>/g, 5)
      .map(cleanText)
      .filter((item) => /^[a-z][a-z\s+\-/()]{2,80}$/i.test(item));

    return phrases.map((phrase) => ({
      term: phrase,
      domain: keyword,
    }));
  });

  return uniqueTechnicalUsage([...byDefinition, ...bySections], 8);
}

function inferDomain(labels: string[], definition: string): string | undefined {
  const domainKeywords = ['business', 'law', 'medical', 'medicine', 'technology', 'computing', 'engineering', 'science', 'finance', 'economics', 'grammar', 'linguistics'];
  const haystack = `${labels.join(' ')} ${definition}`.toLowerCase();
  return domainKeywords.find((keyword) => haystack.includes(keyword));
}

function isTechnicalLabel(label: string): boolean {
  return /business|law|medical|medicine|technology|computing|engineering|science|finance|economics/i.test(label);
}

function extractFirstMatch(html: string, regex: RegExp): string | undefined {
  const match = regex.exec(html);
  return match?.[1];
}

function extractMany(html: string, regex: RegExp, limit = 8): string[] {
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null && values.length < limit) {
    if (match[1]) values.push(match[1]);
  }
  return values;
}

function cleanText(value: string): string {
  return sanitizeExtractedText(decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());
}

function decodeEntities(value: string): string {
  return value
    .replace(/&/g, '&')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/</g, '<')
    .replace(/>/g, '>');
}

function uniqueList(items: string[], limit = 8): string[] {
  const normalizedSeen = new Set<string>();
  const results: string[] = [];

  for (const rawItem of items) {
    const item = sanitizeExtractedText(rawItem.trim());
    if (!item) continue;

    const normalized = item.toLowerCase();
    if (normalizedSeen.has(normalized)) continue;
    if (results.some((existing) => existing.includes(item) || item.includes(existing))) continue;

    normalizedSeen.add(normalized);
    results.push(item);
    if (results.length >= limit) break;
  }

  return results;
}

function uniqueTechnicalUsage(items: TechnicalUsageItem[], limit = 8): TechnicalUsageItem[] {
  const seen = new Set<string>();
  const results: TechnicalUsageItem[] = [];

  for (const item of items) {
    const key = `${item.term.toLowerCase()}::${item.domain.toLowerCase()}::${(item.meaning || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
    if (results.length >= limit) break;
  }

  return results;
}

function normalizeCambridgeHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<(?:iframe|button|form|input|picture|source)\b[^>]*>[\s\S]*?<\/(?:iframe|button|form|input|picture|source)>/gi, ' ')
    .replace(/<(?:iframe|button|form|input|picture|source)\b[^>]*\/?>/gi, ' ')
    .replace(/<div[^>]+(?:ad_slot|advert|advertisement|cookie|popup|share|social|sidebar|wotd|didyouknow|dataset|spellcheck)[^>]*>[\s\S]*?<\/div>/gi, ' ')
    .replace(/<span[^>]+(?:spellpron|pron-info|audio_play_button|daud|circa|dataset|hax|share)[^>]*>[\s\S]*?<\/span>/gi, ' ');
}

function sanitizeExtractedText(value: string): string {
  const sanitized = value
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\b(?:Add to word list|Your browser doesn'?t support HTML5 audio|English pronunciation of .*|Click on the arrows to change the translation direction|More examplesFewer examples)\b/gi, ' ')
    .replace(/\b(?:See more results|Translation of .*|Translations of .*|Examples of .*|SMART Vocabulary: related words and phrases)\b/gi, ' ')
    .replace(/\b(?:script|advertisement|cookie policy|audio|mp3|src=|data-src|amp-img)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:|\-–—•·]+|[\s,;:|\-–—•·]+$/g, '')
    .trim();

  if (!isUsefulGrammarText(sanitized)) {
    return '';
  }

  return sanitized;
}

function isUsefulGrammarText(value: string): boolean {
  if (!value) return false;
  if (value.length < 2 || value.length > 180) return false;
  if (!/[a-z]/i.test(value)) return false;
  if (/^[^a-z]*$/i.test(value)) return false;
  if (/(?:^|\b)(?:ad|advert|cookie|script|javascript|html5|mp3|dataset|widget|popup|share|facebook|twitter|instagram)(?:\b|$)/i.test(value)) return false;
  if (/(?:^|\b)(?:us|uk)\s+pronunciation(?:\b|$)/i.test(value)) return false;
  if (/^(?:more examples|fewer examples|translations? of|examples? of|add to word list)$/i.test(value)) return false;
  if (/^[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(value) && !/[.?!]/.test(value)) return false;
  return true;
}

function isDefinitionLabel(value: string): value is DefinitionLabel {
  return [
    'British',
    'American',
    'Australian',
    'Canadian',
    'Indian',
    'Irish',
    'New Zealand',
    'Scottish',
    'South African',
    'regional',
    'non-standard',
    'approving',
    'disapproving',
    'figurative',
    'ironic',
    'polite',
    'emphatic',
  ].includes(value);
}

export function clearDictionaryCache(): void {
  cache.clear();
}
