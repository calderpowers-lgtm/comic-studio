// Orchestration: script → breakdown + style bible → character sheets → panel art.
import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { load, mutate, newId, pdir, refPath } from './store.js';
import { getPreset } from './presets.js';
import { breakdownSchema, breakdownPrompts, panelPrompt, sheetPrompt } from './prompts.js';
import { jsonResponse, generateImage, hasKey, MODELS } from './openai.js';
import { mockBreakdown, mockPanel, mockSheet } from './mock.js';
import { computeLayout, imageSizeForPanel } from '../shared/compose.js';

export const isMock = (p) => p.settings.mode === 'mock' || !hasKey();

export function newProject({ presetId, title = '', script = '', styleText }) {
  const pr = getPreset(presetId);
  return {
    id: newId(), title, script, createdAt: new Date().toISOString(),
    presetId: pr.id,
    styleText: styleText ?? pr.styleText,
    refs: pr.refs.map((r) => 'preset:' + r),
    settings: { mode: 'auto', ...structuredClone(pr.settings) },
    lettering: structuredClone(pr.lettering),
    styleBible: structuredClone(pr.styleBible),
    characters: [], pages: [],
    usage: { text: 0, images: 0, calls: 0 },
  };
}

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'char';

function normalize(project, data) {
  const ids = new Map();
  const characters = (data.characters || []).map((c) => {
    let id = slug(c.id || c.name);
    while ([...ids.values()].includes(id)) id += '2';
    ids.set(c.id, id); ids.set(slug(c.name), id); ids.set(c.name?.toLowerCase(), id);
    const prev = project.characters.find((x) => x.id === id);
    return { id, name: c.name, description: c.visual_description ?? c.description ?? '', isMain: c.is_main ?? c.isMain ?? true, sheet: prev?.sheet || null, sheetVersion: prev?.sheetVersion || 0 };
  });
  const mapId = (x) => ids.get(x) || ids.get(slug(x)) || ids.get(String(x).toLowerCase()) || (x ? slug(x) : '');
  const pages = (data.pages || []).map((pg) => ({
    id: newId(8), layoutSeed: 0,
    panels: (pg.panels || []).map((p) => ({
      id: newId(8), shot: p.shot || 'medium', size: p.size || 'medium', setting: p.setting || '', description: p.description || '',
      characters: (p.characters || []).map(mapId).filter((id) => characters.some((c) => c.id === id)),
      staging: (p.staging || []).map((s) => ({ ...s, character_id: mapId(s.character_id) })),
      lettering: (p.lettering || []).map((l) => ({ id: newId(8), type: l.type || 'speech', speaker: l.speaker ? mapId(l.speaker) : '', text: l.text || '' })),
      art: null, artVersion: 0, prompt: '', error: null, direction: '',
    })),
  }));
  return { characters, pages };
}

export async function runBreakdown(id) {
  const project = load(id);
  let data, cost = 0;
  if (isMock(project)) data = mockBreakdown(project);
  else {
    const refs = project.refs.map((r) => refPath(project, r)).filter((f) => fs.existsSync(f)).slice(0, 6);
    const { system, user } = breakdownPrompts(project, refs.length);
    const r = await jsonResponse({ system, user, images: refs, schema: breakdownSchema, name: 'comic_breakdown' });
    data = r.data; cost = r.cost;
  }
  return mutate(id, (p) => {
    const n = normalize(p, data);
    p.characters = n.characters; p.pages = n.pages;
    if (data.title && !p.title) p.title = data.title;
    if (data.style_bible) p.styleBible = data.style_bible;
    p.usage.text += cost; p.usage.calls += cost ? 1 : 0;
    p.breakdownAt = new Date().toISOString();
  });
}

function styleRefFiles(project, max) {
  return project.refs.map((r) => refPath(project, r)).filter((f) => fs.existsSync(f)).slice(0, max);
}

export async function renderSheet(id, charId) {
  const project = load(id);
  const ch = project.characters.find((c) => c.id === charId);
  if (!ch) throw new Error('No such character');
  const ver = (ch.sheetVersion || 0) + 1;
  let buf, cost = 0, prompt = '';
  if (isMock(project)) buf = mockSheet(project, { ...ch, sheetVersion: ver });
  else {
    const refs = styleRefFiles(project, 3);
    prompt = sheetPrompt(project, ch, refs.length > 0);
    const r = await generateImage({ prompt, refs, size: '1536x1024', quality: project.settings.quality || 'medium' });
    buf = r.buffer; cost = r.cost;
  }
  fs.mkdirSync(pdir(id, 'sheets'), { recursive: true });
  const file = `${ch.id}-${ver}.png`;
  fs.writeFileSync(pdir(id, 'sheets', file), buf);
  return mutate(id, (p) => {
    const c = p.characters.find((x) => x.id === charId);
    if (c) { c.sheet = file; c.sheetVersion = ver; c.sheetPrompt = prompt; }
    p.usage.images += cost; p.usage.calls += cost ? 1 : 0;
  });
}

function findPanel(project, panelId) {
  for (let i = 0; i < project.pages.length; i++) {
    const panel = project.pages[i].panels.find((x) => x.id === panelId);
    if (panel) return { page: project.pages[i], pageIndex: i, panel };
  }
  return null;
}

export async function renderPanel(id, panelId, { direction } = {}) {
  const project = load(id);
  const f = findPanel(project, panelId);
  if (!f) throw new Error('No such panel');
  const { page, pageIndex, panel } = f;
  if (direction !== undefined) panel.direction = direction;
  const rect = computeLayout(project, page, pageIndex).panels.find((r) => r.id === panelId);
  const size = imageSizeForPanel(rect, MODELS.image);
  const ver = (panel.artVersion || 0) + 1;
  let buf, cost = 0, prompt = '';
  try {
    if (isMock(project)) {
      const [w, h] = size.split('x').map(Number);
      buf = mockPanel(project, { ...panel, artVersion: ver }, w, h);
      prompt = panelPrompt(project, page, panel, { sheets: [], styleRefs: 0 });
    } else {
      const sheets = (panel.characters || []).map((cid) => project.characters.find((c) => c.id === cid)).filter((c) => c?.sheet && fs.existsSync(pdir(id, 'sheets', c.sheet))).slice(0, 4);
      const styleRefs = styleRefFiles(project, 2);
      prompt = panelPrompt(project, page, panel, { sheets, styleRefs: styleRefs.length });
      const r = await generateImage({ prompt, refs: [...sheets.map((c) => pdir(id, 'sheets', c.sheet)), ...styleRefs], size, quality: project.settings.quality || 'medium' });
      buf = r.buffer; cost = r.cost;
    }
  } catch (e) {
    await mutate(id, (p) => { const x = findPanel(p, panelId); if (x) x.panel.error = e.message; });
    throw e;
  }
  fs.mkdirSync(pdir(id, 'art'), { recursive: true });
  const file = `${panelId}-${ver}.png`;
  fs.writeFileSync(pdir(id, 'art', file), buf);
  return mutate(id, (p) => {
    const x = findPanel(p, panelId);
    if (x) { x.panel.art = file; x.panel.artVersion = ver; x.panel.prompt = prompt; x.panel.error = null; if (direction !== undefined) x.panel.direction = direction; x.panel.size_px = size; }
    p.usage.images += cost; p.usage.calls += cost ? 1 : 0;
  });
}

// ---- background "render all" jobs ----
export const jobs = new Map();
async function pool(tasks, n) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const t = tasks[i++]; await t(); } }));
}
export function startRenderAll(id, { force = false } = {}) {
  if (jobs.get(id)?.running) return jobs.get(id);
  const project = load(id);
  const used = new Set(project.pages.flatMap((pg) => pg.panels.flatMap((p) => p.characters || [])));
  const chars = project.characters.filter((c) => used.has(c.id) && (force || !c.sheet));
  const panels = project.pages.flatMap((pg) => pg.panels).filter((p) => force || !p.art);
  const job = { running: true, total: chars.length + panels.length, done: 0, errors: [], stage: 'sheets', startedAt: Date.now() };
  jobs.set(id, job);
  const conc = isMock(project) ? 4 : Number(process.env.IMAGE_CONCURRENCY || 3);
  (async () => {
    await pool(chars.map((c) => async () => { try { await renderSheet(id, c.id); } catch (e) { job.errors.push(`${c.name}: ${e.message}`); } job.done++; }), conc);
    job.stage = 'panels';
    await pool(panels.map((p) => async () => { try { await renderPanel(id, p.id); } catch (e) { job.errors.push(`panel ${p.id}: ${e.message}`); } job.done++; }), conc);
    job.stage = 'done'; job.running = false;
  })();
  return job;
}

export { createCanvas };
