// iPhone-profile WebKit check of the Finish step text editing (touch taps, 390px screen).
// Usage: node scripts/webkit-text-check.js <url>
import path from 'node:path';
import { webkit, devices } from 'playwright';
const ROOT = path.resolve(import.meta.dirname, '..');
const URL_ = process.argv[2] || 'http://localhost:5191/comic-studio/';
const SI = path.join(ROOT, 'sample/standins');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' · ' + x : ''}`); };
const b = await webkit.launch(); const ctx = await b.newContext({ ...devices['iPhone 15'] }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); page.on('dialog', (d) => d.accept());
const proj = () => page.evaluate(() => JSON.parse(localStorage.getItem('comic-free:project:v1')));
const L = async (i = 0) => (await proj()).pages[i].panels[0].lettering;
const tap = async (loc) => { await loc.scrollIntoViewIfNeeded(); await loc.tap(); await sleep(350); };
const btn = (t) => page.locator('button', { hasText: t }).first();
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('comic-free'); q.onsuccess = q.onerror = q.onblocked = r; }); });
await page.reload({ waitUntil: 'networkidle' });
await tap(btn('Use an example')); await tap(btn('Next: get the ChatGPT prompt')); await tap(btn('Next: add the pictures'));
const fc = page.waitForEvent('filechooser'); await page.locator('label.f-several').tap(); await (await fc).setFiles(['01', '02', '03'].map((k) => path.join(SI, `ChatGPT Image ${k}.png`)));
await sleep(2500); await tap(btn('Next: add text & export')); await sleep(1200);

const tile = page.locator('.f-finish .f-tile').first();
const add = tile.locator('button', { hasText: '+ Narration' });
check('"+ Narration" and "+ Speech" are on every slide without tapping the picture', await page.locator('.f-finish button', { hasText: '+ Narration' }).count() === (await proj()).pages.length && await tile.locator('button', { hasText: '+ Speech' }).count() === 1);
await add.scrollIntoViewIfNeeded(); const bb = await add.boundingBox();
check('"+ Narration" is visible and fits a 390px screen, big enough to tap', bb && bb.x >= 0 && bb.x + bb.width <= 393 && bb.height >= 44, JSON.stringify(bb));
const n0 = (await L()).length;
await tap(add);
check('tapping "+ Narration" adds a narration box', (await L()).length === n0 + 1 && (await L()).at(-1).type === 'caption');
check('the new box text field gets focus (keyboard opens)', await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.placeholder.includes('narration')));
await page.keyboard.type('The tide went out.');
check('typing fills the new narration box', (await L()).at(-1).text === 'The tide went out.');
const ta0 = tile.locator('textarea').first();
await tap(ta0); await ta0.fill('Neil owns a surfboard.');
check('editing an existing box changes it', (await L())[0].text === 'Neil owns a surfboard.');
await tap(tile.locator('button', { hasText: '+ Speech' })); await page.keyboard.type('Hello.');
check('"+ Speech" adds a speech line', (await L()).at(-1).type === 'speech' && (await L()).at(-1).text === 'Hello.');
const nBefore = (await L()).length;
await tap(tile.locator('button[title="Delete this box"]').last());
check('× deletes a box', (await L()).length === nBefore - 1);
const fs16 = await page.evaluate(() => [...document.querySelectorAll('.f-finish textarea, .f-finish select')].every((e) => parseFloat(getComputedStyle(e).fontSize) >= 16));
check('text fields are ≥16px (no iOS zoom on typing)', fs16);
// scrolling: an unselected slide must not block page swipes; a slide with a selected box allows dragging it
const c2 = page.locator('canvas.slide-canvas').nth(1);
check('swiping over a slide scrolls the page (touch-action pan-y)', /pan-y/.test(await c2.evaluate((c) => getComputedStyle(c).touchAction)));
const c1 = page.locator('canvas.slide-canvas').first(); await c1.evaluate((c) => window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 120)); await sleep(300);
const cb = await c1.boundingBox();
const hit = await page.evaluate(() => 0);
// tap on the first box (top of slide) to select, then drag it with pointer events
await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height * 0.08); await sleep(300);
check('tapping a box on the slide selects it (and only then the slide captures drags)', (await c1.evaluate((c) => getComputedStyle(c).touchAction)) === 'none');
const before = (await L())[0].pos;
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height * 0.08); await page.mouse.down(); await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height * 0.5, { steps: 8 }); await page.mouse.up(); await sleep(300);
check('dragging a selected box moves it', JSON.stringify((await L())[0].pos) !== JSON.stringify(before) && (await L())[0].pos?.y > 0.2, JSON.stringify((await L())[0].pos));
await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height * 0.9); await sleep(300);
check('tapping the picture again releases the slide for scrolling', /pan-y/.test(await c1.evaluate((c) => getComputedStyle(c).touchAction)));

check('no page errors', !errs.length, errs.join(' | '));
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
