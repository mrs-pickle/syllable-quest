import { parseKey } from './keys.js';


export const PASS_BACK_MAX = 5;
const KEPT_MAX = 200;
const HOWS = Object.freeze(['right', 'helped', 'missed', 'self', 'passed']);
export const REVIEW_ORDER = Object.freeze(['soundcheck', 'bridge', 'clansort', 'trickster']);




const isDayOrNull = (v) => v === null || Number.isFinite(v);

export function isPassRecord(value) {
  return value !== null && typeof value === 'object'
    && typeof value.id === 'string' && value.id !== ''
    && typeof value.mode === 'string' && value.mode !== ''
    && Number.isFinite(value.day)
    && Number.isInteger(value.times) && value.times >= 1
    && isDayOrNull(value.back) && isDayOrNull(value.closed)
    && (value.how === null || HOWS.includes(value.how));
}

const keyOf = ({ id, mode }) => `${id}#${mode}`;

function trimmed(list) {
  const kept = [...list];
  while (kept.length > KEPT_MAX) kept.splice(Math.max(0, kept.findIndex((r) => r.closed !== null)), 1);
  return kept;
}

export function normalizePasses(list) {
  if (!Array.isArray(list)) return [];
  const one = new Map();
  for (const record of list.filter(isPassRecord)) {
    one.delete(keyOf(record));
    one.set(keyOf(record), record);
  }
  return trimmed([...one.values()].sort((a, b) => a.day - b.day));
}

const passesOf = (profile) => (Array.isArray(profile.passes) ? profile.passes : []);

function changed(profile, id, mode, change) {
  const list = passesOf(profile);
  const old = list.find((r) => r.id === id && r.mode === mode);
  const next = old && change(old);
  return next === old ? profile : { ...profile, passes: list.map((r) => (r === old ? next : r)) };
}

export function withPass(profile, id, mode, day) {
  const list = passesOf(profile);
  const old = list.find((r) => r.id === id && r.mode === mode);
  if (!old) return { ...profile, passes: trimmed([...list, { id, mode, day, times: 1, back: null, how: null, closed: null }]) };
  if (old.day === day) return changed(profile, id, mode, (r) => (r.back === day && r.how !== 'passed' ? { ...r, how: 'passed' } : r));
  return { ...profile, passes: [...list.filter((r) => r !== old), { ...old, day, times: old.times + 1, back: null, how: 'passed', closed: null }] };
}

export function passesToReturn(profile, day, isOpen = () => true) {
  return passesOf(profile).filter((r) => r.day === day && r.closed === null && r.back !== day && isOpen(r)).slice(0, PASS_BACK_MAX)
    .map(({ id, mode }) => ({ id, mode, isNew: false, isReview: false }));
}

export function markedBack(profile, items, day) {
  return items.reduce((next, { id, mode }) => changed(next, id, mode, (r) => (r.back === day ? r : { ...r, back: day })), profile);
}

export const withBackResult = (profile, id, mode, how) => changed(profile, id, mode, (r) => (r.how === how ? r : { ...r, how }));

export const waitingPasses = (profile, day) => passesOf(profile).filter((r) => r.closed === null && r.day < day).sort((a, b) => a.day - b.day);

export const closedPass = (profile, id, mode, day, how) => changed(profile, id, mode, (r) => (r.closed === null && r.day < day ? { ...r, closed: day, how } : r));

export const reopenedPass = (profile, id, mode, day) => changed(profile, id, mode, (r) => (r.closed === day ? { ...r, closed: null } : r));

export function howOf(answer, options) {
  if (options?.scored === false) return 'self';
  if (answer.helped) return 'helped';
  return answer.correct ? 'right' : 'missed';
}

export function ownerOf(item) {
  const key = typeof item === 'string' ? item : `${item?.id}#${item?.mode}`;
  const parsed = parseKey(key) ?? (typeof item === 'string' ? parseKey(`${item}#_`) : null);
  switch (parsed?.prefix) {
    case 'g': case 'n': return 'soundcheck';
    case 'y': return 'clansort';
    case 'r': return 'trickster';
    default: return 'bridge';
  }
}

export function reviewRounds(items) {
  return REVIEW_ORDER.map((activity) => ({ activity, items: items.filter((item) => ownerOf(item) === activity) }))
    .filter((round) => round.items.length > 0);
}
