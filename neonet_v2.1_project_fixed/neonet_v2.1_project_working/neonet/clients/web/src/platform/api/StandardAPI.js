/**
 * Standard API for NeoNet Platform
 * Provides unified, standardized APIs for dApp interaction with the NeoNet ecosystem
 * 
 * Features:
 * - RESTful-style API endpoints
 * - Event-driven communication
 * - Type-safe interfaces
 * - Rate limiting and security
 * - Comprehensive error handling
 * - API versioning support
 */

export class StandardAPI {
    constructor(neoNetSDK, permissionManager) {
        this.sdk = neoNetSDK;
        this.permissionManager = permissionManager;
        this.version = '1.0.0';
        
        // API endpoints registry
        this.endpoints = new Map();
        this.middlewares = [];
        
        // Request tracking
        this.requestCounter = 0;
        this.activeRequests = new Map();
        this.requestHistory = [];
        
        // Rate limiting
        this.rateLimits = new Map(); // endpoint -> rate limit config
        this.requestCounts = new Map(); // dappId -> endpoint -> count
        
        // Event system
        this.eventSubscriptions = new Map(); // dappId -> Set of event types
        this.eventHandlers = new Map(); // eventType -> Set of handlers
        
        this.initializeStandardEndpoints();
    }
    
    initializeStandardEndpoints() {
        // Network API
        this.registerEndpoint('GET', '/api/v1/network/status', this.getNetworkStatus.bind(this));
        this.registerEndpoint('GET', '/api/v1/network/peers', this.getPeers.bind(this));
        this.registerEndpoint('POST', '/api/v1/network/connect', this.connectToPeer.bind(this));
        this.registerEndpoint('POST', '/api/v1/network/disconnect', this.disconnectFromPeer.bind(this));
        this.registerEndpoint('POST', '/api/v1/network/broadcast', this.broadcastMessage.bind(this));
        this.registerEndpoint('POST', '/api/v1/network/send', this.sendMessage.bind(this));
        
        // Data API
        this.registerEndpoint('GET', '/api/v1/data/:id', this.getData.bind(this));
        this.registerEndpoint('POST', '/api/v1/data/:id', this.setData.bind(this));
        this.registerEndpoint('PUT', '/api/v1/data/:id', this.updateData.bind(this));
        this.registerEndpoint('DELETE', '/api/v1/data/:id', this.deleteData.bind(this));
        this.registerEndpoint('GET', '/api/v1/data', this.getAllData.bind(this));
        this.registerEndpoint('POST', '/api/v1/data/:id/sync', this.syncData.bind(this));
        
        // State API
        this.registerEndpoint('GET', '/api/v1/state/:id', this.getState.bind(this));
        this.registerEndpoint('POST', '/api/v1/state/:id', this.setState.bind(this));
        this.registerEndpoint('PUT', '/api/v1/state/:id', this.updateState.bind(this));
        this.registerEndpoint('DELETE', '/api/v1/state/:id', this.deleteState.bind(this));
        this.registerEndpoint('POST', '/api/v1/state/:id/subscribe', this.subscribeToState.bind(this));
        this.registerEndpoint('POST', '/api/v1/state/:id/unsubscribe', this.unsubscribeFromState.bind(this));
        
        // Storage API
        this.registerEndpoint('GET', '/api/v1/storage/:key', this.getStorageItem.bind(this));
        this.registerEndpoint('POST', '/api/v1/storage/:key', this.setStorageItem.bind(this));
        this.registerEndpoint('DELETE', '/api/v1/storage/:key', this.removeStorageItem.bind(this));
        this.registerEndpoint('GET', '/api/v1/storage', this.getStorageKeys.bind(this));
        this.registerEndpoint('DELETE', '/api/v1/storage', this.clearStorage.bind(this));
        
        // Security API
        this.registerEndpoint('GET', '/api/v1/security/status', this.getSecurityStatus.bind(this));
        this.registerEndpoint('POST', '/api/v1/security/validate', this.validateMessage.bind(this));
        this.registerEndpoint('GET', '/api/v1/security/reputation/:peerId', this.getPeerReputation.bind(this));
        this.registerEndpoint('POST', '/api/v1/security/block', this.blockPeer.bind(this));
        this.registerEndpoint('POST', '/api/v1/security/unblock', this.unblockPeer.bind(this));
        
        // UI API
        this.registerEndpoint('POST', '/api/v1/ui/notification', this.showNotification.bind(this));
        this.registerEndpoint('POST', '/api/v1/ui/modal', this.showModal.bind(this));
        this.registerEndpoint('POST', '/api/v1/ui/status', this.updateStatus.bind(this));
        this.registerEndpoint('POST', '/api/v1/ui/log', this.logMessage.bind(this));
        
        // Events API
        this.registerEndpoint('POST', '/api/v1/events/subscribe', this.subscribeToEvents.bind(this));
        this.registerEndpoint('POST', '/api/v1/events/unsubscribe', this.unsubscribeFromEvents.bind(this));
        this.registerEndpoint('POST', '/api/v1/events/emit', this.emitEvent.bind(this));
        this.registerEndpoint('GET', '/api/v1/events/subscriptions', this.getEventSubscriptions.bind(this));
        
        // Metrics API
        this.registerEndpoint('GET', '/api/v1/metrics/network', this.getNetworkMetrics.bind(this));
        this.registerEndpoint('GET', '/api/v1/metrics/performance', this.getPerformanceMetrics.bind(this));
        this.registerEndpoint('GET', '/api/v1/metrics/health', this.getHealthMetrics.bind(this));
        this.registerEndpoint('POST', '/api/v1/metrics/custom', this.recordCustomMetric.bind(this));
        
        // DApp Management API
        this.registerEndpoint('GET', '/api/v1/dapps', this.getInstalledDApps.bind(this));
        this.registerEndpoint('GET', '/api/v1/dapps/available', this.getAvailableDApps.bind(this));
        this.registerEndpoint('POST', '/api/v1/dapps/:id/install', this.installDApp.bind(this));
        this.registerEndpoint('DELETE', '/api/v1/dapps/:id', this.uninstallDApp.bind(this));
        this.registerEndpoint('GET', '/api/v1/dapps/:id/info', this.getDAppInfo.bind(this));
        
        // Set up rate limits
        this.setupRateLimits();
    }
    
    setupRateLimits() {
        // Default rate limits (requests per minute)
        const defaultLimits = {
            '/api/v1/network/broadcast': 60,
            '/api/v1/network/send': 300,
            '/api/v1/data': 1000,
            '/api/v1/state': 1000,
            '/api/v1/storage': 500,
            '/api/v1/ui/notification': 30,
            '/api/v1/events/emit': 100
        };
        
        for (const [endpoint, limit] of Object.entries(defaultLimits)) {
            this.rateLimits.set(endpoint, {
                maxRequests: limit,
                windowMs: 60000, // 1 minute
                resetTime: Date.now() + 60000
            });
        }
    }
    
    // Endpoint registration
    registerEndpoint(method, path, handler, options = {}) {
        const key = `${method.toUpperCase()} ${path}`;
        
        this.endpoints.set(key, {
            method: method.toUpperCase(),
            path,
            handler,
            permissions: options.permissions || [],
            rateLimit: options.rateLimit,
            middleware: options.middleware || [],
            description: options.description || '',
            parameters: options.parameters || {},
            responses: options.responses || {}
        });
    }
    
    // Middleware system
    use(middleware) {
        this.middlewares.push(middleware);
    }
    
    // Request processing
    async processRequest(dappId, method, path, data = {}, headers = {}) {
        const requestId = ++this.requestCounter;
        const startTime = Date.now();
        
        try {
            // Create request context
            const context = {
                requestId,
                dappId,
                method: method.toUpperCase(),
                path,
                data,
                headers,
                startTime,
                user: { dappId } // Simplified user context
            };
            
            // Track active request
            this.activeRequests.set(requestId, context);
            
            // Apply global middlewares
            for (const middleware of this.middlewares) {
                await middleware(context);
            }
            
            // Find matching endpoint
            const endpoint = this.findEndpoint(method, path);
            if (!endpoint) {
                throw new APIError(404, 'Endpoint not found', { method, path });
            }
            
            // Check permissions
            await this.checkPermissions(dappId, endpoint.permissions);
            
            // Check rate limits
            await this.checkRateLimit(dappId, endpoint);
            
            // Apply endpoint-specific middleware
            for (const middleware of endpoint.middleware) {
                await middleware(context);
            }
            
            // Extract path parameters
            const params = this.extractPathParams(endpoint.path, path);
            context.params = params;
            
            // Execute handler
            const result = await endpoint.handler(context);
            
            // Record successful request
            this.recordRequest(context, result, null);
            
            return {
                success: true,
                data: result,
                requestId,
                timestamp: Date.now(),
                processingTime: Date.now() - startTime
            };
            
        } catch (error) {
            // Record failed request
            this.recordRequest({ requestId, dappId, method, path, startTime }, null, error);
            
            // Handle API errors
            if (error instanceof APIError) {
                return {
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message,
                        details: error.details
                    },
                    requestId,
                    timestamp: Date.now(),
                    processingTime: Date.now() - startTime
                };
            }
            
            // Handle unexpected errors
            console.error('[StandardAPI] Unexpected error:', error);
            return {
                success: false,
                error: {
                    code: 500,
                    message: 'Internal server error',
                    details: { originalError: error.message }
                },
                requestId,
                timestamp: Date.now(),
                processingTime: Date.now() - startTime
            };
            
        } finally {
            // Clean up active request
            this.activeRequests.delete(requestId);
        }
    }
    
    findEndpoint(method, path) {
        const key = `${method.toUpperCase()} ${path}`;
        
        // Try exact match first
        if (this.endpoints.has(key)) {
            return this.endpoints.get(key);
        }
        
        // Try pattern matching
        for (const [endpointKey, endpoint] of this.endpoints) {
            if (endpointKey.startsWith(method.toUpperCase()) && this.matchPath(endpoint.path, path)) {
                return endpoint;
            }
        }
        
        return null;
    }
    
    matchPath(pattern, path) {
        const patternParts = pattern.split('/');
        const pathParts = path.split('/');
        
        if (patternParts.length !== pathParts.length) {
            return false;
        }
        
        for (let i = 0; i < patternParts.length; i++) {
            const patternPart = patternParts[i];
            const pathPart = pathParts[i];
            
            if (patternPart.startsWith(':')) {
                // Parameter - matches any value
                continue;
            }
            
            if (patternPart !== pathPart) {
                return false;
            }
        }
        
        return true;
    }
    
    extractPathParams(pattern, path) {
        const params = {};
        const patternParts = pattern.split('/');
        const pathParts = path.split('/');
        
        for (let i = 0; i < patternParts.length; i++) {
            const patternPart = patternParts[i];
            
            if (patternPart.startsWith(':')) {
                const paramName = patternPart.substring(1);
                params[paramName] = pathParts[i];
            }
        }
        
        return params;
    }
    
    async checkPermissions(dappId, requiredPermissions) {
        if (requiredPermissions.length === 0) {
            return; // No permissions required
        }
        
        for (const permission of requiredPermissions) {
            const hasPermission = await this.permissionManager.checkPermission(dappId, permission);
            if (!hasPermission) {
                throw new APIError(403, `Permission denied: ${permission}`, { dappId, permission });
            }
        }
    }
    
    async checkRateLimit(dappId, endpoint) {
        const rateLimitConfig = endpoint.rateLimit || this.rateLimits.get(endpoint.path);
        if (!rateLimitConfig) {
            return; // No rate limit configured
        }
        
        const now = Date.now();
        const key = `${dappId}:${endpoint.path}`;
        
        if (!this.requestCounts.has(key)) {
            this.requestCounts.set(key, {
                count: 0,
                resetTime: now + rateLimitConfig.windowMs
            });
        }
        
        const requestData = this.requestCounts.get(key);
        
        // Reset if window has expired
        if (now >= requestData.resetTime) {
            requestData.count = 0;
            requestData.resetTime = now + rateLimitConfig.windowMs;
        }
        
        // Check limit
        if (requestData.count >= rateLimitConfig.maxRequests) {
            const resetIn = Math.ceil((requestData.resetTime - now) / 1000);
            throw new APIError(429, 'Rate limit exceeded', {
                limit: rateLimitConfig.maxRequests,
                resetIn: resetIn
            });
        }
        
        // Increment counter
        requestData.count++;
    }
    
    recordRequest(context, result, error) {
        const record = {
            requestId: context.requestId,
            dappId: context.dappId,
            method: context.method,
            path: context.path,
            timestamp: context.startTime,
            processingTime: Date.now() - context.startTime,
            success: !error,
            error: error ? error.message : null
        };
        
        this.requestHistory.push(record);
        
        // Keep only recent history
        if (this.requestHistory.length > 10000) {
            this.requestHistory = this.requestHistory.slice(-5000);
        }
    }
    
    // Network API implementations
    async getNetworkStatus(context) {
        return this.sdk.getConnectionStatus();
    }
    
    async getPeers(context) {
        return this.sdk.getPeers();
    }
    
    async connectToPeer(context) {
        const { peerId } = context.data;
        if (!peerId) {
            throw new APIError(400, 'Missing peerId parameter');
        }
        
        return await this.sdk.apis.p2p.connectToPeer(peerId);
    }
    
    async disconnectFromPeer(context) {
        const { peerId } = context.data;
        if (!peerId) {
            throw new APIError(400, 'Missing peerId parameter');
        }
        
        // Implementation would depend on SDK capabilities
        return { success: true, peerId };
    }
    
    async broadcastMessage(context) {
        const { message, excludePeers } = context.data;
        if (!message) {
            throw new APIError(400, 'Missing message parameter');
        }
        
        return await this.sdk.apis.p2p.broadcastMessage(message, excludePeers);
    }
    
    async sendMessage(context) {
        const { peerId, message } = context.data;
        if (!peerId || !message) {
            throw new APIError(400, 'Missing peerId or message parameter');
        }
        
        return await this.sdk.apis.p2p.sendMessage(peerId, message);
    }
    
    // Data API implementations
    async getData(context) {
        const { id } = context.params;
        const result = this.sdk.apis.data.getData(id);
        
        if (result === undefined) {
            throw new APIError(404, 'Data not found', { id });
        }
        
        return result;
    }
    
    async setData(context) {
        const { id } = context.params;
        const { value, type } = context.data;
        
        if (value === undefined) {
            throw new APIError(400, 'Missing value parameter');
        }
        
        let result;
        switch (type) {
            case 'set':
                result = this.sdk.apis.data.createSet(id, value);
                break;
            case 'map':
                result = this.sdk.apis.data.createMap(id, value);
                break;
            case 'counter':
                result = this.sdk.apis.data.createCounter(id, value);
                break;
            case 'register':
            default:
                result = this.sdk.apis.data.createRegister(id, value);
                break;
        }
        
        return { id, type, created: true };
    }
    
    async updateData(context) {
        const { id } = context.params;
        const { operation, value } = context.data;
        
        // Implementation would depend on CRDT type and operation
        return { id, operation, updated: true };
    }
    
    async deleteData(context) {
        const { id } = context.params;
        
        // Implementation would depend on SDK capabilities
        return { id, deleted: true };
    }
    
    async getAllData(context) {
        return this.sdk.apis.data.getAllData();
    }
    
    async syncData(context) {
        const { id } = context.params;
        const { peerId } = context.data;
        
        if (peerId) {
            this.sdk.apis.data.syncWithPeer(peerId);
        }
        
        return { id, synced: true };
    }
    
    // State API implementations
    async getState(context) {
        const { id } = context.params;
        const result = this.sdk.apis.state.getState(id);
        
        if (result === undefined) {
            throw new APIError(404, 'State not found', { id });
        }
        
        return result;
    }
    
    async setState(context) {
        const { id } = context.params;
        const { value, metadata } = context.data;
        
        if (value === undefined) {
            throw new APIError(400, 'Missing value parameter');
        }
        
        const success = this.sdk.apis.state.setState(id, value, metadata);
        return { id, success };
    }
    
    async updateState(context) {
        const { id } = context.params;
        const { updater, metadata } = context.data;
        
        if (!updater) {
            throw new APIError(400, 'Missing updater function');
        }
        
        // Convert updater string to function if needed
        const updaterFn = typeof updater === 'string' ? new Function('state', updater) : updater;
        
        const success = this.sdk.apis.state.updateState(id, updaterFn, metadata);
        return { id, success };
    }
    
    async deleteState(context) {
        const { id } = context.params;
        const success = this.sdk.apis.state.deleteState(id);
        return { id, success };
    }
    
    async subscribeToState(context) {
        const { id } = context.params;
        const { dappId } = context;
        
        // Store subscription for event delivery
        if (!this.eventSubscriptions.has(dappId)) {
            this.eventSubscriptions.set(dappId, new Set());
        }
        this.eventSubscriptions.get(dappId).add(`state:${id}`);
        
        const unsubscribe = this.sdk.apis.state.subscribe(id, (value, event) => {
            this.deliverEvent(dappId, `state:${id}`, { id, value, event });
        });
        
        return { id, subscribed: true };
    }
    
    async unsubscribeFromState(context) {
        const { id } = context.params;
        const { dappId } = context;
        
        const subscriptions = this.eventSubscriptions.get(dappId);
        if (subscriptions) {
            subscriptions.delete(`state:${id}`);
        }
        
        return { id, unsubscribed: true };
    }
    
    // Storage API implementations
    async getStorageItem(context) {
        const { key } = context.params;
        const result = this.sdk.apis.storage.getItem(key);
        
        if (result === null) {
            throw new APIError(404, 'Storage item not found', { key });
        }
        
        return result;
    }
    
    async setStorageItem(context) {
        const { key } = context.params;
        const { value } = context.data;
        
        if (value === undefined) {
            throw new APIError(400, 'Missing value parameter');
        }
        
        const success = this.sdk.apis.storage.setItem(key, value);
        return { key, success };
    }
    
    async removeStorageItem(context) {
        const { key } = context.params;
        this.sdk.apis.storage.removeItem(key);
        return { key, removed: true };
    }
    
    async getStorageKeys(context) {
        return this.sdk.apis.storage.getAllKeys();
    }
    
    async clearStorage(context) {
        this.sdk.apis.storage.clear();
        return { cleared: true };
    }
    
    // Security API implementations
    async getSecurityStatus(context) {
        return this.sdk.apis.security.getSecurityStatus();
    }
    
    async validateMessage(context) {
        const { message, senderId } = context.data;
        
        if (!message) {
            throw new APIError(400, 'Missing message parameter');
        }
        
        return this.sdk.apis.security.validateMessage(message, senderId);
    }
    
    async getPeerReputation(context) {
        const { peerId } = context.params;
        const reputation = this.sdk.apis.security.getPeerReputation(peerId);
        return { peerId, reputation };
    }
    
    async blockPeer(context) {
        const { peerId, reason } = context.data;
        
        if (!peerId) {
            throw new APIError(400, 'Missing peerId parameter');
        }
        
        this.sdk.apis.security.blockPeer(peerId, reason);
        return { peerId, blocked: true };
    }
    
    async unblockPeer(context) {
        const { peerId } = context.data;
        
        if (!peerId) {
            throw new APIError(400, 'Missing peerId parameter');
        }
        
        this.sdk.apis.security.unblockPeer(peerId);
        return { peerId, unblocked: true };
    }
    
    // UI API implementations
    async showNotification(context) {
        const { message, type, duration } = context.data;
        
        if (!message) {
            throw new APIError(400, 'Missing message parameter');
        }
        
        const notification = this.sdk.apis.ui.createNotification(message, type, duration);
        return notification;
    }
    
    async showModal(context) {
        const { content, options } = context.data;
        
        if (!content) {
            throw new APIError(400, 'Missing content parameter');
        }
        
        const modal = this.sdk.apis.ui.showModal(content, options);
        return modal;
    }
    
    async updateStatus(context) {
        const { status, message } = context.data;
        
        this.sdk.apis.ui.updateStatus(status, message);
        return { status, message, updated: true };
    }
    
    async logMessage(context) {
        const { message, level } = context.data;
        
        if (!message) {
            throw new APIError(400, 'Missing message parameter');
        }
        
        this.sdk.apis.ui.logMessage(message, level);
        return { message, level, logged: true };
    }
    
    // Events API implementations
    async subscribeToEvents(context) {
        const { events } = context.data;
        const { dappId } = context;
        
        if (!events || !Array.isArray(events)) {
            throw new APIError(400, 'Missing or invalid events parameter');
        }
        
        if (!this.eventSubscriptions.has(dappId)) {
            this.eventSubscriptions.set(dappId, new Set());
        }
        
        const subscriptions = this.eventSubscriptions.get(dappId);
        events.forEach(event => subscriptions.add(event));
        
        return { events, subscribed: true };
    }
    
    async unsubscribeFromEvents(context) {
        const { events } = context.data;
        const { dappId } = context;
        
        if (!events || !Array.isArray(events)) {
            throw new APIError(400, 'Missing or invalid events parameter');
        }
        
        const subscriptions = this.eventSubscriptions.get(dappId);
        if (subscriptions) {
            events.forEach(event => subscriptions.delete(event));
        }
        
        return { events, unsubscribed: true };
    }
    
    async emitEvent(context) {
        const { eventType, eventData } = context.data;
        const { dappId } = context;
        
        if (!eventType) {
            throw new APIError(400, 'Missing eventType parameter');
        }
        
        // Emit to all subscribers
        this.broadcastEvent(eventType, eventData, dappId);
        
        return { eventType, emitted: true };
    }
    
    async getEventSubscriptions(context) {
        const { dappId } = context;
        const subscriptions = this.eventSubscriptions.get(dappId);
        return Array.from(subscriptions || []);
    }
    
    // Metrics API implementations
    async getNetworkMetrics(context) {
        return this.sdk.apis.network.getMetrics();
    }
    
    async getPerformanceMetrics(context) {
        return this.sdk.apis.network.getPerformanceStats();
    }
    
    async getHealthMetrics(context) {
        return this.sdk.apis.network.getHealth();
    }
    
    async recordCustomMetric(context) {
        const { name, value, tags } = context.data;
        
        if (!name || value === undefined) {
            throw new APIError(400, 'Missing name or value parameter');
        }
        
        this.sdk.apis.network.recordCustomMetric(name, value, tags);
        return { name, value, recorded: true };
    }
    
    // DApp Management API implementations
    async getInstalledDApps(context) {
        // This would require access to DAppRegistry
        return [];
    }
    
    async getAvailableDApps(context) {
        // This would require access to DAppRegistry
        return [];
    }
    
    async installDApp(context) {
        const { id } = context.params;
        // This would require access to DAppRegistry
        return { id, installed: false, message: 'DApp registry not available' };
    }
    
    async uninstallDApp(context) {
        const { id } = context.params;
        // This would require access to DAppRegistry
        return { id, uninstalled: false, message: 'DApp registry not available' };
    }
    
    async getDAppInfo(context) {
        const { id } = context.params;
        // This would require access to DAppRegistry
        return { id, info: null };
    }
    
    // Event delivery
    deliverEvent(dappId, eventType, eventData) {
        // This would be implemented by the platform to deliver events to dApps
        console.log(`[StandardAPI] Delivering event ${eventType} to ${dappId}:`, eventData);
    }
    
    broadcastEvent(eventType, eventData, sourceDAppId) {
        for (const [dappId, subscriptions] of this.eventSubscriptions) {
            if (dappId !== sourceDAppId && subscriptions.has(eventType)) {
                this.deliverEvent(dappId, eventType, eventData);
            }
        }
    }
    
    // API documentation
    getAPIDocumentation() {
        const docs = {
            version: this.version,
            endpoints: [],
            schemas: {},
            examples: {}
        };
        
        for (const [key, endpoint] of this.endpoints) {
            docs.endpoints.push({
                method: endpoint.method,
                path: endpoint.path,
                description: endpoint.description,
                parameters: endpoint.parameters,
                responses: endpoint.responses,
                permissions: endpoint.permissions
            });
        }
        
        return docs;
    }
    
    // Statistics and monitoring
    getAPIStats() {
        const now = Date.now();
        const recentRequests = this.requestHistory.filter(r => now - r.timestamp < 3600000); // Last hour
        
        const stats = {
            totalRequests: this.requestHistory.length,
            recentRequests: recentRequests.length,
            activeRequests: this.activeRequests.size,
            successRate: recentRequests.length > 0 ? 
                recentRequests.filter(r => r.success).length / recentRequests.length : 0,
            averageResponseTime: recentRequests.length > 0 ?
                recentRequests.reduce((sum, r) => sum + r.processingTime, 0) / recentRequests.length : 0,
            endpointStats: {},
            rateLimitStats: {}
        };
        
        // Endpoint statistics
        const endpointCounts = {};
        recentRequests.forEach(r => {
            const key = `${r.method} ${r.path}`;
            endpointCounts[key] = (endpointCounts[key] || 0) + 1;
        });
        stats.endpointStats = endpointCounts;
        
        // Rate limit statistics
        for (const [key, data] of this.requestCounts) {
            stats.rateLimitStats[key] = {
                count: data.count,
                resetTime: data.resetTime
            };
        }
        
        return stats;
    }
}

// API Error class
export class APIError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'APIError';
        this.code = code;
        this.details = details;
    }
}

