async function req(method, url, body) {
  const init = { method, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `${r.status} ${r.statusText}`);
  return data;
}
export const api = {
  status: () => req('GET', '/api/status'),
  list: () => req('GET', '/api/projects'),
  create: (b) => req('POST', '/api/projects', b),
  get: (id) => req('GET', `/api/projects/${id}`),
  remove: (id) => req('DELETE', `/api/projects/${id}`),
  save: (id, b) => req('PUT', `/api/projects/${id}`, b),
  preset: (id, presetId) => req('POST', `/api/projects/${id}/preset`, { presetId }),
  upload: (id, files) => { const fd = new FormData(); for (const f of files) fd.append('files', f); return req('POST', `/api/projects/${id}/refs`, fd); },
  removeRef: (id, ref) => req('DELETE', `/api/projects/${id}/refs?ref=${encodeURIComponent(ref)}`),
  breakdown: (id) => req('POST', `/api/projects/${id}/breakdown`),
  sheet: (id, cid) => req('POST', `/api/projects/${id}/characters/${cid}/sheet`),
  panel: (id, pid, direction) => req('POST', `/api/projects/${id}/panels/${pid}/render`, { direction }),
  renderAll: (id, force) => req('POST', `/api/projects/${id}/render-all`, { force }),
  job: (id) => req('GET', `/api/projects/${id}/job`),
};
export const refUrl = (p, ref) => ref.startsWith('preset:') ? `/api/preset-ref/${ref.slice(7)}` : `/api/projects/${p.id}/ref?ref=${encodeURIComponent(ref)}`;
export const artUrl = (p, panel) => panel.art ? `/api/projects/${p.id}/panels/${panel.id}/art?v=${panel.artVersion}&pp=${p.ppKey || ''}` : null;
export const sheetUrl = (p, c) => c.sheet ? `/api/projects/${p.id}/sheets/${c.sheet}` : null;
export const uid = () => Math.random().toString(36).slice(2, 10);
