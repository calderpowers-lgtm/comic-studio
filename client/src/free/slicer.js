// Browser glue for the grid flow: decode ChatGPT's picture, find the grid, cut + upscale the panels.
import { detectGrid, cellsFromLines, slicePanel, bgMask, defaultCrop } from '@shared/grid.js';
import { getImage, putImage, delImage, uid } from './storage.js';

const pixelCache = new Map(); // image key → { data, w, h, mask }
const MAX = 2400; // cap the long side (screenshots etc.) to bound memory on phones

export async function sheetPixels(key) {
  if (pixelCache.has(key)) return pixelCache.get(key);
  const blob = await getImage(key);
  if (!blob) return null;
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const data = ctx.getImageData(0, 0, w, h).data;
  const px = { data, w, h, mask: bgMask(data, w, h) };
  pixelCache.clear(); // keep at most one decoded sheet around
  pixelCache.set(key, px);
  return px;
}

// Store an uploaded picture and detect its grid. Returns the new sheet state.
export async function addSheetImage(file, plan) {
  const key = 'sheet-img:' + uid();
  await putImage(key, file);
  const px = await sheetPixels(key);
  if (!px) throw new Error("Couldn't open that picture. Try saving it again from ChatGPT.");
  const g = detectGrid(px.data, px.w, px.h, plan.rows, plan.cols, plan.count);
  return { img: key, w: px.w, h: px.h, ...g };
}

// Re-detect with a different rows × cols (when ChatGPT drew something else).
export async function redetect(sheet, rows, cols, count) {
  const px = await sheetPixels(sheet.img);
  const g = detectGrid(px.data, px.w, px.h, rows, cols, count);
  return { ...sheet, ...g };
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
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    const key = 'panel-img:' + uid();
    await putImage(key, blob);
    out.push({ key, crop: defaultCrop(cells[i]), cell: cells[i] });
  }
  return out;
}

export const dropImages = (keys) => Promise.all(keys.filter(Boolean).map((k) => delImage(k).catch(() => {})));
