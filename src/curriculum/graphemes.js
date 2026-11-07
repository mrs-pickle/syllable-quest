import { phonemeCodes } from './phonemes.js';
import { soundId } from '../core/voice-ids.js';


const RAW = [];
const NOCARD = Object.freeze({ card: false });

function at(stage, specs) {
  for (const s of specs) {
    const [id, g, p, opt] = typeof s === 'string' ? [s, s, s] : s;
    RAW.push({ id, g, p: phonemeCodes(p).join(' '), stage, ...(opt && opt.card === false ? { card: false } : {}) });
  }
}

at(0, [
  'a', 'e', 'i', 'o', 'u',
  'b', ['c', 'c', 'k'], 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'z',
  ['x', 'x', 'k s'], ['y', 'y', 'y'], ['qu', 'qu', 'k w'],
  'sh', 'ch', ['th', 'th', 'th'], ['th:dh', 'th', 'dh'], ['wh', 'wh', 'w'], ['ck', 'ck', 'k'], 'ng',
  ['nk', 'nk', 'ng k'], ['tch', 'tch', 'ch'], ['dge', 'dge', 'j'],
  ['ff', 'ff', 'f'], ['ll', 'll', 'l'], ['ss', 'ss', 's'], ['zz', 'zz', 'z'], ['all', 'all', 'aw l'],
]);
at(1, [
  ['s:s', 's', 's'], ['s:z', 's', 'z'], ['es:@z', 'es', '@ z'], ['ed:t', 'ed', 't'], ['ed:d', 'ed', 'd'],
  ['ed:@d', 'ed', '@ d'], ['ing', 'ing', 'i ng'],
  ['ed:id', 'ed', 'i d', NOCARD],
  ['a:o', 'a', 'o', NOCARD],
  ...['bb', 'dd', 'gg', 'mm', 'nn', 'pp', 'rr', 'tt'].map(d => [d, d, d[0], NOCARD]),
  ['cc', 'cc', 'k', NOCARD],
]);
at(7, [['a:A', 'a', 'A'], ['e:E', 'e', 'E'], ['i:I', 'i', 'I'], ['o:O', 'o', 'O'], ['u:U', 'u', 'U']]);
at(9, [['y:E', 'y', 'E'], ['y:I', 'y', 'I']]);
at(10, ['a', 'e', 'i', 'o', 'u'].map(v => [`${v}:@`, v, '@', NOCARD]));
at(11, [['a-e', 'a-e', 'A'], ['e-e', 'e-e', 'E'], ['i-e', 'i-e', 'I'], ['o-e', 'o-e', 'O'], ['u-e', 'u-e', 'U'],
  ['u-e:oo', 'u-e', 'oo', NOCARD]]);
at(12, [['c:s', 'c', 's'], ['g:j', 'g', 'j']]);
at(13, [['kn', 'kn', 'n'], ['wr', 'wr', 'r']]);
at(15, [['ai', 'ai', 'A'], ['ay', 'ay', 'A']]);
at(16, [['ee', 'ee', 'E'], ['ea:E', 'ea', 'E']]);
at(17, [['oa', 'oa', 'O'], ['oe', 'oe', 'O'], ['igh', 'igh', 'I'], ['ie:I', 'ie', 'I']]);
at(18, [['oo:oo', 'oo', 'oo'], ['oo:u0', 'oo', 'uu'], ['ew', 'ew', 'oo'], ['ue', 'ue', 'oo'],
  ['ew:U', 'ew', 'U', NOCARD], ['ue:U', 'ue', 'U', NOCARD]]);
at(19, [['au', 'au', 'aw'], ['aw', 'aw', 'aw'], ['oi', 'oi', 'oy'], ['oy', 'oy', 'oy']]);
at(20, [['ou', 'ou', 'ow'], ['ow:ow', 'ow', 'ow'], ['ow:O', 'ow', 'O']]);
at(21, [['ea:e', 'ea', 'e'], ['ph', 'ph', 'f']]);
at(22, [['ar', 'ar', 'ar'], ['or', 'or', 'or']]);
at(23, [['er', 'er', 'er'], ['ir', 'ir', 'er'], ['ur', 'ur', 'er']]);
at(25, [['le', 'le', '@ l']]);

export const GRAPHEMES = Object.freeze(RAW.map(e => Object.freeze({ ...e })));

const BY_ID = new Map(GRAPHEMES.map(e => [e.id, e]));

export function graphemeOf(id) {
  return BY_ID.get(id) ?? null;
}

const SEG_ALIASES = Object.freeze({ 'n|ng': 'nk', 'a|aw': 'all' });

export function graphemeStage(g, p, ctx) {
  const codes = phonemeCodes(p).join(' ');
  const gl = String(g).toLowerCase();
  if (gl === 'e' && codes === '') return BY_ID.get('a-e').stage;
  if (ctx === 'vce' && gl.length === 1) {
    const hit = GRAPHEMES.find(e => e.g === `${gl}-e` && e.p === codes);
    return hit ? hit.stage : null;
  }
  const alias = SEG_ALIASES[`${gl}|${codes}`];
  if (alias) return BY_ID.get(alias).stage;
  let best = null;
  for (const e of GRAPHEMES) if (e.g === gl && e.p === codes && (best === null || e.stage < best)) best = e.stage;
  return best;
}

export function drillDeck(index) {
  return GRAPHEMES.filter(e => e.stage <= index && e.card !== false);
}

const CLIP_CODES = new Set(['@', 'A', 'E', 'I', 'O', 'U', 'a', 'ar', 'aw', 'b', 'ch', 'd', 'dh', 'e', 'er',
  'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'ng', 'o', 'oo', 'or', 'ow', 'oy', 'p', 'r', 's', 'sh', 't', 'th', 'u',
  'uu', 'v', 'w', 'y', 'z']);

export const SOUND_CLIP_CODES = Object.freeze([...CLIP_CODES]);

const SEQUENCES = Object.freeze({
  'x': ['p.k', 'p.s'],
  'qu': ['p.k', 'p.w'],
  'nk': ['p.ng', 'p.k'],
  'all': ['p.aw', 'p.l'],
  'es:@z': ['p.@', 'p.z'],
  'ed:@d': ['p.@', 'p.d'],
  'ed:id': ['p.i', 'p.d'],
  'ing': ['ck.ing'],
  'le': ['ck.le'],
});

export function soundClip(id) {
  const e = BY_ID.get(id);
  if (!e) return null;
  const codes = phonemeCodes(e.p);
  return codes.length === 1 && CLIP_CODES.has(codes[0]) ? soundId(codes[0]) : null;
}

export function soundClips(id) {
  if (Object.hasOwn(SEQUENCES, id)) return [...SEQUENCES[ (id)]];
  const one = soundClip(id);
  return one === null ? [] : [one];
}

export const MISSING_SOUNDS = Object.freeze(GRAPHEMES.filter(e => soundClips(e.id).length === 0).map(e => e.id));

export function spellingsOf(phoneme, index) {
  const want = phonemeCodes(phoneme).join(' ');
  return drillDeck(index).filter(e => e.p === want).map(e => e.id);
}


const pr = (id, phoneme, rule, stage) => Object.freeze({ id, phoneme, rule, stage });

export const POSITION_RULES = Object.freeze([
  pr('ay-ai', 'A', 'ay at the end of a word or syllable, ai inside', 15),
  pr('oy-oi', 'oy', 'oy at the end, oi inside', 19),
  pr('aw-au', 'aw', 'aw at the end or before final n or l, au inside', 19),
  pr('ow-ou', 'ow', 'ow at the end or before final n or l, ou inside', 20),
  pr('k', 'k', 'ck right after a short vowel at the end of a one-syllable word, k after a consonant or long vowel, c before a, o or u', 0),
  pr('ch', 'ch', 'tch right after a short vowel, ch elsewhere', 0),
  pr('j', 'j', 'dge right after a short vowel, ge elsewhere', 12),
  pr('floss-f', 'f', 'ff after a short vowel at the end of a one-syllable word', 0),
  pr('floss-l', 'l', 'll after a short vowel at the end of a one-syllable word', 0),
  pr('floss-s', 's', 'ss after a short vowel at the end of a one-syllable word', 0),
  pr('floss-z', 'z', 'zz after a short vowel at the end of a one-syllable word', 0),
]);

const RULE = new Map(POSITION_RULES.map(r => [r.id, r]));

const SHORT = new Set(['a', 'e', 'i', 'o', 'u']);
const ENDING_G = new Set(['s', 'es', 'ed', 'ing']);
const FLOSS_RULE = { ff: 'floss-f', ll: 'floss-l', ss: 'floss-s', zz: 'floss-z' };

const isShort = (seg, next) => !!seg && (SHORT.has(seg[1]) || (seg[0] === 'a' && seg[1] === 'aw' && next?.[0] === 'll'));

function endsSyllable(segs, parts, i) {
  if (i >= segs.length - 1) return true;
  if (Array.isArray(parts) && parts.length > 1 && parts.join('') === segs.map(s => s[0]).join('')) {
    let off = 0;
    for (let k = 0; k <= i; k++) off += segs[k][0].length;
    let edge = 0;
    for (const part of parts.slice(0, -1)) { edge += part.length; if (edge === off) return true; }
    return false;
  }
  return ENDING_G.has(segs[i + 1][0]);
}

const beforeFinalNL = (segs, i) => i + 2 === segs.length && ['n', 'l', 'll'].includes(segs[i + 1][0]);

const atWordEnd = (segs, i) => i === segs.length - 1 || (i + 2 === segs.length && ENDING_G.has(segs[i + 1][0]));

export function positionDecides(word, segIndex, index) {
  const segs = Array.isArray(word) ? word : (word?.segs ?? []);
  const parts = Array.isArray(word) ? null : word?.parts;
  const seg = segs[segIndex];
  if (!seg) return null;
  const g = seg[0];
  const p = phonemeCodes(seg[1]).join(' ');
  const prev = segs[segIndex - 1];
  const next = segs[segIndex + 1];
  const end = endsSyllable(segs, parts, segIndex);
  let id = null;
  if (g === 'ay' && p === 'A') id = end ? 'ay-ai' : null;
  else if (g === 'ai' && p === 'A') id = end ? null : 'ay-ai';
  else if (g === 'oy' && p === 'oy') id = end ? 'oy-oi' : null;
  else if (g === 'oi' && p === 'oy') id = end ? null : 'oy-oi';
  else if (g === 'aw' && p === 'aw') id = end || beforeFinalNL(segs, segIndex) ? 'aw-au' : null;
  else if (g === 'au' && p === 'aw') id = end ? null : 'aw-au';
  else if (g === 'ow' && p === 'ow') id = end || beforeFinalNL(segs, segIndex) ? 'ow-ou' : null;
  else if (g === 'ou' && p === 'ow') id = end ? null : 'ow-ou';
  else if (g === 'ck' && p === 'k') id = isShort(prev) && atWordEnd(segs, segIndex) ? 'k' : null;
  else if (g === 'k' && p === 'k') id = prev && !isShort(prev) ? 'k' : null;
  else if (g === 'c' && p === 'k') id = next && 'aou'.includes(next[0][0]) ? 'k' : null;
  else if (g === 'tch' && p === 'ch') id = isShort(prev) ? 'ch' : null;
  else if (g === 'ch' && p === 'ch') id = isShort(prev) ? null : 'ch';
  else if (g === 'dge' && p === 'j') id = isShort(prev) ? 'j' : null;
  else if (g === 'g' && p === 'j') id = next && next[0] === 'e' && next[1] === '' && !isShort(prev) ? 'j' : null;
  else if (FLOSS_RULE[g] && p === g[0]) id = isShort(prev, seg) && atWordEnd(segs, segIndex) ? FLOSS_RULE[g] : null;
  const rule = id ? RULE.get(id) : null;
  return rule && rule.stage <= index ? rule : null;
}
