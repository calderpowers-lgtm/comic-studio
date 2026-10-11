// End-to-end test of Free mode against the STATIC build (no app server): simulated ChatGPT reply,
// simulated picture uploads, lettering edit, PDF + ZIP export. Screenshots → sample/ui-free/.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { localPlan } from '../shared/localplan.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'sample/ui-free'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const DL = path.join(OUT, 'downloads'); fs.mkdirSync(DL, { recursive: true });
const SI = path.join(ROOT, 'sample/standins');
const PORT = 5190;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.join(ROOT, 'dist-static')], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const URL = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// simulated ChatGPT reply (fenced, chatty, a smart quote and a trailing comma to exercise the tolerant parser)
const script = fs.readFileSync(path.join(ROOT, 'scripts/example-script.txt'), 'utf8');
const lp = localPlan({ script, settings: { format: 'carousel', slides: 10 } });
const simple = { title: 'Neil and the Ocean', characters: lp.characters.map((c) => ({ id: c.id, name: c.name, look: c.description })),
  slides: lp.pages.map((pg) => { const p = pg.panels[0]; return { shot: p.shot, setting: p.setting, picture: p.description, characters: p.staging.map((s) => ({ id: s.character_id, position: s.position, action: s.action, expression: s.expression })), text: p.lettering }; }) };
let json = JSON.stringify(simple, null, 2).replace('"title"', '\u201Ctitle\u201D').replace(/\]\n\}$/, '],\n}');
const reply = `Here's your 10-slide plan!\n\n\`\`\`json\n${json}\n\`\`\`\n\nWant me to tweak the punchline?`;

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(URL.replace(/\/$/, ''), ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const cdp = await page.createCDPSession();
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
const requests = [];
page.on('request', (r) => requests.push(r.url()));
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('dialog', (d) => d.accept());
const click = async (text, sel = 'button') => {
  await page.waitForFunction(() => true);
  const ok = await page.evaluate((s, t) => [...document.querySelectorAll(s)].some((b) => b.textContent.trim().includes(t) && !b.disabled), sel, text);
  if (!ok) { await shot('debug-fail.png'); console.log('NOT FOUND', text, await page.$$eval(sel, (bs) => bs.map((b) => b.textContent.trim() + (b.disabled ? '[x]' : '')).slice(0, 40))); }
  await page.waitForFunction((s, t) => [...document.querySelectorAll(s)].some((b) => b.textContent.trim().includes(t) && !b.disabled), { timeout: 15000 }, sel, text);
  await page.evaluate((s, t) => [...document.querySelectorAll(s)].find((b) => b.textContent.trim().includes(t) && !b.disabled).click(), sel, text);
  await sleep(350);
};
const setValue = (sel, val, idx = 0) => page.evaluate((s, v, i) => { const t = document.querySelectorAll(s)[i]; const set = Object.getOwnPropertyDescriptor(t.constructor.prototype, 'value').set; set.call(t, v); t.dispatchEvent(new Event('input', { bubbles: true })); }, sel, val, idx);
const shot = (name, full = true) => page.screenshot({ path: path.join(OUT, name), fullPage: full });
const clip = () => page.evaluate(() => navigator.clipboard.readText());

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('comic-free'); });
await page.reload({ waitUntil: 'networkidle0' });
// 1 Story
await click('Use the example');
await shot('1-story.png', false);
// 2 Plan
await click('Next: Plan slides');
await click('Copy prompt');
const planP = await clip();
console.log('plan prompt ok:', planP.includes('EXACTLY 10 slides') && planP.includes('"slides"') && planP.includes('Today is the day'), planP.length, 'chars');
await click('Make slides from my lines');
console.log('quick plan slides:', await page.$$eval('.f-slide-ed', (e) => e.length));
await setValue('.f-choice textarea', reply);
await click('Use this reply');
console.log('chatgpt plan slides:', await page.$$eval('.f-slide-ed', (e) => e.length));
await shot('2-plan.png');
// 3 Characters
await click('Next: Characters');
const sheetInput = await page.$('.f-char input[type=file]');
await sheetInput.uploadFile(path.join(SI, 'neil-sheet.png'));
await sleep(800);
await click('Copy sheet prompt');
console.log('sheet prompt ok:', (await clip()).includes('CHARACTER REFERENCE SHEET'));
await shot('3-characters.png');
// 4 Draw
await click('Next: Draw in ChatGPT');
await click('Show');
await shot('4-draw-chatgpt.png');
const prompts = await page.$$('.f-prompt');
await (await prompts[1].$('button.f-primary')).click(); await sleep(300);
const p2 = await clip();
const p1 = await page.$eval('.f-prompt pre', (e) => e.textContent);
console.log('slide1 prompt chars', p1.length, 'has rules:', /4:5/.test(p1) && /NO text/.test(p1) && /TOP QUARTER/.test(p1) && /attached reference images/i.test(p1));
console.log('slide2 prompt chars', p2.length, 'starts:', JSON.stringify(p2.slice(0, 60)));
await click('Copy all prompts');
console.log('all prompts has 10 slides:', ((await clip()).match(/===== SLIDE/g) || []).length);
await click('Download style images');
await sleep(1500);
// 5 Pictures: upload 7, then 3 more
await click('Next: Add pictures');
const files = fs.readdirSync(SI).filter((f) => f.startsWith('ChatGPT')).sort().map((f) => path.join(SI, f));
const multi = await page.$('input[type=file][multiple]');
await multi.uploadFile(...files.slice(0, 7)); await sleep(1500);
await multi.uploadFile(...files.slice(7)); await sleep(1500);
console.log('slides with pictures:', await page.evaluate(() => JSON.parse(localStorage.getItem('comic-free:project:v1')).pages.filter((p) => p.panels[0].img).length));
// swap test (slide 1 → 2 and back), open framing on slide 2
const order0 = await page.evaluate(() => JSON.parse(localStorage.getItem('comic-free:project:v1')).pages.map((p) => p.panels[0].img));
await page.evaluate(() => document.querySelectorAll('.f-tile')[0].querySelector('button[title^="Swap picture with next"]').click()); await sleep(300);
const order1 = await page.evaluate(() => JSON.parse(localStorage.getItem('comic-free:project:v1')).pages.map((p) => p.panels[0].img));
console.log('swap works:', order1[0] === order0[1] && order1[1] === order0[0]);
await page.evaluate(() => document.querySelectorAll('.f-tile')[0].querySelector('button[title^="Swap picture with next"]').click()); await sleep(300);
await page.evaluate(() => [...document.querySelectorAll('.f-tile')[1].querySelectorAll('.f-link')].find((b) => b.textContent === 'Frame').click()); await sleep(300);
await sleep(800);
await shot('5-pictures.png');
// 6 Finish: edit a box
await click('Next: Text & export');
await sleep(1200);
const cv = await page.$('.f-grid.big .slide-canvas');
const bb = await cv.boundingBox();
await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.08); await sleep(400);
await setValue('.f-editor textarea', 'Neil, 52, has owned this house for nine years and never bought a chair.');
await sleep(600);
await shot('6-text-and-export.png', false);
await click('Download PDF'); await sleep(4000);
await click('Download PNG slides'); await sleep(4000);
// phone layout
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(() => window.scrollTo(0, 0)); await sleep(800);
await shot('7-phone-export.png', false);
await click('Draw in ChatGPT', '.f-steps button'); await sleep(600);
await shot('8-phone-draw.png', false);

const external = requests.filter((u) => !u.startsWith(URL) && !u.startsWith('data:') && !u.startsWith('blob:'));
const api = requests.filter((u) => /\/api\//.test(u) || /openai\.com/.test(u));
console.log('requests:', requests.length, 'external:', external.length, external.slice(0, 5), 'api-like:', api);
console.log('downloads:', fs.readdirSync(DL));
await browser.close(); srv.kill();
