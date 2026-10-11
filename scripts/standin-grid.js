// Realistic stand-in for ChatGPT's "all panels in one image" output, to stress grid detection:
// cream paper, uneven gutters and margins, jittered panels, some drawn frame lines, white clouds
// touching panel edges, cells that are NOT exactly 4:5, and JPEG artefacts.
// Usage: node scripts/standin-grid.js [rows cols canvasW canvasH outName firstPanel count]
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { localPlan } from '../shared/localplan.js';
import { mockPanel } from '../server/mock.js';
import { getPreset } from '../shared/presets.js';
import { rng } from '../shared/compose.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const [rows = 2, cols = 5, CW = 1536, CH = 1024] = process.argv.slice(2, 6).map(Number);
const outName = process.argv[6] || 'ChatGPT Image grid.jpg';
const first = +(process.argv[7] || 0), count = +(process.argv[8] || rows * cols);
const script = fs.readFileSync(path.join(ROOT, 'scripts/stories/neil-prose.txt'), 'utf8');
const project = { script, settings: { format: 'carousel', slides: 10 }, styleBible: getPreset().styleBible };
const plan = localPlan(project);
project.characters = plan.characters;

const r = rng('grid:' + outName);
const c = createCanvas(CW, CH), ctx = c.getContext('2d');
ctx.fillStyle = '#F4ECD8'; ctx.fillRect(0, 0, CW, CH); // cream paper
// uneven gutters + margins
const mL = 18 + r() * 20, mR = 14 + r() * 24, mT = 22 + r() * 26, mB = 30 + r() * 30;
const gx = Array.from({ length: cols - 1 }, () => 9 + r() * 15);
const gy = Array.from({ length: rows - 1 }, () => 10 + r() * 14);
const cw = (CW - mL - mR - gx.reduce((a, b) => a + b, 0)) / cols, ch = (CH - mT - mB - gy.reduce((a, b) => a + b, 0)) / rows;
const truth = [];
let k = 0;
for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++, k++) {
  if (k >= count) continue;
  const x = mL + j * cw + gx.slice(0, j).reduce((a, b) => a + b, 0) + (r() - 0.5) * 4;
  const y = mT + i * ch + gy.slice(0, i).reduce((a, b) => a + b, 0) + (r() - 0.5) * 4;
  const w = cw + (r() - 0.5) * 4, h = ch + (r() - 0.5) * 4;
  const pg = plan.pages[first + k];
  const img = await loadImage(mockPanel(project, { ...pg.panels[0], id: 'grid' + (first + k) }, Math.round(w * 2), Math.round(h * 2)));
  ctx.drawImage(img, x, y, w, h);
  // a white cloud that touches the top edge of some panels (should not be mistaken for a gutter)
  if (k % 3 === 1) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x + w * 0.7, y + 6, w * 0.22, h * 0.05, 0, 0, 7); ctx.fill(); }
  // ChatGPT often adds a thin hand-drawn frame to some panels
  if (k % 2 === 0) { ctx.strokeStyle = '#151515'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); }
  truth.push({ x, y, w, h });
}
const out = path.join(ROOT, 'sample/standins');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, outName), await c.encode('jpeg', 84));
fs.writeFileSync(path.join(out, outName.replace(/\.\w+$/, '.truth.json')), JSON.stringify({ rows, cols, CW, CH, cells: truth }, null, 1));
console.log(`${outName}: ${rows}x${cols} on ${CW}x${CH}, gutters x=${gx.map((g) => g.toFixed(0))} y=${gy.map((g) => g.toFixed(0))}, cell ${cw.toFixed(0)}x${ch.toFixed(0)}`);
