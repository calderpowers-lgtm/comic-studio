// "One prompt, one upload": choose a grid for N panels, find the gutters in ChatGPT's picture,
// cut it into panels, crop each to 4:5 and upscale cleanly. Pure JS on RGBA arrays (browser + Node).

export const CANVASES = {
  portrait: { W: 1024, H: 1536, label: 'tall (portrait)' },
  landscape: { W: 1536, H: 1024, label: 'wide (landscape)' },
  square: { W: 1024, H: 1024, label: 'square' },
};
const ASPECT = 4 / 5; // panel width / height
const GUT = 16; // gutter we ask for, in px

// Largest 4:5 panel that fits a cell of a rows×cols grid on a ChatGPT canvas.
function panelWidth(cv, rows, cols) {
  const cw = (cv.W - (cols + 1) * GUT) / cols, ch = (cv.H - (rows + 1) * GUT) / rows;
  return Math.floor(Math.min(cw, ch * ASPECT));
}

// Best single-image grid for n panels. Prefers exact grids; allows a part-empty last row only if much better.
export function bestGrid(n) {
  let best = null;
  for (const [canvas, cv] of Object.entries(CANVASES)) {
    for (let rows = 1; rows <= 6; rows++) for (let cols = 1; cols <= 6; cols++) {
      const cells = rows * cols;
      if (cells < n || cells - n >= cols) continue;
      const pw = panelWidth(cv, rows, cols);
      const score = pw * (cells === n ? 1 : 0.85) + (canvas === 'portrait' ? 1 : 0);
      if (!best || score > best.score) best = { canvas, rows, cols, count: n, panelW: pw, panelH: Math.round(pw / ASPECT), score };
    }
  }
  return best;
}

// The plan of images to ask for: 1 image normally, or 2 when `split` (only offered when it is clearly sharper).
export function sheetPlan(n, split = false) {
  if (!split) { const g = bestGrid(n); return [{ ...g, start: 0 }]; }
  let best = null;
  for (let a = Math.ceil(n / 2); a < n - 1; a++) {
    const A = bestGrid(a), B = bestGrid(n - a);
    const blanks = A.rows * A.cols - a + B.rows * B.cols - (n - a);
    const pw = Math.min(A.panelW, B.panelW) - blanks * 2; // same sharpness → prefer grids with no empty cells
    if (!best || pw > best.pw) best = { pw, sheets: [{ ...A, start: 0 }, { ...B, start: a }] };
  }
  return best ? best.sheets : sheetPlan(n, false);
}
// Offer the 2-picture option only when one picture gives small panels and two are ≥25% sharper.
export function splitAdvice(n) {
  const one = bestGrid(n).panelW;
  if (n < 2 || one >= 380) return null;
  const two = Math.min(...sheetPlan(n, true).map((s) => s.panelW));
  return two >= one * 1.25 ? { one, two, counts: sheetPlan(n, true).map((s) => s.count) } : null;
}

// ---------------- detection ----------------
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Background colour = median of the outer ring (handles cream/off-white paper). Falls back to white.
function background(d, w, h) {
  const rs = [], gs = [], bs = [];
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.004));
  const push = (x, y) => { const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
  for (let x = 0; x < w; x += 2) for (let k = 0; k < ring; k++) { push(x, k); push(x, h - 1 - k); }
  for (let y = 0; y < h; y += 2) for (let k = 0; k < ring; k++) { push(k, y); push(w - 1 - k, y); }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  const bg = [med(rs), med(gs), med(bs)];
  return lum(...bg) > 170 ? bg : [255, 255, 255];
}

// 1 where a pixel looks like gutter/paper: close to the background colour, or near-white & unsaturated.
export function bgMask(d, w, h, bg = background(d, w, h)) {
  const m = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const dist = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    m[p] = dist < 54 || (lo > 222 && hi - lo < 26) ? 1 : 0;
  }
  return m;
}

function profiles(m, w, h, box) {
  const [x0, y0, x1, y1] = box;
  const col = new Float32Array(w), row = new Float32Array(h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (m[y * w + x]) { col[x]++; row[y]++; }
  for (let x = 0; x < w; x++) col[x] /= y1 - y0;
  for (let y = 0; y < h; y++) row[y] /= x1 - x0;
  return { col, row };
}

// Runs of positions whose "paper fraction" is ≥ t. Tiny gaps inside a run are bridged.
function runs(p, t, from, to) {
  const out = []; let s = -1, gap = 0;
  for (let i = from; i < to; i++) {
    if (p[i] >= t) { if (s < 0) s = i; gap = 0; }
    else if (s >= 0) { if (++gap > 2) { out.push([s, i - gap]); s = -1; gap = 0; } }
  }
  if (s >= 0) out.push([s, to - 1 - gap]);
  return out.filter(([a, b]) => b - a >= 1);
}

// Gutters along one axis: content bounds + interior runs (with centre and width).
function axisGutters(p, len, t) {
  const rs = runs(p, t, 0, len);
  let lo = 0, hi = len;
  if (rs.length && rs[0][0] <= 1) lo = rs.shift()[1] + 1;
  if (rs.length && rs.at(-1)[1] >= len - 2) hi = rs.pop()[0];
  const minCell = (hi - lo) * 0.08;
  const inner = rs.filter(([a, b]) => a - lo > minCell && hi - b > minCell).map(([a, b]) => ({ c: (a + b) / 2, w: b - a + 1 }));
  return { lo, hi, inner };
}

// Pick k-1 cut lines from candidates, as close as possible to an even split; fill gaps evenly.
function fitCuts(ax, k) {
  const { lo, hi, inner } = ax;
  const step = (hi - lo) / k, cuts = [lo], widths = [0];
  let found = 0;
  const known = inner.map((g) => g.w).sort((a, b) => a - b);
  const typical = known.length ? known[known.length >> 1] : Math.round((hi - lo) * 0.012);
  for (let i = 1; i < k; i++) {
    const want = lo + i * step;
    const cand = inner.filter((g) => Math.abs(g.c - want) < step * 0.3).sort((a, b) => Math.abs(a.c - want) - Math.abs(b.c - want))[0];
    if (cand) found++;
    cuts.push(cand ? cand.c : want); widths.push(cand ? cand.w : -typical); // negative = guessed
  }
  cuts.push(hi); widths.push(0);
  return { cuts, widths, found };
}

const evenSpaced = (inner, lo, hi) => {
  const pts = [lo, ...inner.map((g) => g.c), hi];
  const d = pts.slice(1).map((v, i) => v - pts[i]);
  const avg = (hi - lo) / d.length;
  return d.every((x) => Math.abs(x - avg) < avg * 0.28);
};

/**
 * Find the grid. Returns { xs, ys, rows, cols, method, note }.
 * xs/ys are cut lines (outer edges + gutter centres), in image pixels; xw/yw the gutter widths
 * (0 for outer edges, negative = width guessed because that gutter wasn't seen).
 * method: 'detected' (all gutters found) | 'partial' (some guessed) | 'even' (even split fallback).
 */
export function detectGrid(d, w, h, rows, cols, n = rows * cols) {
  const m = bgMask(d, w, h);
  let best = null;
  for (const t of [0.97, 0.92, 0.85]) {
    // first pass on the whole image gives the content box; second pass restricted to it sharpens the profiles
    const p0 = profiles(m, w, h, [0, 0, w, h]);
    const X0 = axisGutters(p0.col, w, t), Y0 = axisGutters(p0.row, h, t);
    const p = profiles(m, w, h, [X0.lo, Y0.lo, X0.hi, Y0.hi]);
    const X = axisGutters(p.col, w, t), Y = axisGutters(p.row, h, t);
    X.lo = Math.max(X.lo, X0.lo); X.hi = Math.min(X.hi, X0.hi); Y.lo = Math.max(Y.lo, Y0.lo); Y.hi = Math.min(Y.hi, Y0.hi);
    // Did ChatGPT draw a different (but usable) grid, e.g. 5×2 instead of 2×5?
    const r2 = Y.inner.length + 1, c2 = X.inner.length + 1;
    if ((r2 !== rows || c2 !== cols) && r2 * c2 >= n && r2 * c2 - n < c2 && evenSpaced(X.inner, X.lo, X.hi) && evenSpaced(Y.inner, Y.lo, Y.hi)) {
      const fx = fitCuts(X, c2), fy = fitCuts(Y, r2);
      return { xs: fx.cuts, ys: fy.cuts, xw: fx.widths, yw: fy.widths, rows: r2, cols: c2, method: 'detected', note: `ChatGPT drew ${r2} × ${c2} instead of ${rows} × ${cols}; that works too.` };
    }
    const fx = fitCuts(X, cols), fy = fitCuts(Y, rows);
    const score = fx.found + fy.found;
    if (!best || score > best.score) best = { score, xs: fx.cuts, ys: fy.cuts, xw: fx.widths, yw: fy.widths };
    if (score === rows - 1 + cols - 1) break;
  }
  const need = rows - 1 + cols - 1;
  const method = need === 0 || best.score === need ? 'detected' : best.score > 0 ? 'partial' : 'even';
  const note = method === 'detected' ? `Found the ${rows} × ${cols} grid.` : method === 'partial' ? 'Found some of the white lines; guessed the rest. Check the red lines.' : "Couldn't see clear white lines, so it's split evenly. Drag the red lines onto the gaps.";
  return { xs: best.xs, ys: best.ys, xw: best.xw, yw: best.yw, rows, cols, method, note };
}

// Shrink a cell past paper and any drawn panel border so only the art remains.
export function trimCell(d, w, h, rect, m, paperLimit = 0.12) {
  let [x0, y0, x1, y1] = rect.map(Math.round);
  const frac = (fn, a, b, horiz) => { let c = 0, n = 0; for (let k = a; k < b; k += 1) { if (fn(horiz ? k : 0, horiz ? 0 : k)) c++; n++; } return c / Math.max(1, n); };
  const isPaper = (x, y) => m[y * w + x] === 1;
  const isInk = (x, y) => { const i = (y * w + x) * 4; return lum(d[i], d[i + 1], d[i + 2]) < 90; };
  const colF = (x, f) => frac((_, y) => f(x, y), y0, y1, false);
  const rowF = (y, f) => frac((x) => f(x, y), x0, x1, true);
  const maxX = Math.round((x1 - x0) * 0.12), maxY = Math.round((y1 - y0) * 0.12);
  // paper, then a dark frame line (≤2.5%), then paper again inside the frame
  // paper (only near-solid paper lines), then a dark frame line (≤2.5%), then paper again inside a removed frame
  const pass = (f, lim, thr) => {
    let moved = 0, k;
    k = 0; while (k < maxX * lim && x0 < x1 - 8 && colF(x0, f) > thr) { x0++; k++; } moved += k;
    k = 0; while (k < maxX * lim && x1 - 1 > x0 + 8 && colF(x1 - 1, f) > thr) { x1--; k++; } moved += k;
    k = 0; while (k < maxY * lim && y0 < y1 - 8 && rowF(y0, f) > thr) { y0++; k++; } moved += k;
    k = 0; while (k < maxY * lim && y1 - 1 > y0 + 8 && rowF(y1 - 1, f) > thr) { y1--; k++; } moved += k;
    return moved;
  };
  pass(isPaper, paperLimit / 0.12, 0.85);
  if (pass(isInk, 0.025 / 0.12, 0.6)) pass(isPaper, 0.012 / 0.12, 0.85);
  const ix = Math.round((x1 - x0) * 0.006), iy = Math.round((y1 - y0) * 0.006); // shave antialiased edge
  return [x0 + ix, y0 + iy, x1 - ix, y1 - iy];
}

// Largest centred 4:5 box inside a rect.
export function crop45([x0, y0, x1, y1]) {
  const w = x1 - x0, h = y1 - y0;
  if (w / h > ASPECT) { const nw = h * ASPECT; return [x0 + (w - nw) / 2, y0, nw, h]; }
  const nh = w / ASPECT; return [x0, y0 + (h - nh) / 2, w, nh];
}

// Cells in reading order: [{x,y,w,h}] trimmed to the art (not yet cropped to 4:5), n of them.
export function cellsFromLines(d, w, h, xs, ys, n, m = bgMask(d, w, h), xw = [], yw = []) {
  const out = [];
  const half = (a, i) => Math.abs(a[i] || 0) / 2;
  const guessed = (a, i, j) => (a[i] || 0) < 0 || (a[j] || 0) < 0;
  for (let r = 0; r < ys.length - 1; r++) for (let c = 0; c < xs.length - 1; c++) {
    if (out.length >= n) break;
    const rect = [xs[c] + half(xw, c), ys[r] + half(yw, r), xs[c + 1] - half(xw, c + 1), ys[r + 1] - half(yw, r + 1)];
    // known gutter edges: only trim jitter/frames (2.5%); guessed edges: allow more paper trimming
    const t = trimCell(d, w, h, rect, m, guessed(xw, c, c + 1) || guessed(yw, r, r + 1) ? 0.06 : 0.025);
    out.push({ x: t[0], y: t[1], w: t[2] - t[0], h: t[3] - t[1] });
  }
  return out;
}

// ---------------- resampling ----------------
function lanczosWeights(srcLen, dstLen, srcStart, srcSpan, a = 3) {
  const scale = srcSpan / dstLen, filt = Math.max(1, scale), support = a * filt;
  const idx = [], wts = [];
  for (let i = 0; i < dstLen; i++) {
    const c = srcStart + (i + 0.5) * scale - 0.5;
    const lo = Math.max(0, Math.floor(c - support)), hi = Math.min(srcLen - 1, Math.ceil(c + support));
    const ws = []; let sum = 0;
    for (let j = lo; j <= hi; j++) {
      const x = (j - c) / filt;
      const v = x === 0 ? 1 : Math.abs(x) >= a ? 0 : (a * Math.sin(Math.PI * x) * Math.sin((Math.PI * x) / a)) / (Math.PI * Math.PI * x * x);
      ws.push(v); sum += v;
    }
    idx.push(lo); wts.push(Float32Array.from(ws, (v) => v / sum));
  }
  return { idx, wts };
}

// Lanczos-3 resample of a sub-rectangle of an RGBA image to dw×dh. Returns Uint8ClampedArray RGBA.
export function resampleRect(src, sw, sh, [rx, ry, rw, rh], dw, dh) {
  const H = lanczosWeights(sw, dw, rx, rw), V = lanczosWeights(sh, dh, ry, rh);
  const y0 = Math.max(0, Math.floor(ry) - 8), y1 = Math.min(sh, Math.ceil(ry + rh) + 8), th = y1 - y0;
  const tmp = new Float32Array(dw * th * 3);
  for (let y = 0; y < th; y++) {
    const row = (y + y0) * sw * 4;
    for (let x = 0; x < dw; x++) {
      const w = H.wts[x]; let j = row + H.idx[x] * 4, r = 0, g = 0, b = 0;
      for (let k = 0; k < w.length; k++, j += 4) { r += src[j] * w[k]; g += src[j + 1] * w[k]; b += src[j + 2] * w[k]; }
      const o = (y * dw + x) * 3; tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b;
    }
  }
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const w = V.wts[y], base = V.idx[y] - y0;
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < w.length; k++) { const yy = Math.min(th - 1, Math.max(0, base + k)); const o = (yy * dw + x) * 3; r += tmp[o] * w[k]; g += tmp[o + 1] * w[k]; b += tmp[o + 2] * w[k]; }
      const o = (y * dw + x) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
  }
  return out;
}

// Light unsharp mask (separable Gaussian). amount ~0.5, sigma in px, threshold skips flat-colour noise.
export function unsharp(px, w, h, amount = 0.55, sigma = 1.4, threshold = 3) {
  const r = Math.ceil(sigma * 2.5), K = 2 * r + 1, k = new Float32Array(K);
  let s = 0; for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v; }
  for (let i = 0; i < K; i++) k[i] /= s;
  const n = w * h, a = new Float32Array(n * 3), b = new Float32Array(n * 3);
  // horizontal pass (clamped edges)
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let r0 = 0, g0 = 0, b0 = 0;
      for (let i = 0; i < K; i++) {
        let xx = x + i - r; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx;
        const o = (row + xx) << 2, kv = k[i];
        r0 += px[o] * kv; g0 += px[o + 1] * kv; b0 += px[o + 2] * kv;
      }
      const o = (row + x) * 3; a[o] = r0; a[o + 1] = g0; a[o + 2] = b0;
    }
  }
  // vertical pass
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < K; i++) {
      let yy = y + i - r; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
      const kv = k[i], src = yy * w * 3, dst = y * w * 3;
      for (let j = 0; j < w * 3; j++) b[dst + j] += a[src + j] * kv;
    }
  }
  for (let p = 0; p < n; p++) {
    const o = p << 2, q = p * 3;
    for (let c = 0; c < 3; c++) { const diff = px[o + c] - b[q + c]; if (diff > threshold || diff < -threshold) px[o + c] = px[o + c] + diff * amount; }
  }
  return px;
}

export const SLIDE_W = 1080, SLIDE_H = 1350;
// Output size that covers a 1080×1350 slide (the 4:5 framing is done later by the compositor,
// so nothing is thrown away if ChatGPT's panels are taller or wider than 4:5).
export function coverSize(cell, dw = SLIDE_W, dh = SLIDE_H) {
  const k = Math.max(dw / cell.w, dh / cell.h);
  return { w: Math.round(cell.w * k), h: Math.round(cell.h * k), scale: k };
}
// Default framing: keep a little more of the bottom on tall panels (the top quarter is empty sky by design).
export const defaultCrop = (cell) => (cell.w / cell.h < 0.75 ? { y: 0.62 } : undefined);

// Cut one cell out and upscale it so it covers a 1080×1350 slide:
// light unsharp mask at the source resolution (cheap, crisps the ink lines), then Lanczos-3 upscale.
export function slicePanel(src, sw, sh, cell) {
  const { w: dw, h: dh, scale } = coverSize(cell);
  const pad = 6;
  const x0 = Math.max(0, Math.floor(cell.x) - pad), y0 = Math.max(0, Math.floor(cell.y) - pad);
  const x1 = Math.min(sw, Math.ceil(cell.x + cell.w) + pad), y1 = Math.min(sh, Math.ceil(cell.y + cell.h) + pad);
  const w = x1 - x0, h = y1 - y0, sub = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) sub.set(src.subarray(((y + y0) * sw + x0) * 4, ((y + y0) * sw + x1) * 4), y * w * 4);
  if (scale > 1.2) unsharp(sub, w, h, 0.45, 0.75, 2);
  const out = resampleRect(sub, w, h, [cell.x - x0, cell.y - y0, cell.w, cell.h], dw, dh);
  if (scale <= 1.2) unsharp(out, dw, dh, 0.25, 1, 2);
  return { px: out, w: dw, h: dh };
}
