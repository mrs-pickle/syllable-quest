import { STAGES } from '../curriculum/stages.js';
import { landName } from '../ui/terms.js';
import { accuracyBySession, chipOf, minutesByWeek, placedUpTo, shortDate, stageName } from './dashboard.js';
import { GATE_KINDS, LANDS, STAGE_IDS, isStageMastered, stageStatus } from './mastery.js';
import { passLabel } from './passes.js';
import { trickyPairs } from './tricky-pairs.js';

export const REPORT_DAYS = 28;
export const TOP_PAIRS = 6;
export const PASSES_SHOWN = 12;
export const PLACEMENTS_SHOWN = 4;

export const REPORT_FOOTER = Object.freeze([
  'Home practice, not a standardized test.',
  'Made on this device. Nothing in it is sent anywhere.',
]);

const CELL = Object.freeze({ placed: 'placed', none: 'not yet' });


const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const listOf = (v) => (Array.isArray(v) ? v : []);
const stageAt = (n) => (Number.isInteger(n) && STAGES[ (n)] ? STAGES[ (n)].name : `stage ${n}`);

export function tutorReport({ profile, settings, day }) {
  const from = day - REPORT_DAYS + 1;
  const inWindow = ( d) => isNumber(d) && d >= from && d <= day;
  const sessions = listOf(profile?.sessions).filter((s) => inWindow(s?.day));
  const gates = listOf(profile?.gates);
  const crests = listOf(profile?.crests);
  const placedTo = placedUpTo(profile);
  const stage = Number.isInteger(settings?.stage) ? (settings.stage) : 0;

  const hasCrest = ( land) => crests.some((c) => c && c.land === land);
  const lit = ( id) => hasCrest(id.split('.')[0])
    || listOf(profile?.landmarks).some((l) => l && l.stage === id) || isStageMastered(gates, id);

  const lands = LANDS.map((land) => {
    const ids = STAGE_IDS.filter((id) => id.startsWith(`${land}.`));
    const crest = crests.find((c) => c && c.land === land) ?? null;
    return {
      land,
      name: landName(land, settings?.terms),
      crest: crest ? { day: isNumber(crest.day) ? crest.day : null, how: crest.how === 'placement' ? 'placement' : 'earned' } : null,
      landmarks: { lit: ids.filter(lit).length, total: ids.length },
      stages: ids.map((id) => {
        const status = (stageStatus(gates, id));
        const placed = STAGE_IDS.indexOf(id) < placedTo;
        return { id, name: stageName(id), mastered: status.mastered === true, chips: GATE_KINDS.map((kind) => ({ kind, ...chipOf(kind, status[kind], placed), days: [...status[kind].passDays] })) };
      }),
    };
  });

  const placements = listOf(profile?.placements).filter((p) => p && isNumber(p.day)).slice(-PLACEMENTS_SHOWN)
    .map((p) => ({ day: p.day, suggested: Number.isInteger(p.suggested) ? p.suggested : null, chosen: Number.isInteger(p.chosen) ? p.chosen : null, used: p.applied !== false }));

  const open = listOf(profile?.passes).filter((r) => r && r.closed === null && typeof r.id === 'string')
    .sort((a, b) => b.day - a.day);

  return {
    from, to: day,
    glance: {
      stage,
      stageName: stageAt(stage),
      sessions: sessions.length,
      minutes: Math.round(sessions.reduce((n, s) => n + (isNumber(s.minutes) ? s.minutes : 0), 0)),
      withGrownUp: sessions.filter((s) => s.copilot === true).length,
      partPlayed: sessions.filter((s) => s.complete === false).length,
    },
    lands,
    weeks: minutesByWeek(profile ?? {}, day),
    accuracy: accuracyBySession(profile ?? {}),
    placements,
    passes: { open: open.length, shown: open.slice(0, PASSES_SHOWN).map((r) => ({ label: passLabel(r), day: r.day })) },
    pairs: trickyPairs(listOf(profile?.errors), from, day).slice(0, TOP_PAIRS),
  };
}


const dateOf = (day) => new Date(day * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function cellOf(chip) {
  if (chip.state === 'done') return `✓ ${shortDate( (chip.days.at(-1)))}`;
  if (chip.state === 'some') return `${chip.days.length} of 2 days`;
  return (CELL)[chip.state] ?? CELL.none;
}

export function reportSections(r) {
  const g = r.glance;
  const sections = [{ title: 'At a glance', lines: [
    `Lessons are on stage ${g.stage}: ${g.stageName}.`,
    `Last 4 weeks: ${g.sessions} ${g.sessions === 1 ? 'lesson' : 'lessons'}, ${g.minutes} active minutes, ${g.withGrownUp} with a grown-up beside the reader, ${g.partPlayed} part-played.`,
  ] }];
  for (const land of r.lands) {
    sections.push({
      title: land.name,
      table: { head: ['Stage', 'Sounds', 'Words', 'Writing', 'Story'], rows: land.stages.map((s) => [s.name, ...s.chips.map(cellOf)]) },
      lines: [
        land.crest === null ? 'Crest: not yet.' : land.crest.how === 'placement' ? `Crest: placed${land.crest.day === null ? '' : ` (${shortDate(land.crest.day)})`}.` : `✓ Crest: earned${land.crest.day === null ? '' : ` ${shortDate(land.crest.day)}`}.`,
        `Landmarks lit: ${land.landmarks.lit} of ${land.landmarks.total}.`,
      ],
    });
  }
  sections.push({
    title: 'Minutes each week',
    table: { head: ['Week of', 'Minutes', 'Part-played'], rows: r.weeks.map((w) => [shortDate(w.week), String(w.full + w.part), String(w.part)]) },
  });
  sections.push(r.accuracy.length === 0 ? { title: 'Right answers in each lesson', lines: ['No lessons yet.'] } : {
    title: 'Right answers in each lesson',
    table: { head: ['Lesson', 'Right'], rows: r.accuracy.map((p) => [shortDate(p.day), p.accuracy === null ? 'no answers' : `${Math.round(p.accuracy * 100)}%`]) },
    lines: ['A lesson with no answers is left out of the count, not counted as zero.'],
  });
  sections.push(r.placements.length === 0 ? { title: 'Placement', lines: ['No placement check yet.'] } : {
    title: 'Placement',
    table: { head: ['Day', 'Suggested', 'Chosen', 'Used'], rows: r.placements.map((p) => [shortDate(p.day),
      p.suggested === null ? '—' : `${p.suggested}: ${stageAt(p.suggested)}`, p.chosen === null ? '—' : `${p.chosen}: ${stageAt(p.chosen)}`, p.used ? 'yes' : 'measured only']) },
  });
  sections.push({ title: 'Passes still open', lines: r.passes.open === 0 ? ['None. Every pass has come back.'] : [
    ...r.passes.shown.map((p) => `${p.label} (passed ${shortDate(p.day)})`),
    ...(r.passes.open > r.passes.shown.length ? [`and ${r.passes.open - r.passes.shown.length} more.`] : []),
    'A pass is not scored. Each one comes back in a later lesson.',
  ] });
  sections.push({ title: 'Tricky pairs, last 4 weeks', lines: r.pairs.length === 0 ? ['No mix-ups seen.'] : r.pairs.map((p) => `${p.pair}: ${p.count} ${p.count === 1 ? 'time' : 'times'}${p.examples.length > 0 ? ` (${p.examples.join(', ')})` : ''}`) });
  sections.push({ title: 'For the tutor', blank: ['Notes: ____', '____', '____'] });
  return sections;
}

export function reportCsv(r) {
  const rows = [['section', 'item', 'value'], ['Report', 'From', dateOf(r.from)], ['Report', 'To', dateOf(r.to)]];
  for (const s of reportSections(r)) {
    const t = s.table;
    if (t) for (const row of t.rows) row.slice(1).forEach((value, i) => rows.push([s.title, `${row[0]}, ${t.head[i + 1]}`, value]));
    (s.lines ?? []).forEach((line, i) => rows.push([s.title, String(i + 1), line]));
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export const csvCell = (v) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

export const reportDates = (r) => `${dateOf(r.from)} to ${dateOf(r.to)}`;
