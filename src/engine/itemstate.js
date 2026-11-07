export const INTERVALS = Object.freeze({ 1: 1, 2: 3, 3: 7, 4: 14, 5: 30, 6: 30 });

const MAX_BOX = 6;
export const HIST_LENGTH = 10;
const MASTERY_BOX = 3;
const MASTERY_DAYS = 2;



export function newItemState(key) {
  return { key, box: 0, due: null, last: null, hist: [], days: [], mastered: false };
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isBox = (v) => Number.isInteger(v) && (v) >= 0 && (v) <= MAX_BOX;
const isDay = (v) => v === null || isNumber(v);

export function isItemState(value) {
  return isPlainObject(value) && isBox(value.box) && isDay(value.due) && isDay(value.last)
    && Array.isArray(value.hist) && Array.isArray(value.days) && typeof value.mastered === 'boolean'
    && (!Object.hasOwn(value, 'key') || typeof value.key === 'string')
    && (!Object.hasOwn(value, 'half') || value.half === 0 || value.half === 1)
    && (!Object.hasOwn(value, 'was') || isNumber(value.was));
}

export function normalizeItemState(key, stored) {
  const fresh = newItemState(key);
  return {
    key,
    box: isBox(stored.box) ? stored.box : fresh.box,
    due: isDay(stored.due) ? stored.due : fresh.due,
    last: isDay(stored.last) ? stored.last : fresh.last,
    hist: Array.isArray(stored.hist) ? stored.hist.filter(isPlainObject) : fresh.hist,
    days: Array.isArray(stored.days) ? stored.days.filter(isNumber) : fresh.days,
    mastered: typeof stored.mastered === 'boolean' ? stored.mastered : fresh.mastered,
    ...(stored.half === 1 ? { half: 1 } : {}),
    ...(isNumber(stored.was) ? { was: stored.was } : {}),
  };
}

export function applyResult(state, { day, correct, self = false, helped = false, passed = false, ms = 0 }) {
  if (passed) return { ...state, hist: [...state.hist], days: [...state.days] };
  const good = correct && !helped;
  const halfStep = good && self && state.half !== 1;
  const { was: _moved, half: _pending, ...rest } = state;
  let box;
  if (!good) box = 1;
  else if (halfStep) box = state.box;
  else box = Math.min(state.box + 1, MAX_BOX);
  const days = good && !state.days.includes(day) ? [...state.days, day] : [...state.days];
  const entry = { day, correct, helped, ms, ...(good && self ? { self: true } : {}) };
  return {
    ...rest,
    box,
    due: day + (good ? INTERVALS[Math.max(box, 1)] : 1),
    last: day,
    hist: [...state.hist, entry].slice(-HIST_LENGTH),
    days,
    mastered: box >= MASTERY_BOX && days.length >= MASTERY_DAYS,
    ...(halfStep ? { half: 1 } : {}),
  };
}

export function isDue(state, day) {
  return state.due !== null && state.due <= day;
}

export function isOverdue(state, day) {
  return isDue(state, day) && (state.was ?? (state.due)) < day;
}
