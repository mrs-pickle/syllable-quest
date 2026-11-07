import { isComplete } from '../profile/profile.js';

const DAYS_AFTER_SUNDAY = 4;
export const WEEKS_SHOWN = 8;
export const SESSIONS_SHOWN = 20;

export const weekOf = (day) => day - ((((day + DAYS_AFTER_SUNDAY) % 7) + 7) % 7);

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export function minutesByWeek(profile, today) {
  const last = weekOf(today);
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => ({ week: last - (WEEKS_SHOWN - 1 - i) * 7, full: 0, part: 0 }));
  for (const s of Array.isArray(profile?.sessions) ? profile.sessions : []) {
    if (!isNumber(s?.day) || !isNumber(s.minutes)) continue;
    const w = weeks.find((x) => x.week === weekOf(s.day));
    if (!w) continue;
    if (isComplete(s)) w.full += s.minutes;
    else w.part += s.minutes;
  }
  return weeks.map((w) => ({ ...w, full: Math.round(w.full), part: Math.round(w.part) }));
}

export function accuracyBySession(profile) {
  return (Array.isArray(profile?.sessions) ? profile.sessions : [])
    .filter((s) => isNumber(s?.day))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.day - b.s.day || a.i - b.i)
    .slice(-SESSIONS_SHOWN)
    .map(({ s }) => ({ day: s.day, accuracy: isNumber(s.accuracy) ? s.accuracy : null }));
}

const landOf = (word) => (typeof word.land === 'string' ? word.land : typeof word.stage === 'string' && word.stage.includes('.') ? word.stage.slice(0, word.stage.indexOf('.')) : null);

export function masteredByLand(states, content) {
  const mastered = new Set();
  for (const [key, s] of states) if (s?.mastered === true) mastered.add(key.slice(0, key.lastIndexOf('#')));
  const lands = new Map();
  for (const word of content?.words ?? []) {
    const land = word.real === false ? null : landOf(word);
    if (land === null) continue;
    const bar = lands.get(land) ?? { land, mastered: 0, words: 0 };
    bar.words += 1;
    if (mastered.has(`w:${word.w}`)) bar.mastered += 1;
    lands.set(land, bar);
  }
  return [...lands.values()];
}
