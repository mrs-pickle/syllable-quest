import { h } from '../../core/dom.js';
import { SPEAKABLE } from '../../core/voice.js';
import { cornerFrame } from './gate.js';

const SCRIPT_URL = 'voice/script.json';
const RECORDING_PREFIX = 'rec:';
const MIME_TYPES = Object.freeze(['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']);
export const MAX_RECORDING_MS = 30000;
const SEARCH_LIMIT = 80;
export const PAGE_SIZE = 100;

const GROUPS = Object.freeze([
  ['p', 'Sounds'],
  ['ck', 'Chunks (a piece said as one)'],
  ['w', 'Words'],
  ['sy', 'Syllables'],
  ['v', 'Lines the game says'],
  ['n', 'Made-up words'],
  ['r', 'Red words'],
  ['rs', 'Red-word sentences'],
  ['s', 'Dictation sentences'],
  ['ps', 'Passage sentences'],
  ['m', 'Meanings'],
].map((entry) => Object.freeze(entry)));
const OTHER = Object.freeze(['other', 'Other clips']);


const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function pickRecorderMime(Recorder = globalThis.MediaRecorder) {
  if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return '';
  return MIME_TYPES.find((type) => {
    try {
      return Recorder.isTypeSupported?.(type) === true;
    } catch {
      return false;
    }
  }) ?? '';
}

export function groupClips(ids) {
  const byKey = new Map();
  for (const id of ids) {
    const prefix = id.includes('.') ? id.slice(0, id.indexOf('.')) : '';
    const key = GROUPS.some(([p]) => p === prefix) ? prefix : OTHER[0];
    byKey.set(key, [...(byKey.get(key) ?? []), id]);
  }
  return [...GROUPS, OTHER].flatMap(([key, title]) => (byKey.has(key) ? [{ key, title, ids: [... (byKey.get(key))].sort(byCodePoint) }] : []));
}

export function clipText(id, script) {
  const entry = script.get(id);
  if (!entry) return id;
  if (entry.kind === 'syllable') {
    const type = id.slice(id.indexOf('.', 3) + 1);
    return type && type !== id ? `${entry.text} (${type} syllable)` : entry.text;
  }
  return entry.text;
}

export function scriptEntries(data) {
  const entries = new Map();
  if (!Array.isArray(data)) return entries;
  for (const entry of data) {
    if (entry === null || typeof entry !== 'object') continue;
    const { id, kind, text, ipa } = (entry);
    if (typeof id !== 'string' || id === '' || typeof text !== 'string') continue;
    entries.set(id, { id, kind: typeof kind === 'string' ? kind : '', text, ...(typeof ipa === 'string' && ipa !== '' ? { ipa } : {}) });
  }
  return entries;
}

export async function readScript(fetchFn = (url) => globalThis.fetch(url)) {
  try {
    const response = await fetchFn(SCRIPT_URL);
    if (!response?.ok) return new Map();
    return scriptEntries(await response.json());
  } catch {
    return new Map();
  }
}

export function sizeText(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'recordings');
  if (!body) return () => {};

  let alive = true;
  let script = new Map();
  const recorded = new Map();
  let active = null;
  let confirming = null;
  const rows = new Set();
  const searchRows = new Set();
  const refresh = () => { for (const draw of [...rows, ...searchRows]) draw(); };

  const message = h('p', { class: 'gu-saved', role: 'status', 'aria-live': 'polite' });
  const say = (t) => { message.textContent = t; };
  const summary = h('p', { class: 'gu-hint' });
  const text = ( id) => clipText(id, script);

  function drawSummary() {
    const bytes = [...recorded.values()].reduce((sum, n) => sum + n, 0);
    summary.textContent = recorded.size === 0
      ? 'You have not recorded any clips yet.'
      : `You have recorded ${recorded.size} ${recorded.size === 1 ? 'clip' : 'clips'} (${sizeText(bytes)}). Backup keeps them.`;
  }

  const release = (rec) => {
    const stream = rec.stream;
    rec.stream = null;
    for (const track of stream?.getTracks?.() ?? []) track.stop();
  };

  async function revert(rec) {
    try { await ctx.audio.setOverride(rec.id, rec.previous); } catch (err) { console.warn('The earlier clip could not be put back', err); }
  }

  function cancel() {
    const rec = active;
    if (!rec) return;
    active = null;
    clearTimeout(rec.timer);
    const recorder = rec.recorder;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { }
    }
    release(rec);
    if (rec.phase === 'review') { ctx.audio.stop(); revert(rec); }
    refresh();
  }

  function stopRecording() {
    const rec = active;
    if (!rec || rec.phase !== 'recording') return;
    clearTimeout(rec.timer);
    if (rec.recorder && rec.recorder.state !== 'inactive') rec.recorder.stop();
  }

  async function startRecording(id) {
    const media = globalThis.navigator?.mediaDevices;
    const Recorder = globalThis.MediaRecorder;
    if (!media?.getUserMedia || !Recorder) { say("This browser can't record sound here."); return; }
    ctx.audio.stop();
    confirming = null;
    const rec = { id, phase: 'asking', recorder: null, stream: null, previous: null, blob: null };
    active = rec;
    refresh();
    say('Asking to use the microphone...');
    try {
      rec.previous = recorded.has(id) ? (await ctx.store.getBlob(RECORDING_PREFIX + id)) ?? null : null;
    } catch {
      rec.previous = null;
    }
    let stream;
    try {
      stream = await media.getUserMedia({ audio: true });
    } catch (err) {
      console.warn('No microphone', err);
      if (active === rec) { active = null; refresh(); }
      say("The microphone isn't available. Allow this page to use the microphone (the icon in the address bar), then try again.");
      return;
    }
    rec.stream = stream;
    if (!alive || active !== rec) { release(rec); return; }
    const mime = pickRecorderMime(Recorder);
    const chunks = [];
    try {
      const recorder = new Recorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.addEventListener('dataavailable', ( event) => { if (event.data?.size) chunks.push(event.data); });
      recorder.addEventListener('stop', () => {
        clearTimeout(rec.timer);
        release(rec);
        if (!alive || active !== rec) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
        if (blob.size === 0) {
          active = null;
          refresh();
          say('Nothing was recorded. Check the microphone and try again.');
          return;
        }
        rec.phase = 'review';
        rec.blob = blob;
        Promise.resolve(ctx.audio.setOverride(id, blob)).then(() => { if (alive && active === rec) ctx.audio.play(id); });
        refresh();
        say(`Listen to your recording of "${text(id)}". Press Keep to use it everywhere in the game, or Redo to say it again.`);
      });
      recorder.start();
      rec.recorder = recorder;
    } catch (err) {
      console.error('MediaRecorder could not start', err);
      release(rec);
      active = null;
      refresh();
      say("This browser can't record sound here.");
      return;
    }
    rec.phase = 'recording';
    rec.timer = setTimeout(() => { if (active === rec) stopRecording(); }, MAX_RECORDING_MS);
    say(`Recording "${text(id)}"... Say it, then press Stop.`);
    refresh();
  }

  async function keep() {
    const rec = active;
    if (!rec || rec.phase !== 'review' || !rec.blob) return;
    const { id, blob } = rec;
    try {
      await ctx.store.putBlob(RECORDING_PREFIX + id, blob);
    } catch (err) {
      console.error(`The recording of ${id} could not be saved`, err);
      say("The recording couldn't be saved in this browser window. Press Keep to try again, or Redo.");
      return;
    }
    if (active !== rec) return;
    active = null;
    await ctx.audio.setOverride(id, blob);
    recorded.set(id, blob.size);
    drawSummary();
    refresh();
    say(`Kept your recording of "${text(id)}". It plays everywhere in the game from now on.`);
  }

  async function redo() {
    const rec = active;
    if (!rec || rec.phase !== 'review') return;
    const { id } = rec;
    ctx.audio.stop();
    active = null;
    await revert(rec);
    if (alive) await startRecording(id);
  }

  async function deleteRecording(id) {
    confirming = null;
    try {
      await ctx.store.delBlob(RECORDING_PREFIX + id);
    } catch (err) {
      console.error(`The recording of ${id} could not be deleted`, err);
      say("The recording couldn't be deleted in this browser window.");
      refresh();
      return;
    }
    await ctx.audio.setOverride(id, null);
    recorded.delete(id);
    drawSummary();
    refresh();
    say(ctx.audio.has(id) ? `Deleted your recording; the game's own "${text(id)}" plays again.` : 'Deleted the recording.');
  }

  function play(id) {
    if (typeof ctx.voice?.say === 'function') ctx.voice.say(id);
    else ctx.audio.play(id);
  }

  function status(id) {
    if (recorded.has(id)) return 'your recording';
    if (ctx.audio.has(id)) return 'voice clip';
    const kind = script.get(id)?.kind ?? '';
    return SPEAKABLE.includes(kind) ? 'computer voice' : 'no clip yet';
  }

  function clipRow(id, registry) {
    const entry = script.get(id);
    const badges = h('span', { class: 'gu-badges' });
    const buttons = h('span', { class: 'gu-clip-buttons' });
    const row = h('div', { class: 'gu-clip', 'data-clip': id },
      h('span', { class: 'gu-clip-text' },
        h('span', { class: 'gu-clip-say' }, text(id)),
        entry?.ipa ? h('span', { class: 'gu-clip-ipa' }, `/${entry.ipa}/`) : null,
        h('span', { class: 'gu-clip-id' }, `clip: ${id}`),
        badges),
      buttons);
    const button = (label, onClick, cls = '', disabled = false) => {
      const b = h('button', { type: 'button', class: ['gu-button', 'gu-small', cls], onClick, disabled }, label);
      return b;
    };
    const draw = () => {
      const mine = recorded.has(id);
      const here = active?.id === id;
      const phase = here ? active?.phase : null;
      const canPlay = ctx.audio.has(id) || (entry !== undefined && SPEAKABLE.includes(entry.kind));
      badges.replaceChildren(h('span', { class: ['gu-badge', mine && 'mine'] }, status(id)));
      if (phase === 'asking' || phase === 'recording') {
        buttons.replaceChildren(button('Stop', stopRecording, 'gu-record recording', phase === 'asking'), button('Cancel', cancel));
      } else if (phase === 'review') {
        buttons.replaceChildren(
          button('Listen', () => { ctx.audio.play(id); }),
          button('Keep', () => { keep(); }, 'gu-primary gu-keep'),
          button('Redo', () => { redo(); }, 'gu-redo'),
          button('Cancel', cancel));
      } else if (confirming === id) {
        buttons.replaceChildren(
          h('span', { class: 'gu-confirm' }, 'Delete your recording?'),
          button('Yes, delete', () => { deleteRecording(id); }, 'gu-delete-yes'),
          button('Keep it', () => { confirming = null; refresh(); }));
      } else {
        const busy = active !== null;
        buttons.replaceChildren(
          ...[
            button('Play', () => play(id), 'gu-play', busy || !canPlay),
            button(mine ? 'Record again' : 'Record', () => { if (!active) startRecording(id); }, 'gu-record', busy),
            mine ? button('Delete recording', () => { confirming = id; refresh(); }, 'gu-delete', busy) : null,
          ].filter((b) => b !== null));
      }
    };
    draw();
    registry.add(draw);
    return row;
  }


  const listing = h('div', { class: 'gu-clips' }, h('p', { class: 'gu-empty' }, 'Loading the clips...'));
  const results = h('div', { class: 'gu-clip-results' });
  const search = (h('input', { class: 'gu-input gu-search', type: 'search', placeholder: 'Find a clip, or type "mine"', 'aria-label': 'Find a clip', autocomplete: 'off' }));

  body.append(
    h('p', {}, 'Record a clip in your own voice and it replaces the game\'s clip everywhere, including where the game would otherwise use the computer\'s voice. Press Record, say it, press Stop, then listen. Keep saves it; Redo tries again. Sounds should have no extra "uh": /b/, not "buh".'),
    h('p', { class: 'gu-hint' }, 'The microphone is asked for only when you press Record. Recordings are saved in this browser for the student playing now, and Backup includes them (the backup file can be up to 20 MB). Delete recording brings back the game\'s own clip.'),
    summary,
    message,
    search,
    results,
    listing);
  drawSummary();

  (async () => {
    const [entries, blobIds] = await Promise.all([
      readScript(),
      ctx.store.blobIds().catch(() => ([])),
    ]);
    if (!alive) return;
    script = entries;
    for (const blobId of blobIds) {
      if (!blobId.startsWith(RECORDING_PREFIX)) continue;
      const clip = blobId.slice(RECORDING_PREFIX.length);
      let blob;
      try { blob = await ctx.store.getBlob(blobId); } catch { blob = undefined; }
      if (blob) recorded.set(clip, blob.size);
    }
    if (!alive) return;
    drawSummary();
    const ids = [...new Set([...script.keys(), ...recorded.keys()])];
    const groups = groupClips(ids);
    if (groups.length === 0) {
      search.hidden = true;
      listing.replaceChildren(h('p', { class: 'gu-empty' }, 'The list of clips could not be read, so there is nothing to record here yet. Reload the page and try again.'));
      return;
    }
    listing.replaceChildren(...groups.map((group) => {
      const list = h('div', { class: 'gu-clip-list' });
      const more = h('button', { type: 'button', class: 'gu-button gu-small gu-more', hidden: true }, 'Show more');
      let shown = 0;
      const fill = () => {
        const next = group.ids.slice(shown, shown + PAGE_SIZE);
        list.append(...next.map((id) => clipRow(id, rows)));
        shown += next.length;
        more.hidden = shown >= group.ids.length;
        more.textContent = `Show more (${group.ids.length - shown} left)`;
      };
      more.addEventListener('click', fill);
      const details = h('details', { class: 'gu-group', 'data-group': group.key, open: group.key === 'p' },
        h('summary', { class: 'gu-group-title' }, `${group.title} (${group.ids.length})`), list, more);
      if (group.key === 'p') fill();
      details.addEventListener('toggle', () => { if ( (details).open && shown === 0) fill(); });
      return details;
    }));
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      searchRows.clear();
      if (!q) { results.replaceChildren(); return; }
      const askedMine = q.length >= 2 && 'mine'.startsWith(q);
      const found = ids.filter((id) => id.toLowerCase().includes(q) || text(id).toLowerCase().includes(q) || (askedMine && recorded.has(id))).sort(byCodePoint);
      results.replaceChildren(
        h('p', { class: 'gu-hint' }, found.length > SEARCH_LIMIT ? `${found.length} clips match; the first ${SEARCH_LIMIT} are shown.` : `${found.length} ${found.length === 1 ? 'clip matches' : 'clips match'}.`),
        ...found.slice(0, SEARCH_LIMIT).map((id) => clipRow(id, searchRows)));
    });
  })().catch((err) => console.error('Recordings could not load the clips', err));

  return () => {
    alive = false;
    cancel();
  };
}
