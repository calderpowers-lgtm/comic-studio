import { useEffect, useRef, useState } from 'react';
import { localPlan, parseReply } from '@shared/localplan.js';
import { planPrompt, sheetPrompt, panelPrompt, allPrompts, standalonePrompt } from '@shared/chatgpt.js';
import FreeCanvas from './FreeCanvas.jsx';
import { putImage, delImage, getImage, uid } from './storage.js';
import { copyText, download, zipBlob, allSlideBlobs, pdfBlob, renderSlideBlob, slideName, shareFiles, slug } from './exporters.js';

const REF_URLS = [1, 2, 3, 4].map((n) => new URL(`./assets/refs/ref-${n}.jpg`, import.meta.url).href);
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

const TYPE_LABEL = { caption: 'Narration box', speech: 'Speech', thought: 'Thought', shout: 'Shout', whisper: 'Whisper', sfx: 'Sound effect' };

function CopyBtn({ text, label = 'Copy', done = 'Copied ✓', className = 'f-primary', onCopied, notify }) {
  const [ok, setOk] = useState(false);
  return (
    <button className={`${className} ${ok ? 'copied' : ''}`} onClick={async () => {
      const r = await copyText(typeof text === 'function' ? text() : text);
      setOk(r); onCopied?.(); notify?.(r ? 'Copied. Now paste it into ChatGPT.' : 'Could not copy automatically; select the text and copy it.');
      setTimeout(() => setOk(false), 2200);
    }}>{ok ? done : label}</button>
  );
}

// Convert a parsed plan into project pages (keeps existing pictures in slide order, and sheets by character id).
function applyPlan(p, plan) {
  const oldPanels = p.pages.map((pg) => pg.panels[0]);
  const pages = plan.pages.map((pg, i) => {
    const src = pg.panels[0];
    const old = oldPanels[i];
    return { id: uid(), layoutSeed: 0, panels: [{ ...src, id: old?.id || uid(), img: old?.img || null, crop: old?.crop, lettering: src.lettering.map((l) => ({ ...l, id: uid() })) }] };
  });
  const characters = plan.characters.map((c) => ({ ...c, sheet: p.characters.find((o) => o.id === c.id)?.sheet || null }));
  return { ...p, title: p.title || plan.title || '', pages, characters };
}

// ---------------- 1. Story ----------------
export function StoryStep({ project, update }) {
  const [showStyle, setShowStyle] = useState(false);
  return (
    <section className="f-card">
      <h2>What's your comic about?</h2>
      <p className="f-sub">Paste a script, or just describe the idea in a few sentences.</p>
      <label className="f-field"><span>Title</span><input value={project.title} placeholder="e.g. Neil and the Ocean" onChange={(e) => update({ title: e.target.value })} /></label>
      <label className="f-field">
        <span>Script or idea <button className="f-link" onClick={() => update({ script: EXAMPLE, title: project.title || 'Neil and the Ocean' })}>Use the example</button></span>
        <textarea className="mono" rows={12} value={project.script} placeholder={'NEIL: Today is the day.\nCAPTION: He bought the surfboard eleven years ago.\nOr just: "A man who has owned a surfboard for 11 years finally goes to the beach…"'} onChange={(e) => update({ script: e.target.value })} />
      </label>
      <p className="f-hint">Tip: lines like <code>NAME: words</code> become speech, <code>CAPTION: words</code> become narration boxes, and other lines describe the picture.</p>
      <div className="f-field"><span>How many slides?</span>
        <div className="f-stepper">
          <button onClick={() => update((p) => ({ ...p, settings: { ...p.settings, slides: Math.max(1, p.settings.slides - 1) } }))}>−</button>
          <b>{project.settings.slides}</b>
          <button onClick={() => update((p) => ({ ...p, settings: { ...p.settings, slides: Math.min(20, p.settings.slides + 1) } }))}>+</button>
          <span className="f-hint">Instagram allows up to 20.</span>
        </div>
      </div>
      <div className="f-field"><span>Style</span>
        <div className="f-style">
          <div className="f-refs">{REF_URLS.map((u) => <img key={u} src={u} alt="" />)}</div>
          <div><b>Deadpan Carousel</b><p className="f-hint">Thick wobbly ink lines, flat bright colours, dot-eyed characters, a wavy text box on top.</p>
            <button className="f-link" onClick={() => setShowStyle(!showStyle)}>{showStyle ? 'Hide' : 'Edit'} style words</button></div>
        </div>
        {showStyle && <textarea rows={5} value={project.styleText} onChange={(e) => update({ styleText: e.target.value })} />}
      </div>
    </section>
  );
}

// ---------------- 2. Plan ----------------
export function PlanStep({ project, update, notify }) {
  const [reply, setReply] = useState('');
  const [err, setErr] = useState('');
  const doParse = () => {
    try { const plan = parseReply(reply); update((p) => applyPlan(p, plan)); setErr(''); setReply(''); notify(`Got ${plan.pages.length} slides from ChatGPT.`); }
    catch (e) { setErr(e.message); }
  };
  const quick = () => {
    if (!project.script.trim()) return setErr('Write or paste your script in step 1 first.');
    if (project.pages.length && !confirm('Replace the current slides with a quick plan? Pictures stay in order.')) return;
    const plan = localPlan(project); update((p) => applyPlan(p, { ...plan, pages: plan.pages })); setErr(''); notify(`Made ${plan.pages.length} slides from your script.`);
  };
  return (
    <>
      <section className="f-card">
        <h2>Turn the script into slides</h2>
        <p className="f-sub">Pick one. You can edit every slide afterwards.</p>
        <div className="f-choices">
          <div className="f-choice">
            <h3>A · Ask ChatGPT <em>best</em></h3>
            <ol>
              <li>Copy this prompt and paste it into a ChatGPT chat. <CopyBtn text={() => planPrompt(project)} label="Copy prompt" notify={notify} /></li>
              <li>Copy ChatGPT's whole answer and paste it here:
                <textarea rows={5} value={reply} placeholder="Paste ChatGPT's reply here…" onChange={(e) => setReply(e.target.value)} /></li>
              <li><button className="f-primary" disabled={!reply.trim()} onClick={doParse}>Use this reply</button></li>
            </ol>
          </div>
          <div className="f-choice">
            <h3>B · Quick plan</h3>
            <p className="f-hint">No ChatGPT needed: each <code>CAPTION:</code> or <code>NAME:</code> line becomes a slide (merged if there are more lines than slides).</p>
            <button className="f-ghost" onClick={quick}>Make slides from my lines</button>
          </div>
        </div>
        {err && <div className="f-error">{err}</div>}
      </section>
      {project.pages.length > 0 && <SlideEditor project={project} update={update} />}
    </>
  );
}

function SlideEditor({ project, update }) {
  const chars = project.characters;
  const editPanel = (pid, fn) => update((p) => ({ ...p, pages: p.pages.map((pg) => ({ ...pg, panels: pg.panels.map((x) => (x.id === pid ? fn(x) : x)) })) }));
  const setItem = (pid, iid, patch) => editPanel(pid, (x) => ({ ...x, lettering: x.lettering.map((l) => (l.id === iid ? { ...l, ...patch } : l)) }));
  return (
    <section className="f-card">
      <div className="f-row"><h2>{project.pages.length} slides</h2><div className="spacer" />
        <button className="f-ghost sm" onClick={() => update((p) => ({ ...p, pages: [...p.pages, { id: uid(), layoutSeed: 0, panels: [{ id: uid(), shot: 'medium', setting: '', description: '', characters: [], staging: [], lettering: [] }] }] }))}>+ Add slide</button></div>
      <div className="f-slides">
        {project.pages.map((pg, i) => {
          const x = pg.panels[0];
          return (
            <div key={pg.id} className="f-slide-ed">
              <div className="f-row"><b>Slide {i + 1}</b><div className="spacer" />
                <button className="f-icon" title="Move up" disabled={i === 0} onClick={() => update((p) => { const a = [...p.pages]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...p, pages: a }; })}>↑</button>
                <button className="f-icon" title="Move down" disabled={i === project.pages.length - 1} onClick={() => update((p) => { const a = [...p.pages]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return { ...p, pages: a }; })}>↓</button>
                <button className="f-icon danger" title="Delete slide" onClick={() => confirm(`Delete slide ${i + 1}?`) && update((p) => ({ ...p, pages: p.pages.filter((_, j) => j !== i) }))}>×</button>
              </div>
              <label className="f-field"><span>Picture</span><textarea rows={2} value={x.description} onChange={(e) => editPanel(x.id, (q) => ({ ...q, description: e.target.value }))} /></label>
              {chars.length > 0 && (
                <div className="f-pills">{chars.map((c) => {
                  const on = x.characters.includes(c.id);
                  return <button key={c.id} className={`f-pill ${on ? 'on' : ''}`} onClick={() => editPanel(x.id, (q) => ({ ...q, characters: on ? q.characters.filter((k) => k !== c.id) : [...q.characters, c.id], staging: on ? q.staging.filter((s) => s.character_id !== c.id) : [...q.staging, { character_id: c.id, position: 'center', action: '', expression: '' }] }))}>{c.name}</button>;
                })}</div>
              )}
              {x.lettering.map((l) => (
                <div key={l.id} className="f-let">
                  <select value={l.type} onChange={(e) => setItem(x.id, l.id, { type: e.target.value })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  {!['caption', 'sfx'].includes(l.type) && <select value={l.speaker} onChange={(e) => setItem(x.id, l.id, { speaker: e.target.value, tail: undefined })}><option value="">(nobody)</option>{chars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
                  <textarea rows={2} value={l.text} onChange={(e) => setItem(x.id, l.id, { text: e.target.value })} />
                  <button className="f-icon danger" onClick={() => editPanel(x.id, (q) => ({ ...q, lettering: q.lettering.filter((k) => k.id !== l.id) }))}>×</button>
                </div>
              ))}
              <div className="f-row gap"><button className="f-link" onClick={() => editPanel(x.id, (q) => ({ ...q, lettering: [...q.lettering, { id: uid(), type: 'caption', speaker: '', text: '' }] }))}>+ narration</button>
                <button className="f-link" onClick={() => editPanel(x.id, (q) => ({ ...q, lettering: [...q.lettering, { id: uid(), type: 'speech', speaker: q.characters[0] || '', text: '' }] }))}>+ speech</button></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- 3. Characters ----------------
export function CastStep({ project, update, notify }) {
  const [urls, setUrls] = useState({});
  useEffect(() => { project.characters.forEach(async (c) => { if (c.sheet && !urls[c.sheet]) { const b = await getImage(c.sheet); if (b) setUrls((u) => ({ ...u, [c.sheet]: URL.createObjectURL(b) })); } }); }, [project.characters]);
  const edit = (id, patch) => update((p) => ({ ...p, characters: p.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const upload = async (c, file) => { const key = 'sheet:' + uid(); await putImage(key, file); if (c.sheet) delImage(c.sheet); edit(c.id, { sheet: key }); notify(`Saved ${c.name}'s sheet.`); };
  return (
    <section className="f-card">
      <h2>Characters <span className="f-opt">optional, but recommended</span></h2>
      <p className="f-sub">A reference sheet per character helps ChatGPT draw them the same way on every slide. In ChatGPT: attach the 4 style images (download them in the next step), paste the prompt, then save the picture and add it here.</p>
      {!project.characters.length && <p className="f-hint">No characters in this plan.</p>}
      <div className="f-cast">
        {project.characters.map((c) => (
          <div key={c.id} className="f-char">
            <label className={`f-sheet ${c.sheet ? 'has' : ''}`}>
              {c.sheet && urls[c.sheet] ? <img src={urls[c.sheet]} alt="" /> : <span>+ Add {c.name}'s sheet</span>}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && upload(c, e.target.files[0])} />
            </label>
            <div className="f-char-body">
              <input className="f-name" value={c.name} onChange={(e) => edit(c.id, { name: e.target.value })} />
              <label className="f-field"><span>Looks like</span><textarea rows={3} value={c.description} onChange={(e) => edit(c.id, { description: e.target.value })} /></label>
              <CopyBtn text={() => sheetPrompt(project, c)} label="Copy sheet prompt" notify={notify} className="f-ghost" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------- 4. Draw in ChatGPT ----------------
export function DrawStep({ project, notify }) {
  const [copied, setCopied] = useState({});
  const [open, setOpen] = useState(null);
  const sheets = project.characters.filter((c) => c.sheet);
  const refFiles = async () => {
    const files = await Promise.all(REF_URLS.map(async (u, i) => [`style-reference-${i + 1}.jpg`, await (await fetch(u)).blob()]));
    for (const c of sheets) { const b = await getImage(c.sheet); if (b) files.push([`character-${slug(c.name)}.${(b.type || 'image/png').split('/')[1] || 'png'}`, b]); }
    return files;
  };
  const dlRefs = async () => { download(await zipBlob(await refFiles()), 'comic-reference-images.zip'); };
  const shareRefs = async () => { if (!(await shareFiles(await refFiles(), 'Reference images'))) notify('Sharing is not available here; use Download instead.'); };
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;
  return (
    <>
      <section className="f-card">
        <h2>Draw the pictures in ChatGPT</h2>
        <div className="f-tip">
          <b>Do this in ONE ChatGPT chat, in order:</b>
          <ol>
            <li>Download the style images{sheets.length ? ' and character sheets' : ''} below and <b>attach them to your first message</b> in a new ChatGPT chat.</li>
            <li>Paste <b>Slide 1</b>'s prompt with them. It explains the style once.</li>
            <li>Save the picture ChatGPT makes, then paste <b>Slide 2</b>'s short prompt, and so on.</li>
            <li>If a picture has words or bubbles in it, reply <i>"Same picture again, but with no text at all."</i></li>
          </ol>
        </div>
        <div className="f-row wrap gap">
          <div className="f-refs sm">{REF_URLS.map((u) => <img key={u} src={u} alt="" />)}</div>
          <button className="f-primary" onClick={dlRefs}>Download style images{sheets.length ? ` + ${sheets.length} sheet${sheets.length > 1 ? 's' : ''}` : ''} (.zip)</button>
          {canShare && <button className="f-ghost" onClick={shareRefs}>Share / save to phone</button>}
        </div>
      </section>
      <section className="f-card">
        <div className="f-row"><h2>Prompts</h2><div className="spacer" /><CopyBtn text={() => allPrompts(project)} label="Copy all prompts" className="f-ghost" notify={notify} /></div>
        <div className="f-prompts">
          {project.pages.map((pg, i) => {
            const text = panelPrompt(project, i);
            return (
              <div key={pg.id} className={`f-prompt ${copied[i] ? 'used' : ''}`}>
                <div className="f-row">
                  <b>Slide {i + 1}</b>{i === 0 && <span className="f-tag">first message: attach the images</span>}
                  <div className="spacer" />
                  <button className="f-link" onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Hide' : 'Show'}</button>
                  <CopyBtn text={text} label={copied[i] ? 'Copy again' : 'Copy prompt'} className={copied[i] ? 'f-ghost' : 'f-primary'} onCopied={() => setCopied((c) => ({ ...c, [i]: true }))} notify={notify} />
                </div>
                <p className="f-prev">{pg.panels[0].description}</p>
                {open === i && (
                  <>
                    <pre>{text}</pre>
                    {i > 0 && <p className="f-hint">Redoing this one in a fresh chat? <CopyBtn text={() => standalonePrompt(project, i)} label="Copy full version" className="f-link" notify={notify} /></p>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

// ---------------- 5. Pictures ----------------
export function PicturesStep({ project, update, notify }) {
  const fileRef = useRef();
  const replaceRef = useRef();
  const [replaceIdx, setReplaceIdx] = useState(null);
  const [hover, setHover] = useState(false);
  const [frameOpen, setFrameOpen] = useState(null);
  const [dragFrom, setDragFrom] = useState(null);
  const setPanel = (i, patch) => update((p) => ({ ...p, pages: p.pages.map((pg, j) => (j === i ? { ...pg, panels: [{ ...pg.panels[0], ...patch }] } : pg)) }));
  const addFiles = async (list) => {
    const files = [...list].filter((f) => f.type.startsWith('image/')).sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!files.length) return;
    const keys = [];
    for (const f of files) { const k = 'img:' + uid(); await putImage(k, f); keys.push(k); }
    const empties = project.pages.filter((pg) => !pg.panels[0].img).length;
    const used = Math.min(empties, keys.length);
    keys.slice(used).forEach((k) => delImage(k));
    update((p) => {
      let k = 0;
      return { ...p, pages: p.pages.map((pg) => (pg.panels[0].img || k >= used ? pg : { ...pg, panels: [{ ...pg.panels[0], img: keys[k++], crop: undefined }] })) };
    });
    notify(used < keys.length ? `Added ${used}. ${keys.length - used} extra picture(s) had no empty slide; use Replace on a slide.` : `Added ${keys.length} picture${keys.length > 1 ? 's' : ''} in order.`);
  };
  const replace = async (i, file) => { const k = 'img:' + uid(); await putImage(k, file); const old = project.pages[i].panels[0].img; setPanel(i, { img: k, crop: undefined }); if (old) delImage(old); };
  const swap = (i, j) => update((p) => {
    const a = p.pages.map((pg) => ({ ...pg, panels: [{ ...pg.panels[0] }] }));
    const A = a[i].panels[0], B = a[j].panels[0];
    [A.img, B.img] = [B.img, A.img]; [A.crop, B.crop] = [B.crop, A.crop];
    return { ...p, pages: a };
  });
  const filled = project.pages.filter((pg) => pg.panels[0].img).length;
  return (
    <>
      <section className="f-card">
        <h2>Add the pictures</h2>
        <p className="f-sub">Pick or drop all of ChatGPT's pictures at once. They fill the empty slides in order (oldest first). Each one is cropped to 4:5 automatically.</p>
        <div className={`f-drop ${hover ? 'hover' : ''}`} onClick={() => fileRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setHover(true); }} onDragLeave={() => setHover(false)}
          onDrop={(e) => { e.preventDefault(); setHover(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
          <b>Drop pictures here</b><span>or tap to choose · {filled}/{project.pages.length} slides filled</span>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={replaceRef} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files[0] != null && replaceIdx != null) replace(replaceIdx, e.target.files[0]); e.target.value = ''; }} />
      </section>
      <div className="f-grid">
        {project.pages.map((pg, i) => {
          const x = pg.panels[0];
          const crop = x.crop || {};
          return (
            <div key={pg.id} className={`f-tile ${dragFrom === i ? 'dragging' : ''}`} draggable={!!x.img}
              onDragStart={() => setDragFrom(i)} onDragEnd={() => setDragFrom(null)}
              onDragOver={(e) => { if (dragFrom != null) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragFrom != null && dragFrom !== i) swap(dragFrom, i); else if (e.dataTransfer.files.length) replace(i, e.dataTransfer.files[0]); setDragFrom(null); }}>
              <FreeCanvas project={project} pageIndex={i} onSelect={() => { if (!x.img) { setReplaceIdx(i); replaceRef.current.click(); } }} />
              <div className="f-tile-bar">
                <b>{i + 1}</b>
                <button className="f-icon" title="Swap picture with previous slide" disabled={i === 0} onClick={() => swap(i, i - 1)}>←</button>
                <button className="f-icon" title="Swap picture with next slide" disabled={i === project.pages.length - 1} onClick={() => swap(i, i + 1)}>→</button>
                <div className="spacer" />
                <button className="f-link" onClick={() => { setReplaceIdx(i); replaceRef.current.click(); }}>{x.img ? 'Replace' : 'Add'}</button>
                {x.img && <button className="f-link" onClick={() => setFrameOpen(frameOpen === i ? null : i)}>Frame</button>}
                {x.img && <button className="f-icon danger" title="Remove picture" onClick={() => { const old = x.img; setPanel(i, { img: null, crop: undefined }); delImage(old); }}>×</button>}
              </div>
              {frameOpen === i && x.img && (
                <div className="f-frame">
                  <label>Zoom<input type="range" min={1} max={2} step={0.02} value={crop.zoom || 1} onChange={(e) => setPanel(i, { crop: { ...crop, zoom: +e.target.value } })} /></label>
                  <label>Up / down<input type="range" min={0} max={1} step={0.01} value={crop.y ?? 0.5} onChange={(e) => setPanel(i, { crop: { ...crop, y: +e.target.value } })} /></label>
                  <label>Left / right<input type="range" min={0} max={1} step={0.01} value={crop.x ?? 0.5} onChange={(e) => setPanel(i, { crop: { ...crop, x: +e.target.value } })} /></label>
                  <button className="f-link" onClick={() => setPanel(i, { crop: undefined })}>Reset</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------- 6. Text & export ----------------
export function FinishStep({ project, update, notify }) {
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState('');
  const editPanel = (pid, fn) => update((p) => ({ ...p, pages: p.pages.map((pg) => ({ ...pg, panels: pg.panels.map((x) => (x.id === pid ? fn(x) : x)) })) }));
  const editItem = (pid, iid, patch) => editPanel(pid, (x) => ({ ...x, lettering: x.lettering.map((l) => (l.id === iid ? { ...l, ...patch } : l)) }));
  const panel = sel?.panelId && project.pages.flatMap((pg) => pg.panels).find((x) => x.id === sel.panelId);
  const item = panel && sel.itemId && panel.lettering.find((l) => l.id === sel.itemId);
  const missing = project.pages.filter((pg) => !pg.panels[0].img).length;
  const L = project.lettering;
  const files = async () => { const blobs = await allSlideBlobs(project, 1, (n) => setBusy(`Rendering ${n}/${project.pages.length}…`)); return blobs.map((b, i) => [slideName(project, i), b]); };
  const run = async (fn) => { try { await fn(); } catch (e) { notify('Export failed: ' + e.message); } finally { setBusy(''); } };
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;
  return (
    <>
      <section className="f-card">
        <h2>Check the text, then download</h2>
        <p className="f-sub">Tap a text box to edit it. Drag it to move it; drag the orange dot to point the tail.</p>
        {missing > 0 && <div className="f-warn">{missing} slide{missing > 1 ? 's have' : ' has'} no picture yet. They will export blank.</div>}
        <div className="f-row wrap gap">
          <button className="f-primary" disabled={!!busy} onClick={() => run(async () => { const f = await files(); setBusy('Making PDF…'); download(await pdfBlob(project, f.map((x) => x[1])), `${slug(project.title)}.pdf`); notify('PDF downloaded.'); })}>Download PDF</button>
          <button className="f-primary" disabled={!!busy} onClick={() => run(async () => { const f = await files(); setBusy('Zipping…'); download(await zipBlob(f), `${slug(project.title)}-slides.zip`); notify('PNG slides downloaded.'); })}>Download PNG slides (.zip)</button>
          {canShare && <button className="f-ghost" disabled={!!busy} onClick={() => run(async () => { const f = await files(); if (!(await shareFiles(f, project.title))) notify('Sharing is not available on this device.'); })}>Share to Instagram / Photos</button>}
          {busy && <span className="f-hint">{busy}</span>}
        </div>
        <div className="f-row wrap gap f-lettering-opts">
          <label>Text size<input type="range" min={0.7} max={1.4} step={0.05} value={L.scale || 1} onChange={(e) => update((p) => ({ ...p, lettering: { ...p.lettering, scale: +e.target.value } }))} /></label>
          <label>Font<select value={L.font} onChange={(e) => update((p) => ({ ...p, lettering: { ...p.lettering, font: e.target.value } }))}><option value="ComicNeueBold">Comic Neue</option><option value="PatrickHand">Patrick Hand</option></select></label>
          <label className="chk"><input type="checkbox" checked={L.uppercase !== false} onChange={(e) => update((p) => ({ ...p, lettering: { ...p.lettering, uppercase: e.target.checked } }))} /> ALL CAPS</label>
        </div>
      </section>
      <div className="f-finish">
        <div className="f-grid big">
          {project.pages.map((pg, i) => (
            <div key={pg.id} className={`f-tile ${sel?.pageIndex === i ? 'sel' : ''}`}>
              <FreeCanvas project={project} pageIndex={i} editable selection={sel} onSelect={setSel} onMove={(pid, iid, patch) => editItem(pid, iid, patch)} />
              <div className="f-tile-bar"><b>{i + 1}</b><div className="spacer" />
                <button className="f-link" onClick={() => run(async () => download(await renderSlideBlob(project, i), slideName(project, i)))}>PNG</button></div>
              {sel?.pageIndex === i && panel && (
                <div className="f-editor">
                  {item ? (
                    <>
                      <div className="f-row gap">
                        <select value={item.type} onChange={(e) => editItem(panel.id, item.id, { type: e.target.value })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                        {!['caption', 'sfx'].includes(item.type) && <select value={item.speaker} onChange={(e) => editItem(panel.id, item.id, { speaker: e.target.value, tail: undefined })}><option value="">(no tail)</option>{project.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
                      </div>
                      <textarea rows={3} autoFocus value={item.text} onChange={(e) => editItem(panel.id, item.id, { text: e.target.value })} />
                      <div className="f-row gap"><button className="f-link" onClick={() => editItem(panel.id, item.id, { pos: undefined, tail: undefined })}>Put back</button><div className="spacer" />
                        <button className="f-link danger" onClick={() => { editPanel(panel.id, (x) => ({ ...x, lettering: x.lettering.filter((l) => l.id !== item.id) })); setSel({ pageIndex: i, panelId: panel.id }); }}>Delete box</button></div>
                    </>
                  ) : <p className="f-hint">Tap a text box to edit it, or add one:</p>}
                  <div className="f-row gap">
                    <button className="f-link" onClick={() => { const id = uid(); editPanel(panel.id, (x) => ({ ...x, lettering: [...x.lettering, { id, type: 'caption', speaker: '', text: 'New text' }] })); setSel({ pageIndex: i, panelId: panel.id, itemId: id }); }}>+ narration box</button>
                    <button className="f-link" onClick={() => { const id = uid(); editPanel(panel.id, (x) => ({ ...x, lettering: [...x.lettering, { id, type: 'speech', speaker: x.characters[0] || '', text: 'New line' }] })); setSel({ pageIndex: i, panelId: panel.id, itemId: id }); }}>+ speech</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
