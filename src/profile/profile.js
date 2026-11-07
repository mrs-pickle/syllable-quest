import { clampStage } from './settings.js';
import { isPassRecord, normalizePasses } from '../engine/passes.js';



const LISTS = Object.freeze({
  placements: 50, pointerLog: 200, sessions: 2000, gates: 2000, errors: 600, passes: 2000, crests: 20, landmarks: 100,
  pages: 200, passageLog: 500, discoverySeen: 100, storySeen: 400,
});

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export function newProfile(day = 0) {
  return {
    version: 1, createdDay: day, placements: [], pointerLog: [], sessions: [], gates: [], errors: [], passes: [], crests: [],
    landmarks: [], pages: [], passageLog: [], divisionMs: 0, discoverySeen: [], storySeen: [], sweep: null,
  };
}

export const isComplete = (record) => isPlainObject(record) && record.complete !== false;

export function finishedSessions(profile) {
  return (Array.isArray(profile?.sessions) ? profile.sessions : []).filter(isComplete);
}

export const isExtraPractice = (profile, day) => finishedSessions(profile).some((s) => s.day === day);

export function latestAccuracy(profile) {
  const list = Array.isArray(profile?.sessions) ? profile.sessions : [];
  for (let i = list.length - 1; i >= 0; i--) if (isNumber(list[i]?.accuracy)) return list[i].accuracy;
  return null;
}

const isSessionRecord = (s) => isPlainObject(s) && isNumber(s.day)
  && (s.minutes === undefined || isNumber(s.minutes)) && (s.accuracy === undefined || isNumber(s.accuracy))
  && (s.copilot === undefined || typeof s.copilot === 'boolean');

export function isProfileShape(value) {
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(LISTS)) if (Object.hasOwn(value, key) && !Array.isArray(value[key])) return false;
  if (Object.hasOwn(value, 'sessions') && !value.sessions.every(isSessionRecord)) return false;
  if (Object.hasOwn(value, 'passes') && !value.passes.every(isPassRecord)) return false;
  if (Object.hasOwn(value, 'createdDay') && !isNumber(value.createdDay)) return false;
  if (Object.hasOwn(value, 'divisionMs') && !isNumber(value.divisionMs)) return false;
  if (Object.hasOwn(value, 'sweep') && value.sweep !== null && !isPlainObject(value.sweep)) return false;
  return true;
}

const ELEMENT_OK = Object.freeze({
  sessions: isSessionRecord,
  pointerLog: (e) => isPlainObject(e) && isNumber(e.day) && isNumber(e.stage),
  crests: (e) => isPlainObject(e) && typeof e.land === 'string',
  passageLog: (e) => isPlainObject(e) && typeof e.passage === 'string' && isNumber(e.day),
  discoverySeen: (e) => typeof e === 'string',
  storySeen: (e) => typeof e === 'string',
});

export function normalizeProfile(stored, day = 0) {
  const fresh = newProfile(day);
  const r = isPlainObject(stored) ? stored : {};
  const next = { ...fresh };
  for (const [key, kept] of Object.entries(LISTS)) {
    if (!Array.isArray(r[key])) continue;
    if (key === 'passes') continue;
    const list = r[key].filter(ELEMENT_OK[key] ?? isPlainObject);
    next[key] = list.slice(-kept);
  }
  next.passes = normalizePasses(r.passes);
  if (isNumber(r.createdDay)) next.createdDay = r.createdDay;
  if (isNumber(r.divisionMs) && r.divisionMs >= 0) next.divisionMs = r.divisionMs;
  if (isPlainObject(r.sweep) && isNumber(r.sweep.from) && isNumber(r.sweep.sessionsLeft)) next.sweep = { from: r.sweep.from, sessionsLeft: r.sweep.sessionsLeft };
  return (next);
}


function appended(profile, key, entry) {
  const list = Array.isArray(profile?.[key]) ? profile[key] : [];
  return { ...profile, [key]: [...list, entry].slice(-LISTS[key]) };
}

export function withSession(profile, record, { replace = false } = {}) {
  const sessions = Array.isArray(profile?.sessions) ? [...profile.sessions] : [];
  const last = sessions.at(-1);
  if (replace && isPlainObject(last) && last.day === record.day && last.complete === false) {
    sessions[sessions.length - 1] = { ...record };
    return { ...profile, sessions };
  }
  return appended(profile, 'sessions', { ...record });
}

export function withPointer(profile, day, stage, why = 'auto') {
  const entry = { day, stage: clampStage(stage), why: typeof why === 'string' && why !== '' ? why : 'auto' };
  const last = Array.isArray(profile?.pointerLog) ? profile.pointerLog.at(-1) : undefined;
  if (isPlainObject(last) && last.day === entry.day && last.stage === entry.stage && last.why === entry.why) return { ...profile };
  return appended(profile, 'pointerLog', entry);
}

export function withPage(profile, page) {
  const pages = Array.isArray(profile?.pages) ? profile.pages : [];
  if (pages.some((p) => isPlainObject(p) && p.id === page.id)) return { ...profile };
  return appended(profile, 'pages', { ...page });
}

const CREST_HOW = Object.freeze(['mastered', 'placement']);

export function withCrest(profile, { land, day, how }) {
  const crests = Array.isArray(profile?.crests) ? profile.crests : [];
  if (crests.some((c) => isPlainObject(c) && c.land === land)) return { ...profile };
  return appended(profile, 'crests', { land, day, how: CREST_HOW.includes(how) ? how : 'mastered' });
}

export function withLandmark(profile, { stage, day }) {
  const landmarks = Array.isArray(profile?.landmarks) ? profile.landmarks : [];
  if (landmarks.some((l) => isPlainObject(l) && l.stage === stage)) return { ...profile };
  return appended(profile, 'landmarks', { stage, day });
}

export function withPlacement(profile, placement) {
  return appended(profile, 'placements', { ...placement, items: Array.isArray(placement.items) ? [...placement.items] : [] });
}

export function withPassageResult(profile, { passage, day, passed, missedSentences = [] }) {
  return appended(profile, 'passageLog', { passage, day, passed: passed === true, missedSentences: [...missedSentences] });
}

export function withSweep(profile, sweep) {
  const live = sweep !== null && isPlainObject(sweep) && isNumber(sweep.from) && isNumber(sweep.sessionsLeft) && sweep.sessionsLeft > 0;
  return { ...profile, sweep: live ? { from: sweep.from, sessionsLeft: Math.floor(sweep.sessionsLeft) } : null };
}
