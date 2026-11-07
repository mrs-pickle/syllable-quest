const VERSION = new URL(self.location.href).searchParams.get('v');
const CACHE = `sq-${VERSION}`;
const PACK_LIST = 'sq-pack-list.json';
const packCache = (pack) => `sq-pack-${pack.id}-${pack.hash}`;
const PACK_PART = /^[a-z0-9-]{1,64}$/;
const BATCH = 4;
const GONE = new Set([404, 410]);

const urlOf = (file) => new URL(file.split('/').map(encodeURIComponent).join('/'), self.location.href).href;

async function save(cache, file) {
  const url = urlOf(file);
  if (await cache.match(url)) return;
  const response = await fetch(`${url}?v=${encodeURIComponent(VERSION)}`, { cache: 'no-cache' });
  if (GONE.has(response.status)) {
    console.warn(`sw.js: ${file}: HTTP ${response.status}, not cached`);
    return;
  }
  if (!response.ok) throw new Error(`sw.js: ${file}: HTTP ${response.status}, the install stops and is tried again later`);
  await cache.put(url, response);
}

async function precache() {
  if (!VERSION) throw new Error('sw.js: register it as sw.js?v=<the version in precache.json>');
  const response = await fetch(urlOf('precache.json'), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`sw.js: precache.json: HTTP ${response.status}`);
  const { version, files, packs } = await response.json();
  if (version !== VERSION) throw new Error(`sw.js: precache.json is now version ${version}, not ${VERSION}; the page registers that one next`);
  if (!Array.isArray(files)) throw new Error('sw.js: precache.json has no list of files');
  const cache = await caches.open(CACHE);
  const parts = ([]);
  if (Array.isArray(packs)) {
    for (const pack of packs) {
      if (!PACK_PART.test(String(pack?.id)) || !PACK_PART.test(String(pack?.hash)) || !Array.isArray(pack.files)) throw new Error('sw.js: precache.json has a pack that cannot be read');
      parts.push({ name: packCache(pack), files: pack.files });
    }
    await cache.put(urlOf(PACK_LIST), Response.json(parts.map((part) => part.name)));
  } else {
    parts.push({ name: CACHE, files });
  }
  for (const part of parts) {
    const into = part.name === CACHE ? cache : await caches.open(part.name);
    for (let i = 0; i < part.files.length; i += BATCH) {
      const results = await Promise.allSettled(part.files.slice(i, i + BATCH).map((file) => save(into, file)));
      const stopped = results.find((result) => result.status === 'rejected');
      if (stopped) throw stopped.reason;
    }
  }
  const latest = await fetch(urlOf('precache.json'), { cache: 'no-cache' });
  const now = latest.ok ? (await latest.json()).version : null;
  if (now !== VERSION) throw new Error(`sw.js: precache.json is now version ${now}, not ${VERSION}; the page registers that one next`);
  const kept = await Promise.all([CACHE, ...parts.map((part) => part.name)].map(async (name) => [name, await caches.has(name)]));
  const lost = kept.find(([, has]) => !has);
  if (lost) throw new Error(`sw.js: ${lost[0]} was deleted during the install`);
}

let packList = null;
function packCaches() {
  packList ??= caches.match(urlOf(PACK_LIST), { cacheName: CACHE })
    .then((hit) => (hit ? hit.json() : []))
    .then((names) => (Array.isArray(names) ? names.filter((name) => typeof name === 'string' && name.startsWith('sq-pack-')) : []))
    .catch(() => []);
  return packList;
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'skip-waiting') return;
  const takingOver = self.skipWaiting();
  event.waitUntil?.(takingOver);
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CACHE, ...await packCaches()]);
    for (const name of await caches.keys()) {
      if (name.startsWith('sq-') && !keep.has(name)) await caches.delete(name);
    }
  })());
});

async function cached(request) {
  let key = (request);
  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    url.search = '';
    if (url.pathname.endsWith('/')) url.pathname += 'index.html';
    key = url.href;
  }
  for (const name of [CACHE, ...await packCaches()]) {
    const hit = await caches.match(key, { cacheName: name, ignoreVary: true });
    if (hit) return hit;
  }
  return undefined;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const reply = cached(request).then((hit) => hit ?? fetch(request));
  event.respondWith(request.url === urlOf('precache.json') ? reply.catch(() => Response.json({})) : reply);
});
