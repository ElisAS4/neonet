// neonet/clients/web/src/app_enhanced.js
// Aplicação Principal NeoNet - Versão Aprimorada com Arquitetura Offline-First

import UIManager from './ui/uiManager.js';
import PeerManager from './p2p/peerManager.js';
import AppLoader from './platform/appLoader.js';
import IndexedDBManager from './utils/IndexedDBManager.js';
import CacheManager from './utils/CacheManager_enhanced.js';
import SyncManager from './utils/SyncManager_enhanced.js';
import OfflineDependencyManager from './utils/OfflineDependencyManager.js';

/**
 * Classe principal da aplicação NeoNet Enhanced.
 * Orquestra a inicialização dos módulos e a lógica central com foco em funcionamento offline-first.
 */
class NeoNetAppEnhanced {
    constructor() {
        this.version = '2.0.0';
        this.initialized = false;
        this.startTime = Date.now();
        
        // Módulos principais
        this.uiManager = new UIManager();
        this.peerManager = new PeerManager();
        this.appLoader = new AppLoader();
        this.dbManager = IndexedDBManager;
        this.cacheManager = CacheManager;
        this.syncManager = SyncManager;
        this.offlineManager = OfflineDependencyManager;
        
        // Estado da aplicação
        this.state = {
            online: navigator.onLine,
            p2pConnected: false,
            dbReady: false,
            swReady: false,
            dappsLoaded: false,
            syncReady: false,
            cacheReady: false
        };
        
        // Configurações
        this.config = {
            enableOfflineFirst: true,
            enableP2P: true,
            enableAutoSync: true,
            enableBackgroundSync: true,
            maxRetries: 3,
            retryDelay: 1000,
            syncInterval: 30000,
            healthCheckInterval: 60000
        };
        
        // Métricas
        this.metrics = {
            startupTime: 0,
            p2pConnections: 0,
            syncOperations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0
        };
        
        // Event listeners
        this.eventListeners = new Map();
        
        // Bind methods
        this.handleOnline = this.handleOnline.bind(this);
        this.handleOffline = this.handleOffline.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    }
    
    /**
     * Inicializa a aplicação NeoNet Enhanced.
     */
    async init() {
        try {
            console.log(`[NeoNet App Enhanced] Initializing version ${this.version}...`);
            
            // Configurar event listeners globais
            this.setupGlobalEventListeners();
            
            // Verificar compatibilidade do navegador
            if (!this.checkBrowserCompatibility()) {
                throw new Error('Browser not compatible');
            }
            
            // Inicializar módulos em ordem de dependência
            await this.initializeCore();
            await this.initializeStorage();
            await this.initializeServiceWorker();
            await this.initializeUI();
            await this.initializeNetworking();
            await this.initializeDApps();
            await this.initializeSync();
            
            // Configurar monitoramento e manutenção
            this.setupHealthChecks();
            this.setupPeriodicMaintenance();
            
            // Finalizar inicialização
            this.finializeInitialization();
            
            console.log(`[NeoNet App Enhanced] Initialization completed in ${Date.now() - this.startTime}ms`);
            
        } catch (error) {
            console.error('[NeoNet App Enhanced] Initialization failed:', error);
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
            promises: !!window.Promise,
            es6: (() => {
                try {
                    new Function('(a = 0) => a');
                    return true;
                } catch (e) {
                    return false;
                }
            })()
        };
        
        const missing = Object.entries(requirements)
            .filter(([key, supported]) => !supported)
            .map(([key]) => key);
        
        if (missing.length > 0) {
            console.error('[NeoNet App Enhanced] Missing browser features:', missing);
            
            // Recursos críticos
            const critical = ['indexedDB', 'serviceWorker', 'fetch', 'promises'];
            const criticalMissing = missing.filter(feature => critical.includes(feature));
            
            if (criticalMissing.length > 0) {
                this.uiManager?.displayMessage(
                    `Seu navegador não suporta recursos críticos: ${criticalMissing.join(', ')}. A NeoNet pode não funcionar corretamente.`,
                    'error'
                );
                return false;
            } else {
                this.uiManager?.displayMessage(
                    'Alguns recursos avançados podem estar limitados devido ao suporte do navegador.',
                    'warning'
                );
            }
        }
        
        return true;
    }
    
    async initializeCore() {
        console.log('[NeoNet App Enhanced] Initializing core modules...');
        
        try {
            // Configurar configurações globais
            window.NEONET_CONFIG = {
                ...window.NEONET_CONFIG,
                version: this.version,
                enhanced: true,
                startTime: this.startTime
            };
            
            // Inicializar gerenciadores offline
            await this.offlineManager.init();
            
            console.log('[NeoNet App Enhanced] Core modules initialized');
        } catch (error) {
            console.error('[NeoNet App Enhanced] Core initialization failed:', error);
            throw error;
        }
    }
    
    async initializeStorage() {
        console.log('[NeoNet App Enhanced] Initializing storage...');
        
        try {
            // Inicializar IndexedDB
            await this.dbManager.open();
            this.state.dbReady = true;
            console.log('[NeoNet App Enhanced] IndexedDB initialized successfully');
            
            // Inicializar cache manager
            await this.cacheManager.init();
            this.state.cacheReady = true;
            console.log('[NeoNet App Enhanced] Cache manager initialized');
            
        } catch (error) {
            console.error('[NeoNet App Enhanced] Storage initialization failed:', error);
            this.uiManager?.displayMessage('Erro ao inicializar o armazenamento local.', 'error');
            
            // Tentar modo de fallback
            this.initFallbackStorage();
        }
    }
    
    async initializeServiceWorker() {
        console.log('[NeoNet App Enhanced] Initializing Service Worker...');
        
        if ('serviceWorker' in navigator) {
            try {
                // Tentar registrar Service Worker aprimorado primeiro
                let registration;
                try {
                    registration = await navigator.serviceWorker.register('/sw_enhanced.js');
                    console.log('[NeoNet App Enhanced] Enhanced Service Worker registered');
                } catch (enhancedError) {
                    console.warn('[NeoNet App Enhanced] Enhanced SW failed, falling back to basic SW');
                    registration = await navigator.serviceWorker.register('/sw.js');
                }
                
                this.state.swReady = true;
                console.log('[NeoNet App Enhanced] Service Worker registered with scope:', registration.scope);
                
                // Configurar comunicação com Service Worker
                navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));
                
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
                
            } catch (error) {
                console.error('[NeoNet App Enhanced] Service Worker registration failed:', error);
                this.uiManager?.displayMessage('Erro ao registrar o Service Worker.', 'warning');
            }
        } else {
            console.warn('[NeoNet App Enhanced] Service Workers not supported');
            this.uiManager?.displayMessage('Service Workers não suportados. Funcionalidade offline limitada.', 'warning');
        }
    }
    
    async initializeUI() {
        console.log('[NeoNet App Enhanced] Initializing UI...');
        
        try {
            // Inicializar UI Manager
            this.uiManager.init();
            
            // Mostrar mensagem de boas-vindas
            this.uiManager.displayMessage(`Bem-vindo à NeoNet Enhanced v${this.version}!`, 'info');
            
            // Configurar indicadores de status
            this.setupStatusIndicators();
            
            // Configurar interface offline-first
            this.setupOfflineUI();
            
            console.log('[NeoNet App Enhanced] UI initialized');
        } catch (error) {
            console.error('[NeoNet App Enhanced] UI initialization failed:', error);
            // UI é crítica, mas não deve impedir o funcionamento
        }
    }
    
    async initializeNetworking() {
        console.log('[NeoNet App Enhanced] Initializing networking...');
        
        if (!this.config.enableP2P) {
            console.log('[NeoNet App Enhanced] P2P disabled by configuration');
            return;
        }
        
        try {
            // Conectar à rede P2P
            await this.peerManager.connect();
            this.state.p2pConnected = true;
            this.metrics.p2pConnections = this.peerManager.getConnectedPeersCount();
            
            this.uiManager?.updateNetworkStatus('online', this.metrics.p2pConnections);
            console.log('[NeoNet App Enhanced] Connected to P2P network');
            
            // Configurar event listeners do P2P
            this.setupP2PEventListeners();
            
        } catch (error) {
            console.error('[NeoNet App Enhanced] Failed to connect to P2P network:', error);
            this.state.p2pConnected = false;
            this.uiManager?.updateNetworkStatus('offline', 0);
            this.uiManager?.displayMessage(
                'Não foi possível conectar à rede P2P. Operando em modo offline.',
                'warning'
            );
        }
    }
    
    async initializeDApps() {
        console.log('[NeoNet App Enhanced] Initializing dApps...');
        
        try {
            // Carregar dApps instalados
            await this.appLoader.loadInstalledDApps();
            this.state.dappsLoaded = true;
            
            // Configurar comunicação com dApps
            this.setupDAppCommunication();
            
            console.log('[NeoNet App Enhanced] dApps loaded successfully');
        } catch (error) {
            console.error('[NeoNet App Enhanced] dApps initialization failed:', error);
            this.uiManager?.displayMessage('Erro ao carregar dApps.', 'warning');
        }
    }
    
    async initializeSync() {
        console.log('[NeoNet App Enhanced] Initializing synchronization...');
        
        if (!this.config.enableAutoSync) {
            console.log('[NeoNet App Enhanced] Auto-sync disabled by configuration');
            return;
        }
        
        try {
            // Inicializar sync manager
            await this.syncManager.init();
            this.state.syncReady = true;
            
            // Configurar sincronização automática
            this.setupAutoSync();
            
            console.log('[NeoNet App Enhanced] Synchronization initialized');
        } catch (error) {
            console.error('[NeoNet App Enhanced] Sync initialization failed:', error);
            this.uiManager?.displayMessage('Erro ao inicializar sincronização.', 'warning');
        }
    }
    
    setupGlobalEventListeners() {
        // Conectividade
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
        
        // Visibilidade da página
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        
        // Antes de sair
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        
        // Erros globais
        window.addEventListener('error', this.handleGlobalError.bind(this));
        window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));
        
        // Eventos customizados do NeoNet
        window.addEventListener('neonet-sync-complete', this.handleSyncComplete.bind(this));
        window.addEventListener('neonet-cache-updated', this.handleCacheUpdated.bind(this));
        window.addEventListener('neonet-peer-connected', this.handlePeerConnected.bind(this));
        window.addEventListener('neonet-peer-disconnected', this.handlePeerDisconnected.bind(this));
    }
    
    setupStatusIndicators() {
        // Criar indicadores de status na UI
        const statusContainer = document.createElement('div');
        statusContainer.id = 'neonet-status-container';
        statusContainer.className = 'status-container';
        
        statusContainer.innerHTML = `
            <div class="status-item" id="connection-status">
                <span class="status-icon">🌐</span>
                <span class="status-text">Conectando...</span>
            </div>
            <div class="status-item" id="sync-status">
                <span class="status-icon">⟳</span>
                <span class="status-text">Sincronizando...</span>
            </div>
            <div class="status-item" id="cache-status">
                <span class="status-icon">💾</span>
                <span class="status-text">Cache OK</span>
            </div>
        `;
        
        document.body.appendChild(statusContainer);
        
        // Atualizar status inicial
        this.updateStatusIndicators();
    }
    
    setupOfflineUI() {
        // Configurar interface para funcionamento offline
        const offlineIndicator = document.createElement('div');
        offlineIndicator.id = 'offline-indicator';
        offlineIndicator.className = 'offline-indicator hidden';
        offlineIndicator.innerHTML = `
            <div class="offline-content">
                <span class="offline-icon">📱</span>
                <span class="offline-text">Modo Offline</span>
                <span class="offline-details">Suas alterações serão sincronizadas quando a conexão for restaurada</span>
            </div>
        `;
        
        document.body.appendChild(offlineIndicator);
    }
    
    setupP2PEventListeners() {
        // Configurar listeners para eventos P2P
        this.peerManager.on('peer-connected', (peer) => {
            this.handlePeerConnected({ detail: peer });
        });
        
        this.peerManager.on('peer-disconnected', (peer) => {
            this.handlePeerDisconnected({ detail: peer });
        });
        
        this.peerManager.on('data-received', (data) => {
            this.handleP2PData(data);
        });
    }
    
    setupDAppCommunication() {
        // Configurar comunicação com dApps via postMessage
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type && event.data.type.startsWith('neonet-dapp-')) {
                this.handleDAppMessage(event.data);
            }
        });
    }
    
    setupAutoSync() {
        if (!this.config.enableAutoSync) return;
        
        // Sincronização periódica
        setInterval(() => {
            if (this.state.online && this.state.syncReady) {
                this.performSync();
            }
        }, this.config.syncInterval);
        
        // Sincronização quando voltar online
        window.addEventListener('online', () => {
            setTimeout(() => this.performSync(), 1000);
        });
    }
    
    setupHealthChecks() {
        // Verificações de saúde periódicas
        setInterval(() => {
            this.performHealthCheck();
        }, this.config.healthCheckInterval);
    }
    
    setupPeriodicMaintenance() {
        // Manutenção periódica (limpeza de cache, etc.)
        setInterval(() => {
            this.performMaintenance();
        }, 60 * 60 * 1000); // 1 hora
    }
    
    finializeInitialization() {
        this.initialized = true;
        this.metrics.startupTime = Date.now() - this.startTime;
        
        // Atualizar status final
        this.updateStatusIndicators();
        
        // Notificar inicialização completa
        this.dispatchEvent('neonet-app-ready', {
            version: this.version,
            startupTime: this.metrics.startupTime,
            state: this.state
        });
        
        // Configurar API global
        this.setupGlobalAPI();
        
        console.log('[NeoNet App Enhanced] Application ready');
    }
    
    setupGlobalAPI() {
        // API global para debug e controle
        window.neonetApp = {
            version: this.version,
            state: this.state,
            metrics: this.metrics,
            
            // Métodos de controle
            getStatus: () => this.getStatus(),
            performSync: () => this.performSync(),
            performHealthCheck: () => this.performHealthCheck(),
            clearCache: () => this.clearCache(),
            exportData: () => this.exportData(),
            importData: (data) => this.importData(data),
            
            // Configurações
            getConfig: () => this.config,
            setConfig: (newConfig) => Object.assign(this.config, newConfig),
            
            // Módulos
            modules: {
                ui: this.uiManager,
                peer: this.peerManager,
                app: this.appLoader,
                db: this.dbManager,
                cache: this.cacheManager,
                sync: this.syncManager,
                offline: this.offlineManager
            }
        };
    }
    
    // Event handlers
    handleOnline() {
        console.log('[NeoNet App Enhanced] Connection restored');
        this.state.online = true;
        this.updateStatusIndicators();
        
        // Tentar reconectar P2P se necessário
        if (!this.state.p2pConnected && this.config.enableP2P) {
            this.reconnectP2P();
        }
        
        // Sincronizar dados
        if (this.state.syncReady) {
            setTimeout(() => this.performSync(), 1000);
        }
        
        // Ocultar indicador offline
        const offlineIndicator = document.getElementById('offline-indicator');
        if (offlineIndicator) {
            offlineIndicator.classList.add('hidden');
        }
        
        this.uiManager?.displayMessage('Conexão restaurada', 'success');
    }
    
    handleOffline() {
        console.log('[NeoNet App Enhanced] Connection lost');
        this.state.online = false;
        this.state.p2pConnected = false;
        this.updateStatusIndicators();
        
        // Mostrar indicador offline
        const offlineIndicator = document.getElementById('offline-indicator');
        if (offlineIndicator) {
            offlineIndicator.classList.remove('hidden');
        }
        
        this.uiManager?.displayMessage('Modo offline ativado', 'info');
    }
    
    handleVisibilityChange() {
        if (document.hidden) {
            console.log('[NeoNet App Enhanced] Page hidden');
            // Pausar operações não críticas
        } else {
            console.log('[NeoNet App Enhanced] Page visible');
            // Retomar operações e verificar sincronização
            if (this.state.online && this.state.syncReady) {
                this.performSync();
            }
        }
    }
    
    handleBeforeUnload() {
        console.log('[NeoNet App Enhanced] Page unloading');
        // Salvar estado crítico
        this.saveApplicationState();
    }
    
    handleGlobalError(event) {
        console.error('[NeoNet App Enhanced] Global error:', event.error);
        this.metrics.errors++;
        
        // Log do erro para análise
        this.logError('global', event.error);
    }
    
    handleUnhandledRejection(event) {
        console.error('[NeoNet App Enhanced] Unhandled promise rejection:', event.reason);
        this.metrics.errors++;
        
        // Log do erro para análise
        this.logError('promise', event.reason);
    }
    
    handleServiceWorkerMessage(event) {
        const { data } = event;
        console.log('[NeoNet App Enhanced] Service Worker message:', data);
        
        switch (data.type) {
            case 'SYNC_COMPLETE':
                this.handleSyncComplete({ detail: data });
                break;
            case 'CACHE_UPDATED':
                this.handleCacheUpdated({ detail: data });
                break;
        }
    }
    
    handleSyncComplete(event) {
        console.log('[NeoNet App Enhanced] Sync completed:', event.detail);
        this.metrics.syncOperations++;
        this.updateStatusIndicators();
    }
    
    handleCacheUpdated(event) {
        console.log('[NeoNet App Enhanced] Cache updated:', event.detail);
        this.updateStatusIndicators();
    }
    
    handlePeerConnected(event) {
        console.log('[NeoNet App Enhanced] Peer connected:', event.detail);
        this.metrics.p2pConnections++;
        this.state.p2pConnected = true;
        this.updateStatusIndicators();
    }
    
    handlePeerDisconnected(event) {
        console.log('[NeoNet App Enhanced] Peer disconnected:', event.detail);
        this.metrics.p2pConnections = Math.max(0, this.metrics.p2pConnections - 1);
        
        if (this.metrics.p2pConnections === 0) {
            this.state.p2pConnected = false;
        }
        
        this.updateStatusIndicators();
    }
    
    handleP2PData(data) {
        console.log('[NeoNet App Enhanced] P2P data received:', data);
        
        // Processar dados P2P e encaminhar para módulos apropriados
        if (data.type === 'sync-data') {
            this.syncManager?.handleRemoteData(data);
        } else if (data.type === 'dapp-message') {
            this.forwardToDApp(data);
        }
    }
    
    handleDAppMessage(data) {
        console.log('[NeoNet App Enhanced] dApp message:', data);
        
        switch (data.type) {
            case 'neonet-dapp-register':
                this.registerDApp(data.dapp);
                break;
            case 'neonet-dapp-broadcast':
                this.broadcastDAppMessage(data);
                break;
            case 'neonet-dapp-sync':
                this.syncDAppData(data);
                break;
        }
    }
    
    handleInitializationError(error) {
        console.error('[NeoNet App Enhanced] Critical initialization error:', error);
        this.metrics.errors++;
        
        // Tentar modo de fallback
        try {
            this.initFallbackMode();
        } catch (fallbackError) {
            console.error('[NeoNet App Enhanced] Fallback mode failed:', fallbackError);
            this.uiManager?.displayMessage(
                'Erro crítico na inicialização. Recarregue a página.',
                'error'
            );
        }
    }
    
    // Métodos auxiliares
    updateStatusIndicators() {
        const connectionStatus = document.getElementById('connection-status');
        const syncStatus = document.getElementById('sync-status');
        const cacheStatus = document.getElementById('cache-status');
        
        if (connectionStatus) {
            const icon = connectionStatus.querySelector('.status-icon');
            const text = connectionStatus.querySelector('.status-text');
            
            if (this.state.online && this.state.p2pConnected) {
                icon.textContent = '🟢';
                text.textContent = `Online (${this.metrics.p2pConnections} peers)`;
            } else if (this.state.online) {
                icon.textContent = '🟡';
                text.textContent = 'Online (sem P2P)';
            } else {
                icon.textContent = '🔴';
                text.textContent = 'Offline';
            }
        }
        
        if (syncStatus) {
            const icon = syncStatus.querySelector('.status-icon');
            const text = syncStatus.querySelector('.status-text');
            
            if (this.state.syncReady) {
                icon.textContent = '✓';
                text.textContent = 'Sincronizado';
            } else {
                icon.textContent = '⏳';
                text.textContent = 'Aguardando...';
            }
        }
        
        if (cacheStatus) {
            const icon = cacheStatus.querySelector('.status-icon');
            const text = cacheStatus.querySelector('.status-text');
            
            if (this.state.cacheReady) {
                icon.textContent = '✓';
                text.textContent = 'Cache OK';
            } else {
                icon.textContent = '⚠️';
                text.textContent = 'Cache limitado';
            }
        }
    }
    
    async performSync() {
        if (!this.state.syncReady || !this.state.online) {
            return;
        }
        
        try {
            console.log('[NeoNet App Enhanced] Performing sync...');
            await this.syncManager.performSync();
            this.metrics.syncOperations++;
        } catch (error) {
            console.error('[NeoNet App Enhanced] Sync failed:', error);
            this.metrics.errors++;
        }
    }
    
    async performHealthCheck() {
        console.log('[NeoNet App Enhanced] Performing health check...');
        
        const health = {
            timestamp: Date.now(),
            online: this.state.online,
            dbReady: this.state.dbReady,
            swReady: this.state.swReady,
            p2pConnected: this.state.p2pConnected,
            syncReady: this.state.syncReady,
            cacheReady: this.state.cacheReady,
            metrics: { ...this.metrics }
        };
        
        // Verificar se há problemas críticos
        const criticalIssues = [];
        
        if (!this.state.dbReady) {
            criticalIssues.push('Database not ready');
        }
        
        if (this.metrics.errors > 10) {
            criticalIssues.push('High error count');
        }
        
        if (criticalIssues.length > 0) {
            console.warn('[NeoNet App Enhanced] Health check found issues:', criticalIssues);
            this.uiManager?.displayMessage(
                `Problemas detectados: ${criticalIssues.join(', ')}`,
                'warning'
            );
        }
        
        return health;
    }
    
    async performMaintenance() {
        console.log('[NeoNet App Enhanced] Performing maintenance...');
        
        try {
            // Limpeza de cache
            if (this.state.cacheReady) {
                await this.cacheManager.cleanExpiredEntries();
            }
            
            // Limpeza de dados antigos
            if (this.state.dbReady) {
                // Implementar limpeza de dados antigos se necessário
            }
            
            // Reset de métricas se necessário
            if (this.metrics.errors > 100) {
                this.metrics.errors = 0;
            }
            
            console.log('[NeoNet App Enhanced] Maintenance completed');
        } catch (error) {
            console.error('[NeoNet App Enhanced] Maintenance failed:', error);
        }
    }
    
    async reconnectP2P() {
        if (!this.config.enableP2P) return;
        
        try {
            console.log('[NeoNet App Enhanced] Attempting P2P reconnection...');
            await this.peerManager.connect();
            this.state.p2pConnected = true;
            this.metrics.p2pConnections = this.peerManager.getConnectedPeersCount();
            this.updateStatusIndicators();
            console.log('[NeoNet App Enhanced] P2P reconnected successfully');
        } catch (error) {
            console.error('[NeoNet App Enhanced] P2P reconnection failed:', error);
        }
    }
    
    initFallbackMode() {
        console.log('[NeoNet App Enhanced] Initializing fallback mode...');
        
        // Desabilitar recursos avançados
        this.config.enableP2P = false;
        this.config.enableAutoSync = false;
        this.config.enableBackgroundSync = false;
        
        // Usar localStorage como fallback
        this.useFallbackStorage = true;
        
        // Notificar sobre modo limitado
        this.uiManager?.displayMessage(
            'Modo limitado ativado. Algumas funcionalidades podem não estar disponíveis.',
            'warning'
        );
    }
    
    initFallbackStorage() {
        console.log('[NeoNet App Enhanced] Initializing fallback storage...');
        
        // Implementar fallback usando localStorage
        this.fallbackStorage = {
            get: (key) => {
                try {
                    const data = localStorage.getItem(`neonet-${key}`);
                    return data ? JSON.parse(data) : null;
                } catch (error) {
                    console.error('Fallback storage get error:', error);
                    return null;
                }
            },
            set: (key, value) => {
                try {
                    localStorage.setItem(`neonet-${key}`, JSON.stringify(value));
                    return true;
                } catch (error) {
                    console.error('Fallback storage set error:', error);
                    return false;
                }
            },
            delete: (key) => {
                try {
                    localStorage.removeItem(`neonet-${key}`);
                    return true;
                } catch (error) {
                    console.error('Fallback storage delete error:', error);
                    return false;
                }
            }
        };
    }
    
    saveApplicationState() {
        try {
            const state = {
                version: this.version,
                timestamp: Date.now(),
                state: this.state,
                metrics: this.metrics,
                config: this.config
            };
            
            localStorage.setItem('neonet-app-state', JSON.stringify(state));
        } catch (error) {
            console.error('[NeoNet App Enhanced] Error saving application state:', error);
        }
    }
    
    logError(type, error) {
        try {
            const errorLog = {
                type,
                message: error.message || error,
                stack: error.stack,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                url: window.location.href
            };
            
            // Salvar no IndexedDB se disponível
            if (this.state.dbReady) {
                this.dbManager.add('errorLogs', errorLog);
            } else {
                // Fallback para localStorage
                const logs = JSON.parse(localStorage.getItem('neonet-error-logs') || '[]');
                logs.push(errorLog);
                
                // Manter apenas últimos 50 logs
                if (logs.length > 50) {
                    logs.splice(0, logs.length - 50);
                }
                
                localStorage.setItem('neonet-error-logs', JSON.stringify(logs));
            }
        } catch (logError) {
            console.error('[NeoNet App Enhanced] Error logging failed:', logError);
        }
    }
    
    registerDApp(dapp) {
        console.log('[NeoNet App Enhanced] Registering dApp:', dapp);
        // Implementar registro de dApp
    }
    
    broadcastDAppMessage(data) {
        console.log('[NeoNet App Enhanced] Broadcasting dApp message:', data);
        
        // Enviar via P2P se conectado
        if (this.state.p2pConnected) {
            this.peerManager.broadcast(data);
        }
    }
    
    syncDAppData(data) {
        console.log('[NeoNet App Enhanced] Syncing dApp data:', data);
        
        // Encaminhar para sync manager
        if (this.state.syncReady) {
            this.syncManager.handleDAppSync(data);
        }
    }
    
    forwardToDApp(data) {
        // Encaminhar dados para dApp específico
        const targetFrame = document.querySelector(`iframe[data-dapp-id="${data.targetDApp}"]`);
        if (targetFrame) {
            targetFrame.contentWindow.postMessage(data, '*');
        }
    }
    
    dispatchEvent(type, detail) {
        const event = new CustomEvent(type, { detail });
        window.dispatchEvent(event);
    }
    
    // API pública
    getStatus() {
        return {
            version: this.version,
            initialized: this.initialized,
            state: { ...this.state },
            metrics: { ...this.metrics },
            config: { ...this.config },
            uptime: Date.now() - this.startTime
        };
    }
    
    async clearCache() {
        if (this.state.cacheReady) {
            return await this.cacheManager.clearAllCaches();
        }
        return false;
    }
    
    async exportData() {
        // Implementar exportação de dados
        const data = {
            version: this.version,
            timestamp: Date.now(),
            state: this.state,
            metrics: this.metrics
        };
        
        return data;
    }
    
    async importData(data) {
        // Implementar importação de dados
        console.log('[NeoNet App Enhanced] Importing data:', data);
    }
}

// Inicializar aplicação quando DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    window.neonetAppInstance = new NeoNetAppEnhanced();
    window.neonetAppInstance.init();
});

// Exportar para uso em outros módulos
export default NeoNetAppEnhanced;

