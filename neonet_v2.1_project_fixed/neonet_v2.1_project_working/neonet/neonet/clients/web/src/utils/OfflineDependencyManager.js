// neonet/clients/web/src/utils/OfflineDependencyManager.js
// Gerenciador de Dependências Offline para Funcionamento 100% Offline

import CacheManager from './CacheManager_enhanced.js';
import SyncManager from './SyncManager_enhanced.js';

class OfflineDependencyManager {
    constructor() {
        this.version = '2.0.0';
        this.isOnline = navigator.onLine;
        this.fallbackData = new Map();
        this.internalAPIs = new Map();
        this.preloadedData = new Map();
        this.degradedFeatures = new Set();
        
        // Configurações de fallback
        this.fallbackConfig = {
            enableGracefulDegradation: true,
            showOfflineIndicators: true,
            cacheExternalData: true,
            maxCacheAge: 24 * 60 * 60 * 1000, // 24 horas
            retryInterval: 30000 // 30 segundos
        };
        
        this.init();
    }
    
    async init() {
        try {
            // Configurar listeners de conectividade
            window.addEventListener('online', this.handleOnline.bind(this));
            window.addEventListener('offline', this.handleOffline.bind(this));
            
            // Inicializar APIs internas
            await this.initInternalAPIs();
            
            // Carregar dados pré-carregados
            await this.loadPreloadedData();
            
            // Configurar verificação periódica de dependências
            this.setupDependencyCheck();
            
            console.log('[OfflineDependencyManager] Initialized successfully');
        } catch (error) {
            console.error('[OfflineDependencyManager] Initialization failed:', error);
        }
    }
    
    async initInternalAPIs() {
        // API interna para dados de configuração de rede
        this.internalAPIs.set('network-config', {
            endpoint: '/api/network-config',
            fallback: () => this.getDefaultNetworkConfig(),
            cache: true,
            ttl: 60 * 60 * 1000 // 1 hora
        });
        
        // API interna para dados de blockchain
        this.internalAPIs.set('blockchain-info', {
            endpoint: '/api/blockchain-info',
            fallback: () => this.getDefaultBlockchainInfo(),
            cache: true,
            ttl: 5 * 60 * 1000 // 5 minutos
        });
        
        // API interna para lista de peers
        this.internalAPIs.set('peer-list', {
            endpoint: '/api/peers',
            fallback: () => this.getDefaultPeerList(),
            cache: true,
            ttl: 10 * 60 * 1000 // 10 minutos
        });
        
        // API interna para dados de usuário
        this.internalAPIs.set('user-profile', {
            endpoint: '/api/user/profile',
            fallback: () => this.getDefaultUserProfile(),
            cache: true,
            ttl: 30 * 60 * 1000 // 30 minutos
        });
        
        // API interna para configurações de dApps
        this.internalAPIs.set('dapp-configs', {
            endpoint: '/api/dapps/configs',
            fallback: () => this.getDefaultDAppConfigs(),
            cache: true,
            ttl: 60 * 60 * 1000 // 1 hora
        });
    }
    
    async loadPreloadedData() {
        // Dados essenciais que devem estar sempre disponíveis offline
        const essentialData = {
            // Configurações de rede padrão
            networkConfig: {
                chainId: 1,
                networkName: 'NeoNet',
                rpcUrls: ['http://localhost:8545'],
                blockExplorer: 'http://localhost:3001',
                nativeCurrency: {
                    name: 'NeoNet Token',
                    symbol: 'NNT',
                    decimals: 18
                }
            },
            
            // Lista de peers bootstrap
            bootstrapPeers: [
                'localhost:8080',
                '127.0.0.1:8080'
            ],
            
            // Configurações de dApps
            dappConfigs: {
                'neonet-chat': {
                    name: 'NeoNet Chat',
                    version: '1.0.0',
                    permissions: ['storage', 'p2p'],
                    maxStorageSize: 10 * 1024 * 1024 // 10MB
                },
                'neonet-notes': {
                    name: 'NeoNet Notes',
                    version: '1.0.0',
                    permissions: ['storage'],
                    maxStorageSize: 5 * 1024 * 1024 // 5MB
                }
            },
            
            // Dados de exemplo/template
            templateData: {
                chatMessages: [
                    {
                        id: 'welcome-1',
                        text: 'Bem-vindo ao NeoNet Chat! Esta é uma mensagem de exemplo.',
                        timestamp: Date.now(),
                        sender: 'system',
                        type: 'system'
                    }
                ],
                noteTemplates: [
                    {
                        id: 'template-1',
                        title: 'Nota de Exemplo',
                        content: 'Esta é uma nota de exemplo para demonstrar o funcionamento offline.',
                        timestamp: Date.now(),
                        tags: ['exemplo', 'template']
                    }
                ]
            }
        };
        
        // Armazenar dados pré-carregados
        for (const [key, data] of Object.entries(essentialData)) {
            this.preloadedData.set(key, data);
            
            // Também cachear usando CacheManager
            await CacheManager.cacheUserData(`preloaded-${key}`, data, 30 * 24 * 60 * 60 * 1000); // 30 dias
        }
        
        console.log('[OfflineDependencyManager] Preloaded essential data');
    }
    
    // Método principal para requisições com fallback offline
    async request(url, options = {}) {
        const requestId = this.generateRequestId();
        
        try {
            // Verificar se é uma API interna
            const internalAPI = this.findInternalAPI(url);
            if (internalAPI) {
                return await this.handleInternalAPI(internalAPI, options);
            }
            
            // Tentar cache primeiro se configurado
            if (options.cacheFirst || !this.isOnline) {
                const cached = await this.getCachedResponse(url);
                if (cached) {
                    console.log(`[OfflineDependencyManager] Serving from cache: ${url}`);
                    return cached;
                }
            }
            
            // Tentar requisição de rede se online
            if (this.isOnline) {
                try {
                    const response = await fetch(url, options);
                    
                    if (response.ok) {
                        const data = await response.json();
                        
                        // Cachear resposta se configurado
                        if (options.cache !== false) {
                            await this.cacheResponse(url, data, options.ttl);
                        }
                        
                        return { success: true, data, source: 'network' };
                    } else {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                } catch (networkError) {
                    console.warn(`[OfflineDependencyManager] Network request failed: ${url}`, networkError);
                    
                    // Fallback para cache se rede falhar
                    const cached = await this.getCachedResponse(url);
                    if (cached) {
                        return { ...cached, source: 'cache-fallback' };
                    }
                }
            }
            
            // Fallback para dados padrão/degradados
            return await this.handleOfflineFallback(url, options);
            
        } catch (error) {
            console.error(`[OfflineDependencyManager] Request failed: ${url}`, error);
            return await this.handleOfflineFallback(url, options);
        }
    }
    
    async handleInternalAPI(api, options) {
        try {
            // Verificar cache primeiro se configurado
            if (api.cache) {
                const cached = await CacheManager.getUserData(`internal-api-${api.endpoint}`);
                if (cached && !this.isCacheExpired(cached, api.ttl)) {
                    return { success: true, data: cached.data, source: 'internal-cache' };
                }
            }
            
            // Executar fallback interno
            const data = await api.fallback();
            
            // Cachear resultado se configurado
            if (api.cache) {
                await CacheManager.cacheUserData(`internal-api-${api.endpoint}`, {
                    data,
                    timestamp: Date.now()
                }, api.ttl);
            }
            
            return { success: true, data, source: 'internal-api' };
        } catch (error) {
            console.error('[OfflineDependencyManager] Internal API failed:', error);
            return { success: false, error: error.message, source: 'internal-api' };
        }
    }
    
    async handleOfflineFallback(url, options) {
        // Verificar se há dados de fallback específicos
        const fallbackKey = this.getFallbackKey(url);
        if (this.fallbackData.has(fallbackKey)) {
            const fallbackData = this.fallbackData.get(fallbackKey);
            return { success: true, data: fallbackData, source: 'fallback' };
        }
        
        // Verificar dados pré-carregados
        const preloadedKey = this.getPreloadedKey(url);
        if (this.preloadedData.has(preloadedKey)) {
            const preloadedData = this.preloadedData.get(preloadedKey);
            return { success: true, data: preloadedData, source: 'preloaded' };
        }
        
        // Degradação elegante
        if (this.fallbackConfig.enableGracefulDegradation) {
            return this.createGracefulDegradationResponse(url, options);
        }
        
        // Resposta de erro offline
        return {
            success: false,
            error: 'Recurso não disponível offline',
            offline: true,
            source: 'error'
        };
    }
    
    createGracefulDegradationResponse(url, options) {
        const feature = this.identifyFeature(url);
        
        // Marcar feature como degradada
        this.degradedFeatures.add(feature);
        
        // Retornar dados mínimos para manter funcionalidade básica
        const degradedData = this.createDegradedData(feature, url);
        
        // Notificar sobre degradação
        this.notifyFeatureDegradation(feature, url);
        
        return {
            success: true,
            data: degradedData,
            degraded: true,
            feature,
            source: 'degraded'
        };
    }
    
    createDegradedData(feature, url) {
        switch (feature) {
            case 'user-profile':
                return {
                    id: 'offline-user',
                    name: 'Usuário Offline',
                    avatar: null,
                    settings: {}
                };
                
            case 'peer-list':
                return {
                    peers: [],
                    localPeers: ['localhost:8080'],
                    count: 0
                };
                
            case 'blockchain-data':
                return {
                    blockNumber: 0,
                    gasPrice: '20000000000',
                    networkId: 1,
                    syncing: false
                };
                
            case 'market-data':
                return {
                    price: 0,
                    change24h: 0,
                    volume: 0,
                    lastUpdate: null
                };
                
            default:
                return {
                    message: 'Dados não disponíveis offline',
                    offline: true,
                    feature
                };
        }
    }
    
    // Métodos de cache
    async cacheResponse(url, data, ttl = this.fallbackConfig.maxCacheAge) {
        const cacheData = {
            data,
            timestamp: Date.now(),
            ttl,
            url
        };
        
        await CacheManager.cacheUserData(`external-${this.hashUrl(url)}`, cacheData, ttl);
    }
    
    async getCachedResponse(url) {
        const cached = await CacheManager.getUserData(`external-${this.hashUrl(url)}`);
        
        if (cached && !this.isCacheExpired(cached, cached.ttl)) {
            return { success: true, data: cached.data, source: 'cache' };
        }
        
        return null;
    }
    
    isCacheExpired(cached, ttl) {
        return Date.now() - cached.timestamp > ttl;
    }
    
    // Métodos auxiliares
    findInternalAPI(url) {
        for (const [key, api] of this.internalAPIs) {
            if (url.includes(api.endpoint)) {
                return api;
            }
        }
        return null;
    }
    
    getFallbackKey(url) {
        // Extrair chave de fallback baseada na URL
        const urlObj = new URL(url, window.location.origin);
        return urlObj.pathname.split('/').filter(Boolean).join('-');
    }
    
    getPreloadedKey(url) {
        // Mapear URLs para chaves de dados pré-carregados
        if (url.includes('/network-config')) return 'networkConfig';
        if (url.includes('/peers')) return 'bootstrapPeers';
        if (url.includes('/dapps')) return 'dappConfigs';
        return null;
    }
    
    identifyFeature(url) {
        if (url.includes('/user/') || url.includes('/profile')) return 'user-profile';
        if (url.includes('/peers') || url.includes('/nodes')) return 'peer-list';
        if (url.includes('/blockchain') || url.includes('/eth/')) return 'blockchain-data';
        if (url.includes('/market') || url.includes('/price')) return 'market-data';
        if (url.includes('/news') || url.includes('/feed')) return 'news-feed';
        return 'unknown';
    }
    
    hashUrl(url) {
        // Hash simples para URLs
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            const char = url.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }
    
    generateRequestId() {
        return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Dados padrão para APIs internas
    getDefaultNetworkConfig() {
        return this.preloadedData.get('networkConfig');
    }
    
    getDefaultBlockchainInfo() {
        return {
            chainId: 1,
            blockNumber: 0,
            gasPrice: '20000000000',
            networkId: 1,
            syncing: false,
            peerCount: 0
        };
    }
    
    getDefaultPeerList() {
        return {
            peers: this.preloadedData.get('bootstrapPeers') || [],
            count: 0,
            connected: 0
        };
    }
    
    getDefaultUserProfile() {
        return {
            id: 'offline-user',
            name: 'Usuário Offline',
            avatar: null,
            settings: {
                theme: 'dark',
                language: 'pt-BR',
                notifications: true
            },
            created: Date.now(),
            lastSeen: Date.now()
        };
    }
    
    getDefaultDAppConfigs() {
        return this.preloadedData.get('dappConfigs');
    }
    
    // Event handlers
    handleOnline() {
        console.log('[OfflineDependencyManager] Connection restored');
        this.isOnline = true;
        this.degradedFeatures.clear();
        this.notifyConnectionRestored();
    }
    
    handleOffline() {
        console.log('[OfflineDependencyManager] Connection lost');
        this.isOnline = false;
        this.notifyConnectionLost();
    }
    
    setupDependencyCheck() {
        // Verificar dependências periodicamente
        setInterval(() => {
            this.checkDependencies();
        }, this.fallbackConfig.retryInterval);
    }
    
    async checkDependencies() {
        if (!this.isOnline) return;
        
        // Tentar reconectar com dependências que falharam
        for (const feature of this.degradedFeatures) {
            try {
                // Implementar lógica de reconexão específica por feature
                await this.retryFeature(feature);
            } catch (error) {
                console.warn(`[OfflineDependencyManager] Failed to retry feature: ${feature}`, error);
            }
        }
    }
    
    async retryFeature(feature) {
        // Implementar retry específico por feature
        console.log(`[OfflineDependencyManager] Retrying feature: ${feature}`);
    }
    
    // Notificações
    notifyFeatureDegradation(feature, url) {
        const event = new CustomEvent('neonet-feature-degraded', {
            detail: { feature, url, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }
    
    notifyConnectionRestored() {
        const event = new CustomEvent('neonet-connection-restored', {
            detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }
    
    notifyConnectionLost() {
        const event = new CustomEvent('neonet-connection-lost', {
            detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }
    
    // API pública
    async get(url, options = {}) {
        return await this.request(url, { ...options, method: 'GET' });
    }
    
    async post(url, data, options = {}) {
        return await this.request(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
    }
    
    setFallbackData(key, data) {
        this.fallbackData.set(key, data);
    }
    
    getFallbackData(key) {
        return this.fallbackData.get(key);
    }
    
    isFeatureDegraded(feature) {
        return this.degradedFeatures.has(feature);
    }
    
    getDegradedFeatures() {
        return Array.from(this.degradedFeatures);
    }
    
    getStatus() {
        return {
            isOnline: this.isOnline,
            degradedFeatures: Array.from(this.degradedFeatures),
            preloadedDataKeys: Array.from(this.preloadedData.keys()),
            fallbackDataKeys: Array.from(this.fallbackData.keys()),
            version: this.version
        };
    }
}

// Instância global
const offlineDependencyManager = new OfflineDependencyManager();

export default offlineDependencyManager;

