// neonet/clients/web/src/p2p/peerManager.js

/**
 * Gerenciador de Pares P2P para NeoNet
 * Gerencia conexões com outros pares na rede
 */
class PeerManager {
    constructor() {
        this.peers = new Map(); // Map de ID do peer para objeto de conexão
        this.signalingServerUrl = window.NEONET_CONFIG?.signalingServerUrl || 'ws://localhost:8080';
        this.signalingSocket = null;
        this.localPeerId = null;
        this.isConnected = false;
    }

    /**
     * Conecta à rede P2P
     */
    async connect() {
        try {
            await this.connectToSignalingServer();
            console.log('[PeerManager] Connected to P2P network');
            this.isConnected = true;
        } catch (error) {
            console.error('[PeerManager] Failed to connect to P2P network:', error);
            throw error;
        }
    }

    /**
     * Conecta ao servidor de sinalização
     */
    async connectToSignalingServer() {
        return new Promise((resolve, reject) => {
            this.signalingSocket = new WebSocket(this.signalingServerUrl);

            this.signalingSocket.onopen = () => {
                console.log('[PeerManager] Connected to signaling server');
                resolve();
            };

            this.signalingSocket.onmessage = (event) => {
                this.handleSignalingMessage(JSON.parse(event.data));
            };

            this.signalingSocket.onclose = () => {
                console.log('[PeerManager] Disconnected from signaling server');
                this.isConnected = false;
                // Tentar reconectar após 5 segundos
                setTimeout(() => {
                    if (!this.isConnected) {
                        this.connect().catch(console.error);
                    }
                }, 5000);
            };

            this.signalingSocket.onerror = (error) => {
                console.error('[PeerManager] Signaling server error:', error);
                reject(error);
            };

            // Timeout de conexão
            setTimeout(() => {
                if (this.signalingSocket.readyState !== WebSocket.OPEN) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    /**
     * Manipula mensagens do servidor de sinalização
     * @param {Object} message - Mensagem recebida
     */
    handleSignalingMessage(message) {
        console.log('[PeerManager] Signaling message:', message.type);

        switch (message.type) {
            case 'client-id':
                this.localPeerId = message.clientId;
                console.log('[PeerManager] Local peer ID:', this.localPeerId);
                // Solicitar descoberta de pares
                this.requestPeerDiscovery();
                break;

            case 'peer-list':
                this.handlePeerList(message.peers);
                break;

            case 'peer-joined':
                console.log('[PeerManager] Peer joined:', message.peerId);
                break;

            case 'peer-left':
                console.log('[PeerManager] Peer left:', message.peerId);
                this.removePeer(message.peerId);
                break;

            case 'webrtc-offer':
            case 'webrtc-answer':
            case 'webrtc-ice-candidate':
                this.handleWebRTCSignaling(message);
                break;

            case 'broadcast':
                this.handleBroadcastMessage(message);
                break;

            case 'error':
                console.error('[PeerManager] Signaling error:', message.message);
                break;

            default:
                console.warn('[PeerManager] Unknown signaling message type:', message.type);
        }
    }

    /**
     * Solicita descoberta de pares
     */
    requestPeerDiscovery() {
        if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
            this.signalingSocket.send(JSON.stringify({
                type: 'peer-discovery'
            }));
        }
    }

    /**
     * Manipula lista de pares descobertos
     * @param {Array} peers - Lista de pares
     */
    handlePeerList(peers) {
        console.log('[PeerManager] Discovered peers:', peers.length);
        
        // Conectar aos primeiros 3 pares (para evitar sobrecarga)
        const peersToConnect = peers.slice(0, 3);
        
        for (const peer of peersToConnect) {
            if (!this.peers.has(peer.id)) {
                this.connectToPeer(peer.id);
            }
        }
    }

    /**
     * Conecta a um peer específico
     * @param {string} peerId - ID do peer
     */
    async connectToPeer(peerId) {
        try {
            console.log('[PeerManager] Connecting to peer:', peerId);
            
            // Simular conexão WebRTC (em uma implementação real, usaria SimplePeer ou similar)
            const peerConnection = {
                id: peerId,
                connected: true,
                lastSeen: Date.now(),
                // Em uma implementação real, seria um objeto RTCPeerConnection
                send: (data) => {
                    console.log(`[PeerManager] Sending to ${peerId}:`, data);
                    // Simular envio via servidor de sinalização
                    if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
                        this.signalingSocket.send(JSON.stringify({
                            type: 'broadcast',
                            targetPeerId: peerId,
                            data: data
                        }));
                    }
                }
            };

            this.peers.set(peerId, peerConnection);
            console.log('[PeerManager] Connected to peer:', peerId);
            
        } catch (error) {
            console.error('[PeerManager] Failed to connect to peer:', peerId, error);
        }
    }

    /**
     * Remove um peer
     * @param {string} peerId - ID do peer
     */
    removePeer(peerId) {
        if (this.peers.has(peerId)) {
            this.peers.delete(peerId);
            console.log('[PeerManager] Removed peer:', peerId);
        }
    }

    /**
     * Manipula sinalização WebRTC
     * @param {Object} message - Mensagem de sinalização
     */
    handleWebRTCSignaling(message) {
        // Em uma implementação real, isso manipularia offers, answers e ICE candidates
        console.log('[PeerManager] WebRTC signaling:', message.type, 'from', message.fromPeerId);
    }

    /**
     * Manipula mensagens de broadcast
     * @param {Object} message - Mensagem de broadcast
     */
    handleBroadcastMessage(message) {
        console.log('[PeerManager] Broadcast from', message.fromPeerId, ':', message.data);
        
        // Disparar evento customizado para outros módulos
        window.dispatchEvent(new CustomEvent('neonet-peer-message', {
            detail: {
                fromPeerId: message.fromPeerId,
                data: message.data
            }
        }));
    }

    /**
     * Envia dados para todos os pares conectados
     * @param {any} data - Dados a serem enviados
     */
    broadcast(data) {
        console.log('[PeerManager] Broadcasting to', this.peers.size, 'peers');
        
        // Enviar via servidor de sinalização para alcançar mais pares
        if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
            this.signalingSocket.send(JSON.stringify({
                type: 'broadcast',
                data: data
            }));
        }

        // Enviar diretamente para pares conectados
        for (const peer of this.peers.values()) {
            if (peer.connected) {
                peer.send(data);
            }
        }
    }

    /**
     * Envia dados para um peer específico
     * @param {string} peerId - ID do peer
     * @param {any} data - Dados a serem enviados
     */
    sendToPeer(peerId, data) {
        const peer = this.peers.get(peerId);
        if (peer && peer.connected) {
            peer.send(data);
        } else {
            console.warn('[PeerManager] Peer not connected:', peerId);
        }
    }

    /**
     * Obtém o número de pares conectados
     * @returns {number} Número de pares conectados
     */
    getConnectedPeersCount() {
        return Array.from(this.peers.values()).filter(peer => peer.connected).length;
    }

    /**
     * Obtém lista de pares conectados
     * @returns {Array} Lista de IDs de pares conectados
     */
    getConnectedPeers() {
        return Array.from(this.peers.entries())
            .filter(([_, peer]) => peer.connected)
            .map(([id, _]) => id);
    }

    /**
     * Desconecta da rede P2P
     */
    disconnect() {
        if (this.signalingSocket) {
            this.signalingSocket.close();
        }
        
        this.peers.clear();
        this.isConnected = false;
        console.log('[PeerManager] Disconnected from P2P network');
    }
}

export default PeerManager;

