// Pure (browser + Node) planning helpers:
//  - localPlan: rule-based script → slides/pages (CAPTION:/NAME: lines, scene lines, or plain prose)
//  - parseReply: tolerant parser for a JSON plan pasted back from ChatGPT
import { rng } from './compose.js';

const SHOT_CYCLE = ['wide', 'medium', 'close-up', 'medium', 'full', 'medium-close'];
const NAME_RE = /^([A-Z][A-Za-z0-9 .'-]{0,28}?)\s*(\((?:[^)]*)\))?\s*:\s*(.+)$/;

function settingOf(text, prev) {
  const t = text.toLowerCase();
  const kws = ['kitchen', 'office', 'bedroom', 'living room', 'apartment', 'house', 'home', 'cafe', 'bar', 'room', 'beach', 'ocean', 'sea', 'mountain', 'cliff', 'forest', 'park', 'field', 'farm', 'city', 'street', 'road', 'parking lot', 'garden', 'porch', 'deck', 'lake', 'pond', 'desert', 'space'];
  const k = kws.find((k) => t.includes(k));
  const time = /night|moon|midnight|dark/.test(t) ? ' at night' : /sunset|sunrise|dawn|dusk/.test(t) ? ' at sunset' : '';
  return k ? k + time : prev || 'open field' + time;
}

export function localPlan(project) {
  const s = project.settings;
  const carousel = s.format !== 'pages';
  const lines = String(project.script || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hasDialogue = lines.some((l) => NAME_RE.test(l) && !/^(page|panel|slide)\b/i.test(l));
  const beats = [];
  const speakers = new Map();
  let desc = '';
  let pendingDesc = null;
  const addSpeaker = (name) => { const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (!speakers.has(id)) speakers.set(id, name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase())); return id; };
  if (hasDialogue) {
    for (const l of lines) {
      if (/^(page|panel|slide)\b/i.test(l)) continue;
      const m = l.match(NAME_RE);
      if (m) {
        const who = m[1].trim(), mod = (m[2] || '').toLowerCase(), text = m[3].trim();
        if (/^(caption|narration|narrator|nar)$/i.test(who)) { beats.push({ desc: pendingDesc || desc, items: [{ type: 'caption', speaker: '', text }] }); pendingDesc = null; continue; }
        if (/^sfx$/i.test(who)) { const b = beats[beats.length - 1]; if (b) b.items.push({ type: 'sfx', speaker: '', text }); continue; }
        const id = addSpeaker(who);
        const type = /whisper/.test(mod) ? 'whisper' : /shout|yell/.test(mod) || /!{2,}$/.test(text) ? 'shout' : /thought|thinks/.test(mod) ? 'thought' : 'speech';
        beats.push({ desc: pendingDesc || desc, items: [{ type, speaker: id, text }] });
        pendingDesc = null;
      } else {
        if (pendingDesc) beats.push({ desc: pendingDesc, items: [] });
        desc = l; pendingDesc = l;
      }
    }
    if (pendingDesc) beats.push({ desc: pendingDesc, items: [] });
  } else {
    const sentences = lines.join(' ').match(/[^.!?]+[.!?]+["”']?|[^.!?]+$/g) || [project.script || 'Something happens.'];
    for (const sn of sentences.map((x) => x.trim()).filter(Boolean)) beats.push({ desc: sn, items: [{ type: 'caption', speaker: '', text: sn }] });
    for (const m of (project.script || '').matchAll(/\b([A-Z][a-z]{2,}),\s*\d{1,3}\b|\bThis is ([A-Z][a-z]{2,})\b/g)) addSpeaker(m[1] || m[2]);
  }
  // characters
  if (!speakers.size) speakers.set('hero', 'Hero');
  const hint = (name) => lines.find((l) => !NAME_RE.test(l) && new RegExp(`\\b${name}\\b`, 'i').test(l)) || '';
  const characters = [...speakers].map(([id, name], i) => ({ id, name, description: mockLook(id, name, hint(name)).text, isMain: i < 3 }));
  // fit beats to format
  const target = carousel ? s.slides : s.pages;
  let groups;
  if (carousel) {
    // one beat per slide; if there are too many, merge the adjacent pair with the least text (same scene preferred)
    groups = beats.map((b) => [b]);
    const words = (g) => g.flatMap((b) => b.items).reduce((a, i) => a + i.text.split(/\s+/).length, 0);
    while (groups.length > Math.max(1, target)) {
      let best = 0, bestScore = Infinity;
      for (let i = 0; i < groups.length - 1; i++) {
        const sc = words(groups[i]) + words(groups[i + 1]) + (groups[i].at(-1).desc === groups[i + 1][0].desc ? 0 : 25);
        if (sc < bestScore) { bestScore = sc; best = i; }
      }
      groups.splice(best, 2, [...groups[best], ...groups[best + 1]]);
    }
  } else {
    const per = Math.min(6, Math.max(3, Math.ceil(beats.length / target)));
    groups = [];
    for (let i = 0; i < beats.length; i += per) groups.push(beats.slice(i, i + per));
  }
  let setting = '';
  const pages = groups.map((g, gi) => {
    const mk = (bs, pi) => {
      const items = bs.flatMap((b) => b.items);
      const d = bs.map((b) => b.desc).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ');
      setting = settingOf(d, setting);
      let chars = characters.filter((c) => items.some((it) => it.speaker === c.id) || new RegExp(`\\b${c.name}\\b`, 'i').test(d)).map((c) => c.id);
      if (!chars.length && characters.length) chars = [characters[0].id];
      const positions = chars.length === 1 ? [['center-left', 'center', 'center-right'][(gi + pi) % 3]] : chars.length === 2 ? ['left', 'right'] : ['left', 'center', 'right'];
      const idx = carousel ? gi : gi * 6 + pi;
      return {
        shot: idx === 0 ? 'establishing' : SHOT_CYCLE[idx % SHOT_CYCLE.length],
        size: !carousel && pi === 0 && gi === 0 ? 'large' : 'medium',
        setting, description: d || 'A quiet moment.', characters: chars,
        staging: chars.slice(0, 3).map((id, k) => ({ character_id: id, position: positions[k] || 'center', action: 'standing', expression: 'deadpan' })),
        lettering: items,
      };
    };
    return { panels: carousel ? [mk(g, 0)] : g.map((b, pi) => mk([b], pi)) };
  });
  const firstLine = (project.script || '').split(/[.\n]/)[0].trim();
  return { title: project.title || (firstLine.length < 48 ? firstLine : 'Untitled Comic'), characters, pages, cost: 0 };
}

// ---------------- procedural art ----------------
const HAIR = { orange: '#E5772B', ginger: '#E5772B', red: '#C8442E', brown: '#7A4E2D', black: '#2A2522', blonde: '#F0C93C', blond: '#F0C93C', yellow: '#F0C93C', grey: '#A9A9A4', gray: '#A9A9A4', white: '#EEEEEA', pink: '#F08AB4', blue: '#4E7FD0' };
const CLOTH = { yellow: '#F3DB52', blue: '#6FA8DC', red: '#D9534F', green: '#7CB86A', purple: '#A57FC0', lilac: '#A57FC0', grey: '#8E9196', gray: '#8E9196', black: '#3A3A3A', white: '#F4F4F0', orange: '#F09A44', pink: '#F2A0C0', brown: '#9A6B4A', teal: '#4FA7A0' };
export function mockLook(id, name, description = '') {
  const r = rng('look:' + id);
  const d = description.toLowerCase();
  const pick = (o) => Object.values(o)[Math.floor(r() * Object.values(o).length)];
  const hairWord = Object.keys(HAIR).find((k) => new RegExp(`${k}[- ]?(hair|haired|bob|beard)`).test(d));
  const clothWord = Object.keys(CLOTH).find((k) => new RegExp(`${k} (shirt|dress|suit|jacket|hoodie|sweater|top|robe|t-shirt|coat)`).test(d));
  const styles = ['bob', 'spiky', 'long', 'short', 'tuft'];
  const look = {
    hair: hairWord ? HAIR[hairWord] : pick({ a: '#7A4E2D', b: '#E5772B', c: '#2A2522', d: '#F0C93C', e: '#A9A9A4' }),
    style: /bob/.test(d) ? 'bob' : /spiky/.test(d) ? 'spiky' : /long/.test(d) ? 'long' : /bald/.test(d) ? 'bald' : /short/.test(d) ? 'short' : styles[Math.floor(r() * styles.length)],
    shirt: clothWord ? CLOTH[clothWord] : pick(CLOTH),
    pants: pick({ a: '#4A5A7A', b: '#6B5B4B', c: '#555A60', d: '#3E4B3E' }),
    skin: pick({ a: '#F2D3C2', b: '#E8BFA2', c: '#C99878', d: '#9C6B4E', e: '#F5DCCB' }),
    beard: /beard|mustache|moustache/.test(d),
  };
  const hairName = Object.entries(HAIR).find(([, v]) => v === look.hair)?.[0] || 'brown';
  const shirtName = Object.entries(CLOTH).find(([, v]) => v === look.shirt)?.[0] || 'blue';
  look.text = `Simple cartoon person, round face, dot eyes, single-line mouth, big blocky ${hairName} hair in a ${look.style === 'bald' ? 'balding' : look.style} cut${look.beard ? ', short beard' : ''}, plain ${shirtName} shirt, dark trousers.`;
  return look;
}


// ---------------- ChatGPT reply parsing ----------------
function closeBrackets(t) {
  // auto-close a JSON reply that was cut off mid-way
  const stack = []; let inStr = false, esc = false, lastSafe = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') { stack.pop(); lastSafe = i + 1; }
    else if (c === ',') lastSafe = i;
  }
  if (!stack.length && !inStr) return t;
  let s = t.slice(0, lastSafe).replace(/,\s*$/, '');
  const st = []; inStr = false; esc = false;
  for (const c of s) {
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{' || c === '[') st.push(c === '{' ? '}' : ']'); else if (c === '}' || c === ']') st.pop();
  }
  return s + st.reverse().join('');
}
export function parseReply(text) {
  let t = String(text || '').replace(/\r/g, '').trim();
  if (!t) throw new Error('The reply is empty. Paste ChatGPT\'s whole answer.');
  const fence = t.match(/```(?:json|JSON)?\s*([\s\S]*?)(```|$)/);
  if (fence && fence[1].includes('{')) t = fence[1];
  const a = t.search(/[{[]/);
  if (a < 0) throw new Error('No JSON found in the reply. Ask ChatGPT to "reply with only the JSON".');
  t = t.slice(a);
  const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  const trimmed = b > 0 ? t.slice(0, b + 1) : t;
  const fixes = [
    (s) => s,
    (s) => s.replace(/[\u201C\u201D\u201E\u2033]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\u00A0/g, ' '),
    (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'),
    (s) => s.replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":'),
    (s) => s.replace(/:\s*'([^'\n]*)'/g, (m, v) => `: ${JSON.stringify(v)}`),
    (s) => s.replace(/"\s*\n\s*"/g, '",\n"').replace(/}\s*\n\s*{/g, '},\n{'),
  ];
  let s = trimmed, err;
  for (const base of [trimmed, t]) {
    s = base;
    for (const f of fixes) {
      s = f(s);
      for (const cand of [s, closeBrackets(s)]) { try { return planFromAny(JSON.parse(cand)); } catch (e) { err = e; } }
    }
  }
  throw new Error(`Couldn't read the reply as JSON (${err?.message || 'unknown error'}). Try asking ChatGPT: "Please resend only the JSON in one code block."`);
}

const SHOT_OK = ['establishing', 'wide', 'full', 'medium', 'medium-close', 'close-up', 'extreme-close-up', 'over-the-shoulder', 'low-angle', 'high-angle', 'birds-eye'];
const POS_OK = ['left', 'center-left', 'center', 'center-right', 'right'];
const TYPE_OK = ['caption', 'speech', 'thought', 'shout', 'whisper', 'sfx'];
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Accepts the simple ChatGPT format ({characters, slides}) or the full breakdown format ({characters, pages}).
export function planFromAny(j) {
  if (Array.isArray(j)) j = { slides: j };
  if (!j || typeof j !== 'object') throw new Error('Not a plan');
  const chars = (j.characters || j.cast || []).map((c) => ({ id: slug(c.id || c.name), name: c.name || c.id || 'Someone', description: c.look || c.visual_description || c.description || '', isMain: true }));
  const known = (id) => { const s = slug(id); const c = chars.find((x) => x.id === s || slug(x.name) === s || slug(x.name).split('-')[0] === s); return c ? c.id : s; };
  const mkPanel = (p) => {
    const staging = (p.characters || p.staging || []).map((c) => (typeof c === 'string' ? { character_id: c, position: 'center' } : c)).map((c) => ({
      character_id: known(c.id || c.character_id || c.name), position: POS_OK.includes(c.position) ? c.position : 'center', action: c.action || '', expression: c.expression || '',
    }));
    for (const st of staging) if (!chars.some((c) => c.id === st.character_id)) chars.push({ id: st.character_id, name: st.character_id.replace(/(^|-)\w/g, (m) => m.toUpperCase()).replace(/-/g, ' '), description: '', isMain: false });
    const text = p.text || p.lettering || p.dialogue || [];
    return {
      shot: SHOT_OK.includes(p.shot) ? p.shot : 'medium', size: p.size || 'medium', setting: p.setting || '',
      description: p.picture || p.description || p.scene || '', characters: staging.map((s) => s.character_id), staging,
      lettering: (Array.isArray(text) ? text : [text]).filter(Boolean).map((l) => (typeof l === 'string' ? { type: 'caption', speaker: '', text: l } : l)).map((l) => {
        const type = TYPE_OK.includes(l.type) ? l.type : l.speaker ? 'speech' : 'caption';
        return { type, speaker: ['caption', 'sfx'].includes(type) ? '' : known(l.speaker || ''), text: String(l.text || '').trim() };
      }).filter((l) => l.text),
    };
  };
  let pages;
  if (j.slides) pages = j.slides.map((s) => ({ panels: [mkPanel(s)] }));
  else if (j.pages) pages = j.pages.map((pg) => ({ panels: (pg.panels || []).map(mkPanel) }));
  else throw new Error('The JSON has no "slides" list.');
  if (!pages.length) throw new Error('The plan has no slides.');
  return { title: j.title || '', characters: chars, pages };
}
