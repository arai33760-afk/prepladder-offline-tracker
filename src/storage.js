import { validateState } from './core.js';

const DB_NAME = 'prepladder-lecture-tracker';
const DB_VERSION = 1;
export function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB is unavailable in this browser.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('main')) db.createObjectStore('main');
      if (!db.objectStoreNames.contains('safety')) db.createObjectStore('safety', { keyPath: 'id' });
    };
    request.onblocked = () => reject(new Error('Close other open tracker tabs, then reload. Database upgrade was blocked.'));
    request.onerror = () => reject(request.error || new Error('Could not open local storage.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Local save failed. Your previous data is still intact.'));
    tx.onerror = () => reject(tx.error || new Error('Local storage error.'));
  });
}
function writeTransaction(db, stores) {
  try { return db.transaction(stores, 'readwrite', { durability: 'strict' }); }
  catch (error) { if (error instanceof TypeError) return db.transaction(stores, 'readwrite'); throw error; }
}
export async function readState(db) {
  const tx = db.transaction('main', 'readonly');
  const request = tx.objectStore('main').get('state');
  const result = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error('Could not read saved progress.'));
  });
  await transactionDone(tx);
  if (result !== null) validateState(result);
  return result;
}
export async function writeState(db, state) {
  validateState(state);
  const tx = writeTransaction(db, 'main');
  tx.objectStore('main').put(state, 'state');
  await transactionDone(tx);
}
// Read and change the latest saved state in one serialized transaction across tabs.
export async function updateState(db, change) {
  const tx = writeTransaction(db, 'main');
  const done = transactionDone(tx);
  const store = tx.objectStore('main');
  let next, failure;
  const request = store.get('state');
  request.onsuccess = () => {
    try {
      validateState(request.result);
      next = change(request.result);
      validateState(next);
      store.put(next, 'state');
    } catch (error) { failure = error; tx.abort(); }
  };
  try { await done; } catch (error) { throw failure || error; }
  return next;
}
export async function installInitialState(db, state) {
  validateState(state);
  const tx = writeTransaction(db, 'main');
  const store = tx.objectStore('main');
  const request = store.get('state');
  const existing = await new Promise((resolve, reject) => {
    request.onsuccess = () => { if (request.result === undefined) store.put(state, 'state'); resolve(request.result ?? null); };
    request.onerror = () => reject(request.error || new Error('Could not initialize storage.'));
  });
  await transactionDone(tx);
  if (existing) validateState(existing);
  return existing || state;
}
export async function importWithSafety(db, nextState, safetyBackup, reason) {
  validateState(nextState);
  const tx = writeTransaction(db, ['main', 'safety']);
  const done = transactionDone(tx);
  const snapshot = { id: `${new Date().toISOString()}-${crypto.randomUUID()}`, createdAt: new Date().toISOString(), reason, backup: safetyBackup };
  let stale = false;
  const request = tx.objectStore('main').get('state');
  request.onsuccess = () => {
    if (JSON.stringify(request.result) !== JSON.stringify(safetyBackup.state)) { stale = true; tx.abort(); return; }
    tx.objectStore('safety').put(snapshot);
    tx.objectStore('main').put(nextState, 'state');
  };
  try { await done; } catch (error) {
    if (stale) {
      const conflict = new Error('Progress changed in another tab. Review the updated totals, then try again. No progress was replaced.');
      conflict.code = 'STALE_STATE';
      throw conflict;
    }
    throw error;
  }
  return snapshot.id;
}
export async function listSafetySnapshots(db) {
  const tx = db.transaction('safety', 'readonly');
  const request = tx.objectStore('safety').getAll();
  const items = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Could not read safety snapshots.'));
  });
  await transactionDone(tx);
  return items.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try { return await navigator.storage.persist(); } catch { return false; }
}
