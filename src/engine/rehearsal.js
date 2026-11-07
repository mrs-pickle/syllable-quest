export const REHEARSAL_OFFSETS = Object.freeze([0, 3, 8]);
export const REHEARSAL_NEXT_START = 4;
const OFFSETS = REHEARSAL_OFFSETS;
const NEXT_START = REHEARSAL_NEXT_START;

export function interleave(newKeys, knownKeys, rng) {
  const fresh = [...new Set(newKeys)];
  const freshSet = new Set(fresh);
  const pool = [...new Set(knownKeys)].filter(key => !freshSet.has(key));

  const placed = new Map();
  let start = 0;
  let end = 0;
  for (const key of fresh) {
    while (OFFSETS.some(offset => placed.has(start + offset))) start++;
    for (const offset of OFFSETS) placed.set(start + offset, key);
    end = start + OFFSETS[OFFSETS.length - 1] + 1;
    start += NEXT_START;
  }

  let queue = [];
  const nextKnown = (previous) => {
    if (pool.length === 0) return undefined;
    if (queue.length === 0) {
      queue = rng.shuffle(pool);
      if (queue.length > 1 && queue[0] === previous) queue.push( (queue.shift()));
    }
    return queue.shift();
  };

  const out = [];
  for (let position = 0; position < end; position++) {
    const key = placed.get(position) ?? nextKnown(out[out.length - 1]);
    if (key !== undefined) out.push(key);
  }
  return out;
}
