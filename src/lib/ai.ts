import type { TranslationResult } from './types';
import { getSettings } from './storage';
import { LRUCache } from './lru-cache';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.0-flash';

// Bounded cache (max 150 entries - AI results are larger)
const cache = new LRUCache<TranslationResult>(150);

function buildPrompt(text: string, targetLang: string): string {
  const wordCount = text.trim().split(/\s+/).length;

  if (wordCount <= 2) {
    return `You are an English learning assistant. Analyze the word/phrase "${text}" and translate to ${targetLang}.
Provide:
- Translation
- Brief explanation of usage, nuance, or common contexts
- 2 natural example sentences using this word
- Any important grammar notes (e.g. irregular forms, collocations)

Respond in this exact JSON format:
{
  "translated": "<translation in ${targetLang}>",
  "explanation": "<usage explanation>",
  "examples": ["<example 1>", "<example 2>"],
  "grammar": "<grammar note or empty string>"
}
Only respond with valid JSON, no markdown fences.`;
  }

  if (wordCount <= 10) {
    return `You are an English learning assistant. Analyze this English phrase/expression: "${text}"
Translate to ${targetLang} and explain.

Provide:
- Natural translation
- Explanation of meaning and when this phrase is used
- Whether it's an idiom, collocation, or literal expression
- 1-2 similar expressions if applicable

Respond in this exact JSON format:
{
  "translated": "<natural translation in ${targetLang}>",
  "explanation": "<meaning and usage explanation>",
  "examples": ["<similar expression or usage example>"],
  "grammar": "<is it an idiom/collocation/literal? any grammar pattern?>"
}
Only respond with valid JSON, no markdown fences.`;
  }

  // Sentence or paragraph
  return `You are an English learning assistant. Analyze this English text and translate to ${targetLang}:
"${text}"

Provide:
- Natural fluent translation (not word-by-word)
- Key vocabulary: list 2-4 important/difficult words with their meanings
- Grammar notes: explain any notable grammar structures used
- Brief summary of the main idea

Respond in this exact JSON format:
{
  "translated": "<fluent translation in ${targetLang}>",
  "explanation": "<main idea summary>",
  "examples": ["<word1>: <meaning>", "<word2>: <meaning>"],
  "grammar": "<notable grammar structures explained>"
}
Only respond with valid JSON, no markdown fences.`;
}

export async function translate(text: string): Promise<TranslationResult> {
  const cacheKey = text.toLowerCase().trim();
  const cached = cache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const settings = await getSettings();
  if (!settings.geminiApiKey) {
    throw new Error('Gemini API key not configured. Please set it in extension options.');
  }

  const prompt = buildPrompt(text, settings.targetLang);
  const url = `${GEMINI_API_BASE}/${MODEL}:generateContent?key=${settings.geminiApiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 512,
        },
      }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('AI request timed out. Try again later.');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limited. Please wait a moment and try again.');
    }
    if (response.status === 403 || response.status === 401) {
      throw new Error('Invalid or expired API key. Please check your Gemini API key in settings.');
    }
    throw new Error(`Gemini API error (${response.status})`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('No translation returned from Gemini');
  }

  let parsed: { translated: string; explanation?: string; examples?: string[]; grammar?: string };
  try {
    // Strip markdown code fences if present
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: use raw text as translation
    parsed = { translated: rawText.trim(), explanation: '', examples: [] };
  }

  const wordCount = text.trim().split(/\s+/).length;
  const type: TranslationResult['type'] = wordCount <= 2 ? 'word' : wordCount <= 6 ? 'phrase' : wordCount <= 30 ? 'sentence' : 'paragraph';

  const result: TranslationResult = {
    original: text,
    translated: parsed.translated,
    targetLang: settings.targetLang,
    type,
    explanation: [parsed.explanation, parsed.grammar].filter(Boolean).join(' | ') || undefined,
    examples: parsed.examples,
  };

  cache.set(cacheKey, result);
  return result;
}

export function clearTranslationCache(): void {
  cache.clear();
}
