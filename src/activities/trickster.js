import { h } from '../core/dom.js';
import { redId } from '../core/voice-ids.js';
import { artImage, noMenu } from '../ui/components.js';
import { PADS, usePaperToday, writesOnScreen, writingPad } from '../ui/writing-pad.js';
import { createActivityView, createOnce, judgeAloud, offerPass, runRound, showNext } from './kit.js';

export const ID = 'trickster';

export const ARM_FRAMES = Object.freeze([
  { art: 'ui-sq/armtap-1', voice: 'v.trickster.arm.1', caption: 'Stand up. Hold one arm out.' },
  { art: 'ui-sq/armtap-2', voice: 'v.trickster.arm.2', caption: 'Tap down the arm, one tap for each letter. Say each letter.' },
  { art: 'ui-sq/armtap-3', voice: 'v.trickster.arm.3', caption: 'Slide down the arm and say the whole word.' },
  { art: 'ui-sq/armtap-4', voice: 'v.trickster.arm.4', caption: 'Say the word once more. Look at the tricky part.' },
]);

export function wordCard(red) {
  const tricky = new Set(Array.isArray(red.tricky) ? red.tricky : []);
  const boxes = (red.segs ?? []).map(( seg, i) => {
    const hard = tricky.has(i);
    return h('span', { class: ['letter-box', hard && 'tricky'], 'data-tricky': hard ? 'true' : null,
      style: hard ? { textDecoration: 'underline', textDecorationThickness: '8px', textUnderlineOffset: '10px', color: '#b4531c' } : null }, seg[0]);
  });
  return h('div', { class: 'word-card trickster-word', 'aria-label': red.w }, boxes);
}

export function traceStep(view, word, passed) {
  return writesOnScreen(view.ctx) ? padTrace(view, word, passed) : canvasTrace(view, word, passed);
}

function padTrace(view, word, passed) {
  let next = (null);
  let finish = () => {};
  const done = new Promise((resolve) => { finish = resolve; });
  const writing = writingPad(PADS.word, {
    guide: word, height: 330, label: `Write the word ${word} over the faint letters.`,
    onStroke: () => {
      if (next || !view.live()) return;
      next = showNext(view, ['v.trickster.nice']);
      next.pressed.then(() => finish('traced'));
    },
    onPaper: () => { usePaperToday(view.ctx); next?.hide(); finish('paper'); },
  });
  writing.pad.classList.add('trickster-pad');
  view.show(h('div', { class: 'trickster-trace-box' }, writing.el));
  return Promise.race([done, passed.then(() => {
    next?.hide();
    return ('pass');
  })]).then((outcome) => (outcome === 'paper' ? canvasTrace(view, word, passed) : outcome));
}

function canvasTrace(view, word, passed) {
  const canvas = (h('canvas', { class: 'trickster-trace', width: '900', height: '320', tabindex: '0',
    'aria-label': `Trace the word ${word} with your finger`, style: { touchAction: 'none' } }));
  const pen = canvas.getContext?.('2d') ?? null;
  if (pen) {
    pen.font = '220px sans-serif';
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    pen.strokeStyle = '#c9c4b8';
    pen.lineWidth = 4;
    pen.setLineDash?.([12, 12]);
    pen.strokeText?.(word, 450, 160);
    pen.setLineDash?.([]);
    pen.strokeStyle = '#2f4f6f';
    pen.lineWidth = 12;
    pen.lineCap = 'round';
    pen.lineJoin = 'round';
  }
  const at = (e) => {
    const box = canvas.getBoundingClientRect?.();
    if (!box || !box.width) return [e.offsetX ?? 0, e.offsetY ?? 0];
    return [((e.clientX - box.left) / box.width) * 900, ((e.clientY - box.top) / box.height) * 320];
  };
  let down = false;
  let next = (null);
  let finish = () => {};
  const done = new Promise((resolve) => { finish = resolve; });
  const end = () => {
    if (!down) return;
    down = false;
    pen?.closePath?.();
    if (next || !view.live()) return;
    next = showNext(view, ['v.trickster.nice']);
    next.pressed.then(() => finish('traced'));
  };
  canvas.addEventListener('contextmenu', noMenu);
  canvas.addEventListener('pointerdown', ( e) => {
    down = true;
    canvas.setPointerCapture?.(e.pointerId);
    const [x, y] = at(e);
    pen?.beginPath?.();
    pen?.moveTo?.(x, y);
    pen?.lineTo?.(x + 0.01, y);
    pen?.stroke?.();
  });
  canvas.addEventListener('pointermove', ( e) => {
    if (!down) return;
    const [x, y] = at(e);
    pen?.lineTo?.(x, y);
    pen?.stroke?.();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(type, end);
  view.show(h('div', { class: 'trickster-trace-box' }, canvas));
  return Promise.race([done, passed.then(() => {
    next?.hide();
    return ('pass');
  })]);
}

export async function run(el, ctx, round, hooks) {
  const stage = round?.stage ?? '';
  const redOf = ( w) => (ctx?.content?.red ?? []).find(( r) => r?.w === w && r.drill === true);
  const byKey = new Map();
  const items = (round?.items ?? []).filter((it) => typeof it?.data?.red === 'string' && redOf(it.data.red));
  if (items.length === 0) return;
  const view = createActivityView(el, ctx, { name: 'trickster' });
  const once = createOnce();
  for (const it of items) byKey.set(it.key, it);

  async function play(planItem, { canUndo }) {
    const item = byKey.get(planItem.id);
    if (!item) return null;
    const red = redOf(item.data.red);
    const card = wordCard(red);
    const heart = h('p', { class: 'trickster-heart', style: { fontSize: '24px', color: '#6b665c', margin: '8px 0 0' } },
      red.heart ? `Tricky part: ${red.heart}` : null);
    let stopPass = () => {};
    const passed = new Promise((resolve) => { stopPass = offerPass(view, () => resolve('pass')); });
    const wasPassed = passed.then(() => 'pass');
    const bail = () => { ctx.audio?.stop?.(); return { pass: true }; };

    view.show(card, heart);
    view.prompt([...once('v.trickster.look'), redId(red.w)]).catch(() => {});

    for (const frame of ARM_FRAMES) {
      const n = Number(frame.art.slice(-1));
      const caption = h('p', { class: 'arm-caption', style: { fontSize: '24px', margin: '8px 0 0' } }, frame.caption);
      const figure = h('div', { class: 'arm-frame', 'data-frame': String(n) }, artImage(frame.art, 'arm-art'), caption);
      view.show(card, figure, heart);
      const step = showNext(view, [frame.voice]);
      const outcome = await Promise.race([step.pressed.then(() => 'next'), wasPassed]);
      if (outcome === 'pass') { step.hide(); return bail(); }
    }

    view.show(card);
    const traced = await traceStep(view, red.w, passed);
    if (traced === 'pass') return bail();

    stopPass();
    view.show(card, heart);
    view.prompt(['v.trickster.read']).catch(() => {});
    if (ctx?.settings?.copilot === false) {
      const step = showNext(view, []);
      await step.pressed;
      return { correct: true, helped: false, selfChecked: true };
    }
    return judgeAloud(view, {
      kind: 'read', model: [redId(red.w)], target: card, praise: 'catch', canUndo,
      coach: ctx?.content?.coach?.[stage]?.trickster?.[0]?.text,
    });
  }

  try {
    await runRound(view, { items: items.map((it) => ({ id: it.key, mode: it.mode, isNew: it.isNew, isReview: it.isReview })) }, hooks, {
      play,
      easy: () => null,
      undo: true,
    });
  } finally {
    view.destroy();
  }
}
