import { PHONEMES, phonemeCodes } from '../curriculum/phonemes.js';
import {
  madeUpId, meaningId, passageSentenceId, redId, redSentenceId, sentenceId, soundId, syllableId, wordId,
} from '../core/voice-ids.js';



export const KINDS = Object.freeze(['line', 'word', 'made-up', 'meaning', 'syllable', 'sentence', 'passage', 'red', 'sound']);

const STRESS = 'ˈ';

const filled = (s) => typeof s === 'string' && s.trim() !== '';

const landOfStage = (stage) => (typeof stage === 'string' && stage.includes('.') ? stage.slice(0, stage.indexOf('.')) : String(stage ?? ''));

export function ipaOf(segs) {
  if (!Array.isArray(segs)) return null;
  const codes = [];
  for (const seg of segs) {
    if (!Array.isArray(seg)) return null;
    for (const code of phonemeCodes(seg[1])) {
      if (!Object.hasOwn(PHONEMES, code)) return null;
      codes.push(code);
    }
  }
  if (codes.length === 0) return null;
  const vowels = codes.flatMap((c, i) => (PHONEMES[c].kind === 'vowel' ? [i] : []));
  const stressed = vowels.find((i) => codes[i] !== '@') ?? vowels[0];
  return codes.map((code, i) => {
    const ipa = PHONEMES[code].ipa;
    if (i !== stressed) return ipa;
    return ipa.startsWith('j') && ipa.length > 1 ? `j${STRESS}${ipa.slice(1)}` : STRESS + ipa;
  }).join('');
}

export function segsByPart(parts, segs) {
  if (!Array.isArray(parts) || !Array.isArray(segs)) return null;
  const spelled = segs.map((s) => s?.[0]).join('');
  if (spelled !== parts.join('')) return null;
  let at = 0;
  let segIndex = 0;
  let segStart = 0;
  return parts.map((part) => {
    const end = at + part.length;
    const mine = [];
    while (segIndex < segs.length) {
      const segEnd = segStart + segs[segIndex][0].length;
      if (segStart >= end) break;
      mine.push(segs[segIndex]);
      if (segEnd > end) break;
      segStart = segEnd;
      segIndex++;
    }
    at = end;
    return mine;
  });
}

export function sentencesOf(text) {
  if (!filled(text)) return [];
  return text.trim().split(/(?<=[.!?]["'”’)]?)\s+/).map((s) => s.trim()).filter(Boolean);
}

function soundCodes(graphemes) {
  const list = Array.isArray(graphemes) ? graphemes : (graphemes)?.GRAPHEMES;
  if (!Array.isArray(list)) return Object.keys(PHONEMES).filter((code) => code !== '');
  const codes = new Set();
  for (const g of list) for (const code of phonemeCodes(g?.p)) if (Object.hasOwn(PHONEMES, code)) codes.add(code);
  return [...codes];
}

const areaOf = (id) => /^v\.([a-z0-9-]+)\./.exec(id)?.[1] ?? '';

export function buildScript(content, { graphemes } = {}) {
  const c = (content ?? {});
  const entries = new Map();
  const add = (entry) => { if (filled(entry.id) && filled(entry.text) && !entries.has(entry.id)) entries.set(entry.id, entry); };

  for (const [id, line] of Object.entries(c.voice ?? {})) {
    const area = areaOf(id);
    add({ id, kind: 'line', text: line?.text, ...(filled(line?.note) ? { note: line.note } : {}), source: area ? `content/voice/${area}.json` : 'content/voice' });
  }

  for (const rec of c.words ?? []) {
    if (!filled(rec?.w)) continue;
    const source = `content/words/${landOfStage(rec.stage)}.json`;
    if (rec.real === false) {
      const ipa = ipaOf(rec.segs);
      add({ id: madeUpId(rec.w), kind: 'made-up', text: rec.w, ...(ipa ? { ipa } : {}), source });
    } else {
      add({ id: wordId(rec.w), kind: 'word', text: rec.w, source });
    }
    if (filled(rec.mean)) add({ id: meaningId(rec.w), kind: 'meaning', text: rec.mean, source });
    const byPart = segsByPart(rec.parts, rec.segs);
    (rec.parts ?? []).forEach(( part, i) => {
      const type = rec.types?.[i];
      if (!filled(part) || !filled(type)) return;
      const ipa = byPart ? ipaOf(byPart[i]) : null;
      add({ id: syllableId(part, type), kind: 'syllable', text: part, ...(ipa ? { ipa } : {}), source });
    });
  }

  for (const rec of c.syllables ?? []) {
    if (!filled(rec?.s) || !filled(rec?.type)) continue;
    const ipa = ipaOf(rec.segs);
    add({ id: syllableId(rec.s, rec.type), kind: 'syllable', text: rec.s, ...(ipa ? { ipa } : {}), source: 'content/syllables.json' });
  }

  for (const stage of c.dictation ?? []) {
    for (const s of stage?.sentences ?? []) {
      if (filled(s?.id)) add({ id: sentenceId(s.id), kind: 'sentence', text: s.text, source: `content/dictation/${landOfStage(stage.stage)}.json` });
    }
  }

  for (const p of c.passages ?? []) {
    if (!filled(p?.id)) continue;
    sentencesOf(p.text).forEach((text, i) => {
      add({ id: passageSentenceId(p.id, i + 1), kind: 'passage', text, source: `content/passages/${p.land || landOfStage(p.stage)}.json` });
    });
  }

  for (const rec of c.red ?? []) {
    if (filled(rec?.w)) add({ id: redId(rec.w), kind: 'red', text: rec.w, source: `content/red-words/${landOfStage(rec.stage)}.json` });
  }
  for (const rec of c.redSentences ?? []) {
    if (filled(rec?.w)) add({ id: redSentenceId(rec.w), kind: 'sentence', text: rec.text, source: 'content/red-sentences.json' });
  }

  for (const code of soundCodes(graphemes)) {
    add({ id: soundId(code), kind: 'sound', text: PHONEMES[code].label, ipa: PHONEMES[code].ipa, source: 'src/curriculum/phonemes.js' });
  }

  const script = (
    [...entries.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  );
  const stats = scriptStats(script);
  Object.defineProperty(script, 'counts', { value: stats.counts, enumerable: false });
  Object.defineProperty(script, 'characters', { value: stats.characters, enumerable: false });
  return script;
}

export function voiceIdsFor(content, options) {
  return buildScript(content, options).map((entry) => entry.id);
}

export function scriptStats(script) {
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  const chars = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const entry of script) {
    counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
    chars[entry.kind] = (chars[entry.kind] ?? 0) + entry.text.length;
  }
  return {
    counts, chars,
    count: script.length,
    characters: Object.values(chars).reduce((n, v) => n + v, 0),
  };
}
