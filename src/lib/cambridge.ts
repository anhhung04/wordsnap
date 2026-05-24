import type { DictionaryDefinition, DictionaryEntry, GrammarInfo, TechnicalUsageItem } from './types';
import { LRUCache } from './lru-cache';

const CAMBRIDGE_BASE = 'https://dictionary.cambridge.org/dictionary/english';

// Bounded cache (max 500 entries - dictionary results are small)
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
    examples: [],
    synonyms: [],
    collocations: [],
    grammar: { patterns: [], notes: [], inflections: [] },
    technicalUsage: [],
    found: false,
  };
}

function parseHtml(html: string, word: string): DictionaryEntry {
  // Parse using DOMParser (available in service worker via offscreen or content script)
  // In service worker context, we use regex-based parsing
  const phonetics = extractPhonetics(html);
  const definitions = extractDefinitions(html);
  const examples = uniqueList(definitions.flatMap((definition) => definition.examples), 8);
  const synonyms = extractKeywordSectionItems(html, ['synonym'], 10);
  const collocations = extractKeywordSectionItems(html, ['collocation', 'common learner error'], 10);
  const grammar = extractGrammar(html, word, definitions);
  const technicalUsage = extractTechnicalUsage(html, definitions, word);

  return {
    word,
    phonetics,
    definitions,
    examples,
    synonyms,
    collocations,
    grammar,
    technicalUsage,
    found: definitions.length > 0,
  };
}

function extractPhonetics(html: string): DictionaryEntry['phonetics'] {
  const results: DictionaryEntry['phonetics'] = [];

  // Match IPA patterns from Cambridge's HTML structure
  const ipaRegex = /<span class="ipa dipa lpr-2 lpl-1">([^<]+)<\/span>/g;
  const audioRegex = /data-src-mp3="([^"]+)"/g;

  let match;
  const ipas: string[] = [];
  const audios: string[] = [];

  while ((match = ipaRegex.exec(html)) !== null) {
    ipas.push(match[1]);
  }
  while ((match = audioRegex.exec(html)) !== null) {
    audios.push(match[1]);
  }

  // Typically: first = UK, second = US
  for (let i = 0; i < Math.max(ipas.length, 1); i++) {
    if (ipas[i]) {
      results.push({
        ipa: `/${ipas[i]}/`,
        audioUrl: audios[i] ? `https://dictionary.cambridge.org${audios[i]}` : undefined,
        region: i === 0 ? 'UK' : i === 1 ? 'US' : undefined,
      });
    }
    if (results.length >= 2) break; // UK + US is enough
  }

  return results;
}

function extractDefinitions(html: string): DictionaryEntry['definitions'] {
  const results: DictionaryEntry['definitions'] = [];
  const entryBlockRegex = /<div class="pr entry-body__el[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
  const entryBlocks = html.match(entryBlockRegex) || [];

  for (const block of entryBlocks) {
    const partOfSpeech = extractFirstMatch(block, /<span class="pos dpos"[^>]*>([^<]+)<\/span>/i) || 'unknown';
    const defBlockRegex = /<div class="def-block ddef_block[\s\S]*?<\/div>\s*<\/div>/g;
    const defBlocks = block.match(defBlockRegex) || [];

    for (const defBlock of defBlocks) {
      const meaning = cleanText(extractFirstMatch(defBlock, /<div class="def ddef_d db">([\s\S]*?)<\/div>/i) || '');
      if (!meaning) continue;

      const examples = extractMany(defBlock, /<span class="eg deg">([\s\S]*?)<\/span>/g, 2).map(cleanText);
      const labels = uniqueList([
        ...extractMany(defBlock, /<span class="lab dlab">([\s\S]*?)<\/span>/g, 4).map(cleanText),
        ...extractMany(defBlock, /<span class="gram dgram">([\s\S]*?)<\/span>/g, 2).map(cleanText),
      ], 5);
      const domain = inferDomain(labels, meaning);

      results.push({
        partOfSpeech: cleanText(partOfSpeech),
        meaning,
        examples,
        labels: labels.length ? labels : undefined,
        domain,
      });

      if (results.length >= 8) {
        return results;
      }
    }
  }

  return results;
}

function extractKeywordSectionItems(html: string, keywords: string[], limit = 8): string[] {
  const lowerHtml = html.toLowerCase();
  const items: string[] = [];

  for (const keyword of keywords) {
    const keywordIndex = lowerHtml.indexOf(keyword.toLowerCase());
    if (keywordIndex === -1) continue;

    const windowStart = Math.max(0, keywordIndex - 600);
    const windowEnd = Math.min(html.length, keywordIndex + 3000);
    const sectionHtml = html.slice(windowStart, windowEnd);
    const linkRegex = />\s*([^<>]{2,80}?)\s*<\/a>/g;

    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(sectionHtml)) !== null) {
      const cleaned = decodeEntities(match[1]).replace(/\s+/g, ' ').trim();
      const normalized = cleaned.toLowerCase();
      if (!cleaned) continue;
      if (normalized === keyword || normalized.includes('translation of') || normalized.includes('add to word list')) continue;
      if (/^[a-z][a-z\s+\-/()]{1,60}$/i.test(cleaned)) {
        items.push(cleaned);
      }
    }
  }

  return uniqueList(items, limit);
}

function extractGrammar(html: string, word: string, definitions: DictionaryDefinition[]): GrammarInfo {
  const notes = uniqueList([
    ...extractMany(html, /<span class="gram dgram">([\s\S]*?)<\/span>/g, 8).map(cleanText),
    ...extractMany(html, /<span class="usage dusage">([\s\S]*?)<\/span>/g, 6).map(cleanText),
  ], 8);

  const patterns = uniqueList([
    ...extractMany(html, /<span class="dxref hax dxref-w lmt-25">([\s\S]*?)<\/span>/g, 8).map(cleanText),
    ...definitions
      .filter((definition) => /\b(usually|used|followed by|plural|uncountable|countable|past|present participle)\b/i.test(`${definition.meaning} ${(definition.labels || []).join(' ')}`))
      .map((definition) => [definition.partOfSpeech, definition.labels?.join(', '), definition.meaning].filter(Boolean).join(' — ')),
  ], 8);

  const inflections = uniqueList([
    ...extractMany(html, /<span class="inf-group[^"]*">([\s\S]*?)<\/span>/g, 6).map(cleanText),
    ...extractMany(html, /<span class="irreg-infls dinfls">([\s\S]*?)<\/span>/g, 4).map(cleanText),
    ...extractMany(html, /<span class="lab dlab">([\s\S]*?(?:plural|past tense|past participle|present participle)[\s\S]*?)<\/span>/g, 6).map(cleanText),
  ], 6);

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
    .filter((definition) => Boolean(definition.domain) || (definition.labels || []).some((label) => isTechnicalLabel(label)))
    .map((definition) => ({
      term: word,
      domain: definition.domain || inferDomain(definition.labels || [], definition.meaning) || 'specialized',
      meaning: definition.meaning,
      examples: definition.examples.slice(0, 2),
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

function inferDomain(labels: string[], meaning: string): string | undefined {
  const domainKeywords = ['business', 'law', 'medical', 'medicine', 'technology', 'computing', 'engineering', 'science', 'finance', 'economics', 'grammar', 'linguistics'];
  const haystack = `${labels.join(' ')} ${meaning}`.toLowerCase();
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
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
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
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
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

export function clearDictionaryCache(): void {
  cache.clear();
}
