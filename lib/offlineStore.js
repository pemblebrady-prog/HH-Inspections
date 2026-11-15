// Tiny IndexedDB key-value store for the phone (drafts, photos, upload queues).
// Every call fails soft: if storage is unavailable (private mode, old browser)
// the portal still works, it just can't resume after the app is closed.
const DB = "hh-portal";
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("No IndexedDB"));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("kv")) r.result.createObjectStore("kv"); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction("kv", mode);
    const store = t.objectStore("kv");
    const out = fn(store);
    t.oncomplete = () => resolve(out && "result" in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function idbGet(key) { try { return await tx("readonly", (s) => s.get(key)); } catch { return undefined; } }
export async function idbSet(key, value) { try { await tx("readwrite", (s) => s.put(value, key)); return true; } catch { return false; } }
export async function idbDel(key) { try { await tx("readwrite", (s) => s.delete(key)); } catch { /* ignore */ } }
export async function idbKeys(prefix) {
  try {
    const keys = await tx("readonly", (s) => s.getAllKeys());
    return (keys || []).filter((k) => typeof k === "string" && k.startsWith(prefix));
  } catch { return []; }
}

// Photos are stored as raw bytes (more reliable than Blobs on older iPhones).
export async function savePhoto(id, file) {
  try {
    const buf = await file.arrayBuffer();
    return await idbSet(`photo:${id}`, { name: file.name, type: file.type || "image/jpeg", buf });
  } catch { return false; }
}
export async function loadPhoto(id) {
  const rec = await idbGet(`photo:${id}`);
  if (!rec || !rec.buf) return null;
  return new File([rec.buf], rec.name || `${id}.jpg`, { type: rec.type || "image/jpeg" });
}
export const deletePhoto = (id) => idbDel(`photo:${id}`);

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
