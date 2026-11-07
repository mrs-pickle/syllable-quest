import { parseKey } from './keys.js';
import { weekOf } from './dashboard.js';



export const CATEGORIES = Object.freeze({ g: 'sounds', n: 'madeUp', w: 'words', y: 'syllables', r: 'sight' });
const TREND_LENGTH = 10;
export function summarize(states, profile) {
  const mastered = Object.fromEntries(Object.values(CATEGORIES).map((name) => [name, new Set()]));
  const practiced = new Set();
  for (const [key, s] of states) {
    const parsed = parseKey(key);
    const category = parsed && Object.hasOwn(CATEGORIES, parsed.prefix) ? (CATEGORIES)[parsed.prefix] : undefined;
    if (category === undefined || !parsed) continue;
    const id = `${parsed.prefix}:${parsed.id}`;
    if (s.mastered) mastered[category].add(id);
    if (s.last !== null && s.last !== undefined) practiced.add(id);
  }
  const masteredIds = new Set(Object.values(mastered).flatMap((set) => [...set]));

  const sessions = profile.sessions.filter(s => Number.isFinite(s.day)).sort((a, b) => a.day - b.day);
  const minutes = new Map();
  for (const s of sessions) {
    const week = weekOf(s.day);
    minutes.set(week, (minutes.get(week) ?? 0) + (Number.isFinite(s.minutes) ? s.minutes : 0));
  }

  const latest = sessions.filter(s => Number.isFinite(s.accuracy)).slice(-TREND_LENGTH);
  return {
    mastered: Object.fromEntries(Object.entries(mastered).map(([name, set]) => [name, set.size])),
    learning: [...practiced].filter(id => !masteredIds.has(id)).length,
    minutesByWeek: [...minutes].sort(([a], [b]) => a - b).map(([week, total]) => ({ week, minutes: total })),
    accuracyTrend: latest.map(s => s.accuracy),
    accuracyDays: latest.map(s => s.day),
  };
}
