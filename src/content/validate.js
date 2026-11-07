import { PHONEMES, phonemeCodes, soundKind } from '../curriculum/phonemes.js';
import { STAGES, stageIndex, stagesOfLand, syllableStage } from '../curriculum/stages.js';
import { graphemeOf, positionDecides, spellingsOf } from '../curriculum/graphemes.js';
import { flexOf, flipSplit, gaps, parts as divideParts, patternOf, patternsOf, syllableTypesOf, vowelBoxes } from '../curriculum/divide.js';
import { textBlockers, tokenize, untaughtSegs, wordStage } from '../curriculum/decodable.js';
import { MAX_SIGHT_PER_STAGE, NOT_DRILLED, SIGHT_POOL } from '../curriculum/sight-pool.js';
import { artFile } from '../core/art-file.js';
import { isBlocked } from './blocklist.js';
import { storyId } from '../core/voice-ids.js';
import { LAND_IDS } from './load.js';



export const GROUPS = Object.freeze(['words', 'syllables', 'red', 'dictation', 'passages', 'story', 'discovery', 'coach', 'voice']);

const rot13 = ( s) => s.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });

const THEME_WORDS = rot13('fcryy fcryyf fcryyobbx fcryyobbxf jvmneq jvmneqf jnaq jnaqf cbgvba cbgvbaf jvgpu jvgpurf snvel snvevrf rapunag rapunagf rapunagrq rapunagvat rapunagzrag rapunagzragf fbeprel fbeprere fbepreref fbeprerff zntvp zntvpny zntvpnyyl zntvpvna zntvpvnaf punez punezf punezrq vapnagngvba vapnagngvbaf').split(' ');
const DIAGNOSIS_WORDS = rot13('qlfyrkvn qlfyrkvp qlfyrkvpf qlftencuvn qlfpnyphyvn nquq nhgvfz nhgvfgvp').split(' ');

export const EXCLUDED_WORDS = Object.freeze([...THEME_WORDS]);

export const VOWEL_COUNT_EXEMPT = Object.freeze({
  fire: 'one syllable written, two vowel sounds in the dictionary (fy-er)',
  fires: 'one syllable written, two vowel sounds in the dictionary (fy-erz)',
  fired: 'one syllable written, two vowel sounds in the dictionary (fy-erd)',
  tire: 'one syllable written, two vowel sounds in the dictionary (ty-er)',
  tired: 'one syllable written, two vowel sounds in the dictionary (ty-erd)',
  hire: 'one syllable written, two vowel sounds in the dictionary (hy-er)',
  wire: 'one syllable written, two vowel sounds in the dictionary (wy-er)',
  hour: 'one syllable written, two vowel sounds in the dictionary (ow-er)',
  hours: 'one syllable written, two vowel sounds in the dictionary (ow-erz)',
  our: 'one syllable written, two vowel sounds in the dictionary (ow-er)',
  ours: 'one syllable written, two vowel sounds in the dictionary (ow-erz)',
  flower: 'written as one team plus er, said with an extra glide in the dictionary (flow-er)',
  flowers: 'written as one team plus er, said with an extra glide in the dictionary (flow-erz)',
  power: 'written as one team plus er, said with an extra glide in the dictionary (pow-er)',
  tower: 'written as one team plus er, said with an extra glide in the dictionary (tow-er)',
  shower: 'written as one team plus er, said with an extra glide in the dictionary (show-er)',
  quiet: 'the ie is two sounds in the dictionary (kwy-et)',
  diet: 'the ie is two sounds in the dictionary (dy-et)',
  riot: 'the io is two sounds in the dictionary (ry-ot)',
});

export const CMU_MISSING_OK = Object.freeze({});

const NAMES_ALLOWED = new Set([
  'Keeper:0', 'Apprentice:0', 'Great Word Book:0', 'Closed Canyon:0', 'Open Sky Isles:7', 'Silent-E Forest:11',
  'Vowel Team Harbor:15', 'Bossy-R Mountains:22', 'Little Tail Lake:25', 'City of Builders:27',
]);

const TYPES = Object.freeze(['closed', 'open', 'vce', 'team', 'r', 'le']);
const PATTERNS = Object.freeze(['one', 'ending', 'compound', 'VC/CV', 'VCCCV', 'V/CV', 'VC/V', 'VV', 'C+le', 'CC+le', 'mixed']);
const COACH_STEPS = Object.freeze(['soundcheck', 'discovery', 'bridge', 'clansort', 'trickster', 'wordbook', 'storypage', 'break', 'placement']);
const GENERATED_PREFIXES = Object.freeze(['w.', 'n.', 'm.', 'sy.', 's.', 'ps.', 'r.', 'rs.', 'p.']);

const LAST_STAGE = STAGES.length - 2;
const STORY_LINE_WORDS = 25;
const MEAN_WORDS = 12;

const lower = ( s) => String(s ?? '').toLowerCase();
const words = ( s) => tokenize(s).length;
const isObj = ( v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = ( v) => typeof v === 'string' && v.trim() !== '';
const isSegs = ( segs) => Array.isArray(segs) && segs.length > 0 &&
  segs.every((s) => Array.isArray(s) && s.length === 2 && typeof s[0] === 'string' && typeof s[1] === 'string');
const same = ( a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const landOfStageId = (id) => { const n = stageIndex(String(id)); return n < 0 ? null : STAGES[n].land; };

const storyPrefix = (land, part) => storyId(land, part, 1).slice(0, -1);


class Report {
  constructor(strict) {
    this.errors = [];
    this.warnings = [];
    this.strict = strict;
  }

  error(check, message) { this.errors.push(`[check ${check}] ${message}`); }

  warn(check, message) { this.warnings.push(`[check ${check}] ${message}`); }

  min(message) { (this.strict ? this.errors : this.warnings).push(`[check 6] ${message}`); }
}


const norm = (sym) => { const s = sym.replace(/\d/g, '').toUpperCase(); return s === 'AO' ? 'AA' : s; };

const WEAK_STANDS_FOR = new Set(['AH', 'IH', 'EH', 'AE', 'AA', 'UH']);
const R_VOWELS = new Set(['AH', 'IH', 'EH', 'AE', 'AA', 'UH', 'ER']);

function renderings(segs) {
  let out = [[]];
  for (const code of segs.flatMap(([, p]) => phonemeCodes(p))) {
    if (!Object.hasOwn(PHONEMES, code)) return [];
    out = out.flatMap((prefix) => PHONEMES[code].arpabet.map((a) => [...prefix, ...a.split(' ').filter(Boolean).map(norm)]));
  }
  const seen = new Set();
  return out.filter((r) => { const k = r.join(' '); if (seen.has(k)) return false; seen.add(k); return true; });
}

function pronMatches(written, dict, loose) {
  const go = (i, j) => {
    if (j === dict.length) return i === written.length;
    const base = norm(dict[j]);
    const weak = /0$/.test(dict[j]) && (base === 'AH' || base === 'IH' || base === 'ER');
    if (i < written.length) {
      if (written[i] === base && go(i + 1, j + 1)) return true;
      if (weak && base !== 'ER' && WEAK_STANDS_FOR.has(written[i]) && go(i + 1, j + 1)) return true;
      if (weak && base === 'ER') {
        if (WEAK_STANDS_FOR.has(written[i]) && go(i + 1, j + 1)) return true;
        if (written[i + 1] === 'R' && R_VOWELS.has(written[i]) && go(i + 2, j + 1)) return true;
      }
    }
    return loose && weak && go(i, j + 1);
  };
  return go(0, 0);
}

const dictVowels = (pron) => pron.filter((s) => /\d$/.test(s)).length;


const wordRegex = ( list) => new RegExp(`(?<![A-Za-z])(?:${list.join('|')})(?![A-Za-z])`, 'i');
const BANNED = wordRegex([...THEME_WORDS, ...DIAGNOSIS_WORDS]);

function* stringsIn(v, path) {
  if (typeof v === 'string') yield [path, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* stringsIn(v[i], `${path}[${i}]`);
  else if (isObj(v)) for (const [k, x] of Object.entries( (v))) yield* stringsIn(x, `${path}.${k}`);
}


export function validateContent(content, options = {}) {
  const r = new Report(options.strict === true);
  const only = Array.isArray(options.only) && options.only.length > 0 ? new Set(options.only) : null;
  const on = ( group) => only === null || only.has(group);
  const cmu = options.cmu ?? null;

  for (const path of content.missing ?? []) r.warnings.push(`${path}: not found`);
  for (const bad of content.badShape ?? []) r.error(1, `${bad}`);
  if (!cmu) r.warnings.push('CMUdict not given; pronunciation (check 3) and the made-up word test were skipped');

  const wordList = Array.isArray(content.words) ? content.words : [];
  const redList = Array.isArray(content.red) ? content.red : [];

  const real = new Map();
  for (const rec of wordList) if (isObj(rec) && isStr(rec.w) && rec.real !== false && !real.has(lower(rec.w))) real.set(lower(rec.w), rec);
  const sight = new Map();
  for (const rec of redList) if (isObj(rec) && isStr(rec.w) && !sight.has(lower(rec.w))) sight.set(lower(rec.w), rec);
  const all = new Map();
  for (const rec of wordList) if (isObj(rec) && isStr(rec.w) && !all.has(lower(rec.w))) all.set(lower(rec.w), rec);
  const isWord = ( w) => real.has(w) || sight.has(w);
  const lookup = ( w) => real.get(w);
  const stageCache = new Map();
  const stageOfRec = ( rec) => {
    let s = stageCache.get(rec);
    if (s === undefined) { s = wordStage(rec); stageCache.set(rec, s); }
    return s;
  };
  const names = Array.isArray(content.names) ? content.names : [];
  const blocklist = content.blocklist;
  const voice = isObj(content.voice) ? content.voice : {};

  const blockers = (text, at) => textBlockers(text, { lookup, red: redList, names, stageIndex: at });

  checkNames(names, r);
  checkBlocklistShape(blocklist, r);

  if (on('words')) checkWords(wordList, { r, cmu, real, isWord, stageOfRec, blocklist }, Array.isArray(content.syllables) ? content.syllables : []);
  if (on('syllables')) checkSyllables(content, r, blocklist);
  if (on('red')) checkRed(content, r, { blockers, stageOfRec });
  if (on('dictation')) checkDictation(content, r, { real, all, stageOfRec, blockers });
  if (on('passages')) checkPassages(content, r, { real, sight, stageOfRec, blockers });
  const idExists = ( id) => Object.hasOwn(voice, id) || GENERATED_PREFIXES.some((p) => id.startsWith(p));
  if (on('story')) { checkStory(content, r, voice, idExists); checkLands(content, r, idExists, options); }
  if (on('discovery')) checkDiscovery(content, r, idExists, lookup, options);
  if (on('coach')) checkCoach(content, r, idExists);
  if (on('voice')) checkVoice(voice, r);

  const sections = {
    words: wordList, syllables: content.syllables, red: [redList, content.redSentences], dictation: content.dictation,
    passages: content.passages, story: [content.story, content.lands], discovery: content.discovery, coach: content.coach,
    voice: content.voice,
  };
  for (const [group, value] of Object.entries(sections)) {
    if (!on(group)) continue;
    for (const [path, text] of stringsIn(value, group)) {
      if (BANNED.test(text)) r.error(7, `${path}: contains a banned theme or diagnosis word`);
    }
  }
  if (on('words')) {
    for (const rec of wordList) {
      if (isObj(rec) && isStr(rec.w) && EXCLUDED_WORDS.includes(lower(rec.w))) r.error(7, `word "${rec.w}": an excluded word is never a lexicon entry`);
    }
  }
  return { errors: r.errors, warnings: r.warnings };
}


function checkNames(names, r) {
  const seen = new Set();
  names.forEach((n, i) => {
    const key = `${n?.name}:${n?.stage}`;
    if (!isObj(n) || !isStr(n.name) || !Number.isInteger(n.stage)) { r.error(1, `names[${i}]: must be {name, stage}`); return; }
    if (!NAMES_ALLOWED.has(key)) r.error(1, `names[${i}]: "${n.name}" at stage ${n.stage} is not a story name of design section 1`);
    seen.add(key);
  });
  for (const key of NAMES_ALLOWED) if (names.length > 0 && !seen.has(key)) r.min(`names: missing ${key.replace(':', ' at stage ')}`);
}

function checkBlocklistShape(blocklist, r) {
  if (blocklist === undefined) return;
  if (!isObj(blocklist) || blocklist.format !== 'sha256-lower' || !Array.isArray(blocklist.entries)) {
    r.error(5, 'blocklist: must be {"format": "sha256-lower", "entries": [{"h": <sha256 hex>, "sub": true|false}, ...]}');
    return;
  }
  blocklist.entries.forEach(( e, i) => {
    if (!isObj(e) || typeof e.h !== 'string' || !/^[0-9a-f]{64}$/.test(e.h) || typeof e.sub !== 'boolean') r.error(5, `blocklist entry ${i + 1}: must be {"h": <64 lowercase hex>, "sub": true|false}`);
  });
}


function checkWords(wordList, { r, cmu, real, isWord, stageOfRec, blocklist }, extras = []) {
  const seen = new Map();
  const label = ( rec, i) => (isStr(rec?.w) && !isBlocked(rec.w, blocklist) ? `word "${rec.w}"` : `word #${i + 1}`);
  const good = [];

  wordList.forEach((rec, i) => {
    const L = label(rec, i);
    if (!isObj(rec)) { r.error(1, `${L}: must be an object`); return; }

    if (isStr(rec.w)) {
      const key = lower(rec.w);
      if (seen.has(key)) r.error(9, `${L}: "w" appears more than once across content/words/*.json`);
      seen.set(key, i);
    }
    if (isStr(rec.w) && isBlocked(rec.w, blocklist)) r.error(5, `${L}: matches the blocklist`);

    const bad = shapeProblems(rec);
    if (bad.length > 0) { for (const b of bad) r.error(1, `${L}: ${b}`); return; }

    const w = lower(rec.w);
    const segs = (rec.segs);
    const isReal = rec.real !== false;

    const spelled = segs.map((s) => s[0]).join('').toLowerCase();
    if (spelled !== w) r.error(1, `${L}: segs write "${spelled}"`);
    const unknown = [...new Set(segs.flatMap(([, p]) => phonemeCodes(p)).filter((c) => !Object.hasOwn(PHONEMES, c)))];
    if (unknown.length > 0) r.error(1, `${L}: unknown phoneme code(s): ${unknown.join(', ')}`);
    if (rec.parts.join('').toLowerCase() !== w) r.error(1, `${L}: parts join to "${rec.parts.join('')}"`);
    if (unknown.length > 0 || spelled !== w) return;
    const untaught = untaughtSegs(rec);
    for (const u of untaught) r.error(1, `${L}: box ${u.index + 1} ${JSON.stringify(u.seg)} has no taught grapheme`);

    checkDivision(L, rec, isWord, r);

    const idx = stageIndex(rec.stage);
    if (idx < 0 || idx > LAST_STAGE) r.error(4, `${L}: stage "${rec.stage}" is not a playable stage id`);
    else if (untaught.length === 0) {
      const computed = stageOfRec(rec);
      if (computed === Infinity) r.error(4, `${L}: no stage can read this word (more than three syllables?)`);
      else if (computed !== idx) r.error(4, `${L}: stored stage ${rec.stage} (${idx}) but wordStage gives ${STAGES[computed].id} (${computed})`);
    }

    if (cmu) {
      const prons = cmu.get(w);
      if (isReal) checkPronunciation(L, w, rec, prons, r);
      else if (prons) r.error(5, `${L}: a made-up word is in CMUdict`);
    }
    if (!isReal && real.has(w)) r.error(5, `${L}: a made-up word is also a real word`);
    if (!isReal && rec.parts.length > 3) r.error(5, `${L}: made-up words have 1 to 3 syllables`);

    if (rec.base !== null) {
      const base = real.get(lower(rec.base));
      if (!base) r.error(9, `${L}: base "${isBlocked(String(rec.base), blocklist) ? '(hidden)' : rec.base}" is not a real word in the lexicon`);
      else if (lower(rec.base) === w) r.error(9, `${L}: base is the word itself`);
    }
    good.push(rec);
  });

  checkWordCounts(good, r, extras);
}

function shapeProblems(rec) {
  const out = [];
  if (!isStr(rec.w) || !/^[a-z]+$/.test(rec.w)) out.push('"w" must be lower-case letters');
  if (!isSegs(rec.segs)) out.push('"segs" must be a non-empty list of [grapheme, phonemes] pairs');
  if (!Array.isArray(rec.parts) || rec.parts.length === 0 || !rec.parts.every(isStr)) out.push('"parts" must be a non-empty list of strings');
  if (!Array.isArray(rec.types) || rec.types.length === 0 || !rec.types.every(( t) => TYPES.includes(t))) out.push(`"types" must be a list of ${TYPES.join('|')}`);
  else if (Array.isArray(rec.parts) && rec.types.length !== rec.parts.length) out.push('"types" must have one entry per part');
  if (!PATTERNS.includes(rec.pattern)) out.push(`"pattern" must be one of ${PATTERNS.join(', ')}`);
  if (rec.pattern === 'mixed' && !(Array.isArray(rec.patterns) && rec.patterns.length === (rec.parts?.length ?? 0) - 1)) out.push('a "mixed" pattern needs "patterns", one per gap');
  if (!isStr(rec.stage)) out.push('"stage" must be a stage id');
  if (typeof rec.real !== 'boolean') out.push('"real" must be true or false');
  if (typeof rec.schwa !== 'boolean') out.push('"schwa" must be true or false');
  if (rec.flex !== null && !isStr(rec.flex)) out.push('"flex" must be null or the other split ("ca|bin")');
  else if (isStr(rec.flex) && isStr(rec.w) && rec.flex.replaceAll('|', '') !== rec.w) out.push('"flex" must join to the word');
  if (rec.base !== null && !isStr(rec.base)) out.push('"base" must be null or a word');
  if (typeof rec.rare !== 'boolean') out.push('"rare" must be true or false');
  if (rec.mean !== null && !isStr(rec.mean)) out.push('"mean" must be null or a short meaning');
  else if (isStr(rec.mean) && words(rec.mean) > MEAN_WORDS) out.push(`"mean" has more than ${MEAN_WORDS} words`);
  if ((rec.rare === true || isStr(rec.flex)) && !isStr(rec.mean)) out.push('"mean" is required when "rare" or "flex" is set');
  if (rec.pic !== null && !isStr(rec.pic)) out.push('"pic" must be null or a picture name');
  if (typeof rec.note !== 'string') out.push('"note" must be a string ("" when none)');
  return out;
}

function checkDivision(L, rec, isWord, r) {
  const segs = (rec.segs);
  const o = { isWord, base: rec.base ?? null };
  const computed = {
    parts: divideParts(segs, o), types: syllableTypesOf(segs, o), pattern: patternOf(segs, o),
    patterns: patternsOf(segs, o), flex: flexOf(segs, o),
  };
  const direct = same(rec.parts, computed.parts) && same(rec.types, computed.types);
  let flipped = false;
  if (!direct && rec.pattern === 'VC/V' && isStr(rec.flex)) {
    const gi = gaps(segs, o).findIndex((g) => g.pattern === 'VC/V');
    const flip = gi >= 0 ? flipSplit(segs, gi, o) : null;
    flipped = flip !== null && same(rec.parts, flip.parts) && same(rec.types, flip.types) && rec.flex === computed.parts.join('|');
  }
  if (!direct && !flipped) {
    if (!same(rec.parts, computed.parts)) r.error(2, `${L}: parts ${rec.parts.join('|')} but the divider gives ${computed.parts.join('|')}`);
    if (!same(rec.types, computed.types)) r.error(2, `${L}: types ${rec.types.join(',')} but the divider gives ${computed.types.join(',')}`);
  }
  if (rec.pattern !== computed.pattern) r.error(2, `${L}: pattern ${rec.pattern} but the divider gives ${computed.pattern}`);
  else if (rec.pattern === 'mixed' && !same(rec.patterns ?? [], computed.patterns)) {
    r.error(2, `${L}: patterns ${(rec.patterns ?? []).join(', ')} but the divider gives ${computed.patterns.join(', ')}`);
  }
  if (!flipped) {
    if (computed.flex !== null && rec.flex !== computed.flex) r.error(2, `${L}: flex ${rec.flex ?? 'null'} but the divider gives ${computed.flex}`);
    else if (computed.flex === null && isStr(rec.flex)) {
      const alts = gaps(segs, o).flatMap((g, gi) => (flipSplit(segs, gi, o) ? [flipSplit(segs, gi, o)] : []));
      if (!alts.some((a) => a && a.parts.join('|') === rec.flex)) r.error(2, `${L}: flex ${rec.flex} is not another split of this word`);
    }
  }
}

function checkPronunciation(L, w, rec, prons, r) {
  const said = renderings(rec.segs);
  if (said.length === 0) return;
  if (!prons) {
    if (!Object.hasOwn(CMU_MISSING_OK, w)) r.error(3, `${L}: not in CMUdict, so its pronunciation cannot be checked`);
    return;
  }
  const exempt = Object.hasOwn(VOWEL_COUNT_EXEMPT, w);
  if (!prons.some((p) => said.some((s) => pronMatches(s, p, exempt)))) {
    r.error(3, `${L}: segs say "${said[0].join(' ')}", but CMUdict has ${prons.map((p) => `"${p.map(norm).join(' ')}"`).join(' or ')}`);
  }
  if (!exempt && !prons.some((p) => dictVowels(p) === rec.parts.length)) {
    r.error(3, `${L}: ${rec.parts.length} syllable(s) but CMUdict has ${[...new Set(prons.map(dictVowels))].join(' or ')} vowel sound(s)`);
  }
}

function checkWordCounts(list, r, extras) {
  if (list.length === 0) {
    r.min('words: no words yet');
    return;
  }
  const byStage = ( n) => list.filter((w) => w.stage === STAGES[n].id);
  for (const land of LAND_IDS) {
    const lw = list.filter((w) => landOfStageId(w.stage) === land);
    const real2 = lw.filter((w) => w.real !== false && w.parts.length === 2).length;
    const real3 = lw.filter((w) => w.real !== false && w.parts.length === 3).length;
    const made = lw.filter((w) => w.real === false).length;
    const stages = stagesOfLand(land);
    const syllables = new Set([
      ...lw.flatMap((w) => w.parts.map(( p) => lower(p))),
      ...extras.filter((e) => isObj(e) && isStr(e.s) && landOfStageId(e.stage) === land).map((e) => lower(e.s)),
    ]);
    if (real2 < 40) r.min(`words ${land}: ${real2} two-syllable real words, need 40`);
    if ((syllableStage(3, land) ?? 99) <= stages[stages.length - 1].n && real3 < 15) r.min(`words ${land}: ${real3} three-syllable words, need 15`);
    if (made < 20) r.min(`words ${land}: ${made} made-up words, need 20`);
    if (syllables.size < 30) r.min(`words ${land}: ${syllables.size} distinct syllables for Clan Sort, need 30`);
  }
  const s0 = byStage(0);
  const one0 = s0.filter((w) => w.real !== false && w.parts.length === 1).length;
  if (one0 < 40) r.min(`words closed.review: ${one0} one-syllable real words, need 40`);
  if (s0.filter((w) => w.real === false).length < 20) r.min('words closed.review: fewer than 20 made-up words');
  const inflected = byStage(1).filter((w) => w.base).length;
  if (inflected < 20) r.min(`words closed.endings: ${inflected} inflected forms, need 20`);
  for (let n = 1; n <= LAST_STAGE; n++) {
    const sw = byStage(n);
    if (sw.filter((w) => w.real !== false).length < 12) r.min(`words ${STAGES[n].id}: fewer than 12 real words of its own stage`);
    if (sw.filter((w) => w.real === false).length < 5) r.min(`words ${STAGES[n].id}: fewer than 5 made-up words of its own stage`);
  }
}


function checkSyllables(content, r, blocklist) {
  const list = Array.isArray(content.syllables) ? content.syllables : [];
  const seen = new Set();
  list.forEach((rec, i) => {
    const L = `syllable #${i + 1}`;
    if (!isObj(rec) || !isStr(rec.s) || !isSegs(rec.segs) || !TYPES.includes(rec.type) || !isStr(rec.stage)) {
      r.error(1, `${L}: must be {s, segs, type, stage}`);
      return;
    }
    const key = `${lower(rec.s)}.${rec.type}`;
    if (seen.has(key)) r.error(9, `${L}: the same syllable and type appears twice`);
    seen.add(key);
    if (isBlocked(rec.s, blocklist)) r.error(5, `${L}: matches the blocklist`);
    if (rec.segs.map(( s) => s[0]).join('').toLowerCase() !== lower(rec.s)) r.error(1, `${L} "${rec.s}": segs do not write it`);
    const unknown = rec.segs.flatMap(( [, p]) => phonemeCodes(p)).filter(( c) => !Object.hasOwn(PHONEMES, c));
    if (unknown.length > 0) { r.error(1, `${L} "${rec.s}": unknown phoneme code(s): ${unknown.join(', ')}`); return; }
    if (vowelBoxes(rec.segs).length !== 1) r.error(2, `${L} "${rec.s}": a syllable has exactly one vowel sound`);
    else if (!same(syllableTypesOf(rec.segs), [rec.type])) r.error(2, `${L} "${rec.s}": type ${rec.type} but the divider gives ${syllableTypesOf(rec.segs).join(',')}`);
    const idx = stageIndex(rec.stage);
    if (idx < 0 || idx > LAST_STAGE) { r.error(4, `${L} "${rec.s}": stage "${rec.stage}" is not a playable stage id`); return; }
    const computed = wordStage({ w: rec.s, segs: rec.segs, types: [rec.type], parts: [rec.s], pattern: 'one', schwa: false, base: null });
    if (computed === Infinity) r.error(1, `${L} "${rec.s}": has a box with no taught grapheme`);
    else if (computed > idx) r.error(4, `${L} "${rec.s}": stored stage ${rec.stage} comes before the syllable can be read (${STAGES[computed].id})`);
  });
}


function checkRed(content, r, { blockers }) {
  const list = Array.isArray(content.red) ? content.red : [];
  const seen = new Set();
  const byWord = new Map();
  const perStage = {};
  list.forEach((rec, i) => {
    const L = `sight word #${i + 1}`;
    if (!isObj(rec) || !isStr(rec.w) || !isSegs(rec.segs) || !isStr(rec.stage) || typeof rec.drill !== 'boolean' ||
      !Array.isArray(rec.tricky) || !isStr(rec.heart)) {
      r.error(1, `${L}: must be {w, segs, stage, drill, tricky, heart}`);
      return;
    }
    const LL = `sight word "${rec.w}"`;
    const w = lower(rec.w);
    if (seen.has(w)) r.error(9, `${LL}: appears more than once across content/red-words/*.json`);
    seen.add(w);
    byWord.set(w, rec);
    if (rec.segs.map(( s) => s[0]).join('').toLowerCase() !== w) r.error(1, `${LL}: segs do not write it`);
    const unknown = rec.segs.flatMap(( [, p]) => phonemeCodes(p)).filter(( c) => !Object.hasOwn(PHONEMES, c));
    if (unknown.length > 0) r.error(1, `${LL}: unknown phoneme code(s): ${unknown.join(', ')}`);
    if (!rec.tricky.every(( n) => Number.isInteger(n) && n >= 0 && n < rec.segs.length)) r.error(1, `${LL}: "tricky" must be box indexes within segs`);
    const idx = stageIndex(rec.stage);
    if (idx < 0 || idx > LAST_STAGE) { r.error(5, `${LL}: stage "${rec.stage}" is not a playable stage id`); return; }
    perStage[idx] = (perStage[idx] ?? 0) + 1;
    const planned = Object.entries(SIGHT_POOL).find(([, ws]) => ws.some((x) => lower(x) === w));
    if (planned && Number(planned[0]) !== idx) r.error(5, `${LL}: planned for stage ${planned[0]} but stored at stage ${idx}`);
    if (NOT_DRILLED.includes(w) === rec.drill) r.error(5, `${LL}: drill is ${rec.drill}, but ${NOT_DRILLED.includes(w) ? 'this word is no longer irregular' : 'this word is still irregular'}`);
  });
  for (const [idx, n] of Object.entries(perStage)) {
    if (Number(idx) > 0 && n > MAX_SIGHT_PER_STAGE) r.error(5, `stage ${idx} (${STAGES[Number(idx)].id}) has ${n} sight words, at most ${MAX_SIGHT_PER_STAGE}`);
  }
  if (list.length === 0) r.min('red words: no sight words yet');
  else {
    for (const [idx, ws] of Object.entries(SIGHT_POOL)) {
      const missing = ws.filter((x) => !seen.has(lower(x)));
      if (missing.length > 0) r.min(`red words ${STAGES[Number(idx)].id}: missing ${missing.join(', ')}`);
    }
  }
  const sentences = Array.isArray(content.redSentences) ? content.redSentences : [];
  const sentenceFor = new Set();
  const ids = new Set();
  sentences.forEach((s, i) => {
    const L = `red sentence #${i + 1}`;
    if (!isObj(s) || !isStr(s.w) || !isStr(s.id) || !isStr(s.text)) { r.error(1, `${L}: must be {w, id, text}`); return; }
    if (ids.has(s.id)) r.error(9, `${L}: id "${s.id}" appears twice`);
    ids.add(s.id);
    const rec = byWord.get(lower(s.w));
    if (!rec) { r.error(5, `${L}: "${s.w}" is not a sight word`); return; }
    sentenceFor.add(lower(s.w));
    if (!tokenize(s.text).map(lower).includes(lower(s.w))) r.error(5, `${L} (${s.id}): the sentence does not use "${s.w}"`);
    const at = stageIndex(rec.stage);
    for (const b of blockers(s.text, at)) r.error(5, `${L} (${s.id}): "${b.token}" is not readable at ${rec.stage}: ${b.why}`);
  });
  if (list.length > 0) {
    const missing = list.filter((rec) => rec?.drill === true && isStr(rec.w) && !sentenceFor.has(lower(rec.w))).map((rec) => rec.w);
    if (missing.length > 0) r.min(`red sentences: no sentence for ${missing.length} drilled word(s) (${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ', ...' : ''})`);
  }
}


function checkDictation(content, r, { real, all, stageOfRec, blockers }) {
  const list = Array.isArray(content.dictation) ? content.dictation : [];
  const seenStage = new Set();
  const sentenceIds = new Set();
  list.forEach((d, i) => {
    const L = `dictation #${i + 1}`;
    if (!isObj(d) || !isStr(d.stage) || !Array.isArray(d.words) || !Array.isArray(d.sentences)) { r.error(1, `${L}: must be {stage, words, sentences}`); return; }
    const at = stageIndex(d.stage);
    if (at < 0 || at > LAST_STAGE) { r.error(5, `${L}: stage "${d.stage}" is not a playable stage id`); return; }
    const LS = `dictation ${d.stage}`;
    if (seenStage.has(d.stage)) r.error(9, `${LS}: the stage appears twice`);
    seenStage.add(d.stage);
    if (d.words.length < 8) r.min(`${LS}: ${d.words.length} words, need 8`);
    if (d.sentences.length < 3) r.min(`${LS}: ${d.sentences.length} sentences, need 3`);

    d.words.forEach(( item, k) => {
      if (!isObj(item) || !isStr(item.w) || (item.cue !== undefined && !isStr(item.cue))) { r.error(1, `${LS} word #${k + 1}: must be {w, cue?}`); return; }
      const rec = all.get(lower(item.w));
      if (!rec) { r.error(5, `${LS}: "${item.w}" is not in the lexicon`); return; }
      const s = stageOfRec(rec);
      if (s > at) { r.error(5, `${LS}: "${item.w}" needs stage ${s}`); return; }
      const missing = spellingChoice(rec, at);
      if (missing.length > 0 && !isStr(item.cue)) {
        r.error(5, `${LS}: "${item.w}" has ${missing.join(', ')} with more than one taught spelling and no position rule; add a cue`);
      }
    });
    d.sentences.forEach(( s, k) => {
      if (!isObj(s) || !isStr(s.id) || !isStr(s.text) || !Array.isArray(s.targets)) { r.error(1, `${LS} sentence #${k + 1}: must be {id, text, targets}`); return; }
      if (sentenceIds.has(s.id)) r.error(9, `${LS}: sentence id "${s.id}" appears twice`);
      sentenceIds.add(s.id);
      const n = words(s.text);
      if (n < 5 || n > 10) {
        if (n > 10) r.error(5, `${LS} ${s.id}: ${n} words, at most 10`); else r.min(`${LS} ${s.id}: ${n} words, need 5 to 10`);
      }
      for (const b of blockers(s.text, at)) r.error(5, `${LS} ${s.id}: "${b.token}" is not readable here: ${b.why}`);
      const toks = tokenize(s.text).map(lower);
      if (s.targets.length > 3) r.error(5, `${LS} ${s.id}: ${s.targets.length} targets, at most 3`);
      else if (s.targets.length < 2) r.min(`${LS} ${s.id}: ${s.targets.length} target word(s), need 2 or 3`);
      for (const t of s.targets) {
        const rec = real.get(lower(t));
        if (!toks.includes(lower(t))) r.error(5, `${LS} ${s.id}: target "${t}" is not in the sentence`);
        else if (!rec) r.error(5, `${LS} ${s.id}: target "${t}" is not a lexicon word`);
        else if (stageOfRec(rec) !== at) r.error(5, `${LS} ${s.id}: target "${t}" is not a word of this stage`);
      }
    });
  });
  for (let n = 0; n <= LAST_STAGE; n++) if (list.length > 0 && !seenStage.has(STAGES[n].id)) r.min(`dictation ${STAGES[n].id}: missing`);
  if (list.length === 0) r.min('dictation: nothing yet');
}

export function spellingChoice(rec, at) {
  const segs = (rec.segs);
  const out = [];
  segs.forEach((seg, i) => {
    const [g, p] = seg;
    const sound = phonemeCodes(p).join(' ');
    if (sound === '' || soundKind(sound) === 'silent') return;
    if (rec.base && i === segs.length - 1 && ['s', 'es', 'ed', 'ing'].includes(lower(g))) return;
    const alts = spellingsOf(sound, at).map((id) => graphemeOf(id)).filter((e) => e !== null);
    if (alts.length < 2) return;
    if (positionDecides(rec, i, at)) return;
    const others = alts.filter((e) => e && lower(e.g) !== lower(g));
    const live = others.filter((e) => {
      const hyp = { ...rec, segs: segs.map((s, k) => (k === i ? ([e?.g ?? '', p]) : s)) };
      const alt = lower(e?.g);
      if ((alt === 'kn' || alt === 'wr') && i > 0) return false;
      if ((['ed', 'es', 'ing'].includes(alt) || (alt === 's' && sound === 'z')) && !(rec.base && i === segs.length - 1)) return false;
      const governed = ['ay', 'ai', 'oy', 'oi', 'aw', 'au', 'ow', 'ou', 'ck', 'k', 'tch', 'ch', 'dge', 'ff', 'll', 'ss', 'zz'].includes(alt) ||
        (alt === 'c' && sound === 'k') || (alt === 'g' && sound === 'j');
      return !(governed && positionDecides(hyp, i, at) === null);
    });
    if (live.length > 0) out.push(g);
  });
  return out;
}


function checkPassages(content, r, { real, sight, stageOfRec, blockers }) {
  const list = Array.isArray(content.passages) ? content.passages : [];
  const ids = new Set();
  list.forEach((p, i) => {
    const L = `passage #${i + 1}`;
    if (!isObj(p) || !isStr(p.id) || !isStr(p.stage) || !isStr(p.land) || !isStr(p.page) || !isStr(p.title) || !isStr(p.text) || !Array.isArray(p.focus)) {
      r.error(1, `${L}: must be {id, stage, land, page, title, text, focus}`);
      return;
    }
    const LP = `passage ${p.id}`;
    if (ids.has(p.id)) r.error(9, `${LP}: id appears twice`);
    ids.add(p.id);
    const at = stageIndex(p.stage);
    if (at < 0 || at > LAST_STAGE) { r.error(5, `${LP}: stage "${p.stage}" is not a playable stage id`); return; }
    if (!/\.(A|B)$/.test(p.id) || p.id.slice(0, -2) !== p.stage) r.error(5, `${LP}: id must be "${p.stage}.A" or "${p.stage}.B"`);
    if (p.land !== STAGES[at].land) r.error(5, `${LP}: land is ${p.land} but the stage belongs to ${STAGES[at].land}`);
    if (!new RegExp(`^${STAGES[at].land}\\.\\d+$`).test(p.page)) r.error(5, `${LP}: page must look like "${STAGES[at].land}.<n>"`);

    const toks = tokenize(p.text);
    if (toks.length > 90) r.error(5, `${LP}: ${toks.length} words, at most 90`);
    else if (toks.length < 40) r.min(`${LP}: ${toks.length} words, need 40 to 90`);
    for (const sentence of p.text.split(/(?<=[.!?])\s+/)) {
      const n = words(sentence);
      if (n > 14) r.error(5, `${LP}: a sentence has ${n} words, at most 14 ("${tokenize(sentence).slice(0, 4).join(' ')} ...")`);
    }
    for (const b of blockers(p.text, at)) r.error(5, `${LP}: "${b.token}" is not readable at ${p.stage}: ${b.why}`);

    if (at >= 2 && toks.length > 0) {
      const multi = toks.filter((t) => {
        const rec = real.get(lower(t)) ?? sight.get(lower(t));
        return rec && Array.isArray(rec.segs) && vowelBoxes(rec.segs).length >= 2;
      }).length;
      if (multi / toks.length < 0.25) r.min(`${LP}: ${Math.round((100 * multi) / toks.length)}% of words have 2+ syllables, need 25%`);
    }
    const lowered = new Set(toks.map(lower));
    if (p.focus.length < 4) r.min(`${LP}: ${p.focus.length} focus words, need 4`);
    for (const f of p.focus) {
      const rec = real.get(lower(f));
      if (!lowered.has(lower(f))) r.error(5, `${LP}: focus word "${f}" is not in the text`);
      else if (!rec) r.error(5, `${LP}: focus word "${f}" is not a lexicon word`);
      else if (stageOfRec(rec) !== at) r.error(5, `${LP}: focus word "${f}" is not a word of ${p.stage}`);
    }
  });
  if (list.length === 0) r.min('passages: nothing yet');
  else for (let n = 0; n <= LAST_STAGE; n++) for (const ab of ['A', 'B']) if (!ids.has(`${STAGES[n].id}.${ab}`)) r.min(`passages: ${STAGES[n].id}.${ab} is missing`);
}


function voiceRef(id, voice, idExists, r, where, prefix) {
  if (!isStr(id)) { r.error(8, `${where}: a voice id must be a string`); return false; }
  if (!idExists(id)) { r.error(8, `${where}: voice id ${id} does not exist in content/voice/*.json`); return false; }
  if (prefix && !id.startsWith(prefix)) r.error(8, `${where}: voice id ${id} should start with ${prefix}`);
  return true;
}

function checkStory(content, r, voice, idExists) {
  const story = isObj(content.story) ? content.story : {};
  for (const land of LAND_IDS) {
    const s = story[land];
    const W = `story ${land}`;
    if (!isObj(s) || Object.keys(s).length === 0) { r.min(`${W}: nothing yet`); continue; }
    if (s.land !== land) r.error(1, `${W}: "land" must be "${land}"`);
    const lines = (key, part, required) => {
      const v = s[key];
      if (v === undefined) { if (required) r.min(`${W}: missing "${key}"`); return; }
      if (!Array.isArray(v)) { r.error(1, `${W}: "${key}" must be a list of voice ids`); return; }
      if (v.length === 0) r.min(`${W}: "${key}" has no lines`);
      v.forEach(( id, n) => {
        if (voiceRef(id, voice, idExists, r, `${W} ${key}[${n}]`, storyPrefix(land, part))) checkLineLength(id, voice, r, W);
      });
    };
    lines('intro', 'intro', true);
    lines('finale', 'finale', true);
    lines('prologue', 'prologue', land === 'closed');
    lines('end', 'end', land === 'le');
    const stages = isObj(s.stages) ? s.stages : {};
    for (const st of stagesOfLand(land)) if (!Object.hasOwn(stages, st.id)) r.min(`${W}: no entry for stage ${st.id}`);
    for (const [id, entry] of Object.entries(stages)) {
      const n = stageIndex(id);
      if (n < 0 || STAGES[n].land !== land) { r.error(1, `${W}: "${id}" is not a stage of this land`); continue; }
      if (!isObj(entry) || !isStr(entry.beat) || !Array.isArray(entry.lines)) { r.error(1, `${W} ${id}: must be {beat, lines}`); continue; }
      if (entry.lines.length === 0) r.min(`${W} ${id}: no lines`);
      entry.lines.forEach(( lineId, k) => {
        if (voiceRef(lineId, voice, idExists, r, `${W} ${id} lines[${k}]`, storyPrefix(land, id))) checkLineLength(lineId, voice, r, W);
      });
    }
  }
}

function checkLineLength(id, voice, r, where) {
  const text = voice[id]?.text;
  if (typeof text === 'string' && words(text) > STORY_LINE_WORDS) r.error(5, `${where}: ${id} has ${words(text)} words, at most ${STORY_LINE_WORDS}`);
}

function checkLands(content, r, idExists, options) {
  const lands = Array.isArray(content.lands) ? content.lands : [];
  const voice = isObj(content.voice) ? content.voice : {};
  const seen = new Set();
  lands.forEach((land, i) => {
    const W = `lands #${i + 1}`;
    if (!isObj(land) || !LAND_IDS.includes(land.id) || !isStr(land.name) || !isStr(land.classroomName) || !isStr(land.crest) || !isStr(land.color) ||
      !Array.isArray(land.landmarks) || !Array.isArray(land.intro) || !Array.isArray(land.finale)) {
      r.error(1, `${W}: must be {id, name, classroomName, crest, color, landmarks, intro, finale}`);
      return;
    }
    if (seen.has(land.id)) r.error(9, `${W}: land ${land.id} appears twice`);
    seen.add(land.id);
    for (const id of [...land.intro, ...land.finale]) voiceRef(id, voice, idExists, r, `lands ${land.id}`);
    for (const lm of land.landmarks) {
      if (!isObj(lm) || !isStr(lm.id) || !isStr(lm.art) || stageIndex(lm.stage) < 0) r.error(1, `lands ${land.id}: a landmark must be {stage, id, art}`);
      else if (options.artExists && !options.artExists(`assets/art/${artFile(lm.art)}`)) r.error(8, `lands ${land.id}: art ${lm.art} has no file`);
    }
  });
  if (lands.length > 0) for (const id of LAND_IDS) if (!seen.has(id)) r.min(`lands: ${id} is missing`);
}

function checkDiscovery(content, r, idExists, lookup, options) {
  const disc = isObj(content.discovery) ? content.discovery : {};
  const voice = isObj(content.voice) ? content.voice : {};
  for (const [id, d] of Object.entries(disc)) {
    const W = `discovery ${id}`;
    const n = stageIndex(id);
    if (n < 0 || n > LAST_STAGE) { r.error(1, `${W}: not a playable stage id`); continue; }
    if (!isObj(d) || !Array.isArray(d.panels) || !Array.isArray(d.try) || !isStr(d.recap)) { r.error(1, `${W}: must be {panels, try, recap}`); continue; }
    if (d.panels.length > 5) r.error(5, `${W}: ${d.panels.length} panels, at most 5`);
    else if (d.panels.length < 3) r.min(`${W}: ${d.panels.length} panels, need 3 to 5`);
    if (d.try.length > 2) r.error(5, `${W}: ${d.try.length} try words, exactly 2`);
    else if (d.try.length < 2) r.min(`${W}: ${d.try.length} try words, need 2`);
    voiceRef(d.recap, voice, idExists, r, `${W} recap`);
    d.panels.forEach(( p, k) => {
      if (!isObj(p) || !isStr(p.art) || !isStr(p.text) || !isStr(p.voice) || !Array.isArray(p.examples) || !Array.isArray(p.try)) {
        r.error(1, `${W} panel #${k + 1}: must be {art, text, voice, examples, try}`);
        return;
      }
      voiceRef(p.voice, voice, idExists, r, `${W} panel #${k + 1}`);
      if (options.artExists && !options.artExists(`assets/art/${artFile(p.art)}`)) r.error(8, `${W} panel #${k + 1}: art ${p.art} has no file`);
      for (const w of [...p.examples, ...p.try]) if (!lookup(lower(w))) r.warn(5, `${W} panel #${k + 1}: "${w}" is not a real lexicon word`);
    });
  }
  if (Object.keys(disc).length > 0) for (let n = 0; n <= LAST_STAGE; n++) if (!Object.hasOwn(disc, STAGES[n].id)) r.min(`discovery ${STAGES[n].id}: missing`);
  if (Object.keys(disc).length === 0) r.min('discovery: nothing yet');
}

function checkCoach(content, r, idExists) {
  const coach = isObj(content.coach) ? content.coach : {};
  const voice = isObj(content.voice) ? content.voice : {};
  for (const [id, steps] of Object.entries(coach)) {
    const W = `coach ${id}`;
    if (stageIndex(id) < 0) { r.error(1, `${W}: not a stage id`); continue; }
    if (!isObj(steps)) { r.error(1, `${W}: must map step names to lists of lines`); continue; }
    for (const [step, lines] of Object.entries(steps)) {
      if (!COACH_STEPS.includes(step)) r.error(1, `${W}: "${step}" is not a step name (${COACH_STEPS.join(', ')})`);
      if (!Array.isArray(lines) || lines.length === 0) { r.error(1, `${W} ${step}: must be a non-empty list of {text, voice?}`); continue; }
      lines.forEach(( line, k) => {
        if (!isObj(line) || !isStr(line.text)) r.error(1, `${W} ${step} #${k + 1}: must be {text, voice?}`);
        else if (line.voice !== undefined) voiceRef(line.voice, voice, idExists, r, `${W} ${step} #${k + 1}`);
      });
    }
  }
  if (Object.keys(coach).length === 0) r.min('coach: nothing yet');
}

function checkVoice(voice, r) {
  for (const [id, line] of Object.entries(voice)) {
    if (!/^v\.[a-z0-9-]+\.[A-Za-z0-9._-]+$/.test(id)) r.error(8, `voice id "${id}": must look like v.<area>.<name>`);
    if (!isObj(line) || !isStr(line.text) || (line.note !== undefined && typeof line.note !== 'string')) r.error(1, `voice ${id}: must be {text, note?}`);
  }
}
