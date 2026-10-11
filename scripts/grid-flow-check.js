// End-to-end test of the "one prompt, one upload" flow on the static build, phone-size (390px wide).
// Usage: node scripts/grid-flow-check.js <url>   (screenshots → sample/ui-grid/)
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { loadImage } from '@napi-rs/canvas';

const ROOT = path.resolve(import.meta.dirname, '..');
const URL_ = process.argv[2] || 'http://localhost:5191/comic-studio/';
const SHOTS = path.join(ROOT, 'sample/ui-grid');
const DL = path.join(SHOTS, 'downloads');
fs.rmSync(SHOTS, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
const STAND = path.join(ROOT, 'sample/standins');
const results = [];
const check = (name, ok, extra = '') => { results.push([ok, name]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(new URL(URL_).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
const reqs = [], errs = [];
page.on('request', (r) => reqs.push(r.url()));
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const click = async (text, sel = 'button, a, label') => {
  const ok = await page.evaluate((t, s) => { const b = [...document.querySelectorAll(s)].find((x) => x.textContent.trim().includes(t) && !x.disabled); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); return true; } return false; }, text, sel);
  if (!ok) throw new Error('No button: ' + text);
  await sleep(250);
};
const shot = async (name, full = false) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full });
const proj = () => page.evaluate(() => JSON.parse(localStorage.getItem('comic-free:project:v1')));
const clip = () => page.evaluate(() => navigator.clipboard.readText());
const waitFor = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(200); } return false; };
const waitDownload = async (re, ms = 20000) => { let f; await waitFor(() => (f = fs.readdirSync(DL).find((x) => re.test(x) && !x.endsWith('.crdownload'))), ms); return f && path.join(DL, f); };

await page.goto(URL_, { waitUntil: 'networkidle0' });
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('comic-free'); q.onsuccess = q.onerror = q.onblocked = r; }); });
await page.reload({ waitUntil: 'networkidle0' });

// 1. Story
await shot('1-story-empty');
await click('Use an example');
await click('10', '.f-chip');
const p0 = await proj();
check('story: example pasted, 10 slides chosen', p0.script.includes('surfboard') && p0.settings.slides === 10);
await page.evaluate(() => window.scrollTo(0, 0));
await shot('1-story', true);

// Edit slides (optional) → instant local plan
await click('Edit slides (optional)');
const p1 = await proj();
const sp = p1.pages.map((pg) => pg.panels[0]);
check('plan: 10 slides, made instantly, no ChatGPT round trip', p1.pages.length === 10 && p1.view === 'edit');
check('plan: dialogue became speech with the right speakers', sp.some((x) => x.lettering.some((l) => l.type === 'speech' && l.speaker === 'donna' && /ankle high/.test(l.text))) && sp.some((x) => x.lettering.some((l) => l.speaker === 'neil' && /aggressive/.test(l.text))));
check('plan: narration taken from the story', sp[0].lettering[0]?.text.startsWith('Neil is 52'));
await shot('2-edit-slides');
await click('Done: get the ChatGPT prompt');

// 2. Prompt
await sleep(300);
await shot('3-prompt');
await shot('3-prompt-full', true);
await click('Copy ChatGPT prompt');
const prompt = await clip();
fs.writeFileSync(path.join(SHOTS, 'prompt-1-image.txt'), prompt);
check('prompt: one image, 2 rows × 5 columns, landscape', /ONE WIDE landscape image/.test(prompt) && /2 rows × 5 columns = 10 panels/.test(prompt));
check('prompt: same 4:5 shape, white gutters, reading order', /SAME tall portrait shape \(4:5/.test(prompt) && /WHITE gutters/.test(prompt) && /Panel 1 is top-left/.test(prompt));
check('prompt: no text/bubbles/numbers, top quarter simple, same characters', /NO text at all/.test(prompt) && /Do NOT draw panel numbers/.test(prompt) && /TOP QUARTER/.test(prompt) && /IDENTICAL in every panel/.test(prompt));
check('prompt: style bible + all 10 panel descriptions', /Thick \(≈1% of image width\)/.test(prompt) && (prompt.match(/^PANEL \d+ /gm) || []).length === 10, `${prompt.length} chars`);
await click('Share style images');
const zipF = await waitDownload(/style-images\.zip$/);
const z = zipF ? Object.keys(unzipSync(fs.readFileSync(zipF))) : [];
check('share style images: falls back to a download of the 4 images', z.length === 4, z.join(','));

// split option (2 pictures)
await click('Sharper pictures');
await sleep(300);
await sleep(2200); const twoBtns = await page.$$eval('button.f-huge', (b) => b.length);
await click('Copy prompt for picture 2 of 2');
const p2txt = await clip();
fs.writeFileSync(path.join(SHOTS, 'prompt-2-images-part2.txt'), p2txt);
check('split option: 2 prompts (6 + 4), second is short and continues the chat', twoBtns === 2 && /IMAGE 2 of 2, panels 7–10/.test(p2txt) && p2txt.length < 2000, `buttons ${twoBtns}, ${p2txt.length} chars`);
await shot('3b-prompt-two-pictures');
await click('Sharper pictures'); // back to one picture

// 3. Upload one picture
await click('Next: upload the picture');
await shot('4-upload');
const input = await page.$('input[type=file]');
await input.uploadFile(path.join(STAND, 'ChatGPT Image grid.jpg'));
await waitFor(async () => (await proj()).pages.filter((pg) => pg.panels[0].img).length === 10 && !(await page.$eval('.f-status', (e) => /Cutting|Finding/.test(e.textContent)).catch(() => true)));
await sleep(600);
const p3 = await proj();
const status = await page.$eval('.f-status', (e) => e.textContent);
check('upload: grid detected on cream paper with uneven gutters', p3.grid.sheets[0].method === 'detected' && /Found the 2 × 5 grid/.test(status), status);
check('upload: 10 panels sliced onto 10 slides', p3.pages.every((pg) => pg.panels[0].img));
await page.evaluate(() => window.scrollTo(0, 0));
await shot('5-detected');
// drag a cut line: move the 3rd vertical line 25 screen px right, check re-slice uses it
const before = p3.grid.sheets[0].xs[2];
const box = await page.$eval('.f-lines', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const sh = p3.grid.sheets[0];
const sx = box.x + (sh.xs[2] / sh.w) * box.w, sy = box.y + (((sh.ys[0] + sh.ys.at(-1)) / 2) / sh.h) * box.h;
await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 12, sy, { steps: 4 }); await page.mouse.move(sx + 25, sy, { steps: 4 });
await shot('5b-dragging-line');
await page.mouse.up();
await waitFor(async () => (await proj()).grid.sheets[0].method === 'manual');
await waitFor(async () => /Using your lines/.test(await page.$eval('.f-status', (e) => e.textContent)));
const p4 = await proj();
check('drag-adjust: a red line can be dragged and the panels are re-cut', p4.grid.sheets[0].xs[2] > before + 20 && /Using your lines/.test(await page.$eval('.f-status', (e) => e.textContent)), `${before.toFixed(0)} → ${p4.grid.sheets[0].xs[2].toFixed(0)}`);
await click('Wrong number of rows or columns?');
await click('Detect again');
await waitFor(async () => (await proj()).grid.sheets[0].method === 'detected');
await sleep(1500);
check('detect again restores the found lines', Math.abs((await proj()).grid.sheets[0].xs[2] - before) < 1);
await click('Hide');
await page.evaluate(() => document.querySelector('.f-grid-phone').scrollIntoView());
await sleep(500);
await shot('6-sliced-slides');

// transposed grid (ChatGPT drew 5 × 2 instead of 2 × 5)
await page.evaluate(() => window.scrollTo(0, 0));
const input2 = await page.$('input[type=file]');
await input2.uploadFile(path.join(STAND, 'ChatGPT Image transposed.jpg'));
await waitFor(async () => /instead/.test(await page.$eval('.f-status', (e) => e.textContent).catch(() => '')));
await sleep(2500);
const st2 = await page.$eval('.f-status', (e) => e.textContent);
check('robustness: a 5 × 2 picture is recognised when 2 × 5 was asked', /5 × 2 instead of 2 × 5/.test(st2), st2);
await shot('5c-transposed');
// back to the real grid for the export
await input2.uploadFile(path.join(STAND, 'ChatGPT Image grid.jpg'));
await waitFor(async () => /Found the 2 × 5/.test(await page.$eval('.f-status', (e) => e.textContent).catch(() => '')));
await sleep(2500);

// 4. Text & export
await click('Next: add text & export');
await sleep(800);
await shot('7-text-and-export');
// edit the first box on slide 1
const cv = await page.$('.f-finish .slide-canvas');
const cb = await cv.boundingBox();
await page.mouse.click(cb.x + cb.width * 0.5, cb.y + cb.height * 0.12);
await sleep(300);
const ta = await page.$('.f-editor textarea');
check('lettering: tapping a wavy box opens the text editor', !!ta);
if (ta) { await ta.focus(); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await ta.type('Neil, 52, has owned a surfboard for eleven whole years.'); }
await sleep(400);
await shot('7b-editing-text');
await click('Download PDF');
const pdfF = await waitDownload(/\.pdf$/, 60000);
await click('Download PNG slides');
const zF = await waitDownload(/-slides\.zip$/, 60000);
const pdf = pdfF && (await PDFDocument.load(fs.readFileSync(pdfF)));
const pz = pdf?.getPage(0).getSize();
check('export: PDF has 10 pages at 4:5', pdf?.getPageCount() === 10 && pz.width === 540 && pz.height === 675, pdfF && path.basename(pdfF));
const files = zF ? unzipSync(fs.readFileSync(zF)) : {};
const names = Object.keys(files).sort();
const img = names.length ? await loadImage(Buffer.from(files[names[0]])) : null;
check('export: zip has 10 PNG slides at 1080×1350', names.length === 10 && img?.width === 1080 && img?.height === 1350, names[0]);
for (const n of names) fs.writeFileSync(path.join(DL, n), files[n]);
const p5 = await proj();
check('lettering edit kept', p5.pages[0].panels[0].lettering.some((l) => /eleven whole years/.test(l.text)));

// older flow still reachable
await click('Prompt', '.f-steps button');
await click('Use the slide-by-slide way');
const legacy = await page.evaluate(() => document.body.innerText.includes('Draw the pictures in ChatGPT'));
check('older per-slide flow still available as a secondary option', legacy);
await click('Switch to one picture for all slides');

// split flow end to end: two uploads fill 10 slides
await click('Sharper pictures');
await click('Next: upload the picture');
const ins = await page.$$('input[type=file]');
await ins[0].uploadFile(path.join(STAND, 'ChatGPT Image part 1.jpg'));
await waitFor(async () => (await proj()).grid.sheets?.[0]?.method === 'detected');
await sleep(2500);
const ins2 = await page.$$('input[type=file]');
await ins2[1].uploadFile(path.join(STAND, 'ChatGPT Image part 2.jpg'));
await waitFor(async () => (await proj()).grid.sheets?.[1]?.method === 'detected');
await sleep(2500);
const p6 = await proj();
check('split flow: 2 uploads (3×2 + 2×2) fill all 10 slides', p6.grid.sheets.length === 2 && p6.pages.every((pg) => pg.panels[0].img));
await shot('8-two-pictures', true);

const external = reqs.filter((u) => !u.startsWith(new URL(URL_).origin) && !u.startsWith('blob:') && !u.startsWith('data:'));
check('privacy: no external or API requests', external.length === 0 && !reqs.some((u) => /\/api\/|openai/.test(u)), `${reqs.length} requests, external: ${external.length}`);
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r[0]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
