// neonet/clients/web/src/utils/CacheManager.js

/**
 * Gerenciador de Cache Avançado para NeoNet
 * Fornece funcionalidades de cache inteligente com versionamento, limites e políticas de remoção
 */
class CacheManager {
    constructor() {
        this.cachePrefix = 'neonet-cache-';
        this.maxCacheSize = 50 * 1024 * 1024; // 50MB por cache
        this.maxCacheItems = 100; // Máximo de 100 itens por cache
        this.cacheVersion = '1.0.0';
    }

    /**
     * Gera um nome de cache versionado
     * @param {string} cacheName - Nome base do cache
     * @returns {string} Nome do cache com versão
     */
    getVersionedCacheName(cacheName) {
        return `${this.cachePrefix}${cacheName}-v${this.cacheVersion}`;
    }

    /**
     * Abre um cache específico
     * @param {string} cacheName - Nome do cache
     * @returns {Promise<Cache>} Instância do cache
     */
    async openCache(cacheName) {
        const versionedName = this.getVersionedCacheName(cacheName);
        return await caches.open(versionedName);
    }

    /**
     * Adiciona um item ao cache com verificação de limites
     * @param {string} cacheName - Nome do cache
     * @param {Request|string} request - Requisição ou URL
     * @param {Response} response - Resposta a ser cacheada
     * @returns {Promise<boolean>} Sucesso da operação
     */
    async addToCache(cacheName, request, response) {
        try {
            const cache = await this.openCache(cacheName);
            
            // Verificar limites antes de adicionar
            await this.enforceCache Limits(cache);
            
            // Adicionar ao cache
            await cache.put(request, response.clone());
            
            // Atualizar metadados do cache
            await this.updateCacheMetadata(cacheName, request);
            
            return true;
        } catch (error) {
            console.error('[CacheManager] Error adding to cache:', error);
            return false;
        }
    }

    /**
     * Busca um item no cache
     * @param {string} cacheName - Nome do cache
     * @param {Request|string} request - Requisição ou URL
     * @returns {Promise<Response|undefined>} Resposta cacheada ou undefined
     */
    async getFromCache(cacheName, request) {
        try {
            const cache = await this.openCache(cacheName);
            const response = await cache.match(request);
            
            if (response) {
                // Atualizar timestamp de último acesso
                await this.updateLastAccess(cacheName, request);
            }
            
            return response;
        } catch (error) {
            console.error('[CacheManager] Error getting from cache:', error);
            return undefined;
        }
    }

    /**
     * Aplica limites de cache (tamanho e número de itens)
     * @param {Cache} cache - Instância do cache
     */
    async enforceCacheLimits(cache) {
        const keys = await cache.keys();
        
        // Verificar número de itens
        if (keys.length >= this.maxCacheItems) {
            await this.evictLRUItems(cache, keys);
        }
        
        // Verificar tamanho do cache (aproximado)
        const cacheSize = await this.estimateCacheSize(cache, keys);
        if (cacheSize > this.maxCacheSize) {
            await this.evictLRUItems(cache, keys);
        }
    }

    /**
     * Remove itens menos recentemente usados (LRU)
     * @param {Cache} cache - Instância do cache
     * @param {Request[]} keys - Chaves do cache
     */
    async evictLRUItems(cache, keys) {
        const metadata = await this.getCacheMetadata();
        const itemsToRemove = Math.ceil(keys.length * 0.2); // Remove 20% dos itens
        
        // Ordenar por último acesso
        const sortedKeys = keys.sort((a, b) => {
            const aTime = metadata[a.url]?.lastAccess || 0;
            const bTime = metadata[b.url]?.lastAccess || 0;
            return aTime - bTime;
        });
        
        // Remover os itens mais antigos
        for (let i = 0; i < itemsToRemove && i < sortedKeys.length; i++) {
            await cache.delete(sortedKeys[i]);
            delete metadata[sortedKeys[i].url];
        }
        
        await this.saveCacheMetadata(metadata);
        console.log(`[CacheManager] Evicted ${itemsToRemove} LRU items from cache`);
    }

    /**
     * Estima o tamanho do cache
     * @param {Cache} cache - Instância do cache
     * @param {Request[]} keys - Chaves do cache
     * @returns {Promise<number>} Tamanho estimado em bytes
     */
    async estimateCacheSize(cache, keys) {
        let totalSize = 0;
        
        for (const key of keys.slice(0, 10)) { // Amostra de 10 itens para estimativa
            try {
                const response = await cache.match(key);
                if (response) {
                    const blob = await response.blob();
                    totalSize += blob.size;
                }
            } catch (error) {
                console.warn('[CacheManager] Error estimating cache size:', error);
            }
        }
        
        // Extrapolar para todos os itens
        return (totalSize / Math.min(10, keys.length)) * keys.length;
    }

    /**
     * Atualiza metadados do cache
     * @param {string} cacheName - Nome do cache
     * @param {Request|string} request - Requisição ou URL
     */
    async updateCacheMetadata(cacheName, request) {
        const url = typeof request === 'string' ? request : request.url;
        const metadata = await this.getCacheMetadata();
        
        if (!metadata[url]) {
            metadata[url] = {};
        }
        
        metadata[url].cacheName = cacheName;
        metadata[url].addedAt = Date.now();
        metadata[url].lastAccess = Date.now();
        
        await this.saveCacheMetadata(metadata);
    }

    /**
     * Atualiza timestamp de último acesso
     * @param {string} cacheName - Nome do cache
     * @param {Request|string} request - Requisição ou URL
     */
    async updateLastAccess(cacheName, request) {
        const url = typeof request === 'string' ? request : request.url;
        const metadata = await this.getCacheMetadata();
        
        if (metadata[url]) {
            metadata[url].lastAccess = Date.now();
            await this.saveCacheMetadata(metadata);
        }
    }

    /**
     * Obtém metadados do cache do IndexedDB
     * @returns {Promise<Object>} Metadados do cache
     */
    async getCacheMetadata() {
        try {
            const stored = localStorage.getItem('neonet-cache-metadata');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('[CacheManager] Error getting cache metadata:', error);
            return {};
        }
    }

    /**
     * Salva metadados do cache no IndexedDB
     * @param {Object} metadata - Metadados a serem salvos
     */
    async saveCacheMetadata(metadata) {
        try {
            localStorage.setItem('neonet-cache-metadata', JSON.stringify(metadata));
        } catch (error) {
            console.error('[CacheManager] Error saving cache metadata:', error);
        }
    }

    /**
     * Limpa caches antigos baseado na versão
     */
    async cleanOldCaches() {
        const cacheNames = await caches.keys();
        const currentCaches = [
            this.getVersionedCacheName('static'),
            this.getVersionedCacheName('dynamic'),
            this.getVersionedCacheName('data')
        ];
        
        const deletionPromises = cacheNames
            .filter(cacheName => 
                cacheName.startsWith(this.cachePrefix) && 
                !currentCaches.includes(cacheName)
            )
            .map(cacheName => caches.delete(cacheName));
        
        await Promise.all(deletionPromises);
        console.log('[CacheManager] Cleaned old caches');
    }

    /**
     * Obtém estatísticas do cache
     * @returns {Promise<Object>} Estatísticas do cache
     */
    async getCacheStats() {
        const cacheNames = await caches.keys();
        const stats = {
            totalCaches: 0,
            totalItems: 0,
            estimatedSize: 0,
            caches: {}
        };
        
        for (const cacheName of cacheNames) {
            if (cacheName.startsWith(this.cachePrefix)) {
                const cache = await caches.open(cacheName);
                const keys = await cache.keys();
                const size = await this.estimateCacheSize(cache, keys);
                
                stats.totalCaches++;
                stats.totalItems += keys.length;
                stats.estimatedSize += size;
                stats.caches[cacheName] = {
                    items: keys.length,
                    estimatedSize: size
                };
            }
        }
        
        return stats;
    }

    /**
     * Força a limpeza de um cache específico
     * @param {string} cacheName - Nome do cache a ser limpo
     */
    async clearCache(cacheName) {
        const versionedName = this.getVersionedCacheName(cacheName);
        await caches.delete(versionedName);
        
        // Limpar metadados relacionados
        const metadata = await this.getCacheMetadata();
        Object.keys(metadata).forEach(url => {
            if (metadata[url].cacheName === cacheName) {
                delete metadata[url];
            }
        });
        await this.saveCacheMetadata(metadata);
        
        console.log(`[CacheManager] Cleared cache: ${cacheName}`);
    }
}

// Exportar instância singleton
const cacheManager = new CacheManager();
export default cacheManager;

// Para uso em Service Workers (onde ES6 modules podem não estar disponíveis)
if (typeof self !== 'undefined' && self.importScripts) {
    self.CacheManager = CacheManager;
    self.cacheManager = new CacheManager();
}

