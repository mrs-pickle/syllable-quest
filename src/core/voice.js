export const SPEAKABLE = Object.freeze(['line', 'word', 'meaning', 'sentence', 'passage', 'red']);
export const NEEDS_GROWN_UP = Object.freeze(['made-up', 'syllable', 'sound']);
export const WATCHDOG_MS = 15000;
const DEFAULT_RATE = 0.9;



export function createVoice({
  audio, script, settings, synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance, watchdogMs = WATCHDOG_MS,
}) {
  const entries = script instanceof Map ? script : new Map((script ?? []).map((e) => [e.id, e]));
  const listeners = new Set();
  let endSpeech = null;

  const config = () => {
    try { return (typeof settings === 'function' ? settings() : settings) ?? {}; } catch { return {}; }
  };
  const muted = () => config().muted === true;

  function needGrownUp(info) {
    for (const cb of [...listeners]) {
      try { cb(info); } catch { }
    }
  }

  function englishVoice() {
    try {
      const voices = synth?.getVoices?.() ?? [];
      return voices.find((v) => /^en[-_]US/i.test(v?.lang ?? '')) ?? voices.find((v) => /^en/i.test(v?.lang ?? ''));
    } catch {
      return undefined;
    }
  }

  function silenceSpeech(force = false) {
    const end = endSpeech;
    endSpeech = null;
    if (end || force) {
      try { synth?.cancel?.(); } catch { }
    }
    end?.();
  }

  function speak(text) {
    silenceSpeech();
    if (!synth || typeof synth.speak !== 'function') return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      let timer;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (endSpeech === finish) endSpeech = null;
        resolve();
      };
      endSpeech = finish;
      timer = setTimeout(() => {
        try { synth.cancel?.(); } catch { }
        finish();
      }, watchdogMs);
      try {
        const utterance = typeof Utterance === 'function' ? new Utterance(text) : { text };
        const rate = Number(config().voiceRate);
        utterance.rate = Number.isFinite(rate) && rate > 0 ? Math.min(2, Math.max(0.5, rate)) : DEFAULT_RATE;
        utterance.lang = 'en-US';
        const voice = englishVoice();
        if (voice) utterance.voice = voice;
        utterance.onend = finish;
        utterance.onerror = finish;
        synth.speak(utterance);
      } catch {
        finish();
      }
    });
  }

  async function withoutClip(line) {
    if (NEEDS_GROWN_UP.includes(line.kind)) {
      needGrownUp({ id: line.id, kind: line.kind, text: line.text, ...(line.ipa ? { ipa: line.ipa } : {}) });
      return;
    }
    if (config().placeholderVoice === false || !SPEAKABLE.includes(line.kind)) return;
    await speak(line.text);
  }

  function guarded(work) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, watchdogMs);
      work.then(() => {}, () => {}).finally(() => { clearTimeout(timer); resolve(); });
    });
  }

  return {
    async say(id) {
      try {
        if (muted()) return;
        if (audio?.has?.(id)) {
          silenceSpeech();
          await guarded(Promise.resolve(audio.play(id)));
          return;
        }
        const entry = entries.get(id);
        if (!entry) return;
        await withoutClip({ id, kind: entry.kind, text: entry.text, ipa: entry.ipa });
      } catch {
      }
    },

    async sayText(text, kind = 'line') {
      try {
        if (muted() || typeof text !== 'string' || text.trim() === '') return;
        await withoutClip({ id: null, kind, text });
      } catch {
      }
    },

    stop() {
      silenceSpeech(true);
      try { audio?.stop?.(); } catch { }
    },

    hasClip(id) {
      try { return audio?.has?.(id) === true; } catch { return false; }
    },

    onNeedsGrownUp(cb) {
      if (typeof cb === 'function') listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
  };
}
