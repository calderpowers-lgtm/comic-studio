// "One prompt, one upload" flow: Story → ChatGPT prompt → Upload one picture → (Text & export, shared).
import { useEffect, useRef, useState } from 'react';
import { localPlan } from '@shared/localplan.js';
import { gridPrompt } from '@shared/chatgpt.js';
import { sheetPlan, splitAdvice, CANVASES } from '@shared/grid.js';
import { hashStr } from '@shared/compose.js';
import { CopyBtn, applyPlan, SlideEditor, REF_URLS } from './Steps.jsx';
import FreeCanvas from './FreeCanvas.jsx';
import { getImage, uid } from './storage.js';
import { download, zipBlob, shareFiles, slug } from './exporters.js';
import { addSheetImage, redetect, cellsFor, sliceSheet, dropImages } from './slicer.js';

export const COUNTS = [4, 6, 8, 9, 10];
export const PROSE_EXAMPLE = `Neil is 52 and has owned a surfboard for eleven years. He has never once been in the ocean.

One Saturday he drives to the beach at sunrise, carrying the board under his arm. "Today is the day," he says.

A tiny wave rolls in. Neil stares at it. "That one looks aggressive," he mutters.

His neighbour Donna, who wears a yellow dress and has an orange bob, walks up with a coffee. "Neil, it's ankle high," she says.

"You don't know the ocean like I do, Donna."

"You've never been in the ocean."

"Exactly. That's how well I know it."

Donna sips her coffee and doesn't blink. "Okay."

They stay until the tide goes out. Neil goes home and has some soup.`;

export const planKey = (p) => String(hashStr(`${p.settings.slides}|${p.script}`));
export const sheetsOf = (p) => sheetPlan(p.pages.length || p.settings.slides, !!p.grid?.split);

// Plan the slides locally (instant). Keeps pictures in slide order.
export function planNow(p) {
  const plan = localPlan(p);
  const next = applyPlan(p, plan);
  return { ...next, planKey: planKey(p), planEdited: false, planInfo: { beats: plan.beats, silent: plan.silent } };
}
export function needsPlan(p) { return !p.pages.length || p.planKey !== planKey(p); }

// ---------------- 1. Story ----------------
export function GridStoryStep({ project, update, go }) {
  const [showStyle, setShowStyle] = useState(false);
  const n = project.settings.slides;
  const setN = (v) => update((p) => ({ ...p, settings: { ...p.settings, slides: v } }));
  const info = !needsPlan(project) && project.planInfo;
  return (
    <section className="f-card">
      <h2>Your story</h2>
      <p className="f-sub">Paste it in plain words. Dialogue in "quotes" becomes speech bubbles; the rest becomes narration.</p>
      <label className="f-field">
        <span>Story <button className="f-link" onClick={() => update({ script: PROSE_EXAMPLE, title: project.title || 'Neil and the Ocean' })}>Use an example</button></span>
        <textarea rows={11} value={project.script} placeholder={'Neil is 52 and has owned a surfboard for eleven years…'} onChange={(e) => update({ script: e.target.value })} />
      </label>
      <label className="f-field"><span>Title <em className="f-opt">optional</em></span><input value={project.title} placeholder="e.g. Neil and the Ocean" onChange={(e) => update({ title: e.target.value })} /></label>
      <div className="f-field"><span>How many slides?</span>
        <div className="f-chips">
          {COUNTS.map((c) => <button key={c} className={`f-chip ${n === c ? 'on' : ''}`} onClick={() => setN(c)}>{c}</button>)}
          {!COUNTS.includes(n) && <button className="f-chip on">{n}</button>}
        </div>
      </div>
      <div className="f-field"><span>Style</span>
        <div className="f-style">
          <div className="f-refs">{REF_URLS.map((u) => <img key={u} src={u} alt="" />)}</div>
          <div><b>Deadpan Carousel</b><p className="f-hint">Wobbly ink lines, flat bright colours, dot-eyed characters, a wavy text box on top.</p>
            <button className="f-link" onClick={() => setShowStyle(!showStyle)}>{showStyle ? 'Hide' : 'Edit'} style words</button></div>
        </div>
        {showStyle && <textarea rows={5} value={project.styleText} onChange={(e) => update({ styleText: e.target.value })} />}
      </div>
      {project.script.trim() && (
        <p className="f-hint f-planline">
          {info ? <>Split into {project.pages.length} slides{info.silent ? `, including ${info.silent} silent pause panel${info.silent > 1 ? 's' : ''} (the story is short; add more or pick fewer slides)` : ''}. </> : null}
          <button className="f-link" onClick={() => go('edit')}>Edit slides (optional)</button>
        </p>
      )}
    </section>
  );
}

// ---------------- Edit slides (optional) ----------------
export function EditSlidesStep({ project, update, notify, go }) {
  return (
    <>
      <section className="f-card">
        <h2>Edit slides <em className="f-opt">optional</em></h2>
        <p className="f-sub">This is how your story was split. Change what each picture shows or the words on it. Words can also be changed later, after the pictures are in.</p>
        <div className="f-row wrap gap">
          <button className="f-ghost sm" onClick={() => { if (!project.planEdited || confirm('Split the story again? Your edits here will be replaced.')) { update((p) => planNow(p)); notify('Split the story again.'); } }}>Split the story again</button>
        </div>
      </section>
      <SlideEditor project={project} update={(fn) => update((p) => ({ ...(typeof fn === 'function' ? fn(p) : { ...p, ...fn }), planEdited: true }))} />
      <div className="f-nav"><span /><button className="f-primary" onClick={() => go('prompt')}>Done: get the ChatGPT prompt →</button></div>
    </>
  );
}

// ---------------- 2. ChatGPT prompt ----------------
export function PromptStep({ project, update, notify, go }) {
  const [show, setShow] = useState(false);
  const sheets = sheetsOf(project);
  const advice = splitAdvice(project.pages.length);
  const split = sheets.length > 1;
  const styleFiles = async () => Promise.all(REF_URLS.map(async (u, i) => [`style-${i + 1}.jpg`, await (await fetch(u)).blob()]));
  const shareStyle = async () => {
    const files = await styleFiles();
    try { if (await shareFiles(files, 'Comic style images')) return; } catch (e) { if (e?.name === 'AbortError') return; }
    download(await zipBlob(files), 'comic-style-images.zip');
    notify('Downloaded the 4 style images (.zip).');
  };
  const desc = (s) => `${s.rows} row${s.rows > 1 ? 's' : ''} × ${s.cols} column${s.cols > 1 ? 's' : ''} in one ${CANVASES[s.canvas].label} picture`;
  return (
    <>
      <section className="f-card f-big">
        <h2>Make the pictures in ChatGPT</h2>
        <ol className="f-howto">
          <li>
            <b>Save the style images</b> to your phone.
            <button className="f-ghost f-wide" onClick={shareStyle}><span className="f-refs xs">{REF_URLS.map((u) => <img key={u} src={u} alt="" />)}</span> Share style images</button>
          </li>
          <li>
            <b>Copy the prompt.</b>
            {sheets.map((_, k) => (
              <CopyBtn key={k} className="f-primary f-wide f-huge" text={() => gridPrompt(project, sheets, k)}
                label={split ? `Copy prompt for picture ${k + 1} of 2` : 'Copy ChatGPT prompt'} notify={notify} />
            ))}
          </li>
          <li>
            In ChatGPT, start a <b>new chat</b>, attach the 4 style images (the <b>+</b> button), paste the prompt and send.
            {split && <> When picture 1 is done, paste prompt 2 <b>in the same chat</b>.</>}
            <a className="f-link f-ext" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT ↗</a>
          </li>
          <li>Save ChatGPT's picture (press and hold it → <b>Save to Photos</b>), then come back and tap <b>Next</b>.</li>
        </ol>
        <p className="f-hint">If ChatGPT puts words or bubbles in the panels, reply: <i>"Same picture again, but with no text at all."</i></p>
      </section>

      <section className="f-card">
        <div className="f-row wrap gap"><b>{project.pages.length} slides</b><div className="spacer" />
          <button className="f-link" onClick={() => go('edit')}>Edit slides</button>
          <button className="f-link" onClick={() => setShow(!show)}>{show ? 'Hide' : 'See'} prompt</button></div>
        <p className="f-hint">ChatGPT draws them as {sheets.map(desc).join(', then ')}.</p>
        {advice && (
          <label className="f-check">
            <input type="checkbox" checked={split} onChange={(e) => update((p) => ({ ...p, grid: { ...(p.grid || {}), split: e.target.checked, sheets: [] } }))} />
            <span><b>Sharper pictures: use 2 pictures instead of 1</b><br /><span className="f-hint">{advice.counts.join(' + ')} panels. Each panel is about {Math.round((advice.two / advice.one - 1) * 100)}% bigger, but it's two prompts and two uploads.</span></span>
          </label>
        )}
        {show && sheets.map((_, k) => <pre key={k} className="f-pre">{gridPrompt(project, sheets, k)}</pre>)}
        <ol className="f-mini">
          {project.pages.map((pg) => <li key={pg.id}>{pg.panels[0].description}<i>{pg.panels[0].lettering.map((l) => l.text).join(' / ')}</i></li>)}
        </ol>
      </section>
      <p className="f-hint f-center">Prefer one picture per slide? <button className="f-link" onClick={() => update((p) => ({ ...p, flow: 'slides', view: 'draw' }))}>Use the slide-by-slide way</button></p>
    </>
  );
}

// ---------------- 3. Upload ----------------
function LineEditor({ sheet, cells, onChange, onCommit }) {
  const svg = useRef(null);
  const drag = useRef(null);
  const { w, h, xs, ys } = sheet;
  const toImg = (e) => { const b = svg.current.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * w, ((e.clientY - b.top) / b.height) * h, b.width / w]; };
  const down = (e) => {
    const [x, y, k] = toImg(e);
    const tol = 22 / k; // ~22 screen px
    let best = null;
    xs.forEach((v, i) => { const d = Math.abs(x - v); if (d < tol && y >= ys[0] - tol && y <= ys.at(-1) + tol && (!best || d < best.d)) best = { axis: 'x', i, d }; });
    ys.forEach((v, i) => { const d = Math.abs(y - v); if (d < tol && x >= xs[0] - tol && x <= xs.at(-1) + tol && (!best || d < best.d)) best = { axis: 'y', i, d }; });
    if (best) { drag.current = best; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); }
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const [x, y] = toImg(e);
    const arr = (d.axis === 'x' ? xs : ys).slice();
    const lim = d.axis === 'x' ? w : h;
    const lo = d.i > 0 ? arr[d.i - 1] + 12 : 0, hi = d.i < arr.length - 1 ? arr[d.i + 1] - 12 : lim;
    arr[d.i] = Math.max(lo, Math.min(hi, d.axis === 'x' ? x : y));
    onChange(d.axis === 'x' ? { xs: arr } : { ys: arr });
  };
  const up = () => { if (drag.current) { drag.current = null; onCommit(); } };
  const sw = Math.max(w, h) * 0.004, hr = Math.max(w, h) * 0.016;
  return (
    <svg ref={svg} className="f-lines" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {cells.map((c, i) => <g key={i}><rect x={c.x} y={c.y} width={c.w} height={c.h} className="cut" style={{ strokeWidth: sw * 0.7 }} />
        <text x={c.x + c.w / 2} y={c.y + c.h / 2} className="num" style={{ fontSize: Math.min(c.w, c.h) * 0.28 }}>{i + 1}</text></g>)}
      {xs.map((x, i) => <g key={'x' + i}><line x1={x} y1={ys[0]} x2={x} y2={ys.at(-1)} className="ln" style={{ strokeWidth: sw }} /><circle cx={x} cy={(ys[0] + ys.at(-1)) / 2} r={hr} className="hd" /></g>)}
      {ys.map((y, i) => <g key={'y' + i}><line x1={xs[0]} y1={y} x2={xs.at(-1)} y2={y} className="ln" style={{ strokeWidth: sw }} /><circle cx={(xs[0] + xs.at(-1)) / 2} cy={y} r={hr} className="hd" /></g>)}
    </svg>
  );
}

function SheetSlot({ project, update, notify, plan, k, total }) {
  const fileRef = useRef();
  const sheet = project.grid?.sheets?.[k] || null;
  const [url, setUrl] = useState(null);
  const [cells, setCells] = useState([]);
  const [busy, setBusy] = useState('');
  const [hover, setHover] = useState(false);
  const [fix, setFix] = useState(false);
  const [live, setLive] = useState(null); // lines while dragging (not saved yet)
  const view = live ? { ...sheet, ...live } : sheet;
  const setSheet = (s) => update((p) => { const sheets = [...(p.grid?.sheets || [])]; sheets[k] = s; return { ...p, grid: { ...(p.grid || {}), sheets } }; });

  useEffect(() => { let u; if (sheet?.img) getImage(sheet.img).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u); } }); else setUrl(null); return () => u && URL.revokeObjectURL(u); }, [sheet?.img]);
  useEffect(() => { if (view?.img) cellsFor(view, plan.count).then(setCells); else setCells([]); }, [view?.img, JSON.stringify(view?.xs), JSON.stringify(view?.ys)]);

  // cut the panels and put them on the slides
  const slice = async (s) => {
    setBusy('Cutting panels…');
    try {
      const out = await sliceSheet(s, plan.count, (i, n) => setBusy(`Cutting panel ${i + 1} of ${n}…`));
      let old = [];
      update((p) => {
        const pages = p.pages.map((pg, j) => {
          const o = out[j - plan.start];
          if (j < plan.start || j >= plan.start + plan.count || !o) return pg;
          const x = pg.panels[0];
          if (x.img) old.push(x.img);
          return { ...pg, panels: [{ ...x, img: o.key, crop: x.crop?.user ? x.crop : o.crop, autoCrop: o.crop }] };
        });
        return { ...p, pages };
      });
      setTimeout(() => dropImages(old), 500);
      return out.length;
    } finally { setBusy(''); }
  };
  const onFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return notify('Please choose a picture.');
    setBusy('Finding the panels…');
    try {
      const s = await addSheetImage(file, plan);
      if (sheet?.img) dropImages([sheet.img]);
      setSheet(s);
      const n = await slice(s);
      notify(s.method === 'detected' ? `Found all ${n} panels.` : 'Cut evenly. Check the red lines.');
    } catch (e) { notify(e.message); setBusy(''); }
  };
  const commitLines = async () => { const s = { ...sheet, ...live, method: 'manual' }; setLive(null); setSheet(s); await slice(s); };
  const setGrid = async (rows, cols) => { const s = await redetect(sheet, rows, cols, plan.count); setSheet(s); await slice(s); };

  const label = total > 1 ? `Picture ${k + 1} of 2 (slides ${plan.start + 1}–${plan.start + plan.count})` : "ChatGPT's picture";
  return (
    <section className="f-card">
      <div className="f-row"><h2>{label}</h2><div className="spacer" />{sheet && <button className="f-link" onClick={() => fileRef.current.click()}>Choose another</button>}</div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
      {!sheet ? (
        <div className={`f-drop f-drop-big ${hover ? 'hover' : ''}`} onClick={() => fileRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setHover(true); }} onDragLeave={() => setHover(false)}
          onDrop={(e) => { e.preventDefault(); setHover(false); onFile(e.dataTransfer.files[0]); }}>
          <b>{busy || '+ Add the picture'}</b><span>Tap to pick it from Photos. Expecting {plan.rows} × {plan.cols} panels.</span>
        </div>
      ) : (
        <>
          <div className={`f-status ${sheet.method === 'detected' ? 'ok' : sheet.method === 'manual' ? 'ok' : 'warn'}`}>
            {busy || (sheet.method === 'manual' ? 'Using your lines.' : sheet.note)}
          </div>
          <div className="f-sheet-view">
            {url && <img src={url} alt="" draggable={false} />}
            {view && view.xs && <LineEditor sheet={view} cells={cells} onChange={(patch) => setLive((l) => ({ ...(l || {}), ...patch }))} onCommit={commitLines} />}
          </div>
          <p className="f-hint">Green boxes show what goes on each slide. If a cut is off, drag a red line (or its dot) onto the white gap.</p>
          <button className="f-link" onClick={() => setFix(!fix)}>{fix ? 'Hide' : 'Wrong number of rows or columns?'}</button>
          {fix && (
            <div className="f-row wrap gap f-fix">
              <label>Rows <select value={sheet.rows} onChange={(e) => setGrid(+e.target.value, sheet.cols)}>{[1, 2, 3, 4, 5, 6].map((v) => <option key={v}>{v}</option>)}</select></label>
              <label>Columns <select value={sheet.cols} onChange={(e) => setGrid(sheet.rows, +e.target.value)}>{[1, 2, 3, 4, 5, 6].map((v) => <option key={v}>{v}</option>)}</select></label>
              <button className="f-link" onClick={() => setGrid(plan.rows, plan.cols)}>Detect again</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function UploadStep({ project, update, notify, go }) {
  const sheets = sheetsOf(project);
  const [frame, setFrame] = useState(null);
  const filled = project.pages.filter((pg) => pg.panels[0].img).length;
  const setCrop = (i, crop) => update((p) => ({ ...p, pages: p.pages.map((pg, j) => (j === i ? { ...pg, panels: [{ ...pg.panels[0], crop: crop && { ...crop, user: true } }] } : pg)) }));
  return (
    <>
      {sheets.map((plan, k) => <SheetSlot key={`${k}-${plan.rows}x${plan.cols}-${plan.count}`} project={project} update={update} notify={notify} plan={plan} k={k} total={sheets.length} />)}
      {filled > 0 && (
        <section className="f-card">
          <div className="f-row"><h2>Your slides</h2><div className="spacer" /><span className="f-hint" style={{ margin: 0 }}>{filled}/{project.pages.length} have a picture</span></div>
          <p className="f-sub">Tap <b>Frame</b> to move a picture up or down inside its slide.</p>
          <div className="f-grid f-grid-phone">
            {project.pages.map((pg, i) => {
              const x = pg.panels[0], crop = x.crop || {};
              return (
                <div key={pg.id} className="f-tile">
                  <FreeCanvas project={project} pageIndex={i} />
                  <div className="f-tile-bar"><b>{i + 1}</b><div className="spacer" />{x.img && <button className="f-link" onClick={() => setFrame(frame === i ? null : i)}>Frame</button>}</div>
                  {frame === i && x.img && (
                    <div className="f-frame">
                      <label>Up / down<input type="range" min={0} max={1} step={0.01} value={crop.y ?? 0.5} onChange={(e) => setCrop(i, { ...crop, y: +e.target.value })} /></label>
                      <label>Zoom<input type="range" min={1} max={2} step={0.02} value={crop.zoom || 1} onChange={(e) => setCrop(i, { ...crop, zoom: +e.target.value })} /></label>
                      <label>Left / right<input type="range" min={0} max={1} step={0.01} value={crop.x ?? 0.5} onChange={(e) => setCrop(i, { ...crop, x: +e.target.value })} /></label>
                      <button className="f-link" onClick={() => update((p) => ({ ...p, pages: p.pages.map((pg, j) => (j === i ? { ...pg, panels: [{ ...pg.panels[0], crop: pg.panels[0].autoCrop }] } : pg)) }))}>Reset</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="f-hint">One panel came out badly? <button className="f-link" onClick={() => go('pictures')}>Replace a single slide's picture</button></p>
        </section>
      )}
    </>
  );
}
