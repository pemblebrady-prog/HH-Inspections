// House & Home portal service worker: lets the portal open and the form work with no signal.
// Pages: network first (falls back to the copy saved on the phone). App files and Help pictures: saved copy first.
// Submitting still needs signal; the form saves everything on the phone and finishes when signal comes back.
const PAGES = "hh-pages-v1", STATIC = "hh-static-v1", API = "hh-api-v1";
const KEEP = [PAGES, STATIC, API];
const OFFLINE = "/offline.html";
// GET API calls the form needs when it opens (saved so it opens offline).
const API_OK = [/^\/api\/companies$/, /^\/api\/orders\/mine$/, /^\/api\/orders\/prefill$/];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE, "/manifest.webmanifest", "/icons/icon-192.png"])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isStatic = (p) => p.startsWith("/_next/static/") || p.startsWith("/icons/") || /^\/help\/[^/]+\.(jpg|png)$/.test(p) || p === "/apple-touch-icon.png" || p === "/manifest.webmanifest";
const okToSave = (res) => res && res.ok && !res.redirected && res.type === "basic";

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]); // oldest first
}

async function cacheFirst(req) {
  const hit = await caches.match(req, { cacheName: STATIC });
  if (hit) return hit;
  const res = await fetch(req);
  if (okToSave(res)) { const c = await caches.open(STATIC); c.put(req, res.clone()); trim(STATIC, 400); }
  return res;
}

// Weak signal under a home: give the network a few seconds, then use the saved copy.
async function networkFirst(req, cacheName, ms) {
  const net = fetch(req);
  try {
    const res = await withTimeout(net, ms);
    if (okToSave(res)) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch (err) {
    const saved = (await caches.match(req, { cacheName })) || (await caches.match(req, { cacheName, ignoreSearch: true }));
    if (saved) {
      // Keep the slow request going so the saved copy is fresh next time.
      net.then(async (res) => { if (okToSave(res)) (await caches.open(cacheName)).put(req, res.clone()); }).catch(() => {});
      return saved;
    }
    try { return await net; } catch { throw err; }
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p === "/sw.js" || p.startsWith("/auth/") || p.startsWith("/api/auth")) return;

  if (isStatic(p)) { e.respondWith(cacheFirst(req)); return; }

  if (req.mode === "navigate") {
    // Not saved on this phone: a "No signal" page with a button back to the form.
    e.respondWith(networkFirst(req, PAGES, 5000).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
    return;
  }

  if (p.startsWith("/api/") && API_OK.some((r) => r.test(p))) {
    e.respondWith(networkFirst(req, API, 6000).catch(() =>
      new Response(JSON.stringify({ ok: false, offline: true }), { status: 503, headers: { "Content-Type": "application/json" } })));
  }
  // Everything else (including in-app page data) goes to the network as normal.
});

// From the page: save these pages/files now ("warm"), or forget saved pages on sign-out ("clear").
self.addEventListener("message", (e) => {
  const msg = e.data || {};
  if (msg.type === "warm" && Array.isArray(msg.urls)) {
    e.waitUntil((async () => {
      for (const u of msg.urls.slice(0, 300)) {
        try {
          const url = new URL(u, self.location.origin);
          if (url.origin !== self.location.origin) continue;
          const name = isStatic(url.pathname) ? STATIC : url.pathname.startsWith("/api/") ? API : PAGES;
          if (name === STATIC && (await caches.match(url.href, { cacheName: STATIC }))) continue;
          const res = await fetch(url.href, { credentials: "same-origin" });
          if (okToSave(res)) await (await caches.open(name)).put(url.href, res);
        } catch { /* offline or gone: skip */ }
      }
      trim(STATIC, 400);
    })());
  }
  if (msg.type === "clear") e.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(API)]));
});
