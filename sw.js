// Minimal offline-first service worker. Caches the shell + stories so the app
// keeps working without network. Bumping CACHE_VERSION invalidates old caches.

const CACHE_VERSION = "v2";
const CACHE_NAME = `chinese-reader-${CACHE_VERSION}`;
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./src/app.js",
  "./src/lib/speech.js",
  "./src/lib/storage.js",
  "./src/lib/progress.js",
  "./src/lib/stories.js",
  "./src/components/storyPicker.js",
  "./src/components/storyReader.js",
  "./src/components/pinyinToggle.js",
  "./src/components/playbackControls.js",
  "./src/components/recorder.js",
  "./src/components/recordingsList.js",
  "./src/components/dailyTimer.js",
  "./stories/index.json",
  "./stories/p3-xiaomao-diaoyu.json",
  "./stories/p4-wuya-heshui.json",
  "./stories/p5-shouzhu-daitu.json",
  "./stories/p6-zixiang-maodun.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Network-first for HTML so updates propagate; cache-first for the rest.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
