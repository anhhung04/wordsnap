import type { DictionaryEntry } from './types';
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
  return { word, phonetics: [], definitions: [], examples: [], synonyms: [], collocations: [], found: false };
}

function parseHtml(html: string, word: string): DictionaryEntry {
  // Parse using DOMParser (available in service worker via offscreen or content script)
  // In service worker context, we use regex-based parsing
  const phonetics = extractPhonetics(html);
  const definitions = extractDefinitions(html);
  const examples = uniqueList(definitions.flatMap((definition) => definition.examples), 8);
  const synonyms = extractKeywordSectionItems(html, 'synonym', 10);
  const collocations = extractKeywordSectionItems(html, 'collocation', 10);

  return {
    word,
    phonetics,
    definitions,
    examples,
    synonyms,
    collocations,
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

  // Extract part of speech + definition blocks
  const posRegex = /<span class="pos dpos"[^>]*>([^<]+)<\/span>/g;
  const defRegex = /<div class="def ddef_d db">([\s\S]*?)<\/div>/g;
  const exRegex = /<span class="eg deg">([\s\S]*?)<\/span>/g;

  // Get all parts of speech
  const parts: string[] = [];
  let match;
  while ((match = posRegex.exec(html)) !== null) {
    parts.push(match[1].trim());
  }

  // Get all definitions
  const defs: string[] = [];
  while ((match = defRegex.exec(html)) !== null) {
    const cleaned = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    defs.push(cleaned);
  }

  // Get all examples
  const examples: string[] = [];
  while ((match = exRegex.exec(html)) !== null) {
    const cleaned = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    examples.push(cleaned);
  }

  // Pair them up (simplified: assign examples to definitions in order)
  const examplesPerDef = Math.max(1, Math.floor(examples.length / Math.max(defs.length, 1)));

  for (let i = 0; i < Math.min(defs.length, 5); i++) {
    results.push({
      partOfSpeech: parts[Math.min(i, parts.length - 1)] || 'unknown',
      meaning: defs[i],
      examples: examples.slice(i * examplesPerDef, (i + 1) * examplesPerDef).slice(0, 2),
    });
  }

  return results;
}

function extractKeywordSectionItems(html: string, keyword: string, limit = 8): string[] {
  const lowerHtml = html.toLowerCase();
  const keywordIndex = lowerHtml.indexOf(keyword);
  if (keywordIndex === -1) return [];

  const windowStart = Math.max(0, keywordIndex - 600);
  const windowEnd = Math.min(html.length, keywordIndex + 3000);
  const sectionHtml = html.slice(windowStart, windowEnd);
  const items: string[] = [];
  const linkRegex = />\s*([^<>]{2,80}?)\s*<\/a>/g;

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(sectionHtml)) !== null) {
    const cleaned = match[1].replace(/&/g, '&').replace(/'/g, "'").replace(/"/g, '"').replace(/\s+/g, ' ').trim();
    const normalized = cleaned.toLowerCase();
    if (!cleaned) continue;
    if (normalized === keyword || normalized.includes('translation of') || normalized.includes('add to word list')) continue;
    if (/^[a-z][a-z\s-]{1,60}$/i.test(cleaned)) {
      items.push(cleaned);
    }
  }

  return uniqueList(items, limit);
}

function uniqueList(items: string[], limit = 8): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

export function clearDictionaryCache(): void {
  cache.clear();
}
