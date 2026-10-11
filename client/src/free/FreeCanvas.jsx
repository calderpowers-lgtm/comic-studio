import { useEffect, useRef, useState } from 'react';
import { composePage, pageSize } from '@shared/compose.js';
import { ensureFonts, slideImages } from './exporters.js';

// Live lettered slide. Optional editing: click a box to select, drag to move, drag the orange dot to aim a tail.
export default function FreeCanvas({ project, pageIndex, selection, onSelect, onMove, editable = false }) {
  const ref = useRef(null);
  const hits = useRef([]);
  const drag = useRef(null);
  const [imgs, setImgs] = useState({});
  const [fontsOk, setFontsOk] = useState(false);
  const { W, H } = pageSize(project);
  const page = project.pages[pageIndex];
  const imgKey = page.panels.map((p) => p.img || '').join('|');
  useEffect(() => { ensureFonts().then(() => setFontsOk(true)); }, []);
  useEffect(() => { let live = true; slideImages(project, pageIndex).then((m) => live && setImgs(m)); return () => { live = false; }; }, [imgKey]);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const r = composePage(ctx, project, pageIndex, imgs, { placeholders: true, placeholderText: () => 'picture goes here' });
    hits.current = r.hits;
    if (editable && selection?.itemId) {
      const h = r.hits.find((x) => x.itemId === selection.itemId);
      if (h) {
        ctx.save(); ctx.strokeStyle = '#ff4f2e'; ctx.lineWidth = W * 0.004; ctx.setLineDash([W * 0.012, W * 0.008]);
        const [x, y, w, hh] = h.bbox; const pad = W * 0.01; ctx.strokeRect(x - pad, y - pad, w + 2 * pad, hh + 2 * pad);
        if (h.tip) { ctx.setLineDash([]); ctx.fillStyle = '#ff4f2e'; ctx.beginPath(); ctx.arc(h.tip[0], h.tip[1], W * 0.016, 0, 7); ctx.fill(); }
        ctx.restore();
      }
    }
  }, [project, imgs, selection, fontsOk]);

  const pt = (e) => { const b = ref.current.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * W, ((e.clientY - b.top) / b.height) * H]; };
  const inBox = (p, [x, y, w, h]) => p[0] >= x - 8 && p[0] <= x + w + 8 && p[1] >= y - 8 && p[1] <= y + h + 8;
  const down = (e) => {
    if (!editable) return onSelect?.({ pageIndex });
    const p = pt(e);
    const sel = selection?.itemId && hits.current.find((h) => h.itemId === selection.itemId);
    if (sel?.tip && Math.hypot(p[0] - sel.tip[0], p[1] - sel.tip[1]) < W * 0.04) { drag.current = { kind: 'tail', h: sel }; return; }
    const it = [...hits.current].reverse().find((h) => h.type === 'item' && inBox(p, h.bbox));
    if (it) {
      onSelect?.({ pageIndex, panelId: it.panelId, itemId: it.itemId });
      drag.current = { kind: 'item', h: it, dx: p[0] - (it.bbox[0] + it.bbox[2] / 2), dy: p[1] - (it.bbox[1] + it.bbox[3] / 2), start: p };
    } else onSelect?.({ pageIndex, panelId: page.panels[0]?.id });
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const p = pt(e); const r = d.h.rect;
    if (d.kind === 'item') { if (Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) < 6) return; onMove(d.h.panelId, d.h.itemId, { pos: { x: (p[0] - d.dx - r.x) / r.w, y: (p[1] - d.dy - r.y) / r.h } }); }
    else onMove(d.h.panelId, d.h.itemId, { tail: { x: (p[0] - r.x) / r.w, y: (p[1] - r.y) / r.h } });
  };
  const up = () => { drag.current = null; };
  return <canvas ref={ref} width={W} height={H} className="slide-canvas" style={{ aspectRatio: `${W}/${H}`, touchAction: editable ? 'none' : 'auto' }}
    onPointerDown={(e) => { if (editable) e.currentTarget.setPointerCapture(e.pointerId); down(e); }} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />;
}
