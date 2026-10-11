// Robust photo intake for iPhone Safari & co: decode (img → createImageBitmap → HEIC fallback),
// downscale BEFORE anything else touches the pixels, re-encode to a plain JPEG/PNG Blob.
// Every step has a timeout so the UI can never hang on "Finding the panels…".

export class UploadError extends Error {}

export function withTimeout(promise, ms, what) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => rej(new UploadError(`${what} took too long (over ${Math.round(ms / 1000)}s).`)), ms); }),
  ]).finally(() => clearTimeout(t));
}

const HEIC_RE = /\.(heic|heif)$/i;
export function looksLikeImage(f) {
  if (!f) return false;
  if (f.type && f.type.startsWith('image/')) return true;
  if (HEIC_RE.test(f.name || '') || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name || '')) return true;
  return !f.type; // iOS sometimes hands over photos with no MIME type: try anyway
}
async function isHeic(f) {
  if (/hei[cf]/i.test(f.type || '') || HEIC_RE.test(f.name || '')) return true;
  try { const b = new Uint8Array(await f.slice(0, 16).arrayBuffer()); const s = String.fromCharCode(...b.slice(4, 12)); return /ftyp(heic|heix|hevc|hevx|mif1|msf1|heis)/.test(s); } catch { return false; }
}

// Decode with an <img> element (most reliable on iOS Safari; honours EXIF orientation; HEIC natively on iOS).
function decodeWithImg(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res({ src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img decode failed')); };
    img.src = url;
  });
}
async function decodeWithBitmap(blob) {
  const bm = await createImageBitmap(blob);
  return { src: bm, w: bm.width, h: bm.height, done: () => bm.close?.() };
}
async function decodeAny(blob) {
  for (const fn of [decodeWithImg, decodeWithBitmap]) {
    try { const d = await withTimeout(fn(blob), 15000, 'Opening the picture'); if (d.w && d.h) return d; } catch { /* try next */ }
  }
  return null;
}

/**
 * Turn any picked/dropped file into a small, safe image.
 * Returns { blob, w, h, canvas } where canvas holds the downscaled pixels (for analysis).
 */
export async function ingestImage(file, { maxSide = 2000, onStatus } = {}) {
  if (!looksLikeImage(file)) throw new UploadError(`“${file?.name || 'That file'}” isn't a picture. Choose a photo or screenshot.`);
  if (file.size === 0) throw new UploadError(`“${file.name}” is empty. If it's an iCloud photo, open it in Photos once so it downloads, then try again.`);
  onStatus?.('Opening the picture…');
  let d = await decodeAny(file);
  if (!d && (await isHeic(file))) {
    onStatus?.('Converting the HEIC photo…');
    try {
      const { default: heic2any } = await import('heic2any');
      const out = await withTimeout(heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }), 45000, 'Converting the HEIC photo');
      d = await decodeAny(Array.isArray(out) ? out[0] : out);
    } catch (e) { if (e instanceof UploadError) throw e; }
  }
  if (!d) throw new UploadError(`Couldn't open “${file.name || 'that picture'}”. Try saving it again from ChatGPT (press and hold → Save to Photos), or take a screenshot of it and use that.`);
  try {
    const k = Math.min(1, maxSide / Math.max(d.w, d.h));
    const w = Math.max(1, Math.round(d.w * k)), h = Math.max(1, Math.round(d.h * k));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new UploadError('This browser could not make a drawing surface. Close some tabs and try again.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // big downscales in halving steps look better and stay within iOS canvas limits
    let src = d.src, sw = d.w, sh = d.h;
    while (sw / 2 > w * 1.5) {
      const c2 = document.createElement('canvas'); c2.width = Math.round(sw / 2); c2.height = Math.round(sh / 2);
      const x2 = c2.getContext('2d'); x2.imageSmoothingQuality = 'high'; x2.drawImage(src, 0, 0, c2.width, c2.height);
      if (src !== d.src) { src.width = src.height = 0; }
      src = c2; sw = c2.width; sh = c2.height;
    }
    ctx.drawImage(src, 0, 0, w, h);
    if (src !== d.src) { src.width = src.height = 0; }
    const png = /png/i.test(file.type || '') && k === 1;
    const blob = await withTimeout(new Promise((res) => canvas.toBlob(res, png ? 'image/png' : 'image/jpeg', 0.93)), 15000, 'Saving the picture');
    if (!blob) throw new UploadError('Could not save the picture on this device. Close some tabs and try again.');
    return { blob, w, h, canvas };
  } finally { d.done(); }
}
