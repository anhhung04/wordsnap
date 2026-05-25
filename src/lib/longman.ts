import type {
    CefrLevel,
    Collocation,
    DefinitionLabel,
    DictionaryDefinition,
    DictionaryExample,
    DictionarySense,
    DictionarySourceId,
    FrequencyInfo,
    GrammarInfo,
    IdiomEntry,
    Phonetic,
    Register,
    RichDictionaryEntry,
    SenseSynonym,
    TechnicalUsageItem,
    UsageNote,
    WordForm,
} from './types';
import { LRUCache } from './lru-cache';

const LONGMAN_BASE = 'https://www.ldoceonline.com/dictionary';
const SOURCE_ID: DictionarySourceId = 'longman';

const cache = new LRUCache<RichDictionaryEntry>(500);

export async function lookupWord(word: string): Promise<RichDictionaryEntry> {
    const normalized = word.toLowerCase().trim();
    const cached = cache.get(normalized);
    if (cached) {
        return cached;
    }

    const url = `${LONGMAN_BASE}/${encodeURIComponent(normalized)}`;

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

function notFound(word: string): RichDictionaryEntry {
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

function parseHtml(html: string, word: string): RichDictionaryEntry {
    const normalizedHtml = normalizeLongmanHtml(html);

    if (isLikelyNotFound(normalizedHtml)) {
        return notFound(word);
    }

    const phonetics = extractPhonetics(normalizedHtml);
    const headword = extractHeadword(normalizedHtml, word);
    const definitions = extractDefinitions(normalizedHtml);
    const collocations = extractCollocations(normalizedHtml);
    const synonyms = extractSynonyms(normalizedHtml);
    const grammar = extractGrammar(normalizedHtml, definitions);
    const wordForms = extractWordForms(normalizedHtml);
    const frequency = extractFrequency(normalizedHtml);
    const technicalUsage = extractTechnicalUsage(definitions, word);
    const idioms = extractIdioms(normalizedHtml);

    return {
        word: headword || word,
        phonetics,
        definitions,
        collocations,
        wordForms,
        idioms,
        synonyms,
        antonyms: [],
        usageNotes: extractUsageNotes(normalizedHtml),
        grammar,
        technicalUsage,
        frequency,
        found: definitions.some((definition) => definition.senses.length > 0),
        sources: [SOURCE_ID],
        mergedAt: Date.now(),
    };
}

function isLikelyNotFound(html: string): boolean {
    const lower = html.toLowerCase();
    return (
        !/class="[^"]*ldoceentry[^"]*"/i.test(html) ||
        /did you mean/i.test(lower) ||
        /class="[^"]*didyoumean[^"]*"/i.test(html)
    );
}

function extractHeadword(html: string, fallback: string): string {
    return (
        cleanText(extractFirstMatch(html, /<span[^>]*class="[^"]*hwd[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || '') ||
        cleanText(extractFirstMatch(html, /<div[^>]*class="[^"]*Headword[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || '') ||
        cleanText(extractFirstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || '') ||
        cleanText(extractFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)?.replace(/\s*-\s*Longman.*$/i, '') || '') ||
        fallback
    );
}

function extractPhonetics(html: string): Phonetic[] {
    const ipas = uniqueList([
        ...extractMany(html, /<span[^>]*class="[^"]*PronCodes[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 6).map(cleanText),
        ...extractMany(html, /<span[^>]*class="[^"]*PRON[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 6).map(cleanText),
        ...extractMany(html, /<span[^>]*class="[^"]*pron[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 8).map(cleanText),
    ], 4)
        .map((value) => (value.startsWith('/') ? value : `/${value}/`))
        .filter((value) => /\/[a-zˈˌəɪɛʊɔɑæθðŋʃʒɒʌɜɡ.\- ]+\//i.test(value));

    const audioUrlsRaw = uniqueList([
        ...extractMany(html, /data-src-mp3="([^"]+)"/gi, 6).map(decodeEntities),
        ...extractMany(html, /data-src-uk-mp3="([^"]+)"/gi, 2).map(decodeEntities),
        ...extractMany(html, /data-src-us-mp3="([^"]+)"/gi, 2).map(decodeEntities),
    ], 4);

    const audioUrls = audioUrlsRaw.map((url) => normalizeUrl(url));

    const results: Phonetic[] = [];
    if (ipas[0] || audioUrls[0]) {
        results.push({ ipa: ipas[0] || '/-/', audioUrl: audioUrls[0], region: 'UK' });
    }
    if (ipas[1] || audioUrls[1]) {
        results.push({ ipa: ipas[1] || ipas[0] || '/-/', audioUrl: audioUrls[1], region: 'US' });
    }

    return results.filter((item) => item.ipa !== '/-/' || Boolean(item.audioUrl));
}

function extractDefinitions(html: string): DictionaryDefinition[] {
    const grouped = new Map<string, DictionarySense[]>();
    const posBlocks = extractMany(html, /<span[^>]*class="[^"]*(?:POS|PartOfSpeech)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 20).map(cleanText);
    const senseBlocks = html.match(/<div[^>]*class="[^"]*Sense[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || [];

    let senseCounter = 0;
    let posIndex = 0;

    for (const block of senseBlocks) {
        const definition = cleanText(extractFirstMatch(block, /<span[^>]*class="[^"]*DEF[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
            || extractFirstMatch(block, /<div[^>]*class="[^"]*DEF[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
            || '');
        if (!definition) continue;

        const partOfSpeech = posBlocks[posIndex] || 'unknown';
        const examples = uniqueList([
            ...extractMany(block, /<span[^>]*class="[^"]*EXAMPLE[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 4).map(cleanText),
            ...extractMany(block, /<div[^>]*class="[^"]*EXAMPLE[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, 4).map(cleanText),
        ], 2).map<DictionaryExample>((text) => ({ text, source: SOURCE_ID }));

        const rawLabels = uniqueList([
            ...extractMany(block, /<span[^>]*class="[^"]*REGISTERLAB[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 3).map(cleanText),
            ...extractMany(block, /<span[^>]*class="[^"]*(?:GRAM|Collo)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 3).map(cleanText),
            ...extractMany(block, /<span[^>]*class="[^"]*([ABC][12]|C[12])[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 2).map(cleanText),
        ], 6);

        const labels = rawLabels.filter(isDefinitionLabel);
        const register = inferRegister(rawLabels);
        const domain = inferDomain(rawLabels, definition);
        const cefr = inferCefr(rawLabels);

        senseCounter += 1;
        const senses = grouped.get(partOfSpeech) || [];
        const sense: DictionarySense = {
            id: `${SOURCE_ID}:${partOfSpeech}:${senseCounter}`,
            definition,
            examples,
            labels,
            register,
            domain,
            synonyms: [],
            antonyms: [],
            source: SOURCE_ID,
        };
        (sense as DictionarySense & { cefr?: CefrLevel }).cefr = cefr;
        senses.push(sense);

        grouped.set(partOfSpeech, senses);
        if (senses.length >= 10) {
            posIndex += 1;
            continue;
        }
    }

    return Array.from(grouped.entries()).map(([partOfSpeech, senses]) => ({
        partOfSpeech,
        senses,
        sources: [SOURCE_ID],
    }));
}

function extractCollocations(html: string): Collocation[] {
    const blocks = html.match(/<div[^>]*class="[^"]*(?:Collo|Collocate)[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || [];
    const items: Collocation[] = [];

    for (const block of blocks.slice(0, 16)) {
        const phrase = cleanText(
            extractFirstMatch(block, /<span[^>]*class="[^"]*(?:Collo|Collocate)[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
            || extractFirstMatch(block, /<a\b[^>]*>([\s\S]*?)<\/a>/i)
            || ''
        );
        if (!phrase) continue;

        const example = cleanText(extractFirstMatch(block, /<span[^>]*class="[^"]*EXAMPLE[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || '');
        items.push({ phrase, example: example || undefined, source: SOURCE_ID });
    }

    const deduped = uniqueList(items.map((item) => `${item.phrase}|||${item.example || ''}`), 12);
    return deduped.map((packed) => {
        const [phrase, example] = packed.split('|||');
        return { phrase, example: example || undefined, source: SOURCE_ID };
    });
}

function extractSynonyms(html: string): SenseSynonym[] {
    const synonyms = uniqueList([
        ...extractMany(html, /<span[^>]*class="[^"]*(?:Thesref|Synonym)[^"]*"[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/span>/gi, 20).map(cleanText),
        ...extractMany(html, /<a\b[^>]*class="[^"]*(?:Thesref|Synonym)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, 20).map(cleanText),
    ], 20);

    return synonyms.map((word) => ({ word }));
}

function extractGrammar(html: string, definitions: DictionaryDefinition[]): GrammarInfo {
    const notes = uniqueList([
        ...extractMany(html, /<span[^>]*class="[^"]*(?:Gram|Grammar)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 20).map(cleanText),
        ...extractMany(html, /<div[^>]*class="[^"]*(?:Gram|Grammar)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, 12).map(cleanText),
    ].filter(isUsefulGrammarText), 12);

    const patterns = uniqueList([
        ...notes.filter((text) => /\b(?:countable|uncountable|transitive|intransitive|usually|followed by|verb pattern|plural)\b/i.test(text)),
        ...definitions.flatMap((definition) =>
            definition.senses
                .map((sense) => `${definition.partOfSpeech} — ${sense.definition}`)
                .filter((line) => /\b(?:used|followed by|plural|past|participle|infinitive)\b/i.test(line))
        ),
    ].filter(isUsefulGrammarText), 10);

    const inflections = uniqueList([
        ...extractMany(html, /<div[^>]*class="[^"]*(?:Inflections|WORD-FORMS)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, 8).map(cleanText),
        ...extractMany(html, /<span[^>]*class="[^"]*(?:Inflections|WORD-FORMS)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 10).map(cleanText),
    ].filter(isUsefulGrammarText), 8);

    return { patterns, notes, inflections };
}

function extractWordForms(html: string): WordForm[] {
    const section = extractFirstMatch(html, /<div[^>]*class="[^"]*(?:Inflections|WORD-FORMS)[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || '';
    const entries = uniqueList([
        ...extractMany(section, /<span[^>]*class="[^"]*label[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 10).map(cleanText),
        ...extractMany(section, /<span[^>]*class="[^"]*value[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, 10).map(cleanText),
        ...extractMany(section, /<b[^>]*>([\s\S]*?)<\/b>/gi, 10).map(cleanText),
    ], 12);

    const forms: WordForm[] = [];
    for (let i = 0; i < entries.length; i += 2) {
        const form = entries[i];
        const value = entries[i + 1];
        if (!form || !value) continue;
        forms.push({ form, value });
    }

    return forms;
}

function extractFrequency(html: string): FrequencyInfo {
    const circles = (html.match(/(?:class="[^"]*level[123][^"]*"|●)/gi) || []).length;
    const s1w1 = /\bS1\b|\bW1\b/i.test(html);

    if (circles >= 3) return { rank: 1000, band: 'Top 1000', source: SOURCE_ID };
    if (circles === 2) return { rank: 2000, band: 'Top 2000', source: SOURCE_ID };
    if (circles === 1 || s1w1) return { rank: 3000, band: 'Top 3000', source: SOURCE_ID };
    return {};
}

function extractTechnicalUsage(definitions: DictionaryDefinition[], word: string): TechnicalUsageItem[] {
    const items = definitions.flatMap((definition) =>
        definition.senses
            .filter((sense) => Boolean(sense.domain) || sense.labels.some((label) => /regional|non-standard/i.test(label)))
            .map((sense) => ({
                term: word,
                domain: sense.domain || 'specialized',
                meaning: sense.definition,
                examples: sense.examples.slice(0, 2).map((example) => example.text),
            }))
    );

    return uniqueTechnicalUsage(items, 8);
}

function extractIdioms(html: string): IdiomEntry[] {
    const blocks = html.match(/<div[^>]*class="[^"]*(?:PhrV|Idiom)[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || [];
    const idioms: IdiomEntry[] = [];

    for (const block of blocks.slice(0, 12)) {
        const phrase = cleanText(
            extractFirstMatch(block, /<span[^>]*class="[^"]*(?:PhrV|Idiom)[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
            || extractFirstMatch(block, /<h\d[^>]*>([\s\S]*?)<\/h\d>/i)
            || ''
        );
        const definition = cleanText(
            extractFirstMatch(block, /<span[^>]*class="[^"]*DEF[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
            || extractFirstMatch(block, /<div[^>]*class="[^"]*DEF[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
            || ''
        );

        if (!phrase || !definition) continue;
        const example = cleanText(extractFirstMatch(block, /<span[^>]*class="[^"]*EXAMPLE[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || '');
        idioms.push({ phrase, definition, example: example || undefined, source: SOURCE_ID });
    }

    return idioms;
}

function extractUsageNotes(html: string): UsageNote[] {
    const notes = uniqueList([
        ...extractMany(html, /<div[^>]*class="[^"]*(?:Usage|F2NBox)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, 8).map(cleanText),
    ].filter(isUsefulGrammarText), 6);

    return notes.map((text) => ({ title: 'Usage', text, source: SOURCE_ID }));
}

function inferDomain(labels: string[], definition: string): string | undefined {
    const domainKeywords = ['business', 'law', 'medical', 'medicine', 'technology', 'computing', 'engineering', 'science', 'finance', 'economics', 'grammar', 'linguistics'];
    const haystack = `${labels.join(' ')} ${definition}`.toLowerCase();
    return domainKeywords.find((keyword) => haystack.includes(keyword));
}

function inferRegister(labels: string[]): Register | undefined {
    const joined = labels.join(' ').toLowerCase();
    if (joined.includes('formal')) return 'formal';
    if (joined.includes('informal')) return 'informal';
    if (joined.includes('slang')) return 'slang';
    if (joined.includes('technical')) return 'technical';
    if (joined.includes('humorous')) return 'humorous';
    if (joined.includes('offensive')) return 'offensive';
    if (joined.includes('vulgar')) return 'vulgar';
    if (joined.includes('literary')) return 'literary';
    if (joined.includes('dialect')) return 'dialect';
    if (joined.includes('rare')) return 'rare';
    if (joined.includes('old-fashioned')) return 'old-fashioned';
    if (joined.includes('archaic')) return 'archaic';
    return undefined;
}

function inferCefr(labels: string[]): CefrLevel | undefined {
    const joined = labels.join(' ');
    const match = /(A1|A2|B1|B2|C1|C2)/i.exec(joined);
    if (!match) return undefined;
    return match[1].toUpperCase() as CefrLevel;
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

function extractFirstMatch(html: string, regex: RegExp): string | undefined {
    const match = regex.exec(html);
    return match?.[1];
}

function extractMany(html: string, regex: RegExp, limit = 8): string[] {
    const values: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null && values.length < limit) {
        if (match[1]) values.push(match[1]);
        if (match[2]) values.push(match[2]);
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

function normalizeUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `https://www.ldoceonline.com${url}`;
    return `https://www.ldoceonline.com/${url}`;
}

function uniqueList(items: string[], limit = 8): string[] {
    const normalizedSeen = new Set<string>();
    const results: string[] = [];

    for (const rawItem of items) {
        const item = sanitizeExtractedText(rawItem.trim());
        if (!item) continue;

        const normalized = item.toLowerCase();
        if (normalizedSeen.has(normalized)) continue;
        if (results.some((existing) => existing.toLowerCase().includes(normalized) || normalized.includes(existing.toLowerCase()))) continue;

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

function normalizeLongmanHtml(html: string): string {
    return html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<!--([\s\S]*?)-->/g, ' ')
        .replace(/<(?:form|input|picture|source|button)\b[^>]*>[\s\S]*?<\/(?:form|input|picture|source|button)>/gi, ' ')
        .replace(/<(?:form|input|picture|source|button)\b[^>]*\/?>/gi, ' ')
        .replace(/<(?:nav|footer|aside)\b[^>]*>[\s\S]*?<\/(?:nav|footer|aside)>/gi, ' ')
        .replace(/<div[^>]+(?:sidebar|share|social|cookie|advert|ad_slot|audio-player|player-controls|didyoumean)[^>]*>[\s\S]*?<\/div>/gi, ' ');
}

function sanitizeExtractedText(value: string): string {
    const sanitized = value
        .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
        .replace(/[►•●▪]/g, ' ')
        .replace(/\b\d{6,}\b/g, ' ')
        .replace(/\b(?:play|pause|volume|audio|speaker|download mp3|more|less)\b/gi, ' ')
        .replace(/\b(?:did you mean|add to word list|save to list)\b/gi, ' ')
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
    if (/(?:^|\b)(?:ad|advert|cookie|script|javascript|html5|mp3|dataset|widget|popup|share|facebook|twitter|instagram|player)(?:\b|$)/i.test(value)) return false;
    if (/^(?:did you mean|play|pause|more|less)$/i.test(value)) return false;
    return true;
}

export function clearDictionaryCache(): void {
    cache.clear();
}
