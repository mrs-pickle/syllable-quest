import { parseKey } from './keys.js';
import { SIGHT_POOL, NOT_DRILLED } from '../curriculum/sight-pool.js';
import {
  WEEK_DAYS, errorsIn, stateEntries, trickyPairs, weakGraphemes,
} from './tricky-pairs.js';

const TYPES = Object.freeze(['closed', 'open', 'vce', 'team', 'r', 'le']);
const STALL_FAILS = 3;
const SUGGESTED = 3;

export const SUGGESTIONS = Object.freeze({
  letter: 'Practise these letters with the arm-tap: say the sound as you trace the letter, then check the shape before you read.',
  'short-vowel': 'Say the short vowel sounds slowly in a row, watching your mouth in a mirror: each one feels different.',
  team: 'Sort a few words into two piles by their vowel team, then ask where in the word the team sits.',
  'r-control': 'Read a short list of words with the same bossy r, then write two of them from dictation.',
  sound: 'Say the two sounds side by side and look at how the lips and tongue move for each.',
  ending: 'Look at the end of the word first, then read the front: the ending often tells you how the word finishes.',
  split: 'Slide the cut one letter each way and read both ways aloud. Keep the one that sounds like a real word.',
  label: 'Name the plank by looking at its end: a vowel on its own at the end is open; a vowel closed in by a consonant is closed.',
  other: 'Go back to the last card that felt easy and build up slowly from there.',
});

export const PAIR_SUGGESTIONS = Object.freeze({
  'b/d': 'Practise b and d with the arm-tap: both start with a tall stick; b has the belly after the stick, d has the belly before it.',
});

export const suggestionFor = (p) => PAIR_SUGGESTIONS[p.pair] ?? SUGGESTIONS[p.kind] ?? SUGGESTIONS.other;


function gateDone(g) {
  const right = Number.isInteger(g?.right) ? g.right : 0;
  const total = Number.isInteger(g?.total) ? g.total : 0;
  switch (g?.kind) {
    case 'drill': return total >= 6 && right * 10 >= total * 9;
    case 'words': return total >= 6 && total - right <= 1;
    case 'write': return total >= 3 && right === total;
    case 'story': {
      const fr = Number.isInteger(g.focusRight) ? g.focusRight : 0;
      const ft = Number.isInteger(g.focusTotal) ? g.focusTotal : 0;
      return total >= 30 && right * 100 >= total * 95 && ft >= 3 && fr * 10 >= ft * 9;
    }
    default: return false;
  }
}

const gatesOf = (list) => (Array.isArray(list) ? list.filter((g) => g && typeof g === 'object' && Number.isFinite(g.day) && typeof g.stage === 'string' && typeof g.kind === 'string') : []);

function stallsOf(gates) {
  const by = new Map();
  for (const g of gatesOf(gates)) {
    const id = `${g.stage}\u0000${g.kind}`;
    by.set(id, [...(by.get(id) ?? []), g]);
  }
  const out = [];
  for (const [id, list] of by) {
    const sorted = [...list].sort((a, b) => a.day - b.day);
    let fails = 0;
    for (const g of sorted) fails = gateDone(g) ? 0 : fails + 1;
    if (fails >= STALL_FAILS) {
      const [stage, kind] = id.split('\u0000');
      out.push({ stage, kind, fails });
    }
  }
  return out.sort((a, b) => (a.stage < b.stage ? -1 : a.stage > b.stage ? 1 : a.kind < b.kind ? -1 : 1));
}


function slot(map, k, make) {
  let v = map.get(k);
  if (v === undefined) { v = make(); map.set(k, v); }
  return v;
}

const byCountThenName = (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

function pushDistinct(list, s, max = 3) {
  if (typeof s === 'string' && s !== '' && !list.includes(s) && list.length < max) list.push(s);
}

function wordRec(content, word) {
  if (content?.byWord instanceof Map) return content.byWord.get(word);
  return (Array.isArray(content?.words) ? content.words : []).find((w) => w?.w === word);
}

function sightNotSecure(content, states, stage) {
  const drill = new Map((Array.isArray(content?.red) ? content.red : []).map((r) => [r.w, r.drill !== false]));
  const introduced = [];
  for (let i = 0; i <= stage; i++) for (const w of SIGHT_POOL[i] ?? []) if (!introduced.includes(w)) introduced.push(w);
  return introduced
    .filter((w) => (drill.has(w) ? drill.get(w) : !NOT_DRILLED.includes(w)))
    .map((w) => {
      const s = states.get(`r:${w}#read`);
      return { word: w, box: Number.isInteger(s?.box) ? s.box : 0, secure: s?.mastered === true };
    })
    .filter((x) => !x.secure)
    .map(({ word, box }) => ({ word, box }))
    .sort((a, b) => a.box - b.box || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
}



export function weeklySummary({ profile, states, content, settings, day }) {
  const fromDay = day - (WEEK_DAYS - 1);
  const errors = Array.isArray(profile?.errors) ? profile.errors : [];
  const stateMap = new Map(stateEntries(states));
  const log = errorsIn(errors, fromDay, day);

  const missed = new Map();
  const divisions = new Map();
  const labels = new Map();
  for (const e of log) {
    const k = parseKey(e.key);
    if (e.kind === 'read' || e.kind === 'blend' || e.kind === 'story') {
      if (k?.prefix === 'r') continue;
      const m = slot(missed, e.target, () => ({ count: 0, said: [] }));
      m.count += 1;
      pushDistinct(m.said, e.said);
    } else if (e.kind === 'divide') {
      const word = k?.id ?? e.target.replace(/[|/\-\s]+/g, '');
      const pattern = wordRec(content, word)?.pattern ?? 'unknown';
      const d = slot(divisions, pattern, () => ({ count: 0, words: [] }));
      d.count += 1;
      pushDistinct(d.words, word, 5);
    } else if (e.kind === 'label') {
      const tokens = e.target.toLowerCase().split(/[|,/\s]+/).filter((t) => TYPES.includes(t));
      for (const t of tokens.length ? tokens : ['unknown']) labels.set(t, (labels.get(t) ?? 0) + 1);
    }
  }

  const sessions = (Array.isArray(profile?.sessions) ? profile.sessions : [])
    .filter((s) => s && Number.isFinite(s.day) && s.day >= fromDay && s.day <= day);
  const minutes = sessions.reduce((n, s) => n + (Number.isFinite(s.minutes) ? s.minutes : 0), 0);

  const pairs = trickyPairs(errors, fromDay, day);
  const seenKinds = new Set();
  const suggestions = [];
  for (const p of pairs) {
    if (suggestions.length === SUGGESTED) break;
    const id = PAIR_SUGGESTIONS[p.pair] ? p.pair : p.kind;
    if (seenKinds.has(id)) continue;
    seenKinds.add(id);
    suggestions.push({ pair: p.pair, kind: p.kind, line: suggestionFor(p) });
  }

  const gates = gatesOf(profile?.gates);
  const stage = Number.isInteger(settings?.stage) ? (settings?.stage) : 0;
  return {
    fromDay,
    toDay: day,
    pairs,
    weakGraphemes: weakGraphemes(stateMap, errors, day),
    wordsMissed: [...missed].map(([word, m]) => ({ word, count: m.count, said: m.said })).sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : 1)),
    divisionsMissed: [...divisions].map(([pattern, d]) => ({ pattern, count: d.count, words: d.words })).sort((a, b) => b.count - a.count || (a.pattern < b.pattern ? -1 : 1)),
    labelsMissed: [...labels].sort(byCountThenName).map(([type, count]) => ({ type, count })),
    sightNotSecure: sightNotSecure(content, stateMap, stage),
    fixedThemselves: sessionsSelf(profile, fromDay, day),
    gatesPassed: gates.filter((g) => g.day >= fromDay && g.day <= day && gateDone(g))
      .map((g) => ({ day: g.day, stage: g.stage, kind: g.kind }))
      .sort((a, b) => a.day - b.day || (a.stage < b.stage ? -1 : a.stage > b.stage ? 1 : a.kind < b.kind ? -1 : 1)),
    stalls: stallsOf(gates),
    minutes: Math.round(minutes),
    sessions: new Set(sessions.map((s) => s.day)).size,
    longWordHours: Math.round(((Number.isFinite(profile?.divisionMs) ? profile.divisionMs : 0) / 3600000) * 10) / 10,
    suggestions,
  };
}

function sessionsSelf(profile, from, to) {
  return (Array.isArray(profile?.errors) ? profile.errors : [])
    .filter((e) => e && e.kind === 'self' && Number.isFinite(e.day) && e.day >= from && e.day <= to).length;
}


function cell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

export function weeklyCsv(summary) {
  const s = summary ?? ({});
  const list = (v) => (Array.isArray(v) ? v : []);
  const rows = [['section', 'item', 'detail', 'count']];
  rows.push(['days', `${s.fromDay ?? ''} to ${s.toDay ?? ''}`, 'day numbers, both included', '']);
  for (const p of list(s.pairs)) rows.push(['tricky pair', p.pair, `${p.confusion}; e.g. ${list(p.examples).join(' ')}`, p.count]);
  for (const g of list(s.weakGraphemes)) rows.push(['sound card', g.id, `${g.right} of ${g.tries} right${g.said ? `; often said ${g.said}` : ''}`, g.tries]);
  for (const w of list(s.wordsMissed)) rows.push(['word missed', w.word, list(w.said).length ? `said ${list(w.said).join(' ')}` : '', w.count]);
  for (const d of list(s.divisionsMissed)) rows.push(['cut missed', d.pattern, list(d.words).join(' '), d.count]);
  for (const l of list(s.labelsMissed)) rows.push(['label missed', l.type, '', l.count]);
  for (const w of list(s.sightNotSecure)) rows.push(['sight word not secure yet', w.word, `box ${w.box}`, '']);
  rows.push(['fixed it themselves', '', 'a good sign', s.fixedThemselves ?? 0]);
  for (const g of list(s.gatesPassed)) rows.push(['gate passed', `${g.stage} ${g.kind}`, `day ${g.day}`, '']);
  for (const t of list(s.stalls)) rows.push(['stuck', `${t.stage} ${t.kind}`, `after ${t.fails} tries`, t.fails]);
  rows.push(['minutes', '', `${s.sessions ?? 0} days`, s.minutes ?? 0]);
  rows.push(['long-word hours', '', 'information only, all time', s.longWordHours ?? 0]);
  for (const x of list(s.suggestions)) rows.push(['suggestion', x.pair, x.line, '']);
  return csv(rows);
}
