import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreset } from '@shared/presets.js';
import { loadProject, saveProject, uid, clearImages } from './storage.js';
import { StoryStep, PlanStep, CastStep, DrawStep, PicturesStep, FinishStep } from './Steps.jsx';
import { GridStoryStep, EditSlidesStep, PromptStep, UploadStep, planNow, needsPlan } from './GridSteps.jsx';

// Default: "one prompt, one upload". The older slide-by-slide flow stays available.
const FLOWS = {
  grid: [
    { key: 'story', label: 'Story', C: GridStoryStep },
    { key: 'prompt', label: 'Prompt', C: PromptStep },
    { key: 'upload', label: 'Pictures', C: UploadStep },
    { key: 'finish', label: 'Finish', C: FinishStep },
  ],
  slides: [
    { key: 'story', label: 'Story', C: StoryStep },
    { key: 'plan', label: 'Plan slides', C: PlanStep },
    { key: 'cast', label: 'Characters', C: CastStep },
    { key: 'draw', label: 'Draw in ChatGPT', C: DrawStep },
    { key: 'pictures', label: 'Add pictures', C: PicturesStep },
    { key: 'finish', label: 'Text & export', C: FinishStep },
  ],
};
// screens reachable but not shown in the step bar
const EXTRA = { edit: { label: 'Edit slides', C: EditSlidesStep, back: 'prompt' }, pictures: { label: 'Replace a picture', C: PicturesStep, back: 'upload' } };

export function freshProject() {
  const pr = getPreset('deadpan-carousel');
  return {
    id: uid(), title: '', script: '', presetId: pr.id, styleText: pr.styleText,
    settings: { ...structuredClone(pr.settings), format: 'carousel', slides: 10, mode: 'free' },
    lettering: structuredClone(pr.lettering), styleBible: structuredClone(pr.styleBible),
    characters: [], pages: [], flow: 'grid', view: 'story', imageMode: 'separate', grid: { split: false, sheets: [] },
  };
}
function migrate(p) {
  if (!p) return null;
  if (!p.flow) { p.flow = 'grid'; p.view = p.pages?.length ? 'prompt' : 'story'; p.planKey = undefined; delete p.step; }
  p.grid = p.grid || { split: false, sheets: [] };
  if (!p.imageMode) p.imageMode = p.grid.sheets?.some(Boolean) ? 'grid' : 'separate';
  if (p.view === 'pictures' && p.flow === 'grid') { p.view = 'upload'; p.imageMode = 'separate'; }
  return p;
}

export default function FreeApp() {
  const [project, setProject] = useState(() => migrate(loadProject()) || freshProject());
  const [apiAvailable, setApiAvailable] = useState(false);
  const [toast, setToast] = useState('');
  const toastT = useRef();
  useEffect(() => { saveProject(project); }, [project]);
  // The paid API studio is only offered when this page is served by the local server (never on a static host).
  useEffect(() => { if (import.meta.env.VITE_STATIC) return; fetch('api/status').then((r) => r.ok && r.json()).then((j) => j && setApiAvailable(true)).catch(() => {}); }, []);
  const update = useCallback((patch) => setProject((p) => (typeof patch === 'function' ? patch(p) : { ...p, ...patch })), []);
  const notify = useCallback((msg) => { setToast(msg); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2600); }, []);

  const steps = FLOWS[project.flow] || FLOWS.grid;
  const extra = project.flow === 'grid' ? EXTRA[project.view] : null;
  const idx = Math.max(0, steps.findIndex((s) => s.key === project.view));
  const cur = extra || steps[idx];
  const hasPlan = project.pages.length > 0;
  const nPics = project.pages.filter((pg) => pg.panels[0]?.img).length;
  const grid = project.flow === 'grid';
  const canGo = (i) => (grid ? i === 0 || !!project.script.trim() || hasPlan : i <= 1 || hasPlan);
  const go = (key) => {
    update((p) => {
      let q = p;
      // grid flow: plan locally + instantly whenever the story or slide count changed
      if (q.flow === 'grid' && key !== 'story' && q.script.trim() && needsPlan(q)) {
        if (q.planEdited && q.pages.length && !confirm('The story changed. Split it into slides again? (Your slide edits will be replaced; pictures stay in order.)')) return { ...q, view: key };
        q = planNow(q);
      }
      return { ...q, view: key };
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const props = { project, update, notify, go };
  const C = cur.C;

  return (
    <div className="free">
      <header className="f-top">
        <div className="f-brand"><span className="logo">COMIC STUDIO</span><span className="f-badge">Free · uses your ChatGPT</span></div>
        <div className="spacer" />
        <button className="f-ghost sm" onClick={async () => { if (confirm('Start a new comic? This clears the current one from this device.')) { await clearImages(); setProject(freshProject()); } }}>New comic</button>
      </header>
      <nav className={`f-steps ${grid ? 'f-steps-grid' : ''}`}>
        {steps.map((s, i) => (
          <button key={s.key} className={`${!extra && i === idx ? 'on' : ''} ${i < idx ? 'done' : ''}`} disabled={!canGo(i)} onClick={() => go(s.key)}>
            <b>{i < idx ? '✓' : i + 1}</b><span>{s.label}{(s.key === 'pictures' || s.key === 'upload') && hasPlan ? ` ${nPics}/${project.pages.length}` : ''}</span>
          </button>
        ))}
      </nav>
      <main className="f-main">
        {extra && <div className="f-row"><button className="f-link" onClick={() => go(extra.back)}>← Back</button></div>}
        <C {...props} />
        {!extra && (
          <div className="f-nav">
            {idx > 0 ? <button className="f-ghost" onClick={() => go(steps[idx - 1].key)}>← Back</button> : <span />}
            {idx < steps.length - 1 && <button className="f-primary" disabled={!canGo(idx + 1)} onClick={() => go(steps[idx + 1].key)}>Next: {grid ? ['get the ChatGPT prompt', project.imageMode === 'grid' ? 'upload the picture' : 'add the pictures', 'add text & export'][idx] : steps[idx + 1].label} →</button>}
          </div>
        )}
        {project.flow === 'slides' && <p className="f-hint f-center">Using the slide-by-slide way. <button className="f-link" onClick={() => update((p) => ({ ...p, flow: 'grid', view: 'prompt' }))}>Switch to the simple way</button></p>}
      </main>
      <footer className="f-foot">
        Everything stays on this device. Nothing is sent anywhere.
        {!import.meta.env.VITE_STATIC && apiAvailable && <> · <a href="studio.html">Advanced: paid API mode</a></>}
      </footer>
      {toast && <div className="f-toast">{toast}</div>}
    </div>
  );
}
