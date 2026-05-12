import type { VocabNote } from '@/lib/types';

const searchInput = document.getElementById('searchInput') as HTMLInputElement;
const notesList = document.getElementById('notesList') as HTMLElement;
const countEl = document.getElementById('count') as HTMLElement;
const exportJsonBtn = document.getElementById('exportJson') as HTMLButtonElement;
const exportCsvBtn = document.getElementById('exportCsv') as HTMLButtonElement;
const sortSelect = document.getElementById('sortSelect') as HTMLSelectElement;
const reviewBtn = document.getElementById('reviewBtn') as HTMLButtonElement;

// Review modal elements
const reviewOverlay = document.getElementById('reviewOverlay') as HTMLElement;
const reviewProgress = document.getElementById('reviewProgress') as HTMLElement;
const reviewClose = document.getElementById('reviewClose') as HTMLButtonElement;
const reviewWord = document.getElementById('reviewWord') as HTMLElement;
const reviewTranslation = document.getElementById('reviewTranslation') as HTMLElement;
const reviewContext = document.getElementById('reviewContext') as HTMLElement;
const reviewAnswer = document.getElementById('reviewAnswer') as HTMLElement;
const reviewActions = document.getElementById('reviewActions') as HTMLElement;
const reviewNav = document.getElementById('reviewNav') as HTMLElement;
const revealBtn = document.getElementById('revealBtn') as HTMLButtonElement;
const knowBtn = document.getElementById('knowBtn') as HTMLButtonElement;
const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let allNotes: VocabNote[] = [];
let currentSort: string = 'newest';

// Flashcard state
let reviewNotes: VocabNote[] = [];
let reviewIndex = 0;
let knownCount = 0;

// Load notes
async function loadNotes(query?: string) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_NOTES', query });
    if (response?.success) {
      allNotes = response.data as VocabNote[];
      renderNotes(sortNotes(allNotes));
    } else {
      showError(response?.error || 'Failed to load notes');
    }
  } catch (e) {
    showError((e as Error).message);
  }
}

function sortNotes(notes: VocabNote[]): VocabNote[] {
  const sorted = [...notes];
  switch (currentSort) {
    case 'oldest':
      sorted.sort((a, b) => a.createdAt - b.createdAt);
      break;
    case 'az':
      sorted.sort((a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
      break;
    case 'za':
      sorted.sort((a, b) => b.word.toLowerCase().localeCompare(a.word.toLowerCase()));
      break;
    case 'newest':
    default:
      sorted.sort((a, b) => b.createdAt - a.createdAt);
      break;
  }
  return sorted;
}

function showError(message: string) {
  notesList.innerHTML = `
    <div class="empty-state">
      <p style="color: var(--color-error, #dc2626)">Error: ${escapeHtml(message)}</p>
    </div>
  `;
}

function renderNotes(notes: VocabNote[]) {
  // Stats
  const total = notes.length;
  const thisWeek = notes.filter((n) => n.createdAt > Date.now() - 7 * 24 * 60 * 60 * 1000).length;
  countEl.textContent = `${total} word${total !== 1 ? 's' : ''} saved${thisWeek > 0 ? ` - ${thisWeek} this week` : ''}`;

  reviewBtn.disabled = total === 0;

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

// Sorting
sortSelect.addEventListener('change', () => {
  currentSort = sortSelect.value;
  renderNotes(sortNotes(allNotes));
});

// Event delegation for delete buttons
notesList.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest('.btn-delete') as HTMLElement | null;
  if (!btn) return;

  const id = Number(btn.dataset.id);
  if (!id) return;

  const card = btn.closest('.note-card') as HTMLElement;
  card.style.opacity = '0.5';

  try {
    await chrome.runtime.sendMessage({ type: 'DELETE_NOTE', id });
    card.remove();
    allNotes = allNotes.filter((n) => n.id !== id);
    const remaining = allNotes.length;
    const thisWeek = allNotes.filter((n) => n.createdAt > Date.now() - 7 * 24 * 60 * 60 * 1000).length;
    countEl.textContent = `${remaining} word${remaining !== 1 ? 's' : ''} saved${thisWeek > 0 ? ` - ${thisWeek} this week` : ''}`;
    reviewBtn.disabled = remaining === 0;
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

// --- Flashcard Review ---
reviewBtn.addEventListener('click', startReview);
reviewClose.addEventListener('click', closeReview);
revealBtn.addEventListener('click', revealAnswer);
knowBtn.addEventListener('click', () => advanceReview(true));
nextBtn.addEventListener('click', () => advanceReview(false));

function startReview() {
  if (allNotes.length === 0) return;
  // Shuffle and take up to 20 cards
  reviewNotes = [...allNotes].sort(() => Math.random() - 0.5).slice(0, 20);
  reviewIndex = 0;
  knownCount = 0;
  reviewOverlay.style.display = 'flex';
  showReviewCard();
}

function closeReview() {
  reviewOverlay.style.display = 'none';
}

function showReviewCard() {
  const note = reviewNotes[reviewIndex];
  reviewProgress.textContent = `${reviewIndex + 1} / ${reviewNotes.length}`;
  reviewWord.textContent = note.word;
  reviewTranslation.textContent = note.translation;
  reviewContext.textContent = note.context ? `"${note.context.substring(0, 120)}"` : '';
  reviewAnswer.style.display = 'none';
  reviewActions.style.display = 'flex';
  reviewNav.style.display = 'none';
}

function revealAnswer() {
  reviewAnswer.style.display = 'block';
  reviewActions.style.display = 'none';
  reviewNav.style.display = 'flex';
}

function advanceReview(known: boolean) {
  if (known) knownCount++;
  reviewIndex++;

  if (reviewIndex >= reviewNotes.length) {
    // Show summary
    const pct = Math.round((knownCount / reviewNotes.length) * 100);
    reviewWord.textContent = `${pct}%`;
    reviewWord.style.fontSize = '48px';
    reviewTranslation.textContent = `You knew ${knownCount} of ${reviewNotes.length} words`;
    reviewContext.textContent = '';
    reviewAnswer.style.display = 'block';
    reviewActions.style.display = 'none';
    reviewNav.style.display = 'none';
    reviewProgress.textContent = 'Done!';
    // Reset font size after close
    setTimeout(() => { reviewWord.style.fontSize = ''; }, 0);
    return;
  }

  showReviewCard();
}

// Close review on Escape
reviewOverlay.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeReview();
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
