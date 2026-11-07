export const GAME_SETTLED = 'game-settled';
const LATEST_MS = 15000;
export const LOCAL_HOSTS = Object.freeze(['localhost', '127.0.0.1', '[::1]']);

export async function setUpOffline(forced, { location = globalThis.location, workers = globalThis.navigator?.serviceWorker, fetchFile = (path, options) => fetch(path, options), cacheStore = globalThis.caches } = {}) {
  if (!workers) return undefined;
  if (LOCAL_HOSTS.includes(location.hostname) && !forced) {
    const left = await workers.getRegistrations();
    if (!left.length) return undefined;
    await Promise.all(left.map((registration) => registration.unregister()));
    for (const name of await cacheStore.keys()) if (name.startsWith('sq-')) await cacheStore.delete(name);
    return undefined;
  }
  const response = await fetchFile('precache.json', { cache: 'no-cache' }).catch(() => null);
  if (!response) return undefined;
  if (!response.ok) {
    console.warn(`precache.json: HTTP ${response.status}. Run npm run precache to make the game work offline.`);
    return undefined;
  }
  const { version } = await response.json();
  if (typeof version === 'string' && version) return workers.register(`sw.js?v=${encodeURIComponent(version)}`, { updateViaCache: 'none' });
  return undefined;
}

export function watchForGame({ check, target = globalThis, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) }) {
  let asked = false;
  const ask = () => {
    if (asked) return;
    asked = true;
    clearTimer(timer);
    check().catch((err) => console.warn('The offline copy of the game could not be set up.', err));
  };
  const timer = setTimer(ask, LATEST_MS);
  target.addEventListener(GAME_SETTLED, ask);
  target.addEventListener('error', ask, { once: true, capture: true });
}


export const RETURN_KEY = 'mw.after-update';
export const RETURN_MS = 60 * 1000;

export function noteReturn(storage, { scene, student, now }) {
  try {
    if (scene === 'map' && typeof student === 'string' && student !== '') storage?.setItem(RETURN_KEY, JSON.stringify({ scene, student, at: now }));
    else storage?.removeItem(RETURN_KEY);
  } catch { }
}

export function takeReturn(storage, { student, registered, now }) {
  let note;
  try {
    const raw = storage?.getItem(RETURN_KEY) ?? null;
    if (raw === null) return null;
    storage?.removeItem(RETURN_KEY);
    note = JSON.parse(raw);
  } catch {
    return null;
  }
  const age = now - Number(note?.at);
  if (note?.scene !== 'map' || !registered || note.student !== student || !(age >= 0 && age <= RETURN_MS)) return null;
  return 'map';
}

export const studentOnShow = (doc = globalThis.document) => doc?.querySelector('.scene-layer')?.getAttribute('data-student') ?? null;

export const SKIP_WAITING = 'skip-waiting';
export const SWITCH_SCENES = Object.freeze(['start', 'map', 'boot-error']);
export const RELOAD_SCENES = Object.freeze([...SWITCH_SCENES, 'elsewhere']);
export const SETTLE_MS = 2500;
const LOOK_MS = 500;
const BEAT_MS = 700;
const GIVE_UP_MS = 15000;
export const CHECK_EVERY_MS = 30 * 60 * 1000;
export const AGAIN_AFTER_MS = 5 * 60 * 1000;

export function sceneOnShow(doc = globalThis.document) {
  const scene = doc?.querySelector('.scene-layer')?.querySelector('.scene[data-scene]');
  if (scene) return { name: scene.getAttribute('data-scene') ?? '', el: scene };
  const failed = doc?.querySelector('.boot-error');
  return failed ? { name: 'boot-error', el: failed } : null;
}

export function showUpdateNote(doc = globalThis.document) {
  const note = doc.createElement('div');
  note.setAttribute('class', 'update-note');
  note.setAttribute('role', 'status');
  const words = doc.createElement('p');
  words.textContent = 'Getting the new version…';
  note.append(words);
  doc.body.append(note);
  return () => note.remove();
}

export function keepUpToDate({
  workers, check,
  sceneNow = () => sceneOnShow(),
  remember = (name) => { try { noteReturn(globalThis.sessionStorage, { scene: name, student: studentOnShow(), now: Date.now() }); } catch { } },
  reload = () => globalThis.location.reload(),
  note = () => showUpdateNote(),
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  target = globalThis.document,
  visible = () => globalThis.document?.visibilityState !== 'hidden',
}) {
  let waiting = (null);
  let switched = false;
  let seen = (null);
  let since = 0;
  let hideNote = (null);
  let told = (null);
  let toldAt = 0;
  let looking = (null);
  let reloading = false;
  let lastCheck = -Infinity;
  const watched = new WeakSet();

  const dropNote = () => { hideNote?.(); hideNote = null; };
  const stillOn = () => {
    const shown = sceneNow();
    return shown !== null && seen !== null && shown.el === seen.el;
  };

  function look() {
    looking = null;
    if (reloading) return;
    const shown = sceneNow();
    if (!shown || !seen || shown.el !== seen.el) {
      seen = shown && { name: shown.name, el: shown.el };
      since = now();
      if (!told) dropNote();
    }
    const settled = shown !== null && now() - since >= SETTLE_MS;
    if (switched) {
      if ((told && stillOn()) || (shown !== null && settled && RELOAD_SCENES.includes(shown.name))) {
        reloading = true;
        if (!hideNote) hideNote = note();
        remember(shown?.name ?? seen?.name ?? '');
        reload();
        return;
      }
    } else if (told && now() - toldAt >= GIVE_UP_MS) {
      if (waiting === told) waiting = null;
      told = null;
      dropNote();
    } else if (waiting && !told && !hideNote && shown !== null && settled && SWITCH_SCENES.includes(shown.name)) {
      hideNote = note();
      const at = seen;
      setTimer(() => {
        if (reloading || switched || told) return;
        const then = sceneNow();
        if (!then || !at || then.el !== at.el || !waiting) {
          dropNote();
          return;
        }
        told = waiting;
        toldAt = now();
        told.postMessage({ type: SKIP_WAITING });
      }, BEAT_MS);
    }
    if (switched || waiting || told) looking = setTimer(look, LOOK_MS);
  }
  const lookSoon = () => { if (looking === null && !reloading) look(); };

  const consider = (next) => {
    if (!next || !workers.controller || next === told || next === waiting) return;
    waiting = next;
    if (told) { told = null; dropNote(); }
    lookSoon();
  };
  const watch = (registration) => {
    if (registration?.waiting) consider(registration.waiting);
    if (!registration || watched.has(registration)) return;
    watched.add(registration);
    registration.addEventListener?.('updatefound', () => {
      const next = registration.installing;
      next?.addEventListener('statechange', () => { if (next.state === 'installed') consider(next); });
    });
  };

  workers.addEventListener('controllerchange', () => {
    switched = true;
    waiting = null;
    if (looking !== null) { clearTimer(looking); looking = null; }
    look();
  });

  async function lookForNew() {
    lastCheck = now();
    try {
      const registration = await check();
      watch(registration);
      await registration?.update?.();
    } catch (err) {
      console.debug('No new version could be looked for just now.', err);
    }
  }
  let repeating = false;
  const repeat = () => { setTimer(() => { lookForNew().finally(repeat); }, CHECK_EVERY_MS); };
  target?.addEventListener?.('visibilitychange', () => {
    if (visible() && now() - lastCheck >= AGAIN_AFTER_MS) lookForNew();
  });

  return {
    async check() {
      await lookForNew();
      if (!repeating) { repeating = true; repeat(); }
    },
  };
}

if (globalThis.navigator?.serviceWorker) {
  const forced = new URLSearchParams(globalThis.location.search).get('sw') === '1';
  const updates = keepUpToDate({ workers: globalThis.navigator.serviceWorker, check: () => setUpOffline(forced) });
  watchForGame({ check: () => updates.check() });
}
