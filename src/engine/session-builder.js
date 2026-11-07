import { createRng } from '../core/rng.js';
import { drillDeck, graphemeOf, spellingsOf } from '../curriculum/graphemes.js';
import { phonemeCodes } from '../curriculum/phonemes.js';
import { LANDS, STAGES, stageIndex } from '../curriculum/stages.js';
import { bridgeAllowance } from './dose.js';
import { isDue, isOverdue } from './itemstate.js';
import { parseKey } from './keys.js';
import { stageStatus, stalls as stalledKinds } from './mastery.js';
import { waitingPasses } from './passes.js';
import { errorsIn } from './tricky-pairs.js';


export const MAX_GAP_DAYS = 21;
export const FORCE_AFTER_DAYS = MAX_GAP_DAYS - 3;
export const MAX_FORCED = 4;
export const SWEEP_GRAPHEMES = 6;
export const STALL_EXTRA = 4;
export const OVERDUE_CAP = 0.3;
export const OVERDUE_MIN_KEEP = 4;
export const BACK_GAP_DAYS = 3;
export const TRICKY_DAYS = 14;
const LAST_TEACHABLE = 27;

const COUNTS = Object.freeze({
  see: [6, 4], hear: [4, 2], blend: [4, 3], clansort: [6, 4], trickster: [2, 1], words: [4, 3],
});
const MINUTES = Object.freeze({
  soundcheck: 3, discoveryFull: 2.5, discoveryRecap: 0.5, bridge: 3.5, break: 0.75, clansort: 1.5, trickster: 1.5, wordbook: 3.5, storypage: 3,
});
const FOCUS_MIN_AT_20 = 8;
const FOCUS_MIN_FLOOR = 6;
const FOCUS_WORDS = 2;
export const STAGE_0_INTRO_SESSIONS = 2;
const PREVIEW = 4;
const PREVIEW_STAGE_0 = 6;

const half = (x) => Math.floor(x + 0.5);

export const scaleCount = (count20, minimum, m) => Math.max(minimum, half((count20 * m) / 20));

const budgetMs = (x, m) => Math.round((x * 60000 * m) / 20);


function toMap(states) {
  if (states instanceof Map) return new Map(states);
  if (Array.isArray(states)) return new Map(states.filter((s) => s && typeof s.key === 'string').map((s) => [s.key, s]));
  if (states && typeof states === 'object') return new Map(Object.entries(states));
  return new Map();
}

const uniq = (list) => [...new Set(list)];

const dueOf = (s) => s.was ?? s.due ?? 0;

const byDue = (map) => (a, b) => (dueOf( (map.get(a))) - dueOf( (map.get(b)))) || (a < b ? -1 : a > b ? 1 : 0);

function spread(focus, known) {
  const total = focus.length + known.length;
  const out = [];
  let f = 0;
  let k = 0;
  for (let i = 0; i < total; i++) {
    const takeFocus = f < focus.length && (k >= known.length || Math.floor(((i + 1) * focus.length) / total) > Math.floor((i * focus.length) / total));
    out.push(takeFocus ? focus[f++] : known[k++]);
  }
  return out;
}


export function respreadOverdue(states, day, { cap = OVERDUE_CAP, minKeep = OVERDUE_MIN_KEEP, inScope = () => true } = {}) {
  const map = toMap(states);
  const overdue = [...map].filter(([key, s]) => s && isOverdue(s, day) && inScope(key)).map(([key]) => key);
  const keep = Math.max(minKeep, Math.floor(overdue.length * cap));
  if (overdue.length <= Math.max(keep, minKeep * 2)) return { states: map, moved: [] };
  overdue.sort(byDue(map));
  const perDay = Math.max(minKeep, keep);
  const moved = overdue.slice(keep).map((key, i) => {
    const s = (map.get(key));
    return { ...s, was: dueOf(s), due: day + 1 + Math.floor(i / perDay) };
  });
  for (const s of moved) map.set(s.key, s);
  return { states: map, moved };
}

export function isFirstDayBack(profile, states, day) {
  const days = (Array.isArray(profile?.sessions) ? profile.sessions : []).map((s) => s?.day).filter(Number.isFinite);
  if (days.length === 0) for (const s of states.values()) if (Number.isFinite(s?.last)) days.push(s.last);
  if (days.length === 0) return false;
  return day - Math.max(...days) >= BACK_GAP_DAYS;
}



const baseOf = (key) => key.slice(0, key.lastIndexOf('#'));

function makeCtx(content, states, profile, settings, day, m, rng, ptr) {
  const stage = STAGES[ptr];
  const land = (LANDS.find((l) => l.id === stage.land));
  const stageIdxCache = new Map();
  const idxOf = ( id) => {
    if (!stageIdxCache.has(id)) stageIdxCache.set(id, stageIndex(id));
    return stageIdxCache.get(id);
  };
  const allWords = Array.isArray(content.words) ? content.words : [];
  const byWord = content.byWord instanceof Map ? content.byWord : new Map(allWords.map((r) => [r.w, r]));
  const words = allWords.map((rec) => ({ rec, idx: idxOf(rec.stage) })).filter((x) => x.idx >= 0 && x.idx <= ptr);

  const sylls = new Map();
  const addSyl = ( s, type, idx) => {
    if (typeof s !== 'string' || s === '' || idx < 0 || idx > ptr) return;
    const old = sylls.get(s);
    if (!old || idx < old.idx) sylls.set(s, { s, type, idx });
  };
  for (const { rec, idx } of words) {
    if (Array.isArray(rec.parts) && Array.isArray(rec.types) && rec.parts.length === rec.types.length) rec.parts.forEach((p, i) => addSyl(p, rec.types[i], idx));
  }
  for (const r of Array.isArray(content.syllables) ? content.syllables : []) addSyl(r.s, r.type, idxOf(r.stage));

  const reds = (Array.isArray(content.red) ? content.red : []).filter((r) => r.drill === true && idxOf(r.stage) >= 0 && idxOf(r.stage) <= ptr);
  const redByWord = new Map((Array.isArray(content.red) ? content.red : []).map((r) => [r.w, r]));

  const errorCount = new Map();
  for (const e of errorsIn(profile.errors, day - (TRICKY_DAYS - 1), day)) {
    const p = parseKey(e.key);
    if (p) errorCount.set(`${p.prefix}:${p.id}`, (errorCount.get(`${p.prefix}:${p.id}`) ?? 0) + 1);
  }

  const scope = (key) => {
    const p = parseKey(key);
    if (!p) return -1;
    let idx = -1;
    switch (p.prefix) {
      case 'g': { const g = graphemeOf(p.id); idx = g && g.card !== false ? g.stage : -1; break; }
      case 'w': { const r = byWord.get(p.id); idx = r ? idxOf(r.stage) : -1; break; }
      case 'n': { const r = byWord.get(p.id); idx = r && !r.real ? idxOf(r.stage) : (sylls.get(p.id)?.idx ?? -1); break; }
      case 'y': idx = sylls.get(p.id)?.idx ?? -1; break;
      case 'r': { const r = redByWord.get(p.id); idx = r ? idxOf(r.stage) : -1; break; }
      default: idx = -1;
    }
    return idx >= 0 && idx <= ptr ? idx : -1;
  };

  const weight = (key) => 1 + (errorCount.get(baseOf(key)) ?? 0);
  const weightedOrder = (keys) => keys.map((k) => ({ k, v: Math.pow(rng.next(), 1 / weight(k)) })).sort((a, b) => b.v - a.v).map((x) => x.k);

  const ranked = (keys, { unseenFirst = false } = {}) => {
    const unseen = []; const due = []; const tricky = []; const rest = [];
    for (const k of uniq(keys)) {
      const s = states.get(k);
      if (!s || s.last == null) unseen.push(k);
      else if (isDue(s, day)) due.push(k);
      else if (weight(k) > 1) tricky.push(k);
      else rest.push(k);
    }
    due.sort(byDue(states));
    const u = rng.shuffle(unseen); const t = weightedOrder(tricky); const r = rng.shuffle(rest);
    return unseenFirst ? [...u, ...due, ...t, ...r] : [...due, ...t, ...r, ...u];
  };

  return {
    content, profile, settings, day, m, rng, ptr, stage, land, terms: settings.terms === 'classroom' ? 'classroom' : 'story',
    states, byWord, words, sylls, reds, errorCount, scope, st: (k) => states.get(k), ranked,
  };
}

function makeItem(c, key, focus, data) {
  const s = c.states.get(key);
  const isNew = !s || s.last == null;
  return { key, mode: (parseKey(key)).mode, isNew, isReview: !isNew, focus, data };
}


function passTarget({ id, mode }) {
  const p = parseKey(`${id}#${mode}`);
  if (!p) return null;
  const id2 = `${p.prefix}:${p.id}`;
  switch (p.prefix) {
    case 'g': return { owner: 'soundcheck', key: `${id2}#${p.mode === 'hear' ? 'hear' : 'see'}` };
    case 'n': return { owner: 'soundcheck', key: `${id2}#blend` };
    case 'y': return { owner: 'clansort', key: `${id2}#sort` };
    case 'r': return p.mode === 'write' ? { owner: 'wordbook', key: `${id2}#write` } : { owner: 'trickster', key: `${id2}#read` };
    case 'w': return p.mode === 'write' ? { owner: 'wordbook', key: `${id2}#write` } : { owner: 'bridge', key: `${id2}#divide` };
    default: return null;
  }
}

function headPasses(c, owner, n, mode) {
  const limit = n >= 2 ? Math.max(1, Math.floor(n / 3)) : 0;
  const keys = [];
  for (const rec of waitingPasses(c.profile, c.day)) {
    const t = passTarget(rec);
    if (!t || t.owner !== owner || (mode && parseKey(t.key)?.mode !== mode) || c.scope(t.key) < 0) continue;
    keys.push(t.key);
  }
  return uniq(keys).slice(0, limit);
}


function soundcheckItems(c, stalled, sweep) {
  const { ptr, m, day } = c;
  const deck = drillDeck(ptr);
  const own = deck.filter((e) => e.stage === ptr);
  const older = deck.filter((e) => e.stage < ptr);
  const seeKey = ( id) => `g:${id}#see`;
  const hearKey = ( id) => `g:${id}#hear`;

  const nSee = scaleCount(...( (COUNTS.see)), m);
  const nHear = scaleCount(...( (COUNTS.hear)), m);
  let nBlend = scaleCount(...( (COUNTS.blend)), m);
  if (ptr === 0) nBlend += Math.max(2, half((3 * m) / 20));

  const madeUp = c.words.filter((x) => !x.rec.real);
  const ownWords = madeUp.filter((x) => x.idx === ptr).map((x) => x.rec.w);
  const ownSylls = uniq([
    ...(Array.isArray(c.content.syllables) ? c.content.syllables : []).filter((r) => r.stage === c.stage.id).map((r) => r.s),
    ...madeUp.filter((x) => x.idx === ptr && x.rec.parts.length > 1).flatMap((x) => x.rec.parts),
  ]).filter((s) => !c.byWord.has(s));
  const patterns = new Set(c.stage.patterns);
  const mates = madeUp.filter((x) => x.idx < ptr && patterns.has(x.rec.pattern)).map((x) => x.rec.w);
  const ownBlend = uniq([...ownWords, ...ownSylls]);
  const allOwnBlend = uniq([...ownBlend, ...mates]);
  const blendKey = ( w) => `n:${w}#blend`;

  const unseenOwn = ptr === 0 ? own.filter((e) => c.st(seeKey(e.id))?.last == null).length : 0;
  const introSee = ptr === 0 ? Math.min(unseenOwn, Math.ceil(own.length / STAGE_0_INTRO_SESSIONS)) : 0;
  const capSee = own.length ? Math.max(Math.ceil((nSee * 2) / 3), introSee) : 0;
  const capHear = own.length ? Math.ceil((nHear * 2) / 3) : 0;
  let fSee = Math.min(own.length, capSee);
  let fHear = Math.min(own.length, capHear);
  let fBlend = Math.min(ownBlend.length, nBlend);
  const focusMin = Math.max(FOCUS_MIN_FLOOR, half((FOCUS_MIN_AT_20 * m) / 20));
  let short = focusMin - (fSee + fHear + fBlend);
  if (short > 0) { const add = Math.min(short, allOwnBlend.length - fBlend); fBlend += add; short -= add; }
  if (short > 0) { const add = Math.min(short, own.length - fSee); fSee += add; short -= add; }
  if (short > 0) { const add = Math.min(short, own.length - fHear); fHear += add; short -= add; }

  const ownSeeOrder = c.ranked(own.map((e) => seeKey(e.id)), { unseenFirst: true });
  const ownHearOrder = c.ranked(own.map((e) => hearKey(e.id)), { unseenFirst: true });
  const ownBlendOrder = c.ranked(ownBlend.map(blendKey), { unseenFirst: true });
  const mateOrder = c.ranked(mates.filter((w) => !ownBlend.includes(w)).map(blendKey), { unseenFirst: true });
  const blendFocusOrder = [...ownBlendOrder, ...mateOrder];

  const focusSee = ownSeeOrder.slice(0, fSee);
  const focusHear = ownHearOrder.slice(0, fHear);
  const focusBlend = blendFocusOrder.slice(0, fBlend);
  if (stalled) {
    let extra = STALL_EXTRA;
    for (const [list, pool] of [[focusSee, ownSeeOrder], [focusHear, ownHearOrder], [focusBlend, blendFocusOrder]]) {
      for (const k of pool) { if (extra === 0) break; if (!list.includes(k)) { list.push(k); extra--; } }
    }
  }

  let rSee = Math.max(0, nSee - focusSee.length);
  let rHear = Math.max(0, nHear - focusHear.length);
  const rBlend = Math.max(0, nBlend - focusBlend.length);
  let over = Math.max(0, focusBlend.length - nBlend);
  const trimSee = Math.min(over, rSee, Math.max(0, focusSee.length + rSee - COUNTS.see[1])); rSee -= trimSee; over -= trimSee;
  const trimHear = Math.min(over, rHear, Math.max(0, focusHear.length + rHear - COUNTS.hear[1])); rHear -= trimHear;

  const lastSeen = ( id) => Math.max(c.st(seeKey(id))?.last ?? -Infinity, c.st(hearKey(id))?.last ?? -Infinity);
  const chosenSee = new Set(focusSee.map((k) => (parseKey(k)?.id)));
  const forced = deck
    .filter((e) => !chosenSee.has(e.id) && Number.isFinite(lastSeen(e.id)) && day - lastSeen(e.id) >= FORCE_AFTER_DAYS)
    .sort((a, b) => lastSeen(a.id) - lastSeen(b.id) || (a.id < b.id ? -1 : 1))
    .slice(0, MAX_FORCED).map((e) => seeKey(e.id));

  const forcedIds = new Set(forced.map((k) => parseKey(k)?.id));
  const sweepItems = sweep
    ? c.rng.shuffle(older.filter((e) => !forcedIds.has(e.id) && !Number.isFinite(lastSeen(e.id))).map((e) => seeKey(e.id))).slice(0, SWEEP_GRAPHEMES)
    : [];

  const used = new Set([...chosenSee, ...forcedIds, ...sweepItems.map((k) => parseKey(k)?.id)]);
  const reviewSeeOrder = c.ranked(older.filter((e) => !used.has(e.id)).map((e) => seeKey(e.id)));
  const reviewSee = reviewSeeOrder.slice(0, rSee);
  const seeIds = new Set([...used, ...reviewSee.map((k) => parseKey(k)?.id)]);
  const hearPool = older.filter((e) => !focusHear.includes(hearKey(e.id))).map((e) => hearKey(e.id));
  const hearRanked = c.ranked(hearPool);
  const reviewHear = [...hearRanked.filter((k) => !seeIds.has(parseKey(k)?.id)), ...hearRanked.filter((k) => seeIds.has(parseKey(k)?.id))].slice(0, rHear);
  const reviewBlend = c.ranked(madeUp.filter((x) => x.idx < ptr && !mates.includes(x.rec.w)).map((x) => blendKey(x.rec.w))).slice(0, rBlend);

  const part = ( focusKeys, knownKeys, n, mode) => {
    const passes = headPasses(c, 'soundcheck', n, mode).filter((k) => !focusKeys.includes(k));
    const known = uniq(knownKeys).filter((k) => !focusKeys.includes(k));
    const covered = known.filter((k) => passes.includes(k)).length;
    const kept = known.filter((k) => !passes.includes(k));
    return { passes, focusKeys, known: kept.slice(0, Math.max(0, kept.length - (passes.length - covered))) };
  };
  const seePart = part(focusSee, [...forced, ...sweepItems, ...reviewSee], nSee, 'see');
  const hearPart = part(focusHear, reviewHear, nHear, 'hear');
  const blendPart = part(focusBlend, reviewBlend, nBlend, 'blend');

  const focusSet = new Set([...focusSee, ...focusHear, ...focusBlend]);
  const toItem = ( key) => {
    const p = (parseKey(key));
    if (p.prefix === 'n') return makeItem(c, key, focusSet.has(key), { part: 'blend', word: p.id });
    const g = (graphemeOf(p.id));
    const data = p.mode === 'hear'
      ? { part: 'hear', grapheme: p.id, expected: (() => { const s = spellingsOf(g.p, ptr); return s.length ? s : [p.id]; })() }
      : { part: 'see', grapheme: p.id, expected: phonemeCodes(g.p) };
    return makeItem(c, key, focusSet.has(key), data);
  };
  const assemble = ( x) =>
    [...x.passes, ...spread(x.focusKeys, x.known)].map(toItem);
  return [...assemble(seePart), ...assemble(hearPart), ...assemble(blendPart)];
}

function discoveryStep(c, stalledMarkers) {
  const seen = new Set(Array.isArray(c.profile.discoverySeen) ? c.profile.discoverySeen : []);
  const d = c.content.discovery?.[c.stage.id];
  const full = !seen.has(c.stage.id) || stalledMarkers.some((x) => !seen.has(x));
  if (!d || typeof d !== 'object') return { items: [], recap: !full, markSeen: [] };
  if (full) {
    const panels = Array.isArray(d.panels) ? d.panels : [];
    const tryWords = (Array.isArray(d.try) ? d.try : []).map((w) => c.byWord.get(w)).filter(Boolean);
    if (panels.length === 0 && tryWords.length === 0) return { items: [], recap: false, markSeen: [] };
    return {
      items: [makeItem(c, `d:${c.stage.id}#panels`, false, { panels, try: tryWords })],
      recap: false,
      markSeen: [c.stage.id, ...stalledMarkers],
    };
  }
  if (typeof d.recap !== 'string') return { items: [], recap: true, markSeen: [] };
  return { items: [makeItem(c, `d:${c.stage.id}#recap`, false, { recap: true, line: d.recap })], recap: true, markSeen: [] };
}

function bridgeItems(c, dose, stalled, sweep) {
  const { ptr } = c;
  const key = ( w) => `w:${w}#divide`;
  const real = c.words.filter((x) => x.rec.real);
  const cur = real.filter((x) => x.idx === ptr).map((x) => key(x.rec.w));
  const earlier = real.filter((x) => x.idx < ptr).map((x) => key(x.rec.w));
  const madeAll = c.words.filter((x) => !x.rec.real);
  const madeOwn = madeAll.filter((x) => x.idx === ptr).map((x) => key(x.rec.w));
  const madeAny = madeAll.sort((a, b) => b.idx - a.idx).map((x) => key(x.rec.w));
  const n = dose.words;
  const taper = n < 4;
  const nCur = taper ? 2 : half(n / 2);

  const picked = [];
  const take = ( list, count) => {
    for (const k of list) { if (count <= 0) break; if (!picked.includes(k)) { picked.push(k); count--; } }
  };
  take(c.ranked(cur, { unseenFirst: true }), nCur);
  if (taper) {
    take(c.ranked(earlier), n - nCur);
    take(c.ranked([...cur, ...earlier]), n - picked.length);
  } else {
    take(c.ranked(earlier), 1);
    take(c.ranked(madeOwn.length ? madeOwn : madeAny), 1);
    const dueNow = [...cur, ...earlier].filter((k) => { const s = c.st(k); return s && s.last != null && isDue(s, c.day) && !picked.includes(k); });
    take(c.ranked(dueNow), n - picked.length);
  }
  take(c.ranked([...cur, ...earlier], { unseenFirst: true }), n - picked.length);
  take(c.ranked(madeAny), n - picked.length);

  const passes = headPasses(c, 'bridge', n);
  const curSet = new Set(cur);
  const base = picked.filter((k) => !passes.includes(k));
  let drop = base.length + passes.length - n;
  for (let i = base.length - 1; i >= 0 && drop > 0; i--) if (!curSet.has(base[i])) { base.splice(i, 1); drop--; }
  for (let i = base.length - 1; i >= 0 && drop > 0; i--) { base.splice(i, 1); drop--; }
  let list = [...passes, ...base];

  const extras = [];
  if (stalled) extras.push(...c.ranked(cur.filter((k) => !list.includes(k)), { unseenFirst: true }).slice(0, STALL_EXTRA));
  if (sweep) {
    const fresh = real.filter((x) => x.idx < ptr).map((x) => key(x.rec.w)).filter((k) => !list.includes(k) && !c.st(k) && !c.st(`w:${parseKey(k)?.id}#read`));
    if (fresh.length) extras.push(c.rng.pick(fresh));
  }
  list = uniq([...list, ...extras]);

  const focusList = list.filter((k) => curSet.has(k));
  const otherList = list.filter((k) => !curSet.has(k));
  const ordered = [...list.filter((k) => passes.includes(k)), ...spread(focusList.filter((k) => !passes.includes(k)), otherList.filter((k) => !passes.includes(k)))];
  const items = ordered.map((k) => {
    const w = (parseKey(k)?.id);
    return makeItem(c, k, curSet.has(k), { word: w });
  });
  const scale = items.length / Math.max(1, dose.words);
  return { items, allowance: { words: items.length, softMs: Math.round(dose.softMs * scale) } };
}

function clansortItems(c) {
  const n = scaleCount(...( (COUNTS.clansort)), c.m);
  const curType = c.land.type;
  const key = ( s) => `y:${s}#sort`;
  const all = [...c.sylls.values()];
  const typeOf = ( k) => c.sylls.get( (parseKey(k)?.id))?.type;
  const keysOf = ( f) => all.filter(f).map((x) => key(x.s));
  const picked = c.ranked(keysOf((x) => x.idx === c.ptr && x.type === curType), { unseenFirst: true }).slice(0, 2);
  const take = ( list, count) => {
    for (const k of list) { if (count <= 0) break; if (!picked.includes(k)) { picked.push(k); count--; } }
  };
  take(c.ranked(keysOf((x) => x.type === curType), { unseenFirst: true }), 2 - picked.length);
  const passes = headPasses(c, 'clansort', n).filter((k) => c.sylls.has( (parseKey(k)?.id)));
  if (new Set(picked.map(typeOf)).size < 2) take(c.ranked(keysOf((x) => x.type !== curType)), 1);
  take(c.ranked(keysOf(() => true), { unseenFirst: true }), n - picked.length - passes.length);
  const rest = picked.filter((k) => !passes.includes(k)).slice(0, n - passes.length);
  const list = [...passes, ...c.rng.shuffle(rest)];
  const banners = LANDS.filter((l) => !l.locked && l.n <= c.land.n).map((l) => l.id);
  return list.map((k) => {
    const s = (c.sylls.get( (parseKey(k)?.id)));
    return makeItem(c, k, false, { syllable: { s: s.s, type: s.type }, banners });
  });
}

function tricksterItems(c) {
  const n = scaleCount(...( (COUNTS.trickster)), c.m);
  const key = ( w) => `r:${w}#read`;
  const ownNew = c.reds.filter((r) => r.stage === c.stage.id && c.st(key(r.w))?.last == null).map((r) => key(r.w));
  const passes = headPasses(c, 'trickster', n).filter((k) => c.reds.some((r) => key(r.w) === k));
  const picked = [...passes];
  const take = ( list) => { for (const k of list) { if (picked.length >= n) break; if (!picked.includes(k)) picked.push(k); } };
  take(c.rng.shuffle(ownNew));
  take(c.ranked(c.reds.map((r) => key(r.w)).filter((k) => !picked.includes(k))));
  return picked.map((k) => makeItem(c, k, false, { red: (parseKey(k)?.id) }));
}

function wordbookItems(c, stalled) {
  const nWords = scaleCount(...( (COUNTS.words)), c.m);
  const dict = Array.isArray(c.content.dictation) ? c.content.dictation : [];
  const entry = dict.find((d) => d.stage === c.stage.id);
  const cueOf = new Map();
  for (const d of dict) for (const w of d.words ?? []) if (w.cue) cueOf.set(w.w, w.cue);
  const key = ( w) => `w:${w}#write`;

  const ownWords = (entry?.words?.length ? entry.words.map(( x) => x.w) : c.words.filter((x) => x.rec.real && x.idx === c.ptr).map((x) => x.rec.w))
    .filter((w) => c.byWord.has(w) || entry);
  const ownKeys = uniq(ownWords.map(key));
  const passes = headPasses(c, 'wordbook', nWords);
  const focus = [];
  const takeFocus = ( list, count) => {
    for (const k of list) { if (count <= 0) break; if (!focus.includes(k) && !passes.includes(k)) { focus.push(k); count--; } }
  };
  const focusOrder = c.ranked(ownKeys, { unseenFirst: true });
  takeFocus(focusOrder, FOCUS_WORDS);
  if (stalled) takeFocus(focusOrder, STALL_EXTRA);

  const room = Math.max(0, nWords - FOCUS_WORDS - passes.length);
  const reviewKeys = [];
  for (const [k, s] of c.states) {
    const p = parseKey(k);
    if (p && p.mode === 'write' && (p.prefix === 'w' || p.prefix === 'r') && s.last != null && c.scope(k) >= 0 && !focus.includes(k) && !passes.includes(k)) reviewKeys.push(k);
  }
  const review = c.ranked(reviewKeys).slice(0, room);
  if (review.length < room) {
    const older = uniq([
      ...dict.filter((d) => stageIndex(d.stage) >= 0 && stageIndex(d.stage) < c.ptr).flatMap((d) => d.words.map(( x) => key(x.w))),
      ...c.words.filter((x) => x.rec.real && x.idx < c.ptr).map((x) => key(x.rec.w)),
    ]).filter((k) => !review.includes(k) && !focus.includes(k) && !passes.includes(k) && c.scope(k) >= 0);
    review.push(...c.ranked(older).slice(0, room - review.length));
  }

  const words = [...passes, ...spread(focus, review)].map((k) => {
    const p = (parseKey(k));
    const cue = cueOf.get(p.id);
    return makeItem(c, k, focus.includes(k), { word: p.id, ...(cue ? { cue } : {}) });
  });

  const sentences = entry?.sentences ?? [];
  const written = (Array.isArray(c.profile.gates) ? c.profile.gates : []).filter((g) => g?.stage === c.stage.id && g.kind === 'write').length;
  const sentence = sentences.length ? sentences[written % sentences.length] : null;
  if (sentence) words.push(makeItem(c, `s:${sentence.id}#write`, true, { sentence: { id: sentence.id, text: sentence.text, targets: [...sentence.targets] } }));
  return words;
}

const sentenceCount = (text) => (String(text).match(/[^.!?]+[.!?]+/g) ?? [String(text)]).length;

function storypageItems(c, stalled) {
  const list = (Array.isArray(c.content.passages) ? c.content.passages : []).filter((p) => p.stage === c.stage.id);
  if (list.length === 0) return [];
  const a = list.find((p) => p.id === `${c.stage.id}.A`) ?? list[0];
  const b = list.find((p) => p.id === `${c.stage.id}.B`) ?? list.find((p) => p !== a) ?? a;
  const ids = new Set(list.map((p) => p.id));
  const log = (Array.isArray(c.profile.passageLog) ? c.profile.passageLog : [])
    .map((e, order) => ({ e, order }))
    .filter(({ e }) => e && ids.has(e.passage))
    .sort((p, q) => (p.e.day - q.e.day) || (p.order - q.order))
    .map(({ e }) => e);
  const last = log.at(-1);
  let passage = a;
  let echo = [];
  if (last) {
    const lastPassage = list.find((p) => p.id === last.passage) ?? a;
    if (last.passed) passage = lastPassage === a ? b : a;
    else { passage = lastPassage; echo = Array.isArray(last.missedSentences) ? [...last.missedSentences] : []; }
  }
  const failedBefore = log.some((e) => e.passage === passage.id && !e.passed);
  if (stalled && failedBefore && echo.length === 0) echo = Array.from({ length: sentenceCount(passage.text) }, (_, i) => i);

  const want = c.ptr === 0 ? PREVIEW_STAGE_0 : stalled ? Math.min(PREVIEW_STAGE_0, Math.max(PREVIEW, (passage.focus ?? []).length)) : PREVIEW;
  const focusWords = uniq(passage.focus ?? []).filter((w) => c.byWord.has(w));
  const readKey = ( w) => `w:${w}#read`;
  const pick = c.ranked(focusWords.map(readKey), { unseenFirst: true }).slice(0, want).map((k) => (parseKey(k)?.id));
  if (pick.length < want) {
    const more = c.words.filter((x) => x.rec.real && x.idx === c.ptr && !pick.includes(x.rec.w)).map((x) => readKey(x.rec.w));
    pick.push(...c.ranked(more, { unseenFirst: true }).slice(0, want - pick.length).map((k) => (parseKey(k)?.id)));
  }
  const preview = pick.map((w) => c.byWord.get(w));
  const item = makeItem(c, `p:${passage.id}#story`, true, { passage: passage.id, preview, echo });
  item.isNew = log.every((e) => e.passage !== passage.id);
  item.isReview = !item.isNew;
  return [item];
}


function makeStep(c, activity, items, ms, { gate, droppable = false, allowance, recap } = {}) {
  const round = { stage: c.stage.id, stageIndex: c.ptr, terms: c.terms, items, ...(allowance ? { allowance } : {}), ...(recap !== undefined ? { recap } : {}) };
  return { activity, items, budgetMs: activity === 'break' || items.length > 0 ? ms : 0, ...(gate ? { gate } : {}), droppable, round };
}

function stallMarker(gates, stageId, kind) {
  const status = (stageStatus(gates, stageId))[kind];
  return `${stageId}!${kind}!${status.passDays.at(-1) ?? 'none'}`;
}

export function buildSession({ content, states, settings, profile, day, rng } = {}) {
  const today = Number.isFinite(day) ? (day) : 0;
  if (!content || !Array.isArray(content.words)) {
    return {
      day: today, stage: STAGES[0].id, stageIndex: 0, minutes: 20, steps: [],
      rounds: [
        { activity: 'soundcheck', items: [{ id: 'g:sh', mode: 'see', isNew: false, isReview: false }] },
        { activity: 'bridge', items: [{ id: 'w:cat', mode: 'divide', isNew: false, isReview: false }] },
      ],
    };
  }
  const set = settings ?? {};
  const prof = profile ?? {};
  const ptr = Number.isInteger(set.stage) ? Math.min(LAST_TEACHABLE, Math.max(0, (set.stage))) : 0;
  const m = Number.isFinite(set.sessionMinutes) && set.sessionMinutes > 0 ? (set.sessionMinutes) : 20;
  const random = rng ?? createRng(today);

  const rawStates = toMap(states);
  let working = rawStates;
  let respread = [];
  const probe = makeCtx(content, rawStates, prof, set, today, m, random, ptr);
  if (isFirstDayBack(prof, rawStates, today)) {
    const result = respreadOverdue(rawStates, today, { inScope: (k) => probe.scope(k) >= 0 });
    working = result.states;
    respread = result.moved;
  }
  const c = respread.length ? makeCtx(content, working, prof, set, today, m, random, ptr) : probe;

  const gates = Array.isArray(prof.gates) ? prof.gates : [];
  const stalled = (stalledKinds(gates, c.stage.id));
  const sweep = Boolean(prof.sweep && Number(prof.sweep.sessionsLeft) > 0 && ptr > 0);

  const disc = discoveryStep(c, stalled.map((k) => stallMarker(gates, c.stage.id, k)));
  const sound = soundcheckItems(c, stalled.includes('drill'), sweep);
  const stage0 = ptr === 0;
  const dose = bridgeAllowance(prof, set, c.states, c.land.id, content, m);
  const bridge = stage0 ? { items: [], allowance: { words: 0, softMs: 0 } } : bridgeItems(c, dose, stalled.includes('words'), sweep);
  const clan = clansortItems(c);
  const trick = tricksterItems(c);
  const book = wordbookItems(c, stalled.includes('write'));
  const story = storypageItems(c, stalled.includes('story'));

  const full = budgetMs(MINUTES.bridge, m);
  const bridgeMs = stage0 ? 0 : Math.min(full, dose.softMs);
  const freed = full - bridgeMs;
  const firstShare = Math.round(freed / 2);
  const ms = {
    soundcheck: budgetMs(MINUTES.soundcheck, m) + (stage0 ? firstShare : 0),
    discovery: budgetMs(disc.recap ? MINUTES.discoveryRecap : MINUTES.discoveryFull, m),
    wordbook: budgetMs(MINUTES.wordbook, m) + (stage0 ? 0 : firstShare),
    storypage: budgetMs(MINUTES.storypage, m) + (freed - firstShare),
  };
  const brk = () => makeStep(c, 'break', [], budgetMs(MINUTES.break, m));

  const steps = [
    makeStep(c, 'soundcheck', sound, ms.soundcheck, { gate: 'drill' }),
    makeStep(c, 'discovery', disc.items, ms.discovery, { recap: disc.recap }),
    ...(stage0 ? [] : [makeStep(c, 'bridge', bridge.items, bridgeMs, { gate: 'words', allowance: bridge.allowance })]),
    ...(stage0 ? [makeStep(c, 'clansort', clan, budgetMs(MINUTES.clansort, m), { droppable: true }), brk(), makeStep(c, 'trickster', trick, budgetMs(MINUTES.trickster, m), { droppable: true }),
      makeStep(c, 'wordbook', book, ms.wordbook, { gate: 'write' }), brk()]
      : [brk(), makeStep(c, 'clansort', clan, budgetMs(MINUTES.clansort, m), { droppable: true }), makeStep(c, 'trickster', trick, budgetMs(MINUTES.trickster, m), { droppable: true }),
        brk(), makeStep(c, 'wordbook', book, ms.wordbook, { gate: 'write' })]),
    makeStep(c, 'storypage', story, ms.storypage, { gate: 'story' }),
  ];

  const plan = {
    day: today, stage: c.stage.id, stageIndex: ptr, minutes: m, steps,
    markSeen: disc.markSeen, stalls: stalled, sweep, recap: disc.recap, respread,
  };
  return withLegacyRounds(plan);
}

function withLegacyRounds(plan) {
  const rounds = plan.steps.filter((s) => s.activity !== 'break' && s.items.length > 0).map((s) => ({
    activity: s.activity,
    items: s.items.map((i) => ({ id: i.key.slice(0, i.key.lastIndexOf('#')), mode: i.mode, isNew: i.isNew, isReview: i.isReview })),
  }));
  Object.defineProperty(plan, 'rounds', { value: rounds, enumerable: false, writable: true, configurable: true });
  return plan;
}


export function lessonGroups(plan) {
  return (Array.isArray(plan?.steps) ? plan.steps : []).filter((s) => s.activity !== 'break' && Array.isArray(s.items) && s.items.length > 0).map((s) => [s]);
}

export function planMinutes(plan) {
  const ms = (Array.isArray(plan?.steps) ? plan.steps : []).reduce((sum, s) => sum + (Number.isFinite(s.budgetMs) ? s.budgetMs : 0), 0);
  return Math.round((ms / 60000) * 1000) / 1000;
}
