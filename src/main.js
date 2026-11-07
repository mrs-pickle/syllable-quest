import { openStore } from './core/storage.js';
import { createOneWindow, flagFailedSaves } from './core/one-window.js';
import { loadContent } from './content/load.js';
import { readSaved } from './profile/saved.js';
import { createStudentStore } from './profile/students.js';
import { migrateToStudents } from './profile/migrate.js';
import { switchStudent } from './profile/switch-student.js';
import { todayFrom } from './core/dates.js';
import { createRng } from './core/rng.js';
import { createAudio, unlockOnGestures } from './core/audio.js';
import { createVoice } from './core/voice.js';
import { buildScript } from './content/voice-script.js';
import * as graphemes from './curriculum/graphemes.js';
import { createRouter, parseLaunch } from './core/router.js';
import { mountStage, applyComfort } from './core/stage.js';
import { h } from './core/dom.js';
import { speakerButton, fullscreenButton } from './ui/components.js';
import { createHome, homeParams } from './ui/home.js';
import { createMute } from './ui/mute.js';
import { takeReturn } from './offline.js';
import { loadScene } from './scenes/index.js';
import { createSay } from './core/say.js';

const AUDIO_BASE = 'assets/audio/';
const AUDIO_MANIFEST = 'assets/audio/manifest.json';
const WINDOWS_CHANNEL = 'syllable-quest';
const ELSEWHERE = 'elsewhere';
const FIRST_SCENE = 'start';
const HOME_SCENE = 'map';


async function readJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

async function loadManifest() {
  try {
    const manifest = await readJson(AUDIO_MANIFEST);
    if (isPlainObject(manifest)) return manifest;
    console.error(`${AUDIO_MANIFEST} is not a list of clips; playing without sound.`);
  } catch (err) {
    if (err instanceof SyntaxError) console.error(`${AUDIO_MANIFEST} is not valid JSON; playing without sound.`, err);
  }
  return {};
}

const stateEntries = (ctx) => [
  ['settings', ctx.settings],
  ['profile', ctx.profile],
  ['states', Object.fromEntries(ctx.states)],
  ['today', ctx.today ?? undefined],
];

async function boot() {
  const launch = parseLaunch(location.search, location.hostname);
  const root = document.getElementById('stage');
  if (!root) throw new Error('index.html has no #stage element');
  const stage = mountStage(root);
  const sceneLayer = h('div', { class: 'scene-layer' });

  const store = createStudentStore(await openStore({ backend: launch.store }), { day: () => todayFrom(launch.dayOffset) });
  let ctx;
  let catchUp = null;
  const catchUpNow = () => {
    if (!catchUp) return false;
    try { catchUp(); } catch (err) { console.error('Progress could not be gathered', err); }
    return true;
  };
  let away = false;
  const standAside = () => {
    if (away || !ctx) return;
    away = true;
    ctx.voice.stop();
    ctx.router.go(ELSEWHERE).catch((err) => console.error('The game could not stop here', err));
  };
  const windows = createOneWindow({
    store,
    channel: store.persistent && typeof BroadcastChannel === 'function' ? new BroadcastChannel(WINDOWS_CHANNEL) : null,
    entries: () => (ctx ? stateEntries(ctx) : []),
    beforeStandDown: async () => { catchUpNow(); },
    onStop: () => standAside(),
  });
  const starting = windows.start();

  const content = await loadContent(readJson);
  if (content.missing.length) console.warn('Content files not found:', content.missing.join(', '));

  const audio = createAudio({
    manifest: await loadManifest(),
    base: AUDIO_BASE,
    store,
    onMissing: (id) => console.debug(`No audio for ${id}`),
    muted: () => ctx?.settings?.muted === true,
  });

  const voice = createVoice({ audio, script: buildScript(content, { graphemes }), settings: () => ctx?.settings });
  const quiet = { stop: () => voice.stop() };

  const playing = await starting;
  if (playing) await migrateToStudents(store.base, { day: () => todayFrom(launch.dayOffset) });
  await store.reload();
  await audio.reloadOverrides();
  const { settings, profile, states, today, coat } = await readSaved(store);

  let replay = null;
  let replayGap;
  const speaker = speakerButton({ onReplay: () => { if (replay) mute.replay(() => { if (replay) replayNow(replay, replayGap); }); } });
  const replayNow = (ids, gap) => {
    if (ids.some((id) => audio.has(id))) { audio.playSeq(ids, gap); return; }
    voice.stop();
    void (async () => { for (const id of ids) await voice.say(id); })();
  };
  const setReplay = (ids, gap) => {
    replay = ids && ids.length ? [...ids] : null;
    replayGap = gap;
    speaker.hidden = replay === null;
  };
  setReplay(null);
  applyComfort(stage.el, settings);
  const home = createHome({ audio: quiet, open: async () => { if (!away) await game.router.goNow(HOME_SCENE, homeParams(game.router.current())); } });
  const mute = createMute({ audio: quiet, game: () => ctx });
  stage.el.append(sceneLayer, h('div', { class: 'chrome' }, speaker, mute.button, home.button, fullscreenButton()));

  const game = ({
    store,
    content,
    settings,
    profile,
    states,
    today,
    coat,
    audio,
    voice,
    router: (null),
    get day() { return todayFrom(launch.dayOffset); },
    rng: createRng(Date.now()),
    saveFailed: false,
    async save(extra) {
      applyComfort(stage.el, game.settings);
      return windows.save(extra);
    },
    onLeave(gather) {
      catchUp = gather;
      return () => { if (catchUp === gather) catchUp = null; };
    },
    onHome: home.ask,
    async playHere() {
      await windows.takeOver();
      await migrateToStudents(store.base, { day: () => todayFrom(launch.dayOffset) });
      await store.reload();
      Object.assign(game, await readSaved(store));
      await audio.reloadOverrides();
      applyComfort(stage.el, game.settings);
      away = false;
      await game.router.go(launch.scene && launch.scene !== ELSEWHERE ? launch.scene : FIRST_SCENE, launch.params);
    },
    async useStudent(id) {
      await switchTo(() => store.use(id));
      await game.save();
    },
    async newStudent() {
      await switchTo(() => { store.startNew(); });
    },
    say: createSay(voice, setReplay),
    setReplay,
  });
  ctx = game;
  const switchTo = async (change) => {
    await switchStudent(game, change);
    applyComfort(stage.el, game.settings);
  };
  game.save = flagFailedSaves(game, game.save);
  const saveHidden = flagFailedSaves(game, () => windows.hide());
  const markStudent = () => {
    if (store.registered()) sceneLayer.setAttribute('data-student', store.student);
    else sceneLayer.removeAttribute('data-student');
  };
  game.router = createRouter(sceneLayer, game, {
    load: loadScene,
    onNavigate: (name) => { voice.stop(); setReplay(null); home.arrived(name); mute.arrived(name); markStudent(); },
  });

  unlockOnGestures(window, audio);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') windows.check().catch((err) => console.error('The saved progress could not be read', err));
    else if (catchUpNow()) saveHidden().catch((err) => console.error('Progress could not be saved', err));
  });
  window.addEventListener('pagehide', () => {
    if (document.visibilityState === 'visible' && catchUpNow()) windows.flush().catch((err) => console.error('Progress could not be saved', err));
  });
  document.fonts?.load('400 28px Andika').catch(() => {});
  document.fonts?.load('700 28px Andika').catch(() => {});
  if (launch.scene) Object.assign(window, { syllableQuest: game });

  const afterUpdate = () => {
    try { return takeReturn(globalThis.sessionStorage, { student: store.student, registered: store.registered(), now: Date.now() }); } catch { return null; }
  };

  if (playing && windows.playing()) {
    if (!away) await game.router.go(launch.scene ?? afterUpdate() ?? FIRST_SCENE, launch.params);
  } else {
    away = true;
    await game.router.go(ELSEWHERE);
  }
}

boot().catch((err) => {
  console.error("Meadowlark's World: Syllable Quest could not start.", err);
  document.body.append(h('p', { class: 'boot-error' }, 'The game could not start. Close this window and open the game again.'));
}).finally(() => { window.dispatchEvent(new Event('game-settled')); });
