// Stand-in "ChatGPT output" images for testing the free flow: 1024×1536 portrait, no text, no borders.
import fs from 'node:fs';
import path from 'node:path';
import { localPlan } from '../shared/localplan.js';
import { mockPanel } from '../server/mock.js';
import { getPreset } from '../shared/presets.js';
import { ROOT } from '../server/store.js';

const script = fs.readFileSync(path.join(ROOT, 'scripts/example-script.txt'), 'utf8');
const project = { script, settings: { format: 'carousel', slides: 10 }, styleBible: getPreset().styleBible };
const plan = localPlan(project);
project.characters = plan.characters;
const out = path.join(ROOT, 'sample/standins');
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now() - 3600e3;
plan.pages.forEach((pg, i) => {
  const f = path.join(out, `ChatGPT Image ${String(i + 1).padStart(2, '0')}.png`);
  fs.writeFileSync(f, mockPanel(project, { ...pg.panels[0], id: 'standin' + i }, 1024, 1536));
  const t = new Date(t0 + i * 60e3); fs.utimesSync(f, t, t); // oldest first = slide order
});
console.log(`${plan.pages.length} stand-ins → ${out}`);
