const CACHE_NAME = 'orbis-cache-v2';
const APP_SHELL = [
  './index.html',
  './manifest.webmanifest',
  './favicon_32.png',
  './orbis_icon_180.png',
  './orbis_icon_192.png',
  './orbis_icon_512.png',
  './orbis_icon_512_maskable.png'
];

// CDN externes utilisés par l'app (Tailwind, Chart.js, jsPDF, Mammoth, Google Fonts).
// On les met aussi en cache pour que l'interface reste utilisable hors ligne.
// Supabase n'est volontairement PAS dans cette liste : les données doivent toujours
// passer par le réseau pour rester à jour (voir le filtre plus bas).
const RUNTIME_ALLOWED_ORIGINS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache.add() individuel (et non cache.addAll) : si un seul fichier échoue
      // (ex. une icône manquante sur le serveur), les autres sont quand même mis en
      // cache — avec addAll, un seul échec annule TOUT le cache, silencieusement.
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const allowedExternal = RUNTIME_ALLOWED_ORIGINS.includes(url.origin);

  // Tout le reste (Supabase : API, auth, storage, realtime, et tout autre domaine)
  // passe toujours directement par le réseau, jamais par le cache.
  if (!sameOrigin && !allowedExternal) return;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((response) => {
          // Les scripts/CSS chargés depuis un CDN sans l'attribut "crossorigin"
          // reviennent en réponse "opaque" (status 0, illisible) : on les met quand
          // même en cache, sinon rien venant des CDN externes ne serait jamais gardé.
          if (response && (response.ok || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return response;
        })
        .catch(() => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return cached || network;
    })
  );
});
