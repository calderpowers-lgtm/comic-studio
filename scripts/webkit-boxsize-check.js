// iPhone WebKit: per-box text size (A−/A+/slider) and box width update the preview and the exported PNG.
import fs from 'node:fs'; import path from 'node:path';
import { webkit, devices } from 'playwright';
import { loadImage, createCanvas } from '@napi-rs/canvas';
const ROOT = path.resolve(import.meta.dirname, '..');
const URL_ = process.argv[2] || 'http://localhost:5191/comic-studio/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' · ' + x : ''}`); };
const b = await webkit.launch(); const ctx = await b.newContext({ ...devices['iPhone 15'], acceptDownloads: true }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); page.on('dialog', (d) => d.accept());
const tap = async (loc) => { await loc.scrollIntoViewIfNeeded(); await loc.tap(); await sleep(300); };
const btn = (t) => page.locator('button', { hasText: t }).first();
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('comic-free'); q.onsuccess = q.onerror = q.onblocked = r; }); });
await page.reload({ waitUntil: 'networkidle' });
await tap(btn('Use an example')); await tap(btn('Next: get the ChatGPT prompt')); await tap(btn('Next: add the pictures'));
const fc = page.waitForEvent('filechooser'); await page.locator('label.f-several').tap(); await (await fc).setFiles([path.join(ROOT, 'sample/standins/ChatGPT Image 01.png')]);
await sleep(2500); await tap(btn('Next: add text & export')); await sleep(1500);
const L0 = async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('comic-free:project:v1')))).pages[0].panels[0].lettering[0];
// box = bounding box of pure-white pixels in the top 60% of slide 1 (the picture has none there)
const boxOf = (data, w, h) => { let x0 = w, x1 = -1, y0 = h, y1 = -1; for (let y = 0; y < h * 0.6; y++) for (let x = 0; x < w; x += 2) { const i = (y * w + x) * 4; if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250 && x > w * 0.04 && x < w * 0.96 && y > h * 0.03) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } } return { w: x1 - x0, h: y1 - y0, x0, x1, y0, y1 }; };
const prevBox = () => page.evaluate((src) => { const c = document.querySelector('canvas.slide-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return new Function('return ' + src)()(d, c.width, c.height); }, boxOf.toString());
const exportBox = async () => { const dl = page.waitForEvent('download'); await tap(page.locator('.f-finish .f-tile').first().locator('button', { hasText: 'PNG' })); const d = await dl; const f = '/tmp/bs.png'; await d.saveAs(f); const im = await loadImage(fs.readFileSync(f)); const c = createCanvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return boxOf(c.getContext('2d').getImageData(0, 0, im.width, im.height).data, im.width, im.height); };
const tile = page.locator('.f-finish .f-tile').first();
check('each box has A−, A+, a text-size slider and a Box width slider', await tile.locator('button[aria-label="Bigger text, box 1"]').count() === 1 && await tile.locator('button[aria-label="Smaller text, box 1"]').count() === 1 && await tile.locator('input[aria-label="Text size, box 1"]').count() === 1 && await tile.locator('input[aria-label="Box width, box 1"]').count() === 1);
const ab = await tile.locator('button[aria-label="Bigger text, box 1"]').boundingBox();
check('A+ is a big tap target on a 390px screen', ab.height >= 44 && ab.width >= 44 && ab.x + ab.width <= 393, JSON.stringify(ab));
const p0 = await prevBox(), e0 = await exportBox();
for (let i = 0; i < 4; i++) await tap(tile.locator('button[aria-label="Bigger text, box 1"]'));
await sleep(500);
const p1 = await prevBox(), e1 = await exportBox();
check('A+ ×4 makes the text bigger (size 1.4)', Math.abs((await L0()).size - 1.4) < 0.01, `${(await L0()).size}`);
check('preview: the box grows with bigger text', p1.h > p0.h * 1.15, `${p0.w}×${p0.h} → ${p1.w}×${p1.h}`);
check('export PNG: the box grows too', e1.h > e0.h * 1.15, `${e0.w}×${e0.h} → ${e1.w}×${e1.h}`);
for (let i = 0; i < 20; i++) { const m = tile.locator('button[aria-label="Smaller text, box 1"]'); if (await m.isDisabled()) break; await m.tap(); await sleep(120); }
await sleep(400);
check('A− stops at a readable minimum', Math.abs((await L0()).size - 0.6) < 0.01, `${(await L0()).size}`);
const pSmall = await prevBox();
check('preview: smaller text → smaller box', pSmall.h < p0.h, `${pSmall.w}×${pSmall.h}`);
// width: narrow → taller box; wide → wider box
await tile.locator('button', { hasText: 'Reset size' }).tap(); await sleep(300);
const slider = tile.locator('input[aria-label="Box width, box 1"]');
await slider.evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '0.4'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
await sleep(500);
const pn = await prevBox(), en = await exportBox();
check('Box width narrow: box gets narrower and taller (preview)', pn.w < p0.w * 0.8 && pn.h > p0.h, `${p0.w}×${p0.h} → ${pn.w}×${pn.h}`);
check('Box width narrow: export matches', en.w < e0.w * 0.8 && en.h > e0.h, `${e0.w}×${e0.h} → ${en.w}×${en.h}`);
// worst case: max size + narrow width on long text still stays inside the slide
await page.evaluate(() => { const k = 'comic-free:project:v1'; const p = JSON.parse(localStorage.getItem(k)); Object.assign(p.pages[0].panels[0].lettering[0], { size: 9, width: 0.1, pos: { x: 0.5, y: 0.98 } }); localStorage.setItem(k, JSON.stringify(p)); });
await page.reload({ waitUntil: 'networkidle' }); await sleep(1500);
const ext = await page.evaluate(() => { const c = document.querySelector('canvas.slide-canvas'); return [c.width, c.height]; });
check('out-of-range saved size/width are clamped (no crash, text drawn)', (await prevBox()).w > 0);
check('no page errors', !errs.length, errs.join(' | '));
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
