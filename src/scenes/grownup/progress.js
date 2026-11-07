import { h } from '../../core/dom.js';
import { STAGES } from '../../curriculum/stages.js';
import { accuracyBySession, minutesByWeek } from '../../engine/dashboard.js';
import { doseHours } from '../../engine/dose.js';
import { GATE_KINDS, PASS_DAYS_NEEDED, STAGE_IDS, stageStatus } from '../../engine/mastery.js';
import { barGraph, lineGraph } from '../../ui/graphs.js';
import { landName } from '../../ui/terms.js';
import { cornerFrame } from './gate.js';

const MS_PER_DAY = 86400000;

export const GATE_LABELS = Object.freeze({ drill: 'Sounds', words: 'Words', write: 'Writing', story: 'Story' });

const TEACHABLE = STAGE_IDS.filter((id) => !id.startsWith('city.'));

export const shortDate = (day) => new Date(day * MS_PER_DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const stageName = (id) => STAGES.find((s) => s.id === id)?.name ?? id;

export function svgNode(markup) {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return globalThis.document.importNode(doc.documentElement, true);
}

export function placedUpTo(profile) {
  let top = 0;
  for (const p of Array.isArray(profile?.placements) ? profile.placements : []) {
    if (p && p.applied !== false && Number.isInteger(p.chosen)) top = Math.max(top, p.chosen);
  }
  for (const p of Array.isArray(profile?.pointerLog) ? profile.pointerLog : []) {
    if (p && p.why === 'placement' && Number.isInteger(p.stage)) top = Math.max(top, p.stage);
  }
  return top;
}

export function chipOf(kind, status, placed) {
  const label = (GATE_LABELS)[kind] ?? kind;
  const days = status.passDays.map(shortDate).join(', ');
  if (status.passDays.length >= PASS_DAYS_NEEDED) return { state: 'done', text: `✓ ${label}: ${days}` };
  if (status.passDays.length > 0) return { state: 'some', text: `${label}: ${days} (${status.passDays.length} of ${PASS_DAYS_NEEDED} days)` };
  if (placed) return { state: 'placed', text: `${label}: placed` };
  return { state: 'none', text: `${label}: not yet` };
}

export const stallText = (stageId, kind, tries) => `Stuck on ${stageName(stageId)} (${ (GATE_LABELS)[kind]?.toLowerCase() ?? kind}) after ${tries} tries. Consider stepping back a stage, or ask your reader's teacher for ideas.`;


function stageRow(gates, id, placed) {
  const status = (stageStatus(gates, id));
  return h('li', { class: 'gu-stage', 'data-stage': id },
    h('span', { class: 'gu-stage-name' }, stageName(id)),
    h('span', { class: 'gu-chips' }, GATE_KINDS.map((kind) => {
      const chip = chipOf(kind, status[kind], placed);
      return h('span', { class: ['gu-chip', `gu-chip-${chip.state}`], 'data-gate': kind, 'data-state': chip.state }, chip.text);
    })),
    status.mastered ? h('span', { class: 'gu-stage-note' }, 'Mastered') : null,
    GATE_KINDS.filter((kind) => status[kind].failsSincePass >= 3).map((kind) => h('p', { class: 'gu-stall', role: 'note' }, stallText(id, kind, status[kind].failsSincePass))));
}

function crestNote(crests, land) {
  const crest = crests.find((c) => c && c.land === land);
  if (!crest) return 'Crest: not yet';
  return crest.how === 'placement' ? `Crest: placed (${shortDate(crest.day)})` : `✓ Crest: earned ${shortDate(crest.day)}`;
}

export function progressSections(ctx) {
  const profile = ctx.profile ?? {};
  const gates = Array.isArray(profile.gates) ? profile.gates : [];
  const crests = Array.isArray(profile.crests) ? profile.crests : [];
  const terms = ctx.settings?.terms;
  const placedTo = placedUpTo(profile);
  const day = Number.isFinite(ctx.day) ? ctx.day : 0;

  const lands = [];
  for (const id of TEACHABLE) { const land = id.split('.')[0]; if (!lands.includes(land)) lands.push(land); }

  const rows = lands.map((land) => h('section', { class: 'gu-land', 'data-land': land },
    h('h3', { class: 'gu-subtitle' }, landName(land, terms), h('span', { class: 'gu-crest' }, crestNote(crests, land))),
    h('ul', { class: 'gu-stages' }, TEACHABLE.filter((id) => id.startsWith(`${land}.`)).map((id) => stageRow(gates, id, STAGE_IDS.indexOf(id) < placedTo)))));

  const weeks = minutesByWeek(profile, day);
  const minutesGraph = barGraph(weeks.map((w) => ({
    label: shortDate(w.week),
    parts: [
      { value: w.full, cls: 'graph-a', tip: `Week of ${shortDate(w.week)}: ${w.full} minutes` },
      { value: w.part, cls: 'graph-a-light', tip: `Week of ${shortDate(w.week)}: ${w.part} minutes in lessons left part-way` },
    ],
  })), { title: 'Minutes played each week' });

  const points = accuracyBySession(profile);
  const accuracyGraph = lineGraph(points.map((p) => ({
    label: shortDate(p.day),
    value: p.accuracy === null ? null : Math.round(p.accuracy * 100),
    tip: p.accuracy === null ? `${shortDate(p.day)}: no answers that day` : `${shortDate(p.day)}: ${Math.round(p.accuracy * 100)}% right`,
  })), { min: 0, max: 100, fmt: (v) => `${Math.round(v)}%`, title: 'How many answers were right in each lesson' });

  const thisWeek = weeks.at(-1);
  const hours = Math.round(doseHours(profile) * 10) / 10;
  return [
    h('p', { class: 'gu-hint' }, 'Each stage is passed on four checks, and each check has to be passed on two different days. A check that is not done yet is just not done yet.'),
    h('h2', { class: 'gu-subtitle' }, 'Lands and stages'),
    ...rows,
    h('h2', { class: 'gu-subtitle' }, 'Playing time'),
    h('p', { class: 'gu-time-now' }, `This week: ${(thisWeek?.full ?? 0) + (thisWeek?.part ?? 0)} minutes.`),
    h('div', { class: 'gu-graph', 'data-part': 'minutes' }, svgNode(minutesGraph),
      h('p', { class: 'gu-legend' },
        h('span', { class: 'gu-legend-item' }, h('span', { class: 'gu-legend-swatch graph-a' }), 'Lessons finished'),
        h('span', { class: 'gu-legend-item' }, h('span', { class: 'gu-legend-swatch graph-a-light' }), 'Lessons left part-way'))),
    h('h2', { class: 'gu-subtitle' }, 'Right answers in each lesson'),
    points.length === 0
      ? h('p', { class: 'gu-empty' }, 'No lessons yet.')
      : h('div', { class: 'gu-graph', 'data-part': 'accuracy' }, svgNode(accuracyGraph),
        h('p', { class: 'gu-hint' }, 'A day with no answers is left as a gap. It is not counted as zero.')),
    h('h2', { class: 'gu-subtitle' }, 'Long-word practice'),
    h('p', { class: 'gu-dose', 'data-part': 'dose' }, `Long-word practice so far: ${hours} hours. This is our practice setting, shown for information; it is not a goal.`),
  ].filter((node) => node !== null);
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'progress');
  if (!body) return () => {};
  body.append(...progressSections(ctx));
  return () => {};
}
