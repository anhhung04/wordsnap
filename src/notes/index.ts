import type { VocabNote } from '@/lib/types';

const searchInput = document.getElementById('searchInput') as HTMLInputElement;
const notesList = document.getElementById('notesList') as HTMLElement;
const countEl = document.getElementById('count') as HTMLElement;
const exportJsonBtn = document.getElementById('exportJson') as HTMLButtonElement;
const exportCsvBtn = document.getElementById('exportCsv') as HTMLButtonElement;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// Load notes
async function loadNotes(query?: string) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_NOTES', query });
    if (response?.success) {
      renderNotes(response.data as VocabNote[]);
    } else {
      showError(response?.error || 'Failed to load notes');
    }
  } catch (e) {
    showError((e as Error).message);
  }
}

function showError(message: string) {
  notesList.innerHTML = `
    <div class="empty-state">
      <p style="color: var(--color-error, #dc2626)">Error: ${escapeHtml(message)}</p>
    </div>
  `;
}

function renderNotes(notes: VocabNote[]) {
  countEl.textContent = `${notes.length} word${notes.length !== 1 ? 's' : ''} saved`;

  if (notes.length === 0) {
    notesList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        <h2>No notes yet</h2>
        <p>Select text on any webpage to translate and save words.</p>
      </div>
    `;
    return;
  }

  notesList.innerHTML = notes.map((note) => `
    <div class="note-card" data-id="${note.id}">
      <div class="note-header">
        <span class="note-word">${escapeHtml(note.word)}</span>
        <button class="btn-delete" data-id="${note.id}" title="Delete" aria-label="Delete note">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
      <div class="note-translation">${escapeHtml(note.translation)}</div>
      ${note.context ? `<div class="note-context">${escapeHtml(note.context.substring(0, 150))}${note.context.length > 150 ? '...' : ''}</div>` : ''}
      <div class="note-meta">
        <span class="note-source">
          ${note.sourceTitle ? `<a href="${escapeHtml(note.sourceUrl)}" target="_blank">${escapeHtml(note.sourceTitle.substring(0, 40))}</a>` : ''}
        </span>
        <span>${formatDate(note.createdAt)}</span>
      </div>
      ${note.tags.length ? `<div class="note-tags">${note.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </div>
  `).join('');
}

// Event delegation for delete buttons (single listener on parent)
notesList.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest('.btn-delete') as HTMLElement | null;
  if (!btn) return;

  const id = Number(btn.dataset.id);
  if (!id) return;

  // Confirm before delete
  const card = btn.closest('.note-card') as HTMLElement;
  card.style.opacity = '0.5';

  try {
    await chrome.runtime.sendMessage({ type: 'DELETE_NOTE', id });
    card.remove();
    // Update count
    const remaining = notesList.querySelectorAll('.note-card').length;
    countEl.textContent = `${remaining} word${remaining !== 1 ? 's' : ''} saved`;
    if (remaining === 0) loadNotes();
  } catch {
    card.style.opacity = '1';
  }
});

// Search with debounce
searchInput.addEventListener('input', () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    loadNotes(searchInput.value.trim() || undefined);
  }, 300);
});

// Export
exportJsonBtn.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'GET_NOTES' });
  if (response?.success) {
    downloadFile(JSON.stringify(response.data, null, 2), 'wordsnap-notes.json', 'application/json');
  }
});

exportCsvBtn.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'GET_NOTES' });
  if (response?.success) {
    const notes = response.data as VocabNote[];
    const headers = 'word,translation,context,sourceUrl,tags,createdAt\n';
    const rows = notes.map((n) =>
      `"${csvEscape(n.word)}","${csvEscape(n.translation)}","${csvEscape(n.context)}","${csvEscape(n.sourceUrl)}","${csvEscape(n.tags.join(';'))}","${new Date(n.createdAt).toISOString()}"`
    ).join('\n');
    downloadFile(headers + rows, 'wordsnap-notes.csv', 'text/csv');
  }
});

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function csvEscape(str: string): string {
  return str.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '');
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Initial load
loadNotes();
