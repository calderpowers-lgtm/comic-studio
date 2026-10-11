// Client-side rendering + export (PNG, ZIP, PDF, share). No server needed.
import { zipSync } from 'fflate';
import { composePage, pageSize } from '@shared/compose.js';
import { bitmap } from './storage.js';

export async function ensureFonts() {
  await Promise.all(['ComicNeueBold', 'PatrickHand', 'Bangers'].map((f) => document.fonts.load(`40px ${f}`, 'ABC'))).catch(() => {});
}
export async function slideImages(project, i) {
  const out = {};
  for (const p of project.pages[i].panels) { const b = await bitmap(p.img); if (b) out[p.id] = b; }
  return out;
}
export async function renderSlideBlob(project, i, scale = 1) {
  await ensureFonts();
  const { W, H } = pageSize(project);
  const c = document.createElement('canvas');
  c.width = Math.round(W * scale); c.height = Math.round(H * scale);
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  composePage(ctx, project, i, await slideImages(project, i), { placeholders: false });
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
export const slug = (s) => (s || 'comic').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'comic';
export const slideName = (project, i) => `${slug(project.title)}-${project.settings.format === 'pages' ? 'page' : 'slide'}-${String(i + 1).padStart(2, '0')}.png`;

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
export async function allSlideBlobs(project, scale = 1, onProgress) {
  const out = [];
  for (let i = 0; i < project.pages.length; i++) { out.push(await renderSlideBlob(project, i, scale)); onProgress?.(i + 1); }
  return out;
}
export async function zipBlob(files) {
  const entries = {};
  for (const [name, blob] of files) entries[name] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  return new Blob([zipSync(entries)], { type: 'application/zip' });
}
export async function pdfBlob(project, blobs) {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(project.title || 'Comic'); doc.setCreator('Comic Studio');
  const { W, H } = pageSize(project);
  const k = project.settings.format === 'pages' ? 72 / 200 : 0.5;
  for (const b of blobs) {
    const png = await doc.embedPng(new Uint8Array(await b.arrayBuffer()));
    doc.addPage([W * k, H * k]).drawImage(png, { x: 0, y: 0, width: W * k, height: H * k });
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}
export async function shareFiles(files, title) {
  const list = files.map(([name, blob]) => new File([blob], name, { type: blob.type }));
  if (!navigator.canShare?.({ files: list })) return false;
  await navigator.share({ files: list, title });
  return true;
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  }
}
