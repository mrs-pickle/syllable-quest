import { GRAPHEMES, SOUND_CLIP_CODES, graphemeOf, soundClips } from './graphemes.js';
import { phonemeCodes } from './phonemes.js';
import { soundId } from '../core/voice-ids.js';

export const PICK_GAP_MS = 80;

const CLIPS = new Set(SOUND_CLIP_CODES);

function codeClips(codes) {
  return codes.length > 0 && codes.every((c) => CLIPS.has(c)) ? codes.map((c) => soundId(c)) : [];
}

export function pickSoundClips(grapheme, context) {
  const raw = String(grapheme ?? '');
  const g = raw.includes(':') ? raw : raw.toLowerCase();
  if (g === '') return [];
  const p = Array.isArray(context?.seg) ? context.seg[1] : context?.p;
  if (typeof p === 'string') {
    const codes = phonemeCodes(p);
    if (codes.length === 0) return [];
    const want = codes.join(' ');
    const entry = GRAPHEMES.find((e) => e.g === g && e.p === want);
    const own = entry ? soundClips(entry.id) : [];
    return own.length > 0 ? own : codeClips(codes);
  }
  const entry = graphemeOf(g) ?? GRAPHEMES.find((e) => e.g === g) ?? null;
  return entry ? soundClips(entry.id) : [];
}

export function letterNameIds(grapheme) {
  return [...String(grapheme ?? '').split(':')[0].toLowerCase()].filter((ch) => ch >= 'a' && ch <= 'z').map((ch) => `v.letter.${ch}`);
}
