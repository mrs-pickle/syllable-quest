import { h } from '../core/dom.js';
import { createArrivalGuard, createLock } from '../core/lock.js';
import { COATS, COAT_KEY, DEFAULT_COAT, normalizeCoat } from '../profile/coat.js';
import { MAX_STUDENTS, studentPrefix } from '../profile/students.js';
import { TERMS } from '../ui/terms.js';
import { artImage, artUrl, bigButton } from '../ui/components.js';

export { COATS, COAT_KEY, DEFAULT_COAT, normalizeCoat };

export const POSES = Object.freeze(['stand', 'walk', 'cheer', 'think', 'read', 'write', 'point']);

export const apprenticeArt = (coat, pose = 'stand') => `apprentice/${normalizeCoat(coat)}-${pose}`;

export async function readCoat(ctx) {
  try {
    return normalizeCoat(await ctx.store.get(COAT_KEY));
  } catch (err) {
    console.warn('The coat colour could not be read', err);
    return DEFAULT_COAT;
  }
}

export async function studentCoat(ctx, id) {
  try {
    return normalizeCoat(await ctx.store.base.get(`${studentPrefix(id)}${COAT_KEY}`));
  } catch (err) {
    console.warn('A coat colour could not be read', err);
    return DEFAULT_COAT;
  }
}

export async function sayLine(ctx, id) {
  if (typeof ctx?.say !== 'function') return;
  try {
    await ctx.say(id);
  } catch (err) {
    console.warn(`Could not say ${id}`, err);
  }
}

export const START_VOICE = Object.freeze({
  newStudent: 'v.hub.new',
  continue: 'v.hub.continue',
  grownups: 'v.hub.grownups',
  who: 'v.hub.who',
  coat: 'v.hub.coat',
});

export const SAY_AT_MOST_MS = 2500;

const COAT_LABELS = Object.freeze({ black: 'Black', calico: 'Calico', gray: 'Gray', orange: 'Orange' });

export const startChoices = (students) => ({ newStudent: students < MAX_STUDENTS, glow: students === 0, continue: students > 0 });

export function mount(el, ctx) {
  const lock = createLock();
  let arrival = createArrivalGuard();
  let cold = typeof ctx.audio?.unlocked === 'function' ? !ctx.audio.unlocked() : false;
  let alive = true;
  const students = typeof ctx.store?.students === 'function' ? ctx.store.students() : [];
  const choices = startChoices(students.length);

  const press = (then, line) => (event) => {
    if (lock.locked() || (!cold && !arrival.allows(event))) return;
    if (cold) {
      cold = false;
      ctx.audio.unlock?.();
    }
    lock.run(async () => { await say(line); if (alive) await then(); }).catch((err) => console.warn('The start menu could not go on', err));
  };

  const say = async (line) => {
    if (!line || typeof ctx.say !== 'function') return;
    let timer;
    const most = new Promise((resolve) => { timer = setTimeout(resolve, SAY_AT_MOST_MS); });
    try { await Promise.race([sayLine(ctx, line), most]); } finally { clearTimeout(timer); }
  };

  const settled = async () => {
    if (typeof ctx.store?.registered === 'function' && !ctx.store.registered() && students.length > 0) await ctx.useStudent(students[0].id);
  };

  const screen = h('div', { class: 'start' });
  const show = (...kids) => {
    arrival = createArrivalGuard();
    screen.replaceChildren(h('img', { class: 'scene-bg', src: artUrl('bg/map'), alt: '' }), ...kids);
  };
  const toMap = () => ctx.router.go('map');


  function menu() {
    const column = h('div', { class: 'start-menu' },
      choices.newStudent ? h('div', { class: ['start-new', choices.glow && 'glow'] }, bigButton({ label: 'New Student', onClick: press(async () => {
        if ((typeof ctx.store?.registered === 'function' && ctx.store.registered()) || students.length > 0) await ctx.newStudent();
        coatScreen();
      }, START_VOICE.newStudent) })) : null,
      choices.continue ? bigButton({ label: 'Continue', onClick: press(async () => {
        if (students.length === 1) await play(students[0].id);
        else await picker();
      }, START_VOICE.continue) }) : null,
      bigButton({ label: 'Grown-ups', onClick: press(async () => {
        await settled();
        await ctx.router.go('grownup/gate');
      }, START_VOICE.grownups) }));
    show(
      h('h1', { class: 'start-title' }, 'Syllable Quest'),
      h('div', { class: 'start-apprentice' }, artImage(apprenticeArt(DEFAULT_COAT, 'walk'))),
      column);
  }

  async function play(id) {
    await ctx.useStudent(id);
    if (ctx.settings?.termsAsked !== true) termsScreen({ firstRun: false });
    else await toMap();
  }

  async function picker() {
    const coats = await Promise.all(students.map((s) => studentCoat(ctx, s.id)));
    if (!alive) return;
    show(
      h('h1', { class: 'start-title' }, 'Syllable Quest'),
      h('div', { class: 'start-picker', role: 'group', 'aria-label': 'Who is playing?' },
        students.map((s, i) => h('button', { type: 'button', class: 'start-student', 'data-student': s.id,
          onClick: ( event) => {
            if (lock.locked() || !arrival.allows(event)) return;
            lock.run(() => play(s.id)).catch((err) => console.warn('The student could not be opened', err));
          } },
        h('span', { class: 'start-student-art' }, artImage(apprenticeArt(coats[i]))),
        h('span', { class: 'start-student-name' }, s.label ?? `Student ${i + 1}`))),
        h('button', { type: 'button', class: 'start-back', onClick: () => { if (!lock.locked()) menu(); } }, 'Back')));
    void say(START_VOICE.who);
  }


  const draft = { coat: DEFAULT_COAT };

  function coatScreen() {
    const grid = h('div', { class: 'coat-grid', role: 'group', 'aria-label': 'Pick the coat' });
    const refresh = () => {
      for (const b of grid.querySelectorAll('button')) b.setAttribute('aria-pressed', b.getAttribute('data-coat') === draft.coat ? 'true' : 'false');
    };
    for (const coat of COATS) {
      grid.append(h('button', { type: 'button', class: 'coat-choice', 'data-coat': coat, 'aria-pressed': coat === draft.coat ? 'true' : 'false',
        onClick: () => { draft.coat = coat; refresh(); } },
      h('span', { class: 'coat-art' }, artImage(apprenticeArt(coat))),
      h('span', { class: 'coat-name' }, COAT_LABELS[ (coat)])));
    }
    show(
      h('h1', { class: 'start-heading' }, 'Pick your apprentice'),
      grid,
      h('div', { class: 'start-actions' }, bigButton({ label: 'Next', onClick: (event) => {
        if (lock.locked() || !arrival.allows(event)) return;
        termsScreen({ firstRun: true });
      } })));
    void say(START_VOICE.coat);
  }

  function termsScreen({ firstRun }) {
    const choose = (terms) => (event) => {
      if (lock.locked() || !arrival.allows(event)) return;
      lock.run(async () => {
        ctx.settings = { ...ctx.settings, terms, termsAsked: true };
        if (firstRun) await saveNew();
        else await ctx.save();
        if (!alive) return;
        if (firstRun) placementScreen();
        else await toMap();
      }).catch((err) => console.error('The names could not be saved', err));
    };
    const option = (set, title) => h('button', { type: 'button', class: 'terms-choice', 'data-terms': set, onClick: choose(set) },
      h('span', { class: 'terms-title' }, title),
      h('span', { class: 'terms-names' }, Object.values(TERMS[set]).join(', ')));
    show(
      h('div', { class: 'start-panel grown-note' },
        h('h1', {}, 'Grown-up: how should we name the six kinds of syllable?'),
        h('p', {}, 'The game and its screens will use these names. You can change this later in Settings.'),
        h('div', { class: 'terms-options' }, option('story', 'Story names'), option('classroom', 'Classroom names'))));
  }

  async function saveNew() {
    if (typeof ctx.store?.registered === 'function' && !ctx.store.registered()) ctx.profile = { ...ctx.profile, createdDay: ctx.day };
    await ctx.save([[COAT_KEY, draft.coat]]);
  }

  function placementScreen() {
    show(
      h('div', { class: 'start-panel grown-note' },
        h('h1', {}, 'Grown-up: where should your reader start?'),
        h('p', {}, 'The placement check takes about 8 minutes. You score it on the screen, and your reader is not told how each answer went. Or start at the beginning of Closed Canyon.'),
        h('div', { class: 'start-actions' },
          bigButton({ label: 'Check where to start', onClick: (event) => {
            if (lock.locked() || !arrival.allows(event)) return;
            lock.run(() => ctx.router.go('placement', { from: 'start' })).catch((err) => console.warn('The placement check could not open', err));
          } }),
          bigButton({ label: 'Start at the beginning', onClick: (event) => {
            if (lock.locked() || !arrival.allows(event)) return;
            lock.run(toMap).catch((err) => console.warn('The map could not open', err));
          } }))));
  }

  menu();
  el.append(screen);
  return () => { alive = false; };
}
