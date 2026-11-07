import { graphemeOf } from '../curriculum/graphemes.js';
import { phonemeCodes } from '../curriculum/phonemes.js';
import { STAGES, LANDS } from '../curriculum/stages.js';
import { LAST_STAGE, clampStage } from '../profile/settings.js';
import { withPlacement, withPointer, withCrest, withSweep } from '../profile/profile.js';
import { INTERVALS, newItemState } from './itemstate.js';
import { makeKey } from './keys.js';

export const MAX_PROBE_ITEMS = 30;
export const PROBE_ITEMS = 4;
export const PROBE_READ = 3;
export const PART_A_COUNT = 12;
export const PART_C_COUNT = 3;
export const PART_C_LOWER = 2;
export const SAMPLE_PER_STAGE = 3;
export const SWEEP_SESSIONS = 3;
export const GUESS_START = Object.freeze({ beginning: 2, 'some long words': 7, 'most types': 15 });

export const PART_A_IDS = Object.freeze(['tch', 'dge', 'qu', 'wh', 'nk', 'ng', 'e', 'u', 'ai', 'igh', 'ar', 'ur']);






const hash = (s) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
};
const stable = (list, key, salt) => [...list].sort((a, b) => hash(`${salt}:${key(a)}`) - hash(`${salt}:${key(b)}`) || (key(a) < key(b) ? -1 : 1));

const stageNumber = (stageId) => STAGES.findIndex((s) => s.id === stageId);

function poolsOf(content) {
  const pools = new Map();
  for (const w of content?.words ?? []) {
    const at = stageNumber(w.stage);
    if (at < 0 || typeof w.w !== 'string') continue;
    let p = pools.get(at);
    if (!p) { p = { real: [], made: [] }; pools.set(at, p); }
    (w.real === false ? p.made : p.real).push(w);
  }
  for (const [at, p] of pools) {
    p.real = stable(p.real, (w) => w.w, `r${at}`).sort((a, b) => Number(a.rare === true) - Number(b.rare === true));
    p.made = stable(p.made, (w) => w.w, `m${at}`);
  }
  return pools;
}

export function probeStart(stages, guess) {
  let target = null;
  if (typeof guess === 'number' && Number.isFinite(guess)) target = guess;
  else if (typeof guess === 'string' && Object.hasOwn(GUESS_START, guess)) target = GUESS_START[ (guess)];
  if (target === null) return 0;
  let start = 0;
  stages.forEach((s, i) => { if (s <= target) start = i; });
  return start;
}

export function placementPlan(content, guess) {
  const pools = poolsOf(content);
  const stages = [];
  for (let s = 1; s <= LAST_STAGE; s++) {
    const p = pools.get(s);
    if (p && p.real.length >= 3 && p.made.length >= 1 && p.real.length + p.made.length >= PROBE_ITEMS + 1) stages.push(s);
  }
  const partA = PART_A_IDS.map((id) => {
    const g = graphemeOf(id);
    return ({ part: 'A', key: makeKey('g', id, 'see'), grapheme: id, expected: g ? phonemeCodes(g.p) : [] });
  });
  return { content, stages, start: probeStart(stages, guess), partA, pools };
}

const isRight = (a) => a.correct === true && a.helped !== true && a.passed !== true;

export function probeOutcome(answers, capped = false) {
  const right = answers.filter(isRight).length;
  const total = answers.length;
  if (total >= PROBE_ITEMS + 1) return right >= PROBE_READ ? 'read' : 'not-yet';
  if (total === PROBE_ITEMS) {
    if (right >= PROBE_READ) return 'read';
    if (right <= 1) return 'not-yet';
    return capped ? 'not-yet' : 'open';
  }
  if (capped && total > 0) return right * 2 > total ? 'read' : 'not-yet';
  return 'open';
}

export const P_READ = 0.85;
export const P_NOT = 0.2;
export const STOP_SHARE = 0.97;
export const STOP_EXACT = 0.6;

export function placementState(plan, answers) {
  const n = plan.stages.length;
  const count = answers.length;
  const capped = count >= MAX_PROBE_ITEMS;
  const probes = [];
  for (const a of answers) {
    const last = probes.at(-1);
    if (last && a.item.n > 1 && last.at === a.item.at && last.outcome === 'open') last.answers.push(a);
    else probes.push({ at: a.item.at, stage: plan.stages[a.item.at], answers: [a], outcome: 'open' });
    const p = (probes.at(-1));
    p.outcome = probeOutcome(p.answers, false);
  }
  if (capped) {
    const last = probes.at(-1);
    if (last && last.outcome === 'open') last.outcome = probeOutcome(last.answers, true);
  }

  const logs = new Array(n + 1).fill(0);
  for (const p of probes) {
    const right = p.answers.filter(isRight).length;
    const wrong = p.answers.length - right;
    for (let j = 0; j <= n; j++) {
      const p1 = p.at <= j - 1 ? P_READ : P_NOT;
      logs[j] += right * Math.log(p1) + wrong * Math.log(1 - p1);
    }
  }
  const top = Math.max(...logs);
  const raw = logs.map((l) => Math.exp(l - top));
  const sum = raw.reduce((a, b) => a + b, 0);
  const belief = raw.map((v) => v / sum);
  let best = 0;
  belief.forEach((v, j) => { if (v > belief[best] + 1e-12) best = j; });
  const share = belief.slice(Math.max(0, best - 1), best + 2).reduce((a, b) => a + b, 0);
  const lo = best - 1;

  const openProbe = probes.at(-1)?.outcome === 'open' ? probes.at(-1) : null;
  const room = count + PROBE_ITEMS <= MAX_PROBE_ITEMS;
  let next = null;
  if (n === 0 || capped) next = null;
  else if (openProbe) next = openProbe.at;
  else if (!room) next = null;
  else if (probes.length === 0) next = Math.min(Math.max(0, plan.start), n - 1);
  else if (share < STOP_SHARE || belief[best] < STOP_EXACT) {
    const used = new Set(answers.map((a) => a.item.word.w));
    let tail = 0;
    let pick = null;
    let gap = Infinity;
    for (let x = n - 1; x >= 0; x--) {
      tail += belief[x + 1];
      const pool = (plan.pools.get(plan.stages[x]));
      if (pool.real.filter((w) => !used.has(w.w)).length < PROBE_ITEMS - 1 || pool.made.filter((w) => !used.has(w.w)).length < 1) continue;
      const d = Math.abs(tail - 0.5);
      if (d <= gap) { gap = d; pick = x; }
    }
    next = pick;
  }
  const read = lo >= 0 ? plan.stages[lo] : null;
  return {
    probes, belief, lo, next, count, share, done: next === null,
    read, suggested: read === null ? 0 : clampStage(read + 1),
  };
}

export function nextPlacementItem(plan, answers) {
  const st = placementState(plan, answers);
  if (st.next === null) return null;
  const at = st.next;
  const stage = plan.stages[at];
  const pool = (plan.pools.get(stage));
  const last = st.probes.at(-1);
  const open = last && last.outcome === 'open' ? last : null;
  const used = new Set(answers.map((a) => a.item.word.w));
  const freshReal = pool.real.filter((w) => !used.has(w.w));
  const freshMade = pool.made.filter((w) => !used.has(w.w));
  const n = open ? open.answers.length + 1 : 1;
  let word;
  let real = true;
  if (n === 3) { word = freshMade[0]; real = false; }
  if (!word) { word = freshReal[0]; real = true; }
  if (!word) { word = freshMade[0]; real = false; }
  if (!word) return null;
  return {
    part: 'B', at, stage, stageId: STAGES[stage].id, n, tie: n === PROBE_ITEMS + 1,
    real, text: word.w, key: real ? makeKey('w', word.w, 'read') : makeKey('n', word.w, 'blend'), word,
  };
}

export function partCWords(content, stage) {
  const all = content?.words ?? [];
  const known = new Map(all.map((w) => [w.w, w]));
  const out = [];
  const seen = new Set();
  const take = ( w, cue) => {
    if (out.length >= PART_C_COUNT || seen.has(w)) return;
    seen.add(w);
    out.push(cue ? { w, cue } : { w });
  };
  for (let s = clampStage(stage); s >= 0 && out.length < PART_C_COUNT; s--) {
    const id = STAGES[s].id;
    const dict = (content?.dictation ?? []).find((d) => d.stage === id);
    const listed = stable((dict?.words ?? []).filter((d) => !known.has(d.w) || known.get(d.w).real !== false), (d) => d.w, `c${s}`);
    for (const d of listed) take(d.w, d.cue);
    const own = stable(all.filter((w) => w.real !== false && w.stage === id), (w) => w.w, `c${s}`)
      .sort((a, b) => Number(a.rare === true) - Number(b.rare === true));
    for (const w of own) take(w.w, undefined);
  }
  return out;
}

export function suggestStage(state, partC) {
  let wrong = 0;
  if (Array.isArray(partC)) wrong = partC.filter((m) => !(m === true || (m && typeof m === 'object' && m.correct === true && m.helped !== true))).length;
  else if (partC && typeof partC.wrong === 'number') wrong = partC.wrong;
  const base = clampStage(state.suggested);
  return wrong >= PART_C_LOWER ? Math.max(0, base - 1) : base;
}

const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function missedGraphemes(partA) {
  const out = [];
  for (const e of Array.isArray(partA) ? partA : []) {
    let id = null;
    let miss = true;
    if (typeof e === 'string') id = e;
    else if (isRecord(e)) {
      id = e.grapheme ?? e.item?.grapheme ?? e.key ?? e.item?.key ?? null;
      miss = !(e.correct === true && e.helped !== true && e.passed !== true);
    }
    if (typeof id !== 'string' || !miss) continue;
    const m = /^g:(.+)#see$/.exec(id);
    const gid = m ? m[1] : id;
    if (graphemeOf(gid) && !out.includes(gid)) out.push(gid);
  }
  return out;
}

function sampleWords(content, below) {
  const pools = poolsOf(content);
  const out = [];
  for (let s = 0; s < below; s++) for (const w of (pools.get(s)?.real ?? []).slice(0, SAMPLE_PER_STAGE)) out.push(w.w);
  return out;
}

export function applyPlacement(profile, settings, states, content, result) {
  const { chosen, partA = [], partC, day, suggested, items } = result;
  const today = typeof day === 'number' && Number.isFinite(day) ? day : (profile?.createdDay ?? 0);
  const stage = clampStage(chosen);
  const wasMap = states instanceof Map;
  const next = new Map(wasMap ? states : Object.entries(states ?? {}));

  for (const id of missedGraphemes(partA)) {
    const key = makeKey('g', id, 'see');
    const { half: _half, was: _was, ...old } = (next.get(key) ?? newItemState(key));
    next.set(key, { ...old, box: 0, due: today, mastered: false });
  }
  for (const w of sampleWords(content, stage)) {
    const key = makeKey('w', w, 'read');
    const old = next.get(key);
    if (old && old.box >= 2) continue;
    const base = old ?? newItemState(key);
    const entry = { day: today, correct: true, helped: false, ms: 0 };
    next.set(key, {
      ...base, key, box: 2, due: today + INTERVALS[2], last: today, mastered: false,
      hist: [...base.hist, entry].slice(-10), days: base.days.includes(today) ? [...base.days] : [...base.days, today],
    });
  }

  const skipped = stage > clampStage(settings?.stage);
  let nextProfile = withPlacement(profile, {
    day: today, items: Array.isArray(items) ? items : [], suggested: clampStage(suggested ?? stage), chosen: stage, applied: true,
    ...(isRecord(partC) && typeof partC.wrong === 'number' ? { partCWrong: partC.wrong } : {}),
  });
  nextProfile = withPointer(nextProfile, today, stage, 'placement');
  for (const land of LANDS) if (!land.locked && land.last < stage) nextProfile = withCrest(nextProfile, { land: land.id, day: today, how: 'placement' });
  if (skipped) nextProfile = withSweep(nextProfile, { from: today, sessionsLeft: SWEEP_SESSIONS });

  return {
    profile: nextProfile,
    settings: { ...settings, stage },
    states: wasMap ? next : Object.fromEntries(next),
  };
}

export function recordPlacement(profile, placement) {
  return withPlacement(profile, { ...placement, applied: false });
}
