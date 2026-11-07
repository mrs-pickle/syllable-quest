export const MIX_IT_UP = 'mix';
export const BREAK_STYLES = Object.freeze(['jumps', 'stretch', 'march', 'balance', 'shake']);

export const LAST_STAGE = 27;


export const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  stage: 0,
  sessionMinutes: 20,
  copilot: true,
  pin: null,
  terms: 'story',
  termsAsked: false,
  placeholderVoice: true,
  voiceRate: 0.9,
  comfort: Object.freeze({ tint: 'paper', spacing: 'normal' }),
  paperBackup: false,
  pickSounds: true,
  writeOnScreen: true,
  doseOverride: null,
  tipsSeen: Object.freeze({}),
  muted: false,
  breakStyle: MIX_IT_UP,
});

export const SESSION_MINUTES = Object.freeze([15, 20, 25]);
const TERMS = Object.freeze(['story', 'classroom']);
const SPACINGS = Object.freeze(['normal', 'wide']);
const MIN_RATE = 0.5;
const MAX_RATE = 1.5;
const NAME = /^[a-z][a-z0-9-]{0,23}$/;
const MAX_PIN_HASH_LENGTH = 200;
const TIP_ID = /^[a-z][a-z0-9.-]{0,63}$/;
const MAX_TIPS_SEEN = 64;

export function clampStage(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.stage;
  return Math.min(LAST_STAGE, Math.max(0, Math.round(value)));
}

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function tipsSeen(value) {
  const seen = {};
  if (Array.isArray(value)) {
    for (const id of value.slice(0, MAX_TIPS_SEEN)) if (typeof id === 'string' && TIP_ID.test(id)) seen[id] = true;
    return seen;
  }
  if (!isRecord(value)) return seen;
  for (const [id, mark] of Object.entries(value).slice(0, MAX_TIPS_SEEN)) if (mark === true && TIP_ID.test(id)) seen[id] = true;
  return seen;
}

function comfort(value) {
  const r = isRecord(value) ? value : {};
  return {
    tint: typeof r.tint === 'string' && NAME.test(r.tint) ? r.tint : DEFAULT_SETTINGS.comfort.tint,
    spacing: oneOf(r.spacing, SPACINGS, DEFAULT_SETTINGS.comfort.spacing),
  };
}

const SETTING_TYPES = Object.freeze({
  version: 'number', stage: 'number', sessionMinutes: 'number', copilot: 'boolean', pin: 'string', terms: 'string',
  termsAsked: 'boolean', placeholderVoice: 'boolean', voiceRate: 'number', comfort: 'object', paperBackup: 'boolean',
  pickSounds: 'boolean', writeOnScreen: 'boolean', doseOverride: 'number', tipsSeen: 'object', muted: 'boolean',
  breakStyle: 'string',
});
const NULLABLE = Object.freeze(['pin', 'doseOverride']);

export function isSettingsShape(raw) {
  if (!isRecord(raw)) return false;
  return Object.entries(SETTING_TYPES).every(([key, type]) => !Object.hasOwn(raw, key)
    || (NULLABLE.includes(key) && raw[key] === null) || (type === 'object' ? isRecord(raw[key])
      : typeof raw[key] === type && (type !== 'number' || Number.isFinite(raw[key]))));
}

export function normalizeSettings(raw) {
  const r = isRecord(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  const rate = typeof r.voiceRate === 'number' && Number.isFinite(r.voiceRate) ? Math.min(MAX_RATE, Math.max(MIN_RATE, r.voiceRate)) : d.voiceRate;
  const dose = typeof r.doseOverride === 'number' && Number.isFinite(r.doseOverride) && r.doseOverride >= 0 ? r.doseOverride : d.doseOverride;
  return {
    version: 1,
    stage: clampStage(r.stage),
    sessionMinutes: oneOf(r.sessionMinutes, SESSION_MINUTES, d.sessionMinutes),
    copilot: bool(r.copilot, d.copilot),
    pin: typeof r.pin === 'string' && r.pin.length > 0 && r.pin.length <= MAX_PIN_HASH_LENGTH ? r.pin : d.pin,
    terms: oneOf(r.terms, TERMS, d.terms),
    termsAsked: bool(r.termsAsked, d.termsAsked),
    placeholderVoice: bool(r.placeholderVoice, d.placeholderVoice),
    voiceRate: rate,
    comfort: comfort(r.comfort),
    paperBackup: bool(r.paperBackup, d.paperBackup),
    pickSounds: bool(r.pickSounds, d.pickSounds),
    writeOnScreen: bool(r.writeOnScreen, d.writeOnScreen),
    doseOverride: dose,
    tipsSeen: tipsSeen(r.tipsSeen),
    muted: bool(r.muted, d.muted),
    breakStyle: oneOf(r.breakStyle, [MIX_IT_UP, ...BREAK_STYLES], d.breakStyle),
  };
}
