// neonet/clients/web/src/sw.js

const CACHE_NAME = 'neonet-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/404.html',
    '/bundle.js',
    '/mock-dapps/neonet-chat/index.html',
    '/mock-dapps/neonet-chat/manifest.json',
    '/mock-dapps/neonet-chat/style.css',
    '/mock-dapps/neonet-notes/index.html',
    '/mock-dapps/neonet-notes/manifest.json',
    '/mock-dapps/neonet-notes/style.css'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interceptação de requisições
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Retorna do cache se encontrado
                if (response) {
                    console.log('[Service Worker] Serving from cache:', event.request.url);
                    return response;
                }

                // Senão, busca na rede
                console.log('[Service Worker] Fetching from network:', event.request.url);
                return fetch(event.request).then(response => {
                    // Verifica se a resposta é válida
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clona a resposta
                    const responseToCache = response.clone();

                    // Adiciona ao cache
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                }).catch(() => {
                    // Se a rede falhar, retorna página offline
                    if (event.request.destination === 'document') {
                        return caches.match('/404.html');
                    }
                });
            })
    );
});

