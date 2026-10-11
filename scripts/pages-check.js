// Usage: node scripts/pages-check.js <url>  — loads the hosted free app, reports failed requests.
import puppeteer from 'puppeteer-core';
const url = process.argv[2];
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900 });
const reqs = [], bad = [], errs = [];
page.on('response', (r) => { reqs.push(`${r.status()} ${r.url()}`); if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
page.on('requestfailed', (r) => bad.push(`FAILED ${r.url()} ${r.failure()?.errorText}`));
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle0' });
// walk into the Draw step so the reference images get pulled in, and force the fonts
await page.evaluate(async () => { await document.fonts.ready; });
const clickText = async (t) => page.evaluate((t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t)); if (b) { b.click(); return true; } return false; }, t);
await clickText('example'); await new Promise((r) => setTimeout(r, 300));
await clickText('Next'); await new Promise((r) => setTimeout(r, 300));
await clickText('Make slides from my lines'); await new Promise((r) => setTimeout(r, 300));
for (const t of ['Next', 'Next']) { await clickText(t); await new Promise((r) => setTimeout(r, 500)); }
await page.waitForNetworkIdle({ idleTime: 800 }).catch(() => {});
// fetch every built asset referenced by the bundle (fonts + refs) to be sure they resolve
const assetUrls = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
const fonts = await page.evaluate(() => [...document.fonts].map((f) => `${f.family}:${f.status}`));
const studioLink = await page.evaluate(() => !!document.querySelector('a[href*="studio"]') || document.body.innerText.includes('paid API'));
const title = await page.title();
await page.screenshot({ path: process.argv[3] || '/tmp/pages-check.png' });
console.log(JSON.stringify({ title, requests: reqs.length, bad, errs, fonts, studioLink,
  refs: reqs.filter((r) => /ref-\d/.test(r)), fontReqs: reqs.filter((r) => /\.ttf/.test(r)), resourceCount: assetUrls.length }, null, 1));
await browser.close();
