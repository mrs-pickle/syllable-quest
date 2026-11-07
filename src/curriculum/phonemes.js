const vowel = (ipa, arpabet, label) => Object.freeze({ ipa, arpabet: Object.freeze(arpabet), kind: 'vowel', continuous: true, label });

const consonant = (ipa, arpabet, continuous, label) =>
  Object.freeze({ ipa, arpabet: Object.freeze(arpabet), kind: 'consonant', continuous, label });

export const PHONEMES = Object.freeze({
  a: vowel('æ', ['AE'], '/ă/'),
  e: vowel('ɛ', ['EH'], '/ĕ/'),
  i: vowel('ɪ', ['IH'], '/ĭ/'),
  o: vowel('ɑ', ['AA'], '/ŏ/'),
  u: vowel('ʌ', ['AH'], '/ŭ/'),
  A: vowel('eɪ', ['EY'], '/ā/'),
  E: vowel('i', ['IY'], '/ē/'),
  I: vowel('aɪ', ['AY'], '/ī/'),
  O: vowel('oʊ', ['OW'], '/ō/'),
  U: vowel('ju', ['Y UW'], '/yū/'),
  oo: vowel('u', ['UW'], '/ū/ (moon)'),
  uu: vowel('ʊ', ['UH'], '/oo/ (book)'),
  aw: vowel('ɔ', ['AO', 'AA'], '/aw/'),
  ow: vowel('aʊ', ['AW'], '/ow/'),
  oy: vowel('ɔɪ', ['OY'], '/oi/'),
  ar: vowel('ɑɹ', ['AA R'], '/ar/'),
  or: vowel('ɔɹ', ['AO R'], '/or/'),
  er: vowel('ɝ', ['ER'], '/er/'),
  air: vowel('ɛɹ', ['EH R'], '/air/ (chair)'),
  ear: vowel('ɪɹ', ['IH R'], '/ear/ (near)'),
  '@': vowel('ə', ['AH'], '/ə/ (schwa)'),

  b: consonant('b', ['B'], false, '/b/'),
  ch: consonant('tʃ', ['CH'], false, '/ch/'),
  d: consonant('d', ['D'], false, '/d/'),
  dh: consonant('ð', ['DH'], true, '/th/ (voiced, this)'),
  f: consonant('f', ['F'], true, '/f/'),
  g: consonant('g', ['G'], false, '/g/'),
  h: consonant('h', ['HH'], true, '/h/'),
  j: consonant('dʒ', ['JH'], false, '/j/'),
  k: consonant('k', ['K'], false, '/k/'),
  l: consonant('l', ['L'], true, '/l/'),
  m: consonant('m', ['M'], true, '/m/'),
  n: consonant('n', ['N'], true, '/n/'),
  ng: consonant('ŋ', ['NG'], true, '/ng/'),
  p: consonant('p', ['P'], false, '/p/'),
  r: consonant('ɹ', ['R'], true, '/r/'),
  s: consonant('s', ['S'], true, '/s/'),
  sh: consonant('ʃ', ['SH'], true, '/sh/'),
  t: consonant('t', ['T'], false, '/t/'),
  th: consonant('θ', ['TH'], true, '/th/ (unvoiced, thin)'),
  v: consonant('v', ['V'], true, '/v/'),
  w: consonant('w', ['W'], true, '/w/'),
  y: consonant('j', ['Y'], true, '/y/'),
  z: consonant('z', ['Z'], true, '/z/'),
  zh: consonant('ʒ', ['ZH'], true, '/zh/'),

  '': Object.freeze({ ipa: '', arpabet: Object.freeze(['']), kind: 'silent', continuous: false, label: 'silent' }),
});

export function phonemeCodes(p) {
  const s = String(p ?? '').trim();
  return s ? s.split(/\s+/) : [];
}

export function soundKind(p) {
  const codes = phonemeCodes(p);
  if (codes.length === 0) return 'silent';
  if (!codes.every(c => Object.hasOwn(PHONEMES, c))) return 'unknown';
  return codes.some(c => PHONEMES[c].kind === 'vowel') ? 'vowel' : 'consonant';
}

export function consonantClusters(segs) {
  const clusters = [];
  let run = [];
  const closeRun = () => { if (run.length >= 2) clusters.push(run); run = []; };
  segs.forEach(([, p], i) => {
    const kind = soundKind(p);
    if (kind === 'consonant') run.push(i); else if (kind !== 'silent') closeRun();
  });
  closeRun();
  return clusters;
}
