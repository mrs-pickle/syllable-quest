const DB_NAME = 'syllable-quest';
const DB_VERSION = 1;
const KV = 'kv';
const BLOBS = 'blobs';



function makeStore(persistent, kv, blobs) {
  return {
    persistent,
    get: (k) => kv.get(k),
    set: (k, v) => kv.put(k, v),
    setMany: (entries) => kv.putMany(entries),
    del: (k) => kv.del(k),
    keys: () => kv.keys(),
    getBlob: (id) => blobs.get(id),
    putBlob: async (id, blob) => {
      if (!(blob instanceof Blob)) throw new TypeError('putBlob needs a Blob');
      await blobs.put(id, blob);
    },
    delBlob: (id) => blobs.del(id),
    blobIds: () => blobs.keys(),
  };
}

function memoryTable(copy) {
  const map = new Map();
  return {
    get: async (k) => (map.has(k) ? copy(map.get(k)) : undefined),
    put: async (k, v) => { map.set(k, copy(v)); },
    putMany: async (entries) => {
      const copies = entries.map(([k, v]) => [k, v === undefined ? undefined : copy(v)]);
      for (const [k, v] of copies) { if (v === undefined) map.delete(k); else map.set(k, v); }
    },
    del: async (k) => { map.delete(k); },
    keys: async () => [...map.keys()].sort(),
  };
}

function idbTable(db, storeName) {
  const run = (mode, start) => new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, mode);
      const request = start(tx.objectStore(storeName));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? request.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    } catch (err) {
      reject(err);
    }
  });
  const putMany = (entries) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, 'readwrite');
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    try {
      const objects = tx.objectStore(storeName);
      for (const [k, v] of entries) {
        if (v === undefined) objects.delete(k);
        else objects.put(v, k);
      }
    } catch (err) {
      try { tx.abort?.(); } catch { }
      reject(err);
      return;
    }
    try { tx.commit?.(); } catch { }
  });
  return {
    get: (k) => run('readonly', (s) => s.get(k)),
    put: (k, v) => run('readwrite', (s) => s.put(v, k)).then(() => undefined),
    putMany,
    del: (k) => run('readwrite', (s) => s.delete(k)).then(() => undefined),
    keys: () => run('readonly', (s) => s.getAllKeys()).then((ks) => ks.map(String)),
  };
}

function openDatabase() {
  return new Promise((resolve) => {
    try {
      const factory = globalThis.indexedDB;
      if (!factory) { resolve(null); return; }
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of [KV, BLOBS]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function requestPersistence() {
  try {
    globalThis.navigator?.storage?.persist?.()?.catch?.(() => {});
  } catch { }
}

export async function openStore({ backend = 'indexeddb' } = {}) {
  if (backend !== 'memory') {
    const db = await openDatabase();
    if (db) {
      requestPersistence();
      return makeStore(true, idbTable(db, KV), idbTable(db, BLOBS));
    }
  }
  return makeStore(false, memoryTable(structuredClone), memoryTable((blob) => blob));
}
