// --- Service Worker Mejorado para Funcionalidad Offline Robusta ---

const CACHE_NAME = 'ventas-app-cache-v5'; // Versión actualizada para forzar la recarga

// Lista de archivos locales esenciales para el funcionamiento de la aplicación (App Shell)
// Se han removido las URLs externas para evitar errores de CORS durante la instalación.
const urlsToCache = [
    './', // Alias para index.html
    './index.html',
    './inventario.js',
    './catalogo.js',
    './sincronizacion.js',
    './clientes.js',
    './ventas.js',
    './manifest.json',
    './images/icons/icon-192x192.png',
    './images/icons/icon-512x512.png',
    './images/fondo.png',
    './images/cervezayvinos.png',
    './images/maltinypepsi.png',
    './images/alimentospolar.png',
    './images/p&g.png'
    // Las URLs de terceros (Tailwind, Firebase, etc.) se cachearán dinámicamente con la estrategia de fetch.
];

// Evento 'install': Se dispara cuando el Service Worker se instala por primera vez.
self.addEventListener('install', event => {
    console.log('[Service Worker] Instalando...');
    self.skipWaiting(); // Forzar la activación inmediata
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Guardando App Shell local en caché.');
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('[Service Worker] Falló el precaching del App Shell:', error);
            })
    );
});

// Evento 'activate': Se dispara cuando el nuevo Service Worker se activa.
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activando...');
    const cacheWhitelist = [CACHE_NAME];
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log(`[Service Worker] Eliminando caché antigua: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Evento 'fetch': Se dispara para cada solicitud de red.
self.addEventListener('fetch', event => {
    // No interceptamos solicitudes que no sean GET
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Para las solicitudes de Firebase, siempre vamos a la red primero,
    // ya que necesitan estar actualizadas. No las servimos desde la caché si la red falla.
    if (event.request.url.includes('firestore.googleapis.com')) {
        return;
    }

    // Estrategia: Network falling back to cache.
    // Intenta obtener el recurso de la red. Si tiene éxito, lo actualiza en la caché.
    // Si falla, intenta servirlo desde la caché.
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return fetch(event.request)
                .then(networkResponse => {
                    // Si la respuesta de red es válida, la usamos y actualizamos la caché
                    console.log(`[Service Worker] Guardando en caché: ${event.request.url}`);
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                })
                .catch(() => {
                    // Si la red falla, intentamos servir desde la caché
                    return cache.match(event.request);
                });
        })
    );
});
