const STORY_LANDS = Object.freeze(['closed', 'open', 'vce', 'team', 'r', 'le']);

function text(what, v) {
  if (typeof v !== 'string' || v === '') throw new Error(`voice id: ${what} must be a non-empty string`);
  return v;
}

function count(k) {
  if (!Number.isInteger(k) || (k) < 1) throw new Error('voice id: the number must be a whole number from 1');
  return (k);
}

export const wordId = (word) => `w.${text('word', word)}`;
export const madeUpId = (word) => `n.${text('word', word)}`;
export const meaningId = (word) => `m.${text('word', word)}`;
export const syllableId = (syllable, type) => `sy.${text('syllable', syllable)}.${text('type', type)}`;
export const sentenceId = (id) => `s.${text('sentence id', id)}`;
export const passageSentenceId = (passageId, k) => `ps.${text('passage id', passageId)}.${count(k)}`;
export const redId = (red) => `r.${text('red word', red)}`;
export const redSentenceId = (red) => `rs.${text('red word', red)}`;
export const soundId = (sound) => `p.${text('sound', sound)}`;

export const stageSlug = (id) => text('stage id', id).replaceAll('.', '-');

export function storyId(land, part, n) {
  if (!STORY_LANDS.includes(land)) throw new Error(`voice id: unknown story land ${JSON.stringify(land)}`);
  return `v.story-${land}.${stageSlug(part)}.${count(n)}`;
}

export const STATIC_IDS = [];
