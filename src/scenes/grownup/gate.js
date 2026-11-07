import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { artUrl, bigButton, holdToActivate } from '../../ui/components.js';

export const SCREENS = Object.freeze([
  ['today', 'Today'],
  ['progress', 'Progress'],
  ['tricky', 'Tricky pairs'],
  ['placement', 'Placement'],
  ['settings', 'Settings'],
  ['passes', 'Passes'],
  ['recordings', 'Recordings'],
  ['backup', 'Backup'],
  ['restore', 'Restore'],
  ['start-over', 'Start over'],
  ['remove-student', 'Remove student'],
  ['about', 'About'],
  ['printables', 'Word Book printables'],
].map((entry) => Object.freeze(entry)));

export const TAB_LABELS = Object.freeze({ printables: 'Printables' });

const PIN = /^\d{4,8}$/;

export const PLACEMENT_RETAKE = Object.freeze({ retake: true });

const EXTRA_TITLES = Object.freeze({ tips: 'Tips for grown-ups' });

export function routeFor(name) {
  return name === 'placement' ? ['placement', { ...PLACEMENT_RETAKE }] : [`grownup/${name}`, { unlocked: true }];
}

export async function hashPin(pin) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(pin)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function checkPin(pin, hash) {
  if (typeof hash !== 'string' || hash === '') return false;
  return (await hashPin(pin)) === hash;
}

export const isValidPin = (pin) => typeof pin === 'string' && PIN.test(pin);

export const isUnlocked = (params) => params?.unlocked === true;

export const nextScreen = (next) => (SCREENS.some(([name]) => name === next) ? (next) : 'today');

export function unsavedBanner(ctx) {
  if (ctx.store?.persistent === false) {
    return h('p', { class: 'gu-warning', role: 'status' },
      h('strong', {}, "Progress can't be saved in this browser window."),
      ' Use Backup to keep a copy before you close it.');
  }
  if (ctx.saveFailed !== true) return null;
  return h('p', { class: 'gu-warning', role: 'status' },
    h('strong', {}, "The last save didn't work."),
    ' Use Backup to keep a copy of the progress, then reload the page.');
}

export function cornerFrame(el, ctx, params, screen) {
  if (!isUnlocked(params)) {
    ctx.router.go('grownup/gate', { next: screen }).catch(( err) => console.error('The grown-up gate could not open', err));
    return null;
  }
  const lock = createLock();
  const go = (name, p) => {
    lock.run(() => ctx.router.go(name, p)).catch((err) => console.warn(`The grown-up corner could not open "${name}"`, err));
  };
  const title = SCREENS.find(([name]) => name === screen)?.[1] ?? (EXTRA_TITLES)[screen] ?? '';
  const body = h('div', { class: 'gu-body' });
  el.append(h('div', { class: 'grownup' },
    h('img', { class: 'scene-bg', src: artUrl('bg/grownup'), alt: '' }),
    h('header', { class: 'gu-header' },
      h('p', { class: 'gu-corner-title' }, 'Grown-up corner'),
      h('button', { type: 'button', class: 'gu-button gu-leave', onClick: () => go('map') }, 'Back to the map')),
    h('nav', { class: 'gu-nav', 'aria-label': 'Grown-up corner' },
      SCREENS.map(([name, label]) => h('button', {
        type: 'button', class: 'gu-tab', 'aria-current': name === screen ? 'page' : null,
        onClick: () => { if (name !== screen) go(...routeFor(name)); },
      }, (TAB_LABELS)[name] ?? label))),
    h('main', { class: 'gu-main' }, unsavedBanner(ctx), h('h1', { class: 'gu-title' }, title), body)));
  return body;
}

export function mount(el, ctx, params = {}) {
  const lock = createLock();
  const [scene, sceneParams] = routeFor(nextScreen(params.next));
  const enter = (how) => {
    ctx.cornerEntry = how;
    lock.run(() => ctx.router.go(scene, sceneParams)).catch((err) => console.warn('The grown-up corner could not open', err));
  };
  const leave = () => {
    lock.run(() => ctx.router.go('map')).catch((err) => console.warn('The map could not open', err));
  };
  const back = h('div', { class: 'gu-back' }, bigButton({ label: 'Back to the map', icon: 'ui/door-button', onClick: leave }));
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });

  if (typeof ctx.settings.pin !== 'string') {
    const open = async () => { ctx.cornerEntry = 'pin'; await ctx.router.go(scene, sceneParams); };
    return mountChoosePin(el, ctx, { lock, message, back, open });
  }

  const input = (h('input', {
    type: 'password', class: 'gu-input gu-pin', inputmode: 'numeric', autocomplete: 'off', maxlength: '8', id: 'gu-gate-pin',
  }));
  const form = h('form', { class: 'gu-gate-form', onSubmit: ( event) => {
    event.preventDefault();
    lock.run(async () => {
      if (input.value === '') {
        message.textContent = 'Type the PIN first.';
        input.focus();
        return;
      }
      if (await checkPin(input.value, ctx.settings.pin)) { ctx.cornerEntry = 'pin'; await ctx.router.go(scene, sceneParams); return; }
      input.value = '';
      message.textContent = "That PIN doesn't match. Try again, or hold the button below for 3 seconds.";
      input.focus();
    }).catch((err) => console.error('The grown-up corner could not open', err));
  } },
  h('label', { class: 'gu-label', for: 'gu-gate-pin' }, 'PIN'),
  h('div', { class: 'gu-row' }, input, h('button', { type: 'submit', class: 'gu-button gu-primary' }, 'Open')));

  const hold = h('button', { type: 'button', class: 'gu-button gu-hold' },
    h('span', { class: 'gu-hold-fill', 'aria-hidden': 'true' }),
    h('span', { class: 'gu-hold-label' }, 'Hold for 3 seconds'));
  const holding = holdToActivate(hold, () => enter('hold'));

  el.append(h('div', { class: 'grownup' },
    h('img', { class: 'scene-bg', src: artUrl('bg/grownup'), alt: '' }),
    h('div', { class: 'gu-card gu-gate' },
      unsavedBanner(ctx),
      h('h1', { class: 'gu-title' }, 'Grown-ups only'),
      h('p', {}, 'Type your PIN to open the grown-up corner.'),
      form,
      message,
      h('p', { class: 'gu-or' }, 'or'),
      hold,
      back)));
  input.focus();
  return () => { holding.cancel(); };
}

function mountChoosePin(el, ctx, { lock, message, back, open }) {
  const field = (id) => (h('input', {
    type: 'password', class: 'gu-input gu-pin', inputmode: 'numeric', autocomplete: 'off', maxlength: '8', id,
  }));
  const first = field('gu-new-pin');
  const again = field('gu-new-pin2');
  const form = h('form', { class: 'gu-gate-form', onSubmit: ( event) => {
    event.preventDefault();
    lock.run(async () => {
      if (!isValidPin(first.value)) { message.textContent = 'Choose a PIN of 4 to 8 digits.'; first.focus(); return; }
      if (first.value !== again.value) { message.textContent = "The two PINs don't match."; again.focus(); return; }
      ctx.settings = { ...ctx.settings, pin: await hashPin(first.value) };
      try {
        await ctx.save();
      } catch (err) {
        console.error('The PIN could not be saved', err);
      }
      first.value = '';
      again.value = '';
      await open();
    }).catch((err) => console.error('The PIN could not be set', err));
  } },
  h('label', { class: 'gu-label', for: 'gu-new-pin' }, 'New PIN'),
  first,
  h('label', { class: 'gu-label', for: 'gu-new-pin2' }, 'New PIN again'),
  h('div', { class: 'gu-row' }, again, h('button', { type: 'submit', class: 'gu-button gu-primary' }, 'Set the PIN')));
  el.append(h('div', { class: 'grownup' },
    h('img', { class: 'scene-bg', src: artUrl('bg/grownup'), alt: '' }),
    h('div', { class: 'gu-card gu-gate' },
      unsavedBanner(ctx),
      h('h1', { class: 'gu-title' }, 'Choose a grown-up PIN'),
      h('p', {}, 'Four to eight digits. It keeps the grown-up corner for grown-ups. You can change it in Settings.'),
      form,
      message,
      back)));
  first.focus();
  return () => {};
}
