import { googleTranslate } from '@/lib/google-translate';
import { lookupWord as lookupCambridge } from '@/lib/cambridge';
import { lookupWord as lookupLongman } from '@/lib/longman';
import { saveNote, getNotes, deleteNote } from '@/lib/db';
import {
  openOptionsPage,
  runtime,
  type RuntimeInstalledDetails,
  type RuntimeMessageSender,
} from '@/lib/extension-api';
import { getSettings, updateSettings } from '@/lib/storage';
import {
  SOURCE_PRIORITY,
  type DictionaryDefinition,
  type DictionarySense,
  type FrequencyInfo,
  type GrammarInfo,
  type MessageResponse,
  type MessageType,
  type RichDictionaryEntry,
} from '@/lib/types';

runtime.onMessage.addListener(
  (message: MessageType, _sender: RuntimeMessageSender, sendResponse: (response: MessageResponse) => void) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message || 'Unknown error' });
    });
    return true;
  }
);

async function handleMessage(message: MessageType): Promise<MessageResponse> {
  switch (message.type) {
    case 'TRANSLATE': {
      const result = await googleTranslate(message.text);
      return { success: true, data: result };
    }
    case 'LOOKUP_DICTIONARY': {
      const mergedEntry = await lookupAndMergeDictionaryEntry(message.word);
      return { success: true, data: mergedEntry };
    }
    case 'LOOKUP_DICTIONARY_MULTI': {
      const mergedEntry = await lookupAndMergeDictionaryEntry(message.word);
      return { success: true, data: mergedEntry };
    }
    case 'SAVE_NOTE': {
      const id = await saveNote(message.note);
      return { success: true, data: { id } };
    }
    case 'GET_NOTES': {
      const notes = await getNotes(message.query);
      return { success: true, data: notes };
    }
    case 'DELETE_NOTE': {
      await deleteNote(message.id);
      return { success: true, data: null };
    }
    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { success: true, data: settings };
    }
    case 'UPDATE_SETTINGS': {
      const updated = await updateSettings(message.settings);
      return { success: true, data: updated };
    }
    default:
      return { success: false, error: 'Unknown message type' };
  }
}

async function lookupAndMergeDictionaryEntry(word: string): Promise<RichDictionaryEntry> {
  const searchTerms = buildDictionarySearchTerms(word);
  const collectedEntries: RichDictionaryEntry[] = [];
  const seenEntryKeys = new Set<string>();

  for (const searchTerm of searchTerms) {
    const settled = await Promise.allSettled([
      lookupCambridge(searchTerm),
      lookupLongman(searchTerm),
    ]);

    const successfulEntries = settled
      .filter((result): result is PromiseFulfilledResult<RichDictionaryEntry> => result.status === 'fulfilled')
      .map((result) => result.value);

    for (const entry of successfulEntries) {
      const entryKey = `${entry.sources.join(',')}::${entry.word.toLowerCase()}::${entry.found}`;
      if (seenEntryKeys.has(entryKey)) continue;
      seenEntryKeys.add(entryKey);
      collectedEntries.push(entry);
    }

    if (successfulEntries.some((entry) => entry.found)) {
      break;
    }
  }

  return mergeDictionaryEntries(word, collectedEntries);
}

function buildDictionarySearchTerms(word: string): string[] {
  const normalized = word.trim().toLowerCase();
  const terms = new Set<string>();

  if (!normalized) {
    return [word];
  }

  terms.add(normalized);

  const singularCandidate = singularizePhrase(normalized);
  if (singularCandidate && singularCandidate !== normalized) {
    terms.add(singularCandidate);
  }

  return Array.from(terms);
}

function singularizePhrase(phrase: string): string | null {
  const tokens = phrase.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  let changed = false;
  const singularTokens = tokens.map((token) => {
    const singular = singularizeWordToken(token);
    if (singular !== token) {
      changed = true;
    }
    return singular;
  });

  return changed ? singularTokens.join(' ') : null;
}

function singularizeWordToken(token: string): string {
  const match = token.match(/^([^a-zA-Z]*)([a-zA-Z]+)([^a-zA-Z]*)$/);
  if (!match) return token;

  const [, leading, core, trailing] = match;
  const singularCore = singularizeEnglishWord(core);
  return singularCore === core ? token : `${leading}${singularCore}${trailing}`;
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

function mergeDictionaryEntries(word: string, entries: RichDictionaryEntry[]): RichDictionaryEntry {
  if (!entries.length) {
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
      sources: [],
      mergedAt: Date.now(),
    };
  }

  const base = entries[0];

  const phonetics = dedupeBy(entries.flatMap((entry) => entry.phonetics || []), (item) => item.ipa.toLowerCase());

  const definitions = mergeDefinitions(entries);

  const collocations = dedupeBy(
    entries.flatMap((entry) => entry.collocations || []),
    (item) => item.phrase.toLowerCase()
  );

  const synonyms = dedupeBy(
    entries.flatMap((entry) => entry.synonyms || []),
    (item) => item.word.toLowerCase()
  );

  const grammar = mergeGrammar(entries.map((entry) => entry.grammar).filter(Boolean) as GrammarInfo[]);

  const technicalUsage = dedupeBy(
    entries.flatMap((entry) => entry.technicalUsage || []),
    (item) => item.term.toLowerCase()
  );

  const idioms = dedupeBy(
    entries.flatMap((entry) => entry.idioms || []),
    (item) => item.phrase.toLowerCase()
  );

  const wordForms = dedupeBy(
    entries.flatMap((entry) => entry.wordForms || []),
    (item) => item.form.toLowerCase()
  );

  const usageNotes = dedupeBy(
    entries.flatMap((entry) => entry.usageNotes || []),
    (item) => `${item.title.toLowerCase()}::${item.text.toLowerCase()}`
  );

  const frequency = pickBestFrequency(entries.map((entry) => entry.frequency));

  return {
    ...base,
    word: base.word || word,
    phonetics,
    definitions,
    collocations,
    synonyms,
    grammar,
    technicalUsage,
    idioms,
    wordForms,
    usageNotes,
    frequency,
    found: entries.some((entry) => entry.found),
    sources: Array.from(new Set(entries.flatMap((entry) => entry.sources || []))),
    mergedAt: Date.now(),
  };
}

function mergeDefinitions(entries: RichDictionaryEntry[]): DictionaryDefinition[] {
  const allDefinitions = entries.flatMap((entry) => entry.definitions || []);
  const grouped = new Map<string, DictionaryDefinition>();

  for (const def of allDefinitions) {
    const posKey = normalizePos(def.partOfSpeech);
    const current = grouped.get(posKey);

    if (!current) {
      grouped.set(posKey, {
        partOfSpeech: def.partOfSpeech,
        senses: def.senses.map((sense) => ({ ...sense, examples: dedupeExamples(sense.examples || []) })),
        sources: [...new Set(def.sources || [])],
      });
      continue;
    }

    for (const incomingSense of def.senses) {
      const existingIndex = current.senses.findIndex((existingSense) =>
        areSimilarDefinitions(existingSense.definition, incomingSense.definition)
      );

      const normalizedIncoming = {
        ...incomingSense,
        examples: dedupeExamples(incomingSense.examples || []),
      };

      if (existingIndex === -1) {
        current.senses.push(normalizedIncoming);
      } else {
        const existingSense = current.senses[existingIndex];
        const winner = pickPreferredSense(existingSense, normalizedIncoming);
        const mergedExamples = dedupeExamples([...(existingSense.examples || []), ...(normalizedIncoming.examples || [])]);

        current.senses[existingIndex] = {
          ...winner,
          examples: mergedExamples,
          labels: Array.from(new Set([...(existingSense.labels || []), ...(normalizedIncoming.labels || [])])),
          synonyms: dedupeBy([...(existingSense.synonyms || []), ...(normalizedIncoming.synonyms || [])], (item) => item.word.toLowerCase()),
          antonyms: Array.from(new Set([...(existingSense.antonyms || []), ...(normalizedIncoming.antonyms || [])])),
        };
      }
    }

    current.sources = Array.from(new Set([...(current.sources || []), ...(def.sources || [])]));
  }

  const sorted = Array.from(grouped.values()).map((def) => ({
    ...def,
    senses: sortSenses(def.senses),
  }));

  return sortDefinitionsByPos(sorted);
}

function dedupeExamples<T extends { text: string }>(examples: T[]): T[] {
  return dedupeBy(examples, (example) => example.text.toLowerCase());
}

function pickPreferredSense(a: DictionarySense, b: DictionarySense): DictionarySense {
  const rankA = getSourceRank(a.source);
  const rankB = getSourceRank(b.source);
  return rankA <= rankB ? a : b;
}

function getSourceRank(source: string): number {
  const key = source as keyof typeof SOURCE_PRIORITY;
  return SOURCE_PRIORITY[key] ?? Number.MAX_SAFE_INTEGER;
}

function mergeGrammar(grammarEntries: GrammarInfo[]): GrammarInfo {
  return {
    patterns: Array.from(new Set(grammarEntries.flatMap((item) => item.patterns || []))),
    notes: Array.from(new Set(grammarEntries.flatMap((item) => item.notes || []))),
    inflections: Array.from(new Set(grammarEntries.flatMap((item) => item.inflections || []))),
  };
}

function pickBestFrequency(frequencies: FrequencyInfo[]): FrequencyInfo {
  const valid = frequencies.filter((item) => typeof item.rank === 'number');
  if (!valid.length) return frequencies.find(Boolean) || {};
  return valid.reduce((best, current) => (current.rank! < best.rank! ? current : best));
}

function normalizeDefinitionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,;:!?()[\]"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areSimilarDefinitions(a: string, b: string): boolean {
  const na = normalizeDefinitionText(a);
  const nb = normalizeDefinitionText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const wa = new Set(na.split(/\s+/).filter(Boolean));
  const wb = new Set(nb.split(/\s+/).filter(Boolean));
  const union = new Set([...wa, ...wb]);
  let overlap = 0;
  for (const token of wa) {
    if (wb.has(token)) overlap += 1;
  }
  const similarity = union.size ? overlap / union.size : 0;
  return similarity > 0.8;
}

function normalizePos(pos: string): string {
  return (pos || 'other').toLowerCase().trim();
}

function sortDefinitionsByPos(definitions: DictionaryDefinition[]): DictionaryDefinition[] {
  const order = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'interjection', 'determiner'];
  return [...definitions].sort((a, b) => {
    const ai = order.indexOf(normalizePos(a.partOfSpeech));
    const bi = order.indexOf(normalizePos(b.partOfSpeech));
    const av = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bv = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    return av - bv;
  });
}

function sortSenses(senses: DictionarySense[]): DictionarySense[] {
  const cefrOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const isSubsense = (sense: DictionarySense) => /subsense|subsense|sub-sense/i.test(sense.id);
  const senseCefrIndex = (sense: DictionarySense): number => {
    const cefr = sense.synonyms.find((item) => item.cefr)?.cefr;
    const index = cefr ? cefrOrder.indexOf(cefr) : -1;
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return [...senses].sort((a, b) => {
    const subCmp = Number(isSubsense(a)) - Number(isSubsense(b));
    if (subCmp !== 0) return subCmp;
    return senseCefrIndex(a) - senseCefrIndex(b);
  });
}

function dedupeBy<T>(items: T[], keySelector: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keySelector(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

runtime.onInstalled.addListener((details: RuntimeInstalledDetails) => {
  if (details.reason === 'install') {
    void openOptionsPage();
  }
});
