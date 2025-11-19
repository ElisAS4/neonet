/**
 * DApp Sandbox System for NeoNet
 * Provides secure isolation and execution environment for dApps
 * 
 * Features:
 * - Secure iframe-based sandboxing
 * - Resource and API access control
 * - Communication bridge between sandbox and host
 * - Performance monitoring and limits
 * - Security policy enforcement
 */

export class DAppSandbox {
    constructor(dappConfig, hostAPI) {
        this.dappId = dappConfig.id;
        this.dappName = dappConfig.name || 'Unknown dApp';
        this.dappVersion = dappConfig.version || '1.0.0';
        this.dappUrl = dappConfig.url;
        this.permissions = new Set(dappConfig.permissions || []);
        
        // Host API reference
        this.hostAPI = hostAPI;
        
        // Sandbox elements
        this.iframe = null;
        this.container = null;
        
        // Security policies
        this.securityPolicy = {
            allowScripts: true,
            allowForms: true,
            allowPopups: false,
            allowModals: true,
            allowFullscreen: false,
            allowPointerLock: false,
            allowOrientationLock: false,
            allowPayment: false,
            allowMicrophone: false,
            allowCamera: false,
            allowGeolocation: false,
            allowNotifications: false,
            ...dappConfig.securityPolicy
        };
        
        // Resource limits
        this.resourceLimits = {
            maxMemoryMB: dappConfig.maxMemoryMB || 100,
            maxCPUPercent: dappConfig.maxCPUPercent || 50,
            maxStorageMB: dappConfig.maxStorageMB || 50,
            maxNetworkRequests: dappConfig.maxNetworkRequests || 1000,
            maxExecutionTime: dappConfig.maxExecutionTime || 30000,
            ...dappConfig.resourceLimits
        };
        
        // State management
        this.isLoaded = false;
        this.isRunning = false;
        this.loadStartTime = null;
        this.lastActivity = Date.now();
        
        // Communication
        this.messageQueue = [];
        this.pendingRequests = new Map(); // requestId -> { resolve, reject, timeout }
        this.requestCounter = 0;
        
        // Monitoring
        this.metrics = {
            loadTime: 0,
            memoryUsage: 0,
            cpuUsage: 0,
            networkRequests: 0,
            apiCalls: 0,
            errors: 0,
            lastError: null
        };
        
        // Event handlers
        this.onLoaded = null;
        this.onError = null;
        this.onMessage = null;
        this.onResourceLimitExceeded = null;
        
        this.setupMessageHandling();
    }
    
    // Sandbox creation and management
    async create(containerElement) {
        if (this.iframe) {
            throw new Error('Sandbox already created');
        }
        
        this.container = containerElement;
        this.loadStartTime = Date.now();
        
        // Create iframe with security attributes
        this.iframe = document.createElement('iframe');
        this.iframe.id = `sandbox-${this.dappId}`;
        this.iframe.className = 'dapp-sandbox';
        
        // Set security attributes
        this.iframe.sandbox = this.buildSandboxAttributes();
        this.iframe.allow = this.buildFeaturePolicyAttributes();
        
        // Set CSP (Content Security Policy)
        this.iframe.csp = this.buildCSPPolicy();
        
        // Style the iframe
        this.iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            background: white;
            display: block;
        `;
        
        // Set up event listeners
        this.iframe.onload = () => this.handleLoad();
        this.iframe.onerror = (error) => this.handleError(error);
        
        // Add to container
        this.container.appendChild(this.iframe);
        
        // Load the dApp
        await this.load();
        
        return this.iframe;
    }
    
    buildSandboxAttributes() {
        const attributes = [];
        
        if (this.securityPolicy.allowScripts) {
            attributes.push('allow-scripts');
        }
        
        if (this.securityPolicy.allowForms) {
            attributes.push('allow-forms');
        }
        
        if (this.securityPolicy.allowPopups) {
            attributes.push('allow-popups');
        }
        
        if (this.securityPolicy.allowModals) {
            attributes.push('allow-modals');
        }
        
        // Always allow same-origin for communication
        attributes.push('allow-same-origin');
        
        return attributes.join(' ');
    }
    
    buildFeaturePolicyAttributes() {
        const policies = [];
        
        if (!this.securityPolicy.allowFullscreen) {
            policies.push('fullscreen \'none\'');
        }
        
        if (!this.securityPolicy.allowMicrophone) {
            policies.push('microphone \'none\'');
        }
        
        if (!this.securityPolicy.allowCamera) {
            policies.push('camera \'none\'');
        }
        
        if (!this.securityPolicy.allowGeolocation) {
            policies.push('geolocation \'none\'');
        }
        
        if (!this.securityPolicy.allowPayment) {
            policies.push('payment \'none\'');
        }
        
        return policies.join('; ');
    }
    
    buildCSPPolicy() {
        const directives = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Allow inline scripts for dApps
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self' ws: wss:",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'"
        ];
        
        return directives.join('; ');
    }
    
    async load() {
        try {
            // Create sandbox document
            const sandboxHTML = await this.createSandboxHTML();
            
            // Load into iframe
            const blob = new Blob([sandboxHTML], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            
            this.iframe.src = url;
            
            // Clean up blob URL after loading
            this.iframe.onload = () => {
                URL.revokeObjectURL(url);
                this.handleLoad();
            };
            
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }
    
    async createSandboxHTML() {
        // Fetch dApp content
        let dappContent = '';
        
        if (this.dappUrl) {
            try {
                const response = await fetch(this.dappUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch dApp: ${response.statusText}`);
                }
                dappContent = await response.text();
            } catch (error) {
                console.error(`[DAppSandbox] Failed to load dApp from ${this.dappUrl}:`, error);
                throw error;
            }
        }
        
        // Create sandbox wrapper HTML
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${this.dappName}</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
        }
        .dapp-container {
            width: 100%;
            height: 100vh;
            overflow: auto;
        }
        .dapp-error {
            padding: 20px;
            background: #fee;
            border: 1px solid #fcc;
            border-radius: 4px;
            margin: 20px;
            color: #c33;
        }
        .dapp-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="dapp-container" id="dapp-container">
        <div class="dapp-loading">Loading ${this.dappName}...</div>
    </div>
    
    <script>
        // Sandbox communication bridge
        (function() {
            const dappId = '${this.dappId}';
            const permissions = ${JSON.stringify(Array.from(this.permissions))};
            
            // NeoNet API bridge
            window.NeoNet = {
                dappId: dappId,
                permissions: permissions,
                
                // Send message to host
                sendMessage: function(type, data) {
                    return new Promise((resolve, reject) => {
                        const requestId = Date.now() + '_' + Math.random();
                        
                        window.parent.postMessage({
                            source: 'dapp-sandbox',
                            dappId: dappId,
                            type: 'api-call',
                            requestId: requestId,
                            method: type,
                            data: data
                        }, '*');
                        
                        // Store promise handlers
                        window._pendingRequests = window._pendingRequests || new Map();
                        window._pendingRequests.set(requestId, { resolve, reject });
                        
                        // Timeout after 30 seconds
                        setTimeout(() => {
                            if (window._pendingRequests.has(requestId)) {
                                window._pendingRequests.delete(requestId);
                                reject(new Error('Request timeout'));
                            }
                        }, 30000);
                    });
                },
                
                // API methods
                p2p: {
                    sendMessage: (peerId, data) => window.NeoNet.sendMessage('p2p.sendMessage', { peerId, data }),
                    broadcastMessage: (data) => window.NeoNet.sendMessage('p2p.broadcastMessage', { data }),
                    getPeers: () => window.NeoNet.sendMessage('p2p.getPeers', {}),
                    getConnectedPeers: () => window.NeoNet.sendMessage('p2p.getConnectedPeers', {})
                },
                
                data: {
                    createSet: (id, initialData) => window.NeoNet.sendMessage('data.createSet', { id, initialData }),
                    createMap: (id, initialData) => window.NeoNet.sendMessage('data.createMap', { id, initialData }),
                    getData: (id) => window.NeoNet.sendMessage('data.getData', { id }),
                    getAllData: () => window.NeoNet.sendMessage('data.getAllData', {})
                },
                
                state: {
                    createState: (id, initialValue) => window.NeoNet.sendMessage('state.createState', { id, initialValue }),
                    getState: (id) => window.NeoNet.sendMessage('state.getState', { id }),
                    setState: (id, value) => window.NeoNet.sendMessage('state.setState', { id, value }),
                    subscribe: (id, callback) => {
                        // Store callback for events
                        window._stateCallbacks = window._stateCallbacks || new Map();
                        window._stateCallbacks.set(id, callback);
                        return window.NeoNet.sendMessage('state.subscribe', { id });
                    }
                },
                
                storage: {
                    setItem: (key, value) => window.NeoNet.sendMessage('storage.setItem', { key, value }),
                    getItem: (key) => window.NeoNet.sendMessage('storage.getItem', { key }),
                    removeItem: (key) => window.NeoNet.sendMessage('storage.removeItem', { key }),
                    clear: () => window.NeoNet.sendMessage('storage.clear', {})
                },
                
                ui: {
                    showNotification: (message, type) => window.NeoNet.sendMessage('ui.showNotification', { message, type }),
                    showModal: (content, options) => window.NeoNet.sendMessage('ui.showModal', { content, options }),
                    updateStatus: (status, message) => window.NeoNet.sendMessage('ui.updateStatus', { status, message })
                }
            };
            
            // Handle messages from host
            window.addEventListener('message', function(event) {
                if (event.data.source === 'neonet-host' && event.data.dappId === dappId) {
                    if (event.data.type === 'api-response') {
                        const requestId = event.data.requestId;
                        const pendingRequests = window._pendingRequests || new Map();
                        
                        if (pendingRequests.has(requestId)) {
                            const { resolve, reject } = pendingRequests.get(requestId);
                            pendingRequests.delete(requestId);
                            
                            if (event.data.error) {
                                reject(new Error(event.data.error));
                            } else {
                                resolve(event.data.result);
                            }
                        }
                    } else if (event.data.type === 'event') {
                        // Handle events from host
                        const { eventType, eventData } = event.data;
                        
                        if (eventType === 'state:changed' && window._stateCallbacks) {
                            const callback = window._stateCallbacks.get(eventData.stateId);
                            if (callback) {
                                callback(eventData.value);
                            }
                        }
                        
                        // Dispatch custom event
                        window.dispatchEvent(new CustomEvent('neonet-' + eventType, {
                            detail: eventData
                        }));
                    }
                }
            });
            
            // Error handling
            window.addEventListener('error', function(event) {
                window.parent.postMessage({
                    source: 'dapp-sandbox',
                    dappId: dappId,
                    type: 'error',
                    error: {
                        message: event.message,
                        filename: event.filename,
                        lineno: event.lineno,
                        colno: event.colno,
                        stack: event.error ? event.error.stack : null
                    }
                }, '*');
            });
            
            // Notify host that sandbox is ready
            window.addEventListener('load', function() {
                window.parent.postMessage({
                    source: 'dapp-sandbox',
                    dappId: dappId,
                    type: 'ready'
                }, '*');
            });
        })();
    </script>
    
    ${dappContent}
</body>
</html>
        `;
    }
    
    setupMessageHandling() {
        window.addEventListener('message', (event) => {
            if (event.source === this.iframe.contentWindow) {
                this.handleSandboxMessage(event.data);
            }
        });
    }
    
    handleSandboxMessage(message) {
        if (message.source !== 'dapp-sandbox' || message.dappId !== this.dappId) {
            return;
        }
        
        this.lastActivity = Date.now();
        
        switch (message.type) {
            case 'ready':
                this.handleReady();
                break;
                
            case 'api-call':
                this.handleAPICall(message);
                break;
                
            case 'error':
                this.handleSandboxError(message.error);
                break;
                
            default:
                if (this.onMessage) {
                    this.onMessage(message);
                }
        }
    }
    
    handleReady() {
        this.isLoaded = true;
        this.isRunning = true;
        this.metrics.loadTime = Date.now() - this.loadStartTime;
        
        console.log(`[DAppSandbox] ${this.dappName} loaded in ${this.metrics.loadTime}ms`);
        
        if (this.onLoaded) {
            this.onLoaded();
        }
    }
    
    async handleAPICall(message) {
        const { requestId, method, data } = message;
        
        try {
            // Check permissions
            if (!this.checkPermission(method)) {
                throw new Error(`Permission denied for ${method}`);
            }
            
            // Check resource limits
            this.checkResourceLimits();
            
            // Execute API call
            const result = await this.executeAPICall(method, data);
            
            // Send response
            this.sendResponse(requestId, result);
            
            this.metrics.apiCalls++;
            
        } catch (error) {
            console.error(`[DAppSandbox] API call failed: ${method}`, error);
            this.sendError(requestId, error.message);
            this.metrics.errors++;
            this.metrics.lastError = error.message;
        }
    }
    
    checkPermission(method) {
        const [category] = method.split('.');
        
        const requiredPermissions = {
            'p2p': 'network',
            'data': 'storage',
            'state': 'storage',
            'storage': 'storage',
            'ui': 'ui'
        };
        
        const required = requiredPermissions[category];
        return !required || this.permissions.has(required);
    }
    
    checkResourceLimits() {
        // Check memory usage (simplified)
        if (performance.memory) {
            const memoryMB = performance.memory.usedJSHeapSize / (1024 * 1024);
            this.metrics.memoryUsage = memoryMB;
            
            if (memoryMB > this.resourceLimits.maxMemoryMB) {
                throw new Error(`Memory limit exceeded: ${memoryMB.toFixed(1)}MB > ${this.resourceLimits.maxMemoryMB}MB`);
            }
        }
        
        // Check API call rate
        if (this.metrics.apiCalls > this.resourceLimits.maxNetworkRequests) {
            throw new Error(`API call limit exceeded: ${this.metrics.apiCalls} > ${this.resourceLimits.maxNetworkRequests}`);
        }
    }
    
    async executeAPICall(method, data) {
        const [category, action] = method.split('.');
        
        switch (category) {
            case 'p2p':
                return await this.hostAPI.p2p[action](data);
                
            case 'data':
                return await this.hostAPI.data[action](data);
                
            case 'state':
                return await this.hostAPI.state[action](data);
                
            case 'storage':
                return await this.hostAPI.storage[action](data);
                
            case 'ui':
                return await this.hostAPI.ui[action](data);
                
            default:
                throw new Error(`Unknown API category: ${category}`);
        }
    }
    
    sendResponse(requestId, result) {
        this.iframe.contentWindow.postMessage({
            source: 'neonet-host',
            dappId: this.dappId,
            type: 'api-response',
            requestId: requestId,
            result: result
        }, '*');
    }
    
    sendError(requestId, error) {
        this.iframe.contentWindow.postMessage({
            source: 'neonet-host',
            dappId: this.dappId,
            type: 'api-response',
            requestId: requestId,
            error: error
        }, '*');
    }
    
    sendEvent(eventType, eventData) {
        if (this.iframe && this.iframe.contentWindow) {
            this.iframe.contentWindow.postMessage({
                source: 'neonet-host',
                dappId: this.dappId,
                type: 'event',
                eventType: eventType,
                eventData: eventData
            }, '*');
        }
    }
    
    handleLoad() {
        // Override if needed
    }
    
    handleError(error) {
        console.error(`[DAppSandbox] Error in ${this.dappName}:`, error);
        this.metrics.errors++;
        this.metrics.lastError = error.message || error;
        
        if (this.onError) {
            this.onError(error);
        }
    }
    
    handleSandboxError(error) {
        console.error(`[DAppSandbox] Sandbox error in ${this.dappName}:`, error);
        this.metrics.errors++;
        this.metrics.lastError = error.message;
        
        if (this.onError) {
            this.onError(error);
        }
    }
    
    // Sandbox control
    pause() {
        if (this.isRunning) {
            this.isRunning = false;
            // Hide iframe
            if (this.iframe) {
                this.iframe.style.display = 'none';
            }
        }
    }
    
    resume() {
        if (!this.isRunning && this.isLoaded) {
            this.isRunning = true;
            // Show iframe
            if (this.iframe) {
                this.iframe.style.display = 'block';
            }
        }
    }
    
    reload() {
        if (this.iframe) {
            this.isLoaded = false;
            this.isRunning = false;
            this.loadStartTime = Date.now();
            this.iframe.src = this.iframe.src; // Reload
        }
    }
    
    destroy() {
        if (this.iframe) {
            this.iframe.remove();
            this.iframe = null;
        }
        
        this.isLoaded = false;
        this.isRunning = false;
        this.messageQueue = [];
        this.pendingRequests.clear();
    }
    
    // Status and metrics
    getStatus() {
        return {
            dappId: this.dappId,
            dappName: this.dappName,
            dappVersion: this.dappVersion,
            isLoaded: this.isLoaded,
            isRunning: this.isRunning,
            lastActivity: this.lastActivity,
            permissions: Array.from(this.permissions),
            metrics: { ...this.metrics },
            resourceLimits: { ...this.resourceLimits }
        };
    }
    
    getMetrics() {
        return {
            ...this.metrics,
            uptime: this.isLoaded ? Date.now() - (this.loadStartTime + this.metrics.loadTime) : 0,
            isActive: Date.now() - this.lastActivity < 60000 // Active if used in last minute
        };
    }
    
    updateResourceLimits(newLimits) {
        this.resourceLimits = { ...this.resourceLimits, ...newLimits };
    }
    
    updatePermissions(newPermissions) {
        this.permissions = new Set(newPermissions);
    }
}

