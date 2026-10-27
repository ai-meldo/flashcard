// Storage on the device (IndexedDB). Two stores:
//   piles  { id, name, createdAt }
//   cards  { id, pileId, front, back, order }   indexed by pileId

const DB_NAME = 'flashcards';
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('piles', { keyPath: 'id' });
        const cards = db.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('pileId', 'pileId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// Runs `work(tx)` in one transaction and resolves with its result once the transaction commits.
async function run(stores, mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    Promise.resolve(work(tx)).then(
      (value) => { result = value; },
      (err) => { try { tx.abort(); } catch { /* already finished */ } reject(err); },
    );
  });
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2));

/* ---------- piles ---------- */

export function listPiles() {
  return run(['piles', 'cards'], 'readonly', (tx) => Promise.all([
    done(tx.objectStore('piles').getAll()),
    done(tx.objectStore('cards').getAll()),
  ]).then(([piles, cards]) => {
    const counts = {};
    for (const c of cards) counts[c.pileId] = (counts[c.pileId] || 0) + 1;
    return piles
      .map((p) => ({ ...p, count: counts[p.id] || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }));
}

export function getPile(id) {
  return run(['piles'], 'readonly', (tx) => done(tx.objectStore('piles').get(id)));
}

/** Returns `name`, or `name (2)`, `name (3)` … if another pile already uses it. */
export async function uniquePileName(name, exceptId = null) {
  const piles = await run(['piles'], 'readonly', (tx) => done(tx.objectStore('piles').getAll()));
  const taken = new Set(piles.filter((p) => p.id !== exceptId).map((p) => p.name.toLocaleLowerCase()));
  if (!taken.has(name.toLocaleLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

export function createPile(name, cards = []) {
  const id = newId();
  const now = Date.now();
  return run(['piles', 'cards'], 'readwrite', (tx) => {
    tx.objectStore('piles').add({ id, name, createdAt: now });
    const store = tx.objectStore('cards');
    cards.forEach((c, i) => store.add({ id: newId(), pileId: id, front: c.front, back: c.back, order: now + i }));
    return id;
  });
}

export function renamePile(id, name) {
  return run(['piles'], 'readwrite', (tx) => {
    const store = tx.objectStore('piles');
    return done(store.get(id)).then((pile) => { if (pile) store.put({ ...pile, name }); });
  });
}

export function deletePile(id) {
  return run(['piles', 'cards'], 'readwrite', (tx) => {
    tx.objectStore('piles').delete(id);
    const cards = tx.objectStore('cards');
    return done(cards.index('pileId').getAllKeys(id)).then((keys) => keys.forEach((k) => cards.delete(k)));
  });
}

/* ---------- cards ---------- */

export function listCards(pileId) {
  return run(['cards'], 'readonly', (tx) => done(tx.objectStore('cards').index('pileId').getAll(pileId)))
    .then((cards) => cards.sort((a, b) => a.order - b.order));
}

export function createCard(pileId, front, back) {
  const card = { id: newId(), pileId, front, back, order: Date.now() };
  return run(['cards'], 'readwrite', (tx) => { tx.objectStore('cards').add(card); return card; });
}

export function updateCard(card) {
  return run(['cards'], 'readwrite', (tx) => { tx.objectStore('cards').put(card); });
}

export function deleteCard(id) {
  return run(['cards'], 'readwrite', (tx) => { tx.objectStore('cards').delete(id); });
}
