import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { ROOT, ASSETS, listProjects, load, save, mutate, pdir, refPath, newId } from './store.js';
import { PRESETS, getPreset } from './presets.js';
import { newProject, runBreakdown, renderSheet, renderPanel, startRenderAll, jobs, isMock } from './pipeline.js';
import { hasKey, MODELS } from './openai.js';
import { artFile, renderPagePNG, exportPDF, exportZip, ppKey } from './render.js';

const PORT = Number(process.env.PORT || 5180);
const app = express();
app.use(express.json({ limit: '5mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15e6 } });

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { console.error(e); res.status(e.status && e.status < 600 ? e.status : 500).json({ error: e.message }); });
const need = (req) => { const p = load(req.params.id); if (!p) { const e = new Error('Project not found'); e.status = 404; throw e; } return p; };
const view = (p) => ({ ...p, mock: isMock(p), ppKey: ppKey(p) });

app.get('/api/status', (req, res) => res.json({ hasKey: hasKey(), models: MODELS, presets: PRESETS.map(({ id, name, blurb, refs, settings, lettering }) => ({ id, name, blurb, refs, settings, lettering })) }));
app.get('/api/projects', (req, res) => res.json(listProjects()));
app.post('/api/projects', wrap((req, res) => { const p = save(newProject(req.body || {})); res.json(view(p)); }));
app.get('/api/projects/:id', wrap((req, res) => res.json(view(need(req)))));
app.delete('/api/projects/:id', wrap((req, res) => { need(req); fs.rmSync(pdir(req.params.id), { recursive: true, force: true }); res.json({ ok: true }); }));

// Save editable fields (script, style, settings, lettering, breakdown edits).
const EDITABLE = ['title', 'script', 'styleText', 'settings', 'lettering', 'styleBible', 'characters', 'pages', 'presetId'];
app.put('/api/projects/:id', wrap(async (req, res) => {
  need(req);
  const p = await mutate(req.params.id, (p) => {
    // generated assets are owned by the server: keep them when the client sends stale copies
    const art = new Map(p.pages.flatMap((pg) => pg.panels).map((x) => [x.id, x]));
    const sheets = new Map(p.characters.map((c) => [c.id, c]));
    for (const k of EDITABLE) if (k in req.body) p[k] = req.body[k];
    if (req.body.pages) for (const pg of p.pages) for (const x of pg.panels) { const o = art.get(x.id); if (o) Object.assign(x, { art: o.art, artVersion: o.artVersion, prompt: o.prompt, error: o.error, size_px: o.size_px }); }
    if (req.body.characters) for (const c of p.characters) { const o = sheets.get(c.id); if (o) Object.assign(c, { sheet: o.sheet, sheetVersion: o.sheetVersion, sheetPrompt: o.sheetPrompt }); }
  });
  res.json(view(p));
}));
app.post('/api/projects/:id/preset', wrap(async (req, res) => {
  need(req);
  const pr = getPreset(req.body.presetId);
  const p = await mutate(req.params.id, (p) => {
    p.presetId = pr.id; p.styleText = pr.styleText; p.styleBible = structuredClone(pr.styleBible); p.lettering = structuredClone(pr.lettering);
    p.settings = { ...p.settings, ...structuredClone(pr.settings), mode: p.settings.mode };
    p.refs = [...p.refs.filter((r) => !r.startsWith('preset:')), ...pr.refs.map((r) => 'preset:' + r)];
  });
  res.json(view(p));
}));

// reference images
app.post('/api/projects/:id/refs', upload.array('files', 12), wrap(async (req, res) => {
  need(req);
  fs.mkdirSync(pdir(req.params.id, 'refs'), { recursive: true });
  const names = (req.files || []).filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.mimetype)).map((f) => {
    const name = `${newId(6)}${path.extname(f.originalname).toLowerCase() || '.png'}`;
    fs.writeFileSync(pdir(req.params.id, 'refs', name), f.buffer); return name;
  });
  res.json(view(await mutate(req.params.id, (p) => { p.refs.push(...names); })));
}));
app.delete('/api/projects/:id/refs', wrap(async (req, res) => {
  need(req);
  res.json(view(await mutate(req.params.id, (p) => { p.refs = p.refs.filter((r) => r !== req.query.ref); })));
}));
app.get('/api/projects/:id/ref', wrap((req, res) => { const p = need(req); const r = String(req.query.ref); if (!p.refs.includes(r)) return res.status(404).end(); res.sendFile(refPath(p, r)); }));
app.get('/api/preset-ref/:dir/:file', (req, res) => res.sendFile(path.join(ASSETS, 'presets', path.basename(req.params.dir), path.basename(req.params.file))));

// pipeline
app.post('/api/projects/:id/breakdown', wrap(async (req, res) => { need(req); res.json(view(await runBreakdown(req.params.id))); }));
app.post('/api/projects/:id/characters/:cid/sheet', wrap(async (req, res) => { need(req); res.json(view(await renderSheet(req.params.id, req.params.cid))); }));
app.post('/api/projects/:id/panels/:pid/render', wrap(async (req, res) => { need(req); res.json(view(await renderPanel(req.params.id, req.params.pid, { direction: req.body?.direction }))); }));
app.post('/api/projects/:id/render-all', wrap((req, res) => { need(req); res.json(startRenderAll(req.params.id, { force: !!req.body?.force })); }));
app.get('/api/projects/:id/job', (req, res) => res.json(jobs.get(req.params.id) || { running: false }));

// images
app.get('/api/projects/:id/sheets/:file', (req, res) => res.sendFile(pdir(req.params.id, 'sheets', path.basename(req.params.file))));
app.get('/api/projects/:id/panels/:pid/art', wrap(async (req, res) => {
  const p = need(req);
  const panel = p.pages.flatMap((pg) => pg.panels).find((x) => x.id === req.params.pid);
  const f = panel && (await artFile(p, panel));
  if (!f) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(f);
}));
app.get('/api/projects/:id/pages/:file', wrap(async (req, res) => {
  const p = need(req);
  const i = parseInt(req.params.file, 10) - 1;
  if (!p.pages[i]) return res.status(404).end();
  res.type('png').send(await renderPagePNG(p, i, Number(req.query.scale) || 1));
}));
const fname = (p, ext) => `${(p.title || 'comic').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'comic'}.${ext}`;
app.get('/api/projects/:id/export.pdf', wrap(async (req, res) => {
  const p = need(req);
  res.type('pdf').set('Content-Disposition', `attachment; filename="${fname(p, 'pdf')}"`).send(await exportPDF(p, Number(req.query.scale) || 2));
}));
app.get('/api/projects/:id/export.zip', wrap(async (req, res) => {
  const p = need(req);
  res.type('zip').set('Content-Disposition', `attachment; filename="${fname(p, 'zip')}"`);
  await exportZip(p, res, Number(req.query.scale) || 1);
}));
app.use('/fonts', express.static(path.join(ASSETS, 'fonts')));

// frontend: Vite dev middleware (HMR) unless NODE_ENV=production and a build exists
const dist = path.join(ROOT, 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ configFile: path.join(ROOT, 'vite.config.js'), server: { middlewareMode: true, hmr: { port: PORT + 1 } }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(PORT, '0.0.0.0', () => console.log(`Comic Studio → http://localhost:${PORT}  (${hasKey() ? 'OpenAI key found' : 'no OPENAI_API_KEY: mock mode'}; text=${MODELS.text}, image=${MODELS.image})`));
