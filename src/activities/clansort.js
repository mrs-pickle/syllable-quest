import { h } from '../core/dom.js';
import { syllableId } from '../core/voice-ids.js';
import { artImage } from '../ui/components.js';
import { coachText, termFor, TYPES } from '../ui/terms.js';
import { chooseOne, createActivityView, createOnce, offerPass, runRound, untilHerTurn } from './kit.js';

export const ID = 'clansort';

export const DEFAULT_COACH = 'Look at the vowel. What comes right after it?';

export function coachFor(ctx, stage, n, terms = ctx?.settings?.terms) {
  const lines = ctx?.content?.coach?.[stage]?.clansort;
  const texts = (Array.isArray(lines) ? lines : []).map((l) => coachText(l, terms)).filter((t) => typeof t === 'string' && t !== '');
  return texts.length > 0 ? texts[n % texts.length] : DEFAULT_COACH;
}

function bannerStates(reached, answer) {
  const states = new Map(TYPES.map((land) => [land, Array.isArray(reached) && reached.includes(land)]));
  if (states.has(answer)) states.set(answer, true);
  return states;
}

export async function run(el, ctx, round, hooks) {
  const items = (round?.items ?? []).filter((it) => typeof it?.data?.syllable?.s === 'string' && TYPES.includes(it.data.syllable.type));
  if (items.length === 0) return;
  const view = createActivityView(el, ctx, { name: 'clansort' });
  const once = createOnce();
  const terms = round?.terms ?? ctx?.settings?.terms;
  const stage = round?.stage ?? '';
  const byKey = new Map();
  for (const it of items) byKey.set(it.key, it);

  async function play(planItem) {
    const item = byKey.get(planItem.id);
    if (!item) return null;
    const { s, type } = item.data.syllable;
    const states = bannerStates(item.data.banners, type);

    const card = h('button', { type: 'button', class: 'word-card syllable-card', 'aria-pressed': 'false', 'data-syllable': s }, s);
    const coach = h('p', { class: 'coach-line', hidden: true, style: { fontSize: '20px', color: '#6b665c', margin: '8px 0 0' } });
    const choices = TYPES.map((land) => {
      const active = states.get(land) === true;
      const el = h('button', { type: 'button', class: ['clan-banner', active ? 'active' : 'inactive'], 'data-land': land, disabled: active ? null : true,
        'aria-disabled': active ? null : 'true' },
      artImage(`ui-sq/clan-${land}`, 'clan-art'), h('span', { class: 'clan-label' }, termFor(land, terms)));
      return { value: land, el, active };
    });
    const live = choices.filter((c) => c.active);
    untilHerTurn(live);
    const row = h('div', { class: 'choice-row clan-row' }, choices.map((c) => c.el));
    view.show(card, row, coach);

    const said = [...once('v.clansort.how'), 'v.clansort.prompt'];
    view.prompt(said).catch(() => {});

    let tapped = () => {};
    const cardTapped = new Promise((resolve) => { tapped = () => resolve('card'); });
    let stopPass = () => {};
    const passed = new Promise((resolve) => { stopPass = offerPass(view, () => resolve('pass')); });
    card.addEventListener('click', () => {
      card.classList.add('picked');
      card.setAttribute('aria-pressed', 'true');
      tapped();
    });
    const first = await Promise.race([cardTapped, passed]);
    stopPass();
    if (first === 'pass') { ctx.audio?.stop?.(); return { pass: true }; }
    ctx.audio?.stop?.();

    let misses = 0;
    for (const c of live) {
      if (c.value === type) continue;
      c.el.addEventListener('click', () => {
        if (c.el.classList.contains('not-yet') || c.el.classList.contains('dim')) return;
        coach.textContent = coachFor(ctx, stage, misses++, terms);
        coach.hidden = false;
      });
    }
    const answer = await chooseOne(view, {
      choices: live.map((c) => ({ value: c.value, el: c.el })),
      answer: type,
      hint: [syllableId(s, type)],
      target: card,
      reward: [syllableId(s, type)],
      praise: 'sort',
    });
    return answer;
  }

  try {
    await runRound(view, { items: items.map((it) => ({ id: it.key, mode: it.mode, isNew: it.isNew, isReview: it.isReview })) }, hooks, {
      play,
      easy: () => null,
    });
  } finally {
    view.destroy();
  }
}
