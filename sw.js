// sw.js — minimal service worker: offline use + fast loading for the
// home-screen app. Bump VERSION on every deploy so installed copies pick
// up the new files instead of serving a stale cache forever.
const VERSION = "v10";
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
  "./today.js",
  "./search.js",
  "./money.js",
  "./report.js",
  "./reminders.js",
  "./welcome.js",
  "./drag.js",
  "./reminder-engine.js",
  "./push.js",
  "./privacy.html",
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

// A push reminder from the push-reminders server (see push.js). It arrives
// even when no Venture Tasks window is open; the browser starts this
// worker just long enough to show it.
self.addEventListener("push", (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch (e) {
    msg = { title: "Venture Tasks", body: event.data ? event.data.text() : "" };
  }
  const title = msg.title || "Venture Tasks";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: msg.body || "",
      tag: msg.tag || undefined,
      renotify: !!msg.tag,
      icon: "icon-192.png",
      badge: "icon-192.png",
      data: { url: msg.url || "./" }
    })
  );
});

// Tapping a reminder notification: bring an already-open copy of the app
// to the front if there is one, otherwise open it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.startsWith(self.registration.scope));
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })
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
