import { h } from '../../core/dom.js';
import { LANDS } from '../../curriculum/stages.js';
import { landName, termFor } from '../../ui/terms.js';
import { cornerFrame } from './gate.js';

export const CREST_NAMES = Object.freeze({
  closed: 'shut door', open: 'open door', vce: 'sleeping owl', team: 'two oars', r: 'mountain goat', le: 'fish tail',
});

export const SHEETS = Object.freeze([
  ['cover', 'Word Book cover'],
  ['map', 'Land map sheet'],
  ['crests', 'Crest stickers sheet'],
].map((entry) => Object.freeze(entry)));

export const STICKERS_PER_CREST = 2;

export const PRINT_CSS = `
.pp-sheet { background: #fff; color: #000; border: 1px solid #b9b2a3; border-radius: 6px; margin: 0 0 24px; padding: 28px; max-width: 680px; box-sizing: border-box; font-size: 18px; line-height: 1.5; }
.pp-sheet h2, .pp-sheet h3, .pp-sheet p { margin: 0 0 8px; }
.pp-cover { text-align: center; min-height: 520px; display: flex; flex-direction: column; justify-content: center; gap: 16px; border: 6px double #000; }
.pp-cover .pp-title { font-size: 48px; font-weight: bold; }
.pp-cover .pp-sub { font-size: 28px; }
.pp-cover .pp-name { margin-top: 40px; font-size: 22px; text-align: left; }
.pp-cover .pp-line { display: inline-block; width: 70%; border-bottom: 2px solid #000; }
.pp-path { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.pp-land { border: 3px solid #000; border-radius: 10px; padding: 12px 16px; display: grid; grid-template-columns: 1fr auto; gap: 4px 16px; break-inside: avoid; }
.pp-land strong { font-size: 22px; }
.pp-land .pp-box { font-size: 22px; }
.pp-arrow { text-align: center; font-size: 24px; margin: -6px 0; }
.pp-stickers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; justify-items: center; }
.pp-sticker { width: 170px; height: 170px; border: 3px dashed #000; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 10px; box-sizing: border-box; break-inside: avoid; }
.pp-sticker strong { font-size: 20px; }
.pp-sticker span { font-size: 15px; }
.pp-note { font-size: 15px; }
@media print {
  body * { visibility: hidden !important; }
  .pp-sheet[data-print], .pp-sheet[data-print] * { visibility: visible !important; }
  .pp-sheet[data-print] { position: absolute; left: 0; top: 0; width: 100%; max-width: none; margin: 0; border-color: #000; }
  @page { margin: 12mm; }
}
`;

const stageRange = (first, last) => (first === last ? `Stage ${first}` : `Stages ${first} to ${last}`);

export function coverSheet() {
  return h('section', { class: 'pp-sheet pp-cover', 'data-sheet': 'cover' },
    h('p', { class: 'pp-title' }, "Meadowlark's World: Syllable Quest"),
    h('p', { class: 'pp-sub' }, 'My Word Book'),
    h('p', {}, 'Six lands. Six crests. One word at a time.'),
    h('p', { class: 'pp-name' }, 'Name: ', h('span', { class: 'pp-line' })));
}

export function mapSheet(terms) {
  const lands = LANDS.filter((land) => land.type !== null);
  const items = lands.flatMap((land, i) => [
    i > 0 ? h('li', { class: 'pp-arrow', 'aria-hidden': 'true' }, '↓') : null,
    h('li', { class: 'pp-land', 'data-land': land.id },
      h('strong', {}, `${land.n}. ${landName(land.id, terms)}`),
      h('span', { class: 'pp-box' }, `Crest (${CREST_NAMES[ (land.id)]}) ☐`),
      h('span', {}, `Syllable type: ${termFor( (land.type), terms)}`),
      h('span', {}, stageRange(land.first, land.last))),
  ]);
  return h('section', { class: 'pp-sheet pp-map', 'data-sheet': 'map' },
    h('h2', {}, 'My map of the six lands'),
    h('p', { class: 'pp-note' }, 'Tick each crest box when the crest is earned.'),
    h('ul', { class: 'pp-path' }, items));
}

export function crestSheet(terms) {
  const stickers = LANDS.filter((land) => land.type !== null).flatMap((land) => Array.from({ length: STICKERS_PER_CREST }, () => h('div', { class: 'pp-sticker', 'data-crest': land.id },
    h('strong', {}, CREST_NAMES[ (land.id)]),
    h('span', {}, landName(land.id, terms)),
    h('span', {}, termFor( (land.type), terms)))));
  return h('section', { class: 'pp-sheet pp-crests', 'data-sheet': 'crests' },
    h('h2', {}, 'Crest stickers'),
    h('p', { class: 'pp-note' }, 'Cut them out and stick one in the Word Book when a crest is earned.'),
    h('div', { class: 'pp-stickers' }, stickers));
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'printables');
  if (!body) return () => {};
  const terms = ctx.settings?.terms;
  const sheets = { cover: coverSheet(), map: mapSheet(terms), crests: crestSheet(terms) };
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });

  const clear = () => { for (const sheet of Object.values(sheets)) sheet.removeAttribute('data-print'); };
  const print = (id) => {
    clear();
    sheets[id].setAttribute('data-print', '');
    if (typeof globalThis.print !== 'function') {
      clear();
      message.textContent = "This browser can't open the print window from here. Use the browser's own print command.";
      return;
    }
    globalThis.addEventListener?.('afterprint', clear, { once: true });
    try {
      globalThis.print();
    } catch (err) {
      console.error('The print window could not open', err);
      message.textContent = "The print window couldn't open. Use the browser's own print command.";
      clear();
      return;
    }
    if (typeof globalThis.addEventListener !== 'function') clear();
    message.textContent = `Printing: ${SHEETS.find(([sheet]) => sheet === id)?.[1]}.`;
  };

  body.append(
    h('style', {}, PRINT_CSS),
    h('p', {}, 'Pages for the paper Word Book. Print one at a time with your browser. The names follow the names you chose in Settings.'),
    h('div', { class: 'gu-row gu-wrap' }, SHEETS.map(([id, label]) => h('button', {
      type: 'button', class: 'gu-button', 'data-print-sheet': id, onClick: () => print(id),
    }, `Print: ${label}`))),
    message,
    ...Object.values(sheets));
  return () => { globalThis.removeEventListener?.('afterprint', clear); };
}
