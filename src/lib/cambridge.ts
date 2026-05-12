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
  return { word, phonetics: [], definitions: [], found: false };
}

function parseHtml(html: string, word: string): DictionaryEntry {
  // Parse using DOMParser (available in service worker via offscreen or content script)
  // In service worker context, we use regex-based parsing
  const phonetics = extractPhonetics(html);
  const definitions = extractDefinitions(html);

  return {
    word,
    phonetics,
    definitions,
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

export function clearDictionaryCache(): void {
  cache.clear();
}
