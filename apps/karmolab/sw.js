"use strict";
(() => {
  // src/sw.ts
  var ctx = self;
  var BUILD = true ? "20260805222333" : "dev";
  var CACHE_NAME = `karmolab-${BUILD}`;
  var APP_SHELL = ["/karmolab/", "/apps/karmolab/manifest.json"];
  function isFreshCritical(url, req) {
    if (req.mode === "navigate") return true;
    if (url.origin !== ctx.location.origin) return false;
    return url.pathname.startsWith("/apps/karmolab/js/") || url.pathname.startsWith("/apps/karmolab/css/") || url.pathname.startsWith("/apps/karmolab/data/") || url.pathname.startsWith("/apps/karmolab/world/") || url.pathname.endsWith("/manifest.json");
  }
  ctx.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => void 0)));
  });
  ctx.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => ctx.clients.claim())
    );
  });
  ctx.addEventListener("message", (event) => {
    if (event.data === "SKIP_WAITING") void ctx.skipWaiting();
    if (event.data === "GET_BUILD") event.source?.postMessage({ type: "BUILD", build: BUILD });
  });
  ctx.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET" || req.headers.has("range")) return;
    let url;
    try {
      url = new URL(req.url);
    } catch {
      return;
    }
    if (!url.protocol.startsWith("http")) return;
    if (url.pathname.includes("/api/") || url.href.includes("tauri")) return;
    if (isFreshCritical(url, req)) {
      event.respondWith(
        fetch(req).then((res) => {
          if (res && res.ok && url.origin === ctx.location.origin) {
            const clone = res.clone();
            void caches.open(CACHE_NAME).then((c) => c.put(req, clone).catch(() => void 0));
          }
          return res;
        }).catch(() => caches.match(req).then((cached) => cached || Response.error()))
      );
      return;
    }
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.ok && url.origin === ctx.location.origin) {
            const clone = res.clone();
            void caches.open(CACHE_NAME).then((c) => c.put(req, clone).catch(() => void 0));
          }
          return res;
        }).catch(() => cached || Response.error());
        return cached || network;
      })
    );
  });
})();
