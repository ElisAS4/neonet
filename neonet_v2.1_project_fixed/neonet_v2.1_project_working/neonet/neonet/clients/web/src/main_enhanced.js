// neonet/clients/web/src/main_enhanced.js
// Ponto de entrada principal aprimorado para funcionamento 100% offline

// Importar módulos aprimorados
import CacheManager from './utils/CacheManager_enhanced.js';
import SyncManager from './utils/SyncManager_enhanced.js';
import OfflineDependencyManager from './utils/OfflineDependencyManager.js';

// Importar aplicação principal
import './app.js';

console.log("NeoNet Enhanced main.js loaded");

// Configurações globais aprimoradas
window.NEONET_CONFIG = {
    version: "2.0.0",
    signalingServerUrl: "ws://localhost:8080",
    offlineFirst: true,
    debug: true,
    
    // Configurações de cache
    cache: {
        maxSize: 100 * 1024 * 1024, // 100MB
        maxEntries: 1000,
        defaultTTL: 24 * 60 * 60 * 1000, // 24 horas
        aggressiveCaching: true
    },
    
    // Configurações de sincronização
    sync: {
        interval: 30000, // 30 segundos
        maxRetries: 5,
        backoffMultiplier: 2,
        enableCRDT: true,
        enableBackgroundSync: true
    },
    
    // Configurações offline
    offline: {
        enableGracefulDegradation: true,
        showOfflineIndicators: true,
        preloadCriticalResources: true,
        enableFallbackData: true
    },
    
    // Configurações de dApps
    dapps: {
        enableOfflineFirst: true,
        maxStoragePerDApp: 10 * 1024 * 1024, // 10MB
        enableP2PLocal: true,
        enableDataSync: true
    }
};

class NeoNetEnhanced {
    constructor() {
        this.version = '2.0.0';
        this.initialized = false;
        this.modules = new Map();
        this.status = {
            online: navigator.onLine,
            cacheReady: false,
            syncReady: false,
            dependencyManagerReady: false,
            serviceWorkerReady: false
        };
        
        this.init();
    }
    
    async init() {
        try {
            console.log('[NeoNet Enhanced] Initializing...');
            
            // Verificar compatibilidade do navegador
            if (!this.checkBrowserCompatibility()) {
                throw new Error('Browser not compatible');
            }
            
            // Registrar Service Worker aprimorado
            await this.registerServiceWorker();
            
            // Inicializar módulos principais
            await this.initializeModules();
            
            // Configurar event listeners globais
            this.setupEventListeners();
            
            // Pré-carregar recursos críticos
            await this.preloadCriticalResources();
            
            // Configurar indicadores de status
            this.setupStatusIndicators();
            
            // Configurar API global
            this.setupGlobalAPI();
            
            this.initialized = true;
            console.log('[NeoNet Enhanced] Initialization complete');
            
            // Notificar inicialização completa
            this.dispatchEvent('neonet-ready', { version: this.version });
            
        } catch (error) {
            console.error('[NeoNet Enhanced] Initialization failed:', error);
            this.handleInitializationError(error);
        }
    }
    
    checkBrowserCompatibility() {
        const requirements = {
            indexedDB: !!window.indexedDB,
            serviceWorker: 'serviceWorker' in navigator,
            webRTC: !!(window.RTCPeerConnection || window.webkitRTCPeerConnection),
            localStorage: !!window.localStorage,
            fetch: !!window.fetch,
            promises: !!window.Promise
        };
        
        const missing = Object.entries(requirements)
            .filter(([key, supported]) => !supported)
            .map(([key]) => key);
        
        if (missing.length > 0) {
            console.error('[NeoNet Enhanced] Missing browser features:', missing);
            
            // Mostrar aviso para recursos críticos
            const critical = ['indexedDB', 'serviceWorker', 'fetch'];
            const criticalMissing = missing.filter(feature => critical.includes(feature));
            
            if (criticalMissing.length > 0) {
                alert(`Seu navegador não suporta recursos críticos: ${criticalMissing.join(', ')}. A NeoNet pode não funcionar corretamente.`);
                return false;
            } else {
                console.warn('[NeoNet Enhanced] Some features may be limited due to missing browser support');
            }
        }
        
        return true;
    }
    
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw_enhanced.js');
                console.log('[NeoNet Enhanced] Service Worker registered:', registration);
                
                // Aguardar Service Worker estar ativo
                if (registration.installing) {
                    await new Promise(resolve => {
                        registration.installing.addEventListener('statechange', () => {
                            if (registration.installing.state === 'activated') {
                                resolve();
                            }
                        });
                    });
                }
                
                this.status.serviceWorkerReady = true;
                
                // Configurar comunicação com Service Worker
                navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));
                
            } catch (error) {
                console.error('[NeoNet Enhanced] Service Worker registration failed:', error);
                throw error;
            }
        } else {
            console.warn('[NeoNet Enhanced] Service Workers not supported');
        }
    }
    
    async initializeModules() {
        try {
            // Inicializar CacheManager
            console.log('[NeoNet Enhanced] Initializing CacheManager...');
            this.modules.set('cache', CacheManager);
            this.status.cacheReady = true;
            
            // Inicializar SyncManager
            console.log('[NeoNet Enhanced] Initializing SyncManager...');
            this.modules.set('sync', SyncManager);
            this.status.syncReady = true;
            
            // Inicializar OfflineDependencyManager
            console.log('[NeoNet Enhanced] Initializing OfflineDependencyManager...');
            this.modules.set('offline', OfflineDependencyManager);
            this.status.dependencyManagerReady = true;
            
            console.log('[NeoNet Enhanced] All modules initialized successfully');
        } catch (error) {
            console.error('[NeoNet Enhanced] Module initialization failed:', error);
            throw error;
        }
    }
    
    setupEventListeners() {
        // Listeners de conectividade
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));
        
        // Listeners de módulos
        window.addEventListener('neonet-cache-syncComplete', this.handleCacheSync.bind(this));
        window.addEventListener('neonet-sync-complete', this.handleSyncComplete.bind(this));
        window.addEventListener('neonet-feature-degraded', this.handleFeatureDegradation.bind(this));
        window.addEventListener('neonet-connection-restored', this.handleConnectionRestored.bind(this));
        
        // Listener para visibilidade da página
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        
        // Listener para beforeunload
        window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
    }
    
    async preloadCriticalResources() {
        if (!window.NEONET_CONFIG.offline.preloadCriticalResources) {
            return;
        }
        
        console.log('[NeoNet Enhanced] Preloading critical resources...');
        
        const criticalResources = [
            '/',
            '/index.html',
            '/bundle.js',
            '/mock-dapps/neonet-chat/index.html',
            '/mock-dapps/neonet-chat/manifest.json',
            '/mock-dapps/neonet-chat/style.css',
            '/mock-dapps/neonet-chat/chat.js',
            '/mock-dapps/neonet-notes/index.html',
            '/mock-dapps/neonet-notes/manifest.json',
            '/mock-dapps/neonet-notes/style.css',
            '/mock-dapps/neonet-notes/notes.js'
        ];
        
        try {
            const cacheManager = this.modules.get('cache');
            const results = await cacheManager.preloadCriticalResources(criticalResources);
            
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            console.log(`[NeoNet Enhanced] Preloaded ${successful}/${criticalResources.length} critical resources`);
            
        } catch (error) {
            console.error('[NeoNet Enhanced] Failed to preload critical resources:', error);
        }
    }
    
    setupStatusIndicators() {
        if (!window.NEONET_CONFIG.offline.showOfflineIndicators) {
            return;
        }
        
        // Criar indicador de status na interface
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'neonet-status-indicator';
        statusIndicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            z-index: 10000;
            transition: all 0.3s ease;
            pointer-events: none;
        `;
        
        document.body.appendChild(statusIndicator);
        this.statusIndicator = statusIndicator;
        
        // Atualizar status inicial
        this.updateStatusIndicator();
    }
    
    updateStatusIndicator() {
        if (!this.statusIndicator) return;
        
        const { online } = this.status;
        const offlineManager = this.modules.get('offline');
        const degradedFeatures = offlineManager ? offlineManager.getDegradedFeatures() : [];
        
        if (online && degradedFeatures.length === 0) {
            this.statusIndicator.textContent = '🟢 Online';
            this.statusIndicator.style.backgroundColor = '#4CAF50';
            this.statusIndicator.style.color = 'white';
        } else if (online && degradedFeatures.length > 0) {
            this.statusIndicator.textContent = '🟡 Limitado';
            this.statusIndicator.style.backgroundColor = '#FF9800';
            this.statusIndicator.style.color = 'white';
        } else {
            this.statusIndicator.textContent = '🔴 Offline';
            this.statusIndicator.style.backgroundColor = '#F44336';
            this.statusIndicator.style.color = 'white';
        }
    }
    
    setupGlobalAPI() {
        // API global aprimorada para debug e controle
        window.neonetEnhanced = {
            version: this.version,
            
            // Status
            getStatus: () => ({
                ...this.status,
                modules: Array.from(this.modules.keys()),
                config: window.NEONET_CONFIG
            }),
            
            // Cache
            cache: {
                getStats: () => this.modules.get('cache')?.getCacheStats(),
                clear: () => this.modules.get('cache')?.clearAllCaches(),
                preload: (urls) => this.modules.get('cache')?.preloadCriticalResources(urls)
            },
            
            // Sync
            sync: {
                getStatus: () => this.modules.get('sync')?.getStatus(),
                performSync: () => this.modules.get('sync')?.performSync(),
                setValue: (key, value) => this.modules.get('sync')?.setValue(key, value),
                getValue: (key) => this.modules.get('sync')?.getValue(key)
            },
            
            // Offline
            offline: {
                getStatus: () => this.modules.get('offline')?.getStatus(),
                getDegradedFeatures: () => this.modules.get('offline')?.getDegradedFeatures(),
                setFallbackData: (key, data) => this.modules.get('offline')?.setFallbackData(key, data)
            },
            
            // Utilities
            utils: {
                generateId: () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                formatBytes: (bytes) => {
                    if (bytes === 0) return '0 Bytes';
                    const k = 1024;
                    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                }
            }
        };
        
        // Compatibilidade com API antiga
        window.neonetDebug = window.neonetEnhanced;
    }
    
    // Event handlers
    handleOnline() {
        console.log('[NeoNet Enhanced] Connection restored');
        this.status.online = true;
        this.updateStatusIndicator();
        this.dispatchEvent('neonet-online');
    }
    
    handleOffline() {
        console.log('[NeoNet Enhanced] Connection lost');
        this.status.online = false;
        this.updateStatusIndicator();
        this.dispatchEvent('neonet-offline');
    }
    
    handleServiceWorkerMessage(event) {
        const { data } = event;
        console.log('[NeoNet Enhanced] Service Worker message:', data);
        
        switch (data.type) {
            case 'SYNC_COMPLETE':
                this.dispatchEvent('neonet-sw-sync-complete', data);
                break;
            case 'CACHE_UPDATED':
                this.dispatchEvent('neonet-sw-cache-updated', data);
                break;
        }
    }
    
    handleCacheSync(event) {
        console.log('[NeoNet Enhanced] Cache sync completed:', event.detail);
    }
    
    handleSyncComplete(event) {
        console.log('[NeoNet Enhanced] Data sync completed:', event.detail);
        this.updateStatusIndicator();
    }
    
    handleFeatureDegradation(event) {
        console.warn('[NeoNet Enhanced] Feature degraded:', event.detail);
        this.updateStatusIndicator();
        
        // Mostrar notificação se configurado
        if (window.NEONET_CONFIG.offline.showOfflineIndicators) {
            this.showNotification(`Funcionalidade limitada: ${event.detail.feature}`, 'warning');
        }
    }
    
    handleConnectionRestored(event) {
        console.log('[NeoNet Enhanced] Connection restored:', event.detail);
        this.updateStatusIndicator();
        
        if (window.NEONET_CONFIG.offline.showOfflineIndicators) {
            this.showNotification('Conexão restaurada', 'success');
        }
    }
    
    handleVisibilityChange() {
        if (document.hidden) {
            console.log('[NeoNet Enhanced] Page hidden');
        } else {
            console.log('[NeoNet Enhanced] Page visible');
            // Verificar se precisa sincronizar
            const syncManager = this.modules.get('sync');
            if (syncManager && navigator.onLine) {
                syncManager.performSync();
            }
        }
    }
    
    handleBeforeUnload() {
        console.log('[NeoNet Enhanced] Page unloading');
        // Salvar estado crítico se necessário
    }
    
    handleInitializationError(error) {
        console.error('[NeoNet Enhanced] Critical initialization error:', error);
        
        // Tentar modo de fallback
        try {
            this.initializeFallbackMode();
        } catch (fallbackError) {
            console.error('[NeoNet Enhanced] Fallback mode failed:', fallbackError);
            alert('Erro crítico na inicialização da NeoNet. Recarregue a página.');
        }
    }
    
    initializeFallbackMode() {
        console.log('[NeoNet Enhanced] Initializing fallback mode...');
        
        // Configurar modo básico sem recursos avançados
        window.NEONET_CONFIG.offlineFirst = false;
        window.NEONET_CONFIG.cache.aggressiveCaching = false;
        window.NEONET_CONFIG.sync.enableCRDT = false;
        
        // Notificar sobre modo limitado
        this.showNotification('Modo limitado ativado', 'warning');
    }
    
    // Utilities
    dispatchEvent(type, detail = {}) {
        const event = new CustomEvent(type, { detail });
        window.dispatchEvent(event);
    }
    
    showNotification(message, type = 'info') {
        // Implementação simples de notificação
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 50px;
            right: 10px;
            padding: 12px 16px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10001;
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        switch (type) {
            case 'success':
                notification.style.backgroundColor = '#4CAF50';
                notification.style.color = 'white';
                break;
            case 'warning':
                notification.style.backgroundColor = '#FF9800';
                notification.style.color = 'white';
                break;
            case 'error':
                notification.style.backgroundColor = '#F44336';
                notification.style.color = 'white';
                break;
            default:
                notification.style.backgroundColor = '#2196F3';
                notification.style.color = 'white';
        }
        
        document.body.appendChild(notification);
        
        // Remover após 5 segundos
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
}

// Inicializar NeoNet Enhanced
const neonetEnhanced = new NeoNetEnhanced();

// Exportar para uso em outros módulos
export default neonetEnhanced;

