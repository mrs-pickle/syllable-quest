import { h } from '../core/dom.js';
import { createLock } from '../core/lock.js';
import { artImage, artUrl, copilotBanner, copilotHold, copilotUndoAside, keysOnPage, nextButton, passButton, setUndo } from '../ui/components.js';
import { apprenticeArt, readCoat } from '../scenes/start.js';
import { HELP_TIPS, markTipSeen, offerTips, TURN_TIPS } from '../ui/tips.js';


export function createOnce() {
  const said = new Set();
  return (line) => {
    if (said.has(line)) return [];
    said.add(line);
    return [line];
  };
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const PRAISE = Object.freeze({ sound: 3, bridge: 3, sort: 3, catch: 3, word: 3, story: 3 });
const PRAISE_EVERY = 3;


export function createActivityView(el, ctx, { name, bg = 'bg/map' }) {
  const lock = createLock();
  let coat = 'black';
  const kittenArt = (pose) => artUrl(apprenticeArt(coat, pose === 'sit' ? 'stand' : pose));
  let kittenPose = 'sit';
  let prompt = [];
  let kept = [];
  let cue = null;
  let promptGap;
  let cueGap;
  let successes = 0;
  let poseTimer;

  const kittenImg = h('img', { src: kittenArt('sit'), alt: '', draggable: 'false' });
  if (typeof ctx?.store?.get === 'function') {
    readCoat(ctx).then((c) => { if (c !== coat) { coat = c; kittenImg.src = kittenArt(kittenPose); } });
  }
  const kitten = h('button', { type: 'button', class: 'activity-kitten', 'aria-label': 'Hear it again',
    onClick: () => { if (!lock.locked()) play(cue ?? prompt, cue ? cueGap : promptGap); } }, kittenImg);
  const work = h('div', { class: 'activity-work' });
  const root = h('div', { class: ['activity', `activity-${name}`] },
    artImage(bg, 'scene-bg'), work, kitten);
  el.append(root);

  const live = () => root.isConnected;
  const play = async (ids, gap) => {
    const lead = kept.length;
    const clips = [...kept, ...ids];
    kept = [];
    if (!live() || clips.length === 0) return false;
    const said = ctx.audio.playSeq(clips, gap, lead);
    return ids.length === 0 ? false : (await said) !== false;
  };

  return {
    ctx,
    root,
    work,
    lock,
    show(...nodes) { work.replaceChildren(...nodes.filter(Boolean)); },
    async prompt(ids, { play: played = ids, gap } = {}) {
      if (!live()) return false;
      prompt = (ids.filter(Boolean));
      promptGap = gap;
      cue = null;
      ctx.setReplay?.(prompt, gap);
      const clips = (played.filter(Boolean));
      return clips.length > 0 ? play(clips, gap) : false;
    },
    current: () => [...prompt],
    async say(ids, minMs = 0, gap) {
      if (ids.length > 0) { cue = ids; cueGap = gap; }
      await Promise.all([play(ids, gap), wait(minMs)]);
    },
    play,
    sayNext(ids) { kept = [...kept, ...ids]; },
    async sayKept() {
      const clips = kept;
      kept = [];
      if (live() && clips.length > 0) await ctx.audio.playSeq(clips);
    },
    choosing(on) { root.toggleAttribute('data-choosing', on); },
    cheer() {
      kittenPose = 'cheer';
      kittenImg.src = kittenArt('cheer');
      clearTimeout(poseTimer);
      poseTimer = setTimeout(() => { kittenPose = 'sit'; kittenImg.src = kittenArt('sit'); }, 1400);
    },
    think(on) {
      clearTimeout(poseTimer);
      kittenPose = on ? 'think' : 'sit';
      kittenImg.src = kittenArt(kittenPose);
    },
    praise(group, lines) {
      successes++;
      if (successes % PRAISE_EVERY !== 0) return [];
      const pool = lines ?? Array.from({ length: PRAISE[group] }, (_, i) => i + 1);
      if (pool.length === 0) return [];
      const line = pool[(successes / PRAISE_EVERY - 1) % pool.length];
      return [typeof line === 'string' ? `v.praise.${line}` : `v.praise.${group}.${line}`];
    },
    live,
    destroy() {
      clearTimeout(poseTimer);
      if (!live()) return;
      ctx.audio.stop();
      ctx.setReplay?.(null);
      root.remove();
    },
  };
}

export const secondClick = (event) => (event?.detail ?? 0) >= 2;

const SPARKLE_IN = 56;
const SPARKLE_OUT = 40;

export function bounce(el) {
  el.classList.remove('bounce');
  void el.offsetWidth;
  el.classList.add('bounce');
}

export function sparkle(el, over) {
  const star = h('img', { class: 'sparkle-pop', src: artUrl('ui/sparkle'), alt: '', draggable: 'false' });
  if (over) {
    const at = el.getBoundingClientRect?.();
    const box = over.getBoundingClientRect?.();
    if (at && box) {
      const scale = box.width / (over.offsetWidth || box.width) || 1;
      Object.assign(star.style, { left: `${(at.right - box.left) / scale - SPARKLE_IN}px`, top: `${(at.top - box.top) / scale - SPARKLE_OUT}px`, right: 'auto' });
    }
  }
  (over ?? el).append(star);
  setTimeout(() => star.remove(), 900);
}

export function typeToPick(labels, onPick, control, paused = () => false, onBack = null) {
  if (!control.isConnected) return () => {};
  let typed = '';
  let stopped = false;
  let timer;
  const flush = () => { const exact = labels.includes(typed) ? typed : null; typed = ''; if (exact && control.isConnected && !paused()) onPick(exact); };
  const onKey = (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = (event.target);
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.key === 'Backspace' && onBack) {
      event.preventDefault();
      clearTimeout(timer);
      const waiting = typed !== '';
      typed = '';
      if (!waiting && !paused()) onBack();
      return;
    }
    const key = event.key.toLowerCase();
    if (!/^[a-z]$/.test(key)) return;
    clearTimeout(timer);
    if (paused()) { typed = ''; return; }
    if (typed !== '' && !labels.some(l => l.startsWith(typed + key))) {
      flush();
      if (stopped || paused()) return;
    }
    const next = typed + key;
    typed = labels.some(l => l.startsWith(next)) ? next : '';
    if (typed === '') return;
    event.preventDefault();
    if (labels.includes(typed) && !labels.some(l => l !== typed && l.startsWith(typed))) flush();
    else timer = setTimeout(flush, 800);
  };
  const stopKeys = keysOnPage(control, onKey);
  return () => { stopped = true; clearTimeout(timer); stopKeys(); };
}

const NEXT_LINE = 'next.how';

export function showNext(view, say = []) {
  if (!view.live()) return { pressed: new Promise(() => {}), said: Promise.resolve(), hide() {} };
  const { ctx } = view;
  const first = ctx.settings?.tipsSeen?.[NEXT_LINE] !== true;
  if (first) ctx.settings = { ...ctx.settings, tipsSeen: markTipSeen(ctx.settings?.tipsSeen, NEXT_LINE) };
  let done = () => {};
  const pressed = new Promise((resolve) => { done = resolve; });
  const button = nextButton({ onNext: () => {
    button.remove();
    ctx.audio.stop();
    view.choosing(false);
    done();
  } });
  view.root.append(button);
  button.focus();
  view.choosing(true);
  const said = view.say([...say, ...(first ? ['v.session.next'] : [])]);
  return { pressed, said, hide: () => button.remove() };
}

export function offerPass(view, onPass) {
  const button = passButton({ onPass: (event) => {
    if (secondClick(event)) return;
    view.lock.run(async () => {
      button.remove();
      onPass();
    });
  } });
  view.root.append(button);
  return () => button.remove();
}

export const notYet = (el) => el.classList.contains('not-yet');

function wiggle(el) {
  el.classList.remove('wiggle');
  void el.offsetWidth;
  el.classList.add('wiggle');
}

export function untilHerTurn(choices) {
  for (const c of choices) {
    c.el.classList.add('not-yet');
    c.el.setAttribute('aria-disabled', 'true');
    c.el.addEventListener('click', () => { if (notYet(c.el)) wiggle(c.el); });
  }
  return choices;
}

export function herTurn(choices) {
  for (const c of choices) {
    c.el.classList.remove('not-yet');
    c.el.removeAttribute('aria-disabled');
  }
}

export function chooseOne(view, { choices, answer, hint, reward, praise, praiseLines, keyboard = false, target = null, hintGap, abandon = null }) {
  return new Promise((resolve) => {
    if (abandon?.aborted) return;
    let misses = 0;
    let revealed = false;
    let answeredRight = false;
    let passed = false;
    let stopKeys = () => {};
    let stopPass = () => {};
    const right = choices.find(c => c.value === answer)?.el;
    const pick = (value) => view.lock.run(async () => {
      const chosen = choices.find(c => c.value === value)?.el;
      if (answeredRight || passed || abandon?.aborted || !chosen || !right || (revealed && chosen !== right)) return;
      view.choosing(false);
      abandon?.answered();
      if (chosen === right) {
        answeredRight = true;
        stopPass();
        stopKeys();
        right.classList.add('chosen');
        sparkle(right, view.root);
        view.cheer();
        view.sayNext([...reward, ...(revealed ? ['v.praise.later'] : misses === 0 && praise ? view.praise(praise, praiseLines) : [])]);
        resolve({ correct: misses === 0, helped: revealed });
        return;
      }
      misses++;
      bounce(chosen);
      if (misses < 2) {
        target?.classList.add('glow');
        await view.say(['v.praise.listen', ...hint], 1300, hintGap);
        target?.classList.remove('glow');
      } else {
        revealed = true;
        right.classList.add('glow');
        for (const c of choices) if (c.el !== right) c.el.classList.add('dim');
        await view.say(['v.praise.tricky', 'v.praise.reveal'], 900);
      }
      view.choosing(true);
    });
    for (const c of choices) c.el.addEventListener('click', (event) => { if (!notYet(c.el) && !secondClick(event)) pick(c.value); });
    herTurn(choices);
    if (keyboard) stopKeys = typeToPick(choices.map(c => c.value), pick, view.root);
    stopPass = offerPass(view, () => {
      if (answeredRight || abandon?.aborted) return;
      passed = true;
      abandon?.answered();
      stopKeys();
      view.choosing(false);
      resolve({ pass: true });
    });
    abandon?.onAbort(() => { stopKeys(); stopPass(); });
    view.choosing(true);
  });
}

export function judgeAloud(view, { kind = 'read', model, target, praise, praiseLines, canUndo = false, tips = [], coach, chips = [], pass = true, firstHelp }) {
  return new Promise((resolve) => {
    if (!view.live()) return;
    let misses = 0;
    let helped = false;
    let said;
    const taps = [];
    let reach = canUndo;
    let panel;
    let stopPass = () => {};
    const showUndo = () => setUndo(panel, taps.length > 0 || reach);
    const result = (part) => ({ correct: false, helped, ...part, ...(said !== undefined ? { said } : {}) });
    const finish = (answer) => { stopPass(); panel.remove(); view.choosing(false); resolve(answer); };
    let helpTips = false;
    const offerHelpTips = () => {
      if (helpTips) return;
      helpTips = true;
      offerTips(view.ctx, panel, HELP_TIPS);
    };
    const accept = (fixed) => ( { event, said: chip }) => {
      if (secondClick(event)) return;
      view.lock.run(async () => {
        if (chip !== undefined) said = chip;
        sparkle(target, view.root);
        view.cheer();
        view.sayNext(misses === 0 && !helped && praise ? view.praise(praise, praiseLines) : []);
        finish(result(fixed ? { correct: true, self: true } : { correct: misses === 0 }));
      });
    };
    const notYet = ( { said: chip }) => view.lock.run(async () => {
      taps.push(said);
      if (chip !== undefined) said = chip;
      misses++;
      offerHelpTips();
      view.choosing(false);
      target.classList.add('glow');
      if (misses < 2) {
        await view.say(kind === 'read' ? ['v.praise.again'] : ['v.praise.listen', ...model], 1300);
        target.classList.remove('glow');
        showUndo();
        view.choosing(true);
        return;
      }
      panel.hidden = true;
      await view.say(['v.praise.tricky', ...model, 'v.praise.later'], 1500);
      target.classList.remove('glow');
      finish(result({ correct: false, helped: true }));
    });
    let softHelp = firstHelp;
    const help = () => view.lock.run(async () => {
      if (softHelp) {
        const show = softHelp;
        softHelp = undefined;
        offerHelpTips();
        await show();
        return;
      }
      helped = true;
      reach = false;
      showUndo();
      offerHelpTips();
      await view.say(model, 600);
    });
    const undo = () => view.lock.run(async () => {
      if (taps.length > 0) {
        said = taps.pop();
        misses--;
        showUndo();
        return;
      }
      if (!reach) return;
      stopPass();
      panel.remove();
      view.choosing(false);
      resolve({ undo: true });
    });
    panel = copilotBanner({ onRight: accept(false), onFixed: accept(true), onNotYet: notYet, onHelp: help, onUndo: undo, kind, coach, chips });
    showUndo();
    view.root.append(panel);
    if (pass) stopPass = offerPass(view, () => finish({ correct: false, helped: false, passed: true }));
    offerTips(view.ctx, panel, [...TURN_TIPS[kind], ...tips]);
    view.choosing(true);
  });
}

export const SETTLE_MS = 300;

export function holdForUndo(view) {
  return new Promise((resolve) => {
    if (!view.live()) return;
    view.play([]);
    const end = (undo) => view.lock.run(async () => {
      banner.remove();
      resolve(undo);
      if (!undo) return;
      view.root.classList.add('settling');
      await wait(SETTLE_MS);
      view.root.classList.remove('settling');
    });
    const banner = copilotHold({ onGo: () => end(false), onUndo: () => end(true) });
    view.root.append(banner);
  });
}


export function undoAside(view) {
  const stops = [];
  let gone = false;
  let done = () => {};
  const undone = (new Promise((resolve) => { done = resolve; }));
  const remove = () => { gone = true; aside.remove(); };
  const abandon = {
    aborted: false,
    onAbort(fn) { if (abandon.aborted) fn(); else stops.push(fn); },
    answered: remove,
  };
  const aside = copilotUndoAside({ onUndo: () => view.lock.run(async () => {
    if (gone || abandon.aborted) return;
    abandon.aborted = true;
    remove();
    for (const fn of stops.splice(0)) fn();
    if (view.live()) view.ctx.audio?.stop?.();
    view.choosing(false);
    done({ undo: true });
  }) });
  view.root.append(aside);
  return { abandon, undone, remove };
}

const isPass = (outcome) => outcome?.pass === true || outcome?.passed === true;

const MAX_EASED = 2;


export async function runRound(view, round, hooks, { play, easy, undo = false, judged = () => true }) {
  let queue = [...(round?.items ?? [])];
  let used = new Set(queue.map(i => i.id));
  let broughtBack = new Set();
  let right = [];
  let eased = 0;
  let breaking = false;
  let back = null;
  const goBack = () => {
    const to = (back);
    for (let n = 0; n < to.records; n++) hooks.undo?.();
    ({ queue, used, broughtBack, right, eased, breaking } = to);
    back = null;
    return to.i;
  };
  const plain = ({ correct, helped, self, said }) => ({ correct, helped, ...(self ? { self } : {}), ...(said !== undefined ? { said } : {}) });
  const answer = async (item, canUndo, aside) => {
    let result;
    if (aside) {
      const playing = play(item, { canUndo, abandon: aside.abandon });
      playing.catch(() => {});
      result = await Promise.race([playing, aside.undone]);
      aside.remove();
    } else {
      result = await play(item, { canUndo });
    }
    if (result && !('undo' in result) && !isPass(result)) {
      if (!result.kept) hooks.record(item.id, item.mode, plain(result), ...(result.selfChecked ? [{ scored: false }] : []));
      for (const { mode, answer: other } of result.also ?? []) hooks.record(item.id, mode, plain(other), { monitor: false, ...(other.selfChecked ? { scored: false } : {}) });
      for (const mode of Array.isArray(result.passed) ? result.passed : []) hooks.pass?.(item.id, mode);
      if (result.correct && !result.helped) right.push(item);
      await result.after;
    }
    return result;
  };
  const recorded = (result) => 1 + (result.also ?? []).filter(a => !a.answer.selfChecked).length;
  const easyItem = (missed) => {
    const known = easy(used);
    if (known) return known;
    const earlier = right.findLast(it => it.id !== missed.id);
    return earlier ? { id: earlier.id, mode: earlier.mode, isNew: false, isReview: false } : null;
  };
  for (let i = 0; ; i++) {
    if (!view.live()) return breaking ? 'break' : 'done';
    if (queue.length > 0) hooks.progress?.(Math.min(1, i / queue.length));
    if (i >= queue.length) {
      if (back && await holdForUndo(view)) {
        i = goBack() - 1;
        continue;
      }
      break;
    }
    const item = queue[i];
    const before = undo && typeof hooks.undo === 'function'
      ? { i, queue: [...queue], used: new Set(used), broughtBack: new Set(broughtBack), right: [...right], eased, breaking } : null;
    const aside = back && !judged(item) ? undoAside(view) : null;
    const result = await answer(item, back !== null && !aside, aside);
    if (result && 'undo' in result) {
      i = back ? goBack() - 1 : i - 1;
      continue;
    }
    if (isPass(result)) {
      hooks.pass?.(item.id, item.mode);
      back = null;
      queue = queue.filter((q, at) => at <= i || q.id !== item.id || q.mode !== item.mode);
      continue;
    }
    back = before && judged(item) && result && result.selfChecked !== true ? { ...before, records: recorded( (result)) } : null;
    if (breaking || !result || result.correct) continue;
    const key = `${item.id}#${item.mode}`;
    if (result.helped && !broughtBack.has(key)) {
      broughtBack.add(key);
      queue.splice(Math.min(queue.length, i + 3), 0, item);
    }
    const signal = hooks.monitor?.signal?.() ?? 'ok';
    if (signal === 'break') {
      const next = easyItem(item);
      queue = [...queue.slice(0, i + 1), ...(next ? [next] : [])];
      breaking = true;
      continue;
    }
    if (signal === 'ease' && eased < MAX_EASED) {
      const next = easyItem(item);
      if (next) { eased++; used.add(next.id); queue.splice(i + 1, 0, next); }
    }
  }
  return breaking ? 'break' : 'done';
}
