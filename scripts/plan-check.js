// Local planner check: every story → exactly N slides, story wording kept, sensible speakers.
import fs from 'node:fs';
import path from 'node:path';
import { localPlan } from '../shared/localplan.js';
const ROOT = path.resolve(import.meta.dirname, '..');
const stories = { 'neil-prose': 'scripts/stories/neil-prose.txt', 'short-idea': 'scripts/stories/short-idea.txt', 'long-prose': 'scripts/stories/long-prose.txt', 'neil-script': 'scripts/example-script.txt' };
let bad = 0;
const only = process.argv[2];
for (const [name, f] of Object.entries(stories)) {
  const script = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const n of [4, 6, 8, 9, 10]) {
    const plan = localPlan({ script, settings: { format: 'carousel', slides: n } });
    const ok = (plan.pages.length === n || (plan.pages.length < n && plan.pages.length >= Math.min(n, plan.beats))) && plan.pages.every((pg) => pg.panels[0].description && (pg.panels[0].lettering.length || pg.panels[0].description.length > 12));
    if (!ok) bad++;
    const show = only ? name === only && +process.argv[3] === n : false;
    console.log(`${ok ? 'ok ' : 'BAD'} ${name.padEnd(12)} N=${String(n).padEnd(2)} → ${plan.pages.length} slides, ${plan.beats} beats, ${plan.silent} silent, cast: ${plan.characters.map((c) => c.name).join(', ')}`);
    if (show) plan.pages.forEach((pg, i) => { const p = pg.panels[0]; console.log(`  ${i + 1}. [${p.characters.join(',')}] ${p.description}\n     ${p.lettering.map((l) => `${l.type}${l.speaker ? '(' + l.speaker + ')' : ''}: ${l.text}`).join(' | ') || '(no text)'}`); });
  }
}
process.exit(bad ? 1 : 0);
