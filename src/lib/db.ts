import Dexie, { type EntityTable } from 'dexie';
import type { VocabNote } from './types';

class WordSnapDatabase extends Dexie {
  notes!: EntityTable<VocabNote, 'id'>;

  constructor() {
    super('wordsnap');
    this.version(1).stores({
      notes: '++id, word, createdAt, *tags',
    });
  }
}

const db = new WordSnapDatabase();

export async function saveNote(
  note: Omit<VocabNote, 'id' | 'createdAt' | 'updatedAt'>
): Promise<number> {
  try {
    // Check for duplicate - update if same word already saved
    const existing = await db.notes.where('word').equalsIgnoreCase(note.word).first();
    if (existing) {
      const now = Date.now();
      await db.notes.update(existing.id!, {
        translation: note.translation,
        context: note.context,
        sourceUrl: note.sourceUrl,
        sourceTitle: note.sourceTitle,
        updatedAt: now,
      });
      return existing.id!;
    }

    const now = Date.now();
    const id = await db.notes.add({
      ...note,
      createdAt: now,
      updatedAt: now,
    } as VocabNote);
    return id as number;
  } catch (e) {
    throw new Error(`Failed to save note: ${(e as Error).message}`);
  }
}

export async function getNotes(query?: string): Promise<VocabNote[]> {
  try {
    if (!query) {
      return db.notes.orderBy('createdAt').reverse().toArray();
    }
    const lowerQuery = query.toLowerCase();
    return db.notes
      .filter(
        (note) =>
          note.word.toLowerCase().includes(lowerQuery) ||
          note.translation.toLowerCase().includes(lowerQuery) ||
          note.tags.some((t) => t.toLowerCase().includes(lowerQuery))
      )
      .toArray();
  } catch (e) {
    throw new Error(`Failed to load notes: ${(e as Error).message}`);
  }
}

export async function deleteNote(id: number): Promise<void> {
  try {
    await db.notes.delete(id);
  } catch (e) {
    throw new Error(`Failed to delete note: ${(e as Error).message}`);
  }
}

export async function exportNotes(format: 'json' | 'csv' = 'json'): Promise<string> {
  const notes = await db.notes.toArray();
  if (format === 'json') {
    return JSON.stringify(notes, null, 2);
  }
  // CSV
  const csvEscape = (s: string) => s.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '');
  const headers = 'word,translation,context,sourceUrl,tags,createdAt\n';
  const rows = notes
    .map(
      (n) =>
        `"${csvEscape(n.word)}","${csvEscape(n.translation)}","${csvEscape(n.context)}","${csvEscape(n.sourceUrl)}","${csvEscape(n.tags.join(';'))}","${new Date(n.createdAt).toISOString()}"`
    )
    .join('\n');
  return headers + rows;
}

export { db };
