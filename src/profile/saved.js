import { normalizeSettings } from './settings.js';
import { normalizeProfile } from './profile.js';
import { normalizeItemState } from '../engine/itemstate.js';
import { createStudentStore } from './students.js';
import { upgrade } from './migrate.js';
import { COAT_KEY, normalizeCoat } from './coat.js';


const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizeStates(stored) {
  const out = {};
  if (!isPlainObject(stored)) return out;
  for (const [key, s] of Object.entries(stored)) if (isPlainObject(s)) out[key] = normalizeItemState(key, s);
  return out;
}

async function safeGet(store, key) {
  try {
    return await store.get(key);
  } catch {
    return undefined;
  }
}

export async function readSaved(store, id) {
  if (id !== undefined) store = createStudentStore( (store).base ?? store, { students: [{ id }], current: id });
  const settings = normalizeSettings(upgrade('settings', await safeGet(store, 'settings')));
  const profile = normalizeProfile(upgrade('profile', await safeGet(store, 'profile')));
  const states = new Map(Object.entries(normalizeStates(upgrade('states', await safeGet(store, 'states')))));
  const storedToday = await safeGet(store, 'today');
  const coat = normalizeCoat(await safeGet(store, COAT_KEY));
  return { settings, profile, states, today: isPlainObject(storedToday) ? storedToday : null, coat };
}
