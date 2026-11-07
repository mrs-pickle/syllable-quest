import { h } from '../core/dom.js';

export const GROWNUP_TIPS = Object.freeze(['copilot.turn', 'copilot.turn.said', 'copilot.wait', 'copilot.hint', 'copilot.rule', 'copilot.th']);

export const TURN_TIPS = Object.freeze({
  read: Object.freeze(['copilot.turn', 'copilot.rule']),
  said: Object.freeze(['copilot.turn.said', 'copilot.rule']),
});
export const HELP_TIPS = Object.freeze(['copilot.wait', 'copilot.hint']);
export const TH_TIPS = Object.freeze(['copilot.th']);

const POINTS_AT = Object.freeze({
  'copilot.turn': 'yes', 'copilot.turn.said': 'yes', 'copilot.rule': 'yes', 'copilot.th': 'yes',
  'copilot.wait': 'help', 'copilot.hint': 'help',
});

export const shouldShowTip = (seen, id) => GROWNUP_TIPS.includes(id) && seen?.[id] !== true;

export const markTipSeen = (seen, id) => ({ ...seen, [id]: true });

export function tipBox({ id, text, onDismiss, controls = [] }) {
  let open = true;
  const dismiss = () => {
    if (!open) return;
    open = false;
    for (const control of controls) control.removeEventListener('click', dismiss);
    box.remove();
    onDismiss?.(id);
  };
  const box = h('div', { class: 'tip-box', role: 'note', 'data-tip': id },
    h('p', { class: 'tip-text' }, text),
    h('button', { type: 'button', class: 'tip-close', 'aria-label': 'Close this tip', onClick: dismiss }, '×'));
  for (const control of controls) control.addEventListener('click', dismiss);
  return box;
}

function aim(box, control) {
  const frame = globalThis.requestAnimationFrame;
  if (!control || typeof frame !== 'function') return;
  frame(() => {
    if (typeof box.getBoundingClientRect !== 'function' || !box.isConnected) return;
    const from = box.getBoundingClientRect();
    const to = control.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const scale = box.offsetWidth / from.width;
    const x = (to.left + to.width / 2 - from.left) * scale;
    box.style.setProperty('--point', `${Math.round(Math.min(box.offsetWidth - 28, Math.max(28, x)))}px`);
  });
}

const tipText = (ctx, id) => {
  const line = ctx?.content?.voice?.[id];
  return typeof line === 'string' ? line : line?.text;
};

function remembering(ctx) {
  let queued = false;
  return (id) => {
    ctx.settings = { ...ctx.settings, tipsSeen: markTipSeen(ctx.settings?.tipsSeen, id) };
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      Promise.resolve(ctx.save?.()).catch(( err) => console.error('The grown-up tips could not be saved', err));
    });
  };
}

export function offerTips(ctx, host, ids) {
  const slot = host.querySelector('.copilot-tips') ?? host;
  const controls = host.querySelectorAll('.copilot-choice');
  const remember = remembering(ctx);
  const boxes = ids
    .filter((id) => shouldShowTip(ctx?.settings?.tipsSeen, id) && typeof tipText(ctx, id) === 'string'
      && !slot.querySelector(`[data-tip="${id}"]`))
    .map((id) => tipBox({ id, text: tipText(ctx, id), controls: [...controls], onDismiss: remember }));
  for (const box of boxes) {
    box.setAttribute('data-at', POINTS_AT[box.getAttribute('data-tip') ?? ''] ?? 'yes');
    slot.append(box);
  }
  const last = boxes.at(-1);
  if (last) aim(last, [...controls].find((c) => c.classList.contains(last.getAttribute('data-at') ?? '') && !c.hidden));
  return boxes;
}
