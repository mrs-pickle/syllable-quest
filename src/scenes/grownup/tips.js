import { h } from '../../core/dom.js';
import { COPILOT_HELP } from '../../ui/components.js';
import { cornerFrame } from './gate.js';

export const STOP_TIP = 'To stop part-way, press the Home button (the house), or close the tab. The steps your reader finished are kept, and the next session carries on from the next step.';
export const PRINT_TIP = 'To print the Word Book cover, the land map or the crest stickers, open Word Book printables and use your browser\'s print.';

export const UNDO_TIP = 'Tapped by mistake? Press ↶ Undo. It takes back your last tap, and the word comes up again.';
export const CONTINUE_TIP = 'At the end of a part, you get one more step: Continue or Undo. Press 1 or Enter to go on.';
export const PASS_TIP = 'Stuck? Press → Pass (key 4). It is not scored, and it comes back at the end of the lesson and early in a later one.';

export const TIPS = Object.freeze([
  COPILOT_HELP,
  'Say "check each sound" instead of giving your reader the word.',
  'Praise effort specifically: name what your reader did ("You checked every sound before you said it").',
  'Never compare your reader with other children, or with how fast anyone else reads.',
  'This game supplements tutoring; it does not replace it.',
]);

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'tips');
  if (!body) return () => {};
  body.append(
    h('ul', { class: 'gu-tips' }, TIPS.map((tip) => h('li', {}, (tip)))),
    h('h2', { class: 'gu-subtitle' }, "On the Grown-up's turn"),
    h('p', {}, 'Press 1 for ✓ Right, 2 for ↻ Fixed it, 3 for ✗ Not yet, h for Help, and u for Undo, without reaching for the trackpad. The "?" on the banner shows the scoring rule.'),
    h('p', {}, UNDO_TIP),
    h('p', {}, CONTINUE_TIP),
    h('p', {}, PASS_TIP),
    h('p', {}, 'Before each session, "Grown-up playing today?" has Yes or No. On days with no grown-up, choose No: those moments become self-checks and are not scored. (Settings has the usual answer.)'),
    h('h2', { class: 'gu-subtitle' }, 'Stopping and printing'),
    h('p', {}, (STOP_TIP)),
    h('p', {}, (PRINT_TIP)));
  return () => {};
}
