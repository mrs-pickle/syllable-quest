import { applyResult, newItemState } from '../engine/itemstate.js';
import { h } from '../core/dom.js';
import { parseKey } from '../engine/keys.js';
import { closedPass, howOf, reopenedPass, withPass } from '../engine/passes.js';
import { GATE_KINDS, STAGE_IDS, crestsToAward, gatePassed, isStageMastered, mergeGate, nextStage, withGate } from '../engine/mastery.js';
import { bridgeAllowance, withDivisionTime } from '../engine/dose.js';
import { withError } from '../engine/tricky-pairs.js';
import { createMonitor } from '../engine/frustration.js';
import { withCrest, withLandmark, withPage, withPassageResult, withPointer, withSession, withSweep } from '../profile/profile.js';
import { DEFAULT_COAT } from '../profile/coat.js';
import { STAGES } from '../curriculum/stages.js';
import { stageSlug } from '../core/voice-ids.js';
import { landName } from '../ui/terms.js';
import { HOLD_MS, artImage, artUrl, bigButton, copilotBanner, grownupNote, holdToActivate, lessonBar, setLessonBar } from '../ui/components.js';
import { nextBreak, runBreak, runRest } from './break.js';
import { crestArt, landRecord } from './map.js';
import { apprenticeArt, readCoat } from './start.js';


export const ACTIVITY_LOADERS = Object.freeze({
  soundcheck: () => import('../activities/soundcheck.js'),
  discovery: () => import('../activities/discovery.js'),
  bridge: () => import('../activities/bridge.js'),
  clansort: () => import('../activities/clansort.js'),
  trickster: () => import('../activities/trickster.js'),
  wordbook: () => import('../activities/wordbook.js'),
  storypage: () => import('../activities/storypage.js'),
});

export const ACTIVITY_IDS = Object.freeze(Object.keys(ACTIVITY_LOADERS));

export function loadActivity(id) {
  if (!Object.hasOwn(ACTIVITY_LOADERS, id)) return Promise.reject(new RangeError(`No activity "${id}"`));
  return (ACTIVITY_LOADERS)[id]();
}

const STEP_NAMES = Object.freeze([...ACTIVITY_IDS, 'break']);

const ACTIVE_MS = 60000;
export const SLOW_MISSES = 4;
export const SLOW_WINDOW_MS = 2500;
export const SLOW_NOTE_MS = 3000;
export const SLOW_AGAIN_MS = 8000;
export const OVER_PLAN_MS = 3 * 60 * 1000;
export const SAVE_EVERY_MS = 2000;
export const DISCOVERY_SEEN_CAP = 100;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const wholeCount = (n) => (Number.isInteger(n) && (n) >= 0 ? (n) : 0);
const strings = (list) => (Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
const STRIP_BOTTOM = '100px';

const LAND_BACKDROPS = Object.freeze(['closed', 'open', 'vce', 'team', 'r', 'le']);

const landOf = (stage) => stage.split('.')[0];


export function createThrottle(run, ms, { now = () => Date.now(), setTimer = (fn, wait) => setTimeout(fn, wait), clearTimer = (id) => clearTimeout(id) } = {}) {
  let last = -Infinity;
  let timer = null;
  const fire = () => {
    timer = null;
    last = now();
    run();
  };
  return {
    poke() {
      if (timer !== null) return;
      const wait = last + ms - now();
      if (wait <= 0) fire();
      else timer = setTimer(fire, wait);
    },
    cancel() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

export function createActiveClock(now = () => Date.now()) {
  let total = 0;
  let from = null;
  let until = 0;
  return {
    input() {
      const t = now();
      if (from !== null && t <= until) { until = t + ACTIVE_MS; return; }
      if (from !== null) total += until - from;
      from = t;
      until = t + ACTIVE_MS;
    },
    ms: () => (from === null ? total : total + Math.max(0, Math.min(now(), until) - from)),
  };
}


export function normalizePlan(raw, settings = {}) {
  if (!isPlainObject(raw) || !Array.isArray(raw.steps)) return null;
  const steps = [];
  for (const s of raw.steps) {
    if (!isPlainObject(s) || !STEP_NAMES.includes(s.activity)) return null;
    const items = Array.isArray(s.items) ? s.items.filter(isPlainObject) : [];
    if (s.activity !== 'break' && items.length === 0) continue;
    const { gate, ...rest } = s;
    steps.push({
      ...rest,
      items,
      budgetMs: Number.isFinite(s.budgetMs) && s.budgetMs > 0 ? s.budgetMs : 0,
      droppable: s.droppable === true,
      ...(typeof gate === 'string' && GATE_KINDS.includes( (gate)) ? { gate } : {}),
    });
  }
  const stageIndex = Number.isInteger(raw.stageIndex) ? raw.stageIndex : (Number.isInteger(settings.stage) ? (settings.stage) : 0);
  const stage = typeof raw.stage === 'string' && raw.stage !== '' ? raw.stage : (STAGE_IDS[stageIndex] ?? STAGE_IDS[0]);
  return {
    ...raw,
    day: Number.isFinite(raw.day) ? raw.day : 0,
    stage,
    stageIndex,
    minutes: Number.isFinite(raw.minutes) && raw.minutes > 0 ? raw.minutes : 20,
    steps,
  };
}

export function lessonPercent(steps, at, fraction = 0) {
  if (steps.length === 0 || at >= steps.length) return 100;
  const inside = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  return Math.min(99, Math.floor((100 * (at + inside)) / steps.length));
}



export function startToday(plan, day, settings) {
  return {
    day, stage: settings.stage, plan, done: 0, answered: 0, right: 0, ms: 0, applied: [], passed: [], gates: {}, gatesWritten: {},
    passageDone: false, recorded: false, copilot: null, peak: 0,
  };
}

export function resumeToday(stored, day, settings) {
  if (!isPlainObject(stored) || stored.day !== day) return null;
  if (stored.stage !== settings.stage) return null;
  const plan = normalizePlan(stored.plan, settings);
  if (!plan || plan.steps.length !== (Array.isArray(stored.plan?.steps) ? stored.plan.steps.length : -1)) return null;
  const done = stored.done;
  if (!Number.isInteger(done) || done < 0 || done > plan.steps.length) return null;
  const answered = wholeCount(stored.answered);
  const gates = {};
  if (isPlainObject(stored.gates)) for (const kind of GATE_KINDS) if (isPlainObject(stored.gates[kind])) gates[kind] = { ...stored.gates[kind] };
  const gatesWritten = {};
  if (isPlainObject(stored.gatesWritten)) for (const kind of GATE_KINDS) if (stored.gatesWritten[kind] === true) gatesWritten[kind] = true;
  return {
    day, stage: settings.stage, plan, done,
    answered, right: Math.min(wholeCount(stored.right), answered),
    ms: Number.isFinite(stored.ms) && stored.ms > 0 ? stored.ms : 0,
    applied: strings(stored.applied),
    passed: strings(stored.passed),
    gates, gatesWritten,
    passageDone: stored.passageDone === true,
    recorded: stored.recorded === true,
    copilot: typeof stored.copilot === 'boolean' ? stored.copilot : null,
    peak: Number.isInteger(stored.peak) && stored.peak >= 0 && stored.peak <= 100 ? stored.peak : 0,
  };
}


const ERROR_KINDS = Object.freeze(['see', 'hear', 'blend', 'read', 'divide', 'label', 'sort', 'write', 'story']);

export function itemKey(key, mode) {
  if (typeof key !== 'string' || key === '') return null;
  if (parseKey(key)) return key;
  if (typeof mode !== 'string' || mode === '') return null;
  const full = `${key}#${mode}`;
  return parseKey(full) ? full : null;
}

const count = (v) => (Number.isInteger(v) && (v) >= 0 ? (v) : undefined);


export function createRunner({ ctx, plan, today, deps = {}, handlers = {} }) {
  const now = deps.now ?? (() => Date.now());
  const clock = deps.clock ?? createActiveClock(now);
  const monitor = deps.monitor ?? createMonitor();
  const day = today.day;
  const states = (ctx.states);

  const t = { ...today, plan };
  const applied = new Set(today.applied);
  const passedKeys = new Set(today.passed);
  let answered = today.answered;
  let right = today.right;
  const committed = { ...today.gates };
  const written = { ...today.gatesWritten };
  let stepGates = {};
  let storyExtras = {};
  let current = null;
  let stepFraction = 0;
  let closed = false;
  let lastEventAt = now();

  const history = [];
  let fedCount = 0;
  let breakAsked = false;
  let askedAfter = 0;

  let misses = [];
  let noteAfter = 0;

  const profile = () => ctx.profile;
  const setProfile = (p) => { ctx.profile = p; };

  const totalMs = () => t.ms + clock.ms();

  function snapshot() {
    return {
      ...t, plan, answered: t.answered, right: t.right, ms: totalMs(), applied: [...applied], passed: [...passedKeys],
      gates: { ...committed }, gatesWritten: { ...written }, at: now(),
    };
  }

  let lastSave = Promise.resolve();
  function writeOut() {
    try {
      lastSave = Promise.resolve(ctx.save?.()).catch(( err) => { console.error('Progress could not be saved', err); });
    } catch (err) {
      console.error('Progress could not be saved', err);
    }
  }

  let finished = false;

  function persist() {
    if (finished) return;
    ctx.today = snapshot();
    writeOut();
  }
  const throttle = createThrottle(persist, SAVE_EVERY_MS, { now, setTimer: deps.setTimer, clearTimer: deps.clearTimer });


  function record(key, mode, result = {}, opts = {}) {
    if (closed) return;
    const k = itemKey(key, mode);
    const parsed = k ? parseKey(k) : null;
    if (!k || !parsed) return;
    clock.input();
    const outcome = result ?? {};
    if (outcome.passed === true) { pass(k); return; }
    if (opts?.scored === false) return;

    const t0 = now();
    const ms = Number.isFinite(outcome.ms) ? (outcome.ms) : Math.max(0, t0 - lastEventAt);
    lastEventAt = t0;
    const correct = outcome.correct === true;
    const helped = outcome.helped === true;
    const self = correct && !helped && outcome.self === true;

    const entry = { key: k, applied: false, changed: false, had: states.has(k), before: states.get(k), counted: opts?.monitor !== false, right: false, error: null, closed: null, fed: 0 };
    if (!applied.has(k)) {
      applied.add(k);
      entry.applied = true;
      const before = states.get(k);
      if (before?.last !== day) {
        states.set(k, applyResult(before ?? newItemState(k), { day, correct, helped, self, ms }));
        entry.changed = true;
      }
      if (!correct || helped || self) {
        const target = typeof opts?.target === 'string' && opts.target !== '' ? opts.target
          : typeof outcome.target === 'string' && outcome.target !== '' ? outcome.target : parsed.id;
        const before = profile();
        const after = withError(before, {
          day, key: k, kind: self ? 'self' : ( (ERROR_KINDS.includes(parsed.mode) ? parsed.mode : 'read')), target,
          ...(typeof outcome.said === 'string' && outcome.said !== '' ? { said: outcome.said } : {}),
        });
        if (after !== before) { setProfile(after); entry.error = after.errors.at(-1); }
      }
      const id = `${parsed.prefix}:${parsed.id}`;
      const beforeP = profile();
      const afterP = closedPass(beforeP, id, parsed.mode, day, self ? 'self' : howOf({ correct, helped }, opts));
      if (afterP !== beforeP) { setProfile(afterP); entry.closed = { id, mode: parsed.mode }; }
    }
    if (entry.counted) {
      answered++;
      if (correct && !helped) { right++; entry.right = true; }
      monitor.record({ correct: correct && !helped, ms });
      entry.fed = ++fedCount;
      if (monitor.signal() === 'break') { breakAsked = true; askedAfter = history.length + 1; }
    }
    history.push(entry);
    handlers.onChange?.();
    throttle.poke();
  }

  function pass(key) {
    if (closed) return;
    const k = itemKey(key, '');
    const parsed = k ? parseKey(k) : null;
    if (!k || !parsed) return;
    clock.input();
    setProfile(withPass(profile(), `${parsed.prefix}:${parsed.id}`, parsed.mode, day));
    passedKeys.add(k);
    handlers.onChange?.();
    throttle.poke();
  }

  function undo() {
    if (closed) return null;
    const last = history.pop();
    if (!last) return null;
    const parsed = (parseKey(last.key));
    if (last.closed) setProfile(reopenedPass(profile(), last.closed.id, last.closed.mode, day));
    if (last.error) {
      const errors = profile().errors ?? [];
      const at = errors.lastIndexOf(last.error);
      if (at >= 0) setProfile({ ...profile(), errors: errors.filter(( _, i) => i !== at) });
    }
    if (last.changed) {
      if (last.had) states.set(last.key, (last.before));
      else states.delete(last.key);
    }
    if (last.applied) applied.delete(last.key);
    if (last.counted) {
      answered--;
      if (last.right) right--;
      if (last.fed > 0 && last.fed === fedCount) { monitor.undo(); fedCount--; }
    }
    if (history.length < askedAfter) breakAsked = false;
    handlers.onChange?.();
    throttle.poke();
    return { key: last.key, mode: parsed.mode };
  }


  function feed(correct) {
    if (closed) return;
    clock.input();
    const t0 = now();
    monitor.record({ correct, ms: Math.max(0, t0 - lastEventAt) });
    lastEventAt = t0;
    fedCount++;
    if (monitor.signal() === 'break') { breakAsked = true; askedAfter = history.length + 1; }
  }

  function tap() {
    if (closed) return false;
    clock.input();
    return false;
  }

  function miss() {
    if (closed) return;
    const t0 = now();
    misses = [...misses, t0].filter((at) => t0 - at <= SLOW_WINDOW_MS).slice(-SLOW_MISSES);
    if (misses.length < SLOW_MISSES || t0 < noteAfter) return;
    misses = [];
    noteAfter = t0 + SLOW_AGAIN_MS;
    say('v.session.slow');
    handlers.onSlow?.();
  }

  function takeBreak() {
    const was = breakAsked;
    breakAsked = false;
    if (was) { monitor.reset(); history.forEach((e) => { e.fed = 0; }); fedCount = 0; }
    return was;
  }


  function gate(kind, counts) {
    if (closed || !GATE_KINDS.includes( (kind)) || !isPlainObject(counts)) return;
    const focusRight = count(counts.focusRight);
    const focusTotal = count(counts.focusTotal);
    const rec = {
      day, stage: plan.stage, kind, right: count(counts.right) ?? 0, total: count(counts.total) ?? 0, self: count(counts.self) ?? 0,
      ...(focusRight !== undefined || focusTotal !== undefined ? { focusRight: focusRight ?? 0, focusTotal: focusTotal ?? 0 } : {}),
    };
    stepGates[kind] = mergeGate(stepGates[kind], (rec));
    if (kind === 'story') {
      if (typeof counts.passage === 'string' && counts.passage !== '') storyExtras.passage = counts.passage;
      if (Array.isArray(counts.missedSentences)) storyExtras.missedSentences = counts.missedSentences.filter((n) => Number.isInteger(n) && n >= 0);
    }
  }

  function writeGates(kinds) {
    let p = profile();
    for (const kind of kinds) {
      if (written[kind]) {
        const gates = Array.isArray(p.gates) ? p.gates : [];
        let at = -1;
        for (let i = gates.length - 1; i >= 0; i--) if (gates[i]?.day === day && gates[i]?.stage === plan.stage && gates[i]?.kind === kind) { at = i; break; }
        if (at >= 0) p = { ...p, gates: gates.filter(( _, i) => i !== at) };
      }
      p = withGate(p, committed[kind]);
      written[kind] = true;
    }
    setProfile(p);
  }

  function writeDiscoverySeen() {
    const marks = strings(plan.markSeen);
    if (marks.length === 0) return;
    const p = profile();
    const seen = strings(p.discoverySeen);
    const fresh = [...new Set(marks.filter((m) => !seen.includes(m)))];
    if (fresh.length > 0) setProfile({ ...p, discoverySeen: [...seen, ...fresh].slice(-DISCOVERY_SEEN_CAP) });
  }

  function writePassage(step) {
    const story = committed.story;
    if (!story || t.passageDone) return;
    const passageId = storyExtras.passage ?? step?.items?.find(( i) => typeof i?.data?.passage === 'string')?.data?.passage;
    if (typeof passageId !== 'string') return;
    const passed = gatePassed(story);
    let p = withPassageResult(profile(), { passage: passageId, day, passed, missedSentences: storyExtras.missedSentences ?? [] });
    if (passed) {
      const passage = (ctx.content?.passages ?? []).find(( x) => x?.id === passageId);
      p = withPage(p, {
        id: passage?.page ?? passageId, land: passage?.land ?? landOf(plan.stage), day, passage: passageId,
        accuracy: story.total > 0 ? story.right / story.total : 0,
      });
    }
    setProfile(p);
    t.passageDone = true;
  }


  async function say(id) {
    try {
      await ctx.say?.(id);
    } catch (err) {
      console.error(`Could not say ${id}`, err);
    }
  }

  function addDivisionMs(ms) {
    if (closed) return;
    setProfile(withDivisionTime(profile(), ms));
  }

  function allowance() {
    if (current?.round?.allowance) return current.round.allowance;
    return bridgeAllowance(profile(), ctx.settings, states, landOf(plan.stage), ctx.content, plan.minutes);
  }

  function progress(fraction) {
    if (closed) return;
    stepFraction = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
    handlers.onChange?.();
  }

  const hooks = {
    record,
    gate,
    pass,
    undo,
    allowance,
    addDivisionMs,
    say,
    copilot: ( opts) => copilotBanner( (opts)),
    monitor: {
      right: () => feed(true),
      wrong: () => { feed(false); miss(); },
      miss,
      tap,
      signal: () => monitor.signal(),
    },
    progress,
  };


  function beginStep(step) {
    current = step;
    stepGates = {};
    storyExtras = {};
    stepFraction = 0;
    lastEventAt = now();
    if (t.copilot === null) t.copilot = ctx.settings?.copilot === true;
  }

  function endStep(step) {
    for (const [kind, rec] of Object.entries(stepGates)) committed[kind] = mergeGate(committed[kind], rec);
    const kinds = Object.keys(stepGates);
    stepGates = {};
    if (kinds.length > 0) writeGates(kinds);
    if (step?.activity === 'storypage') writePassage(step);
    if (step?.activity === 'discovery') writeDiscoverySeen();
    t.done++;
    t.answered = answered;
    t.right = right;
    stepFraction = 0;
    current = null;
    recordSession(false);
    throttle.cancel();
    persist();
    handlers.onChange?.();
  }

  function recordSession(complete) {
    const ms = totalMs();
    setProfile(withSession(profile(), {
      day, minutes: Math.round(ms / 6000) / 10, steps: t.done, ...(answered === 0 ? {} : { accuracy: right / answered }),
      copilot: t.copilot === true, complete, passes: passedKeys.size,
    }, { replace: t.recorded }));
    t.recorded = true;
  }

  function finish() {
    let p = profile();
    const next = nextStage(ctx.settings, p.gates ?? []);
    if (next.moved) {
      ctx.settings = { ...ctx.settings, stage: next.stage };
      p = withPointer(p, day, next.stage, 'mastered');
    }
    const landmarks = [];
    const lit = new Set((p.landmarks ?? []).map(( l) => l?.stage));
    for (const id of new Set((p.gates ?? []).map(( g) => g?.stage))) {
      if (typeof id !== 'string' || id === 'city.stub' || lit.has(id) || !isStageMastered(p.gates, id)) continue;
      p = withLandmark(p, { stage: id, day });
      landmarks.push(id);
    }
    const crests = [];
    for (const crest of crestsToAward(p, p.gates ?? [])) {
      p = withCrest(p, crest);
      crests.push(crest.land);
    }
    if (plan.sweep === true && isPlainObject(p.sweep)) {
      p = withSweep(p, { from: p.sweep.from, sessionsLeft: wholeCount(p.sweep.sessionsLeft) - 1 });
    }
    setProfile(p);
    t.done = Math.max(t.done, plan.steps.length);
    recordSession(true);
    throttle.cancel();
    ctx.today = null;
    finished = true;
    closed = true;
    writeOut();
    return { pointerMoved: next.moved, stage: next.stage, landmarks, crests, passes: passedKeys.size, answered, right };
  }

  return {
    hooks,
    beginStep,
    endStep,
    finish,
    takeBreak,
    persist,
    settled: () => lastSave,
    snapshot,
    gather() { if (!finished) ctx.today = snapshot(); },
    close() { closed = true; throttle.cancel(); },
    state: t,
    activeMs: totalMs,
    stepFraction: () => stepFraction,
    passCount: () => passedKeys.size,
    counts: () => ({ answered, right }),
  };
}



export function runSession(el, ctx, deps = {}) {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? (( fn, ms) => setTimeout(fn, ms));
  const day = ctx.day;
  const bar = lessonBar();
  const stepEl = h('div', { class: 'session-step', style: { position: 'absolute', inset: '0' } });
  const short = h('button', {
    type: 'button', class: 'session-short', hidden: true,
    style: { minHeight: '64px', padding: '4px 18px', fontSize: '22px', background: '#ece8f4', border: '3px solid #8a8794', borderRadius: '16px', color: '#4a4750', textAlign: 'left' },
  });
  const stripPanel = h('div', {
    class: 'session-strip-panel', hidden: true, role: 'group', 'aria-label': 'Grown-up controls',
    style: { width: '210px', padding: '8px', background: '#fdf8ee', border: '4px solid #2b2b2b', borderRadius: '20px' },
  }, short);
  const stripToggle = h('button', {
    type: 'button', class: 'session-strip-toggle', 'aria-label': 'Grown-ups: hold for three seconds', 'aria-expanded': 'false',
    style: { width: '64px', height: '64px', padding: '0', border: '4px solid #2b2b2b', borderRadius: '50%', background: '#fdf8ee', overflow: 'hidden', opacity: '0.8' },
  }, artImage('ui-sq/gear'));
  const strip = h('div', {
    class: 'session-strip grownup-strip', 'data-grownup': 'true', hidden: true,
    style: { position: 'absolute', left: '16px', bottom: STRIP_BOTTOM, zIndex: '12', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' },
  }, stripPanel, stripToggle);
  const openStrip = (open) => {
    stripPanel.hidden = !open;
    stripToggle.setAttribute('aria-expanded', String(open));
  };
  const hold = holdToActivate(stripToggle, () => openStrip(stripPanel.hidden), deps.holdMs ?? HOLD_MS);
  const root = h('div', { class: 'session' }, stepEl, bar, strip);
  el.append(root);

  let runner = null;
  let stopped = false;
  let abandon = () => {};
  let shield = null;
  let abandoned = null;
  const breaks = [];
  let rests = 0;
  let offered = false;

  const plan = () => runner?.state.plan;

  function percent() {
    if (!runner) return 0;
    const t = runner.state;
    const p = Math.max(t.peak, lessonPercent(t.plan.steps, t.done, runner.stepFraction()));
    t.peak = Math.min(100, p);
    return t.peak;
  }
  function refresh() {
    if (!runner) return;
    setLessonBar(bar, percent());
    refreshShort();
  }

  function canDrop() {
    if (!runner) return false;
    const { plan: p, done } = runner.state;
    const book = p.steps.findIndex(( s) => s.activity === 'wordbook');
    if (book >= 0 && done >= book) return false;
    return p.steps.some(( s, i) => i >= done && s.droppable === true);
  }
  function overPlan() {
    if (!runner) return false;
    const { plan: p, done } = runner.state;
    const planned = p.steps.slice(0, done + 1).reduce(( sum, s) => sum + (s.budgetMs || 0), 0);
    return planned > 0 && runner.activeMs() > planned + OVER_PLAN_MS;
  }
  function refreshShort() {
    const can = canDrop();
    short.hidden = !can;
    strip.hidden = !can;
    if (!can) { openStrip(false); return; }
    const over = overPlan();
    if (over) offered = true;
    short.setAttribute('data-offered', offered ? 'true' : 'false');
    short.textContent = offered ? 'Running over. Go to Word Book?' : 'Short on time? Go to Word Book';
    short.style.setProperty('font-weight', offered ? '700' : '400');
  }
  short.addEventListener('click', () => {
    if (!runner || !canDrop()) return;
    const { plan: p, done } = runner.state;
    const here = p.steps[done];
    p.steps = p.steps.filter(( s, i) => !(s.droppable === true && i > done));
    if (here?.droppable === true) abandon();
    openStrip(false);
    runner.persist();
    refresh();
  });

  function showSlow() {
    shield?.remove();
    shield = h('p', { class: 'session-slow', role: 'status', 'aria-live': 'polite' }, 'Look closely, apprentice.');
    root.append(shield);
    const mine = shield;
    setTimer(() => { if (shield === mine) shield = null; mine.remove(); }, SLOW_NOTE_MS);
  }

  const loader = deps.loader ?? loadActivity;

  function roundFor(step) {
    const p = plan();
    return { stage: p.stage, stageIndex: p.stageIndex, terms: ctx.settings?.terms === 'classroom' ? 'classroom' : 'story', ...(step.round ?? {}), items: step.round?.items ?? step.items };
  }

  async function playActivity(step) {
    openStrip(false);
    stepEl.replaceChildren();
    let mod;
    try {
      mod = await loader(step.activity);
    } catch (err) {
      console.error(`The ${step.activity} step could not be loaded`, err);
      return;
    }
    abandoned = new Promise((resolve) => { abandon = () => resolve(); });
    try {
      await Promise.race([
        Promise.resolve().then(() => mod.run(stepEl, ctx, roundFor(step), (runner).hooks)),
        abandoned,
      ]);
    } catch (err) {
      console.error(`The ${step.activity} step stopped`, err);
    }
    abandon = () => {};
    try { ctx.audio?.stop?.(); } catch { }
    stepEl.replaceChildren();
  }

  async function playBreak(kind) {
    stepEl.replaceChildren();
    try {
      if (kind === 'rest') {
        rests++;
        await (deps.runRest ?? runRest)(stepEl, ctx);
      } else {
        const style = (deps.nextBreak ?? nextBreak)(ctx);
        breaks.push(style);
        await (deps.runBreak ?? runBreak)(stepEl, ctx, { style });
      }
    } catch (err) {
      console.error('The break stopped', err);
    }
    stepEl.replaceChildren();
  }

  async function makePlan() {
    const build = deps.buildSession ?? (await import('../engine/session-builder.js')).buildSession;
    return normalizePlan(await build({
      content: ctx.content, states: ctx.states, settings: ctx.settings, profile: ctx.profile, day, rng: ctx.rng,
    }), ctx.settings);
  }

  function treasures(result) {
    const terms = ctx.settings?.terms;
    const out = [];
    const pages = (Array.isArray(ctx.profile?.pages) ? ctx.profile.pages : []).filter(( p) => p?.day === day);
    if (pages.length > 0) out.push({ kind: 'page', art: 'ui-sq/page-whole', caption: 'A page of the Great Word Book is whole again' });
    for (const id of result.landmarks.slice(0, 2)) {
      const stage = STAGES.find((s) => s.id === id);
      const lm = landRecord(ctx.content, landOf(id))?.landmarks?.find(( l) => l?.stage === id);
      out.push({ kind: 'landmark', art: typeof lm?.art === 'string' ? lm.art : `lm/${stageSlug(id)}-on`, caption: `${stage?.name ?? 'A landmark'} lights up` });
    }
    for (const land of result.crests.slice(0, 1)) out.push({ kind: 'crest', art: crestArt(landRecord(ctx.content, land), land), caption: `A crest for ${landName(land, terms)}` });
    return out;
  }

  async function summary(result) {
    const r = (runner);
    bar.hidden = true;
    short.hidden = true;
    strip.hidden = true;
    const pct = result.answered === 0 ? null : Math.round((100 * result.right) / result.answered);
    const coat = ctx.store?.get ? await readCoat(ctx) : DEFAULT_COAT;
    const brought = treasures(result);
    const land = landOf(String(plan()?.stage ?? ''));
    let go = () => {};
    const gone = new Promise((resolve) => { go = () => resolve(undefined); });
    stepEl.replaceChildren(h('div', { class: 'session-done celebrate' },
      LAND_BACKDROPS.includes(land) ? h('img', { class: 'scene-bg celebrate-bg', src: artUrl(`bg/${land}`), alt: '' }) : null,
      h('div', { class: 'celebrate-kitten' }, artImage(apprenticeArt(coat, 'cheer'))),
      h('div', { class: 'celebrate-main' },
        h('h1', { class: 'celebrate-title' }, h('span', { 'aria-hidden': 'true', class: 'celebrate-spark' }, artImage('ui/sparkle')), 'You did it, apprentice!', h('span', { 'aria-hidden': 'true', class: 'celebrate-spark' }, artImage('ui/sparkle'))),
        h('p', { class: 'celebrate-praise' }, result.passes > 0
          ? 'You looked closely, and you knew when to move on. That is smart reading.'
          : 'You looked closely at every word and kept going. That is how readers grow.'),
        brought.length > 0
          ? h('div', { class: 'celebrate-treasures' }, brought.map((t) => h('figure', { class: `celebrate-treasure ${t.kind}` }, artImage(t.art, 'celebrate-art'), h('figcaption', {}, t.caption))))
          : null,
        bigButton({ label: 'Continue', onClick: () => go() })),
      grownupNote([
        pct === null ? 'Grown-up: no answers were scored today.' : `Grown-up: ${result.answered} answers, ${pct}% right.`,
        result.passes > 0 ? ` ${result.passes} passed (they come back in a later lesson).` : '',
      ].join(''), { className: 'session-summary celebrate-grownup', holdMs: deps.holdMs ?? HOLD_MS })));
    void r.hooks.say('v.session.done');
    await gone;
  }

  async function start() {
    const adv = nextStage(ctx.settings, ctx.profile.gates ?? []);
    if (adv.moved) {
      ctx.settings = { ...ctx.settings, stage: adv.stage };
      ctx.profile = withPointer(ctx.profile, day, adv.stage, 'mastered');
    }
    let today = resumeToday(ctx.today, day, ctx.settings);
    let moved = [];
    if (!today) {
      const made = await makePlan();
      if (stopped) return ('stopped');
      if (!made || made.steps.length === 0) {
        stepEl.replaceChildren(h('div', { class: 'session-done', style: { position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' } },
          h('p', {}, "Today's quest could not be made."),
          bigButton({ label: 'Back', onClick: () => { void ctx.router.go('land'); } })));
        bar.hidden = true;
        return ('no-plan');
      }
      const { respread, ...plain } = made;
      today = startToday(plain, day, ctx.settings);
      moved = Array.isArray(respread) ? respread.filter((x) => isPlainObject(x) && typeof x.key === 'string') : [];
      for (const state of moved) ctx.states.set(state.key, state);
    }
    runner = createRunner({ ctx, plan: today.plan, today, deps: { now, clock: deps.clock, setTimer: deps.setTimer, clearTimer: deps.clearTimer }, handlers: { onSlow: showSlow, onChange: refresh } });
    ctx.today = runner.snapshot();
    if (moved.length > 0) runner.persist();
    refresh();
    const t = runner.state;
    if (t.done === 0 && t.answered === 0) void runner.hooks.say('v.session.begin');

    while (t.done < t.plan.steps.length) {
      if (stopped) return ('stopped');
      const step = t.plan.steps[t.done];
      runner.beginStep(step);
      refresh();
      if (step.activity === 'break') await playBreak('break');
      else await playActivity(step);
      if (stopped) return ('stopped');
      runner.endStep(step);
      refresh();
      const asked = runner.takeBreak();
      const upNext = t.plan.steps[t.done];
      if (asked && upNext && upNext.activity !== 'break') {
        await playBreak('rest');
        if (stopped) return ('stopped');
      }
    }
    return ('finished');
  }

  const off = ctx.onLeave?.(() => { runner?.gather(); });

  const done = (async () => {
    let ended;
    try {
      ended = await start();
    } catch (err) {
      console.error('The session stopped', err);
      runner?.persist();
      ended = 'stopped';
    }
    if (ended !== 'finished' || !runner) return { ended, breaks, rests };
    const result = runner.finish();
    await runner.settled();
    setLessonBar(bar, 100);
    if (deps.summary !== false && root.isConnected) await summary(result);
    off?.();
    if (!stopped && !ctx.router?.gone?.()) await ctx.router.go('land', { from: 'session' });
    return { ended, result, breaks, rests };
  })();

  return {
    done,
    root,
    runner: () => runner,
    stop() {
      if (stopped) return;
      stopped = true;
      off?.();
      hold.cancel();
      abandon();
      if (runner) { runner.gather(); runner.persist(); runner.close(); }
      root.remove();
    },
  };
}

export function mount(el, ctx, _params = {}) {
  const session = runSession(el, ctx);
  session.done.catch((err) => console.error('The session stopped', err));
  return () => session.stop();
}
