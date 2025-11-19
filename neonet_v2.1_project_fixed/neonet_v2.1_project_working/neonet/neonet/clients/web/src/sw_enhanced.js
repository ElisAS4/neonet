// neonet/clients/web/src/sw_enhanced.js
// Service Worker Aprimorado para Funcionamento 100% Offline

const CACHE_VERSION = '2.0.0';
const CACHE_NAME = `neonet-v${CACHE_VERSION}`;
const STATIC_CACHE = `${CACHE_NAME}-static`;
const DYNAMIC_CACHE = `${CACHE_NAME}-dynamic`;
const DAPP_CACHE = `${CACHE_NAME}-dapps`;

// URLs críticas para pré-cache (recursos essenciais)
const CRITICAL_URLS = [
    '/',
    '/index.html',
    '/404.html',
    '/bundle.js',
    '/manifest.json'
];

// URLs de dApps para cache modular
const DAPP_URLS = [
    '/mock-dapps/neonet-chat/index.html',
    '/mock-dapps/neonet-chat/manifest.json',
    '/mock-dapps/neonet-chat/style.css',
    '/mock-dapps/neonet-chat/chat.js',
    '/mock-dapps/neonet-notes/index.html',
    '/mock-dapps/neonet-notes/manifest.json',
    '/mock-dapps/neonet-notes/style.css',
    '/mock-dapps/neonet-notes/notes.js'
];

// URLs de assets de mídia e recursos estáticos
const MEDIA_URLS = [
    // Adicionar URLs de imagens, fontes, ícones conforme necessário
];

// Configuração de estratégias de cache por tipo de recurso
const CACHE_STRATEGIES = {
    // Cache-first para recursos estáticos críticos
    static: {
        strategy: 'cache-first',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
        maxEntries: 100
    },
    // Stale-while-revalidate para conteúdo dinâmico
    dynamic: {
        strategy: 'stale-while-revalidate',
        maxAge: 24 * 60 * 60 * 1000, // 1 dia
        maxEntries: 50
    },
    // Network-first para APIs com fallback para cache
    api: {
        strategy: 'network-first',
        maxAge: 5 * 60 * 1000, // 5 minutos
        maxEntries: 20
    }
};

// Instalação do Service Worker com pré-caching agressivo
self.addEventListener('install', event => {
    console.log('[SW Enhanced] Installing version:', CACHE_VERSION);
    
    event.waitUntil(
        Promise.all([
            // Cache de recursos críticos
            caches.open(STATIC_CACHE).then(cache => {
                console.log('[SW Enhanced] Pre-caching critical resources');
                return cache.addAll(CRITICAL_URLS);
            }),
            // Cache de dApps
            caches.open(DAPP_CACHE).then(cache => {
                console.log('[SW Enhanced] Pre-caching dApp resources');
                return cache.addAll(DAPP_URLS);
            }),
            // Cache de mídia (se houver)
            ...(MEDIA_URLS.length > 0 ? [
                caches.open(STATIC_CACHE).then(cache => {
                    console.log('[SW Enhanced] Pre-caching media resources');
                    return cache.addAll(MEDIA_URLS);
                })
            ] : [])
        ]).then(() => {
            console.log('[SW Enhanced] All resources pre-cached successfully');
            return self.skipWaiting();
        })
    );
});

// Ativação com limpeza de caches antigos
self.addEventListener('activate', event => {
    console.log('[SW Enhanced] Activating version:', CACHE_VERSION);
    
    event.waitUntil(
        Promise.all([
            // Limpar caches antigos
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName.startsWith('neonet-v') && !cacheName.includes(CACHE_VERSION)) {
                            console.log('[SW Enhanced] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Tomar controle de todos os clientes
            self.clients.claim()
        ]).then(() => {
            console.log('[SW Enhanced] Activation complete');
        })
    );
});

// Interceptação de requisições com estratégias avançadas
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Ignorar requisições não-HTTP
    if (!event.request.url.startsWith('http')) {
        return;
    }
    
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    try {
        // Determinar estratégia baseada no tipo de recurso
        if (isStaticResource(pathname)) {
            return await cacheFirstStrategy(request, STATIC_CACHE);
        } else if (isDAppResource(pathname)) {
            return await cacheFirstStrategy(request, DAPP_CACHE);
        } else if (isAPIRequest(pathname)) {
            return await networkFirstStrategy(request, DYNAMIC_CACHE);
        } else if (isDynamicContent(pathname)) {
            return await staleWhileRevalidateStrategy(request, DYNAMIC_CACHE);
        } else {
            // Fallback para cache-first
            return await cacheFirstStrategy(request, DYNAMIC_CACHE);
        }
    } catch (error) {
        console.error('[SW Enhanced] Error handling request:', error);
        return await handleOfflineFallback(request);
    }
}

// Estratégia Cache-First
async function cacheFirstStrategy(request, cacheName) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        console.log('[SW Enhanced] Serving from cache:', request.url);
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
            console.log('[SW Enhanced] Cached from network:', request.url);
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW Enhanced] Network failed, no cache available:', request.url);
        return await handleOfflineFallback(request);
    }
}

// Estratégia Network-First
async function networkFirstStrategy(request, cacheName) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
            console.log('[SW Enhanced] Updated cache from network:', request.url);
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW Enhanced] Network failed, trying cache:', request.url);
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        return await handleOfflineFallback(request);
    }
}

// Estratégia Stale-While-Revalidate
async function staleWhileRevalidateStrategy(request, cacheName) {
    const cachedResponse = await caches.match(request);
    
    // Buscar na rede em background para atualizar cache
    const networkResponsePromise = fetch(request).then(response => {
        if (response.ok) {
            const cache = caches.open(cacheName);
            cache.then(c => c.put(request, response.clone()));
        }
        return response;
    }).catch(() => null);
    
    // Retornar cache imediatamente se disponível
    if (cachedResponse) {
        console.log('[SW Enhanced] Serving stale from cache:', request.url);
        return cachedResponse;
    }
    
    // Se não há cache, aguardar rede
    try {
        const networkResponse = await networkResponsePromise;
        if (networkResponse) {
            return networkResponse;
        }
    } catch (error) {
        // Ignorar erro de rede
    }
    
    return await handleOfflineFallback(request);
}

// Fallback para quando offline
async function handleOfflineFallback(request) {
    const url = new URL(request.url);
    
    if (request.destination === 'document') {
        // Retornar página offline para documentos
        const offlinePage = await caches.match('/404.html');
        if (offlinePage) {
            return offlinePage;
        }
    }
    
    if (request.destination === 'image') {
        // Retornar imagem placeholder para imagens
        return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#f0f0f0"/><text x="100" y="100" text-anchor="middle" dy=".3em" fill="#999">Offline</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
        );
    }
    
    // Resposta genérica offline
    return new Response(
        JSON.stringify({ error: 'Offline', message: 'Recurso não disponível offline' }),
        { 
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' }
        }
    );
}

// Funções auxiliares para classificação de recursos
function isStaticResource(pathname) {
    return pathname.match(/\.(js|css|html|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i) ||
           pathname === '/' || pathname === '/index.html';
}

function isDAppResource(pathname) {
    return pathname.startsWith('/mock-dapps/');
}

function isAPIRequest(pathname) {
    return pathname.startsWith('/api/') || pathname.includes('/api/');
}

function isDynamicContent(pathname) {
    return pathname.startsWith('/user/') || pathname.startsWith('/data/');
}

// Limpeza periódica de cache
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CLEAN_CACHE') {
        cleanOldCacheEntries();
    }
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

async function cleanOldCacheEntries() {
    const cacheNames = await caches.keys();
    
    for (const cacheName of cacheNames) {
        if (cacheName.startsWith('neonet-v')) {
            const cache = await caches.open(cacheName);
            const requests = await cache.keys();
            
            // Implementar lógica de limpeza baseada em idade e limite de entradas
            // Por simplicidade, manter apenas os últimos 100 itens por cache
            if (requests.length > 100) {
                const toDelete = requests.slice(0, requests.length - 100);
                await Promise.all(toDelete.map(req => cache.delete(req)));
            }
        }
    }
}

// Sincronização em background
self.addEventListener('sync', event => {
    if (event.tag === 'background-sync') {
        event.waitUntil(performBackgroundSync());
    }
});

async function performBackgroundSync() {
    console.log('[SW Enhanced] Performing background sync');
    
    try {
        // Implementar lógica de sincronização de dados offline
        // Por exemplo, enviar transações pendentes, sincronizar dados de dApps
        
        // Notificar cliente sobre sincronização
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_COMPLETE',
                timestamp: Date.now()
            });
        });
    } catch (error) {
        console.error('[SW Enhanced] Background sync failed:', error);
    }
}

console.log('[SW Enhanced] Service Worker loaded, version:', CACHE_VERSION);

