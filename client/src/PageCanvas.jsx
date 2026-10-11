import { useEffect, useRef, useState } from 'react';
import { composePage, pageSize } from '@shared/compose.js';
import { artUrl } from './api.js';

const imgCache = new Map();
function loadImg(url) {
  if (!imgCache.has(url)) imgCache.set(url, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }));
  return imgCache.get(url);
}
let fontsReady = null;
export function ensureFonts() {
  if (!fontsReady) fontsReady = Promise.all(['ComicNeueBold', 'PatrickHand', 'Bangers'].map((f) => document.fonts.load(`40px ${f}`, 'ABC'))).catch(() => {});
  return fontsReady;
}

// Live composed page with direct manipulation of lettering (drag balloons, drag tail tips).
export default function PageCanvas({ project, pageIndex, selection, onSelect, onLetteringMove, busyPanels = {} }) {
  const ref = useRef(null);
  const hitsRef = useRef([]);
  const drag = useRef(null);
  const [images, setImages] = useState({});
  const page = project.pages[pageIndex];
  const { W, H } = pageSize(project);
  const artKey = page.panels.map((p) => artUrl(project, p)).join('|');

  useEffect(() => {
    let live = true;
    (async () => {
      await ensureFonts();
      const entries = await Promise.all(page.panels.map(async (p) => [p.id, artUrl(project, p) ? await loadImg(artUrl(project, p)) : null]));
      if (live) setImages(Object.fromEntries(entries.filter(([, i]) => i)));
    })();
    return () => { live = false; };
  }, [artKey]);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const r = composePage(ctx, project, pageIndex, images, { placeholders: true, placeholderText: (p) => (busyPanels[p.id] ? 'drawing…' : p.error ? 'render failed: see panel inspector' : 'not rendered yet') });
    hitsRef.current = r.hits;
    // selection overlay
    const sel = r.hits.find((h) => (selection?.itemId ? h.itemId === selection.itemId : h.type === 'panel' && h.panelId === selection?.panelId));
    if (sel) {
      ctx.save();
      ctx.strokeStyle = '#ff4f2e'; ctx.lineWidth = W * 0.003; ctx.setLineDash([W * 0.01, W * 0.007]);
      const [x, y, w, h] = sel.bbox; const pad = sel.type === 'item' ? W * 0.008 : -W * 0.006;
      ctx.strokeRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
      if (sel.tip) { ctx.setLineDash([]); ctx.fillStyle = '#ff4f2e'; ctx.beginPath(); ctx.arc(sel.tip[0], sel.tip[1], W * 0.011, 0, 7); ctx.fill(); }
      ctx.restore();
    }
  }, [project, images, selection, busyPanels]);

  const toLocal = (e) => { const b = ref.current.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * W, ((e.clientY - b.top) / b.height) * H]; };
  const inBox = (pt, [x, y, w, h], pad = 0) => pt[0] >= x - pad && pt[0] <= x + w + pad && pt[1] >= y - pad && pt[1] <= y + h + pad;

  const down = (e) => {
    const pt = toLocal(e);
    const hits = hitsRef.current;
    const sel = selection?.itemId && hits.find((h) => h.itemId === selection.itemId);
    if (sel?.tip && Math.hypot(pt[0] - sel.tip[0], pt[1] - sel.tip[1]) < W * 0.025) { drag.current = { kind: 'tail', hit: sel }; return; }
    const item = [...hits].reverse().find((h) => h.type === 'item' && inBox(pt, h.bbox, W * 0.005));
    if (item) {
      onSelect({ pageIndex, panelId: item.panelId, itemId: item.itemId });
      drag.current = { kind: 'item', hit: item, dx: pt[0] - (item.bbox[0] + item.bbox[2] / 2), dy: pt[1] - (item.bbox[1] + item.bbox[3] / 2), moved: false };
      return;
    }
    const panel = hits.find((h) => h.type === 'panel' && inBox(pt, h.bbox));
    onSelect(panel ? { pageIndex, panelId: panel.panelId } : null);
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const pt = toLocal(e);
    const r = d.hit.rect;
    if (d.kind === 'item') onLetteringMove(d.hit.panelId, d.hit.itemId, { pos: { x: (pt[0] - d.dx - r.x) / r.w, y: (pt[1] - d.dy - r.y) / r.h } });
    else onLetteringMove(d.hit.panelId, d.hit.itemId, { tail: { x: (pt[0] - r.x) / r.w, y: (pt[1] - r.y) / r.h } });
  };
  const up = () => { drag.current = null; };

  return (
    <canvas ref={ref} width={W} height={H} className="page-canvas" style={{ aspectRatio: `${W}/${H}` }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); down(e); }} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
  );
}
