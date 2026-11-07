import { gaps as gapsOf } from '../curriculum/divide.js';
import { soundKind } from '../curriculum/phonemes.js';
import { isDoubled } from '../curriculum/syllables.js';

export const ERROR_TYPES = Object.freeze(['team', 'vce', 'vcv', 'le']);



function starts(segs) {
  const out = [0];
  for (const [g] of segs) out.push(out[out.length - 1] + String(g).length);
  return out;
}

export function protegeOptions(rec, opts = {}) {
  if (!rec || typeof rec.w !== 'string' || !Array.isArray(rec.segs) || rec.segs.length === 0 || rec.flex) return [];
  const segs = rec.segs;
  let dgaps;
  try {
    dgaps = gapsOf(segs, { isWord: opts.isWord, base: rec.base ?? null });
  } catch {
    return [];
  }
  if (!Array.isArray(dgaps) || dgaps.length === 0) return [];
  const st = starts(segs);
  const len = st[st.length - 1];
  if (len !== rec.w.length) return [];
  const right = dgaps.map((g) => g.at);
  const out = [];
  const add = (type, g, at) => {
    const lo = g > 0 ? right[g - 1] : 0;
    const hi = g < right.length - 1 ? right[g + 1] : len;
    if (!(at > lo && at < hi) || at === right[g]) return;
    if (dgaps[g].flexAt === at) return;
    if (out.some((o) => o.gap === g && o.wrong[g] === at)) return;
    out.push({ type, gap: g, wrong: right.map((r, i) => (i === g ? at : r)) });
  };
  const kindOf = ( s) => soundKind(segs[s][1]);
  dgaps.forEach((gap, g) => {
    for (let s = gap.boxes[0]; s <= gap.boxes[1]; s++) {
      const letters = String(segs[s][0]);
      if (letters.length < 2 || isDoubled(segs[s]) || kindOf(s) === 'silent') continue;
      if (/le$/i.test(letters) && s === segs.length - 1) continue;
      add('team', g, st[s] + 1);
    }
    if (gap.pattern === 'C+le' || gap.pattern === 'CC+le') add('le', g, st[gap.boxes[1]]);
    if ((gap.pattern === 'V/CV' || gap.pattern === 'VC/V') && gap.between.length === 1) {
      const b = gap.between[0];
      add('vcv', g, gap.at === st[b] ? st[b + 1] : st[b]);
    }
  });
  for (let s = 2; s < segs.length; s++) {
    if (kindOf(s) !== 'silent' || String(segs[s][0]).toLowerCase() !== 'e') continue;
    if (kindOf(s - 1) === 'vowel' || kindOf(s - 2) !== 'vowel') continue;
    let g = -1;
    for (let i = 0; i < right.length; i++) if (right[i] < st[s]) g = i;
    if (g >= 0) add('vce', g, st[s]);
  }
  return out;
}

export function pickProtege(words, opts = {}) {
  const list = Array.isArray(words) ? words : [];
  const seen = new Set();
  for (const rec of list) {
    if (!rec || seen.has(rec.w)) continue;
    seen.add(rec.w);
    const options = protegeOptions(rec, opts);
    if (options.length === 0) continue;
    const one = (opts.rng?.pick ? opts.rng.pick(options) : options[0]) ?? options[0];
    return { rec, word: rec.w, type: one.type, gap: one.gap, right: gapsOf(rec.segs, { isWord: opts.isWord, base: rec.base ?? null }).map((g) => g.at), wrong: one.wrong };
  }
  return null;
}
