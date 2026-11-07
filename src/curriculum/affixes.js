import { phonemeCodes, soundKind } from './phonemes.js';



const affix = (id, lesson, spellings) => Object.freeze({
  id, kind: id.endsWith('-') ? 'prefix' : 'suffix', lesson, spellings: Object.freeze([...spellings]),
});

export const AFFIXES = Object.freeze([
  affix('-s', 21, ['s']),
  affix('-es', 63, ['es']),
  affix('-ed', 64, ['ed']),
  affix('-ing', 65, ['ing']),
  affix('-er', 100, ['er']),
  affix('-est', 100, ['est']),
  affix('-ly', 101, ['ly']),
  affix('-less', 102, ['less']),
  affix('-ful', 102, ['ful']),
  affix('un-', 103, ['un']),
  affix('pre-', 104, ['pre']),
  affix('re-', 104, ['re']),
  affix('dis-', 105, ['dis']),
  affix('-tion', 119, ['tion']),
  affix('-sion', 119, ['sion']),
  affix('-ture', 120, ['ture']),
  affix('-er.agent', 121, ['er']),
  affix('-or', 121, ['or']),
  affix('-ist', 121, ['ist']),
  affix('-ish', 122, ['ish']),
  affix('-y', 123, ['y']),
  affix('-ness', 124, ['ness']),
  affix('-ment', 125, ['ment']),
  affix('-able', 126, ['able']),
  affix('-ible', 126, ['ible']),
  affix('uni-', 127, ['uni']),
  affix('bi-', 127, ['bi']),
  affix('tri-', 127, ['tri']),
]);

const BY_ID = new Map(AFFIXES.map((a) => [a.id, a]));

export const affixOf = (id) => BY_ID.get(id) ?? null;

export const RULES = Object.freeze( ({ double: 107, 'drop-e': 109, 'y-to-i': 110 }));


const DOUBLE_COMPARE = 108;

export function ruleLesson(rule, suffix) {
  if (!Object.hasOwn(RULES, rule)) return Infinity;
  return rule === 'double' && (suffix === '-er' || suffix === '-est') ? DOUBLE_COMPARE : RULES[rule];
}





export function morphParts(segs, morph) {
  if (!Array.isArray(morph) || morph.length < 2) return null;
  const affixes = [];
  let at = 0;
  let base = -1;
  for (const part of morph) {
    if (!Array.isArray(part) || part.length !== 2) return null;
    const [id, n] = part;
    if (typeof id !== 'string' || !Number.isInteger(n) || n < 1) return null;
    if (id === '') {
      if (base >= 0) return null;
      base = at;
    } else {
      const a = affixOf(id);
      if (!a || (a.kind === 'prefix') !== (base < 0)) return null;
      const spelled = segs.slice(at, at + n).map(([g]) => String(g).toLowerCase()).join('');
      if (!a.spellings.includes(spelled)) return null;
      affixes.push({ id, from: at, to: at + n, affix: a });
    }
    at += n;
  }
  if (at !== segs.length || base < 0) return null;
  const n = (morph.find(([id]) => id === ''))[1];
  return { affixes, from: base, to: base + n };
}

const UE_DROPS = new Set(['ment', 'ly']);

const VOWEL_LETTERS = new Set(['a', 'e', 'i', 'o', 'u']);

export function baseSegs(segs, parts, base) {
  const own = segs.slice(parts.from, parts.to).map((s) => ([s[0], s[1]]));
  if (!base) return own;
  const last = own.at(-1);
  if (!last) return null;
  const g = String(last[0]);
  if (base.rule === 'double') {
    const lower = g.toLowerCase();
    if (lower.length !== 2 || lower[0] !== lower[1] || VOWEL_LETTERS.has(lower[0])) return null;
    own[own.length - 1] = [g[0], last[1]];
    return own;
  }
  if (base.rule === 'drop-e') {
    if (g.toLowerCase() === 'u' && phonemeCodes(last[1]).some((c) => soundKind(c) === 'vowel')) {
      own[own.length - 1] = [`${g}e`, phonemeCodes(last[1]).includes('y') || phonemeCodes(last[1]).includes('U') ? 'U' : 'oo'];
      return own;
    }
    return [...own, ['e', '']];
  }
  if (base.rule === 'y-to-i') {
    if (g.toLowerCase() !== 'i') return null;
    own[own.length - 1] = ['y', last[1]];
    return own;
  }
  return null;
}

export function ruleFits(base, rule, suffix) {
  const s = suffix.toLowerCase();
  const startsVowel = VOWEL_LETTERS.has(s[0]) || s === 'y';
  const letters = base.map(([g]) => String(g).toLowerCase()).join('');
  if (rule === 'double') {
    const v = String(base.at(-2)?.[0] ?? '').toLowerCase();
    const c = String(base.at(-1)?.[0] ?? '').toLowerCase();
    return startsVowel && v.length === 1 && VOWEL_LETTERS.has(v) && c.length === 1 && !VOWEL_LETTERS.has(c) && !'wxy'.includes(c);
  }
  if (rule === 'drop-e') {
    if (String(base.at(-1)?.[0] ?? '').toLowerCase() === 'ue') return startsVowel || UE_DROPS.has(s);
    return letters.endsWith('e') && String(base.at(-1)?.[1] ?? 'x') === '' && startsVowel;
  }
  if (rule === 'y-to-i') return letters.endsWith('y') && !VOWEL_LETTERS.has(letters.at(-2) ?? 'a') && !s.startsWith('i');
  return false;
}

const SUFFIX_SPELLINGS = new Set(AFFIXES.filter((a) => a.kind === 'suffix').flatMap((a) => a.spellings));

export function ruleStep(from, to) {
  const n = from.length;
  if (n === 0) return null;
  const letters = ( seg) => String(seg?.[0] ?? '').toLowerCase();
  const same = ( k) => from.slice(0, k).every((seg, i) => letters(seg) === letters(to[i]));
  const ending = ( at) => (to.length === at + 1 && SUFFIX_SPELLINGS.has(letters(to[at])) ? letters(to[at]) : null);
  const last = letters(from[n - 1]);
  const shapes = [
    ['double', n, to.length === n + 1 && same(n - 1) && letters(to[n - 1]) === last + last],
    ['drop-e', n - 1, to.length === n && last === 'e' && String(from[n - 1][1]).trim() === '' && same(n - 1)],
    ['y-to-i', n, to.length === n + 1 && last === 'y' && same(n - 1) && letters(to[n - 1]) === 'i'],
  ];
  for (const [rule, at, fits] of shapes) {
    const suffix = fits ? ending(at) : null;
    if (suffix && ruleFits(from, rule, suffix)) return { rule, suffix, at };
  }
  return null;
}

export const chunkClip = (id) => `ck.${id.replace(/\.agent$/, '').replace(/-/g, '')}`;

export function withoutAffix(rec, id) {
  const parts = morphParts(rec.segs, rec.morph);
  if (!parts) return null;
  const first = parts.affixes[0];
  const lastAffix = parts.affixes.at(-1);
  const letters = ( segs) => segs.map(([g]) => g).join('');
  if (first && first.id === id && first.from === 0) return letters(rec.segs.slice(first.to));
  if (!lastAffix || lastAffix.id !== id || lastAffix.to !== rec.segs.length) return null;
  const rest = rec.segs.slice(0, lastAffix.from);
  if (lastAffix.from !== parts.to || !rec.base) return letters(rest);
  const undone = baseSegs(rec.segs, parts, rec.base);
  return undone ? letters([...rec.segs.slice(0, parts.from), ...undone]) : null;
}
