import { parseKey } from './keys.js';

export const ERRORS_MAX = 600;
export const WEEK_DAYS = 7;
export const WEAK_MIN_TRIES = 5;

export const ERROR_KINDS = Object.freeze(['see', 'hear', 'blend', 'read', 'divide', 'label', 'sort', 'write', 'story', 'self']);



const conf = (id, kind, members, extra = {}) => Object.freeze({ id, kind, members: Object.freeze(members), ...extra });

export const CONFUSIONS = Object.freeze([
  conf('b/d/p/q', 'letter', ['b', 'd', 'p', 'q']),
  conf('m/n', 'letter', ['m', 'n']),
  conf('short e/i', 'short-vowel', ['e', 'i']),
  conf('short o/u', 'short-vowel', ['o', 'u']),
  conf('short a/e', 'short-vowel', ['a', 'e']),
  conf('ai/ay', 'team', ['ai', 'ay']),
  conf('ee/ea', 'team', ['ee', 'ea']),
  conf('oa/ow', 'team', ['oa', 'ow']),
  conf('igh/ie', 'team', ['igh', 'ie']),
  conf('oi/oy', 'team', ['oi', 'oy']),
  conf('ou/ow', 'team', ['ou', 'ow']),
  conf('au/aw', 'team', ['au', 'aw']),
  conf('er/ir/ur', 'r-control', ['er', 'ir', 'ur']),
  conf('ar/or', 'r-control', ['ar', 'or']),
  conf('sh/ch', 'sound', ['sh', 'ch']),
  conf('th/f', 'sound', ['th', 'f']),
  conf('ck/k', 'sound', ['ck', 'k']),
  conf('-le/-el', 'ending', ['le', 'el'], { at: 'end' }),
  conf('-ed endings (/t/ /d/ /ed/)', 'ending', ['ed', 't', 'd', 'ed:t', 'ed:d', 'ed:@d'], { involves: 'ed' }),
  conf('V/CV or VC/V', 'split', ['V/CV', 'VC/V']),
  conf('VC/CV or V/CCV', 'split', ['VC/CV', 'V/CCV']),
  conf('VC/CV or VCC/V', 'split', ['VC/CV', 'VCC/V']),
  conf('VC/CCV or VCC/CV', 'split', ['VC/CCV', 'VCC/CV']),
  conf('closed or open', 'label', ['closed', 'open']),
  conf('closed or silent-e', 'label', ['closed', 'vce']),
  conf('open or silent-e', 'label', ['open', 'vce']),
  conf('silent-e or team', 'label', ['vce', 'team']),
  conf('closed or team', 'label', ['closed', 'team']),
  conf('open or team', 'label', ['open', 'team']),
  conf('closed or r', 'label', ['closed', 'r']),
  conf('team or r', 'label', ['team', 'r']),
  conf('closed or le', 'label', ['closed', 'le']),
  conf('open or le', 'label', ['open', 'le']),
]);

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function isErrorEntry(v) {
  return isObject(v) && isNumber(v.day) && typeof v.key === 'string' && v.key !== ''
    && ERROR_KINDS.includes(v.kind) && typeof v.target === 'string'
    && (v.said === undefined || typeof v.said === 'string');
}

export function withError(profile, entry) {
  if (!isErrorEntry(entry)) return profile;
  const clean = { day: entry.day, key: entry.key, kind: entry.kind, target: entry.target, ...(entry.said !== undefined && entry.said !== '' ? { said: entry.said } : {}) };
  const list = Array.isArray(profile?.errors) ? profile.errors : [];
  return { ...profile, errors: [...list, clean].slice(-ERRORS_MAX) };
}

export function errorsIn(errors, fromDay, toDay) {
  return (Array.isArray(errors) ? errors : []).filter((e) => isErrorEntry(e) && e.kind !== 'self' && e.day >= fromDay && e.day <= toDay);
}



function found(family, kind, x, y) {
  const [a, b] = x < y ? [x, y] : [y, x];
  return { confusion: family ? family.id : kind, kind, a, b, pair: kind === 'split' || kind === 'label' ? `${a} vs ${b}` : `${a}/${b}` };
}

function familyOf(x, y, allow = () => true) {
  if (x === y) return null;
  for (const c of CONFUSIONS) {
    if (!allow(c) || !c.members.includes(x) || !c.members.includes(y)) continue;
    if (c.involves && !x.startsWith(c.involves) && !y.startsWith(c.involves)) continue;
    return c;
  }
  return null;
}

const isLetters = (s) => /^[a-z]+$/i.test(s);

function wordPair(target, said) {
  if (!isLetters(target) || !isLetters(said) || target === said) return null;
  let head = 0;
  while (head < target.length && head < said.length && target[head] === said[head]) head++;
  let tail = 0;
  while (tail < target.length - head && tail < said.length - head && target[target.length - 1 - tail] === said[said.length - 1 - tail]) tail++;
  const tEnd = target.length - tail;
  const sEnd = said.length - tail;
  const widen = [];
  for (let l = 0; l <= 2; l++) for (let r = 0; r <= 2; r++) widen.push([l, r]);
  widen.sort((p, q) => p[0] + p[1] - q[0] - q[1]);
  for (const [l, r] of widen) {
    if (head - l < 0 || r > tail) continue;
    const x = target.slice(head - l, tEnd + r);
    const y = said.slice(head - l, sEnd + r);
    if (x === '' || y === '') continue;
    const atEnd = tEnd + r === target.length;
    const family = familyOf(x, y, (c) => c.kind !== 'split' && c.kind !== 'label' && (c.at !== 'end' || atEnd));
    if (family) return found(family, family.kind, x, y);
  }
  return null;
}

const CONSONANT = (ch) => !'aeiou'.includes(ch);

function gapShape(word, cut) {
  let start = cut;
  while (start > 0 && CONSONANT(word[start - 1])) start--;
  let end = cut;
  while (end < word.length && CONSONANT(word[end])) end++;
  if (start === 0 || end === word.length) return null;
  const n = end - start;
  const c = cut - start;
  return { name: `V${'C'.repeat(c)}/${'C'.repeat(n - c)}V`, run: `${start}:${end}` };
}

function cutsOf(text) {
  const parts = text.toLowerCase().split(/[|/\-\s.·]+/).filter(Boolean);
  const cuts = [];
  let n = 0;
  for (const p of parts.slice(0, -1)) { n += p.length; cuts.push(n); }
  return { word: parts.join(''), cuts };
}

function splitPair(target, said) {
  const t = cutsOf(target);
  const s = cutsOf(said);
  if (t.word === '' || t.word !== s.word) return null;
  const onlyT = t.cuts.filter((c) => !s.cuts.includes(c));
  const onlyS = s.cuts.filter((c) => !t.cuts.includes(c));
  if (onlyT.length !== 1 || onlyS.length !== 1) return null;
  const x = gapShape(t.word, onlyT[0]);
  const y = gapShape(t.word, onlyS[0]);
  if (!x || !y || x.run !== y.run || x.name === y.name) return null;
  const family = familyOf(x.name, y.name, (c) => c.kind === 'split');
  return found(family, 'split', x.name, y.name);
}

export function pairOf(entry) {
  if (!isErrorEntry(entry) || entry.kind === 'self') return null;
  const target = entry.target.trim();
  const said = (entry.said ?? '').trim();
  if (target === '' || said === '' || target === said) return null;
  if (entry.kind === 'divide') return splitPair(target, said);
  if (entry.kind === 'label') {
    const family = familyOf(target, said, (c) => c.kind === 'label');
    return family ? found(family, 'label', target, said) : null;
  }
  const direct = familyOf(target, said, (c) => c.kind !== 'split' && c.kind !== 'label');
  if (direct) return found(direct, direct.kind, target, said);
  const baseT = target.split(':')[0];
  const baseS = said.split(':')[0];
  if (baseT !== baseS) {
    const family = familyOf(baseT, baseS, (c) => c.kind !== 'split' && c.kind !== 'label');
    if (family) return found(family, family.kind, baseT, baseS);
  }
  return wordPair(target.toLowerCase(), said.toLowerCase());
}



export function trickyPairs(errors, fromDay, toDay) {
  const seen = new Map();
  for (const entry of errorsIn(errors, fromDay, toDay)) {
    const f = pairOf(entry);
    if (!f) continue;
    const old = seen.get(f.pair) ?? { pair: f.pair, a: f.a, b: f.b, confusion: f.confusion, kind: f.kind, count: 0, lastDay: entry.day, examples: [] };
    old.count += 1;
    old.lastDay = Math.max(old.lastDay, entry.day);
    if (old.examples.length < 3 && !old.examples.includes(entry.target)) old.examples.push(entry.target);
    seen.set(f.pair, old);
  }
  return [...seen.values()].sort((p, q) => q.count - p.count || q.lastDay - p.lastDay || (p.pair < q.pair ? -1 : p.pair > q.pair ? 1 : 0));
}


export function stateEntries(states) {
  if (!states) return [];
  if (Array.isArray(states)) return states.filter((s) => isObject(s) && typeof s.key === 'string').map((s) => [s.key, s]);
  return [...states];
}


export function weakGraphemes(states, errors, day) {
  const from = day - (WEEK_DAYS - 1);
  const counts = new Map();
  for (const [key, state] of stateEntries(states)) {
    const k = parseKey(key);
    if (!k || k.prefix !== 'g' || !Array.isArray(state?.hist)) continue;
    const c = counts.get(k.id) ?? { tries: 0, right: 0 };
    for (const h of state.hist) {
      if (!isObject(h) || !isNumber(h.day) || h.day < from || h.day > day) continue;
      c.tries += 1;
      if (h.correct === true && h.helped !== true) c.right += 1;
    }
    counts.set(k.id, c);
  }
  const log = errorsIn(errors, from, day);
  return [...counts]
    .filter(([, c]) => c.tries >= WEAK_MIN_TRIES && c.right < c.tries)
    .map(([id, c]) => {
      const mine = log.filter((e) => parseKey(e.key)?.prefix === 'g' && parseKey(e.key)?.id === id);
      const said = new Map();
      for (const e of mine) if (e.said) said.set(e.said, (said.get(e.said) ?? 0) + 1);
      const top = [...said].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1))[0];
      return { id, tries: c.tries, right: c.right, accuracy: c.right / c.tries, misses: mine.length, said: top ? top[0] : null };
    })
    .sort((p, q) => p.accuracy - q.accuracy || q.tries - p.tries || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}


const SOUND_KINDS = ['letter', 'short-vowel', 'team', 'r-control', 'sound'];
export const WEIGHT_DAYS = 21;
export const WEIGHT_MAX_EXTRA = 8;

export function drillWeights(errors, day) {
  const extra = new Map();
  const add = (id, points) => extra.set(id, Math.min(WEIGHT_MAX_EXTRA, (extra.get(id) ?? 0) + points));
  for (const entry of errorsIn(errors, day - (WEIGHT_DAYS - 1), day)) {
    const age = day - entry.day;
    const points = age <= 2 ? 3 : age <= 6 ? 2 : 1;
    const k = parseKey(entry.key);
    if (k?.prefix === 'g') add(k.id, points);
    const f = pairOf(entry);
    if (f && SOUND_KINDS.includes(f.kind)) {
      for (const id of [f.a, f.b]) if (!(k?.prefix === 'g' && k.id === id)) add(id, points);
    }
  }
  return new Map([...extra].map(([id, n]) => [id, 1 + n]));
}
