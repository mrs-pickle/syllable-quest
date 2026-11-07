import { finishedSessions, normalizeProfile } from './profile.js';
import { COAT_KEY, isCoat, normalizeCoat } from './coat.js';
import { normalizeStates } from './saved.js';
import { normalizeSettings } from './settings.js';
import { CURRENT_VERSION, upgrade } from './migrate.js';
import {
  BACKUP_KEY_PREFIX, CURRENT_KEY, DEVICE_SETTINGS, MAX_STUDENTS, STUDENTS_KEY, isStudentId, normalizeStudents, splitSettings, studentPrefix,
} from './students.js';


export const FORMAT = 'syllable-quest-backup';
export const VERSION = CURRENT_VERSION;
export const MAX_BYTES = 20 * 1024 * 1024;
const RECORDING_PREFIX = 'rec:';
const CLIP_ID = /^\S{1,200}$/;
const AUDIO_DATA_URL = /^data:(audio\/[A-Za-z0-9.+-]+)(?:;[A-Za-z0-9=.+-]+)*;base64,([A-Za-z0-9+/]*={0,2})$/;
const BYTES_PER_CHUNK = 0x8000;




function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += BYTES_PER_CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + BYTES_PER_CHUNK));
  return `data:${blob.type || 'audio/webm'};base64,${btoa(binary)}`;
}

function parseRecordings(raw) {
  const found = new Map();
  if (!isPlainObject(raw)) return found;
  for (const [clip, url] of Object.entries(raw)) {
    const match = CLIP_ID.test(clip) && typeof url === 'string' ? AUDIO_DATA_URL.exec(url) : null;
    if (!match) continue;
    try {
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      if (bytes.length > 0) found.set(clip, new Blob([bytes], { type: match[1] }));
    } catch { }
  }
  return found;
}

async function recordingsOf(base, id) {
  const prefix = `${studentPrefix(id)}${RECORDING_PREFIX}`;
  const out = {};
  for (const blobId of (await base.blobIds()).filter((b) => b.startsWith(prefix)).sort()) {
    const blob = await base.getBlob(blobId);
    if (blob && blob.size > 0) out[blobId.slice(prefix.length)] = await blobToDataUrl(blob);
  }
  return out;
}

const dayText = (now = new Date()) => now.toISOString().slice(0, 10);
const EXPORTED = /^\d{4}-\d{2}-\d{2}/;

const NOT_A_BACKUP = "That file isn't a Syllable Quest backup.";

function tooBig(text) {
  if (text.length > MAX_BYTES) return true;
  return text.length > MAX_BYTES / 3 && new TextEncoder().encode(text).length > MAX_BYTES;
}

function parse(text) {
  if (typeof text !== 'string') return { ok: false, error: NOT_A_BACKUP };
  if (tooBig(text)) return { ok: false, error: 'That file is too big to be a Syllable Quest backup (over 20 MB), so nothing was changed.' };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file couldn't be read as a backup. It may be damaged or cut short, so nothing was changed." };
  }
  if (!isPlainObject(data) || data.format !== FORMAT) return { ok: false, error: NOT_A_BACKUP };
  const version = data.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "That backup was made by a different version of the game, so it can't be loaded here." };
  }
  if (version > VERSION) {
    return { ok: false, error: `That backup was made by a newer version of the game (version ${version}), so it can't be loaded here. Update the game on this computer, then try again.` };
  }
  data = upgrade('backup', data);
  if (!Array.isArray(data.students)) return { ok: false, error: 'That backup file looks damaged (it has no students), so nothing was changed.' };
  if (data.students.length === 0) return { ok: false, error: 'That backup has no students in it, so there is nothing to restore.' };
  if (data.students.length > MAX_STUDENTS) {
    return { ok: false, error: `That backup holds ${data.students.length} students, and a device keeps at most ${MAX_STUDENTS}, so nothing was changed.` };
  }
  const ids = new Set();
  const students = [];
  for (const entry of data.students) {
    if (!isPlainObject(entry) || !isStudentId(entry.id) || ids.has(entry.id)) {
      return { ok: false, error: 'That backup file looks damaged (a student in it is not readable), so nothing was changed.' };
    }
    ids.add(entry.id);
    const profile = normalizeProfile(upgrade('profile', entry.profile));
    const { student } = splitSettings(normalizeSettings(upgrade('settings', entry.settings)));
    students.push({
      id: entry.id,
      label: normalizeStudents([{ id: entry.id, label: entry.label }])[0].label ?? '',
      settings: student,
      profile,
      states: normalizeStates(upgrade('states', entry.states)),
      coat: isCoat(entry.coat) ? entry.coat : null,
      recordings: parseRecordings(entry.recordings),
    });
  }
  const rawDevice = isPlainObject(data.device) ? data.device : {};
  const safe = normalizeSettings(rawDevice);
  const device = { tipsSeen: safe.tipsSeen, muted: safe.muted };
  if (safe.pin !== null) device.pin = safe.pin;
  const exported = typeof data.exported === 'string' && EXPORTED.test(data.exported) ? data.exported : null;
  return { ok: true, backup: { exported, device, students } };
}

function summarize(backup) {
  return {
    exported: backup.exported,
    hasPin: typeof backup.device.pin === 'string',
    students: backup.students.map((s) => {
      const done = finishedSessions(s.profile);
      return { id: s.id, label: s.label, stage: s.settings.stage, sessions: done.length, lastSessionDay: done.length ? done[done.length - 1].day : null };
    }),
  };
}

export function checkBackup(text) {
  const parsed = parse(text);
  return parsed.ok ? { ok: true, summary: summarize(parsed.backup) } : parsed;
}

const baseOf = (store) => (store).base ?? store;

export async function exportBackup(store, { includePin = false, now } = {}) {
  const base = baseOf(store);
  const list = normalizeStudents(await base.get(STUDENTS_KEY));
  if (list.length === 0) throw new RangeError('There is no student to back up yet.');
  const device = splitSettings(normalizeSettings(await base.get('settings'))).device;
  const students = [];
  for (const { id, label } of list) {
    const prefix = studentPrefix(id);
    const { student } = splitSettings(normalizeSettings({ ...(await base.get(`${prefix}settings`)) }));
    const recordings = await recordingsOf(base, id);
    students.push({
      id,
      label: label ?? '',
      settings: student,
      profile: normalizeProfile(await base.get(`${prefix}profile`)),
      states: normalizeStates(await base.get(`${prefix}states`)),
      coat: normalizeCoat(await base.get(`${prefix}${COAT_KEY}`)),
      ...(Object.keys(recordings).length > 0 ? { recordings } : {}),
    });
  }
  const text = JSON.stringify({
    format: FORMAT,
    version: VERSION,
    exported: dayText(now),
    device: { ...(includePin && typeof device.pin === 'string' ? { pin: device.pin } : {}), tipsSeen: device.tipsSeen, muted: device.muted },
    students,
  });
  if (tooBig(text)) throw new RangeError('The recordings make this backup bigger than the 20 MB the game can restore. Delete some recordings in Recordings, then try again.');
  return text;
}

export async function importBackup(store, text) {
  const parsed = parse(text);
  if (!parsed.ok) return parsed;
  const { backup } = parsed;
  const base = baseOf(store);
  const nothingChanged = { ok: false, error: "The backup couldn't be saved in this browser window, so nothing was changed." };
  const touched = [];
  try {
    for (const s of backup.students) {
      for (const [clip, blob] of s.recordings) {
        const blobId = `${studentPrefix(s.id)}${RECORDING_PREFIX}${clip}`;
        touched.push([blobId, await base.getBlob(blobId)]);
        await base.putBlob(blobId, blob);
      }
    }
    const writes = new Map();
    for (const s of backup.students) {
      const prefix = studentPrefix(s.id);
      writes.set(`${prefix}settings`, s.settings);
      writes.set(`${prefix}profile`, s.profile);
      writes.set(`${prefix}states`, s.states);
      if (s.coat !== null) writes.set(`${prefix}${COAT_KEY}`, s.coat);
    }
    writes.set(STUDENTS_KEY, backup.students.map((s) => ({ id: s.id, created: s.profile.createdDay, ...(s.label === '' ? {} : { label: s.label }) })));
    const current = await base.get(CURRENT_KEY);
    writes.set(CURRENT_KEY, backup.students.some((s) => s.id === current) ? current : backup.students[0].id);
    const here = (await base.get('settings')) ?? {};
    const keptPin = isPlainObject(here) && typeof here.pin === 'string' ? here.pin : null;
    const deviceSettings = { ...(isPlainObject(here) ? Object.fromEntries(DEVICE_SETTINGS.filter((k) => Object.hasOwn(here, k)).map((k) => [k, here[k]])) : {}) };
    Object.assign(deviceSettings, backup.device);
    if (backup.device.pin === undefined) {
      if (keptPin !== null) deviceSettings.pin = keptPin;
      else delete deviceSettings.pin;
    }
    writes.set('settings', deviceSettings);
    const entries = [...writes];
    for (const key of await base.keys()) {
      if (/^s:s[1-9][0-9]{0,3}:/.test(key) && !writes.has(key) && !key.startsWith(BACKUP_KEY_PREFIX)) entries.push([key, undefined]);
    }
    const keepIds = new Set(backup.students.map((s) => s.id));
    const dropped = (await base.blobIds()).filter((id) => /^s:s[1-9][0-9]{0,3}:/.test(id) && !keepIds.has(id.split(':')[1]));
    await base.setMany(entries);
    for (const id of dropped) await base.delBlob(id);
  } catch {
    for (const [blobId, before] of touched) {
      try { if (before) await base.putBlob(blobId, before); else await base.delBlob(blobId); } catch { }
    }
    return nothingChanged;
  }
  return { ok: true, summary: summarize(backup) };
}
