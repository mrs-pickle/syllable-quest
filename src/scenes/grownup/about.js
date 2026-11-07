import { h } from '../../core/dom.js';
import { cornerFrame } from './gate.js';
import { PRINT_TIP } from './tips.js';

export const TITLE = "Meadowlark's World: Syllable Quest";

export const METHOD_LINE = 'Syllable Quest is built on Orton-Gillingham principles.';
export const AUDIENCE_LINE = 'Syllable Quest is for readers who need more practice with long words.';

export const WHAT_IT_IS = Object.freeze([
  METHOD_LINE,
  AUDIENCE_LINE,
  'It is a home practice game for reading long words, played with a grown-up beside your reader. It practices only what has been taught, one syllable type at a time, across six lands.',
]);

export const HOW_IT_WORKS = Object.freeze([
  ['You are the judge', 'The game does no speech scoring and no handwriting scoring. A grown-up sits beside your reader, listens, looks at the paper and presses what happened: right, fixed it, or not yet.'],
  ['What counts as mastering a stage', 'Each stage has four checks: sounds, words, writing and a short story. A check counts only when it is passed on two different days. A story passes at 95% right, and only when the words with the new pattern are right too (at least nine in ten of them), so a story cannot pass when its pattern words are missed.'],
  ['Moving on', 'When all four checks are passed, the game moves to the next stage at the start of the next session. A check that is not passed after three tries gets extra practice and a note for you on the Today and Progress screens. You can move the current stage yourself in Settings.'],
  ['Our practice settings', 'A session is about 20 minutes by default (15 or 25 in Settings), with movement breaks between parts. Old sounds and words come back on a schedule so they stay secure, and nothing is practiced that has not been taught. Long-word splitting practice follows how secure your reader is, unless you set a number.'],
  ['No speed', 'There are no timers, no speed scores and no words-per-minute anywhere. Praise and rewards come from accuracy only.'],
]);

export const PRIVACY = 'Names, progress and settings stay in this browser on this computer. Nothing is sent anywhere: there are no accounts, ads or tracking, and the game works without a connection once it has loaded. Use Backup to keep a copy, and Restore to bring it back.';

export const NOTICES = Object.freeze([
  "Created to align with UFLI Foundations' scope and sequence. The game's stories, sentences, art and audio are original and were not created or endorsed by UFLI.",
  'Andika (SIL Open Font License 1.1): the typeface used for all text.',
  'Kokoro-82M (Apache-2.0): the speech model used to make the narrator\'s voice clips, on the build computer.',
  'LJSpeech (public domain): the speech recordings behind the long e sound and the f, s and sh sounds.',
  'HiFi-GAN (MIT): the vocoder used to make the long e sound, on the build computer.',
  'CMUdict (BSD-2-Clause): the pronunciation dictionary used to check word pronunciations.',
]);

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'about');
  if (!body) return () => {};
  body.append(
    h('section', { class: 'gu-about', 'data-about': 'what' },
      h('h2', { class: 'gu-subtitle gu-about-title' }, TITLE),
      WHAT_IT_IS.map((line) => h('p', {}, line))),
    h('section', { class: 'gu-about', 'data-about': 'how' },
      h('h2', { class: 'gu-subtitle' }, 'How it works'),
      HOW_IT_WORKS.map(([heading, text]) => h('div', { class: 'gu-how' }, h('h3', { class: 'gu-setting-label' }, heading), h('p', {}, text)))),
    h('section', { class: 'gu-about', 'data-about': 'privacy' },
      h('h2', { class: 'gu-subtitle' }, 'Privacy'),
      h('p', {}, PRIVACY)),
    h('p', {}, PRINT_TIP),
    h('h2', { class: 'gu-subtitle' }, 'Notices'),
    h('p', {}, NOTICES[0]),
    h('p', {}, 'Third-party material used in this game:'),
    h('ul', { class: 'gu-notices' }, NOTICES.slice(1).map((notice) => h('li', {}, notice))));
  return () => {};
}
