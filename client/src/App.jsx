import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import Setup from './Setup.jsx';
import Breakdown from './Breakdown.jsx';
import Cast from './Cast.jsx';
import ComicView from './ComicView.jsx';

const SAVE_KEYS = ['title', 'script', 'styleText', 'settings', 'lettering', 'styleBible', 'characters', 'pages'];

export default function App() {
  const [status, setStatus] = useState(null);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState('breakdown');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(new Set());
  const timer = useRef(null);
  const projRef = useRef(null);
  projRef.current = project;

  const refreshList = () => api.list().then(setProjects);
  useEffect(() => {
    api.status().then(setStatus);
    api.list().then(async (list) => {
      setProjects(list);
      const last = localStorage.getItem('cs:last');
      const id = list.find((p) => p.id === last)?.id || list[0]?.id;
      if (id) setProject(await api.get(id)); else newProject();
    });
  }, []);
  useEffect(() => { if (project?.id) localStorage.setItem('cs:last', project.id); }, [project?.id]);

  const flush = useCallback(async () => {
    const p = projRef.current;
    if (!p || !dirty.current.size) return;
    const body = {}; for (const k of dirty.current) body[k] = p[k];
    dirty.current.clear();
    setSaving(true);
    try { const s = await api.save(p.id, body); setProject((cur) => (cur?.id === s.id ? { ...cur, ppKey: s.ppKey, mock: s.mock, usage: s.usage } : cur)); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  }, []);

  // local edit + debounced autosave
  const update = useCallback((patch) => {
    setProject((p) => {
      const next = typeof patch === 'function' ? patch(p) : { ...p, ...patch };
      for (const k of SAVE_KEYS) if (next[k] !== p[k]) dirty.current.add(k);
      return next;
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  }, [flush]);

  // merge server-owned asset fields (art, sheets, usage) without clobbering local edits
  const mergeAssets = useCallback((srv) => {
    setProject((p) => {
      if (!p || p.id !== srv.id) return p;
      const art = new Map(srv.pages.flatMap((pg) => pg.panels).map((x) => [x.id, x]));
      const sh = new Map(srv.characters.map((c) => [c.id, c]));
      return {
        ...p, usage: srv.usage, ppKey: srv.ppKey, mock: srv.mock,
        pages: p.pages.map((pg) => ({ ...pg, panels: pg.panels.map((x) => { const o = art.get(x.id); return o ? { ...x, art: o.art, artVersion: o.artVersion, prompt: o.prompt, error: o.error, size_px: o.size_px } : x; }) })),
        characters: p.characters.map((c) => { const o = sh.get(c.id); return o ? { ...c, sheet: o.sheet, sheetVersion: o.sheetVersion } : c; }),
      };
    });
  }, []);

  const run = async (label, fn) => {
    setBusy(label); setError('');
    try { await flush(); return await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  async function newProject() {
    const p = await api.create({});
    setProject(p); setTab('breakdown'); refreshList();
  }
  async function openProject(id) { await flush(); setProject(await api.get(id)); setJob(null); }

  const breakdown = () => run('Breaking down the script…', async () => {
    const p = await api.breakdown(project.id);
    setProject(p); setTab('breakdown'); refreshList();
  });

  // render-all job polling
  const pollRef = useRef(null);
  const startPoll = useCallback((id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const [j, srv] = await Promise.all([api.job(id), api.get(id)]);
      setJob(j); mergeAssets(srv);
      if (!j.running) { clearInterval(pollRef.current); refreshList(); }
    }, 900);
  }, [mergeAssets]);
  const renderAll = (force) => run('', async () => { const j = await api.renderAll(project.id, force); setJob(j); setTab('comic'); startPoll(project.id); });
  useEffect(() => () => clearInterval(pollRef.current), []);

  if (!project || !status) return <div className="boot">Loading studio…</div>;
  const hasBreakdown = project.pages.length > 0;
  const nArt = project.pages.flatMap((p) => p.panels).filter((p) => p.art).length;
  const nPanels = project.pages.flatMap((p) => p.panels).length;
  const spent = (project.usage?.text || 0) + (project.usage?.images || 0);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">COMIC STUDIO</span></div>
        <select className="project-select" value={project.id} onChange={(e) => openProject(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title || 'Untitled'} · {p.pages} {p.format === 'pages' ? 'pages' : 'slides'}</option>)}
          {!projects.some((p) => p.id === project.id) && <option value={project.id}>{project.title || 'Untitled'}</option>}
        </select>
        <button className="ghost" onClick={newProject}>+ New</button>
        <div className="spacer" />
        <span className={`chip ${project.mock ? 'warn' : 'ok'}`} title={project.mock ? 'No OPENAI_API_KEY on the server (or mock forced). Placeholder art + rule-based breakdown.' : `Text: ${status.models.text} · Images: ${status.models.image}`}>
          {project.mock ? (status.hasKey ? 'Mock mode (forced)' : 'Mock mode · no API key') : `OpenAI · ${status.models.image}`}
        </span>
        {spent > 0 && <span className="chip" title="Estimated API spend on this comic">${spent.toFixed(2)}</span>}
        <span className="save-state">{saving ? 'Saving…' : 'Saved'}</span>
        <div className="export">
          <a className={`btn ${nArt ? '' : 'disabled'}`} href={`/api/projects/${project.id}/export.pdf`} onClick={flush}>Export PDF</a>
          <a className={`btn ${nArt ? '' : 'disabled'}`} href={`/api/projects/${project.id}/export.zip`} onClick={flush}>PNG {project.settings.format === 'pages' ? 'pages' : 'slides'} (.zip)</a>
        </div>
      </header>

      <div className="body">
        <Setup project={project} status={status} update={update} setProject={setProject} busy={busy} onBreakdown={breakdown} flush={flush} setError={setError} />
        <main className="main">
          <nav className="tabs">
            <button className={tab === 'breakdown' ? 'on' : ''} onClick={() => setTab('breakdown')}>1 · Breakdown</button>
            <button className={tab === 'cast' ? 'on' : ''} onClick={() => setTab('cast')} disabled={!hasBreakdown}>2 · Cast</button>
            <button className={tab === 'comic' ? 'on' : ''} onClick={() => setTab('comic')} disabled={!hasBreakdown}>3 · Comic {nPanels ? <em>{nArt}/{nPanels}</em> : null}</button>
            <div className="spacer" />
            {hasBreakdown && (
              <>
                {job?.running ? (
                  <div className="progress"><div className="bar" style={{ width: `${(100 * job.done) / Math.max(1, job.total)}%` }} /><span>{job.stage === 'sheets' ? 'Character sheets' : 'Drawing panels'} · {job.done}/{job.total}</span></div>
                ) : (
                  <>
                    {nArt > 0 && <button className="ghost" onClick={() => confirm('Re-draw every character sheet and panel? This spends API credits in OpenAI mode.') && renderAll(true)}>Re-render all</button>}
                    <button className="primary" onClick={() => renderAll(false)}>{nArt === 0 ? 'Render comic →' : nArt < nPanels ? 'Render missing panels' : 'Render ✓'}</button>
                  </>
                )}
              </>
            )}
          </nav>
          {error && <div className="error" onClick={() => setError('')}>{error} <span>×</span></div>}
          {job && !job.running && job.errors?.length > 0 && <div className="error">{job.errors.length} item(s) failed: {job.errors.slice(0, 3).join(' · ')}</div>}
          {busy && <div className="busy"><div className="spinner" />{busy}</div>}
          {!hasBreakdown && !busy && (
            <div className="empty">
              <h2>Paste a script or idea, pick a style, then break it down.</h2>
              <p>The breakdown turns your text into {project.settings.format === 'pages' ? 'pages and panels' : 'carousel slides'} with shots, staging and lettering. You can edit everything before any art is drawn.</p>
            </div>
          )}
          {hasBreakdown && tab === 'breakdown' && <Breakdown project={project} update={update} />}
          {hasBreakdown && tab === 'cast' && <Cast project={project} update={update} run={run} mergeAssets={mergeAssets} busy={busy} />}
          {hasBreakdown && tab === 'comic' && <ComicView project={project} update={update} run={run} mergeAssets={mergeAssets} job={job} />}
        </main>
      </div>
    </div>
  );
}
