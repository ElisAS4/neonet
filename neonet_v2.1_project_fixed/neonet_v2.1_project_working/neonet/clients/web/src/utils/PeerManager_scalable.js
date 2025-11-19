import { v4 as uuidv4 } from 'uuid';
import P2PConnectionBase from './P2PConnectionBase.js';
import SimplePeerConnection from './SimplePeerConnection.js';

class PeerManagerScalable {
    constructor({ signalingServerUrl, onPeerJoined, onPeerLeft, onConnectionStatusChanged, onMessage }) {
        this.signalingServerUrl = signalingServerUrl;
        this.onPeerJoined = onPeerJoined;
        this.onPeerLeft = onPeerLeft;
        this.onConnectionStatusChanged = onConnectionStatusChanged;
        this.onMessage = onMessage;

        this.nodeId = localStorage.getItem('neonet_node_id') || uuidv4();
        localStorage.setItem('neonet_node_id', this.nodeId);

        this.ws = null; // WebSocket connection to signaling server
        this.peers = new Map(); // Map<nodeId, P2PConnectionBase instance>
        this.peerMetadata = new Map(); // Map<nodeId, { userName, userBio, lastSeen, ssnId }>

        this.isConnectedToSignaling = false;
        this.isConnectingToSignaling = false;
        this.isNetworkConnected = false; // Represents connection to the NeoNet P2P network

        this.heartbeatInterval = null;
        this.peerDiscoveryInterval = null;

        console.log(`[PeerManager] Initialized with Node ID: ${this.nodeId}`);
    }

    async connect(userData) {
        if (this.isConnectingToSignaling || this.isConnectedToSignaling) {
            console.warn('[PeerManager] Already connecting or connected to signaling server.');
            return;
        }

        if (!userData || !userData.userName) {
            throw new Error('User data (userName) is required to connect.');
        }

        this.isConnectingToSignaling = true;
        this.onConnectionStatusChanged('connecting');

        try {
            this.ws = new WebSocket(this.signalingServerUrl);

            this.ws.onopen = () => {
                console.log('[PeerManager] Connected to signaling server.');
                this.isConnectedToSignaling = true;
                this.isConnectingToSignaling = false;
                this.onConnectionStatusChanged('connected');

                // Register our metadata with the signaling server
                this.sendSignalingMessage('register', { nodeId: this.nodeId, ...userData });

                // Request initial peer list
                this.sendSignalingMessage('peer_discovery_request');

                // Start heartbeats
                this.startHeartbeats();
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                // console.log('[PeerManager] Received signaling message:', message.type);

                switch (message.type) {
                    case 'connected':
                        // This is the initial confirmation from the server
                        console.log(`[PeerManager] Server assigned Node ID: ${message.nodeId}`);
                        // If server assigned a new ID, update it (shouldn't happen if we send our own)
                        if (this.nodeId !== message.nodeId) {
                            this.nodeId = message.nodeId;
                            localStorage.setItem('neonet_node_id', this.nodeId);
                        }
                        break;
                    case 'peer_list':
                        // Received list of all active peers from signaling server
                        // console.log('[PeerManager] Received peer list:', message.peers.length);
                        message.peers.forEach(peer => {
                            if (peer.nodeId !== this.nodeId) {
                                this.peerMetadata.set(peer.nodeId, peer);
                                this.initiatePeerConnection(peer.nodeId, false); // Try to connect to new peers
                            }
                        });
                        this.updatePeerList();
                        break;
                    case 'signal':
                        // Received signaling data for an existing peer connection
                        const peer = this.peers.get(message.senderId);
                        if (peer) {
                            peer.signal(message.signal);
                        } else {
                            // If we receive a signal for a peer we don't know, it means they initiated
                            // console.log(`[PeerManager] Received signal from unknown peer ${message.senderId}. Initiating connection.`);
                            const newPeer = this.peerMetadata.get(message.senderId);
                            if (newPeer) {
                                this.initiatePeerConnection(message.senderId, true);
                                this.peers.get(message.senderId).signal(message.signal);
                            }
                        }
                        break;
                    case 'message':
                        // Direct message from another peer (relayed by signaling server if P2P not established)
                        this.onMessage(message.senderId, message.payload);
                        break;
                    case 'error':
                        console.error('[PeerManager] Signaling server error:', message.message);
                        this.onConnectionStatusChanged('disconnected');
                        this.disconnect();
                        break;
                    case 'ssn_peer_update':
                        // Update peer metadata from other SSNs
                        message.peers.forEach(p => {
                            if (p.nodeId !== this.nodeId) {
                                // Only update if this record is newer or doesn't exist
                                if (!this.peerMetadata.has(p.nodeId) || this.peerMetadata.get(p.nodeId).lastSeen < p.lastSeen) {
                                    this.peerMetadata.set(p.nodeId, p);
                                    this.initiatePeerConnection(p.nodeId, false); // Try to connect to new peers
                                }
                            }
                        });
                        this.updatePeerList();
                        break;
                    default:
                        console.warn('[PeerManager] Unknown signaling message type:', message.type);
                }
            };

            this.ws.onclose = () => {
                console.log('[PeerManager] Disconnected from signaling server.');
                this.isConnectedToSignaling = false;
                this.isConnectingToSignaling = false;
                this.isNetworkConnected = false;
                this.onConnectionStatusChanged('disconnected');
                this.stopHeartbeats();
                this.peers.forEach(peer => peer.destroy());
                this.peers.clear();
                this.peerMetadata.clear(); // Clear all peer data on signaling disconnect
                this.updatePeerList();
            };

            this.ws.onerror = (error) => {
                console.error('[PeerManager] WebSocket error:', error);
                this.onConnectionStatusChanged('disconnected');
                this.disconnect();
            };

        } catch (error) {
            console.error('[PeerManager] Failed to connect to signaling server:', error);
            this.isConnectingToSignaling = false;
            this.onConnectionStatusChanged('disconnected');
            throw error;
        }
    }

    async disconnect() {
        if (this.ws) {
            this.ws.close();
        }
        this.stopHeartbeats();
        this.peers.forEach(peer => peer.destroy());
        this.peers.clear();
        this.peerMetadata.clear();
        this.isConnectedToSignaling = false;
        this.isConnectingToSignaling = false;
        this.isNetworkConnected = false;
        this.onConnectionStatusChanged('disconnected');
        this.updatePeerList();
        console.log('[PeerManager] Disconnected from NeoNet.');
    }

    sendSignalingMessage(type, payload = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, ...payload }));
        } else {
            console.warn('[PeerManager] WebSocket not open, cannot send signaling message:', type);
        }
    }

    initiatePeerConnection(peerId, initiator) {
        if (this.peers.has(peerId)) {
            // console.log(`[PeerManager] Connection to ${peerId} already exists or is in progress.`);
            return;
        }

        const peerConnection = new SimplePeerConnection(peerId, initiator, (targetId, signalData) => {
            this.sendSignalingMessage("signal", { targetId: targetId, signal: signalData });
        });

        this.peers.set(peerId, peerConnection);

        peerConnection.onConnect(() => {
            console.log(`[PeerManager] P2P connection established with ${peerId}`);
            this.isNetworkConnected = true;
            this.onPeerJoined(this.peerMetadata.get(peerId));
            this.updatePeerList();
        });

        peerConnection.onData(data => {
            try {
                const message = JSON.parse(data.toString());
                this.onMessage(peerId, message);
            } catch (e) {
                console.error("[PeerManager] Error parsing P2P data:", e);
            }
        });

        peerConnection.onClose(() => {
            console.log(`[PeerManager] P2P connection closed with ${peerId}`);
            this.peers.delete(peerId);
            this.onPeerLeft(this.peerMetadata.get(peerId));
            this.updatePeerList();
        });

        peerConnection.onError(err => {
            console.error(`[PeerManager] P2P connection error with ${peerId}:`, err);
            this.peers.delete(peerId);
            this.onPeerLeft(this.peerMetadata.get(peerId));
            this.updatePeerList();
        });

        peerConnection.initiate();
    }

    sendDataToPeer(peerId, data) {
        const peerConnection = this.peers.get(peerId);
        if (peerConnection && peerConnection.connected) {
            peerConnection.send(JSON.stringify(data));
            return true;
        } else {
            console.warn(`[PeerManager] P2P connection to ${peerId} not established or not connected.`);
            // Fallback: send via signaling server if P2P not ready
            this.sendSignalingMessage("message", { targetId: peerId, payload: data });
            return false;
        }
    }

    broadcastData(data) {
        let sentCount = 0;
        this.peers.forEach((peerConnection, peerId) => {
            if (peerConnection.connected) {
                peerConnection.send(JSON.stringify(data));
                sentCount++;
            }
        });
        console.log(`[PeerManager] Broadcasted data to ${sentCount} peers.`);
        return sentCount;
    }

    getConnectedPeers() {
        // Return only peers with established P2P connections
        const connectedP2PPeers = Array.from(this.peers.keys()).filter(peerId => this.peers.get(peerId).connected);
        return Array.from(this.peerMetadata.values()).filter(meta => connectedP2PPeers.includes(meta.nodeId));
    }

    getAllKnownPeers() {
        // Return all peers known by the signaling server, including those not yet P2P connected
        return Array.from(this.peerMetadata.values());
    }

    getPeerMetadata(nodeId) {
        return this.peerMetadata.get(nodeId);
    }

    updatePeerList() {
        // This method is called internally to trigger UI updates in the main app
        // The main app's updateUI function will call getConnectedPeers() or getAllKnownPeers()
        // to render the list.
        // We can add a specific callback here if needed, but for now, it relies on onPeerJoined/onPeerLeft
    }

    startHeartbeats() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
            this.sendSignalingMessage('heartbeat');
            // console.log('[PeerManager] Sent heartbeat.');
        }, 25 * 1000); // Send heartbeat every 25 seconds

        if (this.peerDiscoveryInterval) clearInterval(this.peerDiscoveryInterval);
        this.peerDiscoveryInterval = setInterval(() => {
            // Periodically request peer list from signaling server to discover new peers
            this.sendSignalingMessage('peer_discovery_request');
        }, 30 * 1000); // Request peer list every 30 seconds
    }

    stopHeartbeats() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.peerDiscoveryInterval) {
            clearInterval(this.peerDiscoveryInterval);
            this.peerDiscoveryInterval = null;
        }
    }
}

export { PeerManagerScalable };


