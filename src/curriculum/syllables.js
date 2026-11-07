import { phonemeCodes, soundKind } from './phonemes.js';


const ENDINGS = new Set(['es', 'ed', 'ing']);
const LONG = new Set(['A', 'E', 'I', 'O', 'U', 'oo']);

const isVowel = (seg) => seg !== undefined && soundKind(seg[1]) === 'vowel';

const vowelBoxes = (segs) => segs.flatMap((seg, i) => (isVowel(seg) ? [i] : []));

export const SYLLABLE_TYPE_LESSON = Object.freeze({ closed: 0, vce: 54, open: 66, le: 75, r: 77, team: 84 });


const R_CONTROLLED = new Set(['ar', 'or', 'er', 'air', 'ear']);

const isSilentE = (seg) => seg !== undefined && String(seg[0]).toLowerCase() === 'e' && soundKind(seg[1]) === 'silent';

export const isDoubled = (seg) => seg !== undefined && seg[0].length === 2 && seg[0][0].toLowerCase() === seg[0][1].toLowerCase()
  && soundKind(seg[1]) === 'consonant' && !'aeiou'.includes(seg[0][0].toLowerCase());

export function syllableTypes(segs) {
  return vowelBoxes(segs).map((i) => {
    const g = String(segs[i][0]).toLowerCase();
    const codes = phonemeCodes(segs[i][1]);
    if (g === 'le') return 'le';
    if (codes.some(c => R_CONTROLLED.has(c))) return 'r';
    if (g.length >= 2) return ENDINGS.has(g) ? 'closed' : 'team';
    const next = segs[i + 1];
    if (soundKind(next?.[1]) === 'consonant' && isSilentE(segs[i + 2])) return 'vce';
    if (next === undefined || isVowel(next)) return 'open';
    const after = segs[i + 2];
    const ending = i + 2 === segs.length - 1 && ENDINGS.has(String(after?.[0]).toLowerCase());
    if (soundKind(next[1]) === 'consonant' && isVowel(after) && !ending && codes.some(c => LONG.has(c))) return 'open';
    return 'closed';
  });
}

export const syllableCount = (segs) => vowelBoxes(segs).length;

export function syllableSplit(segs, isWord = () => false) {
  const vowels = vowelBoxes(segs);
  if (vowels.length !== 2) return null;
  const [a, b] = vowels;
  if (b === segs.length - 1 && ENDINGS.has(String(segs[b][0]).toLowerCase())) return b;
  if (b === segs.length - 1 && String(segs[b][0]).toLowerCase() === 'le' && b - 1 > a) return b - 1;
  const between = b - a - 1;
  if (between === 0) return b;
  if (between === 1) return phonemeCodes(segs[a][1]).some(c => LONG.has(c)) || isDoubled(segs[a + 1]) ? a + 1 : b;
  const letters = (from, to) => segs.slice(from, to).map(([g]) => g).join('').toLowerCase();
  for (let at = a + 2; at < b; at++) if (isWord(letters(0, at)) && isWord(letters(at, segs.length))) return at;
  return b - 1;
}

export function splitWord(segs, isWord) {
  const at = syllableSplit(segs, isWord);
  if (at === null) return null;
  const letters = ( part) => part.map(([g]) => g).join('');
  const [first, second] = [letters(segs.slice(0, at)), letters(segs.slice(at))];
  return isDoubled(segs[at]) ? [first + second[0], second.slice(1)] : [first, second];
}
