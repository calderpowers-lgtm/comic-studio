// End-to-end smoke test in mock mode: breakdown → sheets → panels → lettering → PNG + PDF.
// Usage: node scripts/sample.js [carousel|pages]
import fs from 'node:fs';
import path from 'node:path';
import { save, load, ROOT } from '../server/store.js';
import { newProject, runBreakdown, startRenderAll, jobs } from '../server/pipeline.js';
import { renderPagePNG, exportPDF } from '../server/render.js';

const format = process.argv[2] || 'carousel';
const script = fs.readFileSync(path.join(ROOT, 'scripts/example-script.txt'), 'utf8');
const p = newProject({ presetId: format === 'pages' ? 'classic-ink-pages' : 'deadpan-carousel', title: 'Neil and the Ocean', script });
p.settings.mode = 'mock';
if (format === 'pages') p.settings.pages = 3;
save(p);
await runBreakdown(p.id);
startRenderAll(p.id);
while (jobs.get(p.id).running) await new Promise((r) => setTimeout(r, 100));
const job = jobs.get(p.id);
if (job.errors.length) console.error(job.errors);
const proj = load(p.id);
const out = path.join(ROOT, 'sample', format);
fs.mkdirSync(out, { recursive: true });
for (let i = 0; i < proj.pages.length; i++) fs.writeFileSync(path.join(out, `${format === 'pages' ? 'page' : 'slide'}-${String(i + 1).padStart(2, '0')}.png`), await renderPagePNG(proj, i, 1));
fs.writeFileSync(path.join(out, `neil-and-the-ocean-${format}.pdf`), await exportPDF(proj, 2));
console.log(`project ${p.id}: ${proj.pages.length} pages, ${proj.characters.length} characters → ${out}`);
