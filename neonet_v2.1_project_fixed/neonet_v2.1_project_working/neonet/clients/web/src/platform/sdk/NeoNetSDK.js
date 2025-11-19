/**
 * NeoNet SDK - Software Development Kit for dApp developers
 * Provides a comprehensive API for building decentralized applications on NeoNet
 * 
 * Features:
 * - P2P connectivity and messaging
 * - CRDT-based data synchronization
 * - Distributed state management
 * - Security and authentication
 * - UI components and utilities
 * - Development tools and debugging
 */

import { PeerManagerEnhanced } from '../utils/PeerManager_enhanced.js';
import { CRDTManager } from '../utils/CRDTManager.js';
import { DistributedStateManager } from '../utils/DistributedStateManager.js';
import { SecurityManager } from '../utils/SecurityManager.js';
import { NetworkMonitor } from '../utils/NetworkMonitor.js';

export class NeoNetSDK {
    constructor(dappConfig = {}) {
        this.dappId = dappConfig.id || `dapp_${Date.now()}`;
        this.dappName = dappConfig.name || 'Unnamed dApp';
        this.dappVersion = dappConfig.version || '1.0.0';
        this.permissions = dappConfig.permissions || [];
        
        // Core managers
        this.peerManager = null;
        this.crdtManager = new CRDTManager();
        this.stateManager = new DistributedStateManager();
        this.securityManager = new SecurityManager();
        this.networkMonitor = new NetworkMonitor();
        
        // SDK state
        this.isInitialized = false;
        this.nodeId = null;
        this.sessionId = null;
        
        // Event handlers
        this.eventHandlers = new Map();
        
        // API endpoints
        this.apis = {
            p2p: new P2PAPI(this),
            data: new DataAPI(this),
            state: new StateAPI(this),
            security: new SecurityAPI(this),
            ui: new UIAPI(this),
            storage: new StorageAPI(this),
            network: new NetworkAPI(this)
        };
        
        // Development tools
        this.devTools = new DevTools(this);
        
        // Configuration
        this.config = {
            signalingServerUrl: dappConfig.signalingServerUrl || "ws://localhost:8080",
            maxConnections: dappConfig.maxConnections || 20,
            enableEncryption: dappConfig.enableEncryption !== false,
            enableMonitoring: dappConfig.enableMonitoring !== false,
            debugMode: dappConfig.debugMode || false,
            ...dappConfig
        };
        
        this.setupEventHandlers();
    }
    
    // Initialization
    async initialize(userMetadata = {}) {
        if (this.isInitialized) {
            console.warn('[NeoNetSDK] Already initialized');
            return;
        }
        
        try {
            console.log(`[NeoNetSDK] Initializing ${this.dappName} v${this.dappVersion}`);
            
            // Initialize core managers
            await this.initializeManagers(userMetadata);
            
            // Connect to network
            await this.connectToNetwork(userMetadata);
            
            // Setup security
            this.setupSecurity();
            
            // Initialize monitoring
            if (this.config.enableMonitoring) {
                this.initializeMonitoring();
            }
            
            this.isInitialized = true;
            this.emit('initialized', { dappId: this.dappId, nodeId: this.nodeId });
            
            console.log(`[NeoNetSDK] Successfully initialized ${this.dappName}`);
            
        } catch (error) {
            console.error('[NeoNetSDK] Initialization failed:', error);
            throw error;
        }
    }
    
    async initializeManagers(userMetadata) {
        // Initialize peer manager
        this.peerManager = new PeerManagerEnhanced({
            signalingServerUrl: this.config.signalingServerUrl,
            maxDirectConnections: this.config.maxConnections,
            onPeerJoined: (peer) => this.emit('peer:joined', peer),
            onPeerLeft: (peer) => this.emit('peer:left', peer),
            onConnectionStatusChanged: (status) => this.emit('connection:status', status),
            onMessage: (senderId, message) => this.handlePeerMessage(senderId, message),
            onError: (error) => this.emit('error', error)
        });
        
        // Set node IDs
        this.nodeId = `${this.dappId}_${Date.now()}`;
        this.peerManager.setNodeId(this.nodeId);
        this.crdtManager.setNodeId(this.nodeId);
        this.stateManager.setNodeId(this.nodeId);
        this.securityManager.setNodeId(this.nodeId);
        this.networkMonitor.setNodeId(this.nodeId);
    }
    
    async connectToNetwork(userMetadata) {
        const metadata = {
            dappId: this.dappId,
            dappName: this.dappName,
            dappVersion: this.dappVersion,
            ...userMetadata
        };
        
        await this.peerManager.connect(metadata);
    }
    
    setupSecurity() {
        if (this.config.enableEncryption) {
            this.sessionId = this.securityManager.createSession(this.nodeId, true);
        }
    }
    
    initializeMonitoring() {
        this.networkMonitor.onMetricsUpdated = (metrics) => {
            this.emit('metrics:updated', metrics);
        };
        
        this.networkMonitor.onHealthChanged = (health) => {
            this.emit('health:changed', health);
        };
        
        this.networkMonitor.onAlert = (alert) => {
            this.emit('alert', alert);
        };
    }
    
    setupEventHandlers() {
        // Handle CRDT data changes
        this.crdtManager.onDataChanged = (data) => {
            this.emit('data:changed', data);
        };
        
        // Handle state changes
        this.stateManager.onStateChanged = (state) => {
            this.emit('state:changed', state);
        };
        
        // Handle security events
        this.securityManager.onSecurityEvent = (event) => {
            this.emit('security:event', event);
        };
    }
    
    handlePeerMessage(senderId, message) {
        // Validate message security
        const validation = this.securityManager.validateMessage(message, senderId);
        if (!validation.valid) {
            console.warn(`[NeoNetSDK] Invalid message from ${senderId}:`, validation.reason);
            return;
        }
        
        // Use sanitized message if available
        const sanitizedMessage = validation.sanitized || message;
        
        // Route message to appropriate handler
        switch (sanitizedMessage.type) {
            case 'dapp_message':
                this.emit('message', senderId, sanitizedMessage.data);
                break;
            case 'crdt_sync':
                this.crdtManager.handleIncomingSync(senderId, sanitizedMessage.data);
                break;
            case 'state_update':
                this.stateManager.handleStateUpdate(senderId, sanitizedMessage.data);
                break;
            default:
                this.emit('message:unknown', senderId, sanitizedMessage);
        }
    }
    
    // Event system
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
        
        return () => this.off(event, handler);
    }
    
    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.eventHandlers.delete(event);
            }
        }
    }
    
    emit(event, ...args) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(...args);
                } catch (error) {
                    console.error(`[NeoNetSDK] Error in event handler for ${event}:`, error);
                }
            });
        }
        
        // Also emit to development tools
        if (this.config.debugMode) {
            this.devTools.logEvent(event, args);
        }
    }
    
    // Public API methods
    getNodeId() {
        return this.nodeId;
    }
    
    getDappInfo() {
        return {
            id: this.dappId,
            name: this.dappName,
            version: this.dappVersion,
            permissions: this.permissions,
            nodeId: this.nodeId,
            sessionId: this.sessionId
        };
    }
    
    getConnectionStatus() {
        return this.peerManager ? this.peerManager.getConnectionStatus() : { status: 'disconnected' };
    }
    
    getPeers() {
        return this.peerManager ? this.peerManager.getAllKnownPeers() : [];
    }
    
    getConnectedPeers() {
        return this.peerManager ? this.peerManager.getDirectlyConnectedPeers() : [];
    }
    
    // Cleanup
    async destroy() {
        console.log(`[NeoNetSDK] Destroying ${this.dappName}`);
        
        // Disconnect from network
        if (this.peerManager) {
            this.peerManager.disconnect();
        }
        
        // Clear all data
        this.crdtManager.clear();
        this.stateManager.clear();
        this.securityManager.reset();
        this.networkMonitor.reset();
        
        // Clear event handlers
        this.eventHandlers.clear();
        
        this.isInitialized = false;
        this.emit('destroyed');
    }
}

// P2P API
class P2PAPI {
    constructor(sdk) {
        this.sdk = sdk;
    }
    
    sendMessage(targetPeerId, data) {
        if (!this.sdk.peerManager) {
            throw new Error('SDK not initialized');
        }
        
        const message = {
            type: 'dapp_message',
            dappId: this.sdk.dappId,
            data: data,
            timestamp: Date.now()
        };
        
        return this.sdk.peerManager.sendMessage(targetPeerId, message);
    }
    
    broadcastMessage(data, excludePeers = []) {
        if (!this.sdk.peerManager) {
            throw new Error('SDK not initialized');
        }
        
        const message = {
            type: 'dapp_message',
            dappId: this.sdk.dappId,
            data: data,
            timestamp: Date.now()
        };
        
        return this.sdk.peerManager.broadcastMessage(message, excludePeers);
    }
    
    connectToPeer(peerId) {
        if (!this.sdk.peerManager) {
            throw new Error('SDK not initialized');
        }
        
        return this.sdk.peerManager.initiateDirectConnection(peerId);
    }
    
    getPeerReputation(peerId) {
        return this.sdk.securityManager.getPeerReputation(peerId);
    }
}

// Data API (CRDT-based)
class DataAPI {
    constructor(sdk) {
        this.sdk = sdk;
    }
    
    createSet(id, initialData = []) {
        return this.sdk.crdtManager.createGSet(id, initialData);
    }
    
    createOrderedSet(id, initialData = []) {
        return this.sdk.crdtManager.createORSet(id, initialData);
    }
    
    createRegister(id, initialValue = null) {
        return this.sdk.crdtManager.createLWWRegister(id, initialValue);
    }
    
    createCounter(id, initialValue = 0) {
        return this.sdk.crdtManager.createPNCounter(id, initialValue);
    }
    
    createMap(id, initialData = {}) {
        return this.sdk.crdtManager.createORMap(id, initialData);
    }
    
    getData(id) {
        const crdt = this.sdk.crdtManager.getCRDT(id);
        return crdt ? crdt.getValue() : undefined;
    }
    
    getAllData() {
        return this.sdk.crdtManager.getAllStates();
    }
    
    syncWithPeer(peerId) {
        const peerConnection = this.sdk.peerManager.directConnections.get(peerId);
        if (peerConnection) {
            this.sdk.crdtManager.syncWithPeer(peerId, peerConnection);
        }
    }
}

// State API (Distributed state management)
class StateAPI {
    constructor(sdk) {
        this.sdk = sdk;
    }
    
    createState(stateId, initialValue = {}, options = {}) {
        return this.sdk.stateManager.createState(stateId, initialValue, options);
    }
    
    getState(stateId) {
        return this.sdk.stateManager.getState(stateId);
    }
    
    setState(stateId, value, metadata = {}) {
        return this.sdk.stateManager.setState(stateId, value, metadata);
    }
    
    updateState(stateId, updater, metadata = {}) {
        return this.sdk.stateManager.updateState(stateId, updater, metadata);
    }
    
    deleteState(stateId) {
        return this.sdk.stateManager.deleteState(stateId);
    }
    
    subscribe(stateId, callback) {
        return this.sdk.stateManager.subscribe(stateId, callback);
    }
    
    unsubscribe(stateId, callback) {
        return this.sdk.stateManager.unsubscribe(stateId, callback);
    }
    
    getAllStates() {
        return this.sdk.stateManager.getAllStates();
    }
}

// Security API
class SecurityAPI {
    constructor(sdk) {
        this.sdk = sdk;
    }
    
    validateMessage(message, senderId) {
        return this.sdk.securityManager.validateMessage(message, senderId);
    }
    
    blockPeer(peerId, reason) {
        return this.sdk.securityManager.blockPeer(peerId, reason);
    }
    
    unblockPeer(peerId) {
        return this.sdk.securityManager.unblockPeer(peerId);
    }
    
    isPeerBlocked(peerId) {
        return this.sdk.securityManager.isPeerBlocked(peerId);
    }
    
    getPeerReputation(peerId) {
        return this.sdk.securityManager.getPeerReputation(peerId);
    }
    
    updatePeerReputation(peerId, action, value) {
        return this.sdk.securityManager.updatePeerReputation(peerId, action, value);
    }
    
    getSecurityStatus() {
        return this.sdk.securityManager.getSecurityStatus();
    }
    
    addMessageValidator(messageType, validator) {
        return this.sdk.securityManager.addMessageValidator(messageType, validator);
    }
}

// UI API
class UIAPI {
    constructor(sdk) {
        this.sdk = sdk;
    }
    
    createNotification(message, type = 'info', duration = 5000) {
        const notification = {
            id: `notif_${Date.now()}`,
            message,
            type,
            timestamp: Date.now(),
            duration
        };
        
        this.sdk.emit('ui:notification', notification);
        return notification;
    }
    
    showModal(content, options = {}) {
        const modal = {
            id: `modal_${Date.now()}`,
            content,
            options,
            timestamp: Date.now()
        };
        
        this.sdk.emit('ui:modal', modal);
        return modal;
    }
    
    updateStatus(status, message) {
        this.sdk.emit('ui:status', { status, message, timestamp: Date.now() });
    }
    
    logMessage(message, level = 'info') {
        this.sdk.emit('ui:log', { message, level, timestamp: Date.now() });
    }
}

// Storage API
class StorageAPI {
    constructor(sdk) {
        this.sdk = sdk;
        this.prefix = `neonet_${sdk.dappId}_`;
    }
    
    setItem(key, value) {
        try {
            const serialized = JSON.stringify(value);
            localStorage.setItem(this.prefix + key, serialized);
            return true;
        } catch (error) {
            console.error('[StorageAPI] Failed to set item:', error);
            return false;
        }
    }
    
    getItem(key) {
        try {
            const serialized = localStorage.getItem(this.prefix + key);
            return serialized ? JSON.parse(serialized) : null;
        } catch (error) {
            console.error('[StorageAPI] Failed to get item:', error);
            return null;
        }
    }
    
    removeItem(key) {
        localStorage.removeItem(this.prefix + key);
    }
    
    clear() {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(this.prefix)) {
                localStorage.removeItem(key);
            }
        });
    }
    
    getAllKeys() {
        const keys = Object.keys(localStorage);
        return keys
            .filter(key => key.startsWith(this.prefix))
            .map(key => key.substring(this.prefix.length));
    }
}

// Network API
class NetworkAPI {
    constructor(sdk) {
        this.sdk = sdk;
    }
    
    getMetrics() {
        return this.sdk.networkMonitor.getLatestMetrics();
    }
    
    getPerformanceStats() {
        return this.sdk.networkMonitor.getPerformanceStats();
    }
    
    getHealth() {
        return this.sdk.networkMonitor.health;
    }
    
    recordCustomMetric(name, value, tags = {}) {
        return this.sdk.networkMonitor.recordCustomMetric(name, value, tags);
    }
    
    getMetricsHistory(category, duration) {
        return this.sdk.networkMonitor.getMetricsHistory(category, duration);
    }
}

// Development Tools
class DevTools {
    constructor(sdk) {
        this.sdk = sdk;
        this.logs = [];
        this.maxLogs = 1000;
        this.isEnabled = sdk.config.debugMode;
    }
    
    logEvent(event, args) {
        if (!this.isEnabled) return;
        
        const logEntry = {
            timestamp: Date.now(),
            event,
            args: JSON.parse(JSON.stringify(args)), // Deep clone
            dappId: this.sdk.dappId
        };
        
        this.logs.push(logEntry);
        
        // Keep only recent logs
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
        
        // Console output in debug mode
        console.log(`[${this.sdk.dappName}] ${event}:`, ...args);
    }
    
    getLogs(filter = {}) {
        let filteredLogs = this.logs;
        
        if (filter.event) {
            filteredLogs = filteredLogs.filter(log => log.event === filter.event);
        }
        
        if (filter.since) {
            filteredLogs = filteredLogs.filter(log => log.timestamp >= filter.since);
        }
        
        return filteredLogs;
    }
    
    clearLogs() {
        this.logs = [];
    }
    
    exportLogs() {
        return {
            dappId: this.sdk.dappId,
            dappName: this.sdk.dappName,
            logs: this.logs,
            exportTime: Date.now()
        };
    }
    
    getDebugInfo() {
        return {
            sdk: {
                dappId: this.sdk.dappId,
                dappName: this.sdk.dappName,
                dappVersion: this.sdk.dappVersion,
                nodeId: this.sdk.nodeId,
                isInitialized: this.sdk.isInitialized
            },
            connection: this.sdk.getConnectionStatus(),
            peers: this.sdk.getPeers().length,
            connectedPeers: this.sdk.getConnectedPeers().length,
            security: this.sdk.apis.security.getSecurityStatus(),
            metrics: this.sdk.apis.network.getMetrics(),
            eventHandlers: Array.from(this.sdk.eventHandlers.keys()),
            logs: this.logs.length
        };
    }
}

// Export the main SDK class and utilities
export { NeoNetSDK as default, P2PAPI, DataAPI, StateAPI, SecurityAPI, UIAPI, StorageAPI, NetworkAPI, DevTools };

