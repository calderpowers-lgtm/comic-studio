// Node test of grid detection + slicing on the stand-in grids. Writes sliced panels + an overlay image.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { detectGrid, cellsFromLines, slicePanel, bgMask } from '../shared/grid.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const dir = path.join(ROOT, 'sample/standins');
const cases = [
  ['ChatGPT Image grid.jpg', 2, 5, 10],
  ['ChatGPT Image part 1.jpg', 3, 2, 6],
  ['ChatGPT Image part 2.jpg', 2, 2, 4],
  ['ChatGPT Image transposed.jpg', 2, 5, 10], // expects 2×5 but ChatGPT drew 5×2
];
let fail = 0;
for (const [name, rows, cols, n] of cases) {
  const img = await loadImage(fs.readFileSync(path.join(dir, name)));
  const c = createCanvas(img.width, img.height), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  const t0 = performance.now();
  const g = detectGrid(data, img.width, img.height, rows, cols, n);
  const cells = cellsFromLines(data, img.width, img.height, g.xs, g.ys, n, bgMask(data, img.width, img.height), g.xw, g.yw);
  const t1 = performance.now();
  const truth = JSON.parse(fs.readFileSync(path.join(dir, name.replace(/\.\w+$/, '.truth.json')), 'utf8')).cells;
  // each cut must sit inside its true panel and cover most of the 4:5 area available in it
  const res = cells.map((q, i) => {
    const t = truth[i];
    const inside = q.x >= t.x - 1 && q.y >= t.y - 1 && q.x + q.w <= t.x + t.w + 1 && q.y + q.h <= t.y + t.h + 1;
    return { inside, cover: (q.w * q.h) / (t.w * t.h) };
  });
  const ok = g.method === 'detected' && res.every((r) => r.inside && r.cover > 0.9);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${g.method} ${g.rows}x${g.cols} · ${g.note} · min cover ${Math.min(...res.map((r) => r.cover)).toFixed(3)} · all inside ${res.every((r) => r.inside)} · ${(t1 - t0).toFixed(0)}ms`);
  if (!ok) console.log(res, g.xs.map(Math.round), g.ys.map(Math.round));
  // overlay with detected lines (red) + cut boxes (green)
  ctx.lineWidth = 3; ctx.strokeStyle = '#ff2a00';
  for (const x of g.xs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, img.height); ctx.stroke(); }
  for (const y of g.ys) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(img.width, y); ctx.stroke(); }
  ctx.strokeStyle = '#00b050'; ctx.lineWidth = 2;
  for (const q of cells) ctx.strokeRect(q.x, q.y, q.w, q.h);
  const od = path.join(ROOT, 'sample/grid-test'); fs.mkdirSync(od, { recursive: true });
  fs.writeFileSync(path.join(od, name.replace(/\.\w+$/, '') + ' - detected.png'), c.toBuffer('image/png'));
  if (name.endsWith('grid.jpg')) {
    const t2 = performance.now();
    for (let i = 0; i < cells.length; i++) {
      const { px, w, h } = slicePanel(data, img.width, img.height, cells[i]);
      const oc = createCanvas(w, h); const id = oc.getContext('2d').createImageData(w, h); id.data.set(px);
      oc.getContext('2d').putImageData(id, 0, 0);
      fs.writeFileSync(path.join(od, `panel-${String(i + 1).padStart(2, '0')}.png`), oc.toBuffer('image/png'));
    }
    console.log(`  sliced ${cells.length} panels covering 1080x1350 in ${(performance.now() - t2).toFixed(0)}ms; source panel ≈ ${Math.round(cells[0].w)}x${Math.round(cells[0].h)}px → upscaled ×${Math.max(1080 / cells[0].w, 1350 / cells[0].h).toFixed(2)}; 4:5 part ≈ ${Math.round(Math.min(cells[0].w, cells[0].h * 0.8))}x${Math.round(Math.min(cells[0].h, cells[0].w / 0.8))}px`);
  }
}
process.exit(fail ? 1 : 0);
