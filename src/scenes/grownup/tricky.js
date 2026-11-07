import { h } from '../../core/dom.js';
import { weeklyCsv, weeklySummary } from '../../engine/weekly.js';
import { cornerFrame } from './gate.js';
import { shortDate } from './progress.js';

const MS_PER_DAY = 86400000;

const isoDate = (day) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

export const csvFileName = (day) => `syllable-quest-tricky-pairs-${isoDate(day)}.csv`;

export function downloadCsv(el, urls, text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  urls.push(url);
  const link = h('a', { href: url, download: name, hidden: true });
  el.append(link);
  link.click();
  link.remove();
}

function block(title, rows, empty, part) {
  return h('section', { class: 'gu-block', 'data-part': part },
    h('h3', { class: 'gu-subtitle' }, title),
    rows.length === 0 ? h('p', { class: 'gu-empty' }, empty) : h('ul', { class: 'gu-list' }, rows.map((row) => h('li', {}, row))));
}

const times = (n, one = 'time', many = 'times') => `${n} ${n === 1 ? one : many}`;

export function trickySections(ctx, deps) {
  const summary = weeklySummary({ profile: ctx.profile, states: ctx.states, content: ctx.content, settings: ctx.settings, day: ctx.day });
  const none = 'Nothing this week.';
  const root = h('section', { class: 'gu-printable', 'data-print': 'tricky' },
    h('p', { class: 'gu-hint' }, `The last 7 days, ${shortDate(summary.fromDay)} to ${shortDate(summary.toDay)}. This is a guide for practice, not a score.`),
    h('p', { class: 'gu-week-line', 'data-part': 'week' },
      `${summary.sessions} ${summary.sessions === 1 ? 'day' : 'days'} played, ${summary.minutes} minutes.`),
    block('Mix-ups seen most', summary.pairs.map((p) => `${p.pair}: ${times(p.count)}${p.examples.length ? `, for example ${p.examples.join(', ')}` : ''}`),
      none, 'pairs'),
    summary.suggestions.length > 0 ? h('section', { class: 'gu-block', 'data-part': 'suggestions' },
      h('h3', { class: 'gu-subtitle' }, 'Ideas to try'),
      h('ul', { class: 'gu-list' }, summary.suggestions.map((s) => h('li', {}, h('strong', {}, `${s.pair}: `), s.line)))) : null,
    block('Sound cards that need more practice', summary.weakGraphemes.map((g) => `${g.id}: ${g.right} of ${g.tries} right${g.said ? `, often said as ${g.said}` : ''}`),
      none, 'graphemes'),
    block('Words missed in reading', summary.wordsMissed.map((w) => `${w.word}: ${times(w.count)}${w.said.length ? `, said ${w.said.join(', ')}` : ''}`), none, 'words'),
    block('Long words cut a different way', summary.divisionsMissed.map((d) => `${d.pattern}: ${times(d.count)}${d.words.length ? ` (${d.words.join(', ')})` : ''}`), none, 'divisions'),
    block('Plank names missed', summary.labelsMissed.map((l) => `${l.type}: ${times(l.count)}`), none, 'labels'),
    block('Sight words not secure yet', summary.sightNotSecure.map((w) => w.word), 'All the sight words so far are secure.', 'sight'),
    h('p', { class: 'gu-good', 'data-part': 'self' },
      `Fixed it themselves: ${times(summary.fixedThemselves)} this week. That is a good sign: they noticed and corrected.`),
    h('div', { class: 'gu-actions gu-screen-only' },
      h('button', { type: 'button', class: 'gu-button gu-small', 'data-action': 'print', onClick: () => {
        const page = root.closest?.('.grownup');
        page?.setAttribute('data-printing', 'tricky');
        try { deps.print(); } finally { page?.removeAttribute('data-printing'); }
      } }, 'Print this page'),
      h('button', { type: 'button', class: 'gu-button gu-small', 'data-action': 'csv', onClick: () => deps.csv(weeklyCsv(summary), csvFileName(ctx.day)) }, 'Download as a CSV file')));
  return [root];
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'tricky');
  if (!body) return () => {};
  const urls = [];
  body.append(...trickySections(ctx, {
    csv: (text, name) => downloadCsv(el, urls, text, name),
    print: () => globalThis.print?.(),
  }));
  return () => { for (const url of urls) URL.revokeObjectURL(url); };
}
