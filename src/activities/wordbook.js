import { h } from '../core/dom.js';
import { madeUpId, redId, sentenceId, wordId } from '../core/voice-ids.js';
import { parseKey } from '../engine/keys.js';
import { nextButton, scrollCue, speakerButton, takeBackButton, tile } from '../ui/components.js';
import { inkThumbnail, PADS, syllableDividers, usePaperToday, writesOnScreen, writingPad } from '../ui/writing-pad.js';
import { createActivityView, offerPass, sayPick, typeToPick } from './kit.js';

export const ID = 'wordbook';


const MARK = Object.freeze({ right: 'right', fixed: 'fixed', wrong: 'wrong' });

function wordVoice(item, content) {
  const parsed = parseKey(item.key);
  const word = String(item.data?.word ?? parsed?.id ?? '');
  try {
    if (parsed?.prefix === 'r') return redId(word);
    const rec = content?.byWord?.get?.(word);
    return rec && rec.real === false ? madeUpId(word) : wordId(word);
  } catch {
    return null;
  }
}

const partsOf = (content, word) => {
  const parts = content?.byWord?.get?.(word)?.parts;
  return Array.isArray(parts) && parts.length > 0 ? parts : [];
};

function letterBoxes(content, word) {
  const segs = content?.byWord?.get?.(word)?.segs;
  if (!Array.isArray(segs)) return [];
  const out = [];
  for (const seg of segs) for (const _ of String(seg?.[0] ?? '')) out.push(seg);
  return segs.map((seg) => String(seg?.[0] ?? '')).join('') === word ? out : [];
}

function tileContext(boxes, k, letter) {
  const seg = boxes[k];
  return seg && String(seg[0]).toLowerCase() === letter.toLowerCase() ? { seg } : undefined;
}

function coachLine(content, stage, n) {
  const lines = content?.coach?.[stage]?.wordbook;
  if (!Array.isArray(lines) || lines.length === 0) return '';
  const line = lines[n % lines.length];
  return typeof line === 'string' ? line : String(line?.text ?? '');
}

export function paperTiles(word, { onLetter = () => {}, paused = () => false } = {}) {
  const letters = [...word];
  const placed = [];
  const built = h('p', { class: 'wb-built', 'aria-live': 'polite' });
  const back = takeBackButton({ onBack: () => takeBack() });
  const draw = () => {
    built.textContent = placed.map((k) => letters[k]).join('');
    back.disabled = placed.length === 0 || paused();
  };
  const place = (k) => {
    if (paused()) return;
    placed.push(k);
    draw();
    onLetter(k, letters[k]);
  };
  const takeBack = () => {
    if (paused() || placed.length === 0) return;
    placed.pop();
    draw();
  };
  const typed = (label) => {
    const at = letters.findIndex((l, k) => l.toLowerCase() === label && !placed.includes(k));
    const k = at >= 0 ? at : letters.findIndex((l) => l.toLowerCase() === label);
    if (k >= 0) place(k);
  };
  const tray = h('div', { class: 'wb-tiles', role: 'group', 'aria-label': 'Backup letter tiles' },
    letters.map((letter, k) => tile({ label: letter, size: 110, onPick: () => place(k) })));
  const clear = h('button', { type: 'button', class: 'wb-clear', onClick: () => { if (paused()) return; placed.length = 0; draw(); } }, 'Clear');
  const el = h('div', { class: 'wb-paper' },
    h('p', { class: 'wb-paper-title' }, 'No paper handy? Use these tiles instead, or type the letters. They are not scored.'), tray,
    h('div', { class: 'wb-row' }, built, back), clear);
  draw();
  let listening = false;
  const listen = () => {
    if (listening) return;
    listening = true;
    typeToPick([...new Set(letters.map((l) => l.toLowerCase()))], typed, el, paused, takeBack);
  };
  return { el, listen };
}

export async function run(el, ctx, round, hooks) {
  const items = (round?.items ?? []).filter(( i) => i?.data?.word || i?.data?.sentence);
  if (items.length === 0) return;
  const content = ctx?.content;
  const view = createActivityView(el, ctx, { name: 'wordbook' });
  const say = async (id) => {
    if (!id || !view.live()) return;
    try { await (hooks?.say ?? ctx?.say)?.(id); } catch (err) { console.error(`Could not say ${id}`, err); }
  };
  const progress = (fraction) => hooks?.progress?.(fraction);

  try {
    say('v.wordbook.start');
    const passed = new Set();
    const inks = new Map();
    for (let i = 0; i < items.length; i++) {
      if (!view.live()) return;
      progress((i / items.length) * 0.7);
      const item = items[i];
      const sentence = item.data.sentence;
      const word = String(item.data.word ?? '');
      const voice = sentence ? sentenceId(sentence.id) : wordVoice(item, content);
      const parts = sentence ? [] : partsOf(content, word);
      const boxes = sentence ? [] : letterBoxes(content, word);

      const script = sentence
        ? [
          h('p', { class: 'wb-say' }, 'Say the sentence: ', h('strong', {}, sentence.text)),
          h('p', { class: 'wb-how' }, 'Your reader repeats it, then writes it in the Word Book, one word after another. A capital letter to start and a full stop to end.'),
          h('p', { class: 'wb-targets' }, `Listen for: ${(sentence.targets ?? []).join(', ')}`),
        ]
        : [
          h('p', { class: 'wb-say' }, 'Say: ', h('strong', {}, word)),
          h('p', { class: 'wb-how' }, 'Your reader repeats it, ', h('strong', {}, 'taps the syllables'),
            parts.length > 0 ? ` (${parts.join('-')})` : '', ', then says each letter while writing each syllable.'),
          item.data.cue ? h('p', { class: 'wb-cue' }, String(item.data.cue)) : null,
        ];
      const coach = coachLine(content, round.stage, i);
      const onScreen = writesOnScreen(ctx);
      let paper = null;
      const card = (withPad) => {
        paper = !withPad && ctx?.settings?.paperBackup === true && !sentence
          ? paperTiles(word, { onLetter: (k, letter) => { void sayPick(view, letter, tileContext(boxes, k, letter)); }, paused: () => view.lock.locked() })
          : null;
        return scrollCue(h('section', { class: ['wb-card', withPad && 'wb-compact', withPad && sentence && 'wb-long'], 'aria-label': 'Word Book script' },
        h('p', { class: 'wb-count' }, sentence ? 'The sentence' : `Word ${i + 1}`),
        script,
        coach ? h('p', { class: 'wb-coach' }, coach) : null,
        speakerButton({ onReplay: () => { say(voice); } }),
        paper?.el ?? null));
      };
      let writing = null;
      const toPaper = () => {
        usePaperToday(ctx);
        writing = null;
        view.show(card(false));
        paper?.listen();
      };
      if (onScreen) {
        writing = writingPad(sentence ? PADS.sentence : { ...PADS.dictated, dividers: syllableDividers(parts, PADS.dictated.w) },
          { height: sentence ? 170 : 190, label: sentence ? 'Write the sentence here.' : `Write the word ${word} here.`, onPaper: toPaper });
        writing.el.classList.add('wb-pad');
        view.show(card(true), writing.el);
      } else {
        view.show(card(false));
        paper?.listen();
      }
      say(voice);

      let clean = () => {};
      const outcome = await new Promise((resolve) => {
        const next = nextButton({ onNext: () => resolve('next') });
        view.root.append(next);
        next.focus();
        const stopPass = offerPass(view, () => resolve('pass'));
        clean = () => { next.remove(); stopPass(); };
      });
      clean();
      ctx?.audio?.stop?.();
      if (outcome === 'pass') {
        passed.add(item.key);
        hooks?.pass?.(item.key);
      } else if (writing && writing.strokes() > 0) {
        inks.set(item.key, { paths: writing.paths(), box: writing.box });
      }
    }
    if (!view.live()) return;

    const toCheck = items.filter((i) => !passed.has(i.key));
    if (toCheck.length === 0) return;
    progress(0.75);
    say('v.wordbook.check');
    const marks = await checkPage(view, toCheck, content, inks);
    if (!view.live()) return;

    let right = 0;
    let total = 0;
    let self = 0;
    for (const item of toCheck) {
      const entry = (marks.get(item.key));
      const sentence = item.data.sentence;
      if (sentence) {
        const wrong = entry.wrongTargets;
        const result = {
          correct: wrong.length === 0,
          ...(wrong.length > 0 ? { target: wrong.join(' ') } : {}),
          ...(wrong.length > 0 && entry.said !== '' ? { said: entry.said } : {}),
        };
        hooks?.record?.(item.key, item.mode, result);
        if (item.focus) {
          const targets = sentence.targets ?? [];
          total += targets.length;
          right += targets.length - wrong.length;
        }
      } else {
        const wrong = entry.mark === MARK.wrong;
        const fixed = entry.mark === MARK.fixed;
        hooks?.record?.(item.key, item.mode, {
          correct: !wrong,
          ...(fixed ? { self: true } : {}),
          ...(wrong && entry.said !== '' ? { said: entry.said } : {}),
        });
        if (item.focus) {
          total += 1;
          if (!wrong) right += 1;
          if (fixed) self += 1;
        }
      }
    }
    if (total > 0) hooks?.gate?.('write', { right, total, self });
    progress(1);
  } finally {
    view.destroy();
  }
}

function checkPage(view, items, content, inks) {
  return new Promise((resolve) => {
    const state = new Map();
    const boxes = new Map();
    const done = h('button', { type: 'button', class: ['copilot-choice', 'yes', 'wb-done'], disabled: true, onClick: () => {
      if (done.disabled) return;
      done.disabled = true;
      for (const [key, entry] of state) entry.said = String(boxes.get(key)?.value ?? '').trim();
      resolve(state);
    } }, h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, '✓'), h('span', {}, 'Done'));
    const foot = h('div', { class: 'wb-foot' }, done);
    const refresh = () => {
      done.disabled = !items.every((i) => i.data.sentence || state.get(i.key)?.mark);
    };

    const thumb = (key) => {
      const ink = inks.get(key);
      return ink ? inkThumbnail(ink.paths, ink.box, 44) : null;
    };

    const rows = items.map((item) => {
      const entry = { mark: '', said: '', wrongTargets: ([]), tick: false };
      state.set(item.key, entry);
      const box = h('input', { type: 'text', class: 'wb-wrote', 'aria-label': 'What they wrote (optional)', placeholder: 'What they wrote (optional)', hidden: true });
      boxes.set(item.key, box);
      const sentence = item.data.sentence;
      if (sentence) {
        const targets = h('div', { class: 'wb-target-row', role: 'group', 'aria-label': 'Target words written wrong' },
          (sentence.targets ?? []).map(( w) => {
            const b = h('button', { type: 'button', class: 'wb-target', 'data-word': w, 'aria-pressed': 'false',
              onClick: () => {
                const wrong = !entry.wrongTargets.includes(w);
                entry.wrongTargets = wrong ? [...entry.wrongTargets, w] : entry.wrongTargets.filter((x) => x !== w);
                b.setAttribute('aria-pressed', String(wrong));
                box.hidden = entry.wrongTargets.length === 0;
              } }, w);
            return b;
          }));
        const tick = h('button', { type: 'button', class: 'wb-tick', 'aria-pressed': 'false',
          onClick: () => { entry.tick = !entry.tick; tick.setAttribute('aria-pressed', String(entry.tick)); } },
        'Capital letter and full stop (not scored)');
        entry.mark = MARK.right;
        return h('li', { class: 'wb-row wb-sentence', 'data-key': item.key },
          h('p', { class: 'wb-row-title' }, sentence.text),
          thumb(item.key),
          h('p', { class: 'wb-row-help' }, 'Tap any target word that was written wrong.'), targets, tick, box);
      }
      const word = String(item.data.word ?? '');
      const buttons = [];
      const choice = (mark, cls, glyph, label) => {
        const b = h('button', { type: 'button', class: ['copilot-choice', cls, 'wb-mark'], 'data-mark': mark, 'data-word': word, 'aria-pressed': 'false',
          onClick: () => {
            entry.mark = mark;
            for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
            box.hidden = mark !== MARK.wrong;
            refresh();
          } },
        h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, glyph), h('span', {}, label));
        buttons.push(b);
        return b;
      };
      const parts = partsOf(content, word);
      return h('li', { class: 'wb-row wb-word', 'data-key': item.key },
        h('div', { class: 'wb-title-cell' },
          h('p', { class: 'wb-row-title' }, word, parts.length > 1 ? h('span', { class: 'wb-parts' }, ` (${parts.join('-')})`) : null,
            item.focus ? null : h('span', { class: 'wb-review' }, ' review')),
          thumb(item.key)),
        h('div', { class: 'wb-marks' }, choice(MARK.right, 'yes', '✓', 'Right'), choice(MARK.fixed, 'fixed', '↺', 'Fixed it'), choice(MARK.wrong, 'notyet', '✗', 'Not yet')),
        box);
    });
    refresh();
    view.show(h('section', { class: 'wb-check', 'aria-label': 'Check the page' },
      h('h2', { class: 'wb-check-title' }, 'Check the page'),
      h('p', { class: 'wb-check-help' }, 'Look at the Word Book page with your reader. Mark each word.'),
      scrollCue(h('ol', { class: 'wb-rows' }, rows), { arrowIn: foot }), foot));
  });
}
