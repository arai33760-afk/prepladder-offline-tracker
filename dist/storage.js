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
  const tx = db.transaction('main', 'readwrite');
  tx.objectStore('main').put(state, 'state');
  await transactionDone(tx);
}
export async function installInitialState(db, state) {
  validateState(state);
  const tx = db.transaction('main', 'readwrite');
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
  const tx = db.transaction(['main', 'safety'], 'readwrite');
  const snapshot = { id: `${new Date().toISOString()}-${crypto.randomUUID()}`, createdAt: new Date().toISOString(), reason, backup: safetyBackup };
  tx.objectStore('safety').put(snapshot);
  tx.objectStore('main').put(nextState, 'state');
  await transactionDone(tx);
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
