import { h } from './dom.js';

const SCENE_NAME = /^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*$/;

export function scenePath(name) {
  if (typeof name !== 'string' || !SCENE_NAME.test(name)) throw new RangeError(`Not a scene name: "${name}"`);
  return `../scenes/${name}.js`;
}



export function createRouter(stageEl, ctx, { load = (name) => import(scenePath(name)), onNavigate } = {}) {
  let currentName = '';
  let unmount = null;
  let queue = Promise.resolve();
  let showing = null;
  let turn = 0;

  const wanted = (asked) => asked.turn === turn && (asked.from === null || asked.from === showing);

  async function navigate(name, params, asked) {
    if (!wanted(asked)) return;
    scenePath(name);
    const scene = await load(name);
    if (!wanted(asked)) return;
    if (!scene || typeof scene.mount !== 'function') throw new TypeError(`Scene "${name}" does not export mount()`);
    onNavigate?.(name, params);
    const leaving = unmount;
    unmount = null;
    try {
      leaving?.();
    } catch (err) {
      console.error(`Scene "${currentName}" failed to unmount`, err);
    }
    const el = h('div', { class: 'scene', 'data-scene': name });
    stageEl.replaceChildren(el);
    currentName = name;
    showing = {};
    const result = scene.mount(el, sceneCtx(showing), params);
    unmount = typeof result === 'function' ? result : null;
  }

  function ask(name, params, from) {
    const asked = { turn, from };
    const run = queue.then(() => navigate(name, params, asked));
    queue = run.catch(() => {});
    return run;
  }

  const current = () => currentName;

  function sceneCtx(visit) {
    const shown = { turn, from: visit };
    const router = { go: (name, params = {}) => ask(name, params, visit), current, gone: () => !wanted(shown) };
    return new Proxy(ctx, { get: (target, key) => (key === 'router' ? router : Reflect.get(target, key)) });
  }

  return {
    go: (name, params = {}) => ask(name, params, null),
    goNow(name, params = {}) {
      const run = navigate(name, params, { turn: ++turn, from: null });
      queue = run.catch(() => {});
      return run;
    },
    current,
  };
}


const BOOT_FLAGS = new Set(['debug', 'store', 'day', 'sw']);
export const LOCAL_HOSTS = Object.freeze(new Set(['localhost', '127.0.0.1', '[::1]']));

export function parseLaunch(search, hostname = 'localhost') {
  const query = new URLSearchParams(search);
  const params = {};
  for (const [key, value] of query) if (!BOOT_FLAGS.has(key)) params[key] = value;
  const day = (query.get('day') ?? '').trim();
  return {
    scene: query.get('debug') || null,
    params,
    store: query.get('store') === 'memory' || (!LOCAL_HOSTS.has(hostname) && (query.has('debug') || query.has('day'))) ? 'memory' : 'indexeddb',
    dayOffset: /^[+-]?\d{1,5}$/.test(day) ? Number(day) : 0,
  };
}
