import * as db from './db.js';
import { parsePile, serializePile, fileNameFor } from './csv.js';

const app = document.getElementById('app');

/* ---------- helpers ---------- */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const icon = {
  back: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="5" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="19" r="1.9" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/* ---------- learn settings (remembered on the device) ---------- */

const SETTINGS_KEY = 'flashcards.learn';
const DEFAULT_SETTINGS = { firstSide: 'front', shuffle: true };

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
}

/* ---------- toast ---------- */

let toastTimer;
function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2800);
}

/* ---------- navigation (hash routes, so the Android back gesture works) ---------- */

let depth = 0;
function go(hash) { depth++; location.hash = hash; }
function back(fallback) {
  if (depth > 0) { depth--; history.back(); } else { location.replace(fallback); }
}

let actions = {};
let lastHash = null;

function render(html, handlers = {}) {
  const sameView = lastHash === location.hash;
  const scrollTop = sameView ? app.querySelector('.scroll')?.scrollTop || 0 : 0;
  app.innerHTML = html;
  actions = handlers;
  lastHash = location.hash;
  if (scrollTop) { const sc = app.querySelector('.scroll'); if (sc) sc.scrollTop = scrollTop; }
}

app.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-go]');
  if (nav) { go(nav.dataset.go); return; }
  const el = event.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, event);
});

const routes = [
  [/^#\/$/, renderHome],
  [/^#\/pile\/([^/]+)$/, renderPile],
  [/^#\/learn\/([^/]+)$/, renderLearn],
];

async function route() {
  const hash = location.hash || '#/';
  try {
    for (const [pattern, view] of routes) {
      const match = hash.match(pattern);
      if (match) { await view(...match.slice(1).map(decodeURIComponent)); return; }
    }
    location.replace('#/');
  } catch (err) {
    console.error(err);
    render(`<main class="scroll"><div class="empty"><strong>Something went wrong</strong>${esc(err.message || err)}</div></main>
      <footer class="actions"><button class="btn btn-primary" data-action="reload">Reload app</button></footer>`,
    { reload: () => location.reload() });
  }
}
window.addEventListener('hashchange', route);

/* ---------- bottom sheets ---------- */

function openSheet(html) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = html;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancel'); }); // tap on backdrop
  dlg.showModal();
  return dlg;
}

const whenClosed = (dlg) => new Promise((resolve) => {
  dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true });
});

// Primary buttons come first in the markup so Enter submits them; CSS shows them on the right.

async function nameSheet({ title, value = '', confirm }) {
  const dlg = openSheet(`<form method="dialog" class="sheet">
    <h2>${esc(title)}</h2>
    <label class="field"><span>Name</span>
      <input name="name" value="${esc(value)}" maxlength="80" required autocomplete="off" enterkeyhint="done"></label>
    <div class="dialog-actions">
      <button class="btn btn-primary" value="ok">${esc(confirm)}</button>
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
    </div></form>`);
  const input = dlg.querySelector('input');
  input.select();
  const result = await whenClosed(dlg);
  const name = input.value.trim();
  return result === 'ok' && name ? name : null;
}

async function confirmSheet({ title, message, confirm }) {
  const dlg = openSheet(`<form method="dialog" class="sheet">
    <h2>${esc(title)}</h2>
    <p class="sheet-text">${esc(message)}</p>
    <div class="dialog-actions">
      <button class="btn btn-danger" value="ok">${esc(confirm)}</button>
      <button class="btn" value="cancel" autofocus>Cancel</button>
    </div></form>`);
  return (await whenClosed(dlg)) === 'ok';
}

async function menuSheet(title, items) {
  const dlg = openSheet(`<form method="dialog" class="sheet">
    <h2>${esc(title)}</h2>
    <div class="menu">${items.map((i) => `<button class="menu-item${i.danger ? ' is-danger' : ''}" value="${i.value}">${esc(i.label)}</button>`).join('')}</div>
    <div class="dialog-actions"><button class="btn" value="cancel">Cancel</button></div></form>`);
  return whenClosed(dlg);
}

async function cardSheet({ front = '', back = '', isNew }) {
  const dlg = openSheet(`<form method="dialog" class="sheet">
    <h2>${isNew ? 'New card' : 'Edit card'}</h2>
    <label class="field"><span>Front</span><textarea name="front" rows="2" required>${esc(front)}</textarea></label>
    <label class="field"><span>Back</span><textarea name="back" rows="2" required>${esc(back)}</textarea></label>
    <div class="dialog-actions">
      <button class="btn btn-primary" value="save">Save</button>
      ${isNew ? '<button class="btn" value="next">Save and next</button>' : ''}
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
    </div>
    ${isNew ? '' : '<button class="text-btn is-danger" value="delete" formnovalidate>Delete card</button>'}
  </form>`);
  const form = dlg.querySelector('form');
  const action = await whenClosed(dlg);
  return { action, front: form.front.value.trim(), back: form.back.value.trim() };
}

/* ---------- import / export ---------- */

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.multiple = true;
// No `accept` filter on purpose: Android greys out .csv files whose type is reported differently
// (e.g. files received via WhatsApp or e-mail). The parser rejects anything that isn't a pile.
fileInput.addEventListener('change', async () => {
  const files = [...fileInput.files];
  fileInput.value = '';
  if (files.length) await importFiles(files);
});

async function importFiles(files) {
  const results = [];
  for (const file of files) {
    try {
      const parsed = parsePile(await file.text());
      if (!parsed.cards.length) {
        throw new Error('No cards found. Each card line needs a front and a back, separated by a comma or semicolon.');
      }
      const fallback = file.name.replace(/\.[^.]+$/, '') || 'Imported pile';
      const name = await db.uniquePileName(parsed.title || fallback);
      const id = await db.createPile(name, parsed.cards);
      results.push({ ok: true, id, name, count: parsed.cards.length, skipped: parsed.skipped });
    } catch (err) {
      results.push({ ok: false, file: file.name, error: err.message });
    }
  }

  const single = results.length === 1 ? results[0] : null;
  if (single && single.ok && !single.skipped.length) {
    toast(`Imported ${plural(single.count, 'card', 'cards')} into ${single.name}`);
    go(`#/pile/${single.id}`);
    return;
  }

  const dlg = openSheet(`<form method="dialog" class="sheet">
    <h2>Import finished</h2>
    <ul class="report">${results.map((r) => (r.ok
      ? `<li><strong>${esc(r.name)}</strong>: ${plural(r.count, 'card', 'cards')} imported.${r.skipped.length
        ? `<span class="muted">Skipped ${plural(r.skipped.length, 'line', 'lines')} (${r.skipped.map((s) => s.line).join(', ')}). A card line needs exactly one front and one back.</span>` : ''}</li>`
      : `<li><strong>${esc(r.file)}</strong>: not imported.<span class="muted">${esc(r.error)}</span></li>`)).join('')}</ul>
    <div class="dialog-actions"><button class="btn btn-primary" value="ok">Done</button></div></form>`);
  await whenClosed(dlg);
  route();
}

function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportPile(pile) {
  const cards = await db.listCards(pile.id);
  downloadText(fileNameFor(pile.name), serializePile(pile.name, cards));
}

async function exportAll(piles) {
  for (const [i, pile] of piles.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 600)); // browsers drop rapid back-to-back downloads
    await exportPile(pile);
  }
  toast(`Exported ${plural(piles.length, 'pile', 'piles')}`);
}

/* ---------- views ---------- */

async function renderHome() {
  const piles = await db.listPiles();
  render(`
    <header class="bar bar-home"><h1 class="bar-title">Flashcards</h1></header>
    <main class="scroll">
      ${piles.length ? `
        <ul class="list">${piles.map((p) => `
          <li><button class="row" data-go="#/pile/${encodeURIComponent(p.id)}">
            <span class="row-name">${esc(p.name)}</span>
            <span class="row-meta">${p.count ? plural(p.count, 'card', 'cards') : 'Empty'}</span>
          </button></li>`).join('')}
        </ul>
        <button class="text-btn" data-action="exportAll">Export all piles as CSV</button>`
      : `<div class="empty"><strong>No piles yet</strong>Create a pile and add cards, or import a CSV file.</div>`}
    </main>
    <footer class="actions">
      <button class="btn" data-action="import">Import CSV</button>
      <button class="btn btn-primary" data-action="newPile">New pile</button>
    </footer>`, {
    newPile: async () => {
      const name = await nameSheet({ title: 'New pile', confirm: 'Create pile' });
      if (!name) return;
      const id = await db.createPile(await db.uniquePileName(name));
      go(`#/pile/${encodeURIComponent(id)}`);
    },
    import: () => fileInput.click(),
    exportAll: () => exportAll(piles),
  });
}

async function renderPile(id) {
  const pile = await db.getPile(id);
  if (!pile) { location.replace('#/'); return; }
  const cards = await db.listCards(id);
  const pileHash = `#/pile/${encodeURIComponent(id)}`;

  render(`
    <header class="bar">
      <button class="icon-btn" data-action="back" aria-label="Back to piles">${icon.back}</button>
      <h1 class="bar-title">${esc(pile.name)}</h1>
      <button class="icon-btn" data-action="menu" aria-label="Pile options">${icon.more}</button>
    </header>
    <main class="scroll">
      ${cards.length ? `
        <button class="learn-start" data-action="learn">
          <span class="learn-start-title">Learn</span>
          <span class="learn-start-meta">${plural(cards.length, 'card', 'cards')}</span>
        </button>
        <ul class="list">${cards.map((c) => `
          <li><button class="card-row" data-action="edit" data-id="${esc(c.id)}">
            <span class="card-front">${esc(c.front)}</span>
            <span class="card-back">${esc(c.back)}</span>
          </button></li>`).join('')}
        </ul>`
      : '<div class="empty"><strong>This pile is empty</strong>Add your first card. Each card has a front and a back.</div>'}
    </main>
    <footer class="actions"><button class="btn btn-primary" data-action="add">Add card</button></footer>`, {
    back: () => back('#/'),
    learn: () => learnOptions(id),
    add: () => addCards(id),
    edit: (el) => editCard(id, cards.find((c) => c.id === el.dataset.id)),
    menu: async () => {
      const choice = await menuSheet(pile.name, [
        { value: 'rename', label: 'Rename pile' },
        { value: 'export', label: 'Export as CSV' },
        { value: 'delete', label: 'Delete pile', danger: true },
      ]);
      if (choice === 'rename') {
        const name = await nameSheet({ title: 'Rename pile', value: pile.name, confirm: 'Save' });
        if (name && name !== pile.name) {
          await db.renamePile(id, await db.uniquePileName(name, id));
          toast('Pile renamed');
          if (location.hash === pileHash) renderPile(id);
        }
      } else if (choice === 'export') {
        await exportPile(pile);
        toast(`Exported ${pile.name}`);
      } else if (choice === 'delete') {
        const ok = await confirmSheet({
          title: `Delete ${pile.name}?`,
          message: `This deletes the pile and its ${plural(cards.length, 'card', 'cards')}. Export it first if you want a copy.`,
          confirm: 'Delete pile',
        });
        if (ok) { await db.deletePile(id); toast('Pile deleted'); back('#/'); }
      }
    },
  });
}

async function addCards(pileId) {
  let added = 0;
  for (;;) {
    const r = await cardSheet({ isNew: true });
    if ((r.action === 'save' || r.action === 'next') && r.front && r.back) {
      await db.createCard(pileId, r.front, r.back);
      added++;
      await renderPile(pileId);
    }
    if (r.action !== 'next') break;
  }
  if (added) toast(added === 1 ? 'Card added' : `${added} cards added`);
}

async function editCard(pileId, card) {
  if (!card) return;
  const r = await cardSheet({ front: card.front, back: card.back, isNew: false });
  if (r.action === 'save' && r.front && r.back) {
    await db.updateCard({ ...card, front: r.front, back: r.back });
    toast('Card saved');
    renderPile(pileId);
  } else if (r.action === 'delete') {
    const ok = await confirmSheet({ title: 'Delete this card?', message: `${card.front} / ${card.back}`, confirm: 'Delete card' });
    if (ok) { await db.deleteCard(card.id); toast('Card deleted'); renderPile(pileId); }
  }
}

async function learnOptions(pileId) {
  const s = loadSettings();
  const dlg = openSheet(`<form method="dialog" class="sheet">
    <h2>Learn</h2>
    <fieldset class="field">
      <legend>Show first</legend>
      <div class="segmented">
        <label><input type="radio" name="first" value="front" ${s.firstSide === 'front' ? 'checked' : ''}><span>Front</span></label>
        <label><input type="radio" name="first" value="back" ${s.firstSide === 'back' ? 'checked' : ''}><span>Back</span></label>
      </div>
    </fieldset>
    <label class="check"><input type="checkbox" name="shuffle" ${s.shuffle ? 'checked' : ''}><span>Shuffle cards</span></label>
    <div class="dialog-actions">
      <button class="btn btn-primary" value="start">Start</button>
      <button class="btn" value="cancel">Cancel</button>
    </div></form>`);
  const form = dlg.querySelector('form');
  if ((await whenClosed(dlg)) !== 'start') return;
  saveSettings({ firstSide: form.first.value, shuffle: form.shuffle.checked });
  go(`#/learn/${encodeURIComponent(pileId)}`);
}

/* ---------- learn mode ---------- */

const sizeClass = (text) => (text.length > 120 ? 'is-xlong' : text.length > 40 ? 'is-long' : '');

const face = (side, label, text, hidden) => `
  <span class="face face-${side}" ${hidden ? 'aria-hidden="true"' : ''}>
    <span class="face-label">${label}</span>
    <span class="face-text ${sizeClass(text)}">${esc(text)}</span>
  </span>`;

async function renderLearn(id) {
  const pile = await db.getPile(id);
  const cards = pile ? await db.listCards(id) : [];
  if (!pile || !cards.length) { location.replace(pile ? `#/pile/${encodeURIComponent(id)}` : '#/'); return; }

  const settings = loadSettings();
  const s = {
    queue: settings.shuffle ? shuffle([...cards]) : [...cards],
    total: cards.length,
    known: 0,
    again: 0,
    flipped: false,
    revealed: false,
  };
  const sides = (c) => (settings.firstSide === 'back'
    ? [['Back', c.back], ['Front', c.front]]
    : [['Front', c.front], ['Back', c.back]]);

  const header = (count) => `
    <header class="bar">
      <button class="icon-btn" data-action="exit" aria-label="Stop learning">${icon.close}</button>
      <h1 class="bar-title">${esc(pile.name)}</h1>
      <span class="bar-count" aria-label="${count} of ${s.total} known">${count} / ${s.total}</span>
    </header>
    <div class="progress" aria-hidden="true"><span style="width:${(count / s.total) * 100}%"></span></div>`;

  const buttons = () => (s.revealed
    ? '<button class="btn btn-again" data-action="again">Again</button><button class="btn btn-primary" data-action="good">Got it</button>'
    : '<button class="btn btn-primary" data-action="flip">Show answer</button>');

  const draw = () => {
    if (!s.queue.length) { drawDone(); return; }
    const [[labelA, textA], [labelB, textB]] = sides(s.queue[0]);
    render(`${header(s.known)}
      <main class="learn">
        <button class="flashcard" data-action="flip" aria-label="Flip card">
          <span class="flashcard-inner">${face('a', labelA, textA, false)}${face('b', labelB, textB, true)}</span>
        </button>
        <p class="hint">Tap the card to flip it</p>
      </main>
      <footer class="actions">${buttons()}</footer>`, handlers);
  };

  const drawDone = () => {
    render(`${header(s.total)}
      <main class="learn">
        <div class="flashcard is-static">
          <span class="flashcard-inner">${face('a', 'Done', `All ${plural(s.total, 'card', 'cards')} learned`, false)}</span>
        </div>
        <p class="hint">${s.again ? `You pressed Again ${plural(s.again, 'time', 'times')}.` : 'Every card right on the first try.'}</p>
      </main>
      <footer class="actions">
        <button class="btn" data-action="exit">Back to pile</button>
        <button class="btn btn-primary" data-action="restart">Learn again</button>
      </footer>`, handlers);
  };

  const next = () => { s.flipped = false; s.revealed = false; draw(); };

  const handlers = {
    flip: () => {
      s.flipped = !s.flipped;
      const card = app.querySelector('.flashcard');
      card.classList.toggle('is-flipped', s.flipped);
      card.querySelector('.face-a').setAttribute('aria-hidden', String(s.flipped));
      card.querySelector('.face-b').setAttribute('aria-hidden', String(!s.flipped));
      if (!s.revealed) {
        s.revealed = true;
        app.querySelector('.actions').innerHTML = buttons();
      }
    },
    again: () => { s.queue.push(s.queue.shift()); s.again++; next(); },
    good: () => { s.queue.shift(); s.known++; next(); },
    restart: () => renderLearn(id),
    exit: () => back(`#/pile/${encodeURIComponent(id)}`),
  };

  draw();
}

/* ---------- start ---------- */

route();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
// Ask the browser not to clear this app's data when the phone runs low on space.
navigator.storage?.persist?.().catch(() => {});
