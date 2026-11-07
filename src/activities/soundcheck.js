import { h } from '../core/dom.js';
import { madeUpId } from '../core/voice-ids.js';
import { GRAPHEMES, drillDeck, graphemeOf, soundClips } from '../curriculum/graphemes.js';
import { PICK_GAP_MS, pickSoundClips } from '../curriculum/letter-sound.js';
import { PHONEMES, phonemeCodes } from '../curriculum/phonemes.js';
import { CONFUSIONS } from '../engine/tricky-pairs.js';
import { parseKey } from '../engine/keys.js';
import { createRng } from '../core/rng.js';
import { artImage, tile } from '../ui/components.js';
import { coachText } from '../ui/terms.js';
import { PADS, usePaperToday, writesOnScreen, writingPad } from '../ui/writing-pad.js';
import { chooseOne, createActivityView, createOnce, judgeAloud, offerPass, runRound, secondClick, showNext, untilHerTurn } from './kit.js';

export const ID = 'soundcheck';

export const PARTS = Object.freeze(['see', 'hear', 'blend']);

export const MOUTH_SLUG = Object.freeze({
  a: 'a', e: 'e', i: 'i', o: 'o', u: 'u',
  A: 'long-a', E: 'long-e', I: 'long-i', O: 'long-o', U: 'long-u',
  oo: 'oo-moon', uu: 'oo-book', aw: 'aw', ow: 'ow', oy: 'oy',
  ar: 'ar', or: 'or', er: 'er', '@': 'schwa',
  f: 'f', v: 'v', th: 'th', dh: 'dh', sh: 'sh', ch: 'ch', j: 'j', ng: 'ng', r: 'r', l: 'l', w: 'w', y: 'y',
});

const ENDING_IDS = new Set(['s:s', 's:z', 'es:@z', 'ed:t', 'ed:d', 'ed:@d', 'ing']);

const CHIP_KINDS = new Set(['letter', 'short-vowel', 'team', 'r-control', 'sound']);
const MAX_CHIPS = 5;


export function cardLabel(entry) {
  const g = entry.g.replace('-', '_');
  return ENDING_IDS.has(entry.id) ? `-${g}` : g;
}

export function soundLabels(codes) {
  return codes.map((c) => PHONEMES[c]?.label ?? `/${c}/`).join(' ');
}

export function spellingsToShow(expected, stageIndex) {
  const known = expected.map((id) => ({ id, entry: graphemeOf(id) })).filter((x) => x.entry);
  const written = ( x) => cardLabel({ id: x.id, g: x.entry.g }).replace(/^-/, '');
  const unique = ( list) => [...new Set(list)];
  if (known.length === 0) return { shown: unique(expected.map((id) => id.split(':')[0])), older: [] };
  let recent = known.filter((x) => x.entry.stage >= stageIndex - 1);
  if (recent.length === 0) {
    const top = Math.max(...known.map((x) => x.entry.stage));
    recent = known.filter((x) => x.entry.stage === top);
  }
  const shown = unique(recent.map(written));
  const older = unique(known.filter((x) => !recent.includes(x)).map(written)).filter((w) => !shown.includes(w));
  return { shown, older };
}

function partnersOf(g) {
  const out = [];
  for (const family of CONFUSIONS) {
    if (!CHIP_KINDS.has(family.kind) || !family.members.includes(g)) continue;
    for (const m of family.members) if (m !== g && !out.includes(m)) out.push(m);
  }
  return out;
}

export function confusionChips(g) {
  return partnersOf(g).slice(0, MAX_CHIPS);
}

export function blendChips(segs) {
  const word = segs.map(([g]) => g).join('');
  const out = [];
  for (let i = 0; i < segs.length && out.length < MAX_CHIPS; i++) {
    if (segs[i][1] === '') continue;
    for (const alt of partnersOf(segs[i][0])) {
      const w = segs.map(([g], j) => (j === i ? alt : g)).join('');
      if (w !== word && !out.includes(w) && out.length < MAX_CHIPS) out.push(w);
    }
  }
  return out;
}

export function mouthCards(codes) {
  const ids = [];
  for (const c of codes) {
    const slug = Object.hasOwn(MOUTH_SLUG, c) ? MOUTH_SLUG[c] : undefined;
    if (slug && !ids.includes(`mouth/${slug}`)) ids.push(`mouth/${slug}`);
  }
  return ids.slice(0, 2);
}

export const NEAR_MISSES = Object.freeze({
  b: Object.freeze(['d', 'p']), d: Object.freeze(['b', 't']), p: Object.freeze(['b']), t: Object.freeze(['d']),
  m: Object.freeze(['n']), n: Object.freeze(['m']),
  f: Object.freeze(['v', 'th']), v: Object.freeze(['f']), th: Object.freeze(['f']),
  i: Object.freeze(['e']), e: Object.freeze(['i']),
  sh: Object.freeze(['s', 'ch']), ch: Object.freeze(['sh']), s: Object.freeze(['sh']),
  g: Object.freeze(['k']), k: Object.freeze(['g']),
});

const tileLabel = (e) => cardLabel(e);

const isVowel = (e) => PHONEMES[phonemeCodes(e.p)[0]]?.kind === 'vowel';

export function cardDistractors(gid, deck, rng) {
  const target = graphemeOf(gid);
  if (!target) return [];
  const own = tileLabel(target);
  const byLabel = new Map();
  for (const e of deck ?? []) {
    if (!e || typeof e.g !== 'string') continue;
    const label = tileLabel(e);
    byLabel.set(label, [...(byLabel.get(label) ?? []), e]);
  }
  const letters = ( label) => label.replace(/^-/, '');
  const sameSound = new Set(GRAPHEMES.filter((e) => e.p === target.p).map((e) => letters(tileLabel(e))));
  const allowed = [...byLabel.keys()].filter((label) => label !== own
    && letters(label) !== letters(own)
    && !sameSound.has(letters(label))
    && !(byLabel.get(label) ?? []).some((e) => e.p === target.p));
  const plain = own.replace(/^-/, '');
  const partners = [...(NEAR_MISSES[plain] ?? []), ...partnersOf(plain)];
  const near = [...new Set(partners)].filter((x) => allowed.includes(x));
  const others = allowed.filter((x) => !near.includes(x));
  const vowel = isVowel(target);
  const sameKind = ( label) => (byLabel.get(label) ?? []).some((e) => isVowel(e) === vowel);
  const sameLength = ( label) => label.replace(/^-/, '').length === plain.length;
  const want = 2 + rng.int(2);
  return [
    ...near,
    ...rng.shuffle(others.filter((x) => sameKind(x) && sameLength(x))),
    ...rng.shuffle(others.filter((x) => sameKind(x) && !sameLength(x))),
    ...rng.shuffle(others.filter((x) => !sameKind(x))),
  ].slice(0, Math.min(3, Math.max(want, Math.min(near.length, 3))));
}

function praiseLinesFor(entry) {
  const letters = entry.g.replace(/[-:]/g, '').length;
  if (letters >= 3) return [1, 3];
  return letters === 2 ? [1, 2, 3] : [3];
}


function withLedger(hooks, focusKeys) {
  const ledger = [];
  const wrapped = {
    ...hooks,
    record( key, mode, result, opts) {
      hooks.record(key, mode, result, opts);
      if (result?.passed === true || opts?.scored === false) return;
      const right = result?.correct === true && result?.helped !== true;
      ledger.push({ key: parseKey(key) ? key : `${key}#${mode}`, right, self: right && result?.self === true });
    },
  };
  if (typeof hooks.undo === 'function') {
    wrapped.undo = ( ...args) => {
      const out = hooks.undo(...args);
      ledger.pop();
      return out;
    };
  }
  return {
    hooks: wrapped,
    counts() {
      const seen = new Set();
      let right = 0;
      let total = 0;
      let self = 0;
      for (const e of ledger) {
        if (seen.has(e.key)) continue;
        seen.add(e.key);
        if (!focusKeys.has(e.key)) continue;
        total++;
        if (e.right) right++;
        if (e.self) self++;
      }
      return { right, total, self };
    },
  };
}


const adultLine = (text, cls = 'grownup-text') => h('p', { class: cls, style: { margin: '4px 0', fontSize: '22px', lineHeight: '1.35', color: 'var(--ink-soft, #555)' } }, text);

function hasClip(ctx, id) {
  try {
    if (typeof ctx.voice?.hasClip === 'function') return ctx.voice.hasClip(id) === true;
    if (typeof ctx.audio?.has === 'function') return ctx.audio.has(id) === true;
  } catch { }
  return true;
}

function needsGrownUp(slot, say) {
  const note = adultLine(`Grown-up: please say ${say}`, 'needs-grownup');
  note.setAttribute('role', 'status');
  note.style.setProperty('font-weight', '700');
  slot.append(note);
  return note;
}

function viewWithMouth(view, codes) {
  const cards = mouthCards(codes);
  if (cards.length === 0) return view;
  return {
    ...view,
    say( ids, minMs, gap) {
      const at = ids.indexOf('v.praise.tricky');
      if (at < 0) return view.say(ids, minMs, gap);
      view.work.append(h('div', { class: 'mouth-cards', style: { display: 'flex', gap: '24px', justifyContent: 'center', margin: '12px 0' } },
        cards.map((id) => artImage(id, 'mouth-card'))));
      return view.say([...ids.slice(0, at + 1), 'v.soundcheck.mouth', ...ids.slice(at + 1)], minMs, gap);
    },
  };
}

function retitleBanner(view, text) {
  const title = view.root.querySelector('.copilot-title');
  if (title) title.textContent = text;
}

export const CARD_COACH = Object.freeze({
  see: Object.freeze(['Does the child say the sound this card makes, not the letter name?', 'Did the child say the sound without help?']),
  hear: Object.freeze(['Did the child say the sound again before writing it?', 'Does the spelling the child wrote match one of the taught spellings shown?']),
});


const WRITE_ON_SCREEN = 'Your reader writes a spelling for this sound on the screen. You look at it and mark it.';
const WRITE_ON_PAPER = 'Your reader writes a spelling for this sound in the Word Book.';

const copilotOn = (ctx) => ctx?.settings?.copilot !== false;

const picksItself = (ctx, item) => !copilotOn(ctx) && (item?.data?.part ?? item?.mode) === 'hear';

function cardOf(ctx, item) {
  const gid = item.data?.grapheme ?? parseKey(item.id)?.id;
  const entry = gid ? graphemeOf(gid) : null;
  if (!gid || !entry) {
    console.warn(`Sound Check cannot show ${item.id}; skipping it.`);
    return null;
  }
  const codes = phonemeCodes(entry.p);
  const clips = soundClips(gid);
  const playable = clips.length > 0 && clips.every((clip) => hasClip(ctx, clip));
  return { gid, entry, codes, labels: soundLabels(codes), playable, sound: playable ? clips : [] };
}

const adultNote = () => h('div', { class: 'grownup-note sc-adult', style: { margin: '8px auto', maxWidth: '900px', textAlign: 'center' } });

async function seeCard(view, item, shared, canUndo) {
  const { ctx } = shared;
  const card = cardOf(ctx, item);
  if (!card) return null;
  const { gid, entry, codes, labels, playable } = card;
  const own = pickSoundClips(gid);
  const model = playable && own.length > 0 && own.every((clip) => hasClip(ctx, clip)) ? own : card.sound;

  let checked = () => {};
  const clicked = new Promise((resolve) => { checked = resolve; });
  let hearing = false;
  let stopPass = () => {};
  const target = h('button', { type: 'button', class: 'sound-card', 'aria-label': 'Check the sound of this card',
    onClick: ( event) => {
      if (hearing || secondClick(event)) return;
      view.lock.run(async () => {
        if (hearing) return;
        hearing = true;
        stopPass();
        view.choosing(false);
        target.classList.add('checked');
        await view.say(model, 600, PICK_GAP_MS);
        checked('checked');
      });
    } }, h('span', { class: 'sound-card-label' }, cardLabel(entry)));

  const adult = adultNote();
  const expected = Array.isArray(item.data?.expected) && item.data.expected.length ? item.data.expected : codes;
  adult.append(adultLine(`${cardLabel(entry).replace(/^-/, '')}: ${soundLabels(expected)}`, 'grownup-sound'));
  shared.grownUp.say = labels;
  shared.grownUp.note = null;
  view.show(target, adult);
  if (!playable) shared.grownUp.note = needsGrownUp(adult, labels);

  const told = shared.once('v.soundcheck.check');
  const grownUpLine = playable ? [] : ['v.soundcheck.grownup'];
  await view.prompt(['v.soundcheck.check', ...grownUpLine], { play: [...told, ...(playable ? [] : shared.once('v.soundcheck.grownup'))] });
  if (!hearing) {
    view.play([]);
    view.choosing(true);
    stopPass = offerPass(view, () => { view.choosing(false); checked('passed'); });
  }
  if (await clicked === 'passed') return { pass: true };

  if (!copilotOn(ctx)) {
    const step = showNext(view, []);
    await step.pressed;
    return { correct: true, helped: false, selfChecked: true };
  }
  return judgeAloud(viewWithMouth(view, codes), {
    kind: 'said',
    model,
    target,
    praise: 'sound',
    praiseLines: praiseLinesFor(entry),
    canUndo,
    coach: shared.coach('see'),
    chips: confusionChips(entry.g),
  });
}

async function hearCard(view, item, shared, canUndo) {
  const { ctx, round } = shared;
  const card = cardOf(ctx, item);
  if (!card) return null;
  const { gid, entry, codes, labels, playable, sound } = card;

  const adult = adultNote();
  const onScreen = writesOnScreen(ctx);
  const writeLine = adultLine(onScreen ? WRITE_ON_SCREEN : WRITE_ON_PAPER);
  const target = h('button', { type: 'button', class: 'listen-disc', 'aria-label': 'Hear the sound again',
    onClick: () => { if (!view.lock.locked() && sound.length) view.play(sound); } }, artImage('ui/speaker'));
  let padRow = null;
  if (onScreen) {
    const writing = writingPad(PADS.sound, { height: 232, label: 'Write the spelling of the sound here.',
      onPaper: () => {
        usePaperToday(ctx);
        writeLine.textContent = WRITE_ON_PAPER;
        view.show(target, adult);
      } });
    padRow = h('div', { class: 'wp-hear' }, target, writing.el);
  }
  const { shown, older } = spellingsToShow(Array.isArray(item.data?.expected) && item.data.expected.length ? item.data.expected : [gid], round.stageIndex ?? 0);
  adult.append(
    writeLine,
    adultLine(`Taught spellings: ${shown.join(', ')}. Any taught spelling is right.`, 'grownup-spellings'),
    ...(older.length ? [adultLine(`Older spellings that are also right: ${older.join(', ')}.`, 'grownup-older')] : []));
  shared.grownUp.say = labels;
  shared.grownUp.note = null;
  view.show(padRow ?? target, adult);
  if (!playable) shared.grownUp.note = needsGrownUp(adult, labels);

  const told = shared.once('v.soundcheck.hear');
  const grownUpLine = playable ? [] : ['v.soundcheck.grownup'];
  await view.prompt(['v.soundcheck.hear', ...sound, ...grownUpLine], { play: [...told, ...sound, ...(playable ? [] : shared.once('v.soundcheck.grownup'))] });
  view.play([]);

  const judging = judgeAloud(viewWithMouth(view, codes), {
    kind: 'said',
    model: sound,
    target,
    praise: 'sound',
    praiseLines: praiseLinesFor(entry),
    canUndo,
    coach: shared.coach('hear'),
    chips: confusionChips(entry.g),
  });
  retitleBanner(view, "Grown-up's turn: did your reader write a taught spelling?");
  return judging;
}

async function hearPick(view, item, shared, abandon) {
  const { ctx, round } = shared;
  const card = cardOf(ctx, item);
  if (!card) return null;
  const { gid, entry, labels, playable, sound } = card;
  if (!playable) {
    const adult = adultNote();
    shared.grownUp.say = labels;
    shared.grownUp.note = null;
    view.show(adult);
    shared.grownUp.note = needsGrownUp(adult, labels);
    await view.prompt(['v.soundcheck.grownup'], { play: ['v.soundcheck.grownup'] });
    const step = showNext(view, []);
    await step.pressed;
    return { correct: true, helped: false, selfChecked: true };
  }
  const rng = ctx.rng ?? shared.rng;
  const answer = cardLabel(entry);
  const options = rng.shuffle([answer, ...cardDistractors(gid, drillDeck(Math.max(round.stageIndex ?? 0, entry.stage)), rng)]);
  const choices = untilHerTurn(options.map((label) => ({ value: label, el: tile({ label, onPick: () => {}, size: 130 }) })));
  const disc = h('button', { type: 'button', class: 'listen-disc', 'aria-label': 'Hear the sound again',
    onClick: () => { if (!view.lock.locked() && sound.length) view.play(sound, PICK_GAP_MS); } }, artImage('ui/speaker'));
  const adult = adultNote();
  shared.grownUp.say = labels;
  shared.grownUp.note = null;
  view.show(disc, h('div', { class: 'choice-row sc-pick' }, choices.map((c) => c.el)), adult);
  if (!playable) shared.grownUp.note = needsGrownUp(adult, labels);

  const told = shared.once('v.soundcheck.pick');
  await view.prompt(['v.soundcheck.pick', ...sound], { play: [...told, ...sound], gap: PICK_GAP_MS });
  return chooseOne(view, { choices, answer, hint: sound, hintGap: PICK_GAP_MS, reward: sound, praise: 'sound', praiseLines: praiseLinesFor(entry), keyboard: true, target: disc, abandon });
}

async function blendCard(view, item, shared, canUndo) {
  const { ctx } = shared;
  const parsed = parseKey(item.id);
  const word = item.data?.word ?? parsed?.id;
  if (!word) {
    console.warn(`Sound Check cannot show ${item.id}; skipping it.`);
    return null;
  }
  const rec = ctx.content?.byWord?.get?.(word);
  const segs = Array.isArray(rec?.segs) && rec.segs.length ? rec.segs : [...word].map((ch) => [ch, ch]);
  const codes = segs.flatMap(([, p]) => phonemeCodes(p));
  const labels = soundLabels(codes);
  const clip = madeUpId(word);
  const playable = hasClip(ctx, clip);
  const model = playable ? [clip] : [];

  const strip = h('div', { class: ['blend-strip', 'apart'], lang: 'en', 'aria-label': `The letters ${segs.map(([g]) => g).join(', ')}`,
    style: { display: 'flex', justifyContent: 'center', gap: '28px', transition: 'gap 0.6s ease' } },
  segs.map(([g]) => h('span', { class: 'word-card blend-card', style: { minWidth: '120px' } }, g)));
  const adult = h('div', { class: 'grownup-note', style: { margin: '8px auto', maxWidth: '900px', textAlign: 'center' } },
    adultLine(`${word}: ${labels}`, 'grownup-sound'));
  shared.grownUp.say = `${labels} (${word})`;
  shared.grownUp.note = null;
  view.show(strip, adult);
  if (!playable) shared.grownUp.note = needsGrownUp(adult, `${labels} (${word})`);

  const first = shared.once('v.soundcheck.blend');
  await view.prompt(['v.soundcheck.blend'], { play: first });
  strip.classList.remove('apart');
  strip.classList.add('together');
  strip.style.setProperty('gap', '4px');
  view.play([]);

  return judgeAloud(viewWithMouth(view, codes.filter((c) => PHONEMES[c]?.kind === 'vowel')), {
    kind: 'read',
    model,
    target: strip,
    praise: 'sound',
    praiseLines: [3],
    canUndo,
    coach: shared.coach('blend'),
    chips: blendChips(segs),
  });
}

function easyCard(ctx, round, used) {
  const states = ctx.states instanceof Map ? ctx.states : new Map();
  const deck = new Set(drillDeck(round.stageIndex ?? 0).map((e) => e.id));
  const key = [...states].filter(([k, s]) => {
    const p = parseKey(k);
    return s?.mastered === true && p?.prefix === 'g' && p.mode === 'see' && deck.has(p.id) && !used.has(k);
  }).map(([k]) => k).sort()[0];
  if (!key) return null;
  const gid = (parseKey(key)).id;
  const entry = graphemeOf(gid);
  if (!entry) return null;
  return { id: key, mode: 'see', isNew: false, isReview: true, focus: false, data: { part: 'see', grapheme: gid, expected: phonemeCodes(entry.p) } };
}

export async function run(el, ctx, round, hooks) {
  const raw = Array.isArray(round?.items) ? round.items : [];
  if (raw.length === 0) return;
  const order = ( item) => Math.max(0, PARTS.indexOf(item.data?.part ?? item.mode));
  const items = raw.map((item, at) => ({ item, at })).sort((a, b) => order(a.item) - order(b.item) || a.at - b.at).map(({ item }) => item);
  const planItems = items.map((item) => ({ id: item.key, mode: item.mode, isNew: item.isNew === true, isReview: item.isReview === true, focus: item.focus === true, data: item.data ?? {} }));
  const byId = new Map(planItems.map((p) => [p.id, p]));
  const ledger = withLedger(hooks, new Set(planItems.filter((p) => p.focus).map((p) => p.id)));

  const view = createActivityView(el, ctx, { name: 'soundcheck' });
  const lines = ctx.content?.coach?.[round.stage]?.soundcheck;
  const coached = { see: 0, hear: 0, blend: 0 };
  const shared = {
    ctx,
    round,
    once: createOnce(),
    coach: (kind) => {
      if (kind !== 'blend') return CARD_COACH[kind][coached[kind]++ % CARD_COACH[kind].length];
      return Array.isArray(lines) && lines.length ? coachText(lines[coached.blend++ % lines.length], round.terms ?? ctx.settings?.terms) || undefined : undefined;
    },
    grownUp: { note: null, say: '' },
    rng: createRng(Date.now()),
  };
  const stopListening = ctx.voice?.onNeedsGrownUp?.(() => {
    if (shared.grownUp.note?.isConnected || !shared.grownUp.say) return;
    const slot = view.work.querySelector('.grownup-note');
    if (slot) shared.grownUp.note = needsGrownUp(slot, shared.grownUp.say);
  });
  let completed = false;
  try {
    await view.prompt(['v.soundcheck.start']);
    await runRound(view, { items: planItems }, ledger.hooks, {
      play: ( item, { canUndo, abandon }) => {
        const own = byId.get(item.id) ?? item;
        const part = own.data?.part ?? own.mode;
        if (part === 'blend') return blendCard(view, own, shared, canUndo);
        if (part === 'see') return seeCard(view, own, shared, canUndo);
        if (part === 'hear') return picksItself(ctx, own) ? hearPick(view, own, shared, abandon) : hearCard(view, own, shared, canUndo);
        console.warn(`Sound Check cannot show ${item.id} in mode ${item.mode}; skipping it.`);
        return Promise.resolve(null);
      },
      easy: ( used) => {
        const card = easyCard(ctx, round, used);
        if (card) byId.set(card.id, card);
        return card;
      },
      undo: true,
      judged: ( item) => !picksItself(ctx, byId.get(item.id) ?? item),
    });
    completed = view.live();
    if (completed) {
      const { right, total, self } = ledger.counts();
      if (total > 0) hooks.gate?.('drill', { right, total, self });
    }
    await view.sayKept();
  } finally {
    stopListening?.();
    view.destroy();
  }
}
