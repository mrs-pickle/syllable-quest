export const LAND_IDS = Object.freeze(['closed', 'open', 'vce', 'team', 'r', 'le']);

export const VOICE_AREAS = Object.freeze([
  'hub', 'map', 'story-closed', 'story-open', 'story-vce', 'story-team', 'story-r', 'story-le', 'soundcheck', 'discovery',
  'bridge', 'clansort', 'trickster', 'wordbook', 'storypage', 'break', 'placement', 'grownup', 'praise', 'session',
]);


const perLand = (dir) => LAND_IDS.map((land) => [land, `content/${dir}/${land}.json`, () => []]);

const FILES = Object.freeze([
  ['syllables', 'content/syllables.json', () => []],
  ['redSentences', 'content/red-sentences.json', () => []],
  ['discovery', 'content/discovery.json', () => ({})],
  ['coach', 'content/coach.json', () => ({})],
  ['lands', 'content/lands.json', () => []],
  ['names', 'content/names.json', () => []],
  ['blocklist', 'content/blocklist.json', () => ({ format: 'sha256-lower', entries: [] })],
]);

export const CONTENT_PATHS = Object.freeze([
  ...FILES.map(([, path]) => path),
  ...['words', 'red-words', 'passages', 'dictation', 'story'].flatMap((dir) => LAND_IDS.map((land) => `content/${dir}/${land}.json`)),
  ...VOICE_AREAS.map((area) => `content/voice/${area}.json`),
]);

export async function loadContent(readJson) {
  const read = async (path) => {
    try {
      return { ok: true, value: await readJson(path) };
    } catch (err) {
      if (err instanceof SyntaxError) throw new SyntaxError(`${path}: ${err.message}`, { cause: err });
      return { ok: false };
    }
  };
  const missing = [];
  const valueOf = (path, r, fallback) => {
    if (!r.ok) missing.push(path);
    return r.ok && r.value != null ? r.value : fallback();
  };
  const badShape = [];
  const list = (v, path) => {
    if (Array.isArray(v)) return v;
    badShape.push(`${path}: must be a list`);
    return [];
  };
  const object = (v, path) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) return v;
    badShape.push(`${path}: must be an object`);
    return {};
  };

  const single = FILES.map(([key, path, fallback]) => ([key, path, fallback]));
  const groups = (['words', 'red-words', 'passages', 'dictation']).map((dir) => [dir, perLand(dir)]);
  const stories = LAND_IDS.map((land) => ([land, `content/story/${land}.json`]));
  const voices = VOICE_AREAS.map((area) => ([area, `content/voice/${area}.json`]));

  const [singles, landFiles, storyFiles, voiceFiles] = await Promise.all([
    Promise.all(single.map(([, path]) => read(path))),
    Promise.all(groups.map(([, files]) => Promise.all(files.map(([, path]) => read(path))))),
    Promise.all(stories.map(([, path]) => read(path))),
    Promise.all(voices.map(([, path]) => read(path))),
  ]);

  const loaded = {};
  single.forEach(([key, path, fallback], i) => { loaded[key] = valueOf(path, singles[i], fallback); });

  const merged = {};
  groups.forEach(([dir, files], g) => {
    merged[dir] = files.flatMap(([, path, fallback], i) => list(valueOf(path, landFiles[g][i], fallback), path));
  });
  const story = {};
  stories.forEach(([land, path], i) => { story[land] = object(valueOf(path, storyFiles[i], () => ({})), path); });
  const voice = {};
  voices.forEach(([, path], i) => {
    const lines = valueOf(path, voiceFiles[i], () => ({}));
    Object.assign(voice, object(lines, path));
  });

  const words = merged.words;
  return ({
    words,
    byWord: new Map(words.map((w) => [w.w, w])),
    syllables: list(loaded.syllables, 'content/syllables.json'),
    red: merged['red-words'],
    redSentences: list(loaded.redSentences, 'content/red-sentences.json'),
    dictation: merged.dictation,
    passages: merged.passages,
    story,
    discovery: object(loaded.discovery, 'content/discovery.json'),
    coach: object(loaded.coach, 'content/coach.json'),
    lands: list(loaded.lands, 'content/lands.json'),
    names: list(loaded.names, 'content/names.json'),
    voice,
    blocklist: loaded.blocklist,
    missing,
    badShape,
  });
}
