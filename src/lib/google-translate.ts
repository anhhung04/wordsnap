import type { TranslationResult } from './types';
import { getSettings } from './storage';
import { LRUCache } from './lru-cache';

const GT_BASE = 'https://translate.google.com/translate_a/single';

// Bounded cache (max 300 entries)
const cache = new LRUCache<TranslationResult>(300);

export interface GoogleTranslateRaw {
  translated: string;
  alternatives: string[];
  definitions: { pos: string; meanings: string[] }[];
  examples: string[];
  synonyms: string[];
  detectedLang?: string;
}

function detectTextType(text: string): TranslationResult['type'] {
  const words = text.trim().split(/\s+/).length;
  if (words <= 2) return 'word';
  if (words <= 6) return 'phrase';
  if (words <= 30) return 'sentence';
  return 'paragraph';
}

export async function googleTranslate(text: string): Promise<TranslationResult> {
  const cacheKey = `gt:${text.toLowerCase().trim()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const settings = await getSettings();
  const targetLang = settings.targetLang;

  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'auto', // Auto-detect source language
    tl: targetLang,
    hl: 'en',
    dt: 'bd', // dictionary (definitions + alternatives)
    ie: 'UTF-8',
    oe: 'UTF-8',
    q: text,
  });

  // Multiple dt params for richer response
  const extraDt = ['ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 't', 'at'];
  const url = `${GT_BASE}?${params.toString()}&${extraDt.map((d) => `dt=${d}`).join('&')}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('Translation request timed out');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Google Translate error (${response.status})`);
  }

  const data = await response.json();
  const parsed = parseResponse(data, text, targetLang);

  cache.set(cacheKey, parsed);
  return parsed;
}

function parseResponse(data: unknown[], text: string, targetLang: string): TranslationResult {
  const raw = extractRaw(data);
  const type = detectTextType(text);

  return {
    original: text,
    translated: raw.translated,
    targetLang,
    sourceLang: raw.detectedLang,
    type,
    alternatives: raw.alternatives.length ? raw.alternatives : undefined,
    definitions: raw.definitions.length ? raw.definitions : undefined,
    examples: raw.examples.length ? raw.examples.slice(0, 4) : undefined,
    synonyms: raw.synonyms.length ? raw.synonyms : undefined,
    explanation: undefined, // Let the UI compose from structured data
  };
}

function extractRaw(data: unknown[]): GoogleTranslateRaw {
  const result: GoogleTranslateRaw = {
    translated: '',
    alternatives: [],
    definitions: [],
    examples: [],
    synonyms: [],
  };

  // data[0] = translation segments
  // Each segment: [translated, original, ...]
  if (Array.isArray(data[0])) {
    const segments = data[0] as unknown[][];
    result.translated = segments
      .filter((seg) => seg && seg[0])
      .map((seg) => seg[0] as string)
      .join('');
  }

  // data[2] = detected source language (e.g., "en")
  if (typeof data[2] === 'string') {
    result.detectedLang = data[2];
  }

  // data[1] = dictionary/alternatives grouped by part of speech
  // [[pos, [meaning1, meaning2, ...], ...], ...]
  if (Array.isArray(data[1])) {
    for (const entry of data[1] as unknown[][]) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const pos = entry[0] as string;
      const meanings = Array.isArray(entry[1])
        ? (entry[1] as string[]).slice(0, 5)
        : [];
      if (pos && meanings.length) {
        result.definitions.push({ pos, meanings });
      }
      // Alternatives are the top meanings
      result.alternatives.push(...meanings.slice(0, 2));
    }
    // Deduplicate alternatives
    result.alternatives = [...new Set(result.alternatives)].slice(0, 5);
  }

  // data[13] = example sentences (with <b>word</b> markup)
  if (Array.isArray(data[13])) {
    const examples = data[13] as unknown[][];
    if (Array.isArray(examples[0])) {
      for (const ex of examples[0] as unknown[][]) {
        if (ex && ex[0]) {
          // Strip HTML tags from examples
          const cleaned = (ex[0] as string).replace(/<[^>]+>/g, '');
          result.examples.push(cleaned);
        }
      }
    }
  }

  // data[11] = synonyms grouped by pos
  if (Array.isArray(data[11])) {
    for (const group of data[11] as unknown[][]) {
      if (Array.isArray(group) && Array.isArray(group[1])) {
        for (const synGroup of group[1] as unknown[][]) {
          if (Array.isArray(synGroup) && Array.isArray(synGroup[0])) {
            result.synonyms.push(...(synGroup[0] as string[]).slice(0, 3));
          }
        }
      }
    }
    result.synonyms = result.synonyms.slice(0, 5);
  }

  return result;
}

export function clearGoogleTranslateCache(): void {
  cache.clear();
}
