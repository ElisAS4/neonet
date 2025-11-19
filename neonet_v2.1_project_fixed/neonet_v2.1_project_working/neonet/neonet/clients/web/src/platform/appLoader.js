// neonet/clients/web/src/platform/appLoader.js

/**
 * Carregador de Aplicações para NeoNet
 * Gerencia o carregamento e execução de dApps
 */
class AppLoader {
    constructor() {
        this.installedApps = new Map();
        this.runningApps = new Map();
    }

    /**
     * Carrega dApps instaladas
     */
    async loadInstalledDApps() {
        console.log('[AppLoader] Loading installed dApps...');
        
        // Carregar dApps mock (em uma implementação real, seria do IndexedDB)
        const mockApps = [
            {
                id: 'neonet-chat',
                name: 'NeoNet Chat',
                version: '1.0.0',
                description: 'Sistema de chat descentralizado',
                manifestUrl: '/mock-dapps/neonet-chat/manifest.json',
                indexUrl: '/mock-dapps/neonet-chat/index.html'
            },
            {
                id: 'neonet-notes',
                name: 'NeoNet Notes',
                version: '1.0.0',
                description: 'Aplicativo de notas pessoais',
                manifestUrl: '/mock-dapps/neonet-notes/manifest.json',
                indexUrl: '/mock-dapps/neonet-notes/index.html'
            }
        ];

        for (const app of mockApps) {
            try {
                await this.loadApp(app);
                this.installedApps.set(app.id, app);
                console.log('[AppLoader] Loaded dApp:', app.name);
            } catch (error) {
                console.error('[AppLoader] Failed to load dApp:', app.name, error);
            }
        }

        console.log('[AppLoader] Loaded', this.installedApps.size, 'dApps');
    }

    /**
     * Carrega uma dApp específica
     * @param {Object} appInfo - Informações da dApp
     */
    async loadApp(appInfo) {
        try {
            // Carregar manifest
            const manifest = await this.loadManifest(appInfo.manifestUrl);
            appInfo.manifest = manifest;

            // Validar manifest
            if (!this.validateManifest(manifest)) {
                throw new Error('Invalid manifest');
            }

            // Pré-carregar recursos se necessário
            await this.preloadAppResources(appInfo);

        } catch (error) {
            console.error('[AppLoader] Error loading app:', appInfo.id, error);
            throw error;
        }
    }

    /**
     * Carrega o manifest de uma dApp
     * @param {string} manifestUrl - URL do manifest
     * @returns {Object} Manifest da dApp
     */
    async loadManifest(manifestUrl) {
        try {
            const response = await fetch(manifestUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch manifest: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('[AppLoader] Error loading manifest:', manifestUrl, error);
            throw error;
        }
    }

    /**
     * Valida o manifest de uma dApp
     * @param {Object} manifest - Manifest a ser validado
     * @returns {boolean} True se válido
     */
    validateManifest(manifest) {
        const requiredFields = ['name', 'short_name', 'start_url'];
        
        for (const field of requiredFields) {
            if (!manifest[field]) {
                console.error('[AppLoader] Missing required field in manifest:', field);
                return false;
            }
        }

        return true;
    }

    /**
     * Pré-carrega recursos de uma dApp
     * @param {Object} appInfo - Informações da dApp
     */
    async preloadAppResources(appInfo) {
        // Em uma implementação real, isso pré-carregaria CSS, JS e outros recursos
        console.log('[AppLoader] Preloading resources for:', appInfo.name);
        
        // Simular pré-carregamento
        return new Promise(resolve => setTimeout(resolve, 100));
    }

    /**
     * Executa uma dApp
     * @param {string} appId - ID da dApp
     * @returns {Promise<Object>} Instância da dApp em execução
     */
    async runApp(appId) {
        const appInfo = this.installedApps.get(appId);
        if (!appInfo) {
            throw new Error(`App not found: ${appId}`);
        }

        if (this.runningApps.has(appId)) {
            console.log('[AppLoader] App already running:', appId);
            return this.runningApps.get(appId);
        }

        console.log('[AppLoader] Running app:', appInfo.name);

        try {
            // Criar iframe para isolar a dApp
            const appInstance = await this.createAppInstance(appInfo);
            this.runningApps.set(appId, appInstance);
            
            return appInstance;
        } catch (error) {
            console.error('[AppLoader] Failed to run app:', appId, error);
            throw error;
        }
    }

    /**
     * Cria uma instância de dApp em iframe
     * @param {Object} appInfo - Informações da dApp
     * @returns {Object} Instância da dApp
     */
    async createAppInstance(appInfo) {
        return new Promise((resolve, reject) => {
            const iframe = document.createElement('iframe');
            iframe.src = appInfo.indexUrl;
            iframe.style.cssText = `
                width: 100%;
                height: 100%;
                border: none;
                background: white;
            `;

            iframe.onload = () => {
                const appInstance = {
                    id: appInfo.id,
                    name: appInfo.name,
                    iframe: iframe,
                    isRunning: true,
                    startedAt: Date.now(),
                    
                    // Métodos da instância
                    postMessage: (message) => {
                        iframe.contentWindow.postMessage(message, '*');
                    },
                    
                    terminate: () => {
                        this.terminateApp(appInfo.id);
                    }
                };

                resolve(appInstance);
            };

            iframe.onerror = () => {
                reject(new Error(`Failed to load app: ${appInfo.name}`));
            };

            // Não adicionar ao DOM aqui - será feito pelo AppRuntime
        });
    }

    /**
     * Termina uma dApp em execução
     * @param {string} appId - ID da dApp
     */
    terminateApp(appId) {
        const appInstance = this.runningApps.get(appId);
        if (appInstance) {
            if (appInstance.iframe && appInstance.iframe.parentNode) {
                appInstance.iframe.parentNode.removeChild(appInstance.iframe);
            }
            
            appInstance.isRunning = false;
            this.runningApps.delete(appId);
            
            console.log('[AppLoader] Terminated app:', appId);
        }
    }

    /**
     * Obtém lista de dApps instaladas
     * @returns {Array} Lista de dApps instaladas
     */
    getInstalledApps() {
        return Array.from(this.installedApps.values());
    }

    /**
     * Obtém lista de dApps em execução
     * @returns {Array} Lista de dApps em execução
     */
    getRunningApps() {
        return Array.from(this.runningApps.values());
    }

    /**
     * Verifica se uma dApp está em execução
     * @param {string} appId - ID da dApp
     * @returns {boolean} True se estiver em execução
     */
    isAppRunning(appId) {
        return this.runningApps.has(appId);
    }
}

export default AppLoader;

