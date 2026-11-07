import { h } from '../core/dom.js';
import { artUrl, layeredArt } from '../ui/components.js';
import { COATS, apprenticeArt } from './start.js';
import { coatOf, isCoat, readCoat } from '../profile/coat.js';
import { BREAK_STYLES, MIX_IT_UP } from '../profile/settings.js';

export { BREAK_STYLES };
export const BREAK_COATS = COATS;
const MOVES = 4;

const STAND = 'stand';
const CHEER = 'cheer';

export const START_MS = 4000;
export const MOVE_MS = 9000;
export const DONE_MS = 3000;
export const REST_MS = 9000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const breakStyle = (style) => (typeof style === 'string' && BREAK_STYLES.includes(style) ? style : BREAK_STYLES[0]);

export function breakLines(style) {
  const s = breakStyle(style);
  return ['v.break.start', ...Array.from({ length: MOVES }, (_, i) => `v.break.${s}.${i + 1}`), 'v.break.done'];
}

function nextOf(all, played, rng) {
  const cycle = (Array.isArray(played) ? played : []).filter((s, i, seen) => all.includes(s) && seen.indexOf(s) === i);
  const left = all.filter((s) => !cycle.includes(s));
  if (left.length > 0) { const pick = rng.pick(left); return { pick, played: [...cycle, pick] }; }
  const pick = rng.pick(all.filter((s) => s !== cycle.at(-1)));
  return { pick, played: [pick] };
}

export function nextInMix(played, rng) {
  const { pick, played: cycle } = nextOf(BREAK_STYLES, played, rng);
  return { style: pick, played: cycle };
}

export function nextBreak(ctx) {
  const chosen = ctx.settings?.breakStyle;
  if (chosen !== MIX_IT_UP && BREAK_STYLES.includes(chosen)) return chosen;
  const profile = ctx.profile && typeof ctx.profile === 'object' ? ctx.profile : {};
  const { style, played } = nextInMix(profile.breaks, ctx.rng);
  ctx.profile = { ...profile, breaks: played };
  return style;
}

function breakView(el, ctx, className, fixedCoat) {
  let skip = () => {};
  const skipped = new Promise((resolve) => { skip = () => resolve(undefined); });
  let over = false;
  const end = () => {
    over = true;
    ctx.audio.stop();
    skip();
  };
  let coat = fixedCoat ?? coatOf(ctx);
  let current = apprenticeArt(coat, STAND);
  const figure = layeredArt([current], 'break-kitten');
  const draw = (artId) => {
    current = artId;
    const img = figure.querySelector('img');
    if (img) img.setAttribute('src', artUrl(artId));
  };
  if (!fixedCoat && !isCoat(ctx?.coat) && ctx?.store) {
    readCoat(ctx).then((c) => {
      coat = c;
      const pose = /^apprentice\/[a-z]+-(\w+)$/.exec(current)?.[1];
      if (pose && !over) draw(apprenticeArt(coat, pose));
    }).catch(() => {});
  }
  const skipButton = h('button', { type: 'button', class: 'break-skip', 'aria-label': 'Skip the break', onClick: end }, 'Skip');
  const root = h('div', { class: ['break', className] },
    h('img', { class: 'scene-bg', src: artUrl('bg/map'), alt: '' }), figure, skipButton);
  el.append(root);
  const live = () => !over && root.isConnected;
  return {
    root,
    figure,
    live,
    coat: () => coat,
    async step(lineId, ms) {
      if (!live()) return false;
      let said;
      try { said = Promise.resolve(ctx.say(lineId)).catch(() => {}); } catch { said = Promise.resolve(); }
      await Promise.race([Promise.all([said, wait(ms)]), skipped]);
      return live();
    },
    show(artId) {
      draw(artId === STAND || artId === CHEER ? apprenticeArt(coat, artId) : artId);
    },
    destroy() {
      over = true;
      if (!root.isConnected) return;
      ctx.setReplay?.(null);
      root.remove();
    },
  };
}

export async function runBreak(el, ctx, { style, coat } = {}) {
  const s = breakStyle(style);
  const view = breakView(el, ctx, `break-${s}`, isCoat(coat) ? coat : undefined);
  const [start, ...rest] = breakLines(s);
  const done = (rest.pop());
  const moves = async () => {
    if (!(await view.step(start, START_MS))) return;
    view.show(CHEER);
    for (const [i, line] of rest.entries()) {
      view.figure.setAttribute('data-move', String(i + 1));
      view.show(`break/${view.coat()}-${s}-${(i % 2) + 1}`);
      if (!(await view.step(line, MOVE_MS))) return;
    }
    view.figure.removeAttribute('data-move');
    view.show(STAND);
    await view.step(done, DONE_MS);
  };
  try {
    await moves();
  } finally {
    view.destroy();
  }
}

export async function runRest(el, ctx) {
  const view = breakView(el, ctx, 'rest');
  try {
    await view.step('v.break.rest', REST_MS);
  } finally {
    view.destroy();
  }
}

export function mount(el, ctx, params = {}) {
  const played = params.kind === 'rest' ? runRest(el, ctx) : runBreak(el, ctx, { style: params.style ?? nextBreak(ctx), coat: params.coat });
  played.then(() => (el.isConnected ? ctx.router.go('map') : undefined))
    .catch((err) => console.error('The break preview stopped', err));
  return () => {};
}
