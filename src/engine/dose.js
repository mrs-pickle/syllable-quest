import { parseKey } from './keys.js';

export const DOSE = Object.freeze({ fullWords: 6, taperWords: 3, secureSeen: 20, secureWindow: 20 });

const BRIDGE_MINUTES_AT_20 = 3.5;
const MS_PER_HOUR = 3600000;


const roundHalfUp = (x) => Math.floor(x + 0.5);

function landOfWord(content, word) {
  const rec = content?.byWord instanceof Map ? content.byWord.get(word) : (content?.words ?? []).find(( r) => r.w === word);
  return typeof rec?.stage === 'string' ? rec.stage.split('.')[0] : null;
}

export function divideSecure(states, land, content) {
  const list = states instanceof Map ? [...states.values()] : Array.isArray(states) ? states : Object.values(states ?? {});
  let seen = 0;
  const attempts = [];
  for (const state of list) {
    const parsed = parseKey(state?.key);
    if (!parsed || parsed.prefix !== 'w' || parsed.mode !== 'divide') continue;
    if (landOfWord(content, parsed.id) !== land) continue;
    const hist = Array.isArray(state.hist) ? state.hist : [];
    if (hist.length === 0) continue;
    seen++;
    for (const h of hist) attempts.push({ day: h.day, ok: h.correct === true && !h.helped && !h.self });
  }
  if (seen < DOSE.secureSeen) return false;
  attempts.sort((a, b) => a.day - b.day);
  const recent = attempts.slice(-DOSE.secureWindow);
  const right = recent.filter((a) => a.ok).length;
  return recent.length >= DOSE.secureWindow && right * 10 >= recent.length * 9;
}

export function bridgeAllowance(_profile, settings, states, land, content, minutes = 20) {
  const m = Number.isFinite(minutes) && minutes > 0 ? minutes : 20;
  const override = settings?.doseOverride;
  const light = override === 'light' || (override !== 'full' && divideSecure(states, land, content));
  const fullMs = BRIDGE_MINUTES_AT_20 * 60000 * m / 20;
  if (light) return { words: DOSE.taperWords, softMs: Math.round(fullMs * DOSE.taperWords / DOSE.fullWords) };
  return { words: Math.max(4, roundHalfUp(DOSE.fullWords * m / 20)), softMs: Math.round(fullMs) };
}

export function withDivisionTime(profile, ms) {
  const add = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const had = Number.isFinite(profile?.divisionMs) ? (profile.divisionMs) : 0;
  return { ...profile, divisionMs: had + add };
}

export function doseHours(profile) {
  return Number.isFinite(profile?.divisionMs) && (profile.divisionMs) > 0 ? (profile.divisionMs) / MS_PER_HOUR : 0;
}
