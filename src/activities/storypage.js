import { h } from '../core/dom.js';
import { passageSentenceId, wordId } from '../core/voice-ids.js';
import { gatePassed } from '../engine/mastery.js';
import { missCounter, passageLines, passageWords } from '../scenes/miss-counter.js';
import { artImage, grownupNote, nextButton, scrollCue } from '../ui/components.js';
import { createActivityView, judgeAloud, runRound, wait } from './kit.js';

export const ID = 'storypage';

export const RESTORE_MS = 700;

const BAR = Object.freeze({ preview: 0.3, echo: 0.45 });

const plain = (word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();

export function focusCounts(text, focus, missedWords) {
  const set = new Set(focus.map(plain));
  return {
    focusTotal: passageWords(text).filter((w) => set.has(plain(w.text))).length,
    focusMissed: missedWords.filter((w) => set.has(plain(w))).length,
  };
}

export async function run(el, ctx, round, hooks) {
  const item = (round?.items ?? []).find(( i) => typeof i?.data?.passage === 'string');
  if (!item) return;
  const content = ctx?.content;
  const passage = (content?.passages ?? []).find(( p) => p?.id === item.data.passage);
  if (!passage) return;
  const text = String(passage.text ?? '');
  const lines = passageLines(text);
  const focus = (Array.isArray(passage.focus) ? passage.focus : []).map(String);

  const view = createActivityView(el, ctx, { name: 'storypage', bg: passage.land ? `bg/${passage.land}` : 'bg/map' });
  const say = async (id) => {
    if (!id || !view.live()) return;
    try { await (hooks?.say ?? ctx?.say)?.(id); } catch (err) { console.error(`Could not say ${id}`, err); }
  };
  const progress = (fraction) => hooks?.progress?.(fraction);
  const pressNext = () => new Promise((resolve) => {
    const next = nextButton({ onNext: () => { next.remove(); ctx?.audio?.stop?.(); resolve(); } });
    view.root.append(next);
    next.focus();
  });

  try {
    const preview = Array.isArray(item.data.preview) ? item.data.preview.filter(( w) => w && typeof w.w === 'string') : [];
    if (preview.length > 0) {
      say('v.storypage.preview');
      const log = [];
      const counted = {
        ...hooks,
        record( key, mode, result, opts) {
          if (opts?.scored !== false && opts?.monitor !== false && result?.passed !== true) log.push({ key: `${key}#${mode}`, result });
          return hooks?.record?.(key, mode, result, opts);
        },
        undo() {
          log.pop();
          return hooks?.undo?.();
        },
        pass( id, mode) {
          return hooks?.pass?.(mode && !id.includes('#') ? `${id}#${mode}` : id);
        },
        progress: ( f) => progress(f * BAR.preview),
      };
      const words = new Map(preview.map(( w) => [w.w, w]));
      await runRound(view, { items: preview.map(( w) => ({ id: `w:${w.w}`, mode: 'read', isNew: false, isReview: false })) }, counted, {
        undo: true,
        easy: () => null,
        async play(planned, { canUndo }) {
          const word = words.get(planned.id.slice(2));
          if (!word) return null;
          const card = h('p', { class: 'story-word', 'data-word': word.w }, word.w);
          view.show(h('section', { class: 'story-preview', 'aria-label': 'Read this word' }, card));
          view.think(true);
          const result = await judgeAloud(view, { kind: 'read', model: [wordId(word.w)], target: card, praise: 'story', canUndo,
            coach: (ctx?.content?.coach?.[round.stage]?.storypage?.[0]?.text) });
          view.think(false);
          return result;
        },
      });
      if (!view.live()) return;
      const first = new Map();
      for (const entry of log) if (!first.has(entry.key)) first.set(entry.key, entry.result);
      let right = 0;
      let self = 0;
      for (const result of first.values()) {
        if (result.correct && !result.helped) { right++; if (result.self) self++; }
      }
      if (first.size > 0) hooks?.gate?.('words', { right, total: first.size, self });
    }
    progress(BAR.preview);

    const echo = (Array.isArray(item.data.echo) ? item.data.echo : []).filter(( k) => Number.isInteger(k) && k >= 0 && k < lines.length);
    if (echo.length > 0) {
      say('v.storypage.echo');
      for (let n = 0; n < echo.length; n++) {
        if (!view.live()) return;
        const k = echo[n];
        view.show(scrollCue(h('section', { class: 'story-echo', 'aria-label': 'Echo reading' },
          h('p', { class: 'story-echo-line' }, lines[k]),
          h('p', { class: 'story-echo-help' }, 'The Keeper reads it first. Then your reader reads it back. This is not scored.'))));
        say(passageSentenceId(passage.id, k + 1));
        await pressNext();
        progress(BAR.preview + ((n + 1) / echo.length) * (BAR.echo - BAR.preview));
      }
    }
    if (!view.live()) return;
    progress(BAR.echo);

    say('v.storypage.read');
    const tally = await new Promise((resolve) => {
      const counter = missCounter({ text, onDone: resolve,
        title: 'Tap any word your reader missed. Tap again to clear it. Hold a word if it was fixed on the spot.' });
      view.show(h('section', { class: 'story-passage', 'aria-label': passage.title ?? 'The story page' },
        passage.title ? h('h2', { class: 'story-title' }, String(passage.title)) : null, counter));
    });
    if (!view.live()) return;

    const { focusTotal, focusMissed } = focusCounts(text, focus, tally.missedWords);
    const counts = {
      right: tally.right, total: tally.words, self: tally.fixed,
      focusRight: focusTotal - focusMissed, focusTotal,
      passage: passage.id, missedSentences: tally.missedSentences,
    };
    const missed = new Set(tally.missedWords.map(plain));
    for (const word of focus) {
      if (missed.has(plain(word))) hooks?.record?.(`w:${word}`, 'read', { correct: false, helped: false });
    }
    hooks?.gate?.('story', counts);
    const passed = gatePassed({ kind: 'story', right: counts.right, total: counts.total, focusRight: counts.focusRight, focusTotal: counts.focusTotal });
    progress(0.95);

    const summary = grownupNote(`Grown-up: accuracy ${tally.accuracyPct}% (${tally.right} of ${tally.words} words). This is for you, not for your reader.`, { className: 'story-summary' });
    if (passed) {
      const page = h('div', { class: 'story-page', 'data-state': 'torn' }, artImage('ui-sq/page-torn', 'story-page-art'));
      view.show(scrollCue(h('section', { class: 'story-result story-passed', 'aria-label': 'The page is coming back' }, page, summary)));
      await Promise.all([say('v.storypage.restoring'), wait(RESTORE_MS)]);
      if (!view.live()) return;
      page.replaceChildren(artImage('ui-sq/page-whole', 'story-page-art restored'));
      page.setAttribute('data-state', 'whole');
      view.cheer();
      await say('v.storypage.pass');
    } else {
      view.show(scrollCue(h('section', { class: 'story-result story-growth', 'aria-label': 'The page will be ready next time' },
        h('p', { class: 'story-growth-line' }, "A mistake means a pattern we haven't practised enough yet. This page will be ready next time."), summary)));
      await say('v.storypage.growth');
    }
    if (!view.live()) return;
    progress(1);
    await pressNext();
  } finally {
    view.destroy();
  }
}
