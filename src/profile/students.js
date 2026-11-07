import { REV_KEY } from '../core/one-window.js';




export const MAX_STUDENTS = 2;
export const STUDENTS_KEY = 'students';
export const CURRENT_KEY = 'current';
export const BACKUP_KEY_PREFIX = 'backup:';
export const DEVICE_SETTINGS = Object.freeze( (['pin', 'tipsSeen', 'muted']));
const SETTINGS_KEY = 'settings';
const STUDENT_ID = /^s[1-9][0-9]{0,3}$/;
const MAX_LABEL = 40;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export const isStudentId = (id) => typeof id === 'string' && STUDENT_ID.test(id);

export const studentPrefix = (id) => `s:${id}:`;

export const isDeviceKey = (key) => key === STUDENTS_KEY || key === CURRENT_KEY || key === REV_KEY || key.startsWith(BACKUP_KEY_PREFIX);

export function normalizeStudents(raw) {
  if (!Array.isArray(raw)) return [];
  const list = [];
  for (const entry of raw) {
    if (!isRecord(entry) || !isStudentId(entry.id) || list.some((s) => s.id === entry.id)) continue;
    const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, MAX_LABEL) : '';
    list.push({ id: entry.id, created: typeof entry.created === 'number' && Number.isFinite(entry.created) ? entry.created : null, ...(label === '' ? {} : { label }) });
  }
  return list;
}

export function nextStudentId(list) {
  const highest = list.reduce((n, s) => Math.max(n, Number(s.id.slice(1))), 0);
  return `s${highest + 1}`;
}

export function splitSettings(settings) {
  const device = {};
  const student = {};
  for (const [key, value] of Object.entries(isRecord(settings) ? settings : {})) {
    if ( (DEVICE_SETTINGS).includes(key)) device[key] = value;
    else student[key] = value;
  }
  return { device, student };
}

export function joinSettings(device, student) {
  if (device === undefined && student === undefined) return undefined;
  return { ...splitSettings( (student)).student, ...splitSettings( (device)).device };
}

export function createStudentStore(base, { students = [], current = null, day = () => null } = {}) {
  let list = normalizeStudents(students);
  let savedCurrent = current;
  const pick = (wanted) => (list.some((s) => s.id === wanted) ? (wanted) : list[0]?.id ?? nextStudentId(list));
  let id = pick(current);
  const key = (key) => studentPrefix(id) + key;
  const registered = () => list.some((s) => s.id === id);

  const mapped = (entries) => {
    const out = [];
    let profile = false;
    for (const [k, v] of entries) {
      if (k === SETTINGS_KEY) {
        if (v === undefined) { out.push([key(SETTINGS_KEY), undefined]); continue; }
        const { device, student } = splitSettings(v);
        out.push([SETTINGS_KEY, device], [key(SETTINGS_KEY), student]);
      } else if (isDeviceKey(k)) {
        out.push([k, v]);
      } else {
        out.push([key(k), v]);
        if (k === 'profile' && v !== undefined) profile = true;
      }
    }
    let joined = null;
    if (profile && !registered()) {
      joined = [...list, { id, created: day() ?? null }];
      out.push([STUDENTS_KEY, joined]);
    }
    if ((joined || registered()) && savedCurrent !== id) out.push([CURRENT_KEY, id]);
    return { out, joined };
  };

  const setMany = (entries) => {
    const { out, joined } = mapped(entries);
    const writing = id;
    const written = base.setMany(out);
    return written.then(() => {
      if (joined) list = normalizeStudents(joined);
      if (out.some(([k]) => k === CURRENT_KEY)) savedCurrent = writing;
    });
  };

  return {
    get persistent() { return base.persistent; },
    base,
    get student() { return id; },
    registered,
    students: () => list.map((s) => ({ ...s })),
    use(wanted) {
      if (!list.some((s) => s.id === wanted)) throw new RangeError(`No student ${wanted} on this device`);
      id = (wanted);
    },
    startNew() {
      if (list.length >= MAX_STUDENTS) throw new RangeError(`At most ${MAX_STUDENTS} students on one device`);
      id = nextStudentId(list);
      return id;
    },
    async reload() {
      list = normalizeStudents(await base.get(STUDENTS_KEY));
      savedCurrent = await base.get(CURRENT_KEY);
      id = pick(list.some((s) => s.id === savedCurrent) ? savedCurrent : id);
    },
    async get(k) {
      if (k === SETTINGS_KEY) return joinSettings(await base.get(SETTINGS_KEY), await base.get(key(SETTINGS_KEY)));
      return base.get(isDeviceKey(k) ? k : key(k));
    },
    set: (k, v) => setMany([[k, v]]),
    setMany,
    del: (k) => setMany([[k, undefined]]),
    async keys() {
      const prefix = studentPrefix(id);
      const all = await base.keys();
      const mine = all.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
      if (all.includes(SETTINGS_KEY) && !mine.includes(SETTINGS_KEY)) mine.push(SETTINGS_KEY);
      return mine.sort();
    },
    getBlob: (blobId) => base.getBlob(key(blobId)),
    putBlob: (blobId, blob) => base.putBlob(key(blobId), blob),
    delBlob: (blobId) => base.delBlob(key(blobId)),
    async blobIds() {
      const prefix = studentPrefix(id);
      return (await base.blobIds()).filter((b) => b.startsWith(prefix)).map((b) => b.slice(prefix.length)).sort();
    },
  };
}

export async function removeStudent(base, id) {
  const list = normalizeStudents(await base.get(STUDENTS_KEY));
  if (!list.some((s) => s.id === id)) throw new RangeError(`No student ${id} on this device`);
  const left = list.filter((s) => s.id !== id);
  if (left.length === 0) throw new RangeError('The last student on a device is never removed');
  const prefix = studentPrefix(id);
  const entries = (await base.keys()).filter((k) => k.startsWith(prefix)).map((k) => [k, undefined]);
  const current = await base.get(CURRENT_KEY);
  const next = left.some((s) => s.id === current) ? (current) : left[0].id;
  entries.push([STUDENTS_KEY, left], [CURRENT_KEY, next]);
  await base.setMany(entries);
  for (const blobId of await base.blobIds()) if (blobId.startsWith(prefix)) await base.delBlob(blobId);
  return next;
}

export async function openStudentStore(base, options = {}) {
  const store = createStudentStore(base, options);
  await store.reload();
  return store;
}
