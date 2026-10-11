// Planner check for scripts with "Panel N" markers and camera/scene directions.
import fs from 'node:fs';
import path from 'node:path';
import { localPlan, isDirection } from '../shared/localplan.js';
const ROOT = path.resolve(import.meta.dirname, '..');
let bad = 0;
const check = (name, ok, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const STAGE = /panel \d|the frame|frame focuses|close-?up|wide shot|following afternoon|same dirt road|lying against a wall|grains of sand/i;
for (const [file, n, expectN] of [['dog-panels.txt', 10, 8], ['dog-panels.txt', 4, 8], ['dog-directions.txt', 6, 6], ['dog-directions.txt', 10, 6]]) {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/stories', file), 'utf8');
  const plan = localPlan({ script, settings: { format: 'carousel', slides: n } });
  const P = plan.pages.map((pg) => pg.panels[0]);
  const letters = P.flatMap((x) => x.lettering.map((l) => l.text));
  console.log(`\n${file} (picked ${n} slides) → ${P.length} slides${plan.panelMode ? ' (Panel markers)' : ''}`);
  P.forEach((x, i) => console.log(`  ${i + 1}. PICTURE: ${x.description}\n     TEXT: ${x.lettering.map((l) => `${l.type}${l.speaker ? '(' + l.speaker + ')' : ''} "${l.text}"`).join(' | ') || '—'}`));
  check(`${file}: ${expectN} slides`, P.length === expectN);
  check(`${file}: no stage/camera directions in the lettering`, !letters.some((t) => STAGE.test(t)), letters.filter((t) => STAGE.test(t)).join(' / '));
  check(`${file}: every slide has a real picture description`, P.every((x) => x.description && x.description.length > 12 && !/^A quiet moment/.test(x.description)));
  check(`${file}: captions and dialogue are lettered`, letters.some((t) => /forty years/.test(t)) && letters.some((t) => /Long day/.test(t)) && letters.some((t) => /WOOF/.test(t)));
  if (file === 'dog-panels.txt') {
    check(`${file}: panel 6 direction went into the picture`, /following afternoon.*same dirt road.*exhausted/i.test(P[5].description) && P[5].lettering.length === 0);
    check(`${file}: "Morning" became Walter's speech`, P[3].lettering.some((l) => l.speaker === 'walter' && /Morning/.test(l.text)));
    check(`${file}: slides 1 and 2 have content`, P[0].lettering.length > 0 && /grains of sand/.test(P[1].description));
  }
}
check('direction detector', isDirection('The frame focuses on countless grains of sand collecting around his toes.') && isDirection('The following afternoon.') && !isDirection('Neil is 52 and has owned a surfboard for eleven years.'));
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
