// Mock mode: a rule-based script breakdown and procedurally drawn placeholder
// art in the same flat, hand-inked look, so the whole pipeline (breakdown →
// sheets → panels → lettering → export) runs end to end without an API key.
import { createCanvas } from '@napi-rs/canvas';
import { rng } from '../shared/compose.js';
import { localPlan, mockLook } from '../shared/localplan.js';
export { mockLook };
export const mockBreakdown = (project) => localPlan(project);

function Ink(ctx, W, seed) {
  const r = rng(seed);
  const lw = W * 0.0085;
  const jit = (pts, a = W * 0.0025) => pts.map(([x, y]) => [x + (r() - 0.5) * a, y + (r() - 0.5) * a]);
  const path = (pts, closed) => {
    ctx.beginPath();
    const n = pts.length;
    if (n < 3) { ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); if (closed) ctx.closePath(); return; }
    if (closed) {
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let m = mid(pts[n - 1], pts[0]); ctx.moveTo(...m);
      for (let i = 0; i < n; i++) { const q = pts[(i + 1) % n]; const mm = mid(pts[i], q); ctx.quadraticCurveTo(pts[i][0], pts[i][1], mm[0], mm[1]); }
      ctx.closePath();
    } else {
      ctx.moveTo(...pts[0]);
      for (let i = 1; i < n - 1; i++) { const mm = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]; ctx.quadraticCurveTo(pts[i][0], pts[i][1], mm[0], mm[1]); }
      ctx.lineTo(...pts[n - 1]);
    }
  };
  const shape = (pts, fill, w = 1) => {
    const p = jit(pts);
    path(p, true);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.lineWidth = lw * w; ctx.strokeStyle = '#141414'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  };
  const line = (pts, w = 1) => { path(jit(pts), false); ctx.lineWidth = lw * w; ctx.strokeStyle = '#141414'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); };
  const ell = (cx, cy, rx, ry, n = 22) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 6.283) * rx, cy + Math.sin((i / n) * 6.283) * ry]);
  const blob = (cx, cy, rx, ry, bumps = 7) => {
    const pts = []; const n = bumps * 6;
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; const k = 1 + 0.14 * Math.abs(Math.sin((i / 6) * Math.PI)); pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    return pts;
  };
  const tuft = (x, y, s) => line([[x - s, y - s * 0.2], [x - s * 0.7, y - s * 1.1], [x - s * 0.35, y - s * 0.1], [x, y - s * 1.3], [x + s * 0.3, y - s * 0.1], [x + s * 0.7, y - s * 0.9], [x + s, y]], 0.55);
  return { r, lw, shape, line, ell, blob, tuft, rect: (x, y, w, h) => {
    const pts = [], c = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (W * 0.03))); for (let j = 0; j < n; j++) pts.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]); }
    return pts;
  } };
}

function drawFigure(ctx, k, look, cx, baseY, headR, mode, view = 'front') {
  // mode: 'full' | 'bust' | 'head'
  const { shape, line, ell } = k;
  const hr = headR;
  const headCY = mode === 'full' ? baseY - hr * 6.2 : mode === 'bust' ? baseY - hr * 3.1 : baseY - hr * 1.15;
  const bodyTop = headCY + hr * 0.95;
  const bw = hr * 2.1;
  if (mode === 'full') {
    // legs
    shape(k.rect(cx - bw * 0.42, bodyTop + hr * 2.4, bw * 0.36, hr * 2.6), look.pants);
    shape(k.rect(cx + bw * 0.06, bodyTop + hr * 2.4, bw * 0.36, hr * 2.6), look.pants);
    shape(ell(cx - bw * 0.26, baseY - hr * 0.12, hr * 0.42, hr * 0.2), '#3A3A3A');
    shape(ell(cx + bw * 0.24, baseY - hr * 0.12, hr * 0.42, hr * 0.2), '#3A3A3A');
  }
  // torso
  const torsoH = mode === 'full' ? hr * 2.7 : baseY - bodyTop + hr;
  shape([[cx - bw * 0.42, bodyTop], [cx + bw * 0.42, bodyTop], [cx + bw * 0.55, bodyTop + torsoH], [cx - bw * 0.55, bodyTop + torsoH]], look.shirt);
  // arms
  const armL = mode === 'head' ? 0 : hr * 2.4;
  if (armL) {
    for (const s of [-1, 1]) {
      const pts = [[cx + s * bw * 0.45, bodyTop + hr * 0.25], [cx + s * bw * 0.62, bodyTop + armL * 0.55], [cx + s * bw * 0.58, bodyTop + armL]];
      ctx.save(); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.quadraticCurveTo(...pts[1], ...pts[2]); ctx.lineWidth = hr * 0.5 + k.lw * 2; ctx.strokeStyle = '#141414'; ctx.stroke();
      ctx.lineWidth = hr * 0.5; ctx.strokeStyle = look.shirt; ctx.stroke(); ctx.restore();
      shape(ell(pts[2][0], pts[2][1] + hr * 0.15, hr * 0.24, hr * 0.26, 12), look.skin, 0.7);
    }
  }
  // neck + head
  shape(k.rect(cx - hr * 0.28, headCY + hr * 0.6, hr * 0.56, hr * 0.5), look.skin, 0.7);
  const off = view === 'side' ? hr * 0.35 : view === 'three' ? hr * 0.18 : 0;
  // long hair behind
  if (look.style === 'long' || look.style === 'bob') {
    const bot = headCY + hr * (look.style === 'long' ? 1.7 : 0.75);
    for (const sd of [-1, 1]) shape([[cx + sd * hr * 0.55, headCY - hr * 0.6], [cx + sd * hr * 1.14, headCY - hr * 0.4], [cx + sd * hr * 1.2, bot], [cx + sd * hr * 0.62, bot]], look.hair);
  }
  shape(ell(cx, headCY, hr, hr * 1.05, 26), look.skin);
  // hair cap (blocky)
  if (look.style !== 'bald') {
    const top = headCY - hr * 1.12, bang = headCY - hr * (look.style === 'bob' ? 0.15 : 0.45);
    const pts = [[cx - hr * 1.08, bang + hr * 0.35], [cx - hr * 1.0, top + hr * 0.25], [cx - hr * 0.4, top - hr * 0.05], [cx + hr * 0.5, top], [cx + hr * 1.02, top + hr * 0.3], [cx + hr * 1.08, bang + hr * 0.3]];
    if (look.style === 'spiky') for (let i = 0; i < 5; i++) pts.splice(2 + i, 0, [cx - hr * 0.7 + i * hr * 0.35, top - hr * (0.25 + (i % 2) * 0.2)]);
    const n = look.style === 'bob' ? 7 : 5;
    for (let i = n; i >= 0; i--) pts.push([cx - hr * 0.95 + (i / n) * hr * 1.9 + off, bang + (i % 2 ? hr * 0.18 : 0)]);
    shape(pts, look.hair);
  }
  // face: dot eyes, line mouth
  ctx.fillStyle = '#141414';
  const ey = headCY + hr * 0.05;
  if (view !== 'side') { ctx.beginPath(); ctx.arc(cx - hr * 0.32 + off, ey, hr * 0.085, 0, 6.283); ctx.arc(cx + hr * 0.32 + off, ey, hr * 0.085, 0, 6.283); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(cx + hr * 0.55, ey, hr * 0.085, 0, 6.283); ctx.fill(); }
  if (look.beard) shape([[cx - hr * 0.45 + off, headCY + hr * 0.6], [cx + hr * 0.45 + off, headCY + hr * 0.6], [cx + hr * 0.25 + off, headCY + hr * 0.95], [cx - hr * 0.25 + off, headCY + hr * 0.95]], look.hair, 0.55);
  line([[cx - hr * 0.2 + off * 1.3, headCY + hr * 0.5], [cx + off * 1.3, headCY + hr * 0.48], [cx + hr * 0.2 + off * 1.3, headCY + hr * 0.51]], 0.55);
}

function background(ctx, k, W, H, setting, pal) {
  const s = (setting || '').toLowerCase();
  const night = /night/.test(s), sunset = /sunset/.test(s);
  const sky = night ? '#2E3C6E' : sunset ? '#E98AC0' : pal.sky || '#86C9EA';
  const horizon = H * (0.5 + k.r() * 0.08);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  if (sunset) { ctx.fillStyle = '#F4D27A'; ctx.fillRect(0, horizon - H * 0.17, W, H * 0.17); ctx.fillStyle = '#F2A67A'; ctx.fillRect(0, horizon - H * 0.3, W, H * 0.13); }
  if (night) { ctx.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(k.r() * W, k.r() * horizon * 0.9, W * 0.003, 0, 6.283); ctx.fill(); } k.shape(k.ell(W * 0.8, H * 0.12, W * 0.05, W * 0.05), '#F4EBC0'); }
  if (/kitchen|office|bedroom|living|apartment|house|home|cafe|bar|room/.test(s)) {
    ctx.fillStyle = '#E8DDC4'; ctx.fillRect(0, 0, W, H);
    k.shape(k.rect(W * 0.55, H * 0.08, W * 0.38, H * 0.3), night ? '#2E3C6E' : sky);
    k.line([[W * 0.74, H * 0.08], [W * 0.74, H * 0.38]], 0.8);
    ctx.fillStyle = '#B48A5E'; ctx.fillRect(0, H * 0.72, W, H * 0.28);
    k.line([[0, H * 0.72], [W, H * 0.72]]);
    for (let i = 1; i < 4; i++) k.line([[0, H * (0.72 + i * 0.07)], [W, H * (0.72 + i * 0.07) + k.r() * 6]], 0.45);
    return H * 0.86;
  }
  // clouds
  if (!night) for (let i = 0; i < 2; i++) k.shape(k.blob(W * (0.12 + i * 0.7 + k.r() * 0.1), H * (0.06 + k.r() * 0.08), W * 0.1, H * 0.035, 5), '#FFFFFF', 0.8);
  if (/mountain|cliff/.test(s)) {
    k.shape([[-W * 0.1, horizon + 4], [W * 0.25, H * 0.3], [W * 0.5, horizon - H * 0.08], [W * 0.75, H * 0.33], [W * 1.1, horizon + 4]], '#A39C93');
    k.line([[W * 0.25, H * 0.3], [W * 0.3, H * 0.42], [W * 0.27, H * 0.5]], 0.5);
  } else if (/city|street|road|parking/.test(s)) {
    let x = -W * 0.05;
    while (x < W) { const bw = W * (0.14 + k.r() * 0.12), bh = H * (0.12 + k.r() * 0.18); k.shape(k.rect(x, horizon - bh, bw, bh + 6), ['#C9B8A0', '#A9B7C6', '#D7C08A', '#B9A3B8'][Math.floor(k.r() * 4)]); x += bw + W * 0.02; }
  } else {
    for (let i = 0; i < 4; i++) k.shape(k.blob(W * (i * 0.3 + k.r() * 0.1), horizon - H * 0.02, W * 0.12, H * 0.035, 6), pal.foliage || '#4F9A43', 0.7);
  }
  const sea = /beach|ocean|sea|lake|surf/.test(s);
  ctx.fillStyle = sea ? '#4FA3D9' : pal.grass || '#8DC56C';
  ctx.fillRect(0, horizon, W, H - horizon);
  k.line([[0, horizon], [W * 0.5, horizon + 3], [W, horizon]]);
  if (sea) {
    for (let i = 0; i < 14; i++) { const x = k.r() * W, y = horizon + k.r() * H * 0.25; k.line([[x, y], [x + W * 0.05, y - 3], [x + W * 0.1, y]], 0.4); }
    ctx.fillStyle = '#EAD9A0'; ctx.fillRect(0, horizon + H * 0.28, W, H); k.line([[0, horizon + H * 0.28], [W, horizon + H * 0.29]]);
  } else {
    if (/pond|lake|field|farm|park/.test(s) || k.r() < 0.5) k.shape(k.blob(W * (0.2 + k.r() * 0.6), horizon + H * 0.08, W * 0.14, H * 0.02, 5), '#5BAFE0', 0.7);
    for (let i = 0; i < 14; i++) k.tuft(k.r() * W, horizon + H * 0.04 + k.r() * (H - horizon - H * 0.04), W * (0.012 + k.r() * 0.01));
  }
  return sea ? horizon + H * 0.4 : H * 0.93;
}

export function mockPanel(project, panel, W, H) {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  const k = Ink(ctx, W, panel.id + ':' + (panel.artVersion || 0));
  const pal = Object.fromEntries(((project.styleBible || {}).palette || []).map((p) => [p.name.split(' ')[0], p.hex]));
  const ground = background(ctx, k, W, H, panel.setting, pal);
  const chars = (panel.staging?.length ? panel.staging : (panel.characters || []).map((id) => ({ character_id: id, position: 'center' })));
  const POS = { left: 0.24, 'center-left': 0.38, center: 0.5, 'center-right': 0.62, right: 0.76 };
  const shot = panel.shot || 'medium';
  const mode = /close/.test(shot) ? 'head' : /medium|over/.test(shot) ? 'bust' : 'full';
  const headR = mode === 'head' ? W * 0.21 : mode === 'bust' ? W * 0.13 : W * (/wide|establishing|birds/.test(shot) ? 0.045 : 0.066);
  const n = chars.length;
  chars.slice(0, 3).forEach((st, i) => {
    const ch = project.characters.find((x) => x.id === st.character_id);
    if (!ch) return;
    const look = mockLook(ch.id, ch.name, ch.description);
    const fx = n > 1 && mode === 'head' ? (i === 0 ? 0.3 : 0.72) : POS[st.position] ?? 0.5;
    const base = mode === 'full' ? ground : mode === 'head' ? H - headR * 0.15 : H + headR * 0.4;
    drawFigure(ctx, k, look, W * fx, base, headR * (n > 1 && mode === 'head' ? 0.7 : 1), mode);
  });
  return c.toBuffer('image/png');
}

export function mockSheet(project, ch) {
  const W = 1536, H = 1024;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const k = Ink(ctx, W, 'sheet:' + ch.id + ':' + (ch.sheetVersion || 0));
  const look = mockLook(ch.id, ch.name, ch.description);
  ['front', 'three', 'side'].forEach((v, i) => drawFigure(ctx, k, look, W * (0.2 + i * 0.3), H * 0.92, W * 0.042, 'full', v));
  return c.toBuffer('image/png');
}
