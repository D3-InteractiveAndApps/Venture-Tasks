// sw.js — minimal service worker: offline use + fast loading for the
// home-screen app. Bump VERSION on every deploy so installed copies pick
// up the new files instead of serving a stale cache forever.
const VERSION = "v6";
const CACHE_NAME = `venture-tasks-${VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./store.js",
  "./dates.js",
  "./ai.js",
  "./claude.js",
  "./openai.js",
  "./gemini.js",
  "./supabase-config.js",
  "./sync.js",
  "./ui.js",
  "./voice.js",
  "./holidays.js",
  "./categorize.js",
  "./ics.js",
  "./settings.js",
  "./theme.js",
  "./themes.js",
  "./undo.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate, same-origin GETs only: serve from cache
// instantly (so the app opens with no signal at all), while quietly
// re-fetching in the background to keep the cache current for next time.
// Everything else — Google Fonts, a Supabase API call — just goes
// straight to the network; this app's real data already lives in
// localStorage or Supabase, never in this cache.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
