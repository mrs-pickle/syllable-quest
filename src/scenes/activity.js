import { h } from '../core/dom.js';
import { STAGE_IDS } from '../engine/mastery.js';
import { makeKey } from '../engine/keys.js';
import { lessonBar, setLessonBar } from '../ui/components.js';
import { ACTIVITY_IDS, createRunner, lessonPercent, loadActivity, normalizePlan, startToday } from './session.js';

export { ACTIVITY_IDS };

const LANDS = Object.freeze(['closed', 'open', 'vce', 'team', 'r', 'le']);

const FORCED = Object.freeze({
  soundcheck: ['g', 'see'], bridge: ['w', 'divide'], clansort: ['y', 'sort'], trickster: ['r', 'read'], wordbook: ['w', 'write'],
});


export function stageIndexOf(id) {
  const i = typeof id === 'string' ? STAGE_IDS.indexOf(id) : -1;
  return i >= 0 && i <= 27 ? i : null;
}

export function forcedItem(a, { word, mode }, content, stageIndex) {
  const kind = (FORCED)[a];
  if (!word || !kind) return null;
  const m = mode || kind[1];
  const key = makeKey(kind[0], word, m);
  let data;
  if (a === 'soundcheck') data = m === 'blend' ? { part: 'blend', word } : { part: m, grapheme: word, expected: [] };
  else if (a === 'bridge') data = { word };
  else if (a === 'trickster') data = { red: word };
  else if (a === 'wordbook') data = { word };
  else {
    const rec = (content?.syllables ?? []).find(( s) => s?.s === word);
    let type = rec?.type;
    if (!type) {
      for (const w of content?.words ?? []) {
        const at = Array.isArray(w?.parts) ? w.parts.indexOf(word) : -1;
        if (at >= 0) { type = w.types?.[at]; break; }
      }
    }
    const reached = LANDS.indexOf(String(STAGE_IDS[stageIndex] ?? 'closed').split('.')[0]);
    data = { syllable: { s: word, type: type ?? 'closed' }, banners: LANDS.slice(0, Math.max(0, reached) + 1) };
  }
  return { key, mode: m, isNew: false, isReview: false, focus: false, data };
}

export function debugStep(plan, a, params, content) {
  const found = (plan?.steps ?? []).find(( s) => s.activity === a);
  let items = found ? [...found.items] : [];
  const forced = forcedItem(a, params, content, plan?.stageIndex ?? 0);
  if (forced) items = [forced, ...items.filter((i) => i.key !== forced.key)];
  return { budgetMs: 0, droppable: false, ...(found ?? {}), activity: a, items, round: { ...(found?.round ?? {}), items } };
}


export async function runHarness(el, ctx, params, deps = {}) {
  const a = params.a ?? '';
  const stageIndex = stageIndexOf(params.stage) ?? ctx.settings.stage;
  const shadow = {
    ...ctx,
    settings: { ...ctx.settings, stage: stageIndex, ...(params.copilot === '0' || params.copilot === '1' ? { copilot: params.copilot === '1' } : {}) },
    profile: structuredClone(ctx.profile),
    states: new Map(ctx.states),
    today: null,
    save: async () => true,
    onLeave: () => () => {},
  };
  const build = deps.buildSession ?? (await import('../engine/session-builder.js')).buildSession;
  const plan = normalizePlan(await build({
    content: ctx.content, states: new Map(shadow.states), settings: shadow.settings, profile: shadow.profile, day: ctx.day, rng: ctx.rng,
  }), shadow.settings) ?? { day: ctx.day, stage: STAGE_IDS[stageIndex], stageIndex, minutes: shadow.settings.sessionMinutes ?? 20, steps: [] };
  const step = debugStep(plan, a, params, ctx.content);
  const own = { ...plan, steps: [step] };
  const runner = createRunner({ ctx: shadow, plan: own, today: startToday(own, ctx.day, shadow.settings) });

  const results = [];
  const gates = [];
  const passes = [];
  const base = runner.hooks;
  const hooks = {
    ...base,
    record( key, mode, result, opts) {
      results.push({ key, mode, ...result });
      console.info(`[activity] ${key}`, result);
      return base.record(key, mode, result, opts);
    },
    gate( kind, counts) {
      gates.push({ kind, ...counts });
      console.info(`[activity] gate ${kind}`, counts);
      return base.gate(kind, counts);
    },
    pass( key) {
      passes.push(key);
      console.info(`[activity] pass ${key}`);
      return base.pass(key);
    },
    progress( fraction) {
      base.progress(fraction);
      showBar(lessonPercent(own.steps, 0, runner.stepFraction()));
    },
  };
  let peak = 0;
  function showBar(percent) {
    if (!deps.bar) return;
    peak = Math.max(peak, percent);
    setLessonBar(deps.bar, peak);
  }
  showBar(0);
  const mod = await (deps.loader ?? loadActivity)(a);
  runner.beginStep(step);
  await mod.run(el, shadow, {
    stage: plan.stage, stageIndex: plan.stageIndex, terms: shadow.settings.terms === 'classroom' ? 'classroom' : 'story', ...step.round, items: step.items,
  }, hooks);
  showBar(100);
  return { results, gates, passes, step, shadow };
}

export function mount(el, ctx, params = {}, deps = {}) {
  let live = true;
  const a = params.a ?? '';
  const panel = (...children) => el.replaceChildren(h('div', { class: 'activity-debug' }, ...children));

  if (!ACTIVITY_IDS.includes(a)) {
    panel(h('h2', {}, 'Activity harness'), h('p', {}, `Add &a= with one of: ${ACTIVITY_IDS.join(', ')}.`));
    return () => { live = false; };
  }

  const stepEl = h('div', { class: 'activity-debug-step', style: { position: 'absolute', inset: '0' } });
  const bar = lessonBar();
  el.replaceChildren(stepEl, bar);
  runHarness(stepEl, ctx, params, { ...deps, bar }).then(({ results, gates, passes }) => {
    if (!live) return;
    panel(
      h('h2', {}, `Round over: ${a}`),
      h('p', {}, `${results.length} answers recorded, ${passes.length} passed. Nothing was saved.`),
      h('ul', {}, results.map((r) => h('li', {}, `${r.key}: ${r.correct ? 'right' : 'not yet'}${r.helped ? ' (helped)' : ''}${r.self ? ' (fixed it)' : ''}${r.passed ? ' (passed)' : ''}`))),
      gates.length > 0 ? h('p', {}, `Gates: ${gates.map((g) => `${g.kind} ${g.right}/${g.total}`).join(', ')}`) : null,
    );
  }).catch((err) => {
    console.error('The activity harness stopped', err);
    if (live) panel(h('h2', {}, 'Activity harness'), h('p', {}, 'The activity stopped. See the console.'));
  });
  return () => { live = false; };
}
