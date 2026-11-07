import { phonemeCodes } from './phonemes.js';


const NASAL_SOUNDS = new Set(['m', 'n', 'ng']);

export function beforeNasal(segs, i) {
  const next = segs[i + 1];
  return next !== undefined && NASAL_SOUNDS.has(phonemeCodes(next[1])[0]);
}

export function hasShortIE(segs) {
  return segs.some(([, p], i) => phonemeCodes(p).some(code => code === 'i' || code === 'e') && !beforeNasal(segs, i));
}

export function hasNasalIE(segs) {
  return segs.some(([, p], i) => phonemeCodes(p).some(code => code === 'i' || code === 'e') && beforeNasal(segs, i));
}
