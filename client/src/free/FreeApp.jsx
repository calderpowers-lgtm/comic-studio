import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreset } from '@shared/presets.js';
import { loadProject, saveProject, uid, clearImages } from './storage.js';
import { StoryStep, PlanStep, CastStep, DrawStep, PicturesStep, FinishStep } from './Steps.jsx';

const STEPS = [
  { key: 'story', label: 'Story' },
  { key: 'plan', label: 'Plan slides' },
  { key: 'cast', label: 'Characters' },
  { key: 'draw', label: 'Draw in ChatGPT' },
  { key: 'pictures', label: 'Add pictures' },
  { key: 'finish', label: 'Text & export' },
];

export function freshProject() {
  const pr = getPreset('deadpan-carousel');
  return {
    id: uid(), title: '', script: '', presetId: pr.id, styleText: pr.styleText,
    settings: { ...structuredClone(pr.settings), format: 'carousel', slides: 10, mode: 'free' },
    lettering: structuredClone(pr.lettering), styleBible: structuredClone(pr.styleBible),
    characters: [], pages: [], step: 0,
  };
}

export default function FreeApp() {
  const [project, setProject] = useState(() => loadProject() || freshProject());
  const [apiAvailable, setApiAvailable] = useState(false);
  const [toast, setToast] = useState('');
  const toastT = useRef();
  useEffect(() => { saveProject(project); }, [project]);
  // The paid API studio is only offered when this page is served by the local server (never on a static host).
  useEffect(() => { if (import.meta.env.VITE_STATIC) return; fetch('api/status').then((r) => r.ok && r.json()).then((j) => j && setApiAvailable(true)).catch(() => {}); }, []);
  const update = useCallback((patch) => setProject((p) => (typeof patch === 'function' ? patch(p) : { ...p, ...patch })), []);
  const notify = useCallback((msg) => { setToast(msg); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2600); }, []);
  const step = Math.min(project.step || 0, STEPS.length - 1);
  const go = (i) => { update({ step: i }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const hasPlan = project.pages.length > 0;
  const nPics = project.pages.filter((pg) => pg.panels[0]?.img).length;
  const canGo = (i) => i <= 1 || hasPlan;
  const props = { project, update, notify, go };

  return (
    <div className="free">
      <header className="f-top">
        <div className="f-brand"><span className="logo">COMIC STUDIO</span><span className="f-badge">Free · uses your ChatGPT</span></div>
        <div className="spacer" />
        <button className="f-ghost sm" onClick={async () => { if (confirm('Start a new comic? This clears the current one from this device.')) { await clearImages(); setProject(freshProject()); } }}>New comic</button>
      </header>
      <nav className="f-steps">
        {STEPS.map((s, i) => (
          <button key={s.key} className={`${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} disabled={!canGo(i)} onClick={() => go(i)}>
            <b>{i < step ? '✓' : i + 1}</b><span>{s.label}{s.key === 'pictures' && hasPlan ? ` ${nPics}/${project.pages.length}` : ''}</span>
          </button>
        ))}
      </nav>
      <main className="f-main">
        {step === 0 && <StoryStep {...props} />}
        {step === 1 && <PlanStep {...props} />}
        {step === 2 && <CastStep {...props} />}
        {step === 3 && <DrawStep {...props} />}
        {step === 4 && <PicturesStep {...props} />}
        {step === 5 && <FinishStep {...props} />}
        <div className="f-nav">
          {step > 0 ? <button className="f-ghost" onClick={() => go(step - 1)}>← Back</button> : <span />}
          {step < STEPS.length - 1 && <button className="f-primary" disabled={!canGo(step + 1)} onClick={() => go(step + 1)}>Next: {STEPS[step + 1].label} →</button>}
        </div>
      </main>
      <footer className="f-foot">
        Everything stays on this device. Nothing is sent anywhere.
        {!import.meta.env.VITE_STATIC && apiAvailable && <> · <a href="studio.html">Advanced: paid API mode</a></>}
      </footer>
      {toast && <div className="f-toast">{toast}</div>}
    </div>
  );
}
