/**
 * ⚠️ SERVICE WORKER PARA DESARROLLO ⚠️
 * 
 * Este archivo SOLO se usa en modo desarrollo (npm run dev)
 * 
 * EN PRODUCCIÓN (npm run build):
 * - Workbox REEMPLAZA COMPLETAMENTE este archivo
 * - Genera un nuevo sw.js automáticamente en public/sw.js
 * - El nuevo archivo incluye toda la configuración de next.config.ts
 * - Este archivo actual se IGNORA completamente
 * 
 * IMPORTANTE: 
 * - Solo cachea /offline y sus subrutas
 * - Las páginas online NO se cachean
 * - En producción, la configuración viene de next.config.ts (GenerateSW)
 */

const CACHE_NAME = 'activos-fijos-dev-cache-v1';

// Solo cachear páginas offline y assets estáticos necesarios
const OFFLINE_PAGES = [
  '/offline',
  '/offline/reporte-activos-fijos',
  '/offline/gestion-reportes',
];

const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/logo-negativo.webp', // Logo del sidebar offline
];

// Evento de instalación
self.addEventListener('install', (event) => {
  console.log('[SW Dev] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW Dev] Caching offline pages and static assets...');
      // Cachear solo páginas offline y assets estáticos
      const urlsToCache = [...OFFLINE_PAGES, ...STATIC_ASSETS];
      return cache.addAll(urlsToCache).catch((error) => {
        console.warn('[SW Dev] Failed to cache some assets:', error);
        // No fallar si algunos assets no se pueden cachear
      });
    })
  );

  // Forzar activación inmediata
  self.skipWaiting();
});

// Evento de activación
self.addEventListener('activate', (event) => {
  console.log('[SW Dev] Activating service worker...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW Dev] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tomar control inmediatamente
      return self.clients.claim();
    })
  );
});

// Evento de fetch
self.addEventListener('fetch', (event) => {
  // Solo manejar requests GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const pathname = url.pathname;

  // No cachear requests de API
  if (pathname.includes('/api/') ||
      pathname.includes('/graphql') ||
      url.hostname.includes('localhost:8082')) {
    return;
  }

  // Si es una página offline, usar NetworkFirst con fallback a cache
  if (pathname.startsWith('/offline')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Si la respuesta es exitosa, cachearla
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Si falla la red, servir desde cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Si no hay cache, redirigir a /offline
            if (event.request.mode === 'navigate') {
              return caches.match('/offline');
            }
            return new Response('', { status: 503, statusText: 'Service Unavailable' });
          });
        })
    );
    return;
  }

  // Para páginas ONLINE: NetworkOnly (nunca cachear)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Si falla la red en una página online, redirigir a /offline
        return caches.match('/offline').then((offlinePage) => {
          if (offlinePage) {
            return offlinePage;
          }
          return new Response('Sin conexión. Esta página requiere internet.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        });
      })
    );
    return;
  }

  // Para assets estáticos (CSS, JS, imágenes, fonts): CacheFirst
  if (event.request.url.match(/\.(css|js|png|jpg|jpeg|svg|ico|woff|woff2)$/) ||
      pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Para todo lo demás: NetworkOnly
  event.respondWith(fetch(event.request));
});

// Evento de mensaje (para comunicación con la app)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW Dev] Skipping waiting...');
    self.skipWaiting();
  }
});
