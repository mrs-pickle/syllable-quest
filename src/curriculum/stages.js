import { GRAPHEMES } from './graphemes.js';



const ROWS = [
  ['closed.review', 'closed', 'Short-word warm-up', 'ship', ['closed'], ['one']],
  ['closed.endings', 'closed', 'Endings', 'wish-es', [], ['ending']],
  ['closed.compound', 'closed', 'Two small words', 'sun-set', [], ['compound']],
  ['closed.vccv-double', 'closed', 'Twin consonants', 'rab-bit', [], ['VC/CV']],
  ['closed.vccv', 'closed', 'Different consonants', 'nap-kin', [], ['VC/CV']],
  ['closed.vcccv', 'closed', 'Three in the middle', 'hun-dred', [], ['VCCCV']],
  ['closed.three', 'closed', 'Three closed syllables', 'fan-tas-tic', [], ['mixed']],
  ['open.one', 'open', 'Open one-syllable', 'she', ['open'], []],
  ['open.vcv', 'open', 'Open first', 'ro-bot', [], ['V/CV']],
  ['open.y', 'open', 'Y at the end', 'ba-by', [], []],
  ['open.flex', 'open', 'Flip the split', 'cab-in', [], ['VC/V']],
  ['vce.one', 'vce', 'Silent-E words', 'cake', ['vce'], []],
  ['vce.soft', 'vce', 'Soft c and g', 'page', [], []],
  ['vce.two', 'vce', 'Silent-E in long words', 'in-vite', [], []],
  ['vce.mix', 'vce', 'Three-part mixes', 'con-cen-trate', [], []],
  ['team.ai-ay', 'team', 'ai and ay', 'ex-plain', ['team'], []],
  ['team.ee-ea', 'team', 'ee and ea', 'sea-weed', [], []],
  ['team.oa-igh', 'team', 'oa, oe, igh and ie', 'rain-coat', [], []],
  ['team.oo-ew', 'team', 'oo, ew and ue', 'bal-loon', [], []],
  ['team.au-oi', 'team', 'au, aw, oi and oy', 'aw-ful', [], []],
  ['team.ou-ow', 'team', 'ou and ow', 'rain-bow', [], []],
  ['team.mix', 'team', 'Team mix', 'break-fast', [], ['VV']],
  ['r.ar-or', 'r', 'ar and or', 'gar-den', ['r'], []],
  ['r.er-ir-ur', 'r', 'er, ir and ur', 'per-fect', [], []],
  ['r.mix', 'r', 'R mix', 'car-pen-ter', [], []],
  ['le.one', 'le', 'Consonant-le', 'ta-ble', ['le'], ['C+le']],
  ['le.double', 'le', 'Twin before le', 'lit-tle', [], ['CC+le']],
  ['le.mix', 'le', 'All six types', 'pine-ap-ple', [], []],
  ['city.stub', 'city', 'City of Builders', '', [], []],
];

export const SCHWA_STAGE = 10;

const THREE_SYLLABLES = 6;

export const STAGES = Object.freeze(ROWS.map(([id, land, name, short, types, patterns], n) => {
  const stage = {
    id, land, n, name, short,
    graphemes: Object.freeze(GRAPHEMES.filter(g => g.stage === n && g.card !== false).map(g => g.id)),
    types: Object.freeze(types),
    patterns: Object.freeze(patterns),
    maxSyllables: n === 0 ? 1 : n < THREE_SYLLABLES ? 2 : 3,
    schwa: n >= SCHWA_STAGE,
    flex: n >= SCHWA_STAGE,
  };
  if (id === 'city.stub') stage.locked = true;
  return Object.freeze(stage);
}));


export const LANDS = Object.freeze([
  ['closed', 'Closed Canyon', 'closed'],
  ['open', 'Open Sky Isles', 'open'],
  ['vce', 'Silent-E Forest', 'vce'],
  ['team', 'Vowel Team Harbor', 'team'],
  ['r', 'Bossy-R Mountains', 'r'],
  ['le', 'Little Tail Lake', 'le'],
  ['city', 'City of Builders', null],
].map(([id, name, type], i) => {
  const idx = STAGES.filter(s => s.land === id).map(s => s.n);
  return Object.freeze({ id, n: i + 1, name, type, first: idx[0], last: idx[idx.length - 1], ...(id === 'city' ? { locked: true } : {}) });
}));

export const ENDINGS_STAGE = 1;

export const DIFFERENT_CONSONANT_STAGE = 4;

export function stageIndex(id) {
  return STAGES.findIndex(s => s.id === id);
}

export function stageOf(index) {
  return STAGES[index];
}

export function landOf(index) {
  return STAGES[index]?.land ?? null;
}

export function stagesOfLand(land) {
  return STAGES.filter(s => s.land === land);
}

export function typeStage(type) {
  const s = STAGES.find(st => st.types.includes(type));
  return s ? s.n : null;
}

export function patternStage(pattern, opts = {}) {
  if (pattern === 'VC/CV' && opts.twin === false) return DIFFERENT_CONSONANT_STAGE;
  const s = STAGES.find(st => st.patterns.includes(pattern));
  return s ? s.n : null;
}

const THREE_BY_LAND = Object.freeze({ closed: 6, open: 14, vce: 14, team: 21, r: 24, le: 27 });

export function syllableStage(count, land) {
  if (count <= 1) return 0;
  if (count === 2) return 2;
  if (count === 3) return THREE_BY_LAND[land] ?? null;
  return null;
}

export function cumulativeTypes(index) {
  return STAGES.filter(s => s.n <= index).flatMap(s => s.types);
}
