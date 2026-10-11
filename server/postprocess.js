// Optional print-look post-process: palette snap, halftone dots in mid-tones, paper grain.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { rng } from '../shared/compose.js';

const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };

export async function postprocess(buf, opts, palette = []) {
  const img = await loadImage(buf);
  const W = img.width, H = img.height;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  const pal = palette.map((p) => hex(p.hex || p)).filter((p) => p.every((v) => !Number.isNaN(v)));
  const snap = pal.length ? Math.max(0, Math.min(1, opts.paletteSnap ?? 0.3)) : 0;
  const r = rng('grain');
  const cell = Math.max(4, Math.round(W / 170));
  const cos = Math.cos(Math.PI / 4), sin = Math.sin(Math.PI / 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let R = d[i], G = d[i + 1], B = d[i + 2];
    if (snap) {
      let best = 0, bd = 1e9;
      for (let k = 0; k < pal.length; k++) { const p = pal[k]; const dd = (p[0] - R) ** 2 * 0.3 + (p[1] - G) ** 2 * 0.59 + (p[2] - B) ** 2 * 0.11; if (dd < bd) { bd = dd; best = k; } }
      const p = pal[best]; R += (p[0] - R) * snap; G += (p[1] - G) * snap; B += (p[2] - B) * snap;
    }
    if (opts.halftone) {
      const lum = (0.3 * R + 0.59 * G + 0.11 * B) / 255;
      if (lum > 0.25 && lum < 0.85) {
        const u = (x * cos + y * sin) / cell, v = (-x * sin + y * cos) / cell;
        const du = u - Math.round(u), dv = v - Math.round(v);
        const rad = Math.sqrt(du * du + dv * dv);
        const dotR = 0.42 * Math.sqrt(1 - (lum - 0.25) / 0.6);
        if (rad < dotR) { R *= 0.86; G *= 0.86; B *= 0.86; }
      }
    }
    if (opts.grain) {
      const n = (r() - 0.5) * 14;
      R = R * 0.97 + 244 * 0.03 + n; G = G * 0.97 + 236 * 0.03 + n; B = B * 0.97 + 214 * 0.03 + n;
    }
    d[i] = R < 0 ? 0 : R > 255 ? 255 : R; d[i + 1] = G < 0 ? 0 : G > 255 ? 255 : G; d[i + 2] = B < 0 ? 0 : B > 255 ? 255 : B;
  }
  ctx.putImageData(id, 0, 0);
  return c.toBuffer('image/png');
}
