import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data', 'projects');
export const ASSETS = path.join(ROOT, 'assets');
fs.mkdirSync(DATA, { recursive: true });

export const pdir = (id, ...p) => path.join(DATA, id.replace(/[^\w-]/g, ''), ...p);
export const newId = (n = 10) => nanoid(n).replace(/[^\w]/g, 'x');

export function listProjects() {
  return fs.readdirSync(DATA).filter((d) => fs.existsSync(pdir(d, 'project.json'))).map((d) => {
    const p = JSON.parse(fs.readFileSync(pdir(d, 'project.json'), 'utf8'));
    return { id: p.id, title: p.title, updatedAt: p.updatedAt, format: p.settings?.format, pages: p.pages?.length || 0 };
  }).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
export function load(id) {
  const f = pdir(id, 'project.json');
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
const locks = new Map();
export function save(p) {
  p.updatedAt = new Date().toISOString();
  fs.mkdirSync(pdir(p.id), { recursive: true });
  const f = pdir(p.id, 'project.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(p, null, 2));
  fs.renameSync(f + '.tmp', f);
  return p;
}
// serialize read-modify-write per project
export async function mutate(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  let release;
  const next = new Promise((r) => (release = r));
  locks.set(id, prev.then(() => next));
  await prev;
  try { const p = load(id); const r = await fn(p); save(p); return r ?? p; } finally { release(); }
}
export function refPath(project, ref) {
  if (ref.startsWith('preset:')) return path.join(ASSETS, 'presets', ref.slice(7));
  return pdir(project.id, 'refs', path.basename(ref));
}
