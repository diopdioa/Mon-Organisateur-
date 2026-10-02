// Orbis — Service Worker
// Trois rôles : (1) mettre l'app en cache pour qu'elle marche hors ligne,
// (2) recevoir et afficher les notifications push envoyées par le serveur
// (rappels), (3) réagir au clic sur une notification pour rouvrir l'app.

const CACHE_NAME = 'orbis-cache-v8';
const APP_SHELL = [
  './index.html',
  './tailwind.css',   // Tailwind compilé (remplace l'ancien CDN cdn.tailwindcss.com)
  './styles.css',     // styles personnalisés d'Orbis
  './app.js',         // toute la logique de l'app
  './manifest.webmanifest',
  './favicon_32.png',
  './orbis_icon_180.png',
  './orbis_icon_192.png',
  './orbis_icon_512.png',
  './orbis_icon_512_maskable.png'
];

// CDN externes encore utilisés par l'app (Supabase JS, Chart.js, jsPDF, Mammoth,
// Google Fonts). On les met aussi en cache pour que l'interface reste utilisable
// hors ligne. Supabase (l'API, pas la librairie JS) n'est volontairement PAS ici :
// les données doivent toujours passer par le réseau pour rester à jour (filtre plus bas).
const RUNTIME_ALLOWED_ORIGINS = [
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

// ==== Notifications push (rappels) ====
// Déclenché quand le serveur (une Edge Function Supabase, voir
// push_reminders_setup.sql et supabase_send_push.ts) envoie une notification
// via le Web Push Protocol — y compris quand Orbis n'est pas ouvert.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { /* payload texte brut ou vide : on garde les valeurs par défaut */ }

  const title = payload.title || 'Orbis — rappel';
  const options = {
    body: payload.body || '',
    icon: './orbis_icon_192.png',
    badge: './favicon_32.png',
    // "tag" regroupe les notifications d'un même rappel plutôt que d'empiler des doublons
    tag: payload.tag || 'orbis-rappel',
    renotify: true,
    data: { url: payload.url || './index.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic sur la notification : si une fenêtre Orbis est déjà ouverte, on la met au
// premier plan ; sinon on en ouvre une nouvelle.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
