// Service worker: rede primeiro (sempre a versão mais nova) e cache como reserva offline.

const CACHE = 'falaplaca-v5';
const ARQUIVOS = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/audio.js',
  'js/bluetooth.js',
  'js/conexao.js',
  'js/config.js',
  'js/google.js',
  'js/icones.js',
  'js/layout.js',
  'js/protocolo.js',
  'js/sdcard.js',
  'js/serial.js',
  'js/store.js',
  'js/zip.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE).then((c) => c.put(request, copia));
        return resposta;
      })
      .catch(() => caches.match(request).then((r) => r ?? caches.match('index.html'))),
  );
});
