import { phonemeCodes, soundKind } from './phonemes.js';
import { isDoubled } from './syllables.js';




export const ONSETS = Object.freeze(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'sc', 'sk', 'sl',
  'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw', 'scr', 'spl', 'spr', 'str', 'thr', 'shr']);
const ONSET_SET = new Set(ONSETS);

const ENDINGS = new Set(['es', 'ed', 'ing']);
const LONG = new Set(['A', 'E', 'I', 'O', 'U', 'oo']);
const R_CONTROLLED = new Set(['ar', 'or', 'er', 'air', 'ear']);

const lower = ( g) => String(g ?? '').toLowerCase();
const isVowelSeg = (seg) => seg !== undefined && soundKind(seg[1]) === 'vowel';
const isSilentSeg = (seg) => seg !== undefined && soundKind(seg[1]) === 'silent';
const isSilentE = (seg) => isSilentSeg(seg) && lower(seg?.[0]) === 'e';
const isRControlled = (seg) => phonemeCodes(seg[1]).some((c) => R_CONTROLLED.has(c));
const isLong = (seg) => phonemeCodes(seg[1]).some((c) => LONG.has(c));

function starts(segs) {
  const st = [0];
  for (const [g] of segs) st.push(st[st.length - 1] + String(g).length);
  return st;
}

const wordOf = (segs) => segs.map(([g]) => g).join('');

export function vowelBoxes(segs) {
  return segs.flatMap((seg, i) => (isVowelSeg(seg) ? [i] : []));
}

function unitsBetween(segs, st, a, b) {
  const out = [];
  for (let i = a + 1; i < b; i++) {
    const seg = segs[i];
    if (isSilentSeg(seg)) continue;
    if (isDoubled(seg)) {
      out.push({ seg: i, from: st[i], to: st[i] + 1, g: lower(seg[0][0]) });
      out.push({ seg: i, from: st[i] + 1, to: st[i + 1], g: lower(seg[0].slice(1)) });
    } else {
      out.push({ seg: i, from: st[i], to: st[i + 1], g: lower(seg[0]) });
    }
  }
  return out;
}

function cuttable(segs, st, k) {
  for (let i = 0; i < segs.length; i++) {
    if (st[i] === k) return true;
    if (st[i] < k && k < st[i + 1]) return isDoubled(segs[i]) && k === st[i] + 1;
  }
  return false;
}

function compoundCuts(segs, st, boxes, w, isWord, from, to) {
  const hasBox = ( lo, hi) => boxes.some((i) => st[i] >= lo && st[i + 1] <= hi);
  for (let k = from + 1; k < to; k++) {
    if (!cuttable(segs, st, k) || !hasBox(from, k) || !hasBox(k, to)) continue;
    if (isWord(w.slice(from, k)) && isWord(w.slice(k, to))) {
      return [...compoundCuts(segs, st, boxes, w, isWord, from, k), k, ...compoundCuts(segs, st, boxes, w, isWord, k, to)];
    }
  }
  return [];
}

function endingSplit(st, boxes, w, base) {
  if (!base || boxes.length < 2) return null;
  const last = boxes[boxes.length - 1];
  if (!ENDINGS.has(w.slice(st[last]))) return null;
  const prefix = w.slice(0, st[last]);
  const b = lower(base);
  const low = st[boxes[boxes.length - 2] + 1];
  if (b.length >= 2 && prefix === b + b[b.length - 1] && !'aeiou'.includes(b[b.length - 1]) && b.length >= low) {
    return { at: b.length, dropE: false };
  }
  return { at: st[last], dropE: prefix + 'e' === b };
}

function divide(segs, opts = {}) {
  const st = starts(segs);
  const w = lower(wordOf(segs));
  const boxes = vowelBoxes(segs);
  const cuts = opts.isWord && boxes.length >= 2 ? compoundCuts(segs, st, boxes, w, opts.isWord, 0, w.length) : [];
  const ending = endingSplit(st, boxes, w, opts.base);
  const gaps = [];
  for (let g = 0; g + 1 < boxes.length; g++) {
    const a = boxes[g];
    const b = boxes[g + 1];
    const C = unitsBetween(segs, st, a, b);
    const between = [...new Set(C.map((u) => u.seg))];
    const make = (at, pattern, extra = {}) => {
      const seg = st.findIndex((s, i) => i < segs.length && s <= at && at < st[i + 1]);
      return { at, seg, twin: st[seg] !== at, boxes: ([a, b]), between, pattern, ...extra };
    };
    const lo = st[a + 1];
    const hi = st[b];
    const cut = cuts.find((c) => c >= lo && c <= hi);
    const last = g === boxes.length - 2;
    if (cut !== undefined) { gaps.push(make(cut, 'compound')); continue; }
    if (last && ending && ending.at >= lo && ending.at <= hi) { gaps.push(make(ending.at, 'ending')); continue; }
    if (last && b === segs.length - 1 && lower(segs[b][0]) === 'le' && C.length > 0) {
      const u = C[C.length - 1];
      if (isDoubled(segs[u.seg])) gaps.push(make(u.from, 'CC+le'));
      else if (u.g === 'ck') gaps.push(make(u.to, 'CC+le'));
      else gaps.push(make(u.from, 'C+le'));
      continue;
    }
    if (C.length === 0) { gaps.push(make(st[b], 'VV')); continue; }
    if (C.length === 1) {
      const first = segs[a];
      const single = String(first[0]).length === 1 && !isRControlled(first);
      if (!single) gaps.push(make(C[0].from, 'V/CV'));
      else if (isLong(first)) gaps.push(make(C[0].from, 'V/CV', { alt: C[0].to }));
      else gaps.push(make(C[0].to, 'VC/V', { flexAt: C[0].from, alt: C[0].from }));
      continue;
    }
    if (C.length === 2) { gaps.push(make(C[1].from, 'VC/CV')); continue; }
    let at = C[C.length - 1].from;
    for (let k = Math.min(3, C.length - 1); k >= 2; k--) {
      if (ONSET_SET.has(C.slice(-k).map((u) => u.g).join(''))) { at = C[C.length - k].from; break; }
    }
    gaps.push(make(at, 'VCCCV'));
  }
  return { st, w, boxes, gaps, dropE: Boolean(ending?.dropE) };
}

function typesFor(segs, st, boxes, at, dropE = false) {
  const bounds = [...at, st[segs.length]];
  return boxes.map((bi, k) => {
    const seg = segs[bi];
    const g = lower(seg[0]);
    if (g === 'le') return 'le';
    if (isRControlled(seg)) return 'r';
    if (g.length >= 2) return ENDINGS.has(g) ? 'closed' : 'team';
    const end = bounds[k];
    const after = [];
    for (let i = bi + 1; i < segs.length && st[i] < end; i++) after.push(segs[i]);
    const silentAt = after.findIndex(isSilentE);
    const before = (silentAt < 0 ? after : after.slice(0, silentAt)).filter((s) => !isSilentSeg(s));
    if (before.length === 0) return 'open';
    if (silentAt > 0 && (before.length === 1 || isLong(seg))) return 'vce';
    if (silentAt < 0 && isLong(seg) && before.length === 2 && ['ed', 'es'].includes(lower(before[1][0]))) return 'vce';
    if (silentAt < 0 && dropE && k === boxes.length - 2 && isLong(seg) && before.length === 1) return 'vce';
    return 'closed';
  });
}

export function gaps(segs, opts) {
  return divide(segs, opts).gaps.map(({ alt, ...gap }) => gap);
}

export function splits(segs, opts) {
  return divide(segs, opts).gaps.map((g) => g.at);
}

const cut = (segs, at) => {
  const w = wordOf(segs);
  const bounds = [0, ...at, w.length];
  return bounds.slice(1).map((end, i) => w.slice(bounds[i], end));
};

export function parts(segs, opts) {
  return cut(segs, splits(segs, opts));
}

export function syllableTypesOf(segs, opts) {
  const d = divide(segs, opts);
  return typesFor(segs, d.st, d.boxes, d.gaps.map((g) => g.at), d.dropE);
}

export function patternsOf(segs, opts) {
  return divide(segs, opts).gaps.map((g) => g.pattern);
}

export function patternOf(segs, opts) {
  const p = patternsOf(segs, opts);
  if (p.length === 0) return 'one';
  return p.length === 1 ? p[0] : 'mixed';
}

export function flipSplit(segs, gapIndex, opts) {
  const d = divide(segs, opts);
  const gap = d.gaps[gapIndex];
  if (!gap || gap.alt === undefined) return null;
  const at = d.gaps.map((g, i) => (i === gapIndex ? (gap.alt) : g.at));
  return { at, parts: cut(segs, at), types: typesFor(segs, d.st, d.boxes, at, d.dropE) };
}

export function flexOf(segs, opts) {
  const d = divide(segs, opts);
  const i = d.gaps.findIndex((g) => g.flexAt !== undefined);
  if (i < 0) return null;
  return cut(segs, d.gaps.map((g, k) => (k === i ? (g.flexAt) : g.at))).join('|');
}


export function vowelTapTargets(segs) {
  const st = starts(segs);
  const target = ( i) => ({ seg: i, g: String(segs[i][0]), from: st[i], to: st[i + 1] });
  return {
    targets: vowelBoxes(segs).map(target),
    silent: segs.flatMap((seg, i) => (isSilentE(seg) ? [target(i)] : [])),
  };
}
