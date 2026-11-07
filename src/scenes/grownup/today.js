import { h } from '../../core/dom.js';
import { createRng } from '../../core/rng.js';
import { buildSession } from '../../engine/session-builder.js';
import { GATE_KINDS, stageStatus } from '../../engine/mastery.js';
import { waitingPasses } from '../../engine/passes.js';
import { landName } from '../../ui/terms.js';
import { STAGES } from '../../curriculum/stages.js';
import { cornerFrame } from './gate.js';
import { stageName, stallText } from './progress.js';

export const STEP_NAMES = Object.freeze({
  soundcheck: 'Sound Check', discovery: 'Discovery', bridge: 'Bridge Builder', break: 'Break', clansort: 'Clan Sort',
  trickster: 'Trickster', wordbook: 'Word Book', storypage: 'Story Page',
});

const COACH_FALLBACK = Object.freeze({
  soundcheck: 'What sound does this card make? Can you say it while you trace it?',
  discovery: 'What do you notice about these words? Which part is new?',
  bridge: 'Where could this word split? What does the vowel say in each part?',
  clansort: 'Which banner fits this part? What does its vowel do?',
  trickster: 'Which part of this word breaks the rule?',
  wordbook: 'Say the word slowly. What sounds do you hear, one at a time?',
  storypage: 'Read the pattern words first. Does the line sound like something a person would say?',
});

function wordRec(content, word) {
  if (content?.byWord instanceof Map) return content.byWord.get(word);
  return (Array.isArray(content?.words) ? content.words : []).find(( w) => w?.w === word);
}

export function todaysPlan(ctx) {
  const stored = ctx.today?.plan;
  if (stored && Array.isArray(stored.steps) && ctx.today.day === ctx.day && ctx.today.stage === ctx.settings?.stage) {
    return { plan: stored, saved: true };
  }
  try {
    const plan = buildSession({ content: ctx.content, states: ctx.states, settings: ctx.settings, profile: ctx.profile, day: ctx.day, rng: createRng(ctx.day) });
    return Array.isArray(plan?.steps) && plan.steps.length > 0 ? { plan, saved: false } : null;
  } catch (err) {
    console.error("Today's plan could not be built", err);
    return null;
  }
}

const minutesText = (ms) => `${Math.round(ms / 30000) / 2} min`;

export function coachLinesFor(ctx, stage, activity) {
  const lines = (ctx.content?.coach?.[stage]?.[activity] ?? []).map(( l) => l?.text).filter(( t) => typeof t === 'string' && t !== '');
  if (lines.length > 0) return lines;
  const fallback = (COACH_FALLBACK)[activity];
  return fallback ? [fallback] : [];
}

export function wordBookScript(plan, content) {
  const step = (Array.isArray(plan?.steps) ? plan.steps : []).find(( s) => s.activity === 'wordbook');
  const out = [];
  for (const item of Array.isArray(step?.items) ? step.items : []) {
    const data = item?.data ?? {};
    if (typeof data.word === 'string') {
      const rec = wordRec(content, data.word);
      const parts = Array.isArray(rec?.parts) && rec.parts.length > 1 ? ` (${rec.parts.join('-')})` : '';
      const sounds = Array.isArray(rec?.segs) ? rec.segs.map(( s) => s[0]).join(' ') : '';
      out.push({
        word: data.word,
        say: `Say: ${data.word}. Your reader repeats it, taps the syllables${parts}, then says each letter while writing each syllable.`,
        cue: typeof data.cue === 'string' && data.cue !== '' ? data.cue : null,
        listen: sounds ? `Listen for each sound, in order: ${sounds}.` : 'Listen for each sound, in order.',
        counts: item.focus === true,
      });
    } else if (data.sentence && typeof data.sentence.text === 'string') {
      out.sentence = { text: data.sentence.text, targets: Array.isArray(data.sentence.targets) ? data.sentence.targets : [] };
    }
  }
  return out;
}

function stallLines(ctx, stage) {
  const status = (stageStatus(Array.isArray(ctx.profile?.gates) ? ctx.profile.gates : [], stage));
  return GATE_KINDS.filter((kind) => status[kind].failsSincePass >= 3).map((kind) => stallText(stage, kind, status[kind].failsSincePass));
}

export function todaySections(ctx, deps = { print: () => globalThis.print?.() }) {
  const made = todaysPlan(ctx);
  const passes = Array.isArray(ctx.profile?.passes) ? ctx.profile.passes : [];
  const waiting = waitingPasses(ctx.profile ?? {}, ctx.day).length;
  const passedToday = passes.filter(( r) => r?.day === ctx.day).length;
  const passLine = h('p', { class: 'gu-pass-count', 'data-part': 'passes' },
    `Passes: ${passedToday} passed today. ${waiting} waiting to come back in a later lesson.`);
  if (!made) {
    return [passLine, h('p', { class: 'gu-empty' }, "Today's plan is not ready yet. Open the game's map and start a lesson, then come back.")];
  }

  const { plan, saved } = made;
  const stage = STAGES[plan.stageIndex] ?? STAGES.find((s) => s.id === plan.stage);
  const flags = stallLines(ctx, plan.stage);
  const script = wordBookScript(plan, ctx.content);
  const heading = h('p', { class: 'gu-plan-head', 'data-part': 'stage' },
    `${stageName(plan.stage)}${stage ? ` in ${landName(stage.land, ctx.settings?.terms)}` : ''}. About ${plan.minutes} minutes.`);

  const steps = plan.steps.map(( step, i) => {
    const name = (STEP_NAMES)[step.activity] ?? step.activity;
    const coach = step.activity === 'break' ? [] : coachLinesFor(ctx, plan.stage, step.activity);
    return h('li', { class: 'gu-step', 'data-step': step.activity },
      h('h3', { class: 'gu-step-name' }, `${i + 1}. ${name}`),
      h('span', { class: 'gu-step-meta' }, step.activity === 'break' ? minutesText(step.budgetMs) : `${step.items.length} ${step.items.length === 1 ? 'item' : 'items'}, ${minutesText(step.budgetMs)}`),
      coach.length > 0 ? h('ul', { class: 'gu-coach' }, coach.map((line) => h('li', {}, line))) : null);
  });

  const scriptView = script.length === 0 && !script.sentence
    ? h('p', { class: 'gu-empty' }, 'There is no Word Book entry in the plan.')
    : h('div', { class: 'gu-script' },
      h('ol', { class: 'gu-script-words' }, script.map((entry) => h('li', { class: 'gu-script-word', 'data-word': entry.word },
        h('p', {}, entry.say),
        entry.cue ? h('p', { class: 'gu-script-cue' }, `Cue: ${entry.cue}.`) : null,
        h('p', { class: 'gu-script-listen' }, entry.listen),
        h('p', { class: 'gu-script-note' }, entry.counts ? 'This word counts toward the Writing check.' : 'Review word: not part of the check.')))),
      script.sentence ? h('div', { class: 'gu-script-sentence' },
        h('p', {}, `Say the sentence in short pieces: ${script.sentence.text}`),
        h('p', {}, 'Listen for a capital letter at the start and a full stop at the end.'),
        script.sentence.targets.length > 0 ? h('p', { class: 'gu-script-listen' }, `Check these words: ${script.sentence.targets.join(', ')}.`) : null) : null);

  const root = h('section', { class: 'gu-printable', 'data-print': 'script' },
    h('h2', { class: 'gu-subtitle' }, 'Word Book script'),
    h('p', { class: 'gu-hint' }, 'Read each word aloud. Your reader writes it on paper, then you check the page together.'),
    scriptView,
    h('p', { class: 'gu-hint gu-screen-only' }, saved ? 'These are the words in the lesson that is under way today.' : 'The lesson has not started, so this is a preview: the words may change when it does.'),
    h('button', { type: 'button', class: 'gu-button gu-small gu-screen-only', onClick: () => {
      const page = root.closest?.('.grownup');
      page?.setAttribute('data-printing', 'script');
      try { deps.print(); } finally { page?.removeAttribute('data-printing'); }
    } }, 'Print the Word Book script'));

  return [
    passLine,
    ...flags.map((text) => h('p', { class: 'gu-stall', role: 'note', 'data-part': 'stall' }, text)),
    heading,
    h('h2', { class: 'gu-subtitle' }, "Today's plan"),
    h('ol', { class: 'gu-steps' }, steps),
    root,
  ];
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'today');
  if (!body) return () => {};
  body.append(...todaySections(ctx));
  return () => {};
}
