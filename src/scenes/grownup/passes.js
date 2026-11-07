import { h } from '../../core/dom.js';
import { passLabel } from '../../engine/passes.js';
import { cornerFrame } from './gate.js';

export { passLabel };


const MS_PER_DAY = 86400000;

const shortDate = (day) => new Date(day * MS_PER_DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const HOW_WORDS = Object.freeze({ right: 'right', helped: 'with help', missed: 'not yet', self: 'checked by the reader', passed: 'passed again' });

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
