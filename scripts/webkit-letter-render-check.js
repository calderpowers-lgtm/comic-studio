// iPhone WebKit: narration boxes must be visible on the Finish preview AND in the exported PNG,
// including boxes whose saved position is off the slide or invalid (what an accidental phone drag used to cause).
import fs from 'node:fs'; import path from 'node:path';
import { webkit, devices } from 'playwright';
import { loadImage, createCanvas } from '@napi-rs/canvas';
const ROOT = path.resolve(import.meta.dirname, '..');
const URL_ = process.argv[2] || 'http://localhost:5191/comic-studio/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' · ' + x : ''}`); };
const b = await webkit.launch(); const ctx = await b.newContext({ ...devices['iPhone 15'], acceptDownloads: true }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); page.on('dialog', (d) => d.accept());
const tap = async (t) => { const el = page.locator('button', { hasText: t }).first(); await el.scrollIntoViewIfNeeded(); await el.tap(); await sleep(350); };
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('comic-free'); q.onsuccess = q.onerror = q.onblocked = r; }); });
await page.reload({ waitUntil: 'networkidle' });
await tap('Use an example'); await tap('Next: get the ChatGPT prompt'); await tap('Next: add the pictures');
const fc = page.waitForEvent('filechooser'); await page.locator('label.f-several').tap(); await (await fc).setFiles([path.join(ROOT, 'sample/iphone/IMG_1001.HEIC'), path.join(ROOT, 'sample/standins/ChatGPT Image 02.png'), path.join(ROOT, 'sample/standins/ChatGPT Image 03.png')]);
await sleep(4000);
const TXT = "AND EVERY EVENING, A PARTICULARLY ANGRY DOG REMINDED HIM THAT HE WASN'T WELCOME.";
const cases = [['normal', undefined], ['dragged off the bottom', { x: 0.5, y: 3.2 }], ['dragged off the top-left', { x: -1.5, y: -0.8 }], ['invalid position', { x: null, y: null }]];
const setLet = (slides) => page.evaluate((slides) => { const k = 'comic-free:project:v1'; const p = JSON.parse(localStorage.getItem(k)); slides.forEach(([i, l]) => { p.pages[i].panels[0].lettering = l; }); p.view = 'finish'; localStorage.setItem(k, JSON.stringify(p)); }, slides);
// slide 1..4: one narration box each, in the various saved states; slide 5: no text (reference)
await setLet(cases.map(([, pos], i) => [i, [{ id: 'cap' + i, type: 'caption', speaker: '', text: TXT, ...(pos ? { pos } : {}) }]]).concat([[4, []]]));
await page.reload({ waitUntil: 'networkidle' }); await sleep(2500);
// white wavy box = many pure-white pixels; the pictures have almost none
const whiteShare = (data) => { let n = 0; for (let i = 0; i < data.length; i += 4) if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) n++; return n / (data.length / 4); };
const previewWhite = await page.evaluate(() => [...document.querySelectorAll('canvas.slide-canvas')].slice(0, 5).map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) n++; return n / (d.length / 4); }));
// pictures with no box still have the white slide margin; a narration box adds a lot more white
const base = previewWhite[4];
for (let i = 0; i < 4; i++) {
  // compare slide i against itself without text: re-render via export below; here use the margin-only reference + box area threshold
}
const exportPng = async (i) => {
  const dl = page.waitForEvent('download'); const btn = page.locator('.f-finish .f-tile').nth(i).locator('button', { hasText: 'PNG' }); await btn.scrollIntoViewIfNeeded(); await btn.tap();
  const d = await dl; const f = path.join('/tmp', `lr-${i}.png`); await d.saveAs(f); const im = await loadImage(fs.readFileSync(f)); const c = createCanvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return whiteShare(c.getContext('2d').getImageData(0, 0, im.width, im.height).data);
};
// reference: same pictures with the text removed
const withText = [];
for (let i = 0; i < 4; i++) withText.push(await exportPng(i));
await setLet([0, 1, 2, 3].map((i) => [i, []])); await page.reload({ waitUntil: 'networkidle' }); await sleep(2500);
const noTextPrev = await page.evaluate(() => [...document.querySelectorAll('canvas.slide-canvas')].slice(0, 4).map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) n++; return n / (d.length / 4); }));
const noText = [];
for (let i = 0; i < 4; i++) noText.push(await exportPng(i));
cases.forEach(([name], i) => {
  const dp = previewWhite[i] - noTextPrev[i], de = withText[i] - noText[i];
  check(`narration box (${name}) is visible on the slide preview`, dp > 0.03, `+${(dp * 100).toFixed(1)}% white`);
  check(`narration box (${name}) is in the exported PNG`, de > 0.03, `+${(de * 100).toFixed(1)}% white`);
});
check('no page errors', !errs.length, errs.join(' | '));
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
