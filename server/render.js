// Server-side page rendering + export (PNG pages, ZIP, PDF) using the shared composer.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { ZipArchive } from 'archiver';
import { composePage, FONTS, hashStr } from '../shared/compose.js';
import { ASSETS, pdir } from './store.js';
import { postprocess } from './postprocess.js';

for (const [fam, f] of Object.entries(FONTS)) GlobalFonts.registerFromPath(path.join(ASSETS, 'fonts', f.file), fam);

export function ppKey(project) {
  const o = project.settings.postprocess || {};
  if (!o.enabled) return '';
  return 'pp' + hashStr(JSON.stringify([o.paletteSnap, o.halftone, o.grain, (project.styleBible?.palette || []).map((p) => p.hex)])).toString(36);
}

// Returns path to the (optionally post-processed) art file for a panel.
export async function artFile(project, panel) {
  if (!panel.art) return null;
  const raw = pdir(project.id, 'art', panel.art);
  if (!fs.existsSync(raw)) return null;
  const key = ppKey(project);
  if (!key) return raw;
  const out = raw.replace(/\.png$/, `.${key}.png`);
  if (!fs.existsSync(out)) fs.writeFileSync(out, await postprocess(fs.readFileSync(raw), project.settings.postprocess, project.styleBible?.palette));
  return out;
}

export async function renderPagePNG(project, i, scale = 1) {
  const images = {};
  for (const p of project.pages[i].panels) { const f = await artFile(project, p); if (f) images[p.id] = await loadImage(f); }
  // measure size first
  const probe = createCanvas(10, 10).getContext('2d');
  const { W, H } = composePage(probe, project, i, {});
  const c = createCanvas(Math.round(W * scale), Math.round(H * scale));
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  composePage(ctx, project, i, images, { placeholders: false });
  return c.toBuffer('image/png');
}

export async function exportPDF(project, scale = 2) {
  const doc = await PDFDocument.create();
  doc.setTitle(project.title || 'Comic');
  doc.setCreator('Comic Studio');
  for (let i = 0; i < project.pages.length; i++) {
    const png = await doc.embedPng(await renderPagePNG(project, i, scale));
    const k = project.settings.format === 'pages' ? 72 / 200 : 0.5; // pages: 200 px/in trim size; slides: 1080px → 7.5in
    const w = (png.width / scale) * k, h = (png.height / scale) * k;
    const page = doc.addPage([w, h]);
    page.drawImage(png, { x: 0, y: 0, width: w, height: h });
  }
  return Buffer.from(await doc.save());
}

export async function exportZip(project, res, scale = 1) {
  const z = new ZipArchive({ zlib: { level: 6 } });
  z.pipe(res);
  const slug = (project.title || 'comic').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'comic';
  const label = project.settings.format === 'pages' ? 'page' : 'slide';
  for (let i = 0; i < project.pages.length; i++) z.append(await renderPagePNG(project, i, scale), { name: `${slug}-${label}-${String(i + 1).padStart(2, '0')}.png` });
  await z.finalize();
}
