// Browser glue for the grid flow: decode ChatGPT's picture, find the grid, cut + upscale the panels.
import { detectGrid, cellsFromLines, slicePanel, bgMask, defaultCrop } from '@shared/grid.js';
import { getImage, putImage, delImage, uid } from './storage.js';
import { ingestImage, UploadError, withTimeout } from './ingest.js';

const pixelCache = new Map(); // image key → { data, w, h, mask }
export const MAX_SIDE = 2000; // analysis/storage size: safe for iOS canvas + memory limits

function pixelsFromCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  if (!data || data.length !== w * h * 4) throw new UploadError('This device could not read the picture’s pixels.');
  return { data, w, h, mask: bgMask(data, w, h) };
}
function remember(key, px) { pixelCache.clear(); pixelCache.set(key, px); return px; } // keep at most one sheet decoded

export async function sheetPixels(key) {
  if (pixelCache.has(key)) return pixelCache.get(key);
  const blob = await getImage(key);
  if (!blob) return null;
  const { canvas } = await ingestImage(blob, { maxSide: MAX_SIDE });
  return remember(key, pixelsFromCanvas(canvas));
}

// Even split of the whole picture (used when detection can't run or fails).
export function evenGrid(w, h, rows, cols, note) {
  const xs = Array.from({ length: cols + 1 }, (_, i) => (i * w) / cols), ys = Array.from({ length: rows + 1 }, (_, i) => (i * h) / rows);
  const gx = -Math.round(w * 0.012), gy = -Math.round(h * 0.012);
  return { xs, ys, xw: xs.map((_, i) => (i === 0 || i === cols ? 0 : gx)), yw: ys.map((_, i) => (i === 0 || i === rows ? 0 : gy)), rows, cols, method: 'even',
    note: note || "Split evenly. Drag the red lines onto the white gaps if a cut is off." };
}

// Decode + downscale the picked file, store it, detect the grid. Never hangs: every step has a timeout,
// and detection problems fall back to an even split the user can adjust.
export async function addSheetImage(file, plan, onStatus) {
  const { blob, canvas } = await withTimeout(ingestImage(file, { maxSide: MAX_SIDE, onStatus }), 60000, 'Opening the picture');
  const key = 'sheet-img:' + uid();
  await putImage(key, blob);
  let px;
  try { px = remember(key, pixelsFromCanvas(canvas)); } catch (e) { throw e instanceof UploadError ? e : new UploadError('This device could not read the picture’s pixels. Try a screenshot of it instead.'); }
  onStatus?.('Finding the panels…');
  await new Promise((r) => setTimeout(r, 30)); // let the status paint
  let g;
  try { g = detectGrid(px.data, px.w, px.h, plan.rows, plan.cols, plan.count); }
  catch (e) { console.warn('grid detection failed', e); g = evenGrid(px.w, px.h, plan.rows, plan.cols, "Couldn't find the white lines automatically, so it's split evenly. Drag the red lines onto the gaps."); }
  return { img: key, w: px.w, h: px.h, ...g };
}

// Re-detect with a different rows × cols (when ChatGPT drew something else).
export async function redetect(sheet, rows, cols, count) {
  const px = await sheetPixels(sheet.img);
  if (!px) throw new UploadError('The picture is no longer on this device. Add it again.');
  try { return { ...sheet, ...detectGrid(px.data, px.w, px.h, rows, cols, count) }; } catch { return { ...sheet, ...evenGrid(px.w, px.h, rows, cols) }; }
}

export async function cellsFor(sheet, count) {
  const px = await sheetPixels(sheet.img);
  if (!px) return [];
  return cellsFromLines(px.data, px.w, px.h, sheet.xs, sheet.ys, count, px.mask, sheet.xw, sheet.yw);
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// Cut every panel, upscale to cover 1080×1350, store as PNG. Returns [{ key, crop, cell }] in reading order.
export async function sliceSheet(sheet, count, onProgress) {
  const px = await sheetPixels(sheet.img);
  if (!px) throw new UploadError('The picture is no longer on this device. Add it again.');
  const cells = cellsFromLines(px.data, px.w, px.h, sheet.xs, sheet.ys, count, px.mask, sheet.xw, sheet.yw);
  const out = [];
  const c = document.createElement('canvas');
  for (let i = 0; i < cells.length; i++) {
    onProgress?.(i, cells.length);
    await tick();
    const { px: rgba, w, h } = slicePanel(px.data, px.w, px.h, cells[i]);
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
    const blob = await withTimeout(new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95)), 15000, 'Saving a panel');
    if (!blob) throw new UploadError('Could not save the cut panels on this device. Close some tabs and try again.');
    const key = 'panel-img:' + uid();
    await putImage(key, blob);
    out.push({ key, crop: defaultCrop(cells[i]), cell: cells[i] });
  }
  return out;
}

export const dropImages = (keys) => Promise.all(keys.filter(Boolean).map((k) => delImage(k).catch(() => {})));
