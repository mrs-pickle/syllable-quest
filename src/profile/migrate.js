import { BACKUP_KEY_PREFIX, CURRENT_KEY, STUDENTS_KEY, isDeviceKey, splitSettings, studentPrefix } from './students.js';


export const CURRENT_VERSION = 1;

export const KINDS = Object.freeze(['settings', 'profile', 'states', 'backup']);

const STEPS = { settings: {}, profile: {}, states: {}, backup: {} };

export function upgrade(kind, value) {
  const stated = value !== null && typeof value === 'object' ? value.version : undefined;
  let version = Number.isInteger(stated) && stated >= 1 ? stated : 1;
  let out = value;
  while (version < CURRENT_VERSION) {
    const step = STEPS[kind]?.[version];
    if (step) out = step(out);
    version += 1;
  }
  return out;
}

export const PRE_STUDENTS_BACKUP_KEY = `${BACKUP_KEY_PREFIX}pre-students`;
export const FIRST_STUDENT = 's1';
const PREFIXED = /^s:s[1-9][0-9]{0,3}:/;

async function removeMovedBlobs(base) {
  const ids = await base.blobIds();
  const prefix = studentPrefix(FIRST_STUDENT);
  let removed = 0;
  for (const id of ids) {
    if (PREFIXED.test(id) || !ids.includes(prefix + id)) continue;
    await base.delBlob(id);
    removed += 1;
  }
  return removed;
}

async function snapshotText(base) {
  function strict(key, value) {
    const original = this[key];
    const plain = original === null || ['string', 'boolean', 'undefined'].includes(typeof original) || (typeof original === 'number' && Number.isFinite(original))
      || Array.isArray(original) || [Object.prototype, null].includes(Object.getPrototypeOf(original ?? {}));
    if (!plain) throw new TypeError(`unsupported value for "${key}"`);
    return value;
  }
  const kv = Object.create(null);
  for (const key of await base.keys()) {
    if (key === 'rev' || key.startsWith(BACKUP_KEY_PREFIX)) continue;
    const value = await base.get(key);
    if (value !== undefined) kv[key] = JSON.parse(JSON.stringify(value, strict));
  }
  return JSON.stringify({ format: 'syllable-quest-backup', version: 1, kv, blobs: {} });
}

export async function migrateToStudents(base, { day = () => null } = {}) {
  if (await base.get(STUDENTS_KEY) !== undefined) {
    await removeMovedBlobs(base);
    return 'already';
  }
  if (await base.get('profile') === undefined) return 'nothing';

  try {
    await base.set(PRE_STUDENTS_BACKUP_KEY, await snapshotText(base));
  } catch (err) {
    console.error('The automatic backup before students could not be made; moving her progress anyway', err);
  }

  const prefix = studentPrefix(FIRST_STUDENT);
  for (const id of await base.blobIds()) {
    if (PREFIXED.test(id)) continue;
    const blob = await base.getBlob(id);
    if (blob !== undefined) await base.putBlob(prefix + id, blob);
  }

  const entries = [];
  for (const key of await base.keys()) {
    if (isDeviceKey(key) || PREFIXED.test(key)) continue;
    const value = await base.get(key);
    if (value === undefined) continue;
    if (key === 'settings') {
      const { device, student } = splitSettings(value);
      entries.push(['settings', device], [prefix + 'settings', student]);
      continue;
    }
    entries.push([prefix + key, value], [key, undefined]);
  }
  entries.push([STUDENTS_KEY, [{ id: FIRST_STUDENT, created: day() ?? null }]], [CURRENT_KEY, FIRST_STUDENT]);
  await base.setMany(entries);

  await removeMovedBlobs(base);
  return 'moved';
}
