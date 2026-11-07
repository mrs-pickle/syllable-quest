import { h } from '../core/dom.js';
import { madeUpId, wordId } from '../core/voice-ids.js';
import { makeKey } from '../engine/keys.js';
import { artImage } from '../ui/components.js';
import { coachText, termFor } from '../ui/terms.js';
import { blendChips } from './soundcheck.js';
import { createActivityView, judgeAloud, showNext } from './kit.js';

export const ID = 'discovery';

export const TRY_WORDS = 2;

export function resolveText(text, terms) {
  if (text !== null && typeof text === 'object') {
    const set = (text);
    return String(set[terms === 'classroom' ? 'classroom' : 'story'] ?? set.story ?? '');
  }
  return String(text ?? '').replace(/\{(closed|open|vce|team|r|le)\}/g, (_, type) => termFor(type, terms));
}

const adultLine = (text) => h('p', { class: 'grownup-text', style: { margin: '4px 0', fontSize: '22px', color: 'var(--ink-soft, #555)' } }, text);

function clipOf(ctx, word) {
  return ctx.content?.byWord?.get?.(word)?.real === false ? madeUpId(word) : wordId(word);
}

function exampleCard(view, word) {
  return h('button', { type: 'button', class: 'word-card example-card', lang: 'en', 'aria-label': `Hear ${word}`,
    onClick: () => { if (!view.lock.locked()) view.play([clipOf(view.ctx, word)]); } }, word);
}

const wordOf = (w) => (typeof w === 'string' ? w : String( (w)?.w ?? ''));

async function showPanel(view, panel, terms) {
  const examples = (Array.isArray(panel?.examples) ? panel.examples : []).map(wordOf).filter(Boolean);
  const tries = (Array.isArray(panel?.try) ? panel.try : []).map(wordOf).filter(Boolean);
  view.show(
    panel?.art ? artImage(panel.art, 'discovery-art') : null,
    h('p', { class: 'discovery-text', style: { fontSize: '40px', lineHeight: '1.4', textAlign: 'center', margin: '8px 24px' } }, resolveText(panel?.text, terms)),
    examples.length ? h('div', { class: 'choice-row words discovery-examples' }, examples.map((w) => exampleCard(view, w))) : null,
    tries.length
      ? h('div', { class: 'discovery-try', style: { textAlign: 'center' } }, adultLine('Try these:'),
        h('div', { class: 'choice-row words' }, tries.map((w) => h('span', { class: 'word-card', lang: 'en' }, w))))
      : null);
  const ids = typeof panel?.voice === 'string' && panel.voice !== '' ? [panel.voice] : [];
  await view.prompt(ids, { play: [] });
  await showNext(view, ids).pressed;
}

async function tryWord(view, rec, { first, hooks, coach }) {
  const word = wordOf(rec);
  const card = h('div', { class: 'word-card', lang: 'en' }, word);
  view.show(card);
  await view.prompt(['v.discovery.ui-try'], { play: first ? ['v.discovery.ui-try'] : [] });
  view.play([]);
  const segs = Array.isArray(rec?.segs) ? rec.segs : null;
  const result = await judgeAloud(view, {
    kind: 'read',
    model: [clipOf(view.ctx, word)],
    target: card,
    coach,
    chips: segs ? blendChips(segs) : [],
  });
  if ('undo' in result || result.passed === true) return;
  const { correct, helped, self, said } = result;
  hooks.record?.(makeKey('w', word, 'try'), 'try', { correct, helped: helped === true, ...(self ? { self } : {}), ...(said !== undefined ? { said } : {}) },
    { scored: false, monitor: false });
}

async function fullDiscovery(view, data, round, hooks) {
  const panels = Array.isArray(data.panels) ? data.panels : [];
  const tries = (Array.isArray(data.try) ? data.try : []).filter(( w) => wordOf(w) !== '').slice(0, TRY_WORDS);
  const steps = panels.length + tries.length;
  const lines = view.ctx.content?.coach?.[round.stage]?.discovery;
  const coach = Array.isArray(lines) && lines.length ? coachText(lines[0], round.terms ?? view.ctx.settings?.terms) || undefined : undefined;
  let done = 0;
  await view.prompt(['v.discovery.ui-start']);
  for (const panel of panels) {
    hooks.progress?.(steps ? done / steps : 0);
    await showPanel(view, panel, round.terms);
    done++;
  }
  for (let i = 0; i < tries.length; i++) {
    hooks.progress?.(steps ? done / steps : 0);
    await tryWord(view, tries[i], { first: i === 0, hooks, coach });
    done++;
  }
  if (tries.length > 0) await view.say(['v.discovery.ui-done'], 0);
}

async function recapDay(view, data, round) {
  const { ctx } = view;
  const line = typeof data.line === 'string' ? data.line : '';
  const text = ctx.content?.voice?.[line]?.text;
  const panels = ctx.content?.discovery?.[round.stage]?.panels;
  const examples = [...new Set((Array.isArray(panels) ? panels : []).flatMap(( p) => (Array.isArray(p?.examples) ? p.examples : [])).map(wordOf).filter(Boolean))].slice(0, 4);
  view.show(
    h('h2', { class: 'discovery-remember', style: { textAlign: 'center', fontSize: '48px', margin: '8px' } }, 'Remember'),
    text ? h('p', { class: 'discovery-text', style: { fontSize: '40px', lineHeight: '1.4', textAlign: 'center', margin: '8px 24px' } }, resolveText(text, round.terms)) : null,
    examples.length ? h('div', { class: 'choice-row words discovery-examples' }, examples.map((w) => exampleCard(view, w))) : null);
  const ids = ['v.discovery.ui-recap', ...(line ? [line] : [])];
  await view.prompt(ids, { play: [] });
  await showNext(view, ids).pressed;
}

export async function run(el, ctx, round, hooks) {
  const items = (Array.isArray(round?.items) ? round.items : []).filter(( i) => i?.data && (i.data.recap === true || Array.isArray(i.data.panels) || Array.isArray(i.data.try)));
  if (items.length === 0) return;
  const view = createActivityView(el, ctx, { name: 'discovery' });
  try {
    for (const item of items) {
      if (!view.live()) break;
      if (item.data.recap === true) await recapDay(view, item.data, round);
      else await fullDiscovery(view, item.data, round, hooks);
    }
    hooks.progress?.(1);
    await view.sayKept();
  } finally {
    view.destroy();
  }
}
