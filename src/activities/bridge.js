import { h } from '../core/dom.js';
import { madeUpId, meaningId, syllableId, wordId } from '../core/voice-ids.js';
import { flipSplit, gaps as gapsOf, syllableTypesOf, vowelTapTargets } from '../curriculum/divide.js';
import { soundKind } from '../curriculum/phonemes.js';
import { isDoubled } from '../curriculum/syllables.js';
import { makeKey, parseKey } from '../engine/keys.js';
import { pickProtege } from '../engine/protege.js';
import { artImage, keysOnPage } from '../ui/components.js';
import { coachText, termFor } from '../ui/terms.js';
import { chooseOne, createActivityView, judgeAloud, offerPass, sayPick, secondClick, showNext, sparkle } from './kit.js';

export const ID = 'bridge';

const LANDS = Object.freeze(['closed', 'open', 'vce', 'team', 'r', 'le']);

const MAX_WORD_MS = 5 * 60 * 1000;

const TILE_MAX = 76;
const TILE_MIN = 58;
const ROW_WIDTH = 780;

const SPLIT_COACH = Object.freeze({
  'VC/CV': 'Count the consonants between the two vowels. Where can they be shared?',
  'V/CV': 'Look at the first vowel. Is its door open or shut?',
  'VC/V': 'Look at the first vowel. Is its door open or shut?',
  'C+le': 'Look at the end of the word. Which consonant goes with the le?',
  'CC+le': 'Look at the end of the word. Which letters go with the le?',
  compound: 'Can you find two small words inside it?',
  ending: 'Does the ending make a part of its own?',
  VV: 'Two vowel sounds sit side by side. Where do they part?',
  VCCCV: 'Which of these consonants can start a part together?',
});

const ADULT_VOWELS = 'Grown-up: your reader taps each vowel sound. Letter teams and a final le are one tap. A silent e is not tapped.';

const lookup = (content, w) => (content?.byWord instanceof Map ? content.byWord.get(w) : undefined) ?? content?.words?.find(( r) => r?.w === w);

const landOf = (stage) => String(stage ?? '').split('.')[0];

function bannerTypes(stage, needed) {
  const land = landOf(stage);
  const at = LANDS.indexOf(land);
  const reached = new Set(land === 'city' ? LANDS : LANDS.slice(0, at < 0 ? 1 : at + 1));
  for (const t of needed) reached.add(t);
  return LANDS.filter((t) => reached.has(t));
}

function starts(segs) {
  const out = [0];
  for (const [g] of segs) out.push(out[out.length - 1] + String(g).length);
  return out;
}

function cutAt(word, at) {
  const bounds = [0, ...at, word.length];
  return bounds.slice(1).map((end, i) => word.slice(bounds[i], end));
}

function positionsOf(segs, st, gap) {
  const lo = st[gap.boxes[0] + 1];
  const hi = st[gap.boxes[1]];
  const out = [];
  for (let p = lo; p <= hi; p++) {
    const si = st.indexOf(p);
    const ok = si >= 0 && si < segs.length
      ? soundKind(segs[si][1]) !== 'silent'
      : segs.some((s, i) => st[i] < p && p < st[i + 1] && isDoubled(s) && p === st[i] + 1);
    if (ok) out.push(p);
  }
  return out;
}

function wobble(el) {
  el.classList.remove('wobble');
  void el.offsetWidth;
  el.classList.add('wobble');
}

export async function run(el, ctx, round, hooks) {
  const items = (round?.items ?? []).filter(( i) => typeof (i?.data?.word ?? parseKey(i?.key)?.id) === 'string');
  if (items.length === 0) return;
  const land = landOf(round?.stage);
  const view = createActivityView(el, ctx, { name: 'bridge', bg: `bg/${LANDS.includes(land) ? land : 'map'}` });
  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  const began = clock();
  const limit = ( a) => (Number.isFinite(a?.words) && a.words > 0 ? Math.min(a.words, items.length) : items.length);
  const planned = Math.max(1, limit(hooks.allowance?.()));
  let done = 0;
  const known = [];
  for (const item of items) {
    const a = hooks.allowance?.();
    if (done > 0 && (done >= limit(a) || (Number.isFinite(a?.softMs) && a.softMs > 0 && clock() - began >= a.softMs))) break;
    const t0 = clock();
    const shown = await runWord({ view, ctx, round, hooks, known }, item);
    if (!shown) continue;
    hooks.addDivisionMs?.(Math.min(MAX_WORD_MS, Math.max(0, clock() - t0)));
    done++;
    hooks.progress?.(Math.min(1, done / planned));
  }
  hooks.progress?.(1);
  if (done > 0 && view.live() && typeof hooks.protege === 'function') {
    const isWord = ( w) => { const r = lookup(ctx?.content, w); return Boolean(r) && r.real !== false; };
    const picked = pickProtege(protegeWords(ctx, known), { rng: ctx?.rng, isWord });
    if (picked && hooks.protege()) await apprenticeTries(view, ctx, picked);
  }
  await view.sayKept();
  view.destroy();
}

function protegeWords(ctx, known) {
  const shuffle = ( a) => (typeof ctx?.rng?.shuffle === 'function' ? ctx.rng.shuffle(a) : a);
  const mastered = [];
  const states = ctx?.states;
  const values = states instanceof Map ? [...states.values()] : (states && typeof states === 'object' ? Object.values(states) : []);
  for (const s of values) {
    if (s?.mastered !== true || typeof s.key !== 'string') continue;
    const parsed = parseKey(s.key);
    if (!parsed || parsed.prefix !== 'w' || (parsed.mode !== 'divide' && parsed.mode !== 'read')) continue;
    const rec = lookup(ctx?.content, parsed.id);
    if (rec) mastered.push(rec);
  }
  return [...shuffle([...known]), ...shuffle(mastered)].filter((r) => r && r.real !== false);
}

async function apprenticeTries(view, ctx, picked) {
  const { word, right, wrong, gap } = picked;
  const letters = [...word];
  const tw = Math.max(TILE_MIN, Math.min(TILE_MAX, Math.floor(ROW_WIDTH / Math.max(1, letters.length))));
  const voiceText = ( id) => ctx?.content?.voice?.[id]?.text ?? '';
  const clip = wordId(word);
  const lo = gap > 0 ? right[gap - 1] : 0;
  const hi = gap < right.length - 1 ? right[gap + 1] : letters.length;
  const spots = [];
  for (let p = lo + 1; p < hi; p++) spots.push(p);
  const answer = right[gap];
  const S = { fixed: false, misses: 0, glow: false };
  let onFixed = () => {};
  const fixedNow = new Promise((resolve) => { onFixed = () => resolve(undefined); });

  const instruction = h('p', { class: 'bridge-instruction', 'aria-live': 'polite' }, voiceText('v.bridge.protege-try'));
  const main = h('div', { class: 'bridge-main' });
  const adult = h('p', { class: 'bridge-adult' }, `Grown-up: practice only, nothing is scored. The apprentice split it ${cutAt(word, wrong).join('|')}; it breaks ${cutAt(word, right).join('|')}.`);

  const planks = ( ats) => h('div', { class: ['bridge-planks', 'is-joined'], role: 'group', 'aria-label': 'The planks' },
    cutAt(word, ats).map((part, i) => h('div', { class: 'bridge-plank', 'data-index': i, 'data-part': part },
      h('div', { class: 'bridge-plank-letters' }, [...part].map((ch) => h('span', { class: 'bridge-letter' }, ch))))));

  function draw() {
    const tiles = letters.map((ch, k) => h('span', { class: 'bridge-tile', 'data-k': k, 'aria-hidden': 'true' }, ch));
    const marks = right.map((r, i) => (i === gap ? null : h('span', { class: 'bridge-split', style: { '--k': r }, 'aria-hidden': 'true' })));
    const herSplit = h('span', { class: ['bridge-split', 'is-hers'], style: { '--k': wrong[gap] }, 'aria-hidden': 'true' });
    const slots = spots.map((p) => h('button', {
      type: 'button', class: ['bridge-gap', S.glow && p === answer && 'glow'], 'data-gap': gap, 'data-at': p, style: { '--k': p },
      'aria-label': `Break the word here: ${word.slice(0, p)} then ${word.slice(p)}`,
      onClick: ( event) => onSlot(p, event, (event?.currentTarget ?? event?.target ?? null)),
    }, h('span', { class: 'bridge-gap-post', 'aria-hidden': 'true' })));
    main.replaceChildren(
      planks(wrong),
      h('div', { class: 'bridge-word', style: { '--tw': `${tw}px` }, role: 'group', 'aria-label': `The word ${word}` }, tiles, marks, herSplit, slots),
    );
  }

  function onSlot(p, event, slotEl) {
    if (S.fixed || secondClick(event)) return;
    if (p === answer) {
      S.fixed = true;
      onFixed();
      return;
    }
    S.misses++;
    if (slotEl) wobble(slotEl);
    if (S.misses >= 2 && !S.glow) {
      S.glow = true;
      draw();
    }
    void view.say([clip]);
  }

  view.show(h('div', { class: 'bridge bridge-protege' }, instruction, main, adult));
  view.think(true);
  draw();
  view.choosing(true);
  await view.prompt(['v.bridge.protege-try', clip, 'v.bridge.protege-ask']);
  if (!S.fixed && view.live()) instruction.textContent = voiceText('v.bridge.protege-ask');
  await fixedNow;
  view.choosing(false);
  view.think(false);
  view.cheer();
  instruction.textContent = voiceText('v.bridge.protege-thanks');
  main.replaceChildren(planks(right));
  await showNext(view, ['v.bridge.protege-thanks', clip]).pressed;
}

async function runWord({ view, ctx, round, hooks, known }, item) {
  const word = item?.data?.word ?? parseKey(item?.key)?.id;
  const content = ctx?.content;
  const rec = lookup(content, word);
  if (!rec || !Array.isArray(rec.segs) || rec.segs.length === 0) return false;
  const terms = round?.terms ?? ctx?.settings?.terms;
  const segs = rec.segs;
  const st = starts(segs);
  const letters = [...String(rec.w ?? word)];
  const isWord = ( w) => { const r = lookup(content, w); return Boolean(r) && r.real !== false; };
  const dopts = { isWord, base: rec.base ?? null };
  const dgaps = gapsOf(segs, dopts);
  const taps = vowelTapTargets(segs);
  const targets = taps.targets;
  const targetAt = ( k) => targets.find((t) => k >= t.from && k < t.to);
  const silentAt = ( k) => taps.silent.some((t) => k >= t.from && k < t.to);
  const consonants = new Set();
  for (const g of dgaps) for (const s of g.between) for (let k = st[s]; k < st[s + 1]; k++) consonants.add(k);
  const positions = dgaps.map((g) => positionsOf(segs, st, g));
  const primary = dgaps.map((g) => g.at);

  const flexGap = rec.flex ? dgaps.findIndex((_, i) => flipSplit(segs, i, dopts) !== null) : -1;
  const flip = flexGap >= 0 ? flipSplit(segs, flexGap, dopts) : null;
  const altAt = flip ? flip.at[flexGap] : null;
  const accepted = dgaps.map((g, i) => new Set(i === flexGap && altAt !== null ? [g.at, altAt] : [g.at]));
  for (let i = 0; i < dgaps.length; i++) for (const at of accepted[i]) if (!positions[i].includes(at)) positions[i].push(at);
  for (const list of positions) list.sort((a, b) => a - b);

  const keyOf = ( mode) => makeKey('w', word, mode);
  const tw = Math.max(TILE_MIN, Math.min(TILE_MAX, Math.floor(ROW_WIDTH / Math.max(1, letters.length))));
  const voiceText = ( id) => ctx?.content?.voice?.[id]?.text ?? '';
  const coachLines = (rec.stage === round?.stage ? (ctx?.content?.coach?.[round?.stage]?.bridge ?? []) : []).map(( l) => coachText(l, terms)).filter(Boolean);

  const S = {
    phase: 'vowels',
    tapped: new Set(),
    vowelMisses: 0,
    glow: false,
    passed: false,
    placed: new Map(),
    gapMisses: dgaps.map(() => 0),
    wrongSplits: 0,
    said: undefined,
    shown: new Set(),
    kb: -1,
    chosen: [...primary],
    planks: [],
    parts: [],
    types: [],
    flipped: false,
  };
  const waiters = new Set();
  const changed = () => { for (const w of [...waiters]) w(); };
  const until = ( pred) => (pred() ? Promise.resolve() : new Promise((resolve) => {
    const w = () => { if (pred()) { waiters.delete(w); resolve(undefined); } };
    waiters.add(w);
  }));

  const ui = {
    instruction: h('p', { class: 'bridge-instruction', 'aria-live': 'polite' }),
    main: h('div', { class: 'bridge-main' }),
    note: h('p', { class: 'bridge-note', 'aria-live': 'polite', hidden: true }),
    tools: h('div', { class: 'bridge-tools' }),
    banners: h('div', { class: 'bridge-banners', role: 'group', 'aria-label': 'Clan banners' }),
    coach: h('p', { class: 'bridge-coach', hidden: true }),
    adult: h('p', { class: 'bridge-adult' }),
  };
  const setLine = ( box, text) => { box.textContent = text; box.hidden = text === ''; };
  const instruct = ( id) => { setLine(ui.instruction, voiceText(id)); };
  const setCoach = ( text) => setLine(ui.coach, text ? `Grown-up, ask: ${text}` : '');
  const splitText = ( ats) => cutAt(word, ats).join('|');

  const wrongSplitText = (g, at) => splitText(dgaps.map((d, i) => (i === g ? at : (S.placed.get(i) ?? d.at))));

  function wordRow() {
    const tiles = letters.map((ch, k) => {
      const t = targetAt(k);
      const vowel = Boolean(t) && S.tapped.has( (t).seg);
      const glowing = Boolean(t) && !vowel && S.glow && S.phase === 'vowels';
      const cons = S.phase !== 'vowels' && consonants.has(k);
      return h('button', {
        type: 'button', class: ['bridge-tile', vowel && 'is-vowel', glowing && 'glow', cons && 'is-cons', silentAt(k) && 'is-silent'],
        'data-k': k, 'aria-label': `${ch}${vowel ? ', vowel sound' : ''}${cons ? ', consonant' : ''}`,
        onClick: ( event) => onTile(k, event, (event?.currentTarget ?? event?.target ?? null)),
      }, ch, vowel ? h('span', { class: 'bridge-mark', 'aria-hidden': 'true' }, 'V') : cons ? h('span', { class: 'bridge-mark', 'aria-hidden': 'true' }, 'C') : null);
    });
    const slots = [];
    const splitsMade = [];
    if (S.phase === 'split') {
      const active = activeSlots();
      dgaps.forEach((g, i) => {
        const at = S.placed.get(i);
        if (at !== undefined) {
          splitsMade.push(h('span', { class: ['bridge-split', S.shown.has(i) && 'is-shown'], style: { '--k': at }, 'aria-hidden': 'true' }));
          return;
        }
        for (const p of positions[i]) {
          const kbOn = active[S.kb] && active[S.kb].g === i && active[S.kb].at === p;
          slots.push(h('button', {
            type: 'button', class: ['bridge-gap', kbOn && 'is-kb'], 'data-gap': i, 'data-at': p, style: { '--k': p },
            'aria-label': `Break the word here: ${word.slice(0, p)} then ${word.slice(p)}`,
            onClick: ( event) => onSlot(i, p, event, (event?.currentTarget ?? event?.target ?? null)),
          }, h('span', { class: 'bridge-gap-post', 'aria-hidden': 'true' })));
        }
      });
    }
    return h('div', { class: 'bridge-word', style: { '--tw': `${tw}px` }, role: 'group', 'aria-label': `The word ${word}` }, tiles, slots, splitsMade);
  }

  function plankRow() {
    S.planks = S.parts.map((part, i) => {
      let k = S.parts.slice(0, i).join('').length;
      const spans = [...part].map((ch) => h('span', { class: ['bridge-letter', silentAt(k++) && 'is-silent'] }, ch));
      return h('div', { class: 'bridge-plank', 'data-index': i, 'data-part': part }, h('div', { class: 'bridge-plank-letters' }, spans), h('span', { class: 'bridge-plank-type' }));
    });
    return h('div', { class: 'bridge-planks', role: 'group', 'aria-label': 'The planks' }, S.planks);
  }

  function activeSlots() {
    return dgaps.flatMap((_, g) => (S.placed.has(g) ? [] : positions[g].map((at) => ({ g, at }))));
  }

  function draw() {
    if (S.phase === 'planks') ui.main.replaceChildren(plankRow());
    else {
      const rows = [wordRow()];
      if (S.phase === 'split') rows.push(h('p', { class: 'bridge-pattern' }, dgaps.map((g) => g.pattern).join('  ·  ')));
      ui.main.replaceChildren(...rows);
    }
  }

  view.show(h('div', { class: 'bridge' }, ui.instruction, ui.main, ui.note, ui.tools, ui.banners, ui.coach, ui.adult));

  function onTile(k, event, tileEl) {
    if (S.phase !== 'vowels' || S.passed || secondClick(event)) return;
    if (hooks.monitor?.tap?.()) return;
    const t = targetAt(k);
    if (t) {
      if (S.tapped.has(t.seg)) return;
      S.tapped.add(t.seg);
      const heard = sayPick(view, segs[t.seg][0], { seg: segs[t.seg] });
      draw();
      if (S.tapped.size >= targets.length) void heard.then(changed);
      return;
    }
    if (silentAt(k)) {
      setLine(ui.note, voiceText('v.bridge.silent-e'));
      void view.say(['v.bridge.silent-e']);
      return;
    }
    S.vowelMisses++;
    hooks.monitor?.wrong?.();
    if (tileEl) wobble(tileEl);
    const box = segAt(k);
    const heard = box >= 0 ? sayPick(view, segs[box][0], { seg: segs[box] }) : Promise.resolve();
    if (S.vowelMisses >= 2 && !S.glow) {
      S.glow = true;
      draw();
      instruct('v.bridge.vowels-glow');
      void heard.then(() => view.say(['v.bridge.vowels-glow']));
    } else if (!S.glow) {
      void heard.then(() => view.say(['v.bridge.try-vowel']));
    }
  }

  function segAt(k) {
    for (let i = 0; i < segs.length; i++) if (k >= st[i] && k < st[i + 1]) return i;
    return -1;
  }

  function onSlot(g, at, event, slotEl) {
    if (S.phase !== 'split' || S.passed || S.placed.has(g) || secondClick(event)) return;
    if (hooks.monitor?.tap?.()) return;
    if (accepted[g].has(at)) {
      S.placed.set(g, at);
      setCoach('');
      if (S.placed.size < dgaps.length) instruct('v.bridge.pick-split');
      view.cheer();
      redrawSplit();
      changed();
      return;
    }
    S.gapMisses[g]++;
    S.wrongSplits++;
    hooks.monitor?.miss?.();
    S.said ??= wrongSplitText(g, at);
    if (slotEl) wobble(slotEl);
    const lines = coachLines.length > 0 ? coachLines : [SPLIT_COACH[dgaps[g].pattern] ?? SPLIT_COACH['VC/CV']];
    setCoach(lines[Math.min(S.gapMisses[g] - 1, lines.length - 1)]);
    if (S.gapMisses[g] >= 2) {
      S.placed.set(g, dgaps[g].at);
      S.shown.add(g);
      instruct('v.bridge.split-shown');
      redrawSplit();
      changed();
    } else {
      instruct('v.bridge.split-again');
      void view.say(['v.bridge.split-again']);
    }
  }

  function redrawSplit() {
    const list = activeSlots();
    S.kb = Math.min(S.kb, list.length - 1);
    draw();
  }

  const onKey = (event) => {
    if (S.phase !== 'split' || S.passed) return;
    if (event.target?.closest?.('.pass-button, .copilot-banner')) return;
    const list = activeSlots();
    if (list.length === 0) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault?.();
      S.kb = event.key === 'ArrowRight' ? (S.kb + 1) % list.length : (S.kb <= 0 ? list.length - 1 : S.kb - 1);
      draw();
      const slot = ui.main.querySelector('.bridge-gap.is-kb');
      slot?.focus?.();
    } else if (event.key === 'Enter' && S.kb >= 0 && list[S.kb]) {
      event.preventDefault?.();
      const { g, at } = list[S.kb];
      onSlot(g, at, ({}), ui.main.querySelector('.bridge-gap.is-kb'));
    }
  };
  const stopKeys = keysOnPage(view.root, onKey);

  const stopPass = offerPass(view, () => { S.passed = true; changed(); });

  S.phase = 'vowels';
  instruct('v.bridge.tap-vowels');
  setLine(ui.adult, ADULT_VOWELS);
  draw();
  void view.prompt(['v.bridge.tap-vowels']);
  view.choosing(true);
  if (targets.length > 0) await until(() => S.passed || S.tapped.size >= targets.length);
  if (S.passed) { for (const t of targets) S.tapped.add(t.seg); }

  if (dgaps.length > 0 && !S.passed) {
    S.phase = 'split';
    S.kb = -1;
    instruct('v.bridge.pick-split');
    const either = flexGap >= 0 && altAt !== null ? ` Either ${splitText(primary)} or ${splitText(flip ? flip.at : primary)} is right.` : '';
    setLine(ui.adult, `Grown-up: the word breaks ${splitText(primary)} (${dgaps.map((g) => g.pattern).join(', ')}).${either}`);
    draw();
    void view.prompt(['v.bridge.pick-split']);
    await until(() => S.passed || S.placed.size >= dgaps.length);
  }
  stopPass();
  if (S.shown.size > 0 && !S.passed) await view.say(['v.bridge.split-shown'], 1500);
  if (S.passed) { dgaps.forEach((g, i) => { if (!S.placed.has(i)) S.placed.set(i, g.at); }); }
  S.chosen = dgaps.map((_, i) => (S.placed.get(i)));
  setCoach('');
  setLine(ui.note, '');
  setLine(ui.adult, '');
  view.choosing(false);

  const dKey = keyOf('divide');
  if (S.passed) {
    hooks.pass?.(dKey);
  } else {
    const helped = S.shown.size > 0;
    const clean = dgaps.length === 0 ? S.vowelMisses === 0 : S.wrongSplits === 0;
    hooks.record(dKey, 'divide', { correct: clean && !helped, helped, ...(S.said !== undefined ? { said: S.said } : {}) });
    if (clean && !helped) {
      known.push(rec);
      const twin = dgaps.some((g) => g.twin);
      const fit = twin ? [1] : [2, 3];
      sparkle(ui.main, view.root);
      view.cheer();
      view.sayNext(dgaps.length > 0 ? view.praise('bridge', fit) : []);
    }
  }

  const setSplit = () => {
    const ats = S.chosen;
    S.parts = cutAt(word, ats);
    const flipped = flip !== null && ats[flexGap] === altAt;
    S.types = flipped ? flip.types : syllableTypesOf(segs, dopts);
  };
  setSplit();
  S.phase = 'planks';
  draw();

  if (flip !== null && altAt !== null) {
    const readings = [splitText(primary), splitText(flip.at)];
    const choose = ( ats) => {
      S.chosen = [...ats];
      S.flipped = ats[flexGap] === altAt;
      setSplit();
      draw();
      drawTools();
    };
    const drawTools = () => {
      const flipBtn = h('button', { type: 'button', class: 'bridge-flip', onClick: ( event) => {
        if (secondClick(event)) return;
        if (hooks.monitor?.tap?.()) return;
        ui.tools.setAttribute('data-flipped', 'true');
        choose(S.chosen[flexGap] === altAt ? primary : flip.at);
      } }, h('span', { 'aria-hidden': 'true' }, '⇄'), ' Flip the split');
      const kids = [flipBtn];
      if (rec.mean) {
        kids.push(h('button', { type: 'button', class: 'bridge-meaning', onClick: () => { void view.say([meaningId(word)]); } }, 'What does it mean?'));
      }
      if (ui.tools.getAttribute('data-flipped') === 'true') {
        const pick = ( ats, text) => h('button', {
          type: 'button', class: ['bridge-reading', splitText(S.chosen) === text && 'is-current'], 'data-reading': text,
          onClick: () => choose(ats),
        }, text);
        kids.push(h('div', { class: 'bridge-chooser', role: 'group', 'aria-label': 'Which split reads as a real word?' },
          h('span', { class: 'bridge-chooser-label' }, 'Grown-up: which split reads as a real word?'),
          pick(primary, readings[0]), pick(flip.at, readings[1])));
        if (rec.mean) kids.push(h('p', { class: 'bridge-adult' }, `Meaning: ${rec.mean}`));
      }
      ui.tools.replaceChildren(...kids);
    };
    drawTools();
    instruct('v.bridge.flip');
    const next = showNext(view, ['v.bridge.flip']);
    await next.pressed;
    ui.tools.replaceChildren();
    ui.tools.removeAttribute('data-flipped');
  }

  instruct('v.bridge.name-planks');
  void view.prompt(['v.bridge.name-planks']);
  const choiceTypes = bannerTypes(round?.stage, S.types);
  let labelCorrect = true;
  let labelHelped = false;
  let labelPassed = false;
  let labelSaid;
  for (let p = 0; p < S.parts.length && !labelPassed; p++) {
    const plankEl = S.planks[p];
    plankEl.classList.add('is-current');
    const answer = S.types[p];
    const choices = choiceTypes.map((type) => {
      const label = termFor(type, terms);
      const button = h('button', { type: 'button', class: 'bridge-banner', 'data-type': type, 'aria-label': label },
        artImage(`ui-sq/clan-${type}`, 'bridge-banner-art'), h('span', { class: 'bridge-banner-label' }, label));
      button.addEventListener('click', () => {
        if (view.lock.locked() || button.classList.contains('dim') || type === answer) return;
        labelSaid ??= label;
      });
      return { value: type, el: button };
    });
    ui.banners.replaceChildren(...choices.map((c) => c.el));
    setLine(ui.adult, `Grown-up: this plank is ${termFor(answer, terms)}.`);
    const result = await chooseOne(view, {
      choices, answer, target: plankEl, hint: ['v.bridge.which-clan'], reward: [],
    });
    plankEl.classList.remove('is-current');
    ui.banners.replaceChildren();
    if ('pass' in result && result.pass) { labelPassed = true; break; }
    const r = (result);
    if (!r.correct) labelCorrect = false;
    if (r.helped) labelHelped = true;
    const caption = plankEl.querySelector('.bridge-plank-type');
    if (caption) caption.textContent = termFor(answer, terms);
    plankEl.setAttribute('data-type', answer);
  }
  setLine(ui.adult, '');
  const lKey = keyOf('label');
  if (labelPassed) hooks.pass?.(lKey);
  else hooks.record(lKey, 'label', { correct: labelCorrect && !labelHelped, helped: labelHelped, ...(labelSaid !== undefined ? { said: labelSaid } : {}) });

  const idOf = ( part, type) => syllableId(part, type);
  if (S.parts.length > 1) {
    instruct('v.bridge.read-planks');
    void view.prompt(['v.bridge.read-planks']);
    for (let p = 0; p < S.parts.length; p++) {
      const plankEl = S.planks[p];
      plankEl.classList.add('is-reading');
      await judgeAloud(view, {
        kind: 'read', model: [idOf(S.parts[p], S.types[p])], target: plankEl, pass: false,
        coach: `What does the vowel say in a ${termFor(S.types[p], terms)} plank?`,
      });
      plankEl.classList.remove('is-reading');
    }
  }
  const row = ui.main.querySelector('.bridge-planks');
  row?.classList.add('is-joined');
  instruct('v.bridge.walk');
  void view.prompt(['v.bridge.walk']);
  const model = [rec.real === false ? madeUpId(word) : wordId(word)];
  const res = await judgeAloud(view, {
    kind: 'read', model, target: (row ?? ui.main), praise: 'bridge', praiseLines: [2, 3],
    coach: 'Slide a finger under each plank, then say the whole word.',
  });
  const rKey = keyOf('read');
  const answer = (res);
  if (answer.passed) {
    hooks.pass?.(rKey);
  } else {
    hooks.record(rKey, 'read', {
      correct: answer.correct, helped: answer.helped, ...(answer.self ? { self: true } : {}), ...(answer.said !== undefined ? { said: answer.said } : {}),
    });
    if (item.focus && rec.real !== false) {
      const right = answer.correct === true && answer.helped !== true;
      hooks.gate?.('words', { right: right ? 1 : 0, total: 1, self: right && answer.self ? 1 : 0 });
    }
  }
  stopKeys();
  ui.main.replaceChildren();
  return true;
}
