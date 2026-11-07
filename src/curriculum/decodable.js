import { graphemeOf, graphemeStage } from './graphemes.js';
import { phonemeCodes } from './phonemes.js';
import { gaps, patternOf, syllableTypesOf, vowelBoxes } from './divide.js';
import {
  ENDINGS_STAGE, SCHWA_STAGE, patternStage, stageIndex, syllableStage, typeStage,
} from './stages.js';


export const VCE_LONG_WORD_STAGE = 13;

const TYPE_ORDER = Object.freeze(['closed', 'open', 'vce', 'team', 'r', 'le']);

const SEG_ALIASES = Object.freeze({ 'es|i z': 'es:@z', 'u|oo': 'u:U' });

const SHORT_OF = Object.freeze({ a: 'a', e: 'e', i: 'i', o: 'o', u: 'u' });

const isRedRec = (rec) => rec != null && (Array.isArray(rec.tricky) || typeof rec.heart === 'string') && !Array.isArray(rec.types);

function typesOfRec(segs, rec) {
  const boxes = vowelBoxes(segs);
  if (Array.isArray(rec.types) && rec.types.length === boxes.length) return rec.types;
  return syllableTypesOf(segs, { base: rec.base ?? null });
}

export function segStage(seg, type) {
  const g = String(seg[0]).toLowerCase();
  const p = phonemeCodes(seg[1]).join(' ');
  const alias = SEG_ALIASES[`${g}|${p}`];
  if (alias) {
    if (!(g === 'u' && type === 'vce')) return graphemeOf(alias)?.stage ?? null;
  }
  if (p === '@' && g.length === 1 && Object.hasOwn(SHORT_OF, g)) {
    return type === 'open' ? graphemeStage(g, '@') : graphemeStage(g, SHORT_OF[g]);
  }
  return graphemeStage(g, p, type === 'vce' ? 'vce' : undefined);
}

export function untaughtSegs(rec) {
  const segs = rec.segs;
  const boxes = vowelBoxes(segs);
  const types = typesOfRec(segs, rec);
  const out = [];
  segs.forEach((seg, i) => {
    const k = boxes.indexOf(i);
    if (segStage(seg, k >= 0 ? types[k] : undefined) === null) out.push({ index: i, seg });
  });
  return out;
}

export function wordStage(rec) {
  if (isRedRec(rec)) {
    const n = stageIndex(String(rec.stage));
    return n < 0 ? Infinity : n;
  }
  const segs = rec?.segs;
  if (!Array.isArray(segs) || segs.length === 0) return Infinity;
  const boxes = vowelBoxes(segs);
  const types = typesOfRec(segs, rec);
  let stage = 0;

  for (let i = 0; i < segs.length; i++) {
    const k = boxes.indexOf(i);
    const s = segStage(segs[i], k >= 0 ? types[k] : undefined);
    if (s === null) return Infinity;
    stage = Math.max(stage, s);
  }
  for (const t of new Set(types)) {
    const s = typeStage(t);
    if (s === null) return Infinity;
    stage = Math.max(stage, s);
  }
  const count = boxes.length;
  const given = typeof rec.pattern === 'string' && rec.pattern !== '' ? rec.pattern : null;
  const pattern = given ?? patternOf(segs, { base: rec.base ?? null });
  if (count > 3) return Infinity;
  if (count === 2 && pattern === 'ending') stage = Math.max(stage, ENDINGS_STAGE);
  else if (count >= 2) {
    const latest = types.reduce((best, t) => Math.max(best, TYPE_ORDER.indexOf(t)), 0);
    const s = syllableStage(count, TYPE_ORDER[latest]);
    if (s === null) return Infinity;
    stage = Math.max(stage, s);
  }
  if (count >= 2 && types.includes('vce')) stage = Math.max(stage, VCE_LONG_WORD_STAGE);
  if (count >= 2) {
    const own = gaps(segs, { base: rec.base ?? null });
    const per = pattern !== 'mixed' ? [pattern] : Array.isArray(rec.patterns) ? rec.patterns : own.map((g) => g.pattern);
    per.forEach((pat, k) => {
      const twin = (own[k]?.between.length ?? 2) === 1;
      const s = patternStage(pat, { twin });
      if (s !== null) stage = Math.max(stage, s);
    });
  }
  if (rec.base) stage = Math.max(stage, ENDINGS_STAGE);
  if (rec.schwa === true) stage = Math.max(stage, SCHWA_STAGE);
  return stage;
}

export const isDecodable = (rec, index) => wordStage(rec) <= index;

const TOKEN = /[A-Za-z]+(?:['’-][A-Za-z]+)*|\d+(?:[.,]\d+)*/g;

export function tokenize(text) {
  return String(text ?? '').replace(/’/g, "'").match(TOKEN) ?? [];
}


export function textBlockers(text, { lookup, red = [], names = [], stageIndex: at }) {
  const sight = new Map();
  for (const r of red instanceof Map ? red.values() : red) if (r && typeof r.w === 'string') sight.set(r.w.toLowerCase(), r);
  const multi = names
    .map((n) => ({ ...n, words: tokenize(n.name) }))
    .filter((n) => n.words.length > 0)
    .sort((a, b) => b.words.length - a.words.length);
  const single = new Map(multi.filter((n) => n.words.length === 1).map((n) => [n.words[0], n]));

  const tokens = tokenize(text);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const hit = multi.find((n) => n.words.length > 1 && n.words.every((w, k) => tokens[i + k] === w));
    if (hit) {
      if (hit.stage > at) out.push({ token: hit.name, why: `name appears from stage ${hit.stage}` });
      i += hit.words.length - 1;
      continue;
    }
    if (/^\d/.test(token)) continue;
    const bare = token.replace(/'s$/, '');
    const name = single.get(token) ?? single.get(bare);
    const lower = token.toLowerCase();
    const word = lookup(lower);
    const sightRec = sight.get(lower);
    const why = [];
    let ok = false;
    if (name) { if (name.stage <= at) ok = true; else why.push(`name appears from stage ${name.stage}`); }
    if (!ok && sightRec) {
      const s = wordStage(sightRec);
      if (s <= at) ok = true; else why.push(`sight word introduced at stage ${s}`);
    }
    if (!ok && word) {
      const s = wordStage(word);
      if (s <= at) ok = true; else why.push(`word needs stage ${s}`);
    }
    if (!ok) out.push({ token, why: why.length > 0 ? why.join('; ') : 'not in the lexicon' });
  }
  return out;
}
