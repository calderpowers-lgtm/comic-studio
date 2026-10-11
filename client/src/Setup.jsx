import { useRef } from 'react';
import { api, refUrl } from './api.js';
import { PAGE_ASPECTS, FONTS } from '@shared/compose.js';

const EXAMPLE = `Neil, 52, short brown hair, short beard, grey suit, stands alone in his empty living room by the window.
CAPTION: Neil, 52, stands by the window of his unfurnished home as the sun rises over the ocean.
Neil stands on the empty beach at sunset holding a surfboard he has never used.
CAPTION: He bought the surfboard eleven years ago.
NEIL: Today is the day.
A tiny wave rolls in. Neil stares at it.
NEIL: That one looks aggressive.
DONNA, his neighbour in a yellow dress with an orange bob, walks up with a coffee.
DONNA: Neil. It's ankle high.
NEIL: You don't know the ocean like I do, Donna.
DONNA: You've never been in the ocean.
Neil and Donna stand side by side on the beach, staring at the water.
NEIL: Exactly. That's how well I know it.
Close-up of Donna sipping her coffee, unblinking.
DONNA: Okay.
The beach at night. Neil sits alone in the sand next to the surfboard.
CAPTION: They stayed until the tide went out.
Neil eats soup alone in his empty living room.
CAPTION: Neil went home and had some soup.`;

export default function Setup({ project, status, update, setProject, busy, onBreakdown, flush, setError }) {
  const s = project.settings;
  const L = project.lettering;
  const fileRef = useRef(null);
  const set = (k, v) => update((p) => ({ ...p, settings: { ...p.settings, [k]: v } }));
  const setPP = (k, v) => update((p) => ({ ...p, settings: { ...p.settings, postprocess: { ...p.settings.postprocess, [k]: v } } }));
  const setL = (k, v) => update((p) => ({ ...p, lettering: { ...p.lettering, [k]: v } }));
  const carousel = s.format !== 'pages';
  const setFormat = (format) => update((p) => {
    if (p.settings.format === format) return p;
    const panels = p.pages.flatMap((pg) => pg.panels);
    let pages = p.pages;
    if (format !== 'pages') pages = panels.map((x) => ({ id: Math.random().toString(36).slice(2, 10), layoutSeed: 0, panels: [x] }));
    else { pages = []; for (let i = 0; i < panels.length; i += 4) pages.push({ id: Math.random().toString(36).slice(2, 10), layoutSeed: 0, panels: panels.slice(i, i + 4) }); }
    return { ...p, pages, settings: { ...p.settings, format } };
  });

  const applyPreset = async (id) => {
    if (project.pages.length && !confirm('Switch preset? This replaces the style text, style bible, lettering and format settings (your breakdown stays).')) return;
    await flush();
    try { setProject(await api.preset(project.id, id)); } catch (e) { setError(e.message); }
  };
  const upload = async (files) => { await flush(); try { setProject(await api.upload(project.id, files)); } catch (e) { setError(e.message); } };
  const removeRef = async (r) => { await flush(); setProject(await api.removeRef(project.id, r)); };

  return (
    <aside className="setup">
      <section>
        <label className="lbl">Title</label>
        <input value={project.title} placeholder="Untitled comic" onChange={(e) => update({ title: e.target.value })} />
      </section>
      <section>
        <div className="lbl-row"><label className="lbl">Script or idea</label><button className="link" onClick={() => update({ script: EXAMPLE, title: project.title || 'Neil and the Ocean' })}>Load example</button></div>
        <textarea className="script" rows={11} value={project.script} placeholder={'Paste a full script (NAME: dialogue, CAPTION: narration, SFX: …, plus scene lines) or just describe the idea in a few sentences.'} onChange={(e) => update({ script: e.target.value })} />
      </section>

      <section>
        <label className="lbl">Style preset</label>
        <div className="presets">
          {status.presets.map((pr) => (
            <button key={pr.id} className={`preset ${project.presetId === pr.id ? 'on' : ''}`} onClick={() => project.presetId !== pr.id && applyPreset(pr.id)}>
              <div className="preset-thumbs">{pr.refs.slice(0, 3).map((r) => <img key={r} src={`/api/preset-ref/${r}`} alt="" />)}{!pr.refs.length && <div className="preset-ph">ink · halftone</div>}</div>
              <strong>{pr.name}</strong><span>{pr.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <label className="lbl">Style description</label>
        <textarea rows={5} value={project.styleText} onChange={(e) => update({ styleText: e.target.value })} />
        <div className="lbl-row"><label className="lbl">Reference images <em>{project.refs.length}</em></label><button className="link" onClick={() => fileRef.current.click()}>+ Upload</button></div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
        <div className="refs" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload([...e.dataTransfer.files]); }}>
          {project.refs.map((r) => (
            <div key={r} className="ref"><img src={refUrl(project, r)} alt="" /><button title="Remove" onClick={() => removeRef(r)}>×</button>{r.startsWith('preset:') && <span>preset</span>}</div>
          ))}
          <button className="ref add" onClick={() => fileRef.current.click()}>Drop or<br />click</button>
        </div>
        <p className="hint">References are analysed into the style bible and sent with every panel as style guides (text in them is ignored).</p>
      </section>

      <section>
        <label className="lbl">Format</label>
        <div className="seg">
          <button className={carousel ? 'on' : ''} onClick={() => setFormat('carousel')}>Carousel slides</button>
          <button className={!carousel ? 'on' : ''} onClick={() => setFormat('pages')}>Comic pages</button>
        </div>
        <div className="row">
          {carousel ? (
            <label className="field"><span>Slides (4:5, 1080×1350)</span><input type="number" min={1} max={20} value={s.slides} onChange={(e) => set('slides', Math.max(1, Math.min(20, +e.target.value || 1)))} /></label>
          ) : (
            <>
              <label className="field"><span>Pages</span><input type="number" min={1} max={24} value={s.pages} onChange={(e) => set('pages', Math.max(1, Math.min(24, +e.target.value || 1)))} /></label>
              <label className="field"><span>Page shape</span><select value={s.pageAspect} onChange={(e) => set('pageAspect', e.target.value)}>{Object.entries(PAGE_ASPECTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            </>
          )}
        </div>
        {project.pages.length > 0 && <p className="hint">Switching format re-flows existing panels (art is kept but may crop differently). Re-run the breakdown for a proper rewrite.</p>}
      </section>

      <section>
        <label className="lbl">Lettering</label>
        <div className="row">
          <label className="field"><span>Font</span><select value={L.font} onChange={(e) => setL('font', e.target.value)}>{Object.entries(FONTS).filter(([k]) => k !== 'Bangers').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label className="field"><span>Balloons</span><select value={L.balloon} onChange={(e) => setL('balloon', e.target.value)}><option value="wavy">Hand-drawn wavy</option><option value="classic">Classic oval</option></select></label>
        </div>
        <div className="row">
          <label className="field"><span>Size {Math.round((L.scale || 1) * 100)}%</span><input type="range" min={0.7} max={1.4} step={0.05} value={L.scale || 1} onChange={(e) => setL('scale', +e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={L.uppercase !== false} onChange={(e) => setL('uppercase', e.target.checked)} /> ALL CAPS</label>
        </div>
      </section>

      <section>
        <label className="lbl">Rendering</label>
        <div className="row">
          <label className="field"><span>Image quality</span><select value={s.quality} onChange={(e) => set('quality', e.target.value)}><option value="low">Low (drafts, cheapest)</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label className="field"><span>Engine</span><select value={s.mode} onChange={(e) => set('mode', e.target.value)}><option value="auto">{status.hasKey ? 'OpenAI' : 'Auto (OpenAI when key set)'}</option><option value="mock">Mock (free, placeholder art)</option></select></label>
        </div>
        <label className="check"><input type="checkbox" checked={!!s.postprocess?.enabled} onChange={(e) => setPP('enabled', e.target.checked)} /> Print-look post-process</label>
        {s.postprocess?.enabled && (
          <div className="pp">
            <label className="field"><span>Palette snap {Math.round((s.postprocess.paletteSnap || 0) * 100)}%</span><input type="range" min={0} max={1} step={0.05} value={s.postprocess.paletteSnap || 0} onChange={(e) => setPP('paletteSnap', +e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={!!s.postprocess.halftone} onChange={(e) => setPP('halftone', e.target.checked)} /> Halftone dots</label>
            <label className="check"><input type="checkbox" checked={!!s.postprocess.grain} onChange={(e) => setPP('grain', e.target.checked)} /> Paper grain</label>
          </div>
        )}
      </section>

      <div className="setup-cta">
        <button className="primary big" disabled={!!busy || !project.script.trim()} onClick={onBreakdown}>
          {project.pages.length ? 'Re-run breakdown' : 'Break down script →'}
        </button>
        {project.pages.length > 0 && <p className="hint">Re-running replaces slides/panels and lettering (character sheets are kept by id).</p>}
      </div>
    </aside>
  );
}
