import { useState } from 'react';
import { api, sheetUrl, uid } from './api.js';

export default function Cast({ project, update, run, mergeAssets }) {
  const [working, setWorking] = useState({});
  const edit = (id, k, v) => update((p) => ({ ...p, characters: p.characters.map((c) => (c.id === id ? { ...c, [k]: v } : c)) }));
  const gen = async (c) => {
    setWorking((w) => ({ ...w, [c.id]: true }));
    await run('', async () => mergeAssets(await api.sheet(project.id, c.id)));
    setWorking((w) => ({ ...w, [c.id]: false }));
  };
  return (
    <div className="cast">
      <p className="muted intro">Each character gets one model sheet. It is attached as a reference image to every panel they appear in, which keeps faces, hair and outfits consistent across the comic.</p>
      <div className="cast-grid">
        {project.characters.map((c) => (
          <div key={c.id} className="card char">
            <div className="sheet">
              {sheetUrl(project, c) ? <img src={sheetUrl(project, c)} alt={c.name} /> : <div className="sheet-ph">{working[c.id] ? 'Drawing…' : 'No sheet yet'}</div>}
              {working[c.id] && <div className="sheet-busy"><div className="spinner" /></div>}
            </div>
            <div className="char-body">
              <div className="row"><input className="name" value={c.name} onChange={(e) => edit(c.id, 'name', e.target.value)} /><code>{c.id}</code></div>
              <textarea rows={4} value={c.description} onChange={(e) => edit(c.id, 'description', e.target.value)} />
              <div className="row">
                <button className={c.sheet ? 'ghost' : 'primary'} disabled={working[c.id]} onClick={() => gen(c)}>{c.sheet ? 'Regenerate sheet' : 'Generate sheet'}</button>
                <div className="spacer" />
                <button className="ghost sm danger" onClick={() => confirm(`Remove ${c.name}?`) && update((p) => ({ ...p, characters: p.characters.filter((x) => x.id !== c.id) }))}>Remove</button>
              </div>
              {c.sheet && <p className="hint">Changed the description? Regenerate the sheet, then re-render their panels.</p>}
            </div>
          </div>
        ))}
        <button className="card add-char" onClick={() => { const name = prompt('Character name'); if (name) update((p) => ({ ...p, characters: [...p.characters, { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || uid(), name, description: '', isMain: true, sheet: null, sheetVersion: 0 }] })); }}>+ Add character</button>
      </div>
    </div>
  );
}
