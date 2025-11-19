import { SimplePeerConnection } from './SimplePeerConnection.js';
import { CRDTManager } from './CRDTManager.js';
import { DistributedStateManager } from './DistributedStateManager.js';

/**
 * Enhanced PeerManager for handling large-scale P2P networks (100M+ users)
 * Features:
 * - Intelligent connection management
 * - Load balancing and optimization
 * - CRDT-based data synchronization
 * - Distributed state management
 * - Enhanced security and monitoring
 */
export class PeerManagerEnhanced {
    constructor(options = {}) {
        this.signalingServerUrl = options.signalingServerUrl || "ws://localhost:8080";
        this.maxDirectConnections = options.maxDirectConnections || 20;
        this.maxTotalKnownPeers = options.maxTotalKnownPeers || 1000;
        this.connectionTimeout = options.connectionTimeout || 30000;
        this.heartbeatInterval = options.heartbeatInterval || 30000;
        this.reconnectDelay = options.reconnectDelay || 5000;
        
        // Callbacks
        this.onPeerJoined = options.onPeerJoined || (() => {});
        this.onPeerLeft = options.onPeerLeft || (() => {});
        this.onConnectionStatusChanged = options.onConnectionStatusChanged || (() => {});
        this.onMessage = options.onMessage || (() => {});
        this.onError = options.onError || (() => {});
        
        // Internal state
        this.myNodeId = null;
        this.myMetadata = {};
        this.signalingSocket = null;
        this.connectionStatus = "disconnected";
        this.isConnecting = false;
        
        // Peer management
        this.directConnections = new Map(); // nodeId -> SimplePeerConnection
        this.knownPeers = new Map(); // nodeId -> metadata
        this.connectionAttempts = new Map(); // nodeId -> attempt count
        this.lastConnectionAttempt = new Map(); // nodeId -> timestamp
        
        // Enhanced features
        this.crdtManager = new CRDTManager();
        this.stateManager = new DistributedStateManager();
        this.metrics = {
            totalMessages: 0,
            totalConnections: 0,
            failedConnections: 0,
            averageLatency: 0,
            startTime: Date.now()
        };
        
        // Connection optimization
        this.connectionPriorities = new Map(); // nodeId -> priority score
        this.regionPreferences = options.regionPreferences || [];
        this.capabilityRequirements = options.capabilityRequirements || [];
        
        // Security and rate limiting
        this.messageRateLimit = new Map(); // nodeId -> { count, lastReset }
        this.maxMessagesPerMinute = options.maxMessagesPerMinute || 1000;
        this.blockedPeers = new Set();
        
        this.setupEventHandlers();
        this.startPeriodicTasks();
    }
    
    setupEventHandlers() {
        // CRDT Manager events
        this.crdtManager.onDataChanged = (data) => {
            this.broadcastCRDTUpdate(data);
        };
        
        // State Manager events
        this.stateManager.onStateChanged = (state) => {
            this.broadcastStateUpdate(state);
        };
    }
    
    startPeriodicTasks() {
        // Heartbeat and health monitoring
        setInterval(() => {
            this.sendHeartbeat();
            this.monitorConnections();
            this.optimizeConnections();
            this.cleanupStaleData();
        }, this.heartbeatInterval);
        
        // Metrics collection
        setInterval(() => {
            this.collectMetrics();
        }, 60000); // Every minute
        
        // Rate limit reset
        setInterval(() => {
            this.resetRateLimits();
        }, 60000); // Every minute
    }
    
    async connect(metadata = {}) {
        if (this.isConnecting || this.connectionStatus === "connected") {
            console.warn("[PeerManager] Already connecting or connected");
            return;
        }
        
        this.isConnecting = true;
        this.myMetadata = { ...metadata, capabilities: this.getMyCapabilities() };
        
        try {
            await this.connectToSignalingServer();
            this.connectionStatus = "connected";
            this.onConnectionStatusChanged("connected");
            console.log("[PeerManager] Successfully connected to signaling server");
        } catch (error) {
            console.error("[PeerManager] Failed to connect:", error);
            this.connectionStatus = "failed";
            this.onConnectionStatusChanged("failed");
            this.onError(error);
            
            // Retry connection
            setTimeout(() => {
                this.isConnecting = false;
                this.connect(metadata);
            }, this.reconnectDelay);
        } finally {
            this.isConnecting = false;
        }
    }
    
    connectToSignalingServer() {
        return new Promise((resolve, reject) => {
            try {
                this.signalingSocket = new WebSocket(this.signalingServerUrl);
                
                this.signalingSocket.onopen = () => {
                    console.log("[PeerManager] Connected to signaling server");
                    resolve();
                };
                
                this.signalingSocket.onmessage = (event) => {
                    this.handleSignalingMessage(JSON.parse(event.data));
                };
                
                this.signalingSocket.onclose = () => {
                    console.log("[PeerManager] Disconnected from signaling server");
                    this.connectionStatus = "disconnected";
                    this.onConnectionStatusChanged("disconnected");
                    
                    // Attempt reconnection
                    if (!this.isConnecting) {
                        setTimeout(() => {
                            this.connect(this.myMetadata);
                        }, this.reconnectDelay);
                    }
                };
                
                this.signalingSocket.onerror = (error) => {
                    console.error("[PeerManager] Signaling server error:", error);
                    reject(error);
                };
                
                // Connection timeout
                setTimeout(() => {
                    if (this.signalingSocket.readyState !== WebSocket.OPEN) {
                        reject(new Error("Connection timeout"));
                    }
                }, this.connectionTimeout);
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    handleSignalingMessage(message) {
        this.metrics.totalMessages++;
        
        switch (message.type) {
            case "connected":
                this.myNodeId = message.nodeId;
                this.registerWithServer();
                this.requestPeerDiscovery();
                break;
                
            case "peer_list":
                this.processPeerList(message.peers);
                break;
                
            case "peer_update":
                this.processPeerUpdate(message.peer);
                break;
                
            case "signal":
                this.handleIncomingSignal(message.senderId, message.signal);
                break;
                
            case "crdt_sync":
                this.crdtManager.handleIncomingSync(message.senderId, message.data);
                break;
                
            case "state_update":
                this.stateManager.handleStateUpdate(message.senderId, message.state);
                break;
                
            case "error":
                console.error("[PeerManager] Server error:", message.message);
                this.onError(new Error(message.message));
                break;
                
            case "server_shutdown":
                console.warn("[PeerManager] Server shutting down");
                this.handleServerShutdown();
                break;
                
            default:
                console.warn("[PeerManager] Unknown message type:", message.type);
        }
    }
    
    registerWithServer() {
        if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
            this.signalingSocket.send(JSON.stringify({
                type: "register",
                metadata: this.myMetadata
            }));
        }
    }
    
    requestPeerDiscovery(filters = {}) {
        if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
            this.signalingSocket.send(JSON.stringify({
                type: "peer_discovery_request",
                filters: {
                    region: this.regionPreferences,
                    capabilities: this.capabilityRequirements,
                    ...filters
                },
                maxResults: this.maxTotalKnownPeers
            }));
        }
    }
    
    processPeerList(peers) {
        console.log(`[PeerManager] Received ${peers.length} peers`);
        
        peers.forEach(peer => {
            if (peer.nodeId !== this.myNodeId) {
                this.knownPeers.set(peer.nodeId, peer);
                this.calculateConnectionPriority(peer);
            }
        });
        
        this.optimizeConnections();
    }
    
    processPeerUpdate(peer) {
        if (peer.nodeId !== this.myNodeId) {
            this.knownPeers.set(peer.nodeId, peer);
            this.calculateConnectionPriority(peer);
            this.onPeerJoined(peer);
        }
    }
    
    calculateConnectionPriority(peer) {
        let priority = 0;
        
        // Region preference
        if (this.regionPreferences.includes(peer.region)) {
            priority += 10;
        }
        
        // Capability matching
        const matchingCapabilities = peer.capabilities?.filter(cap => 
            this.capabilityRequirements.includes(cap)
        ) || [];
        priority += matchingCapabilities.length * 5;
        
        // Recency (more recent = higher priority)
        const ageMinutes = (Date.now() - peer.lastSeen) / (1000 * 60);
        priority += Math.max(0, 10 - ageMinutes);
        
        // Connection stability (if we've connected before)
        const attempts = this.connectionAttempts.get(peer.nodeId) || 0;
        priority -= attempts * 2;
        
        this.connectionPriorities.set(peer.nodeId, priority);
    }
    
    optimizeConnections() {
        // Remove excess known peers
        if (this.knownPeers.size > this.maxTotalKnownPeers) {
            const sortedPeers = Array.from(this.knownPeers.entries())
                .sort((a, b) => (this.connectionPriorities.get(b[0]) || 0) - (this.connectionPriorities.get(a[0]) || 0));
            
            const toRemove = sortedPeers.slice(this.maxTotalKnownPeers);
            toRemove.forEach(([nodeId]) => {
                this.knownPeers.delete(nodeId);
                this.connectionPriorities.delete(nodeId);
            });
        }
        
        // Establish new direct connections if needed
        if (this.directConnections.size < this.maxDirectConnections) {
            const availablePeers = Array.from(this.knownPeers.keys())
                .filter(nodeId => 
                    !this.directConnections.has(nodeId) && 
                    !this.blockedPeers.has(nodeId) &&
                    this.canAttemptConnection(nodeId)
                )
                .sort((a, b) => (this.connectionPriorities.get(b) || 0) - (this.connectionPriorities.get(a) || 0));
            
            const connectionsNeeded = this.maxDirectConnections - this.directConnections.size;
            const peersToConnect = availablePeers.slice(0, connectionsNeeded);
            
            peersToConnect.forEach(nodeId => {
                this.initiateDirectConnection(nodeId);
            });
        }
    }
    
    canAttemptConnection(nodeId) {
        const attempts = this.connectionAttempts.get(nodeId) || 0;
        const lastAttempt = this.lastConnectionAttempt.get(nodeId) || 0;
        const timeSinceLastAttempt = Date.now() - lastAttempt;
        
        // Exponential backoff
        const backoffTime = Math.min(300000, 5000 * Math.pow(2, attempts)); // Max 5 minutes
        
        return attempts < 5 && timeSinceLastAttempt > backoffTime;
    }
    
    async initiateDirectConnection(targetNodeId) {
        if (this.directConnections.has(targetNodeId)) {
            return;
        }
        
        console.log(`[PeerManager] Initiating connection to ${targetNodeId}`);
        
        this.connectionAttempts.set(targetNodeId, (this.connectionAttempts.get(targetNodeId) || 0) + 1);
        this.lastConnectionAttempt.set(targetNodeId, Date.now());
        
        try {
            const peerConnection = new SimplePeerConnection({
                initiator: true,
                nodeId: targetNodeId,
                onSignal: (signal) => this.sendSignal(targetNodeId, signal),
                onConnect: () => this.handlePeerConnected(targetNodeId, peerConnection),
                onData: (data) => this.handlePeerMessage(targetNodeId, data),
                onClose: () => this.handlePeerDisconnected(targetNodeId),
                onError: (error) => this.handlePeerError(targetNodeId, error)
            });
            
            this.directConnections.set(targetNodeId, peerConnection);
            this.metrics.totalConnections++;
            
        } catch (error) {
            console.error(`[PeerManager] Failed to initiate connection to ${targetNodeId}:`, error);
            this.metrics.failedConnections++;
        }
    }
    
    handleIncomingSignal(senderId, signal) {
        let peerConnection = this.directConnections.get(senderId);
        
        if (!peerConnection) {
            // Create new connection for incoming signal
            peerConnection = new SimplePeerConnection({
                initiator: false,
                nodeId: senderId,
                onSignal: (signal) => this.sendSignal(senderId, signal),
                onConnect: () => this.handlePeerConnected(senderId, peerConnection),
                onData: (data) => this.handlePeerMessage(senderId, data),
                onClose: () => this.handlePeerDisconnected(senderId),
                onError: (error) => this.handlePeerError(senderId, error)
            });
            
            this.directConnections.set(senderId, peerConnection);
        }
        
        peerConnection.signal(signal);
    }
    
    sendSignal(targetNodeId, signal) {
        if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
            this.signalingSocket.send(JSON.stringify({
                type: "signal",
                targetId: targetNodeId,
                signal: signal
            }));
        }
    }
    
    handlePeerConnected(nodeId, peerConnection) {
        console.log(`[PeerManager] Direct connection established with ${nodeId}`);
        this.connectionAttempts.delete(nodeId);
        
        const peer = this.knownPeers.get(nodeId);
        if (peer) {
            this.onPeerJoined(peer);
        }
        
        // Sync CRDT data
        this.crdtManager.syncWithPeer(nodeId, peerConnection);
    }
    
    handlePeerMessage(senderId, data) {
        if (!this.checkRateLimit(senderId)) {
            console.warn(`[PeerManager] Rate limit exceeded for ${senderId}`);
            return;
        }
        
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case "chat":
                case "data":
                    this.onMessage(senderId, message);
                    break;
                    
                case "crdt_sync":
                    this.crdtManager.handleIncomingSync(senderId, message.data);
                    break;
                    
                case "state_update":
                    this.stateManager.handleStateUpdate(senderId, message.state);
                    break;
                    
                default:
                    this.onMessage(senderId, message);
            }
            
        } catch (error) {
            console.error(`[PeerManager] Error processing message from ${senderId}:`, error);
        }
    }
    
    handlePeerDisconnected(nodeId) {
        console.log(`[PeerManager] Peer disconnected: ${nodeId}`);
        this.directConnections.delete(nodeId);
        
        const peer = this.knownPeers.get(nodeId);
        if (peer) {
            this.onPeerLeft(peer);
        }
        
        // Try to maintain optimal connection count
        setTimeout(() => {
            this.optimizeConnections();
        }, 1000);
    }
    
    handlePeerError(nodeId, error) {
        console.error(`[PeerManager] Peer connection error with ${nodeId}:`, error);
        this.directConnections.delete(nodeId);
        this.metrics.failedConnections++;
        
        // Block peer temporarily if too many errors
        const attempts = this.connectionAttempts.get(nodeId) || 0;
        if (attempts > 3) {
            this.blockedPeers.add(nodeId);
            setTimeout(() => {
                this.blockedPeers.delete(nodeId);
            }, 300000); // 5 minutes
        }
    }
    
    checkRateLimit(nodeId) {
        const now = Date.now();
        const rateData = this.messageRateLimit.get(nodeId) || { count: 0, lastReset: now };
        
        // Reset counter every minute
        if (now - rateData.lastReset > 60000) {
            rateData.count = 0;
            rateData.lastReset = now;
        }
        
        rateData.count++;
        this.messageRateLimit.set(nodeId, rateData);
        
        return rateData.count <= this.maxMessagesPerMinute;
    }
    
    resetRateLimits() {
        this.messageRateLimit.clear();
    }
    
    sendMessage(targetNodeId, message) {
        const peerConnection = this.directConnections.get(targetNodeId);
        if (peerConnection && peerConnection.connected) {
            peerConnection.send(JSON.stringify(message));
            return true;
        }
        return false;
    }
    
    broadcastMessage(message, excludeNodeIds = []) {
        let sentCount = 0;
        this.directConnections.forEach((peerConnection, nodeId) => {
            if (!excludeNodeIds.includes(nodeId) && peerConnection.connected) {
                peerConnection.send(JSON.stringify(message));
                sentCount++;
            }
        });
        return sentCount;
    }
    
    broadcastCRDTUpdate(data) {
        const message = {
            type: "crdt_sync",
            data: data,
            timestamp: Date.now()
        };
        
        // Send via signaling server for broader reach
        if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
            this.signalingSocket.send(JSON.stringify({
                type: "crdt_sync",
                targetPeers: Array.from(this.knownPeers.keys()),
                data: data
            }));
        }
        
        // Also send via direct connections
        this.broadcastMessage(message);
    }
    
    broadcastStateUpdate(state) {
        const message = {
            type: "state_update",
            state: state,
            timestamp: Date.now()
        };
        
        // Send via signaling server
        if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
            this.signalingSocket.send(JSON.stringify({
                type: "state_update",
                subscribers: Array.from(this.knownPeers.keys()),
                state: state
            }));
        }
        
        // Also send via direct connections
        this.broadcastMessage(message);
    }
    
    sendHeartbeat() {
        if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
            this.signalingSocket.send(JSON.stringify({
                type: "heartbeat",
                timestamp: Date.now()
            }));
        }
    }
    
    monitorConnections() {
        // Check health of direct connections
        this.directConnections.forEach((peerConnection, nodeId) => {
            if (!peerConnection.connected) {
                console.log(`[PeerManager] Removing dead connection: ${nodeId}`);
                this.directConnections.delete(nodeId);
            }
        });
    }
    
    cleanupStaleData() {
        const now = Date.now();
        const staleThreshold = 300000; // 5 minutes
        
        // Clean up stale known peers
        this.knownPeers.forEach((peer, nodeId) => {
            if (now - peer.lastSeen > staleThreshold && !this.directConnections.has(nodeId)) {
                this.knownPeers.delete(nodeId);
                this.connectionPriorities.delete(nodeId);
            }
        });
        
        // Clean up old connection attempts
        this.lastConnectionAttempt.forEach((timestamp, nodeId) => {
            if (now - timestamp > staleThreshold) {
                this.lastConnectionAttempt.delete(nodeId);
                this.connectionAttempts.delete(nodeId);
            }
        });
    }
    
    collectMetrics() {
        const uptime = Date.now() - this.metrics.startTime;
        console.log(`[PeerManager] Metrics - Connections: ${this.directConnections.size}/${this.maxDirectConnections}, Known Peers: ${this.knownPeers.size}, Messages: ${this.metrics.totalMessages}, Uptime: ${Math.round(uptime/1000)}s`);
    }
    
    getMyCapabilities() {
        return [
            'crdt_sync',
            'distributed_state',
            'enhanced_routing',
            'rate_limiting',
            'connection_optimization'
        ];
    }
    
    handleServerShutdown() {
        console.warn("[PeerManager] Server is shutting down, attempting to maintain P2P connections");
        // Keep direct connections alive even if signaling server goes down
        this.connectionStatus = "degraded";
        this.onConnectionStatusChanged("degraded");
    }
    
    getAllKnownPeers() {
        return Array.from(this.knownPeers.values());
    }
    
    getDirectlyConnectedPeers() {
        return Array.from(this.directConnections.keys())
            .map(nodeId => this.knownPeers.get(nodeId))
            .filter(peer => peer);
    }
    
    getConnectionStatus() {
        return {
            status: this.connectionStatus,
            directConnections: this.directConnections.size,
            knownPeers: this.knownPeers.size,
            metrics: this.metrics
        };
    }
    
    disconnect() {
        console.log("[PeerManager] Disconnecting...");
        
        // Close all direct connections
        this.directConnections.forEach(peerConnection => {
            peerConnection.destroy();
        });
        this.directConnections.clear();
        
        // Close signaling connection
        if (this.signalingSocket) {
            this.signalingSocket.close();
            this.signalingSocket = null;
        }
        
        this.connectionStatus = "disconnected";
        this.onConnectionStatusChanged("disconnected");
    }
}

