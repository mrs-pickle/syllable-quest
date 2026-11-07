import { createHash } from 'node:crypto';

export const BLOCKLIST_FORMAT = 'sha256-lower';

const MIN_SUBSTRING = 3;


export function hashWord(w) {
  return createHash('sha256').update(w.toLowerCase()).digest('hex');
}

export function isBlocked(word, blocklist) {
  const exact = new Set();
  const sub = new Set();
  for (const e of Array.isArray(blocklist?.entries) ? blocklist.entries : []) {
    if (typeof e?.h !== 'string') continue;
    exact.add(e.h);
    if (e.sub === true) sub.add(e.h);
  }
  if (exact.size === 0) return false;

  const w = word.toLowerCase();
  if (exact.has(hashWord(w))) return true;
  if (sub.size === 0) return false;
  for (let len = MIN_SUBSTRING; len <= w.length; len++) {
    for (let start = 0; start + len <= w.length; start++) {
      if (sub.has(hashWord(w.slice(start, start + len)))) return true;
    }
  }
  return false;
}
