import { h } from '../core/dom.js';
import { createArrivalGuard, createLock } from '../core/lock.js';
import { STAGES } from '../curriculum/stages.js';
import { stageSlug } from '../core/voice-ids.js';
import { landName } from '../ui/terms.js';
import { artImage, artUrl, bigButton } from '../ui/components.js';
import { apprenticeArt, readCoat, sayLine } from './start.js';
import { MAP_LANDS, crestArt, currentLand, hasCrest, landProgress, landRecord, landmarkLit, questAction } from './map.js';

export const unlitArt = (art) => art.replace(/-on$/, '-off');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function pendingBeats(content, profile, land) {
  const seen = new Set(Array.isArray(profile?.storySeen) ? profile.storySeen : []);
  const story = isObj(content?.story?.[land]) ? content.story[land] : {};
  const record = landRecord(content, land);
  const ids = (list) => (Array.isArray(list) ? list.filter(( x) => typeof x === 'string') : []);
  const intro = ids(record?.intro).length ? ids(record?.intro) : ids(story.intro);
  const finale = ids(record?.finale).length ? ids(record?.finale) : ids(story.finale);
  const beats = [];
  if (hasCrest(profile, land)) {
    if (finale.length && !seen.has(`finale:${land}`)) beats.push({ key: `finale:${land}`, lines: finale });
    if (land === 'le' && ids(story.end).length && !seen.has('end:le')) beats.push({ key: 'end:le', lines: ids(story.end) });
  }
  if (intro.length && !seen.has(`intro:${land}`)) {
    if (land === 'closed' && ids(story.prologue).length && !seen.has('prologue:closed')) beats.push({ key: 'prologue:closed', lines: ids(story.prologue) });
    beats.push({ key: `intro:${land}`, lines: intro });
  }
  return beats;
}

export function mount(el, ctx, params = {}) {
  const lock = createLock();
  let arrival = createArrivalGuard();
  const terms = ctx.settings?.terms;
  const profile = () => ctx.profile ?? {};
  const land = typeof params.land === 'string' && MAP_LANDS.includes(params.land) ? params.land : currentLand(ctx.settings);
  const record = landRecord(ctx.content, land);
  const here = currentLand(ctx.settings) === land;
  const currentStage = STAGES[Number.isInteger(ctx.settings?.stage) ? ctx.settings.stage : 0]?.id;
  let alive = true;

  const root = h('div', { class: 'land', 'data-land': land });
  const apprentice = h('div', { class: 'land-apprentice' }, artImage(apprenticeArt('black')));
  readCoat(ctx).then((coat) => { if (alive) apprentice.replaceChildren(artImage(apprenticeArt(coat))); });

  const go = (then) => (event) => {
    if (lock.locked() || !arrival.allows(event)) return;
    lock.run(then).catch((err) => console.warn('The land could not go on', err));
  };

  function view() {
    const { lit, total, crest } = landProgress(profile(), land, record);
    const stages = (record?.landmarks ?? STAGES.filter((s) => s.land === land).map((s) => ({ stage: s.id, id: s.id, art: `lm/${stageSlug(s.id)}-on` })));
    const marks = stages.map(( lm) => {
      const on = landmarkLit(profile(), lm.stage);
      const stage = STAGES.find((s) => s.id === lm.stage);
      return h('figure', { class: ['land-landmark', on ? 'lit' : 'unlit', lm.stage === currentStage && 'current'], 'data-stage': lm.stage, 'data-state': on ? 'lit' : 'unlit' },
        artImage(on ? lm.art : unlitArt(lm.art), 'land-landmark-art'),
        h('figcaption', {}, stage?.name ?? lm.id));
    });
    root.replaceChildren(
      h('img', { class: 'scene-bg', src: artUrl(`bg/${land}`), alt: '' }),
      h('div', { class: 'land-head' },
        crest ? h('span', { class: 'land-crest' }, artImage(crestArt(record, land))) : null,
        h('h1', { class: 'land-title' }, landName(land, terms)),
        h('p', { class: 'land-count' }, `${lit} of ${total} landmarks lit`)),
      h('div', { class: 'land-landmarks' }, marks),
      apprentice,
      h('div', { class: 'land-actions' },
        here ? questAction(ctx, go(() => ctx.router.go('session'))) : null,
        h('button', { type: 'button', class: 'land-back', onClick: go(() => ctx.router.go('map')) }, 'Back to the map')));
    ctx.setReplay?.(['v.map.land']);
  }

  function tell(beat) {
    return new Promise((resolve) => {
      let at = 0;
      const text = h('p', { class: 'land-story-text' });
      const next = bigButton({ label: 'Next', onClick: (event) => {
        if (!arrival.allows(event)) return;
        at += 1;
        if (at < beat.lines.length) { line(); return; }
        resolve();
      } });
      const line = () => {
        arrival = createArrivalGuard();
        const id = beat.lines[at];
        text.textContent = ctx.content?.voice?.[id]?.text ?? '';
        ctx.setReplay?.([id]);
        void sayLine(ctx, id);
      };
      root.replaceChildren(
        h('img', { class: 'scene-bg', src: artUrl(`bg/${land}`), alt: '' }),
        apprentice,
        h('div', { class: 'land-story', role: 'group', 'aria-label': 'The story' }, text, next));
      line();
    });
  }

  async function keep(keys) {
    const seen = Array.isArray(profile().storySeen) ? profile().storySeen : [];
    ctx.profile = { ...profile(), storySeen: [...seen, ...keys.filter((k) => !seen.includes(k))].slice(-400) };
    await ctx.save();
  }

  el.append(root);
  const beats = pendingBeats(ctx.content, profile(), land);
  if (beats.length === 0) view();
  else {
    (async () => {
      for (const beat of beats) {
        await tell(beat);
        if (!alive) return;
        await keep([beat.key]);
      }
      if (alive) { arrival = createArrivalGuard(); view(); void sayLine(ctx, 'v.map.land'); }
    })().catch((err) => console.error('The story could not be told', err));
  }
  return () => { alive = false; };
}

