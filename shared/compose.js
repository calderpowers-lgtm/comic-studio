// Isomorphic comic page composer. Runs in the browser (live editor) and in
// Node via @napi-rs/canvas (exports). All page layout, borders and lettering
// are drawn here in code — the image model never draws text or layout.

export const FONTS = {
  ComicNeueBold: { label: 'Comic Neue Bold', file: 'ComicNeue-Bold.ttf' },
  PatrickHand: { label: 'Patrick Hand', file: 'PatrickHand-Regular.ttf' },
  Bangers: { label: 'Bangers (SFX)', file: 'Bangers-Regular.ttf' },
};

export const PAGE_ASPECTS = {
  us: { label: 'US comic (6.625×10.25)', W: 1325, H: 2050 },
  manga: { label: 'Manga / B6 (1:1.42)', W: 1300, H: 1846 },
  square: { label: 'Square (1:1)', W: 1600, H: 1600 },
  landscape: { label: 'Landscape album (4:3)', W: 2000, H: 1500 },
};

export const CAROUSEL = { W: 1080, H: 1350 };

// ---------- deterministic randomness ----------
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = typeof seed === 'number' ? seed : hashStr(seed);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POS_X = { left: 0.2, 'center-left': 0.36, center: 0.5, 'center-right': 0.64, right: 0.8 };

// ---------- page geometry ----------
export function pageSize(project) {
  const s = project.settings || {};
  if (s.format === 'pages') return PAGE_ASPECTS[s.pageAspect] || PAGE_ASPECTS.us;
  return CAROUSEL;
}

export function computeLayout(project, page, pageIndex) {
  const { W, H } = pageSize(project);
  const s = project.settings || {};
  if (s.format !== 'pages') {
    const m = Math.round(W * 0.03);
    const p = page.panels[0];
    return { W, H, border: Math.round(W * 0.0075), panels: p ? [{ id: p.id, x: m, y: m, w: W - 2 * m, h: H - 2 * m }] : [] };
  }
  const m = Math.round(W * 0.05);
  const g = Math.round(W * 0.018);
  const footer = Math.round(H * 0.025);
  const cx = m, cy = m, cw = W - 2 * m, ch = H - 2 * m - footer;
  const r = rng(`${page.id}:${page.layoutSeed || 0}`);
  // pack panels into tiers
  const rows = [];
  let cur = [];
  const flush = () => { if (cur.length) rows.push(cur); cur = []; };
  for (const p of page.panels) {
    if (p.size === 'splash' || p.size === 'large' || (p.shot === 'establishing' && p.size !== 'small')) { flush(); rows.push([p]); continue; }
    cur.push(p);
    const cap = cur.every((q) => q.size === 'small') ? 3 : 2;
    if (cur.length >= cap) flush();
  }
  flush();
  // occasionally merge a lone medium panel's row with the neighbour for variety
  const weights = rows.map((row) => (row.some((p) => p.size === 'splash') ? 2.4 : row.some((p) => p.size === 'large') ? 1.55 : row.length === 3 ? 0.85 : 1) * (0.9 + r() * 0.2));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const avail = ch - g * (rows.length - 1);
  const out = [];
  let y = cy;
  rows.forEach((row, ri) => {
    const rh = ri === rows.length - 1 ? cy + ch - y : Math.round((avail * weights[ri]) / totalW);
    let fr;
    if (row.length === 1) fr = [1];
    else if (row.length === 2) {
      const sizeBias = (row[0].size === 'large' ? 0.1 : 0) - (row[1].size === 'large' ? 0.1 : 0);
      const opts = [0.38, 0.5, 0.62, 0.45, 0.55];
      const a = Math.min(0.7, Math.max(0.3, opts[Math.floor(r() * opts.length)] + sizeBias));
      fr = [a, 1 - a];
    } else {
      const a = 0.28 + r() * 0.1, b = 0.3 + r() * 0.1;
      fr = [a, b, 1 - a - b];
    }
    const aw = cw - g * (row.length - 1);
    let x = cx;
    row.forEach((p, i) => {
      const w = i === row.length - 1 ? cx + cw - x : Math.round(aw * fr[i]);
      out.push({ id: p.id, x, y, w, h: rh });
      x += w + g;
    });
    y += rh + g;
  });
  return { W, H, border: Math.max(3, Math.round(W * 0.004)), panels: out, footer };
}

// ---------- text ----------
function letterFont(project) {
  const L = project.lettering || {};
  return L.font && FONTS[L.font] ? L.font : 'ComicNeueBold';
}
export function baseFontSize(project) {
  const { W } = pageSize(project);
  const L = project.lettering || {};
  const k = (project.settings || {}).format === 'pages' ? 0.0175 : 0.048;
  return Math.round(W * k * (L.scale || 1));
}

function wrap(ctx, words, maxW) {
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
export function layoutText(ctx, text, font, maxW) {
  ctx.font = font;
  const paras = String(text || '').split(/\n/);
  const run = (w) => paras.flatMap((p) => wrap(ctx, p.split(/\s+/).filter(Boolean), w));
  let lines = run(maxW);
  // balance: shrink width while line count stays the same
  let w = maxW;
  for (let i = 0; i < 14; i++) {
    const nw = w * 0.95;
    const nl = run(nw);
    if (nl.length !== lines.length || nl.some((l) => ctx.measureText(l).width > nw + 1)) break;
    w = nw; lines = nl;
  }
  const width = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
  return { lines, width };
}

// ---------- shapes ----------
function roundedRectPoints(x, y, w, h, r, step) {
  r = Math.min(r, w / 2, h / 2);
  const pts = [];
  const seg = (x0, y0, x1, y1) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  };
  const arc = (cx, cy, a0) => {
    const n = Math.max(3, Math.round((Math.PI / 2) * r / step));
    for (let i = 0; i < n; i++) { const a = a0 + (Math.PI / 2) * (i / n); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  };
  seg(x + r, y, x + w - r, y); arc(x + w - r, y + r, -Math.PI / 2);
  seg(x + w, y + r, x + w, y + h - r); arc(x + w - r, y + h - r, 0);
  seg(x + w - r, y + h, x + r, y + h); arc(x + r, y + h - r, Math.PI / 2);
  seg(x, y + h - r, x, y + r); arc(x + r, y + r, Math.PI);
  return pts;
}
function ellipsePoints(cx, cy, rx, ry, step) {
  const n = Math.max(24, Math.round((Math.PI * (rx + ry)) / step));
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return pts;
}
function centroid(pts) {
  let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length];
}
// Hand-drawn wobble: low-frequency waves + a few soft bumps + tiny jitter.
function wobble(pts, seed, amp, bumps = 0) {
  const r = rng(seed);
  const [cx, cy] = centroid(pts);
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const f = [2 + Math.floor(r() * 2), 5 + Math.floor(r() * 3), 11 + Math.floor(r() * 5)];
  const n = pts.length;
  const bumpCenters = Array.from({ length: bumps }, () => ({ t: r(), w: 0.015 + r() * 0.025, a: (r() < 0.5 ? -1 : 1) * amp * (0.8 + r() * 1.2) }));
  return pts.map(([x, y], i) => {
    const t = i / n;
    const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
    let nx = next[1] - prev[1], ny = -(next[0] - prev[0]);
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if ((x - cx) * nx + (y - cy) * ny < 0) { nx = -nx; ny = -ny; }
    let d = amp * (0.55 * Math.sin(6.283 * f[0] * t + ph[0]) + 0.3 * Math.sin(6.283 * f[1] * t + ph[1]) + 0.15 * Math.sin(6.283 * f[2] * t + ph[2]));
    for (const b of bumpCenters) { let dt = Math.abs(t - b.t); dt = Math.min(dt, 1 - dt); if (dt < b.w) d += b.a * Math.cos((dt / b.w) * Math.PI / 2); }
    d += (r() - 0.5) * amp * 0.12;
    return [x + nx * d, y + ny * d];
  });
}
function spikes(cx, cy, rx, ry, seed, len) {
  const r = rng(seed);
  const n = Math.max(14, Math.round((rx + ry) / 9));
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const out = i % 2 === 0 ? 1 + (len * (0.6 + r() * 0.8)) / Math.max(rx, ry) : 1;
    pts.push([cx + Math.cos(a) * rx * out, cy + Math.sin(a) * ry * out]);
  }
  return pts;
}
function cloud(cx, cy, rx, ry, seed) {
  const r = rng(seed);
  const n = Math.max(9, Math.round((rx + ry) / 22));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const bulge = 0.12 + r() * 0.08;
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, a = a0 + (a1 - a0) * t;
      const s = 1 + bulge * Math.sin(Math.PI * t);
      pts.push([cx + Math.cos(a) * rx * s, cy + Math.sin(a) * ry * s]);
    }
  }
  return pts;
}
function tracePoly(ctx, pts, smooth = true) {
  ctx.beginPath();
  if (!smooth) { ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); return; }
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; const mm = mid(p, q); ctx.quadraticCurveTo(p[0], p[1], mm[0], mm[1]); }
  ctx.closePath();
}
function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
}
// Thin, curvy (S-shaped) tapered tail as a polygon.
function tailPoly(base, tip, baseW, seed, wavy) {
  const r = rng(seed + ':tail');
  const dx = tip[0] - base[0], dy = tip[1] - base[1];
  const d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d;
  const s = (r() < 0.5 ? -1 : 1) * d * (wavy ? 0.22 : 0.1);
  const p1 = [base[0] + dx * 0.33 + nx * s, base[1] + dy * 0.33 + ny * s];
  const p2 = [base[0] + dx * 0.66 - nx * s, base[1] + dy * 0.66 - ny * s];
  const N = 28, L = [], R = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const c = bez(base, p1, p2, tip, t);
    const c2 = bez(base, p1, p2, tip, Math.min(1, t + 0.01));
    const c1 = bez(base, p1, p2, tip, Math.max(0, t - 0.01));
    let tx = c2[0] - c1[0], ty = c2[1] - c1[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const w = (baseW / 2) * Math.pow(1 - t, 0.85) + 0.6;
    L.push([c[0] - ty * w, c[1] + tx * w]); R.push([c[0] + ty * w, c[1] - tx * w]);
  }
  return L.concat(R.reverse());
}

// ---------- lettering layout ----------
function speakerAnchor(panel, rect, speaker) {
  const st = (panel.staging || []).find((s) => s.character_id === speaker);
  const fx = st ? (POS_X[st.position] ?? 0.5) : 0.5;
  const shot = panel.shot || 'medium';
  const fy = /close/.test(shot) ? 0.42 : /medium|over/.test(shot) ? 0.5 : 0.64;
  return [rect.x + rect.w * fx, rect.y + rect.h * fy];
}

export const BOX_SIZE = { min: 0.6, max: 1.8 };
export const BOX_WIDTH = { min: 0.35, max: 0.98 };
const W0 = (rect) => rect.w;
export function measureItems(ctx, project, panel, rect, opts = {}) {
  const L = project.lettering || {};
  const wavy = (L.balloon || 'wavy') === 'wavy';
  const carousel = (project.settings || {}).format !== 'pages';
  const fs = baseFontSize(project) * (opts.scale || 1) / (opts.scale || 1);
  const famName = letterFont(project);
  const out = [];
  let cursorY = rect.y + (carousel ? Math.round(rect.h * 0.012) : Math.round(fs * 0.5));
  for (const it of panel.lettering || []) {
    if (!it.text || !it.text.trim()) continue;
    const upper = L.uppercase !== false;
    const text = upper ? it.text.toUpperCase() : it.text;
    if (it.type === 'sfx') {
      const sz = Math.round(fs * 2.3);
      const font = `${sz}px Bangers`;
      const { lines, width } = layoutText(ctx, text, font, rect.w * 0.8);
      const h = lines.length * sz * 0.95;
      const pos = it.pos && Number.isFinite(it.pos.x) && Number.isFinite(it.pos.y) ? { x: Math.min(0.95, Math.max(0.05, it.pos.x)), y: Math.min(0.95, Math.max(0.05, it.pos.y)) } : { x: 0.68, y: 0.72 };
      const cx = rect.x + rect.w * pos.x, cy = rect.y + rect.h * pos.y;
      out.push({ it, kind: 'sfx', font, size: sz, lines, cx, cy, w: width, h, bbox: [cx - width / 2, cy - h / 2, width, h] });
      continue;
    }
    const isCap = it.type === 'caption';
    // per-box size (multiplier on the global size) and width (share of the slide), clamped so text stays readable and fits
    const k = Number.isFinite(it.size) ? Math.min(BOX_SIZE.max, Math.max(BOX_SIZE.min, it.size)) : 1;
    const fsi = Math.max(Math.round(W0(rect) * 0.026), Math.round(fs * k));
    const famFont = `${it.type === 'whisper' ? Math.round(fsi * 0.9) : it.type === 'shout' ? Math.round(fsi * 1.12) : fsi}px ${famName}`;
    const sz = parseInt(famFont, 10);
    const bwShare = Number.isFinite(it.width) ? Math.min(BOX_WIDTH.max, Math.max(BOX_WIDTH.min, it.width)) : null;
    const maxText = bwShare ? Math.max(sz * 3, rect.w * bwShare - sz * 1.5) : rect.w * (carousel ? 0.82 : isCap ? 0.7 : 0.55);
    const lt = layoutText(ctx, text, famFont, maxText);
    const lines = lt.lines;
    const width = bwShare ? Math.max(lt.width, Math.min(maxText, lt.width)) : lt.width;
    const lh = sz * 1.13;
    const th = lines.length * lh;
    let bw, bh;
    const classicBalloon = !wavy && !isCap;
    if (classicBalloon) { bw = width * 1.18 + sz * 1.3; bh = th * 1.28 + sz * 1.0; }
    else { bw = width + sz * 1.5; bh = th + sz * 1.05; }
    if (it.type === 'shout') { bw *= 1.12; bh *= 1.18; }
    let cx, cy;
    const okPos = it.pos && Number.isFinite(it.pos.x) && Number.isFinite(it.pos.y);
    if (okPos) {
      // a box can never leave its slide (an accidental drag on a phone used to push it off-screen)
      cx = Math.min(rect.x + rect.w - Math.min(bw, rect.w) / 2, Math.max(rect.x + Math.min(bw, rect.w) / 2, rect.x + rect.w * it.pos.x));
      cy = Math.min(rect.y + rect.h - Math.min(bh, rect.h) / 2, Math.max(rect.y + Math.min(bh, rect.h) / 2, rect.y + rect.h * it.pos.y));
    }
    else {
      if (isCap && !carousel && !wavy) { cx = rect.x + bw / 2 - (opts.border || 0) / 2; cy = rect.y + bh / 2 - (opts.border || 0) / 2; }
      else {
        const anchor = it.speaker ? speakerAnchor(panel, rect, it.speaker) : [rect.x + rect.w / 2, 0];
        const bias = carousel ? 0.35 : 0.8;
        cx = rect.x + rect.w / 2 + (anchor[0] - (rect.x + rect.w / 2)) * (isCap ? 0 : bias);
        cy = cursorY + bh / 2;
      }
      const minX = rect.x + bw / 2 + (carousel ? -rect.w * 0.02 : 8), maxX = rect.x + rect.w - bw / 2 - (carousel ? -rect.w * 0.02 : 8);
      cx = minX > maxX ? rect.x + rect.w / 2 : Math.min(maxX, Math.max(minX, cx));
    }
    cursorY = cy + bh / 2 + sz * (carousel ? 0.55 : 0.4);
    let tip = null;
    if (!isCap && it.speaker !== undefined && it.type !== 'caption') {
      if (it.tail && Number.isFinite(it.tail.x) && Number.isFinite(it.tail.y)) tip = [rect.x + rect.w * Math.min(1, Math.max(0, it.tail.x)), rect.y + rect.h * Math.min(1, Math.max(0, it.tail.y))];
      else if (it.speaker) {
        const a = speakerAnchor(panel, rect, it.speaker);
        const len = Math.min(rect.h * (carousel ? 0.3 : 0.2), Math.max(sz * 2.2, a[1] - (cy + bh / 2) - rect.h * 0.07));
        tip = [cx + (a[0] - cx) * 0.85, cy + bh / 2 + len];
      }
    }
    out.push({ it, kind: it.type || 'speech', font: famFont, size: sz, lh, lines, cx, cy, w: bw, h: bh, tw: width, tip, wavy, bbox: [cx - bw / 2, cy - bh / 2, bw, bh] });
  }
  return out;
}

function drawBalloon(ctx, m, project, W) {
  const lw = Math.max(2, W * (m.wavy ? 0.0042 : 0.0026));
  const seed = m.it.id || m.lines.join();
  const x = m.cx - m.w / 2, y = m.cy - m.h / 2;
  const step = Math.max(4, W * 0.006);
  let body;
  const isCap = m.kind === 'caption';
  const L = project.lettering || {};
  if (m.kind === 'shout') body = spikes(m.cx, m.cy, m.w / 2, m.h / 2, seed, m.size * 0.55);
  else if (m.kind === 'thought') body = cloud(m.cx, m.cy, m.w / 2 * 1.02, m.h / 2 * 1.06, seed);
  else if (m.wavy) body = wobble(roundedRectPoints(x, y, m.w, m.h, Math.min(m.h * 0.42, m.size * 1.3), step), seed, W * 0.0052, 5);
  else if (isCap) body = roundedRectPoints(x, y, m.w, m.h, 2, step);
  else body = ellipsePoints(m.cx, m.cy, m.w / 2, m.h / 2, step);
  const fill = isCap && !m.wavy ? (L.captionColor || '#fff3c4') : '#ffffff';
  let tail = null, dots = null;
  if (m.tip && m.kind !== 'thought') {
    const bx = Math.min(x + m.w * 0.78, Math.max(x + m.w * 0.22, m.cx + (m.tip[0] - m.cx) * 0.6));
    const below = m.tip[1] > m.cy;
    const base = [bx, below ? y + m.h - m.h * 0.18 : y + m.h * 0.18];
    tail = tailPoly(base, m.tip, m.wavy ? m.size * 0.62 : m.size * 0.9, seed, m.wavy);
  } else if (m.tip && m.kind === 'thought') {
    dots = [0.35, 0.65, 0.9].map((t, i) => ({ x: m.cx + (m.tip[0] - m.cx) * t, y: m.cy + m.h / 2 + (m.tip[1] - m.cy - m.h / 2) * t, r: m.size * (0.38 - i * 0.1) }));
  }
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = '#111'; ctx.lineWidth = lw;
  if (m.kind === 'whisper') ctx.setLineDash([lw * 3, lw * 2.2]);
  tracePoly(ctx, body, m.kind !== 'shout'); ctx.stroke();
  if (tail) { tracePoly(ctx, tail, false); ctx.stroke(); }
  ctx.fillStyle = fill;
  tracePoly(ctx, body, m.kind !== 'shout'); ctx.fill();
  if (tail) { tracePoly(ctx, tail, false); ctx.fill(); }
  ctx.setLineDash([]);
  if (dots) for (const d of dots) { ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 1.2, d.r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  // text
  ctx.fillStyle = '#111';
  ctx.font = m.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = m.cy - (m.lines.length * m.lh) / 2 + m.lh / 2 + m.size * 0.04;
  m.lines.forEach((l, i) => ctx.fillText(l, m.cx, top + i * m.lh));
  ctx.restore();
}

function drawSfx(ctx, m, project, W) {
  const pal = ((project.styleBible || {}).palette || []).map((p) => p.hex || p);
  const color = m.it.color || pal.find((c) => /^#?(f|e)[a-f0-9]/i.test(c)) || '#ffd23f';
  ctx.save();
  ctx.translate(m.cx, m.cy);
  ctx.rotate(((m.it.rotate ?? -7) * Math.PI) / 180);
  ctx.font = m.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const top = -((m.lines.length - 1) * m.size * 0.95) / 2;
  m.lines.forEach((l, i) => {
    ctx.lineWidth = m.size * 0.2; ctx.strokeStyle = '#111'; ctx.strokeText(l, 0, top + i * m.size * 0.95);
    ctx.fillStyle = color; ctx.fillText(l, 0, top + i * m.size * 0.95);
  });
  ctx.restore();
}

// images: { [panelId]: CanvasImageSource }
export function composePage(ctx, project, pageIndex, images = {}, opts = {}) {
  const page = project.pages[pageIndex];
  const lay = computeLayout(project, page, pageIndex);
  const { W, H } = lay;
  ctx.save();
  ctx.fillStyle = (project.settings || {}).paper || '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const hits = [];
  const rects = {};
  for (const r of lay.panels) {
    rects[r.id] = r;
    const panel = page.panels.find((p) => p.id === r.id);
    const img = images[r.id];
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    if (img && img.width) {
      const s = Math.max(r.w / img.width, r.h / img.height) * ((panel.crop && panel.crop.zoom) || 1);
      const dw = img.width * s, dh = img.height * s;
      const ox = panel.crop?.x ?? 0.5, oy = panel.crop?.y ?? 0.5;
      ctx.drawImage(img, r.x - (dw - r.w) * ox, r.y - (dh - r.h) * oy, dw, dh);
    } else {
      ctx.fillStyle = '#eceae4'; ctx.fillRect(r.x, r.y, r.w, r.h);
      if (opts.placeholders) {
        ctx.fillStyle = '#9a968c'; ctx.font = `${Math.round(W * 0.022)}px ComicNeueBold`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(opts.placeholderText?.(panel) || 'not rendered yet', r.x + r.w / 2, r.y + r.h / 2);
      }
    }
    ctx.restore();
    ctx.lineWidth = lay.border; ctx.strokeStyle = '#111'; ctx.lineJoin = 'miter';
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    hits.push({ type: 'panel', panelId: r.id, bbox: [r.x, r.y, r.w, r.h] });
  }
  // lettering on top of everything (balloons may overlap borders)
  for (const panel of page.panels) {
    const r = rects[panel.id];
    if (!r) continue;
    for (const m of measureItems(ctx, project, panel, r, { border: lay.border })) {
      if (m.kind === 'sfx') drawSfx(ctx, m, project, W); else drawBalloon(ctx, m, project, W);
      hits.push({ type: 'item', panelId: panel.id, itemId: m.it.id, bbox: m.bbox, tip: m.tip, rect: r });
    }
  }
  if ((project.settings || {}).format === 'pages' && opts.pageNumbers !== false) {
    ctx.fillStyle = '#555'; ctx.font = `${Math.round(W * 0.014)}px ComicNeueBold`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(pageIndex + 1), W / 2, H - lay.footer * 0.9);
  }
  ctx.restore();
  return { W, H, hits, layout: lay };
}

// Size (multiples of 16) for the image model so the art matches the panel aspect.
export function imageSizeForPanel(rect, model = '') {
  const ar = rect.w / rect.h;
  if (/^(gpt-image-1|chatgpt-image|dall-e)/.test(model)) return ar > 1.2 ? '1536x1024' : ar < 0.83 ? '1024x1536' : '1024x1024';
  const a = Math.min(3, Math.max(1 / 3, ar));
  const px = 1.35e6;
  let h = Math.sqrt(px / a), w = h * a;
  w = Math.round(w / 16) * 16; h = Math.round(h / 16) * 16;
  return `${w}x${h}`;
}
