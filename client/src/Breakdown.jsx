import { uid } from './api.js';

const SHOTS = ['establishing', 'wide', 'full', 'medium', 'medium-close', 'close-up', 'extreme-close-up', 'over-the-shoulder', 'low-angle', 'high-angle', 'birds-eye'];
const POS = ['left', 'center-left', 'center', 'center-right', 'right'];
const TYPES = ['caption', 'speech', 'thought', 'shout', 'whisper', 'sfx'];

export default function Breakdown({ project, update }) {
  const carousel = project.settings.format !== 'pages';
  const b = project.styleBible || {};
  const setBible = (k, v) => update((p) => ({ ...p, styleBible: { ...p.styleBible, [k]: v } }));
  const editPanel = (pid, fn) => update((p) => ({ ...p, pages: p.pages.map((pg) => ({ ...pg, panels: pg.panels.map((x) => (x.id === pid ? fn(x) : x)) })) }));
  const setPages = (fn) => update((p) => ({ ...p, pages: fn(p.pages) }));
  const blankPanel = () => ({ id: uid(), shot: 'medium', size: 'medium', setting: '', description: '', characters: [], staging: [], lettering: [], art: null, artVersion: 0 });
  const label = carousel ? 'Slide' : 'Page';

  return (
    <div className="breakdown">
      <details className="card bible" open>
        <summary><h3>Style bible</h3><span className="muted">Injected into every image prompt, with no-text and anti-AI-look rules.</span></summary>
        <div className="bible-grid">
          {['summary', 'line_art', 'shading', 'backgrounds', 'character_design', 'texture', 'lighting', 'mood'].map((k) => (
            <label key={k} className="field"><span>{k.replace('_', ' ')}</span><textarea rows={2} value={b[k] || ''} onChange={(e) => setBible(k, e.target.value)} /></label>
          ))}
        </div>
        <div className="palette">
          {(b.palette || []).map((c, i) => (
            <label key={i} className="swatch" title={c.name}>
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#888888'} onChange={(e) => setBible('palette', b.palette.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} />
              <span>{c.name}</span>
              <button onClick={(e) => { e.preventDefault(); setBible('palette', b.palette.filter((_, j) => j !== i)); }}>×</button>
            </label>
          ))}
          <button className="swatch add" onClick={() => setBible('palette', [...(b.palette || []), { name: 'new', hex: '#cccccc' }])}>+</button>
        </div>
        <label className="field"><span>Avoid</span><input value={(b.avoid || []).join(', ')} onChange={(e) => setBible('avoid', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></label>
      </details>

      {project.pages.map((pg, pi) => (
        <div key={pg.id} className="card page-card">
          <div className="page-head">
            <h3>{label} {pi + 1}</h3>
            <div className="spacer" />
            {pi > 0 && <button className="ghost sm" onClick={() => setPages((ps) => { const a = [...ps]; [a[pi - 1], a[pi]] = [a[pi], a[pi - 1]]; return a; })}>↑</button>}
            {pi < project.pages.length - 1 && <button className="ghost sm" onClick={() => setPages((ps) => { const a = [...ps]; [a[pi + 1], a[pi]] = [a[pi], a[pi + 1]]; return a; })}>↓</button>}
            {!carousel && <button className="ghost sm" onClick={() => setPages((ps) => ps.map((x, j) => (j === pi ? { ...x, panels: [...x.panels, blankPanel()] } : x)))}>+ Panel</button>}
            <button className="ghost sm danger" onClick={() => confirm(`Delete ${label.toLowerCase()} ${pi + 1}?`) && setPages((ps) => ps.filter((_, j) => j !== pi))}>Delete</button>
          </div>
          {pg.panels.map((panel, ki) => (
            <PanelEditor key={panel.id} project={project} panel={panel} n={carousel ? null : ki + 1} carousel={carousel}
              onChange={(fn) => editPanel(panel.id, fn)}
              onDelete={() => setPages((ps) => ps.map((x, j) => (j === pi ? { ...x, panels: x.panels.filter((q) => q.id !== panel.id) } : x)))} />
          ))}
        </div>
      ))}
      <button className="ghost add-page" onClick={() => setPages((ps) => [...ps, { id: uid(), layoutSeed: 0, panels: [blankPanel()] }])}>+ Add {label.toLowerCase()}</button>
    </div>
  );
}

function PanelEditor({ project, panel, n, carousel, onChange, onDelete }) {
  const set = (k, v) => onChange((x) => ({ ...x, [k]: v }));
  const chars = project.characters;
  const toggleChar = (id) => onChange((x) => {
    const has = x.characters.includes(id);
    return {
      ...x,
      characters: has ? x.characters.filter((c) => c !== id) : [...x.characters, id],
      staging: has ? x.staging.filter((s) => s.character_id !== id) : [...x.staging, { character_id: id, position: 'center', action: '', expression: '' }],
    };
  });
  const setStage = (id, k, v) => onChange((x) => ({ ...x, staging: x.staging.map((s) => (s.character_id === id ? { ...s, [k]: v } : s)) }));
  const setItem = (iid, patch) => onChange((x) => ({ ...x, lettering: x.lettering.map((l) => (l.id === iid ? { ...l, ...patch } : l)) }));
  return (
    <div className="panel-ed">
      <div className="panel-ed-head">
        {n && <span className="pn">Panel {n}</span>}
        <select value={panel.shot} onChange={(e) => set('shot', e.target.value)}>{SHOTS.map((s) => <option key={s}>{s}</option>)}</select>
        {!carousel && <select value={panel.size} onChange={(e) => set('size', e.target.value)}>{['small', 'medium', 'large', 'splash'].map((s) => <option key={s}>{s}</option>)}</select>}
        <input className="setting" value={panel.setting} placeholder="Setting" onChange={(e) => set('setting', e.target.value)} />
        {panel.art && <span className="chip ok sm">art v{panel.artVersion}</span>}
        {n && <button className="ghost sm danger" onClick={onDelete}>×</button>}
      </div>
      <textarea rows={2} value={panel.description} placeholder="What is visible in this panel (for the illustrator)…" onChange={(e) => set('description', e.target.value)} />
      <div className="chars">
        {chars.map((c) => <button key={c.id} className={`pill ${panel.characters.includes(c.id) ? 'on' : ''}`} onClick={() => toggleChar(c.id)}>{c.name}</button>)}
      </div>
      {panel.staging.length > 0 && (
        <div className="staging">
          {panel.staging.map((s) => (
            <div key={s.character_id} className="stage-row">
              <b>{chars.find((c) => c.id === s.character_id)?.name || s.character_id}</b>
              <select value={s.position} onChange={(e) => setStage(s.character_id, 'position', e.target.value)}>{POS.map((p) => <option key={p}>{p}</option>)}</select>
              <input value={s.action} placeholder="action" onChange={(e) => setStage(s.character_id, 'action', e.target.value)} />
              <input value={s.expression} placeholder="expression" onChange={(e) => setStage(s.character_id, 'expression', e.target.value)} />
            </div>
          ))}
        </div>
      )}
      <div className="lettering">
        {panel.lettering.map((l) => (
          <div key={l.id} className={`let-row t-${l.type}`}>
            <select value={l.type} onChange={(e) => setItem(l.id, { type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            {['caption', 'sfx'].includes(l.type) ? <span className="who muted">{l.type === 'sfx' ? 'sound' : 'narration'}</span> : (
              <select className="who" value={l.speaker} onChange={(e) => setItem(l.id, { speaker: e.target.value })}><option value="">(no tail)</option>{chars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            )}
            <textarea rows={1} value={l.text} onChange={(e) => setItem(l.id, { text: e.target.value })} />
            <button className="ghost sm danger" onClick={() => onChange((x) => ({ ...x, lettering: x.lettering.filter((q) => q.id !== l.id) }))}>×</button>
          </div>
        ))}
        <div className="let-add">
          {['caption', 'speech', 'sfx'].map((t) => <button key={t} className="link" onClick={() => onChange((x) => ({ ...x, lettering: [...x.lettering, { id: uid(), type: t, speaker: t === 'speech' ? x.characters[0] || '' : '', text: '' }] }))}>+ {t}</button>)}
        </div>
      </div>
    </div>
  );
}
