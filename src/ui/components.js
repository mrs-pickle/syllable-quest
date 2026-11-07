import { artFile } from '../core/art-file.js';
import { h } from '../core/dom.js';

export const COPILOT_TURN = Object.freeze({
  read: "Grown-up's turn: did your reader read it?",
  said: "Grown-up's turn: did your reader say it?",
});

export const COPILOT_HELP = 'Count it if your reader read the right word. Wait 5 seconds before helping.';

export const artUrl = (id) => `assets/art/${artFile(id)}`;

let artCatalog = null;

export function setArtCatalog(ids) {
  artCatalog = ids ? new Set(ids) : null;
}

export const artMissing = (id) => artCatalog !== null && !artCatalog.has(id);

export function missingArtCard(id, className) {
  return h('div', { class: ['art-missing', className], role: 'img', 'aria-label': `Picture to come: ${id}`, 'data-art': id },
    h('span', { class: 'art-missing-label' }, id.replace('/', ' · ')));
}

const PORTRAIT = /^(apprentice|break)\//;

export function artImage(id, className) {
  if (artMissing(id)) return missingArtCard(id, className);
  const img = h('img', { class: [PORTRAIT.test(id) && 'portrait-art', className], src: artUrl(id), alt: '', draggable: 'false' });
  img.addEventListener('error', () => img.replaceWith(missingArtCard(id, className)));
  return img;
}

const picture = artImage;

function pop(el) {
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

export function speakerButton({ onReplay }) {
  return h('button', { type: 'button', class: 'speaker-button', 'aria-label': 'Hear it again', onClick: () => onReplay?.() },
    picture('ui/speaker'));
}

export function lessonBar({ className, label = "How much of today's lesson is done" } = {}) {
  const bar = h('div', { class: ['lesson-bar', className], role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100' },
    h('div', { class: 'lesson-bar-fill' }),
    h('span', { class: 'lesson-bar-label', 'aria-hidden': 'true' }, '0%'));
  setLessonBar(bar, 0);
  return bar;
}

export function setLessonBar(bar, percent) {
  const n = Math.min(100, Math.max(0, Math.floor(Number.isFinite(percent) ? percent : 0)));
  bar.setAttribute('aria-valuenow', String(n));
  bar.style.setProperty('--done', `${n}%`);
  const label = bar.querySelector('.lesson-bar-label');
  if (label) label.textContent = `${n}%`;
}

export function tile({ label, onPick, size = 120 }) {
  const face = Math.max(110, size);
  const font = Math.min(130, Math.max(96, Math.round(face * 0.8)));
  return h('button', { type: 'button', class: 'tile', 'data-label': label, style: { '--tile': `${face}px`, '--tile-font': `${font}px` },
    onClick: () => onPick?.(label) }, h('span', { class: 'tile-label' }, label));
}

export function takeBackButton({ onBack }) {
  const button = (h('button', { type: 'button', class: 'take-back', 'aria-label': 'Take back a letter', 'aria-keyshortcuts': 'Backspace',
    onClick: () => { if (button.disabled) return; pop(button); onBack?.(); } }, h('span', { class: 'take-back-mark', 'aria-hidden': 'true' }, '⌫')));
  return button;
}

export function keysOnPage(control, onKey) {
  const doc = globalThis.document;
  let seen = control.isConnected;
  const here = () => {
    if (control.isConnected) seen = true;
    else if (seen) stop();
    return control.isConnected;
  };
  const listener = (event) => { if (here() && !control.closest?.('[data-keys-held]')) onKey(event); };
  const page = new globalThis.MutationObserver(here);
  const stop = () => {
    page.disconnect();
    doc.removeEventListener('keydown', listener);
  };
  doc.addEventListener('keydown', listener);
  page.observe(doc.body, { childList: true, subtree: true });
  return stop;
}

export function nextButton({ onNext }) {
  let pressed = false;
  const button = (h('button', { type: 'button', class: 'next-button', 'aria-keyshortcuts': 'Enter ArrowRight',
    onClick: () => {
      if (pressed) return;
      pressed = true;
      onNext?.();
    } }, h('span', { class: 'next-label' }, 'Next'), h('span', { class: 'next-arrow', 'aria-hidden': 'true' })));
  keysOnPage(button, (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== 'Enter' && event.key !== 'ArrowRight') return;
    const target = (event.target);
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.key === 'Enter' && target?.closest?.('button, a')) return;
    event.preventDefault();
    button.click();
  });
  return button;
}

export function passButton({ onPass }) {
  return h('button', { type: 'button', class: 'pass-button', onClick: ( event) => onPass?.(event) },
    h('span', { class: 'pass-mark', 'aria-hidden': 'true' }, '→'), h('span', {}, 'Pass'));
}

let bannerCount = 0;

const bannerState = new WeakMap();


export function copilotBanner({ onRight, onFixed, onNotYet, onHelp, onUndo, helpText = COPILOT_HELP, kind = 'read', coach, chips = [] }) {
  const help = h('p', { class: 'copilot-help', id: `copilot-help-${++bannerCount}`, hidden: true }, helpText);
  const rule = h('button', { type: 'button', class: 'copilot-rule', 'aria-label': 'How to judge', 'aria-expanded': 'false', 'aria-controls': help.id,
    onClick: () => { help.hidden = !help.hidden; rule.setAttribute('aria-expanded', String(!help.hidden)); } }, '?');
  const keys = {};
  const takeSaid = () => {
    const state = (bannerState.get(banner));
    const said = state.said ?? undefined;
    state.said = null;
    state.list.hidden = true;
    state.toggle.setAttribute('aria-expanded', 'false');
    for (const chip of state.list.querySelectorAll('.copilot-chip')) chip.setAttribute('aria-pressed', 'false');
    return said;
  };
  const choice = (key, cls, mark, label, fn) => {
    const button = h('button', { type: 'button', class: ['copilot-choice', cls], 'aria-keyshortcuts': key,
      onClick: ( event) => { pop(button); fn?.({ event, said: takeSaid() }); } },
    h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, mark), h('span', {}, label), h('kbd', { 'aria-hidden': 'true' }, key));
    keys[key] = button;
    return button;
  };
  const undo = onUndo
    ? h('button', { type: 'button', class: 'copilot-undo', hidden: true, 'aria-label': 'Undo the last tap', 'aria-keyshortcuts': 'u',
      onClick: () => { pop(undo); onUndo(); } },
    h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, '↶'), h('span', {}, 'Undo'), h('kbd', { 'aria-hidden': 'true' }, 'u'))
    : null;
  if (undo) keys.u = undo;
  const list = h('div', { class: 'copilot-chips', role: 'group', 'aria-label': 'What did they say?', hidden: true });
  const toggle = h('button', { type: 'button', class: 'copilot-said', 'aria-expanded': 'false',
    onClick: () => { list.hidden = !list.hidden; toggle.setAttribute('aria-expanded', String(!list.hidden)); } }, 'What did they say?');
  const banner = h('div', { class: 'copilot-banner', role: 'group', 'aria-label': "Grown-up's turn" },
    h('p', { class: 'copilot-title' }, COPILOT_TURN[kind] ?? COPILOT_TURN.read),
    h('div', { class: 'copilot-tips' }),
    h('p', { class: 'copilot-coach', hidden: true }),
    undo,
    rule,
    h('div', { class: 'copilot-choices' },
      choice('1', 'yes', '✓', 'Right', onRight),
      choice('2', 'fixed', '↺', 'Fixed it', onFixed ?? onRight),
      choice('3', 'notyet', '✗', 'Not yet', onNotYet),
      choice('h', 'help', '🔊', 'Help', onHelp)),
    h('div', { class: 'copilot-said-row' }, toggle, list),
    help);
  bannerState.set(banner, { said: null, list, toggle });
  setChips(banner, chips);
  if (coach) setCoach(banner, coach);

  keysOnPage(banner, (event) => {
    if (banner.hidden || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = (event.target);
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    const button = keys[String(event.key).toLowerCase()];
    if (!button || button.hidden) return;
    event.preventDefault();
    button.click();
  });
  return banner;
}

export function setCoach(banner, text) {
  const slot = (banner.querySelector('.copilot-coach'));
  if (!slot) return;
  slot.textContent = text;
  slot.hidden = text === '';
}

export function setChips(banner, chips) {
  const state = bannerState.get(banner);
  if (!state) return;
  state.said = null;
  state.list.replaceChildren(...chips.map(text => h('button', { type: 'button', class: 'copilot-chip', 'aria-pressed': 'false',
    onClick: ( event) => {
      const chip = (event.target ?? state.list);
      const on = state.said !== text;
      for (const other of state.list.querySelectorAll('.copilot-chip')) other.setAttribute('aria-pressed', 'false');
      state.said = on ? text : null;
      chip.setAttribute('aria-pressed', String(on));
    } }, text)));
  state.list.hidden = true;
  state.toggle.setAttribute('aria-expanded', 'false');
  state.toggle.hidden = chips.length === 0;
}

export function setUndo(banner, on) {
  const undo = (banner.querySelector('.copilot-undo'));
  if (undo) undo.hidden = !on;
}

export const COPILOT_HOLD = 'Grown-up: Continue, or Undo your last tap.';

export function copilotHold({ onGo, onUndo }) {
  const choice = (kind, mark, label, fn, key) => {
    const button = h('button', { type: 'button', class: ['copilot-choice', kind], ...(key ? { 'aria-keyshortcuts': `${key} Enter` } : {}), onClick: ( event) => {
      if (event.detail >= 2) return;
      pop(button);
      fn();
    } },
      h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, mark), h('span', {}, label), key ? h('kbd', { 'aria-hidden': 'true' }, key) : null);
    return button;
  };
  const go = choice('go', '▶', 'Continue', onGo, '1');
  const hold = h('div', { class: 'copilot-banner copilot-hold', role: 'group', 'aria-label': "Grown-up's turn" },
    h('p', { class: 'copilot-title' }, COPILOT_HOLD),
    h('div', { class: 'copilot-choices' }, go, choice('back', '↶', 'Undo', onUndo)));
  keysOnPage(hold, (event) => {
    if (hold.hidden || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = (event.target);
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.key === 'Enter' && target?.closest?.('button, a')) return;
    if (event.key !== '1' && event.key !== 'Enter') return;
    event.preventDefault();
    go.click();
  });
  return hold;
}

export function copilotUndoAside({ onUndo }) {
  const button = (h('button', { type: 'button', class: 'copilot-undo', 'aria-label': 'Undo the last tap',
    onClick: () => { pop(button); onUndo(); } },
  h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, '↶'), h('span', {}, 'Undo')));
  const aside = (h('div', { class: 'copilot-aside', role: 'group', 'aria-label': "Grown-up's Undo" },
    h('span', { class: 'copilot-aside-label' }, 'Grown-up:'), button));
  return aside;
}

export function fullscreenButton() {
  const button = h('button', { type: 'button', class: 'fullscreen-button', 'aria-label': 'Full screen', onClick: () => {
    const doc = button.ownerDocument;
    const request = doc.fullscreenElement ? doc.exitFullscreen?.() : doc.documentElement.requestFullscreen?.();
    request?.catch?.(() => {});
  } });
  return button;
}

export function kittenBubble({ lineId, text }) {
  return h('div', { class: 'kitten-bubble', 'data-line': lineId },
    text ? h('span', { class: 'kitten-bubble-text' }, text)
      : h('span', { class: 'kitten-bubble-dots', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')));
}

export function layeredArt(ids, className) {
  return h('div', { class: ['art-layers', className], 'aria-hidden': 'true' }, ids.map(id => picture(id)));
}

export const HOLD_MS = 3000;

export const noMenu = (event) => { event.preventDefault?.(); };

export function scrollCue(scroller, { arrowIn } = {}) {
  const win = (globalThis);
  const tag = /^(OL|UL)$/i.test(scroller.tagName ?? '') ? 'li' : 'div';
  const arrow = h('button', {
    type: 'button', class: 'scroll-cue-arrow', tabindex: '-1', 'aria-label': 'Scroll down for more',
    onClick: () => { scroller.scrollBy?.({ top: Math.max(120, scroller.clientHeight * 0.8), behavior: 'smooth' }); },
  });
  const cue = h(tag, { class: 'scroll-cue', hidden: true, 'aria-hidden': 'true' }, h('span', { class: 'scroll-cue-fade' }), arrowIn ? null : arrow);
  if (arrowIn) {
    arrow.classList.add('docked');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.hidden = true;
    arrowIn.append(arrow);
  }
  scroller.classList.add('has-scroll-cue');
  scroller.append(cue);
  const update = () => {
    cue.hidden = !(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 6);
    arrow.hidden = cue.hidden;
  };
  scroller.addEventListener('scroll', update);
  if (typeof win.ResizeObserver === 'function') new win.ResizeObserver(update).observe(scroller);
  if (typeof win.MutationObserver === 'function') {
    const last = () => scroller.lastElementChild ?? scroller.children?.[(scroller.children?.length ?? 1) - 1];
    new win.MutationObserver(() => { if (scroller.isConnected && last() !== cue) scroller.append(cue); update(); }).observe(scroller, { childList: true });
  }
  return scroller;
}

export function holdToActivate(button, onHeld, ms = HOLD_MS) {
  let timer;
  button.style.setProperty('--hold-ms', `${ms}ms`);
  const start = () => {
    if (timer !== undefined) return;
    button.classList.add('holding');
    timer = setTimeout(() => { timer = undefined; button.classList.remove('holding'); onHeld(); }, ms);
  };
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    button.classList.remove('holding');
  };
  button.addEventListener('contextmenu', noMenu);
  button.addEventListener('pointerdown', ( event) => {
    if (event.button !== 0) return;
    button.setPointerCapture?.(event.pointerId);
    start();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) button.addEventListener(type, cancel);
  button.addEventListener('keydown', ( event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) start();
  });
  button.addEventListener('keyup', ( event) => { if (event.key === ' ' || event.key === 'Enter') cancel(); });
  return { cancel };
}

export function grownupNote(text, { className = '', holdMs = HOLD_MS } = {}) {
  const panel = h('p', { class: 'grownup-note-text', hidden: true, role: 'status' }, text);
  const toggle = h('button', { type: 'button', class: 'grownup-note-toggle', 'aria-label': 'Grown-ups: hold for three seconds to see the numbers', 'aria-expanded': 'false' }, artImage('ui-sq/gear'));
  holdToActivate(toggle, () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  }, holdMs);
  return h('div', { class: ['grownup-note', 'grownup-strip', className], 'data-grownup': 'true' }, panel, toggle);
}

export function bigButton({ label, icon, glyph, onClick }) {
  return h('button', { type: 'button', class: 'big-button', onClick: ( event) => onClick?.(event) },
    icon ? picture(icon, 'big-button-icon') : glyph ? h('span', { class: 'big-button-glyph', 'aria-hidden': 'true' }, glyph) : null,
    h('span', { class: 'big-button-label' }, label));
}
