import { useState } from 'react';
import PageCanvas from './PageCanvas.jsx';
import { api } from './api.js';

const TYPES = ['caption', 'speech', 'thought', 'shout', 'whisper', 'sfx'];

export default function ComicView({ project, update, run, mergeAssets, job }) {
  const [sel, setSel] = useState(null);
  const [busyPanels, setBusyPanels] = useState({});
  const [zoom, setZoom] = useState(project.settings.format === 'pages' ? 2 : 3);
  const carousel = project.settings.format !== 'pages';
  const allPanels = project.pages.flatMap((pg) => pg.panels);
  const panel = sel && allPanels.find((p) => p.id === sel.panelId);
  const item = panel && sel.itemId && panel.lettering.find((l) => l.id === sel.itemId);

  const editPanel = (pid, fn) => update((p) => ({ ...p, pages: p.pages.map((pg) => ({ ...pg, panels: pg.panels.map((x) => (x.id === pid ? fn(x) : x)) })) }));
  const editItem = (pid, iid, patch) => editPanel(pid, (x) => ({ ...x, lettering: x.lettering.map((l) => (l.id === iid ? { ...l, ...patch } : l)) }));
  const regen = async (pid, direction) => {
    setBusyPanels((b) => ({ ...b, [pid]: true }));
    await run('', async () => mergeAssets(await api.panel(project.id, pid, direction)));
    setBusyPanels((b) => ({ ...b, [pid]: false }));
  };
  const jobBusy = job?.running ? Object.fromEntries(allPanels.filter((p) => !p.art).map((p) => [p.id, true])) : {};

  return (
    <div className="comic">
      <div className="pages-wrap">
        <div className="pages-toolbar">
          <span className="muted">Click a panel or balloon to edit. Drag balloons to move them; drag the orange dot to aim a tail.</span>
          <div className="spacer" />
          <label className="muted">Columns <input type="range" min={1} max={carousel ? 5 : 3} value={zoom} onChange={(e) => setZoom(+e.target.value)} /></label>
        </div>
        <div className="pages" style={{ gridTemplateColumns: `repeat(${zoom}, minmax(0, 1fr))` }}>
          {project.pages.map((pg, i) => (
            <figure key={pg.id} className={`page ${sel?.pageIndex === i ? 'sel' : ''}`}>
              <PageCanvas project={project} pageIndex={i} selection={sel} onSelect={setSel} busyPanels={{ ...jobBusy, ...busyPanels }}
                onLetteringMove={(pid, iid, patch) => editItem(pid, iid, patch)} />
              <figcaption>
                <span>{carousel ? 'Slide' : 'Page'} {i + 1}</span>
                {!carousel && <button className="link" onClick={() => update((p) => ({ ...p, pages: p.pages.map((x, j) => (j === i ? { ...x, layoutSeed: (x.layoutSeed || 0) + 1 } : x)) }))}>Shuffle layout</button>}
                <a className="link" href={`/api/projects/${project.id}/pages/${i + 1}.png?scale=${carousel ? 1 : 1}`} download={`${carousel ? 'slide' : 'page'}-${i + 1}.png`}>PNG</a>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <aside className="inspector">
        {!panel && <div className="muted pad">Select a panel or a balloon.</div>}
        {panel && (
          <>
            {item && (
              <section>
                <h4>Lettering</h4>
                <div className="row">
                  <select value={item.type} onChange={(e) => editItem(panel.id, item.id, { type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                  {!['caption', 'sfx'].includes(item.type) && (
                    <select value={item.speaker} onChange={(e) => editItem(panel.id, item.id, { speaker: e.target.value, tail: undefined })}>
                      <option value="">(no tail)</option>{project.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
                <textarea rows={4} value={item.text} autoFocus onChange={(e) => editItem(panel.id, item.id, { text: e.target.value })} />
                <p className="hint">Text edits redraw instantly; the artwork is not regenerated.</p>
                <div className="row">
                  <button className="ghost sm" onClick={() => editItem(panel.id, item.id, { pos: undefined, tail: undefined })}>Auto-place</button>
                  <div className="spacer" />
                  <button className="ghost sm danger" onClick={() => { editPanel(panel.id, (x) => ({ ...x, lettering: x.lettering.filter((l) => l.id !== item.id) })); setSel({ ...sel, itemId: null }); }}>Delete</button>
                </div>
              </section>
            )}
            <section>
              <h4>Panel</h4>
              <div className="row wrap">
                {['caption', 'speech', 'sfx'].map((t) => (
                  <button key={t} className="ghost sm" onClick={() => { const id = Math.random().toString(36).slice(2, 10); editPanel(panel.id, (x) => ({ ...x, lettering: [...x.lettering, { id, type: t, speaker: t === 'speech' ? x.characters[0] || '' : '', text: t === 'sfx' ? 'THUMP' : '…' }] })); setSel({ ...sel, itemId: id }); }}>+ {t}</button>
                ))}
              </div>
              <label className="field"><span>Description</span><textarea rows={4} value={panel.description} onChange={(e) => editPanel(panel.id, (x) => ({ ...x, description: e.target.value }))} /></label>
              <label className="field"><span>Extra direction for a redraw (optional)</span><textarea rows={2} placeholder="e.g. more distance, Neil looks smaller, no clouds" value={panel.direction || ''} onChange={(e) => editPanel(panel.id, (x) => ({ ...x, direction: e.target.value }))} /></label>
              <button className="primary wide" disabled={!!busyPanels[panel.id]} onClick={() => regen(panel.id, panel.direction || '')}>{busyPanels[panel.id] ? 'Drawing…' : panel.art ? 'Regenerate this panel' : 'Render this panel'}</button>
              {panel.error && <div className="error sm">{panel.error}</div>}
              <h4 className="mt">Framing</h4>
              <label className="field"><span>Zoom {Math.round(((panel.crop?.zoom) || 1) * 100)}%</span><input type="range" min={1} max={2} step={0.02} value={panel.crop?.zoom || 1} onChange={(e) => editPanel(panel.id, (x) => ({ ...x, crop: { ...x.crop, zoom: +e.target.value } }))} /></label>
              <label className="field"><span>Horizontal</span><input type="range" min={0} max={1} step={0.01} value={panel.crop?.x ?? 0.5} onChange={(e) => editPanel(panel.id, (x) => ({ ...x, crop: { ...x.crop, x: +e.target.value } }))} /></label>
              <label className="field"><span>Vertical</span><input type="range" min={0} max={1} step={0.01} value={panel.crop?.y ?? 0.5} onChange={(e) => editPanel(panel.id, (x) => ({ ...x, crop: { ...x.crop, y: +e.target.value } }))} /></label>
              {panel.prompt && <details className="prompt"><summary>Image prompt sent</summary><pre>{panel.prompt}</pre></details>}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
