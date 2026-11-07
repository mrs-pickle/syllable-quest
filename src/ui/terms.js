export const TYPES = Object.freeze(['closed', 'open', 'vce', 'team', 'r', 'le']);

export const TERM_SETS = Object.freeze(['story', 'classroom']);

export const TERMS = Object.freeze({
  story: Object.freeze({ closed: 'Shut Door', open: 'Open Door', vce: 'Silent E', team: 'Two Oars', r: 'Bossy R', le: 'Little Tail' }),
  classroom: Object.freeze({ closed: 'closed', open: 'open', vce: 'vowel-consonant-e', team: 'vowel team', r: 'r-controlled', le: 'consonant-le' }),
});

export const LAND_NAMES = Object.freeze({
  story: Object.freeze({
    closed: 'Closed Canyon', open: 'Open Sky Isles', vce: 'Silent-E Forest', team: 'Vowel Team Harbor',
    r: 'Bossy-R Mountains', le: 'Little Tail Lake', city: 'City of Builders',
  }),
  classroom: Object.freeze({
    closed: 'Closed Canyon', open: 'Open Syllable Isles', vce: 'Vowel-Consonant-E Forest', team: 'Vowel Team Harbor',
    r: 'R-Controlled Mountains', le: 'Consonant-le Lake', city: 'City of Builders',
  }),
});

export const termSet = (terms) => (terms === 'classroom' ? 'classroom' : 'story');

export function termFor(type, terms) {
  if (!TYPES.includes(type)) throw new RangeError(`Not a syllable type: "${type}"`);
  return TERMS[termSet(terms)][type];
}

export function landName(land, terms) {
  if (!Object.hasOwn(LAND_NAMES.story, land)) throw new RangeError(`Not a land: "${land}"`);
  return LAND_NAMES[termSet(terms)][land];
}

export function coachText(line, terms) {
  if (typeof line === 'string') return line;
  const l = (line);
  if (termSet(terms) === 'classroom' && typeof l?.classroom === 'string' && l.classroom !== '') return l.classroom;
  return typeof l?.text === 'string' ? l.text : '';
}
