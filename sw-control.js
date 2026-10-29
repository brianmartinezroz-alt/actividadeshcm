/* HCM · Control de clase — guarda la app para que abra al instante */
var CACHE = 'hcm-control-v1';
var BASICOS = ['control.html','canal.js','control.webmanifest','control-192.png','control-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BASICOS); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // el servidor del HCM nunca se guarda
  if (u.pathname.indexOf('servidor.json') >= 0) return;                      // la dirección siempre fresca
  e.respondWith(
    fetch(e.request).then(function (r) {
      if (r && r.ok) { var copia = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copia); }); }
      return r;
    }).catch(function () { return caches.match(e.request); })
  );
});
