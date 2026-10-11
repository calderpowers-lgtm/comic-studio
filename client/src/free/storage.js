// Browser-only persistence: project JSON in localStorage, images (Blobs) in IndexedDB.
const KEY = 'comic-free:project:v1';
let dbp;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('comic-free', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('images');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
// Every IndexedDB call has a timeout and settles on abort too (iOS Private Browsing / quota errors).
const tx = async (mode, fn, ms = 6000) => {
  const d = await Promise.race([db(), new Promise((_, rej) => setTimeout(() => rej(new Error('storage open timeout')), ms))]);
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('storage timeout')), ms);
    try {
      const t = d.transaction('images', mode); const r = fn(t.objectStore('images'));
      t.oncomplete = () => { clearTimeout(timer); res(r?.result); };
      t.onerror = t.onabort = () => { clearTimeout(timer); rej(t.error || r?.error || new Error('storage error')); };
    } catch (e) { clearTimeout(timer); rej(e); }
  });
};
// If the device refuses to store a picture, keep it in memory for this visit instead of failing.
const mem = new Map();
export let storageProblem = false;
// Pictures are stored as raw bytes, NOT as Blob/File: WebKit (iOS Safari) can refuse Blobs in IndexedDB
// ("Error preparing Blob/File data to be stored in object store"), and that broke uploads on iPhone.
export async function putImage(key, blob) {
  try { const buf = await blob.arrayBuffer(); await tx('readwrite', (s) => s.put({ buf, type: blob.type || 'image/jpeg' }, key)); mem.delete(key); }
  catch (e) { console.warn('Image storage failed, keeping it in memory:', e?.message); mem.set(key, blob); storageProblem = true; }
}
export async function getImage(key) {
  if (mem.has(key)) return mem.get(key);
  try {
    const v = await tx('readonly', (s) => s.get(key));
    if (!v) return null;
    if (v instanceof Blob) return v; // stored by an older version
    return v.buf ? new Blob([v.buf], { type: v.type || 'image/jpeg' }) : null;
  } catch { return null; }
}
export const delImage = async (key) => { mem.delete(key); try { await tx('readwrite', (s) => s.delete(key)); } catch { /* ignore */ } };
export const clearImages = async () => { mem.clear(); try { await tx('readwrite', (s) => s.clear()); } catch { /* ignore */ } };

export function loadProject() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
export function saveProject(p) { localStorage.setItem(KEY, JSON.stringify(p)); }

const bitmaps = new Map();
export async function bitmap(key) {
  if (!key) return null;
  if (!bitmaps.has(key)) bitmaps.set(key, getImage(key).then((b) => (b ? toDrawable(b) : null)).catch(() => null));
  return bitmaps.get(key);
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

// createImageBitmap, falling back to an <img> element (older iOS Safari).
async function toDrawable(blob) {
  try { return await createImageBitmap(blob); } catch {
    return new Promise((res) => { const u = URL.createObjectURL(blob); const im = new Image(); im.onload = () => res(im); im.onerror = () => { URL.revokeObjectURL(u); res(null); }; im.src = u; });
  }
}
