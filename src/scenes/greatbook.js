import { h } from '../core/dom.js';
import { createArrivalGuard, createLock } from '../core/lock.js';
import { passageSentenceId } from '../core/voice-ids.js';
import { withPassageResult } from '../profile/profile.js';
import { landName } from '../ui/terms.js';
import { artImage, artUrl, bigButton, scrollCue } from '../ui/components.js';
import { MAP_LANDS, crestArt, currentLand, landRecord } from './map.js';
import { missCounter, passageLines } from './miss-counter.js';
import { sayLine } from './start.js';

export const REREAD = 'reread:';

export const READ_PERCENT = 95;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const pageNumber = (id) => Number(/(\d+)$/.exec(id)?.[1] ?? 0);

export function pagesOfLand(ctx, land) {
  const passages = (Array.isArray(ctx.content?.passages) ? ctx.content.passages : []).filter(( p) => isObj(p) && p.land === land);
  const kept = (Array.isArray(ctx.profile?.pages) ? ctx.profile.pages : []).filter(( p) => isObj(p) && p.land === land && typeof p.id === 'string');
  const ids = [...new Set([...passages.map(( p) => p.page), ...kept.map(( p) => p.id)])].filter((id) => typeof id === 'string');
  ids.sort((a, b) => pageNumber(a) - pageNumber(b));
  return ids.map((id) => {
    const record = kept.find(( p) => p.id === id) ?? null;
    const passage = passages.find(( p) => p.id === record?.passage)
      ?? (record ? passages.find(( p) => p.page === id) : null) ?? null;
    return { id, n: pageNumber(id) || ids.indexOf(id) + 1, restored: record !== null, record, passage };
  });
}

export function restoredByLand(profile) {
  const out = Object.fromEntries(MAP_LANDS.map((land) => [land, 0]));
  for (const p of Array.isArray(profile?.pages) ? profile.pages : []) if (isObj(p) && Object.hasOwn(out, p.land)) out[p.land] += 1;
  return out;
}

export const readsWell = (tally) => tally.words > 0 && tally.right * 100 >= tally.words * READ_PERCENT;

export function mount(el, ctx, params = {}) {
  const lock = createLock();
  let arrival = createArrivalGuard();
  const terms = ctx.settings?.terms;
  let alive = true;
  let showing = 0;
  let heard = 0;
  const root = h('div', { class: 'greatbook' });

  const firstLand = () => {
    if (typeof params.land === 'string' && MAP_LANDS.includes(params.land)) return params.land;
    const counts = restoredByLand(ctx.profile);
    return counts[currentLand(ctx.settings)] > 0 ? currentLand(ctx.settings) : MAP_LANDS.find((l) => counts[l] > 0) ?? currentLand(ctx.settings);
  };
  let land = typeof params.page === 'string' && MAP_LANDS.includes(params.page.split('.')[0]) ? params.page.split('.')[0] : firstLand();

  const press = (then) => (event) => {
    if (lock.locked() || !arrival.allows(event)) return;
    lock.run(async () => { await then(); }).catch((err) => console.warn('The Great Word Book could not go on', err));
  };

  const frame = ( ...kids) => {
    showing += 1;
    arrival = createArrivalGuard();
    root.replaceChildren(h('img', { class: 'scene-bg', src: artUrl('bg/greatbook'), alt: '' }), ...kids);
  };


  function book() {
    const counts = restoredByLand(ctx.profile);
    const pages = pagesOfLand(ctx, land);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const tabs = MAP_LANDS.map((id) => h('button', { type: 'button', class: ['book-tab', id === land && 'on'], 'data-land': id, 'aria-pressed': id === land ? 'true' : 'false',
      onClick: press(() => { land = id; book(); }) },
    h('span', { class: 'book-tab-crest' }, artImage(crestArt(landRecord(ctx.content, id), id))),
    h('span', { class: 'book-tab-name' }, landName(id, terms)),
    h('span', { class: 'book-tab-count' }, `${counts[id]} restored`)));
    frame(
      h('h1', { class: 'book-title' }, 'The Great Word Book'),
      h('p', { class: 'book-total' }, total === 0 ? 'No pages restored yet.' : `${total} ${total === 1 ? 'page' : 'pages'} restored`),
      h('div', { class: 'book-tabs' }, tabs),
      scrollCue(h('div', { class: 'book-pages', 'data-land': land },
        pages.length === 0
          ? h('p', { class: 'book-empty' }, 'Pass a Story Page in a quest to restore the first page here.')
          : pages.map((page) => page.restored
            ? h('button', { type: 'button', class: 'book-page restored', 'data-page': page.id, onClick: press(() => read(page)) },
              artImage('ui-sq/page-whole', 'book-page-art'), h('span', { class: 'book-page-label' }, `Page ${page.n}`))
            : h('button', { type: 'button', class: 'book-page torn', 'data-page': page.id, 'aria-disabled': 'true',
              onClick: press(() => { void sayLine(ctx, 'v.map.book-torn'); }) },
            artImage('ui-sq/page-torn', 'book-page-art'), h('span', { class: 'book-page-label' }, `Page ${page.n}`))))),
      h('div', { class: 'book-actions' }, h('button', { type: 'button', class: 'land-back', onClick: press(() => ctx.router.go('map')) }, 'Back to the map')));
    ctx.setReplay?.(['v.map.book-open']);
  }


  function read(page) {
    const passage = page.passage;
    const lines = passage ? passageLines(passage.text) : [];
    const ids = passage ? lines.map((_, k) => passageSentenceId(passage.id, k + 1)) : [];
    const shown = showing + 1;
    const hear = async () => {
      const mine = ++heard;
      for (const id of ids) {
        if (!alive || mine !== heard || shown !== showing) return;
        await sayLine(ctx, id);
      }
    };
    frame(
      h('div', { class: 'book-reader' },
        h('h1', { class: 'book-reader-title' }, passage?.title ?? `Page ${page.n}`),
        passage
          ? h('div', { class: 'reading passage-text' }, lines.map((line) => h('p', { class: 'book-line' }, line)))
          : h('p', { class: 'book-empty' }, 'This page cannot be shown yet.'),
        h('div', { class: 'book-actions' },
          passage ? bigButton({ label: 'Hear it', onClick: (event) => { if (arrival.allows(event)) void hear(); } }) : null,
          h('button', { type: 'button', class: 'land-back', onClick: press(() => { book(); }) }, 'Back to the book'),
          passage ? h('button', { type: 'button', class: 'book-score', onClick: press(() => { score(page); }) }, 'Grown-up: score this reading') : null)));
    ctx.setReplay?.(ids.length ? ids : null);
    void sayLine(ctx, 'v.map.reread');
  }


  function score(page) {
    const passage = (page.passage);
    const counter = missCounter({
      text: passage.text,
      title: 'Grown-up: tap each word your reader missed. This is practice, so the gates do not change.',
      doneLabel: 'Save this reading',
      onDone: (tally) => {
        lock.run(async () => {
          ctx.profile = withPassageResult(ctx.profile, { passage: `${REREAD}${passage.id}`, day: ctx.day, passed: readsWell(tally), missedSentences: tally.missedSentences });
          await ctx.save();
          if (alive) saved(page, tally);
        }).catch((err) => console.error('The practice reading could not be saved', err));
      },
    });
    frame(h('div', { class: 'book-reader scorer' }, counter));
    ctx.setReplay?.(null);
  }

  function saved(page, tally) {
    frame(h('div', { class: 'book-reader scorer' },
      h('h1', { class: 'book-reader-title' }, 'Saved as practice'),
      h('p', { class: 'book-result' }, `${tally.missed} missed and ${tally.fixed} fixed on the spot, of ${tally.words} words. The gates did not change.`),
      h('div', { class: 'book-actions' },
        h('button', { type: 'button', class: 'land-back', onClick: press(() => { book(); }) }, 'Back to the book'),
        bigButton({ label: 'Read it again', onClick: press(() => { read(page); }) }))));
  }

  el.append(root);
  const wanted = typeof params.page === 'string' ? pagesOfLand(ctx, land).find((p) => p.id === params.page && p.restored) : undefined;
  if (wanted) read(wanted);
  else { book(); void sayLine(ctx, 'v.map.book-open'); }
  return () => { alive = false; showing += 1; };
}
