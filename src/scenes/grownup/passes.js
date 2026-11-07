import { h } from '../../core/dom.js';
import { cornerFrame } from './gate.js';


const MS_PER_DAY = 86400000;

const shortDate = (day) => new Date(day * MS_PER_DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const HOW_WORDS = Object.freeze({ right: 'right', helped: 'with help', missed: 'not yet', self: 'checked by the reader', passed: 'passed again' });

export function passLabel({ id, mode }) {
  const at = id.indexOf(':');
  const kind = id.slice(0, at);
  const name = id.slice(at + 1);
  switch (kind) {
    case 'g': return `Sound: ${name} (${mode === 'hear' ? 'hearing' : 'saying'} it)`;
    case 'n': return `Made-up word: ${name}`;
    case 'w': return `${{ divide: 'Splitting', label: 'Naming the parts of', read: 'Reading', write: 'Writing' }[mode] ?? 'Word'}: ${name}`;
    case 'y': return `Syllable sort: ${name}`;
    case 'r': return `Sight word: ${name}`;
    default: return id;
  }
}

const howWords = (how) => (how === null ? '' : `: ${HOW_WORDS[how]}`);

export function passStatus({ back, how, closed }) {
  if (closed !== null) return `Done ${shortDate(closed)}${howWords(how)}`;
  if (back !== null && how !== null) return `Came back ${shortDate(back)}${howWords(how)}. Comes again in a later lesson.`;
  return 'Waiting to come back';
}

function inOrder(passes) {
  const latest = [...passes].reverse();
  return [
    ...latest.filter((r) => r.closed === null).sort((a, b) => b.day - a.day),
    ...latest.filter((r) => r.closed !== null).sort((a, b) => (b.closed) - (a.closed)),
  ];
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'passes');
  if (!body) return () => {};
  const passes = inOrder(ctx.profile.passes ?? []);
  body.append(
    h('p', { class: 'gu-hint' }, 'What was passed, and where each one stands. A pass is not scored.'),
    passes.length === 0 ? h('p', { class: 'gu-empty' }, 'No passes yet.') : h('table', { class: 'gu-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'What'), h('th', {}, 'Passed on'), h('th', {}, 'Lessons'), h('th', {}, 'Where it stands'))),
      h('tbody', {}, passes.map((record) => h('tr', {},
        h('td', {}, passLabel(record)), h('td', {}, shortDate(record.day)), h('td', {}, record.times), h('td', {}, passStatus(record)))))));
  return () => {};
}
