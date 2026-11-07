import { h } from '../../core/dom.js';
import { createArrivalGuard, createLock } from '../../core/lock.js';
import { startOver } from '../../profile/start-over.js';
import { cornerFrame } from './gate.js';

export const START_OVER_WARNING = "This erases the placement check, every item's practice history, the gates passed, the crests, the passes and the Word Book pages earned. It cannot be undone.";
export const START_OVER_KEEPS = "These stay: the PIN and the other settings (the current stage too), the stage history, and your voice recordings. The grown-up tips show again, once each.";
export const STARTED_OVER = 'The progress is erased. The next session begins from the current stage, with nothing practised yet.';

export function startOverSection(ctx) {
  const lock = createLock();
  let arrival = createArrivalGuard();
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });

  const showWarning = (open) => {
    warning.hidden = !open;
    start.hidden = open;
    (open ? keep : start).focus();
    if (!open) return;
    arrival = createArrivalGuard();
    message.textContent = '';
    warning.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  const erase = () => lock.run(async () => {
    showWarning(false);
    try {
      message.textContent = (await startOver(ctx)) ? STARTED_OVER : 'Another window of the game is playing, so nothing was erased.';
    } catch (err) {
      console.error('The progress could not be erased', err);
      message.textContent = "Erasing didn't work in this browser window, so nothing was erased.";
    }
    message.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  });

  const start = h('button', { type: 'button', class: 'gu-button', onClick: () => showWarning(true) }, 'Start over…');
  const keep = h('button', { type: 'button', class: 'gu-button', onClick: () => showWarning(false) }, 'Keep the progress');
  const warning = h('div', { class: 'gu-confirm gu-start-over', hidden: true },
    h('p', {}, h('strong', {}, START_OVER_WARNING)),
    h('p', {}, START_OVER_KEEPS),
    h('div', { class: 'gu-row' },
      h('button', { type: 'button', class: 'gu-button', onClick: () => {
        lock.run(() => ctx.router.go('grownup/backup', { unlocked: true })).catch((err) => console.error('The Backup screen could not open', err));
      } }, 'Make a backup first'),
      keep),
    h('div', { class: 'gu-start-over-yes' },
      h('button', { type: 'button', class: 'gu-button gu-danger', onClick: ( event) => {
        if (arrival.allows(event)) erase();
      } }, 'Yes, erase the progress')));

  return h('section', { class: 'gu-setting', 'data-setting': 'start-over' },
    h('h2', { class: 'gu-setting-label' }, 'Start over'),
    h('p', { class: 'gu-help' }, 'Erases the progress so your reader begins again from the start. The button below only opens a warning; nothing is erased until you say yes there.'),
    start,
    warning,
    message);
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'start-over');
  if (body) body.append(startOverSection(ctx));
  return () => {};
}
