
// neonet/clients/web/src/sw_advanced.js

const CACHE_STATIC_NAME = 'neonet-static-v1';
const CACHE_DYNAMIC_NAME = 'neonet-dynamic-v1';
const CACHE_DATA_NAME = 'neonet-data-v1';

// Lista de URLs para cachear na instalação (assets estáticos essenciais)
const staticAssets = [
    '/',
    '/index.html',
    '/404.html',
    '/bundle.js',
    '/mock-dapps/neonet-chat/index.html',
    '/mock-dapps/neonet-chat/manifest.json',
    '/mock-dapps/neonet-chat/style.css',
    '/mock-dapps/neonet-notes/index.html',
    '/mock-dapps/neonet-notes/manifest.json',
    '/mock-dapps/neonet-notes/style.css',
    // Adicione outros assets estáticos críticos aqui
];

// Função auxiliar para adicionar itens ao cache
async function addItemsToCache(cacheName, items) {
    const cache = await caches.open(cacheName);
    return cache.addAll(items);
}

// Função auxiliar para limpar caches antigos
async function cleanOldCaches(currentCacheNames) {
    const cacheNames = await caches.keys();
    return Promise.all(cacheNames.map(cacheName => {
        if (!currentCacheNames.includes(cacheName)) {
            return caches.delete(cacheName);
        }
    }));
}

// Evento de instalação do Service Worker
self.addEventListener('install', event => {
    console.log('[Service Worker] Installing Service Worker ...', event);
    event.waitUntil(
        addItemsToCache(CACHE_STATIC_NAME, staticAssets)
            .then(() => self.skipWaiting())
    );
});

// Evento de ativação do Service Worker
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activating Service Worker ...', event);
    event.waitUntil(
        cleanOldCaches([CACHE_STATIC_NAME, CACHE_DYNAMIC_NAME, CACHE_DATA_NAME])
            .then(() => self.clients.claim())
    );
});

// Função para lidar com a estratégia Cache-First, Network-Fallback com Atualização em Segundo Plano
async function cacheFirstNetworkFallback(request) {
    const cacheResponse = await caches.match(request);
    if (cacheResponse) {
        console.log('[Service Worker] Serving from cache:', request.url);
        // Tenta buscar na rede em segundo plano para atualizar o cache
        fetch(request).then(networkResponse => {
            if (networkResponse.ok) {
                caches.open(CACHE_DATA_NAME).then(cache => {
                    cache.put(request, networkResponse.clone());
                    console.log('[Service Worker] Cache updated in background:', request.url);
                });
            }
        }).catch(error => {
            console.warn('[Service Worker] Network update failed:', request.url, error);
        });
        return cacheResponse;
    } else {
        console.log('[Service Worker] Fetching from network (cache miss):', request.url);
        try {
            const networkResponse = await fetch(request);
            if (networkResponse.ok) {
                const cache = await caches.open(CACHE_DYNAMIC_NAME);
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        } catch (error) {
            console.error('[Service Worker] Network request failed:', request.url, error);
            // Pode-se retornar uma página offline ou um fallback específico aqui
            return new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
        }
    }
}

// Função para lidar com a estratégia Stale-While-Revalidate
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_DATA_NAME);
    const cachedResponse = await cache.match(request);
    const networkFetch = fetch(request).then(async networkResponse => {
        if (networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(error => {
        console.warn('[Service Worker] Network revalidation failed:', request.url, error);
        return new Response('<h1>Network Error or Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
    });

    return cachedResponse || networkFetch;
}

// Evento de fetch do Service Worker
self.addEventListener('fetch', event => {
    const { request } = event;

    // Ignorar requisições de extensão e outras que não são HTTP/HTTPS
    if (!request.url.startsWith('http') && !request.url.startsWith('https')) {
        return;
    }

    // Estratégia para assets estáticos (Cache-Only)
    if (staticAssets.includes(request.url) || request.url.includes('/dist/')) {
        event.respondWith(caches.match(request).then(response => {
            return response || fetch(request);
        }));
        return;
    }

    // Estratégia para dados de API ou conteúdo dinâmico (Stale-While-Revalidate ou Cache-First)
    if (request.url.includes('/api/') || request.method === 'GET') { // Adapte para suas rotas de API
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    // Para outras requisições, use Cache-First, Network-Fallback
    event.respondWith(cacheFirstNetworkFallback(request));
});

// Exemplo de como registrar este Service Worker no main.js ou app.js
/*
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw_advanced.js')
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    });
}
*/

// Gerenciamento de Cache Inteligente: Limpeza de cache dinâmico (exemplo simples)
// Em um cenário real, você pode querer implementar LRU ou outras políticas mais complexas.
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CLEAN_DYNAMIC_CACHE') {
        caches.open(CACHE_DYNAMIC_NAME).then(cache => {
            cache.keys().then(keys => {
                if (keys.length > 50) { // Exemplo: manter no máximo 50 itens no cache dinâmico
                    cache.delete(keys[0]); // Remove o mais antigo (LRU simples)
                }
            });
        });
    }
});

// Detecção de Conectividade Aprimorada (no lado do cliente, não no SW diretamente)
// O Service Worker pode reagir a eventos de conectividade, mas a detecção primária ocorre no navegador.
// Exemplo de código para main.js ou app.js:
/*
window.addEventListener('online', () => {
    console.log('App is online. Initiating data sync...');
    // Enviar mensagem para o Service Worker para iniciar sincronização ou revalidação
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SYNC_DATA' });
    }
});

window.addEventListener('offline', () => {
    console.log('App is offline. Operating in offline mode.');
});

// Verificação de conectividade mais robusta
async function checkNetworkStatus() {
    try {
        const response = await fetch('/api/healthcheck', { method: 'HEAD' }); // Endpoint leve
        return response.ok;
    } catch (error) {
        return false;
    }
}

setInterval(async () => {
    const isReallyOnline = await checkNetworkStatus();
    if (isReallyOnline && !navigator.onLine) {
        console.log('Browser thinks offline, but network is reachable.');
        // Disparar lógica de sincronização
    } else if (!isReallyOnline && navigator.onLine) {
        console.log('Browser thinks online, but network is unreachable.');
        // Ajustar UI para modo offline
    }
}, 30000); // A cada 30 segundos
*/


