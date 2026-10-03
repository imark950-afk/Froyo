// Froyo on the go: lets the app install on phones and open without a connection.
// Only the app's own files are cached. Sign-in and database requests always go
// straight to the network and are never stored.
const CACHE = "froyo-v1";
const SHELL = ["./", "index.html", "app.css", "app.js", "qr.js", "privacy.html", "icon.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first, so updates show straight away; the saved copy is only used offline.
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, {ignoreSearch: true}).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
