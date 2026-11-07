import { h } from '../core/dom.js';
import { createLock } from '../core/lock.js';
import { artImage, copilotBanner, lessonBar, passButton, setLessonBar, setUndo } from '../ui/components.js';
import { landName } from '../ui/terms.js';
import { STAGES } from '../curriculum/stages.js';
import { phonemeCodes } from '../curriculum/phonemes.js';
import { graphemeOf } from '../curriculum/graphemes.js';
import { LAST_STAGE } from '../profile/settings.js';
import { wordId } from '../core/voice-ids.js';
import { secondClick } from '../activities/kit.js';
import { coatOf, isCoat, readCoat } from '../profile/coat.js';
import { apprenticeArt } from './start.js';
import { cardLabel, soundLabels } from '../activities/soundcheck.js';
import {
  MAX_PROBE_ITEMS, PART_C_LOWER, applyPlacement, nextPlacementItem, partCWords, placementPlan, placementState, recordPlacement, suggestStage,
} from '../engine/placement.js';

export const GUESSES = Object.freeze([
  { id: 'beginning', label: 'Just beginning', hint: 'Short words, and long ones are new.' },
  { id: 'some long words', label: 'Some long words', hint: 'Reads some two-part words, not all kinds.' },
  { id: 'most types', label: 'Most types', hint: 'Reads long words of most kinds, with some slips.' },
]);

const LINES = Object.freeze({
  sound: 'v.placement.sound',
  word: 'v.placement.word',
  thanks: 'v.placement.thanks',
  paper: 'v.placement.paper',
  done: 'v.placement.done',
});

export function guessFor(stage) {
  return stage >= 12 ? 'most types' : stage >= 5 ? 'some long words' : 'beginning';
}

export function stageWords(n, terms) {
  const s = STAGES[n];
  if (!s) return '';
  return `${landName(s.land, terms)}: ${s.name}${s.short ? ` (like ${s.short})` : ''}`;
}

const soundsOf = (word) => soundLabels((Array.isArray(word?.segs) ? word.segs : []).flatMap(( seg) => phonemeCodes(seg?.[1])));

export function findings(state, a, c) {
  const wrong = c ? c.filter((m) => !m).length : 0;
  const suggested = suggestStage(state, c ?? []);
  return {
    suggested, base: state.suggested, lowered: c !== null && wrong >= PART_C_LOWER && suggested < state.suggested,
    partA: a.filter((x) => x.right).length, partB: state.count, partC: c ? c.filter(Boolean).length : null,
  };
}

export function placementPercent(part, { a = 0, aTotal = 0, b = 0, bMax = MAX_PROBE_ITEMS, c = 0, cTotal = 0 } = {}) {
  const share = (n, of) => (of > 0 ? Math.min(1, Math.max(0, n / of)) : 1);
  let thirds;
  if (part === 'result') return 100;
  if (part === 'A') thirds = share(a, aTotal);
  else if (part === 'B') thirds = 1 + share(b, bMax);
  else if (part === 'C') thirds = 2 + share(c, cTotal);
  else return 0;
  return Math.min(99, Math.round((100 * thirds) / 3));
}

export function mount(el, ctx, params = {}) {
  const retake = params.retake === true || params.retake === 'true' || params.retake === '1';
  const terms = ctx.settings?.terms;
  const lock = createLock();
  let alive = true;

  let plan = placementPlan(ctx.content, null);
  const st = {
    started: false, guess: guessFor(Number(ctx.settings?.stage) || 0), a: [], b: [], c: null, cDraft: [], chosen: null,
    stopping: false, thanks: false, busy: false,
  };
  let coat = coatOf(ctx);
  if (!isCoat(ctx?.coat)) readCoat(ctx).then((c) => { coat = c; }).catch(() => {});
  let homeLeave = null;
  const bar = lessonBar({ className: 'placement-bar', label: 'How much of the check is done' });
  let peak = 0;

  const backScene = () => (typeof params.back === 'string' && params.back !== '' ? params.back : retake ? 'grownup/today' : 'map');
  const go = (name) => {
    if (!alive) return Promise.resolve();
    const p = name.startsWith('grownup/') ? { unlocked: true } : {};
    return ctx.router.go(name, p).catch(( err) => console.error(`"${name}" could not open`, err));
  };

  const speak = (ids) => {
    try { Promise.resolve(ctx.audio?.playSeq?.(ids)).catch(() => {}); } catch { }
  };
  const replayOf = (ids) => { try { ctx.setReplay?.(ids); } catch { } };

  const unregisterHome = typeof ctx.onHome === 'function'
    ? ctx.onHome(( leave) => { homeLeave = leave; st.stopping = true; render(); })
    : null;


  const answers = () => st.b;
  const nextB = () => nextPlacementItem(plan, answers());
  const partCList = () => {
    const state = placementState(plan, answers());
    return partCWords(ctx.content, state.read ?? 0);
  };
  const phase = () => {
    if (!st.started) return 'intro';
    if (st.a.length < plan.partA.length) return 'A';
    if (nextB()) return 'B';
    if (st.c === null) return 'C';
    return 'result';
  };


  const adult = (...nodes) => h('div', { class: 'grownup placement-adult' },
    artImage('bg/grownup', 'scene-bg'),
    h('div', { class: 'gu-card placement-card', style: { maxWidth: '980px', margin: '24px auto', maxHeight: '90%', overflowY: 'auto' } }, ...nodes),
    stopButton());

  function stopButton() {
    return h('button', { type: 'button', class: 'gu-button gu-small placement-stop', 'data-act': 'stop',
      style: { position: 'absolute', top: '16px', right: '96px', opacity: '0.8' },
      onClick: () => { st.stopping = true; render(); } }, 'Stop the check');
  }

  function stopQuestion() {
    return adult(
      h('h1', { class: 'gu-title' }, 'Stop the check?'),
      h('p', {}, 'Nothing has been saved, and nothing will be. Your reader stays where they are now.'),
      h('div', { class: 'gu-row gu-wrap' },
        h('button', { type: 'button', class: 'gu-button gu-primary', 'data-act': 'stop-yes', onClick: () => { leave(); } }, 'Yes, stop'),
        h('button', { type: 'button', class: 'gu-button', 'data-act': 'stop-no', onClick: () => { st.stopping = false; homeLeave = null; render(); } }, 'Keep going')));
  }

  function leave() {
    if (!alive) return;
    const home = homeLeave;
    homeLeave = null;
    if (home) { home(); return; }
    void go(backScene());
  }

  function intro() {
    const buttons = GUESSES.map((g) => h('button', {
      type: 'button', class: 'gu-choice', 'data-guess': g.id, 'aria-pressed': String(st.guess === g.id), title: g.hint,
      onClick: () => { st.guess = g.id; render(); },
    }, g.label));
    return adult(
      h('h1', { class: 'gu-title' }, retake ? 'Placement check again' : 'Where should we begin?'),
      h('p', {}, 'This check takes about 8 minutes. Your reader reads sounds and words aloud and you mark each one on the grown-up strip. They see only "Thanks. Next one." and are never told how it went.'),
      h('p', {}, 'Nothing is saved until the end, when you choose where to start. You can stop at any time.'),
      retake ? h('p', { class: 'gu-hint' }, `Your reader is at ${stageWords(Math.min(LAST_STAGE, Math.max(0, Number(ctx.settings?.stage) || 0)), terms)}. A retake only measures, unless you press "Use this" at the end.`) : null,
      h('h2', {}, 'How does your reader read long words now?'),
      h('div', { class: 'gu-segmented', role: 'group', 'aria-label': 'Your guess' }, buttons),
      h('p', { class: 'gu-hint' }, GUESSES.find((g) => g.id === st.guess)?.hint ?? ''),
      h('div', { class: 'gu-row gu-wrap' },
        h('button', { type: 'button', class: 'gu-button gu-primary', 'data-act': 'start', onClick: begin }, 'Start the check')));
  }

  function begin() {
    plan = placementPlan(ctx.content, st.guess);
    st.started = true;
    st.a = [];
    st.b = [];
    st.c = null;
    st.cDraft = [];
    st.chosen = null;
    st.thanks = false;
    peak = 0;
    render();
    speak([LINES.sound]);
  }

  function childScreen(part, target, notes, mark, prompt) {
    const done = st.a.length + st.b.length > 0;
    const lockedMark = ( right, passed) => ( info) => {
      if (secondClick(info?.event)) return;
      if (st.busy) return;
      st.busy = true;
      try { mark(right, passed); } finally { st.busy = false; }
    };
    const banner = copilotBanner({
      kind: part === 'A' ? 'said' : 'read',
      helpText: 'Count it if your reader says it right with no help. Your reader is not told how it went.',
      onRight: lockedMark(true, false),
      onFixed: lockedMark(true, false),
      onNotYet: lockedMark(false, false),
      onHelp: () => {},
      onUndo: undo,
    });
    const help = banner.querySelector('.help');
    if (help) help.hidden = true;
    setUndo(banner, done);
    const kitten = h('button', { type: 'button', class: 'activity-kitten', 'aria-label': 'Hear it again', onClick: () => speak(prompt) }, artImage(apprenticeArt(coat)));
    return h('div', { class: ['activity', 'activity-placement'], 'data-part': part },
      artImage('bg/map', 'scene-bg'),
      h('div', { class: 'activity-work' },
        st.thanks ? h('p', { class: 'placement-thanks', role: 'status', style: { fontSize: '30px', margin: '0 0 12px' } }, 'Thanks. Next one.') : null,
        target,
        ...notes.map((n) => h('p', { class: 'grownup-text', style: { margin: '4px 0', fontSize: '22px', lineHeight: '1.35', color: 'var(--ink-soft, #555)' } }, n))),
      kitten, banner,
      passButton({ onPass: (event) => { if (!secondClick(event) && !st.busy) { st.busy = true; try { mark(false, true); } finally { st.busy = false; } } } }),
      stopButton());
  }

  function partAScreen() {
    const item = plan.partA[st.a.length];
    const card = h('div', { class: 'sound-card', role: 'img', 'aria-label': 'A letter card. Say its sound.', 'data-card': item.grapheme },
      h('span', { class: 'sound-card-label' }, cardLabel({ id: item.grapheme, g: graphemeOf(item.grapheme)?.g ?? item.grapheme })));
    const sounds = soundLabels(item.expected);
    return childScreen('A', card, [sounds ? `Grown-up: this card says ${sounds}.` : 'Grown-up: this card is a sound.'],
      (right, passed) => {
        st.a.push({ item, right, ...(passed ? { passed: true } : {}) });
        afterMark();
      }, [LINES.sound]);
  }

  function partBScreen() {
    const item = (nextB());
    const card = h('div', { class: 'word-card', lang: 'en', 'data-word': item.text, 'data-real': String(item.real) }, item.text);
    const notes = item.real ? [] : [`Grown-up: a made-up word. Count it if your reader sounds it out as written: ${soundsOf(item.word) || item.text}.`];
    return childScreen('B', card, notes, (right, passed) => {
      st.b.push({ item, correct: right, helped: false, passed });
      afterMark();
    }, [LINES.word]);
  }

  function afterMark() {
    st.thanks = true;
    const next = phase();
    render();
    if (next === 'A') speak([LINES.thanks]);
    else if (next === 'B') speak(st.b.length === 0 ? [LINES.thanks, LINES.word] : [LINES.thanks]);
    else if (next === 'C') speak([LINES.paper]);
  }

  function undo() {
    if (st.busy) return;
    if (st.b.length > 0) st.b.pop();
    else if (st.a.length > 0) st.a.pop();
    st.thanks = st.a.length + st.b.length > 0;
    render();
  }

  function partCScreen() {
    const words = partCList();
    if (words.length === 0) { st.c = []; return null; }
    if (st.cDraft.length !== words.length) st.cDraft = words.map(() => null);
    const rows = words.map((word, i) => {
      const mark = st.cDraft[i];
      const choice = (right, label) => h('button', {
        type: 'button', class: 'gu-choice', 'data-mark': `${i}:${right ? 'right' : 'notyet'}`, 'aria-pressed': String(mark === right),
        onClick: () => { st.cDraft[i] = right; render(); },
      }, label);
      return h('li', { class: 'placement-word', 'data-dictation': word.w, style: { margin: '14px 0' } },
        h('p', {}, h('strong', {}, word.w), word.cue ? ` (${word.cue})` : ''),
        h('p', { class: 'gu-hint' }, `Say: ${word.w}. Your reader says it back, taps the parts, then says each letter while writing it on paper.`),
        h('div', { class: 'gu-row gu-wrap' },
          h('button', { type: 'button', class: 'gu-button gu-small', 'data-hear': word.w, onClick: () => speak([wordId(word.w)]) }, 'Hear it'),
          choice(true, 'Written right'), choice(false, 'Not yet')));
    });
    const ready = st.cDraft.every((m) => m !== null);
    return adult(
      h('h1', { class: 'gu-title' }, 'Writing check'),
      h('p', {}, 'Dictate these three words, one at a time. Your reader writes each one on paper. Then mark each word. Your reader does not see these marks.'),
      h('ol', { class: 'placement-words' }, rows),
      h('div', { class: 'gu-row gu-wrap' },
        h('button', { type: 'button', class: 'gu-button gu-primary', 'data-act': 'c-next', disabled: !ready,
          onClick: () => { if (ready) { st.c = st.cDraft.map(Boolean); st.chosen = null; speak([LINES.done]); render(); } } }, 'See the result')));
  }

  function resultScreen() {
    const state = placementState(plan, answers());
    const f = findings(state, st.a, st.c);
    const current = Math.min(LAST_STAGE, Math.max(0, Number(ctx.settings?.stage) || 0));
    const chosen = st.chosen ?? f.suggested;
    const read = state.read;
    const lines = [
      h('li', {}, `Short-word sounds: ${f.partA} of ${plan.partA.length}. The ones missed come back as practice if you use this result.`),
      h('li', {}, read === null
        ? `Long words: your reader is not yet reading the first long-word stage (${state.count} words asked).`
        : `Long words: your reader read up to ${stageWords(read, terms)} (${state.count} words asked).`),
      f.partC === null || st.c?.length === 0 ? null
        : h('li', {}, `Writing: ${f.partC} of ${st.c?.length ?? 0} right.${f.lowered ? ' Two or more were not yet right, so the suggestion is one stage earlier.' : ''}`),
    ];
    const lands = [...new Set(STAGES.filter((s) => s.n <= LAST_STAGE).map((s) => s.land))];
    const groups = lands.map((land) => h('div', { class: 'placement-land', style: { margin: '10px 0' } },
      h('h3', { style: { margin: '0 0 6px' } }, landName(land, terms)),
      h('div', { class: 'gu-segmented', role: 'group', 'aria-label': landName(land, terms) },
        STAGES.filter((s) => s.land === land && s.n <= LAST_STAGE).map((s) => h('button', {
          type: 'button', class: 'gu-choice gu-small', 'data-stage-choice': String(s.n), 'aria-pressed': String(chosen === s.n),
          title: s.short ? `like ${s.short}` : '', onClick: () => { st.chosen = s.n; render(); },
        }, s.name)))));
    const moves = chosen > current ? 'Stages before it will be marked as known, and the first few lessons will check for gaps.'
      : chosen < current ? 'Your reader goes back to this place and works forward from there.' : 'This is where your reader is now.';
    return adult(
      h('h1', { class: 'gu-title' }, 'Suggested place to begin'),
      h('p', { class: 'placement-suggested', 'data-suggested': String(f.suggested), style: { fontSize: '28px', fontWeight: '700' } }, stageWords(f.suggested, terms)),
      h('ul', { class: 'placement-findings' }, lines),
      h('h2', {}, 'Choose another place'),
      h('p', { class: 'gu-hint' }, 'You know your reader best. The place you choose here is the one that is used.'),
      ...groups,
      h('p', { class: 'placement-chosen', 'data-chosen': String(chosen), role: 'status' }, `Chosen: ${stageWords(chosen, terms)}. ${moves}`),
      h('div', { class: 'gu-row gu-wrap' },
        h('button', { type: 'button', class: 'gu-button gu-primary', 'data-act': 'use', onClick: () => { void use(f, chosen); } }, 'Use this'),
        retake ? h('button', { type: 'button', class: 'gu-button', 'data-act': 'keep', onClick: () => { void keep(f, current); } }, 'Keep where we are') : null));
  }

  function itemRecord() {
    return [
      ...st.a.map((x) => ({ part: 'A', id: x.item.key, right: x.right })),
      ...st.b.map((x) => ({ part: 'B', id: x.item.key, stage: x.item.stage, right: x.correct === true && x.passed !== true })),
      ...(st.c ?? []).map((right, i) => ({ part: 'C', id: partCList()[i] ? `w:${partCList()[i].w}#write` : `c${i}`, right })),
    ];
  }

  async function use(f, chosen) {
    await lock.run(async () => {
      const wrong = (st.c ?? []).filter((m) => !m).length;
      const out = applyPlacement(ctx.profile, ctx.settings, ctx.states, ctx.content, {
        chosen, suggested: f.suggested, day: ctx.day, items: itemRecord(), partC: { wrong },
        partA: st.a.map((x) => ({ grapheme: x.item.grapheme, correct: x.right })),
      });
      ctx.profile = out.profile;
      ctx.settings = out.settings;
      ctx.states = out.states instanceof Map ? out.states : new Map(Object.entries(out.states));
      try { await ctx.save?.(); } catch (err) { console.error('The placement could not be saved', err); }
      await go('map');
    });
  }

  async function keep(f, current) {
    await lock.run(async () => {
      ctx.profile = recordPlacement(ctx.profile, { day: ctx.day, items: itemRecord(), suggested: f.suggested, chosen: current });
      try { await ctx.save?.(); } catch (err) { console.error('The placement could not be saved', err); }
      await go(backScene());
    });
  }


  function render() {
    if (!alive) return;
    let screen;
    const p = st.stopping ? 'stop' : phase();
    if (p === 'stop') { screen = stopQuestion(); replayOf(null); }
    else if (p === 'intro') { screen = intro(); replayOf(null); }
    else if (p === 'A') {
      screen = partAScreen();
      replayOf([LINES.sound]);
    } else if (p === 'B') {
      screen = partBScreen();
      replayOf([LINES.word]);
    } else if (p === 'C') {
      screen = partCScreen();
      if (!screen) { render(); return; }
      replayOf([LINES.paper]);
    } else { screen = resultScreen(); replayOf(null); }
    if (st.started) {
      const part = phase();
      peak = Math.max(peak, placementPercent(part, {
        a: st.a.length, aTotal: plan.partA.length, b: st.b.length, bMax: MAX_PROBE_ITEMS,
        c: st.c ? st.c.length : st.cDraft.filter((m) => m !== null).length, cTotal: st.c ? st.c.length : st.cDraft.length,
      }));
      setLessonBar(bar, peak);
      el.replaceChildren(screen, bar);
    } else el.replaceChildren(screen);
  }

  render();
  return () => {
    alive = false;
    unregisterHome?.();
    replayOf(null);
  };
}
