export const PREFIXES = Object.freeze({
  g: Object.freeze(['see', 'hear']),
  n: Object.freeze(['blend']),
  w: Object.freeze(['divide', 'label', 'read', 'write']),
  y: Object.freeze(['sort']),
  r: Object.freeze(['read', 'write']),
});


export function makeKey(prefix, id, mode) {
  if (!Object.hasOwn(PREFIXES, prefix)) throw new Error(`makeKey: unknown prefix ${JSON.stringify(prefix)}`);
  if (typeof id !== 'string' || id === '') throw new Error('makeKey: the id must be a non-empty string');
  if (typeof mode !== 'string' || mode === '' || mode.includes('#')) throw new Error('makeKey: the mode must be a non-empty string without "#"');
  return `${prefix}:${id}#${mode}`;
}

export function parseKey(key) {
  if (typeof key !== 'string') return null;
  const colon = key.indexOf(':');
  const hash = key.lastIndexOf('#');
  if (colon < 1 || hash < colon + 2 || hash === key.length - 1) return null;
  return { prefix: key.slice(0, colon), id: key.slice(colon + 1, hash), mode: key.slice(hash + 1) };
}

export const isKnownMode = (prefix, mode) => Object.hasOwn(PREFIXES, prefix) && PREFIXES[ (prefix)].includes(mode);
