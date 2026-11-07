export const CLIP_GAP_MS = 250;
export const LOAD_TIMEOUT_MS = 8000;
const UNLOCK_WAIT_MS = 1000;
const WATCHDOG_SLACK_MS = 1000;
const RECORDING_PREFIX = 'rec:';
const TIMED_OUT = Symbol('timed out');



export function createAudio({ manifest, base, store, ctx, fetchFn, onMissing, variant, muted }) {
  const files = new Map(Object.entries(manifest ?? {}).filter(([, file]) => typeof file === 'string' && file !== ''));
  const prefix = base && !base.endsWith('/') ? `${base}/` : (base ?? '');
  const fetchClip = fetchFn ?? ((url, init) => globalThis.fetch(url, init));

  const overrides = new Map();
  const fileBuffers = new Map();
  const recordingBuffers = new Map();
  const badFiles = new Set();
  const badRecordings = new Set();
  const reported = new Set();

  let context = ctx;
  let listening = false;
  let pressed = false;
  let generation = 0;
  let current = null;
  const waiters = new Set();

  const wakeWaiters = () => { for (const check of [...waiters]) check(); };

  function audioContext() {
    if (context === undefined) {
      try {
        const AudioContextClass = globalThis.AudioContext;
        context = AudioContextClass ? new AudioContextClass() : null;
      } catch {
        context = null;
      }
    }
    if (context && !listening && typeof context.addEventListener === 'function') {
      listening = true;
      context.addEventListener('statechange', wakeWaiters);
    }
    return context;
  }

  function chosen(id) {
    let version = null;
    try { version = variant?.(); } catch { return id; }
    if (!version) return id;
    const twin = `${id}.${version}`;
    return files.has(twin) || overrides.has(twin) ? twin : id;
  }

  const silent = () => {
    try { return muted?.() === true; } catch { return false; }
  };

  const urlFor = (file) => prefix + file.split('/').map(encodeURIComponent).join('/');

  async function fetchFile(file, signal) {
    const response = await fetchClip(urlFor(file), signal ? { signal } : undefined);
    if (!response || !response.ok) throw new Error(`audio file ${file} could not be loaded`);
    return response.arrayBuffer();
  }

  function load(c, read) {
    const abort = typeof globalThis.AbortController === 'function' ? new AbortController() : null;
    let timer;
    const late = new Promise((resolve) => {
      timer = setTimeout(() => { abort?.abort(); resolve(TIMED_OUT); }, LOAD_TIMEOUT_MS);
    });
    const decoded = (async () => {
      try {
        return await c.decodeAudioData(await read(abort?.signal));
      } catch {
        return null;
      }
    })();
    return Promise.race([decoded, late]).finally(() => clearTimeout(timer));
  }

  function reportMissing(id) {
    if (reported.has(id)) return;
    reported.add(id);
    try { onMissing?.(id); } catch { }
  }

  async function cached(cache, id, start) {
    let pending = cache.get(id);
    if (!pending) { pending = start(); cache.set(id, pending); }
    const loaded = await pending;
    if (loaded === TIMED_OUT && cache.get(id) === pending) cache.delete(id);
    return loaded;
  }

  async function bufferFor(id, report = true) {
    const c = audioContext();
    if (c) {
      const blob = overrides.get(id);
      if (blob && !badRecordings.has(id)) {
        const buffer = await cached(recordingBuffers, id, () => load(c, () => blob.arrayBuffer()));
        if (buffer && buffer !== TIMED_OUT) return buffer;
        if (buffer === null && overrides.get(id) === blob) badRecordings.add(id);
      }
      const file = files.get(id);
      if (file !== undefined && !badFiles.has(id)) {
        const buffer = await cached(fileBuffers, id, () => load(c, (signal) => fetchFile(file, signal)));
        if (buffer && buffer !== TIMED_OUT) return buffer;
        if (buffer === null) badFiles.add(id);
      }
    }
    if (report) reportMissing(id);
    return null;
  }

  function endCurrent() {
    const playing = current;
    if (!playing) return;
    current = null;
    try { playing.source.stop(); } catch { }
    playing.finish();
  }

  function interrupt() {
    generation++;
    endCurrent();
    wakeWaiters();
    return generation;
  }

  function untilRunning(c, gen) {
    return new Promise((resolve) => {
      const check = () => {
        if (c.state === 'suspended' && gen === generation) return;
        waiters.delete(check);
        resolve();
      };
      waiters.add(check);
    });
  }

  function untilInterrupted(gen) {
    let check = () => {};
    const ended = new Promise((resolve) => {
      check = () => {
        if (gen === generation) return;
        waiters.delete(check);
        resolve(null);
      };
      waiters.add(check);
    });
    return { ended, forget: () => { waiters.delete(check); } };
  }

  async function playOne(id, gen) {
    const interrupted = untilInterrupted(gen);
    const buffer = await Promise.race([bufferFor(id), interrupted.ended]);
    interrupted.forget();
    const c = context;
    if (!buffer || !c || gen !== generation) return false;
    if (c.state === 'suspended') await untilRunning(c, gen);
    if (gen !== generation || c.state === 'closed') return false;
    endCurrent();
    return new Promise((resolve) => {
      let source;
      try {
        source = c.createBufferSource();
        source.buffer = buffer;
        source.connect(c.destination);
      } catch {
        resolve(false);
        return;
      }
      let done = false;
      let watchdog;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(watchdog);
        source.onended = null;
        if (current === playing) current = null;
        resolve(gen === generation);
      };
      const playing = { source, finish };
      source.onended = finish;
      current = playing;
      try {
        source.start();
      } catch {
        finish();
        return;
      }
      const seconds = Number.isFinite(buffer.duration) ? buffer.duration : 0;
      watchdog = setTimeout(() => { if (current === playing) endCurrent(); else finish(); }, seconds * 1000 + WATCHDOG_SLACK_MS);
    });
  }

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    async unlock() {
      pressed = true;
      try {
        const session = globalThis.navigator?.audioSession;
        if (session) session.type = 'playback';
      } catch { }
      const c = audioContext();
      if (c && c.state === 'suspended' && typeof c.resume === 'function') {
        let resuming;
        try { resuming = Promise.resolve(c.resume()).catch(() => {}); } catch { resuming = Promise.resolve(); }
        let timer;
        await Promise.race([resuming, new Promise((resolve) => { timer = setTimeout(resolve, UNLOCK_WAIT_MS); })]);
        clearTimeout(timer);
      }
      wakeWaiters();
    },

    unlocked: () => pressed,

    has(asked) {
      const id = chosen(asked);
      return (overrides.has(id) && !badRecordings.has(id)) || (files.has(id) && !badFiles.has(id));
    },

    play(id) {
      const gen = interrupt();
      return silent() ? Promise.resolve(false) : playOne(chosen(id), gen);
    },

    async playSeq(asked, gapMs = CLIP_GAP_MS, lead = 0) {
      const gen = interrupt();
      if (silent()) return false;
      const ids = asked.map(chosen);
      for (const id of new Set(ids)) bufferFor(id, false).catch(() => {});
      let whole = true;
      for (let i = 0; i < ids.length; i++) {
        if (gen !== generation) return false;
        const pause = i <= lead ? CLIP_GAP_MS : gapMs;
        if (i > 0 && pause > 0) {
          const interrupted = untilInterrupted(gen);
          await Promise.race([delay(pause), interrupted.ended]);
          interrupted.forget();
        }
        if (gen !== generation || silent()) return false;
        if (!await playOne(ids[i], gen)) whole = false;
      }
      return whole;
    },

    stop() {
      interrupt();
    },

    async setOverride(id, blob) {
      recordingBuffers.delete(id);
      badRecordings.delete(id);
      if (blob) overrides.set(id, blob);
      else overrides.delete(id);
    },

    async reloadOverrides() {
      if (!store) return;
      const found = new Map();
      try {
        for (const blobId of await store.blobIds()) {
          if (!blobId.startsWith(RECORDING_PREFIX)) continue;
          const blob = await store.getBlob(blobId);
          if (blob) found.set(blobId.slice(RECORDING_PREFIX.length), blob);
        }
      } catch {
        return;
      }
      overrides.clear();
      recordingBuffers.clear();
      badRecordings.clear();
      for (const [id, blob] of found) overrides.set(id, blob);
    },
  };
}

export function unlockOnGestures(target, audio) {
  const unlock = () => { Promise.resolve(audio.unlock()).catch(() => {}); };
  const types = ['pointerdown', 'keydown'];
  for (const type of types) target.addEventListener(type, unlock, { capture: true });
  return () => { for (const type of types) target.removeEventListener(type, unlock, { capture: true }); };
}
