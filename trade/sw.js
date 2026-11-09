const CACHE = "worknic-beta-static-v6",
  OFFLINE = "/trade/offline.html",
  ASSETS = [
    OFFLINE,
    "/trade/beta.css",
    "/trade/beta-common.js",
    "/trade/aftercare-ui.js",
    "/trade/beta.js",
    "/trade/entry-intent.js",
    "/trade/pwa.js",
    "/trade/app-icon.svg",
    "/assets/logo.png",
    "/assets/Spoqa-Regular.woff2",
  ];
self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("worknic-beta-static-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (
    u.origin !== self.location.origin ||
    e.request.method !== "GET" ||
    u.pathname.startsWith("/api/") ||
    u.pathname.includes("admin")
  )
    return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (ASSETS.includes(u.pathname))
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
