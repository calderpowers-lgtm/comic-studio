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
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('images', mode); const r = fn(t.objectStore('images')); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); };
export const putImage = (key, blob) => tx('readwrite', (s) => s.put(blob, key));
export const getImage = (key) => tx('readonly', (s) => s.get(key));
export const delImage = (key) => tx('readwrite', (s) => s.delete(key));
export const clearImages = () => tx('readwrite', (s) => s.clear());

export function loadProject() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
export function saveProject(p) { localStorage.setItem(KEY, JSON.stringify(p)); }

const bitmaps = new Map();
export async function bitmap(key) {
  if (!key) return null;
  if (!bitmaps.has(key)) bitmaps.set(key, getImage(key).then((b) => (b ? createImageBitmap(b) : null)).catch(() => null));
  return bitmaps.get(key);
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
