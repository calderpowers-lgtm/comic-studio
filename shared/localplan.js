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
  return k ? k + time : prev || '';
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
    const pb = proseBeats(project.script || '', addSpeaker);
    beats.push(...pb);
  }
  // characters
  if (!speakers.size) speakers.set('hero', 'Hero');
  const LOOKS = /\b(hair|bob|beard|dress|suit|shirt|jacket|hoodie|sweater|coat|wearing|glasses|hat|tall|short|old|\d{1,3})\b/i;
  const hint = (name) => {
    const re = new RegExp(`\\b${name}\\b`, 'i');
    const sents = lines.filter((l) => !NAME_RE.test(l)).flatMap((l) => l.split(/(?<=[.!?])\s+/)).filter((l) => re.test(l));
    return sents.find((l) => LOOKS.test(l)) || sents[0] || '';
  };
  const characters = [...speakers].map(([id, name], i) => ({ id, name, description: mockLook(id, name, hint(name)).text, isMain: i < 3 }));
  // fit beats to format
  const target = carousel ? s.slides : s.pages;
  let groups;
  if (carousel) {
    groups = fitBeats(beats, Math.max(1, target), characters);
  } else {
    const per = Math.min(6, Math.max(3, Math.ceil(beats.length / target)));
    groups = [];
    for (let i = 0; i < beats.length; i += per) groups.push(beats.slice(i, i + per));
  }
  let setting = '';
  let lastChars = [];
  const pages = groups.map((g, gi) => {
    const mk = (bs, pi) => {
      const items = bs.flatMap((b) => b.items);
      let d = bs.map((b) => b.desc).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ');
      if (bs.every((b) => b.silent)) d = '';
      setting = settingOf(d, setting);
      let chars = characters.filter((c) => items.some((it) => it.speaker === c.id) || new RegExp(`\\b${c.name}\\b`, 'i').test(d) || bs.some((b) => (b.who || []).includes(c.id))).map((c) => c.id);
      if (!chars.length) chars = lastChars.length ? lastChars : characters.length ? [characters[0].id] : [];
      lastChars = chars;
      if (!d && items.length) {
        const names = chars.map((id) => characters.find((c) => c.id === id)?.name).filter(Boolean);
        d = `${names.join(' and ') || 'The characters'} ${items.some((it) => it.speaker) ? (names.length > 1 ? 'talking to each other' : 'speaking') : 'in the scene'}, same place as the previous panel.`;
      }
      if (bs.every((b) => b.silent)) {
        const names = chars.map((id) => characters.find((c) => c.id === id)?.name).filter(Boolean);
        d = `A silent pause in the same scene as the previous panel: ${names.length ? names.join(' and ') : 'the scene'} ${names.length > 1 ? 'look at each other' : 'stares'}, deadpan. Nothing happens.`;
      }
      const positions = chars.length === 1 ? [['center-left', 'center', 'center-right'][(gi + pi) % 3]] : chars.length === 2 ? ['left', 'right'] : ['left', 'center', 'right'];
      const idx = carousel ? gi : gi * 6 + pi;
      return {
        shot: idx === 0 ? 'establishing' : SHOT_CYCLE[idx % SHOT_CYCLE.length],
        size: !carousel && pi === 0 && gi === 0 ? 'large' : 'medium',
        setting, description: d || 'A quiet moment.', characters: chars,
        staging: chars.slice(0, 3).map((id, k) => ({ character_id: id, position: positions[k] || 'center', action: 'standing', expression: 'deadpan' })),
        lettering: condense(items),
      };
    };
    return { panels: carousel ? [mk(g, 0)] : g.map((b, pi) => mk([b], pi)) };
  });
  const firstLine = (project.script || '').split(/[.\n]/)[0].trim();
  const silent = groups.filter((g) => g.every((b) => b.silent)).length;
  return { title: project.title || (firstLine.length < 48 ? firstLine : 'Untitled Comic'), characters, pages, cost: 0, beats: beats.length, silent };
}


// ---------------- prose → beats ----------------
const ATTR_VERBS = 'said|says|say|asks|asked|ask|replies|replied|reply|whispers|whispered|shouts|shouted|yells|yelled|mutters|muttered|adds|added|answers|answered|continues|continued|calls|called|explains|explained|sighs|sighed|thinks|thought|screams|screamed|tells|told|insists|insisted|offers|offered|announces|announced|notes|noted|murmurs|murmured|cries|cried|goes|went';
const STOP = new Set('The A An And But Or So Then When While After Before Because If As At In On Of To From By For With Without He She They It I We You His Her Their Its Our My Your This That These Those There Here Today Tomorrow Yesterday Tonight One Two Three Every Some Someone Something Nothing Nobody Everyone Everything Just Still Even Only Also Later Finally Suddenly Meanwhile Now Yes No Okay OK Oh Well Hey Hi Hello Exactly Sure Maybe Please Thanks Thank Good Great Fine Sorry What Why Who How Where Which Not Never Always All Both Each Once Soon Mom Mum Dad God Mr Mrs Ms Dr St Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Christmas Instagram ChatGPT Caption Narration Panel Slide Page'.split(' '));
const PERSON = 'stranger|man|woman|boy|girl|kid|child|guy|lady|gentleman|waiter|waitress|doctor|nurse|teacher|cop|officer|neighbour|neighbor|boss|robot|alien|dog|cat|king|queen|wizard|ghost|customer|clerk|driver|baby|grandma|grandpa|farmer|chef|barista|knight|dragon|monster|bird|duck|frog|bear';
const ABBR = /\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|e\.g|i\.e)\.$/;

function splitSentences(t) {
  const out = [];
  for (const m of t.matchAll(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g)) {
    const x = m[0].trim(); if (!x) continue;
    if (out.length && (ABBR.test(out.at(-1)) || /^[a-z]/.test(x))) out[out.length - 1] += ' ' + x; else out.push(x);
  }
  return out;
}
const words = (t) => (String(t).trim().match(/\S+/g) || []).length;

// Plain prose (with or without "quoted dialogue") → beats of { desc, items, para, who }.
export function proseBeats(text, addSpeaker) {
  const norm = String(text).replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\r/g, '');
  const paras = norm.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  // character names: capitalised words seen mid-sentence (or as a speaker), not common words
  const counts = new Map();
  for (const para of paras) for (const sent of splitSentences(para.replace(/"/g, ' " '))) {
    const toks = sent.replace(/"/g, ' . ').match(/[A-Za-z][A-Za-z'-]*|[.!?,;:]/g) || [];
    toks.forEach((w, i) => {
      if (!/^[A-Z][a-z]{1,}$/.test(w) || STOP.has(w)) return;
      const prev = toks[i - 1];
      const initial = i === 0 || /[.!?:]/.test(prev || '');
      if (prev && /^(the|a|an)$/i.test(prev)) return;
      const c = counts.get(w) || { mid: 0, all: 0 };
      c.all++; if (!initial) c.mid++; counts.set(w, c);
    });
  }
  const attrRe = new RegExp(`\\b([A-Z][a-z]+|he|she|they|I)\\s+(?:${ATTR_VERBS})\\b|\\b(?:${ATTR_VERBS})\\s+([A-Z][a-z]+)\\b`);
  for (const para of paras) for (const m of para.matchAll(new RegExp(attrRe.source, 'g'))) { const n = m[1] || m[2]; if (/^[A-Z][a-z]+$/.test(n) && !STOP.has(n)) { const c = counts.get(n) || { mid: 0, all: 0 }; c.mid += 2; counts.set(n, c); } }
  const names = [...counts].filter(([, c]) => c.mid >= 1 && (c.all >= 2 || c.mid >= 2 || counts.size <= 3)).map(([n]) => n);
  // unnamed recurring people: "the stranger", "the old man"… (seen at least twice) become characters too
  const roles = new Map();
  for (const m of norm.matchAll(new RegExp(`\\b[Tt]he ((?:old |young |little |tall |short )?(?:${PERSON}))\\b`, 'g'))) roles.set(m[1].toLowerCase(), (roles.get(m[1].toLowerCase()) || 0) + 1);
  const roleNames = [...roles].filter(([, c]) => c >= 2).map(([r]) => r);
  const nameRe = names.length || roleNames.length ? new RegExp(`\\b(${[...names, ...roleNames.map((r) => `[Tt]he ${r}`)].join('|')})\\b`, 'g') : null;
  const canon = (n) => (/^the /i.test(n) ? 'The ' + n.slice(4).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : n);
  const namesIn = (t) => (nameRe ? [...String(t).matchAll(nameRe)].map((m) => canon(m[1])) : []);
  roleNames.forEach((r) => names.push(canon('the ' + r)));
  names.forEach((n) => addSpeaker(n));
  const idOf = (n) => addSpeaker(n);

  const beats = [];
  let lastSubject = null; const recentSpeakers = [];
  const resolve = (who) => {
    if (who && names.includes(who)) return who;
    if (who && names.includes(canon(who))) return canon(who);
    if (who && /^(he|she|they|i)$/i.test(who)) return lastSubject;
    return null;
  };
  paras.forEach((para, pi) => {
    // tokens: alternating narrative / quote
    const parts = para.split(/("[^"]*"?)/).filter((x) => x && x.trim());
    let pendingAttr = null; // "Donna says:" before a quote
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('"')) {
        const quote = part.replace(/^"|"$/g, '').trim().replace(/,$/, '.');
        // attribution right after the quote: ', she says, sipping her coffee.'
        let speaker = pendingAttr; pendingAttr = null; let action = '';
        const next = parts[i + 1];
        if (next && !next.startsWith('"')) {
          const m = next.match(new RegExp(`^\\s*[,.!?]?\\s*(?:([A-Z][a-z]+|[Tt]he [a-z]+(?: [a-z]+)?|he|she|they|I)\\s+(?:${ATTR_VERBS})|(?:${ATTR_VERBS})\\s+([A-Z][a-z]+|the [a-z]+|he|she))\\b([^.!?"]*)[.!?]?`));
          if (m) {
            speaker = speaker || resolve(m[1] || m[2]);
            action = m[3].replace(/^[\s,]+|[\s,]+$/g, '');
            if (action && speaker) action = `${speaker}, ${action}`;
            parts[i + 1] = next.slice(m[0].length);
          }
        }
        if (!speaker) {
          // unattributed: conversation turn-taking between the last two speakers
          const last = recentSpeakers[0], other = recentSpeakers.find((x) => x !== last);
          speaker = beats.length && beats.at(-1).speech ? other || [...names].reverse().find((n) => n !== last) || last : lastSubject || last || null;
        }
        if (speaker) { lastSubject = lastSubject || speaker; recentSpeakers.unshift(speaker); recentSpeakers.splice(3); }
        const id = speaker ? idOf(speaker) : '';
        const type = /\bwhisper|murmur/.test(next || '') ? 'whisper' : /\b(shout|yell|scream)/.test(next || '') || /!{2,}$/.test(quote) ? 'shout' : /\bthinks|thought\b/.test(next || '') ? 'thought' : 'speech';
        const other = recentSpeakers.find((x) => x !== speaker) || (lastSubject !== speaker ? lastSubject : null);
        if (quote) beats.push({ desc: action, talk: [speaker, other].filter(Boolean), items: [{ type: id ? type : 'caption', speaker: id, text: quote }], para: pi, speech: true, who: speaker ? [id, ...(other ? [idOf(other)] : [])] : [] });
        continue;
      }
      let narr = part;
      // 'Donna says,' right before a quote is attribution, not narration
      if (parts[i + 1]?.startsWith('"')) {
        const m = narr.match(new RegExp(`(?:^|[.!?]\\s+)([^.!?]*?\\b([A-Z][a-z]+|he|she|they|I)\\s+(?:${ATTR_VERBS})\\b[^.!?"]*?)[,:]?\\s*$`));
        if (m) { pendingAttr = resolve(m[2]); narr = narr.slice(0, narr.length - m[1].length).trim(); const act = m[1].replace(new RegExp(`\\s*\\b(?:${ATTR_VERBS})\\b.*$`), '').trim(); if (act && act.split(' ').length > 1) beats.push({ desc: m[1].replace(/[,:]\s*$/, ''), items: [], para: pi, who: pendingAttr ? [idOf(pendingAttr)] : [] }); }
      }
      for (const sent of splitSentences(narr)) {
        if (!/[A-Za-z]/.test(sent)) continue;
        const ns = namesIn(sent);
        if (ns.length) lastSubject = ns[0];
        beats.push({ desc: sent, items: [{ type: 'caption', speaker: '', text: sent }], para: pi, who: ns.map(idOf) });
      }
    }
  });
  return beats;
}

const beatWords = (g) => g.flatMap((b) => b.items).reduce((a, i) => a + words(i.text), 0) + (g.some((b) => b.items.length) ? 0 : 4);

// Split a long narration beat at a clause boundary ("…, and …", "; ", " but ", " then ").
function splitBeat(b) {
  if (b.items.length !== 1 || b.items[0].type !== 'caption') return null;
  const t = b.items[0].text;
  const near = (arr) => arr.map((x) => ({ i: x.index, len: x[0].length })).filter((x) => x.i >= 12 && t.length - x.i >= 12).sort((p, q) => Math.abs(p.i - t.length / 2) - Math.abs(q.i - t.length / 2))[0];
  const m = near([...t.matchAll(/(;\s+|,\s+(?:and|but|so|then)\s+|\s+(?:but|then|until|before|after|when)\s+)/g)]) || near([...t.matchAll(/,\s+/g)]);
  if (!m || m.i < 12 || t.length - m.i < 12) return null;
  let a = t.slice(0, m.i).trim(), c = t.slice(m.i).replace(/^[;,]\s*/, '').trim();
  a = /[.!?…]$/.test(a) ? a : a + '…'; c = c[0].toUpperCase() + c.slice(1);
  return [{ ...b, desc: a, items: [{ ...b.items[0], text: a }] }, { ...b, desc: c, items: [{ ...b.items[0], text: c }] }];
}

// Exactly n groups of consecutive beats: balanced text per slide, splits at scene/paragraph breaks preferred.
export function fitBeats(beats, n) {
  let bs = beats.slice();
  if (!bs.length) bs = [{ desc: 'A quiet moment.', items: [] }];
  // too few: split long narration sentences (longest first), then add silent "pause" panels
  while (bs.length < n) {
    const order = bs.map((b, i) => [beatWords([b]), i]).sort((a, b) => b[0] - a[0]);
    let done = false;
    for (const [w, i] of order) { if (w < 9) break; const sp = splitBeat(bs[i]); if (sp) { bs.splice(i, 1, ...sp); done = true; break; } }
    if (!done) break;
  }
  if (bs.length < n) {
    const missing = n - bs.length, out = [];
    // pauses go after dialogue/narration beats, spread through the story, never first
    const slots = new Set(Array.from({ length: missing }, (_, k) => Math.max(0, Math.round(((k + 1) * bs.length) / (missing + 1)) - 1)));
    let extra = missing - slots.size;
    bs.forEach((b, i) => {
      out.push(b);
      if (slots.has(i)) out.push({ desc: '', items: [], silent: true, para: b.para, who: b.who });
      while (i === bs.length - 2 && extra > 0) { out.push({ desc: '', items: [], silent: true, para: b.para, who: b.who }); extra--; }
    });
    return out.slice(0, n).map((b) => [b]);
  }
  // too many: DP partition into n consecutive groups
  const M = bs.length, total = bs.reduce((a, b) => a + beatWords([b]), 0), avg = total / n;
  const cost = (i, j) => { // group bs[i..j)
    const g = bs.slice(i, j), w = beatWords(g);
    let c = ((w - avg) / Math.max(4, avg)) ** 2;
    for (let k = i + 1; k < j; k++) {
      if (bs[k].para !== bs[k - 1].para) c += 0.6;
      if (bs[k].desc && bs[k - 1].desc && bs[k].desc !== bs[k - 1].desc && !bs[k].speech && !bs[k - 1].speech) c += 0.15;
    }
    if (g.flatMap((b) => b.items).length > 3) c += 1;
    if (w > 45) c += (w - 45) / 10;
    return c;
  };
  const INF = 1e18, dp = Array.from({ length: n + 1 }, () => new Float64Array(M + 1).fill(INF)), from = Array.from({ length: n + 1 }, () => new Int32Array(M + 1));
  dp[0][0] = 0;
  for (let k = 1; k <= n; k++) for (let j = k; j <= M - (n - k); j++) for (let i = k - 1; i < j; i++) {
    if (dp[k - 1][i] === INF) continue;
    const v = dp[k - 1][i] + cost(i, j);
    if (v < dp[k][j]) { dp[k][j] = v; from[k][j] = i; }
  }
  const groups = []; let j = M;
  for (let k = n; k > 0; k--) { const i = from[k][j]; groups.unshift(bs.slice(i, j)); j = i; }
  return groups;
}

// Keep slide text readable: merge consecutive narration, cap ~40 words (speech kept first), ≤3 boxes.
export function condense(items, budget = 34) {
  let out = [];
  for (const it of items) {
    const prev = out.at(-1);
    if (prev && it.type === 'caption' && prev.type === 'caption' && words(prev.text) + words(it.text) <= 28) prev.text = `${prev.text} ${it.text}`;
    else if (prev && it.type !== 'caption' && it.type !== 'sfx' && prev.speaker === it.speaker && prev.type === it.type && words(prev.text) + words(it.text) <= 30) prev.text = `${prev.text} ${it.text}`;
    else out.push({ ...it });
  }
  const total = out.reduce((a, i) => a + words(i.text), 0);
  if (total > budget || out.length > 3) {
    // keep dialogue, then narration in story order while it fits
    let left = budget - out.filter((i) => i.type !== 'caption').reduce((a, i) => a + words(i.text), 0);
    const keep = new Set(out.filter((i) => i.type !== 'caption'));
    for (const i of out) if (i.type === 'caption' && (words(i.text) <= left || ![...keep].some((k) => k.type === 'caption'))) { keep.add(i); left -= words(i.text); }
    out = out.filter((i) => keep.has(i));
    while (out.length > 3) out.splice(out.findIndex((i) => i.type === 'caption') >= 0 && out.length > 3 ? out.findLastIndex((i) => i.type === 'caption') : out.length - 1, 1);
  }
  return out;
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
  const garment = clothWord ? d.match(new RegExp(`${clothWord} (shirt|dress|suit|jacket|hoodie|sweater|top|robe|t-shirt|coat)`))[1] : 'shirt';
  const age = (d.match(new RegExp(`${name.toLowerCase()}(?:,| is| was)? (\\d{1,3})\\b`)) || d.match(/\b(\d{1,3})[- ]year[- ]old\b/) || [])[1];
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
  look.text = `${age ? `${age} years old. ` : ''}Simple cartoon person, round face, dot eyes, single-line mouth, big blocky ${hairName} hair in a ${look.style === 'bald' ? 'balding' : look.style} cut${look.beard ? ', short beard' : ''}, plain ${shirtName} ${garment}${garment === 'dress' ? '' : ', dark trousers'}.`;
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
