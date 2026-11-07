import { h } from '../core/dom.js';
import { noMenu, scrollCue } from '../ui/components.js';

export const LONG_PRESS_MS = 500;

export const MARK = Object.freeze({ ok: 'ok', missed: 'missed', fixed: 'fixed' });

export function passageLines(text) {
  return String(text ?? '').trim().split(/(?<=[.!?]["”’']?)\s+(?=["“‘']?[A-Z])/).filter(line => line !== '');
}

export function passageWords(text) {
  return passageLines(text).flatMap((line, at) => line.split(/\s+/).filter(Boolean).map(word => ({ text: word, line: at })));
}


const bare = (word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

export function tally(words, marks) {
  const at = ( i) => marks[i] ?? MARK.ok;
  const missedAt = words.map((_, i) => i).filter(i => at(i) === MARK.missed);
  const fixedAt = words.map((_, i) => i).filter(i => at(i) === MARK.fixed);
  const right = words.length - missedAt.length;
  return {
    words: words.length,
    missed: missedAt.length,
    fixed: fixedAt.length,
    right,
    accuracyPct: words.length === 0 ? 0 : Math.round((right / words.length) * 100),
    missedSentences: [...new Set(missedAt.map(i => words[i].line))].sort((a, b) => a - b),
    missedWords: missedAt.map(i => bare(words[i].text)),
    fixedWords: fixedAt.map(i => bare(words[i].text)),
  };
}

export function missCounter({ text, onDone, title, doneLabel = 'Done', longPressMs = LONG_PRESS_MS }) {
  const words = passageWords(text);
  const marks = words.map(() => MARK.ok);
  let finished = false;
  const summary = h('p', { class: 'miss-summary', 'aria-live': 'polite' });
  const refresh = () => {
    const t = tally(words, marks);
    summary.textContent = `${t.missed} missed, ${t.fixed} fixed it`;
  };
  const paint = (el, i) => {
    el.setAttribute('data-state', marks[i]);
    el.setAttribute('aria-label', marks[i] === MARK.ok ? words[i].text : `${words[i].text}, ${marks[i] === MARK.missed ? 'missed' : 'fixed it'}`);
  };
  const mark = (i, to) => { marks[i] = marks[i] === to ? MARK.ok : to; };

  const buttons = words.map((word, i) => {
    let hold;
    let held = false;
    const button = h('button', { type: 'button', class: 'miss-word',
      onContextmenu: noMenu,
      onClick: () => {
        if (finished) return;
        if (held) { held = false; return; }
        mark(i, MARK.missed);
        paint(button, i);
        refresh();
      },
      onPointerdown: ( event) => {
        if (finished || (event.button ?? 0) !== 0) return;
        clearTimeout(hold);
        held = false;
        hold = setTimeout(() => {
          held = true;
          mark(i, MARK.fixed);
          paint(button, i);
          refresh();
        }, longPressMs);
      },
      onKeydown: ( event) => {
        if (finished || event.key.toLowerCase() !== 'f' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        mark(i, MARK.fixed);
        paint(button, i);
        refresh();
      },
    }, word.text);
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(type, () => clearTimeout(hold));
    paint(button, i);
    return button;
  });

  const lines = [];
  buttons.forEach((button, i) => {
    const line = words[i].line;
    (lines[line] ??= h('p', { class: 'miss-line' })).append(button, ' ');
  });
  const done = h('button', { type: 'button', class: ['copilot-choice', 'yes', 'miss-done'], onClick: () => {
    if (finished) return;
    finished = true;
    done.disabled = true;
    onDone(tally(words, marks));
  } }, h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, '✓'), h('span', {}, doneLabel));
  refresh();

  return h('div', { class: 'miss-counter', role: 'group', 'aria-label': 'Count the missed words' },
    h('p', { class: 'miss-title' }, title ?? 'Tap any word your reader missed. Tap again to clear it. Hold a word if it was fixed on the spot.'),
    scrollCue(h('div', { class: 'miss-passage' }, lines)),
    h('div', { class: 'miss-foot' }, summary, done));
}
