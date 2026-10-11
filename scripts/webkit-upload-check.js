// iPhone-profile WebKit test of photo uploads: real HEIC, 14MP/12MP/48MP JPEG, 1024×1536 PNG.
// Covers the grid upload ("+ Add the picture") and the older multi-photo "Add pictures".
// Taps the visible upload targets, so the native file chooser must open.
// Usage: [T=ms] node scripts/webkit-upload-check.js <url> [shotsDir]
import fs from 'node:fs';
import path from 'node:path';
import { webkit, devices } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const URL_ = process.argv[2] || 'http://localhost:5191/comic-studio/';
const SHOTS = process.argv[3] || path.join(ROOT, 'sample/ui-grid/webkit');
fs.rmSync(SHOTS, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true });
const PH = path.join(ROOT, 'sample/iphone');
const T = +(process.env.T || 90000);
const mime = (f) => (/\.heic$/i.test(f) ? 'image/heic' : /\.png$/i.test(f) ? 'image/png' : 'image/jpeg');
const asFile = (f, type = mime(f)) => ({ name: f, mimeType: type, buffer: fs.readFileSync(path.join(PH, f)) });
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 15'] });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
page.on('dialog', (d) => d.accept());
const proj = () => page.evaluate(() => JSON.parse(localStorage.getItem('comic-free:project:v1')));
const nImgs = async () => (await proj()).pages.filter((pg) => pg.panels[0].img).length;
const tapText = async (t, sel = 'button, a, label') => { const el = page.locator(sel, { hasText: t }).first(); await el.scrollIntoViewIfNeeded(); await el.tap(); await sleep(300); };
const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; };
const statusText = async () => ((await page.locator('.f-drop b, .f-status, .f-error').allTextContents().catch(() => [])).join(' | ')).trim();
// slide canvases that show real pixels (not the grey "picture goes here" placeholder)
const drawnSlides = () => page.evaluate(() => [...document.querySelectorAll('canvas.slide-canvas')].filter((c) => {
  const d = c.getContext('2d').getImageData(c.width / 2, c.height * 0.6, 1, 1).data; return !(d[0] === 0xec && d[1] === 0xea && d[2] === 0xe4);
}).length);
const openPicker = async (locator) => { const ch = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null); await locator.scrollIntoViewIfNeeded().catch(() => {}); await locator.tap().catch(() => {}); return ch; };

await page.goto(URL_, { waitUntil: 'networkidle' });
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('comic-free'); q.onsuccess = q.onerror = q.onblocked = r; }); });
await page.reload({ waitUntil: 'networkidle' });
await tapText('Use an example', 'button');
await tapText('Next: get the ChatGPT prompt', 'button');
await tapText('Use the grid prompt', 'button');
await tapText('Next: upload the picture', 'button');

// ---- A) grid upload ----
const gridCases = [
  ['IMG_0101.HEIC', /Found the 2 × 5/, 'grid: real HEIC (1536×1024) is read, detected and cut into 10 slides'],
  ['IMG_0102.JPG', /Found the 2 × 5/, 'grid: 14MP JPEG (4608×3072) is downscaled, detected and cut'],
  ['ChatGPT grid 1024x1536.png', /5 × 2 instead of 2 × 5/, 'grid: 1024×1536 PNG (ChatGPT drew 5 × 2) is detected and cut'],
  ['single picture 1024x1536.png', /one picture/, 'grid: a picture with no grid never hangs, and the app asks before cutting it'],
];
for (const [i, [f, want, label]] of gridCases.entries()) {
  const t0 = Date.now();
  const fc = await openPicker(i === 0 ? page.locator('.f-drop').first() : page.locator('label', { hasText: 'Choose another' }).first());
  if (i === 0) {
    check('grid: tapping "+ Add the picture" opens the photo picker', !!fc);
    if (fc) check('grid: picker accepts images incl. HEIC', /image\/\*/.test(await fc.element().getAttribute('accept')), await fc.element().getAttribute('accept'));
  }
  if (!fc) { check(label + ' (picker did not open)', false); continue; }
  await fc.setFiles(asFile(f));
  await sleep(500);
  const ok = await waitFor(async () => want.test(await statusText()) && !(await page.locator('.f-drop.busy').count()) && !/Cutting|Opening|Finding/.test(await statusText()) && ((await nImgs()) === 10 || /one picture/.test(await statusText())), T);
  check(label, ok, `${await statusText()} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (i === 0) { await sleep(1500); const n = await drawnSlides(); check('grid: the slides actually show the cut pictures', n >= 10, `${n} drawn`); }
  await page.screenshot({ path: path.join(SHOTS, `A${i + 1}-${f.replace(/\W+/g, '-')}.png`) });
}

// ---- B) older flow: "Add pictures" with 10 iPhone photos at once ----
await page.evaluate(() => { const k = 'comic-free:project:v1'; const p = JSON.parse(localStorage.getItem(k)); p.pages.forEach((pg) => { pg.panels[0].img = null; }); p.view = 'upload'; p.imageMode = 'separate'; localStorage.setItem(k, JSON.stringify(p)); });
await page.reload({ waitUntil: 'networkidle' });
let fc = await openPicker(page.locator('label.f-several'));
check('add pictures: tapping the upload area opens the photo picker', !!fc);
if (fc) {
  check('add pictures: picker allows several photos', fc.isMultiple());
  const files = fs.readdirSync(PH).filter((f) => /^IMG_10/.test(f)).sort();
  // one HEIC arrives with no MIME type at all, as iOS sometimes does
  await fc.setFiles(files.map((f, i) => asFile(f, i === 3 ? '' : mime(f))));
  const ok = await waitFor(async () => (await nImgs()) === 10, T + 60000);
  check('add pictures: 10 iPhone photos (4 HEIC, 3×12MP, 3×48MP JPEG) all land on slides', ok, `${await nImgs()}/10`);
  await sleep(2500);
  const n = await drawnSlides();
  check('add pictures: all 10 slides actually show their photo', n >= 10, `${n} drawn`);
  await page.screenshot({ path: path.join(SHOTS, 'B-add-pictures.png') });
  const sizes = await page.evaluate(async () => {
    const p = JSON.parse(localStorage.getItem('comic-free:project:v1'));
    const db = await new Promise((r) => { const q = indexedDB.open('comic-free'); q.onsuccess = () => r(q.result); });
    const get = (k) => new Promise((r) => { const q = db.transaction('images').objectStore('images').get(k); q.onsuccess = () => r(q.result); });
    const out = [];
    for (const pg of p.pages) { const b = pg.panels[0].img && (await get(pg.panels[0].img)); if (b) { const bm = await createImageBitmap(b instanceof Blob ? b : new Blob([b.buf], { type: b.type })); out.push(`${bm.width}x${bm.height}`); } }
    return out;
  });
  check('add pictures: photos are downscaled on load (long side ≤ 2160)', sizes.length === 10 && sizes.every((s) => Math.max(...s.split('x').map(Number)) <= 2160), sizes.join(' '));
}
// a file that isn't a picture gives a clear message
await page.evaluate(() => { const k = 'comic-free:project:v1'; const p = JSON.parse(localStorage.getItem(k)); p.pages[0].panels[0].img = null; localStorage.setItem(k, JSON.stringify(p)); });
await page.reload({ waitUntil: 'networkidle' });
fc = await openPicker(page.locator('label.f-several'));
if (fc) {
  await fc.setFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 not an image') });
  const msg = await waitFor(async () => /isn't a picture|couldn.t open/i.test(await page.locator('body').innerText()), 15000);
  check('a file that is not a picture gives a clear message', msg);
  await page.screenshot({ path: path.join(SHOTS, 'C-not-a-picture.png') });
}
check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
