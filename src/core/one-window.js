export const REV_KEY = 'rev';
const HELLO_MS = 300;
const TAKEOVER_MS = 1000;
const STAND_DOWN_MS = 8000;




const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createOneWindow({
  store, channel = null, entries, beforeStandDown = async () => {}, onStop = () => {},
  id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, born = Date.now(),
  helloMs = HELLO_MS, takeoverMs = TAKEOVER_MS, standDownMs = STAND_DOWN_MS,
}) {
  let state = 'new';
  let rev = 0;
  let known = 0;
  let outranked = false;
  let leavingFor = null;
  const waiting = new Set();
  let queue = Promise.resolve();

  const post = (message) => { channel?.postMessage({ ...message, from: id }); };
  const storedRev = async () => {
    const r = await store.get(REV_KEY);
    const stored = Number.isSafeInteger(r) && r >= 0 ? r : 0;
    known = Math.max(known, stored);
    return stored;
  };
  const writeRev = async (next, kv) => {
    await store.setMany([[REV_KEY, next], ...kv]);
    rev = next;
    known = Math.max(known, next);
    post({ type: 'saved', rev: next });
  };
  const inTurn = (task) => {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  };
  const stop = (reason) => {
    if (state === 'stopped') return;
    state = 'stopped';
    onStop(reason);
  };

  const claim = () => inTurn(async () => {
    state = 'playing';
    try {
      rev = await storedRev();
      await writeRev(rev + 1, []);
    } catch { }
  });

  const save = (extra = []) => inTurn(async () => {
    if (state !== 'playing') return false;
    const before = rev;
    const stored = await storedRev();
    if (state !== 'playing' || (stored !== before && stored !== rev)) {
      stop('stale');
      return false;
    }
    await writeRev(Math.max(stored, rev) + 1, [...entries(), ...extra]);
    return true;
  });

  const flush = () => {
    if (state !== 'playing' || known !== rev) return Promise.resolve(false);
    const next = rev + 1;
    rev = next;
    known = next;
    const written = store.setMany([[REV_KEY, next], ...entries()]);
    post({ type: 'saved', rev: next });
    return written.then(() => true, (err) => {
      if (rev === next) rev = known = next - 1;
      throw err;
    });
  };

  const hide = () => (state === 'playing' && known === rev ? flush() : save());

  const check = () => inTurn(async () => {
    if (state !== 'playing') return false;
    if ((await storedRev()) === rev) return true;
    stop('stale');
    return false;
  });

  const standDown = async (to) => {
    post({ type: 'ack', to });
    if (leavingFor) { leavingFor.push(to); return; }
    leavingFor = [to];
    try { await beforeStandDown(); } catch { }
    try { await save(); } catch { }
    stop('taken');
    for (const w of leavingFor) post({ type: 'stood-down', to: w });
    leavingFor = null;
  };

  const onMessage = ({ data: m }) => {
    if (m === null || typeof m !== 'object' || m.from === id || (m.to !== undefined && m.to !== id)) return;
    for (const listener of waiting) listener(m);
    if (m.type === 'hello') {
      const older = typeof m.born !== 'number' || born < m.born || (born === m.born && id < String(m.from));
      if (state === 'playing' || (state === 'starting' && older)) post({ type: 'here', to: m.from });
      else if (state === 'starting') outranked = true;
    } else if (m.type === 'here') {
      if (state === 'starting') outranked = true;
    } else if (m.type === 'takeover') {
      if (state === 'playing') standDown(String(m.from));
    } else if (m.type === 'saved' && Number.isSafeInteger(m.rev)) {
      known = Math.max(known, m.rev);
      if (state === 'playing' && known > rev) stop('stale');
    }
  };
  channel?.addEventListener('message', onMessage);

  return {
    async start() {
      if (state !== 'new') return state === 'playing';
      state = 'starting';
      if (channel) {
        post({ type: 'hello', born });
        await wait(helloMs);
      }
      if (outranked) {
        state = 'stopped';
        return false;
      }
      await claim();
      return true;
    },

    async takeOver() {
      if (state === 'playing') return;
      if (channel) {
        await new Promise((resolve) => {
          const answered = new Set();
          const confirmed = new Set();
          let quiet;
          let limit;
          const finish = () => {
            clearTimeout(quiet);
            clearTimeout(limit);
            waiting.delete(listen);
            resolve(undefined);
          };
          const listen = (m) => {
            if (m.to !== id) return;
            if (m.type === 'ack') answered.add(String(m.from));
            if (m.type !== 'stood-down') return;
            answered.add(String(m.from));
            confirmed.add(String(m.from));
            if ([...answered].every((w) => confirmed.has(w))) finish();
          };
          waiting.add(listen);
          quiet = setTimeout(() => { if (answered.size === 0) finish(); }, takeoverMs);
          limit = setTimeout(finish, standDownMs);
          post({ type: 'takeover' });
        });
      }
      await claim();
    },

    save,
    flush,
    hide,
    check,
    playing: () => state === 'playing',
  };
}

export function flagFailedSaves(flags, save) {
  return async (...args) => {
    try {
      const result = await save(...args);
      if (result === true) flags.saveFailed = false;
      return result;
    } catch (err) {
      flags.saveFailed = true;
      throw err;
    }
  };
}
