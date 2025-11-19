// neonet/clients/web/src/utils/CacheManager_enhanced.js
// Gerenciador de Cache Aprimorado para Funcionamento 100% Offline

class CacheManagerEnhanced {
    constructor() {
        this.version = '2.0.0';
        this.cachePrefix = 'neonet-v';
        this.maxCacheSize = 50 * 1024 * 1024; // 50MB
        this.maxEntries = 1000;
        this.defaultTTL = 24 * 60 * 60 * 1000; // 24 horas
        
        this.cacheTypes = {
            STATIC: 'static',
            DYNAMIC: 'dynamic',
            DAPP: 'dapps',
            USER_DATA: 'user-data',
            BLOCKCHAIN: 'blockchain'
        };
        
        this.init();
    }
    
    async init() {
        try {
            // Registrar Service Worker aprimorado
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.register('/sw_enhanced.js');
                console.log('[CacheManager] Service Worker registered:', registration);
                
                // Escutar mensagens do Service Worker
                navigator.serviceWorker.addEventListener('message', this.handleSWMessage.bind(this));
            }
            
            // Inicializar IndexedDB para metadados de cache
            await this.initCacheMetadata();
            
            // Configurar limpeza periódica
            this.setupPeriodicCleanup();
            
            console.log('[CacheManager] Initialized successfully');
        } catch (error) {
            console.error('[CacheManager] Initialization failed:', error);
        }
    }
    
    async initCacheMetadata() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('NeoNetCacheMetadata', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.metadataDB = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store para metadados de cache
                if (!db.objectStoreNames.contains('cacheEntries')) {
                    const store = db.createObjectStore('cacheEntries', { keyPath: 'url' });
                    store.createIndex('timestamp', 'timestamp');
                    store.createIndex('cacheType', 'cacheType');
                    store.createIndex('size', 'size');
                }
                
                // Store para configurações de cache
                if (!db.objectStoreNames.contains('cacheConfig')) {
                    db.createObjectStore('cacheConfig', { keyPath: 'key' });
                }
            };
        });
    }
    
    async cacheResource(url, response, cacheType = this.cacheTypes.DYNAMIC, ttl = this.defaultTTL) {
        try {
            const cacheName = this.getCacheName(cacheType);
            const cache = await caches.open(cacheName);
            
            // Clonar resposta para cache
            const responseClone = response.clone();
            await cache.put(url, responseClone);
            
            // Salvar metadados
            await this.saveCacheMetadata(url, cacheType, ttl);
            
            console.log(`[CacheManager] Cached resource: ${url} in ${cacheType}`);
            return true;
        } catch (error) {
            console.error('[CacheManager] Failed to cache resource:', error);
            return false;
        }
    }
    
    async getCachedResource(url, cacheType = null) {
        try {
            // Se tipo específico fornecido, buscar apenas nesse cache
            if (cacheType) {
                const cacheName = this.getCacheName(cacheType);
                const cache = await caches.open(cacheName);
                const response = await cache.match(url);
                
                if (response) {
                    // Verificar se não expirou
                    const metadata = await this.getCacheMetadata(url);
                    if (metadata && this.isExpired(metadata)) {
                        await this.removeCachedResource(url, cacheType);
                        return null;
                    }
                    return response;
                }
                return null;
            }
            
            // Buscar em todos os caches
            const response = await caches.match(url);
            if (response) {
                const metadata = await this.getCacheMetadata(url);
                if (metadata && this.isExpired(metadata)) {
                    await this.removeCachedResource(url);
                    return null;
                }
            }
            
            return response;
        } catch (error) {
            console.error('[CacheManager] Failed to get cached resource:', error);
            return null;
        }
    }
    
    async removeCachedResource(url, cacheType = null) {
        try {
            if (cacheType) {
                const cacheName = this.getCacheName(cacheType);
                const cache = await caches.open(cacheName);
                await cache.delete(url);
            } else {
                // Remover de todos os caches
                const cacheNames = await caches.keys();
                await Promise.all(
                    cacheNames
                        .filter(name => name.startsWith(this.cachePrefix))
                        .map(async name => {
                            const cache = await caches.open(name);
                            return cache.delete(url);
                        })
                );
            }
            
            // Remover metadados
            await this.removeCacheMetadata(url);
            
            console.log(`[CacheManager] Removed cached resource: ${url}`);
            return true;
        } catch (error) {
            console.error('[CacheManager] Failed to remove cached resource:', error);
            return false;
        }
    }
    
    async preloadCriticalResources(urls) {
        console.log('[CacheManager] Preloading critical resources...');
        
        const results = await Promise.allSettled(
            urls.map(async url => {
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        await this.cacheResource(url, response, this.cacheTypes.STATIC, 30 * 24 * 60 * 60 * 1000); // 30 dias
                        return { url, success: true };
                    }
                    return { url, success: false, error: 'Response not ok' };
                } catch (error) {
                    return { url, success: false, error: error.message };
                }
            })
        );
        
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        console.log(`[CacheManager] Preloaded ${successful}/${urls.length} critical resources`);
        
        return results;
    }
    
    async getCacheStats() {
        try {
            const stats = {
                totalSize: 0,
                totalEntries: 0,
                cacheTypes: {},
                version: this.version
            };
            
            const cacheNames = await caches.keys();
            
            for (const cacheName of cacheNames) {
                if (cacheName.startsWith(this.cachePrefix)) {
                    const cache = await caches.open(cacheName);
                    const requests = await cache.keys();
                    
                    const cacheType = this.getCacheTypeFromName(cacheName);
                    stats.cacheTypes[cacheType] = {
                        entries: requests.length,
                        size: 0 // Tamanho seria calculado se necessário
                    };
                    
                    stats.totalEntries += requests.length;
                }
            }
            
            return stats;
        } catch (error) {
            console.error('[CacheManager] Failed to get cache stats:', error);
            return null;
        }
    }
    
    async cleanExpiredEntries() {
        console.log('[CacheManager] Cleaning expired cache entries...');
        
        try {
            const transaction = this.metadataDB.transaction(['cacheEntries'], 'readonly');
            const store = transaction.objectStore('cacheEntries');
            const request = store.getAll();
            
            request.onsuccess = async () => {
                const entries = request.result;
                const expiredUrls = entries
                    .filter(entry => this.isExpired(entry))
                    .map(entry => entry.url);
                
                // Remover entradas expiradas
                await Promise.all(
                    expiredUrls.map(url => this.removeCachedResource(url))
                );
                
                console.log(`[CacheManager] Cleaned ${expiredUrls.length} expired entries`);
            };
        } catch (error) {
            console.error('[CacheManager] Failed to clean expired entries:', error);
        }
    }
    
    async clearAllCaches() {
        try {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter(name => name.startsWith(this.cachePrefix))
                    .map(name => caches.delete(name))
            );
            
            // Limpar metadados
            const transaction = this.metadataDB.transaction(['cacheEntries'], 'readwrite');
            const store = transaction.objectStore('cacheEntries');
            await store.clear();
            
            console.log('[CacheManager] All caches cleared');
            return true;
        } catch (error) {
            console.error('[CacheManager] Failed to clear caches:', error);
            return false;
        }
    }
    
    // Métodos auxiliares
    getCacheName(cacheType) {
        return `${this.cachePrefix}${this.version}-${cacheType}`;
    }
    
    getCacheTypeFromName(cacheName) {
        const parts = cacheName.split('-');
        return parts[parts.length - 1];
    }
    
    async saveCacheMetadata(url, cacheType, ttl) {
        try {
            const transaction = this.metadataDB.transaction(['cacheEntries'], 'readwrite');
            const store = transaction.objectStore('cacheEntries');
            
            const metadata = {
                url,
                cacheType,
                timestamp: Date.now(),
                ttl,
                expiresAt: Date.now() + ttl
            };
            
            await store.put(metadata);
        } catch (error) {
            console.error('[CacheManager] Failed to save cache metadata:', error);
        }
    }
    
    async getCacheMetadata(url) {
        try {
            const transaction = this.metadataDB.transaction(['cacheEntries'], 'readonly');
            const store = transaction.objectStore('cacheEntries');
            
            return new Promise((resolve, reject) => {
                const request = store.get(url);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('[CacheManager] Failed to get cache metadata:', error);
            return null;
        }
    }
    
    async removeCacheMetadata(url) {
        try {
            const transaction = this.metadataDB.transaction(['cacheEntries'], 'readwrite');
            const store = transaction.objectStore('cacheEntries');
            await store.delete(url);
        } catch (error) {
            console.error('[CacheManager] Failed to remove cache metadata:', error);
        }
    }
    
    isExpired(metadata) {
        return Date.now() > metadata.expiresAt;
    }
    
    setupPeriodicCleanup() {
        // Limpeza a cada 6 horas
        setInterval(() => {
            this.cleanExpiredEntries();
        }, 6 * 60 * 60 * 1000);
        
        // Notificar Service Worker para limpeza
        setInterval(() => {
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'CLEAN_CACHE'
                });
            }
        }, 12 * 60 * 60 * 1000); // 12 horas
    }
    
    handleSWMessage(event) {
        const { data } = event;
        
        switch (data.type) {
            case 'SYNC_COMPLETE':
                console.log('[CacheManager] Background sync completed');
                this.dispatchEvent('syncComplete', data);
                break;
            case 'CACHE_UPDATED':
                console.log('[CacheManager] Cache updated by SW');
                this.dispatchEvent('cacheUpdated', data);
                break;
        }
    }
    
    dispatchEvent(type, data) {
        const event = new CustomEvent(`neonet-cache-${type}`, { detail: data });
        window.dispatchEvent(event);
    }
    
    // API pública para dApps
    async cacheUserData(key, data, ttl = this.defaultTTL) {
        const url = `/user-data/${key}`;
        const response = new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' }
        });
        
        return await this.cacheResource(url, response, this.cacheTypes.USER_DATA, ttl);
    }
    
    async getUserData(key) {
        const url = `/user-data/${key}`;
        const response = await this.getCachedResource(url, this.cacheTypes.USER_DATA);
        
        if (response) {
            return await response.json();
        }
        
        return null;
    }
    
    async cacheBlockchainData(key, data, ttl = 5 * 60 * 1000) { // 5 minutos para dados blockchain
        const url = `/blockchain-data/${key}`;
        const response = new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' }
        });
        
        return await this.cacheResource(url, response, this.cacheTypes.BLOCKCHAIN, ttl);
    }
    
    async getBlockchainData(key) {
        const url = `/blockchain-data/${key}`;
        const response = await this.getCachedResource(url, this.cacheTypes.BLOCKCHAIN);
        
        if (response) {
            return await response.json();
        }
        
        return null;
    }
}

// Instância global
const cacheManager = new CacheManagerEnhanced();

export default cacheManager;

