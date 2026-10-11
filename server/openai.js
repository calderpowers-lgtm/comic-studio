// Thin OpenAI REST client (no SDK): Responses API for the script breakdown,
// Images API (generations / edits) for character sheets and panels.
import fs from 'node:fs';
import path from 'node:path';

export const MODELS = {
  text: process.env.OPENAI_TEXT_MODEL || 'gpt-6.1-sol',
  image: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst',
};
// USD per 1M tokens (developers.openai.com/api/docs/pricing, Oct 2026)
const PRICES = {
  'gpt-6.1-sol': { in: 2, out: 10 }, 'gpt-6-astra': { in: 10, out: 50 }, 'gpt-6-luna': { in: 0.1, out: 0.5 },
  image: { textIn: 5, imageIn: 8, out: 30 },
};
export const hasKey = () => !!process.env.OPENAI_API_KEY;
const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

class ApiError extends Error {}
async function call(pathname, init, tries = 3) {
  for (let i = 0; ; i++) {
    const res = await fetch(BASE + pathname, { ...init, headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...(init.headers || {}) } });
    const txt = await res.text();
    let body; try { body = JSON.parse(txt); } catch { body = { raw: txt }; }
    if (res.ok) return body;
    const retry = res.status === 429 || res.status >= 500;
    const msg = body?.error?.message || txt.slice(0, 300);
    if (retry && i < tries - 1 && body?.error?.type !== 'insufficient_quota' && body?.error?.code !== 'insufficient_quota' && body?.error?.code !== 'credit_balance_exhausted') { await new Promise((r) => setTimeout(r, 2000 * 2 ** i)); continue; }
    const e = new ApiError(`OpenAI ${res.status}: ${msg}`); e.status = res.status; e.code = body?.error?.code; throw e;
  }
}

export function textCost(model, usage) {
  const p = PRICES[model] || PRICES['gpt-6.1-sol'];
  return ((usage?.input_tokens || 0) * p.in + (usage?.output_tokens || 0) * p.out) / 1e6;
}
export function imageCost(usage) {
  if (!usage) return 0;
  const d = usage.input_tokens_details || {};
  const imgIn = d.image_tokens ?? 0, txtIn = d.text_tokens ?? Math.max(0, (usage.input_tokens || 0) - imgIn);
  return (imgIn * PRICES.image.imageIn + txtIn * PRICES.image.textIn + (usage.output_tokens || 0) * PRICES.image.out) / 1e6;
}

const mime = (f) => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[path.extname(f).toLowerCase()] || 'image/png';

// Structured JSON via Responses API. images: local file paths given as vision input.
export async function jsonResponse({ system, user, images = [], schema, name = 'result' }) {
  const content = [{ type: 'input_text', text: user }];
  for (const f of images) content.push({ type: 'input_image', image_url: `data:${mime(f)};base64,${fs.readFileSync(f).toString('base64')}`, detail: 'low' });
  const body = {
    model: MODELS.text,
    input: [{ role: 'system', content: [{ type: 'input_text', text: system }] }, { role: 'user', content }],
    text: { format: { type: 'json_schema', name, schema, strict: true } },
  };
  const r = await call('/responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let out = r.output_text;
  if (!out) for (const o of r.output || []) for (const c of o.content || []) if (c.type === 'output_text') out = (out || '') + c.text;
  if (!out) throw new Error('No text in model response');
  return { data: JSON.parse(out), usage: r.usage, cost: textCost(MODELS.text, r.usage) };
}

// Image generation. refs: local file paths → uses /images/edits (reference images); otherwise /images/generations.
export async function generateImage({ prompt, refs = [], size = '1024x1536', quality = 'medium' }) {
  let r;
  if (refs.length) {
    const fd = new FormData();
    fd.append('model', MODELS.image);
    fd.append('prompt', prompt);
    fd.append('size', size);
    fd.append('quality', quality);
    fd.append('n', '1');
    for (const f of refs.slice(0, 16)) fd.append('image[]', new Blob([fs.readFileSync(f)], { type: mime(f) }), path.basename(f));
    r = await call('/images/edits', { method: 'POST', body: fd });
  } else {
    r = await call('/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODELS.image, prompt, size, quality, n: 1 }) });
  }
  const b64 = r.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image API returned no image');
  return { buffer: Buffer.from(b64, 'base64'), usage: r.usage, cost: imageCost(r.usage) };
}
