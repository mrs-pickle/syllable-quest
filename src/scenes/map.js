import { h } from '../core/dom.js';
import { createArrivalGuard, createLock } from '../core/lock.js';
import { isStageMastered } from '../engine/mastery.js';
import { isExtraPractice } from '../profile/profile.js';
import { STAGES, landOf } from '../curriculum/stages.js';
import { landName } from '../ui/terms.js';
import { artImage, artUrl, bigButton, holdToActivate } from '../ui/components.js';
import { apprenticeArt, readCoat, sayLine } from './start.js';

export const MAP_LANDS = Object.freeze(['closed', 'open', 'vce', 'team', 'r', 'le']);
export const CITY = 'city';

export const MAP_SPOTS = Object.freeze({
  closed: { x: 205, y: 590 },
  open: { x: 235, y: 300 },
  vce: { x: 495, y: 215 },
  team: { x: 650, y: 505 },
  r: { x: 905, y: 295 },
  le: { x: 1040, y: 600 },
  city: { x: 1135, y: 175 },
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const landRecord = (content, land) => (Array.isArray(content?.lands) ? content.lands.find(( l) => l?.id === land) ?? null : null);

export const crestArt = (record, land) => (typeof record?.crest === 'string' && record.crest.startsWith('crest/') ? record.crest : `crest/${land}`);

export const currentLand = (settings) => landOf(Number.isInteger(settings?.stage) ? settings.stage : 0) ?? MAP_LANDS[0];

export const hasCrest = (profile, land) => (Array.isArray(profile?.crests) ? profile.crests : []).some(( c) => isObj(c) && c.land === land);

export function landmarkLit(profile, stageId) {
  const land = stageId.split('.')[0];
  if (hasCrest(profile, land)) return true;
  if ((Array.isArray(profile?.landmarks) ? profile.landmarks : []).some(( l) => isObj(l) && l.stage === stageId)) return true;
  return isStageMastered(Array.isArray(profile?.gates) ? profile.gates : [], stageId);
}

export function landProgress(profile, land, record) {
  const stages = Array.isArray(record?.landmarks) && record.landmarks.length > 0
    ? record.landmarks.map(( l) => l.stage)
    : STAGES.filter((s) => s.land === land).map((s) => s.id);
  return { lit: stages.filter(( id) => landmarkLit(profile, id)).length, total: stages.length, crest: hasCrest(profile, land) };
}

export const crestLands = (profile) => MAP_LANDS.filter((land) => hasCrest(profile, land));

export const dayInProgress = (ctx) => isObj(ctx?.today) && ctx.today.day === ctx.day && !todayFinished(ctx.today);

const todayFinished = (today) => Array.isArray(today.plan?.steps) && Number.isInteger(today.done) && today.done >= today.plan.steps.length;

export const questDone = (ctx) => !dayInProgress(ctx) && isExtraPractice(ctx?.profile ?? {}, ctx?.day);

export function questLabel(ctx) {
  if (dayInProgress(ctx)) return "Continue today's quest";
  return questDone(ctx) ? 'Practice more' : "Start today's quest";
}

export const questStatus = (ctx) => (questDone(ctx) ? "Today's quest is done" : '');

export function questAction(ctx, onClick) {
  const status = questStatus(ctx);
  return h('div', { class: ['quest-action', status && 'is-done'] },
    status ? h('p', { class: 'quest-status' }, h('span', { 'aria-hidden': 'true' }, '✓ '), status) : null,
    bigButton({ label: questLabel(ctx), onClick }));
}

const STANCE = Object.freeze({ closed: { dx: 70, dy: -70 }, open: { dx: 70, dy: -70 }, vce: { dx: 70, dy: -70 }, team: { dx: 70, dy: -70 }, r: { dx: 70, dy: 20 }, le: { dx: 70, dy: -70 } });

export function mount(el, ctx, _params = {}) {
  const lock = createLock();
  const arrival = createArrivalGuard();
  const terms = ctx.settings?.terms;
  const profile = ctx.profile ?? {};
  const here = currentLand(ctx.settings);
  let alive = true;
  const go = (then) => (event) => {
    if (lock.locked() || !arrival.allows(event)) return;
    lock.run(then).catch((err) => console.warn('The map could not go on', err));
  };

  const apprentice = h('div', { class: 'map-apprentice', style: { left: `${MAP_SPOTS[here].x + STANCE[here].dx}px`, top: `${MAP_SPOTS[here].y + STANCE[here].dy}px` } },
    artImage(apprenticeArt('black')));
  readCoat(ctx).then((coat) => { if (alive) apprentice.replaceChildren(artImage(apprenticeArt(coat))); });

  const nodes = MAP_LANDS.map((land) => {
    const record = landRecord(ctx.content, land);
    const { lit, total, crest } = landProgress(profile, land, record);
    const name = landName(land, terms);
    const spot = MAP_SPOTS[land];
    return h('button', {
      type: 'button',
      class: ['map-land', crest && 'earned', land === here && 'current'],
      'data-land': land,
      'aria-label': `${name}, ${lit} of ${total} landmarks lit${crest ? ', crest earned' : ''}${land === here ? ', you are here' : ''}`,
      style: { left: `${spot.x - 80}px`, top: `${spot.y}px` },
      onClick: go(() => ctx.router.go('land', { land })),
    },
    h('span', { class: 'map-crest' }, artImage(crestArt(record, land))),
    h('span', { class: 'map-land-name' }, name),
    h('span', { class: 'map-land-count' }, `${lit} of ${total}`));
  });

  const city = h('button', {
    type: 'button', class: 'map-land locked', 'data-land': CITY, disabled: true, 'aria-disabled': 'true',
    'aria-label': `${landName(CITY, terms)}, coming later`,
    style: { left: `${MAP_SPOTS.city.x - 80}px`, top: `${MAP_SPOTS.city.y}px` },
  }, h('span', { class: 'map-land-name' }, landName(CITY, terms)), h('span', { class: 'map-land-count' }, 'Coming later'));

  const gear = h('button', { type: 'button', class: 'map-gear', 'aria-label': 'Grown-ups: hold for three seconds' },
    artImage('ui-sq/gear'));
  const hold = holdToActivate(gear, () => {
    lock.run(() => ctx.router.go('grownup/gate')).catch((err) => console.warn('The grown-up gate could not open', err));
  });

  el.append(h('div', { class: 'map' },
    h('img', { class: 'scene-bg', src: artUrl('bg/map'), alt: '' }),
    nodes, city, apprentice,
    h('div', { class: 'map-bar' },
      h('button', { type: 'button', class: 'map-book', onClick: go(() => ctx.router.go('greatbook')) },
        artImage('ui-sq/wordbook', 'map-book-art'), h('span', {}, `Great Word Book${(profile.pages ?? []).length ? ` · ${profile.pages.length}` : ''}`)),
      questAction(ctx, go(() => ctx.router.go('session'))),
      h('button', { type: 'button', class: 'map-front', onClick: go(() => ctx.router.go('start')) }, 'Change student'),
      gear)));
  ctx.setReplay?.(['v.map.welcome']);
  void sayLine(ctx, 'v.map.welcome');
  return () => { alive = false; hold.cancel(); };
}
