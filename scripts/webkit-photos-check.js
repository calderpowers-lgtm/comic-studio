// iPhone-profile WebKit end-to-end test of the default "one photo per slide" flow.
// Separate ChatGPT pictures, a mixed HEIC/JPEG set, reorder/replace/remove, a single non-grid photo through the
// grid path (must ask, not cut), a real grid (still auto-cuts), and a "Panel N" script through the UI.
// Usage: [T=ms] node scripts/webkit-photos-check.js <url> [shotsDir]
import fs from 'node:fs';
import path from 'node:path';
import { webkit, devices } from 'playwright';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = path.resolve(import.meta.dirname, '..');
const URL_ = process.argv[2] || 'http://localhost:5191/comic-studio/';
const SHOTS = process.argv[3] || path.join(ROOT, 'sample/ui-photos');
fs.rmSync(SHOTS, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true });
const PH = path.join(ROOT, 'sample/iphone'), SI = path.join(ROOT, 'sample/standins');
const T = +(process.env.T || 90000);
const mime = (f) => (/\.heic$/i.test(f) ? 'image/heic' : /\.png$/i.test(f) ? 'image/png' : 'image/jpeg');
const asFile = (dir, f, type = mime(f)) => ({ name: f, mimeType: type, buffer: fs.readFileSync(path.join(dir, f)) });
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// colour fingerprint (8×8 thumbnail) to check which file landed on which slide
async function printOf(buf) { const im = await loadImage(buf); const c = createCanvas(8, 8); c.getContext('2d').drawImage(im, 0, 0, 8, 8); return [...c.getContext('2d').getImageData(0, 0, 8, 8).data]; }
const dist = (a, b) => a.reduce((s, v, i) => s + (i % 4 === 3 ? 0 : Math.abs(v - b[i])), 0) / (a.length * 0.75);

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 15'] });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
page.on('dialog', (d) => d.accept());
const proj = () => page.evaluate(() => JSON.parse(localStorage.getItem('comic-free:project:v1')));
const imgs = async () => (await proj()).pages.map((pg) => pg.panels[0].img || null);
const nImgs = async () => (await imgs()).filter(Boolean).length;
const tapText = async (t, sel = 'button') => { const el = page.locator(sel, { hasText: t }).first(); await el.scrollIntoViewIfNeeded(); await el.tap(); await sleep(350); };
const waitFor = async (fn, ms = T) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; };
const drawnSlides = () => page.evaluate(() => [...document.querySelectorAll('canvas.slide-canvas')].filter((c) => {
  const d = c.getContext('2d').getImageData(c.width / 2, c.height * 0.6, 1, 1).data; return !(d[0] === 0xec && d[1] === 0xea && d[2] === 0xe4);
}).length);
const openPicker = async (locator) => { const ch = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null); await locator.scrollIntoViewIfNeeded().catch(() => {}); await locator.tap().catch(() => {}); return ch; };
const slide = (n) => page.locator(`.f-tile[data-slide="${n}"]`);
const errorText = async () => (await page.locator('.f-error').allTextContents()).join(' ');
// fingerprint of what's stored for slide i (decoded in the page)
const storedPrint = (i) => page.evaluate(async (i) => {
  const p = JSON.parse(localStorage.getItem('comic-free:project:v1')); const key = p.pages[i].panels[0].img;
  const rec = await new Promise((res, rej) => { const o = indexedDB.open('comic-free'); o.onsuccess = () => { const g = o.result.transaction('images').objectStore('images').get(key); g.onsuccess = () => res(g.result); g.onerror = rej; }; o.onerror = rej; });
  const blob = rec instanceof Blob ? rec : new Blob([rec.buf], { type: rec.type });
  const bm = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = c.height = 8; c.getContext('2d').drawImage(bm, 0, 0, 8, 8);
  return [...c.getContext('2d').getImageData(0, 0, 8, 8).data];
}, i);
const shot = (name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false });

await page.goto(URL_, { waitUntil: 'networkidle' });
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('comic-free'); q.onsuccess = q.onerror = q.onblocked = r; }); });
await page.reload({ waitUntil: 'networkidle' });
await tapText('Use an example');
await tapText('Next: get the ChatGPT prompt');

// ---- prompt step: separate images by default ----
await shot('1-prompt.png');
await tapText('See prompt');
const prompt = await page.locator('pre.f-pre').first().textContent();
const N = (await proj()).pages.length;
check('prompt: default asks for separate images, one per reply, "next"', /SEPARATE images/.test(prompt) && /reply "next"/.test(prompt) && /Draw PANEL 1 now/.test(prompt) && !/grid/i.test(prompt.replace(/never make a grid/i, '')), `${N} panels, ${prompt.length} chars`);
check('prompt: one big copy button + "copy all panel prompts" + grid as secondary', await page.locator('button', { hasText: 'Copy ChatGPT prompt' }).count() === 1 && await page.locator('button', { hasText: 'Copy all panel prompts' }).count() === 1 && await page.locator('button', { hasText: 'Use the grid prompt' }).count() === 1);
await tapText('Next: add the pictures');

// ---- upload step: per-slide cards ----
const cards = await page.locator('label.f-addphoto').count();
check(`upload: default shows ${N} slide cards with "Add photo"`, cards === N, `${cards} cards`);
await shot('2-empty-slides.png');
// A) one separate photo on slide 1 via its own card
let fc = await openPicker(slide(1).locator('label.f-addphoto'));
check('upload: tapping slide 1 "Add photo" opens the picker (single, images + HEIC)', !!fc && !fc.isMultiple() && /image\/\*.*heic/.test(await fc.element().getAttribute('accept')));
if (fc) await fc.setFiles([asFile(SI, 'ChatGPT Image 01.png')]);
check('upload: slide 1 gets the photo', await waitFor(async () => (await imgs())[0]));
// B) several separate photos at once fill the empty slides in order
fc = await openPicker(page.locator('label.f-several'));
check('upload: "Add several photos" opens a multi-select picker', !!fc && fc.isMultiple());
const sep = ['ChatGPT Image 02.png', 'ChatGPT Image 03.png', 'ChatGPT Image 04.png', 'ChatGPT Image 05.png'];
if (fc) await fc.setFiles(sep.map((f) => asFile(SI, f)));
check('upload: 4 separate photos fill slides 2–5', await waitFor(async () => (await nImgs()) === 5), `${await nImgs()} filled`);
const prints = await Promise.all(['01', '02', '03', '04', '05'].map((k) => printOf(fs.readFileSync(path.join(SI, `ChatGPT Image ${k}.png`)))));
let order = true; for (let i = 0; i < 5; i++) { const sp = await storedPrint(i); const best = prints.map((p) => dist(p, sp)).reduce((b, d, j, a) => (d < a[b] ? j : b), 0); if (best !== i) order = false; }
check('upload: photos landed in the order they were picked (1→5)', order);
// C) mixed HEIC/JPEG set from the iPhone camera roll
const mixed = ['IMG_1001.HEIC', 'IMG_1002.JPG', 'IMG_1003.JPG', 'IMG_1004.HEIC', 'IMG_1005.JPG'];
fc = await openPicker(page.locator('label.f-several'));
const t0 = Date.now();
if (fc) await fc.setFiles(mixed.map((f, i) => asFile(PH, f, i === 2 ? '' : mime(f))));
check(`upload: mixed HEIC/JPEG set (2 HEIC 3024×4032, 12/48MP JPEG, one with no file type) fills slides 6–${N}`, await waitFor(async () => (await nImgs()) === Math.min(N, 10)), `${await nImgs()}/${N} in ${((Date.now() - t0) / 1000).toFixed(1)}s ${await errorText()}`);
check('upload: every slide shows its picture', await waitFor(async () => (await drawnSlides()) === N, 15000), `${await drawnSlides()} drawn`);
await page.locator('.f-slots').scrollIntoViewIfNeeded(); await shot('3-all-slides.png');
// D) reorder, replace, remove + re-add
let before = await imgs();
await slide(1).locator('button[title^="Move this picture one slide later"]').tap(); await sleep(300);
let after = await imgs();
check('reorder: → swaps slides 1 and 2', after[0] === before[1] && after[1] === before[0]);
before = after;
fc = await openPicker(slide(3).locator('label', { hasText: 'Replace' }));
if (fc) await fc.setFiles([asFile(PH, 'IMG_1006.JPG')]);
check('replace: slide 3 gets a new photo, others unchanged', await waitFor(async () => { const a = await imgs(); return a[2] && a[2] !== before[2] && a[0] === before[0] && a[3] === before[3]; }));
await slide(4).locator('button[title="Remove picture"]').tap(); await sleep(300);
check('remove: slide 4 is empty again and shows "Add photo"', !(await imgs())[3] && await slide(4).locator('label.f-addphoto').count() === 1);
fc = await openPicker(slide(4).locator('label.f-addphoto'));
if (fc) await fc.setFiles([asFile(PH, 'IMG_1007.HEIC')]);
check('re-add: slide 4 takes a HEIC photo', await waitFor(async () => (await imgs())[3]));
// E) a single non-grid picture through "Cut up one grid picture": must ask, not slice
await slide(7).locator('button[title="Remove picture"]').tap(); await sleep(300);
before = await imgs();
await tapText('Cut up one grid picture');
fc = await openPicker(page.locator('.f-drop').first());
if (fc) await fc.setFiles([asFile(PH, 'single picture 1024x1536.png')]);
const asked = await waitFor(async () => (await page.locator('.f-status.warn', { hasText: 'one picture' }).count()) > 0, 30000);
check('non-grid photo: app asks instead of cutting it into strips', asked, (await page.locator('.f-status').allTextContents()).join(' '));
check('non-grid photo: nothing was sliced onto the slides', JSON.stringify(await imgs()) === JSON.stringify(before));
await shot('4-ask-one-picture.png');
await tapText('Use it for slide 7 only');
after = await imgs();
check('non-grid photo: "use it for slide 7" puts the whole picture on slide 7 only', after[6] && after.every((k, i) => i === 6 || k === before[i]) && (await proj()).imageMode === 'separate');
check('non-grid photo: back on the slide cards, all slides drawn', await waitFor(async () => (await drawnSlides()) === N, 15000));
// F) a real grid picture still auto-cuts
await tapText('Cut up one grid picture');
fc = await openPicker(page.locator('.f-drop').first());
if (fc) await fc.setFiles([asFile(PH, 'IMG_0101.HEIC')]);
check('real grid (HEIC): still detected and cut into slides automatically', await waitFor(async () => (await page.locator('.f-status.ok').count()) > 0 && (await page.locator('.f-status').textContent()).match(/Found/)), (await page.locator('.f-status').allTextContents()).join(' '));
await tapText('Back to one photo per slide');
// G) export page renders
await tapText('Next: add text & export');
check('finish: all slides render with text', await waitFor(async () => (await drawnSlides()) >= N, 20000));

// ---- H) Panel-N script with camera directions, through the UI ----
await page.locator('button', { hasText: 'New comic' }).tap(); await sleep(500);
await page.locator('textarea').first().fill(fs.readFileSync(path.join(ROOT, 'scripts/stories/dog-panels.txt'), 'utf8'));
await tapText('Next: get the ChatGPT prompt');
const pj = await proj();
const P = pj.pages.map((pg) => pg.panels[0]);
const letters = P.flatMap((x) => x.lettering.map((l) => l.text));
check('planner (UI): "Panel 1–8" script → 8 slides', P.length === 8, `${P.length}`);
check('planner (UI): no stage/camera directions in the lettering', !letters.some((t) => /panel \d|frame focuses|following afternoon|same dirt road|close-?up|wide shot/i.test(t)), letters.join(' / '));
check('planner (UI): directions are in the picture descriptions', /grains of sand/.test(P[1].description) && /following afternoon.*exhausted/i.test(P[5].description));
check('planner (UI): no empty slides', P.every((x) => x.description.length > 12));
await tapText('See prompt');
const p2 = await page.locator('pre.f-pre').first().textContent();
check('planner (UI): prompt lists 8 panels, the dog drawn as a brown pit bull', /PANEL 8:/.test(p2) && !/PANEL 9:/.test(p2) && /Brown pit bull \(an animal/.test(p2));
await tapText('Story', 'nav button'); await sleep(300);
check('story step says the slides come from the Panel markers', (await page.locator('.f-planline').textContent()).includes('one per "Panel"'));

check('no page errors', !errs.length, errs.slice(0, 3).join(' || '));
await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
