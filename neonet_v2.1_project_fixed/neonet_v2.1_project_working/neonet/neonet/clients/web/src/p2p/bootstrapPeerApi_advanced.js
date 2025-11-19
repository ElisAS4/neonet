// neonet/clients/web/src/p2p/bootstrapPeerApi_advanced.js

import IndexedDBManager from '../utils/IndexedDBManager.js';

/**
 * API de Bootstrap de Pares Avançada
 * Gerencia a conexão inicial à rede P2P, priorizando pares conhecidos e implementando
 * estratégias de reconexão inteligentes.
 */
class BootstrapPeerApi {
    constructor() {
        this.dbManager = IndexedDBManager;
        this.peerMetadataStore = 'peerMetadata';
        this.signalingServerUrl = 'ws://localhost:8080'; // URL do seu servidor de sinalização
        this.maxRetries = 5;
        this.retryDelayMs = 2000; // 2 segundos

        this.initializeDb();
    }

    /**
     * Inicializa o IndexedDB para garantir que o store de metadados de pares exista.
     */
    async initializeDb() {
        try {
            await this.dbManager.open();
            console.log('[BootstrapPeerApi] IndexedDB initialized for peer metadata.');
        } catch (error) {
            console.error('[BootstrapPeerApi] Error initializing IndexedDB:', error);
        }
    }

    /**
     * Tenta conectar-se à rede P2P usando várias estratégias.
     * @returns {Promise<boolean>} True se a conexão for bem-sucedida, false caso contrário.
     */
    async connectToPeerNetwork() {
        console.log('[BootstrapPeerApi] Attempting to connect to peer network...');

        // 1. Tentar conectar a pares conhecidos persistidos
        const connectedToKnownPeer = await this.connectToKnownPeers();
        if (connectedToKnownPeer) {
            console.log('[BootstrapPeerApi] Successfully connected via known peers.');
            return true;
        }

        console.log('[BootstrapPeerApi] No connection via known peers. Falling back to signaling server.');

        // 2. Fallback para o servidor de sinalização
        const connectedViaSignaling = await this.connectViaSignalingServer();
        if (connectedViaSignaling) {
            console.log('[BootstrapPeerApi] Successfully connected via signaling server.');
            return true;
        }

        console.warn('[BootstrapPeerApi] Failed to connect to peer network after all attempts.');
        return false;
    }

    /**
     * Tenta conectar-se a pares conhecidos armazenados localmente.
     * @returns {Promise<boolean>} True se conectar a pelo menos um par, false caso contrário.
     */
    async connectToKnownPeers() {
        try {
            const knownPeers = await this.dbManager.getAll(this.peerMetadataStore);
            if (knownPeers.length === 0) {
                console.log('[BootstrapPeerApi] No known peers found in local storage.');
                return false;
            }

            console.log(`[BootstrapPeerApi] Attempting to connect to ${knownPeers.length} known peers.`);
            for (const peer of knownPeers) {
                try {
                    // Simula a tentativa de conexão direta ao peer
                    // Em uma implementação real, isso envolveria WebRTC ou WebSockets diretos
                    const isConnected = await this.simulateDirectPeerConnection(peer.address);
                    if (isConnected) {
                        console.log(`[BootstrapPeerApi] Connected to known peer: ${peer.peerId} at ${peer.address}`);
                        // Atualizar metadados do peer (ex: último visto)
                        peer.lastSeen = Date.now();
                        await this.dbManager.update(this.peerMetadataStore, peer.peerId, peer);
                        return true;
                    }
                } catch (peerError) {
                    console.warn(`[BootstrapPeerApi] Failed to connect to known peer ${peer.peerId}:`, peerError);
                    // Opcional: remover peer se a conexão falhar consistentemente
                    // await this.dbManager.delete(this.peerMetadataStore, peer.peerId);
                }
            }
            return false;
        } catch (error) {
            console.error('[BootstrapPeerApi] Error connecting to known peers:', error);
            return false;
        }
    }

    /**
     * Simula uma conexão direta a um peer (substituir por lógica WebRTC/WebSocket real).
     * @param {string} address - Endereço do peer.
     * @returns {Promise<boolean>} True se a conexão for bem-sucedida.
     */
    async simulateDirectPeerConnection(address) {
        return new Promise(resolve => {
            setTimeout(() => {
                const success = Math.random() > 0.3; // 70% de chance de sucesso
                resolve(success);
            }, 500);
        });
    }

    /**
     * Tenta conectar-se ao servidor de sinalização.
     * @returns {Promise<boolean>} True se a conexão for bem-sucedida, false caso contrário.
     */
    async connectViaSignalingServer() {
        let attempts = 0;
        while (attempts < this.maxRetries) {
            try {
                console.log(`[BootstrapPeerApi] Attempting to connect to signaling server (${attempts + 1}/${this.maxRetries})...`);
                const ws = new WebSocket(this.signalingServerUrl);

                return new Promise((resolve, reject) => {
                    ws.onopen = () => {
                        console.log('[BootstrapPeerApi] Connected to signaling server.');
                        // Simular recebimento de lista de peers do servidor
                        setTimeout(() => {
                            const discoveredPeers = [
                                { peerId: 'peer_A', address: 'ws://peerA.example.com' },
                                { peerId: 'peer_B', address: 'ws://peerB.example.com' }
                            ];
                            this.saveDiscoveredPeers(discoveredPeers);
                            ws.close(); // Fechar conexão após bootstrap
                            resolve(true);
                        }, 1000);
                    };

                    ws.onerror = (event) => {
                        console.error('[BootstrapPeerApi] Signaling server connection error:', event);
                        reject(new Error('Signaling server connection failed'));
                    };

                    ws.onclose = () => {
                        console.log('[BootstrapPeerApi] Signaling server connection closed.');
                    };
                });
            } catch (error) {
                console.warn(`[BootstrapPeerApi] Signaling server connection attempt failed: ${error.message}`);
                attempts++;
                if (attempts < this.maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelayMs));
                }
            }
        }
        return false;
    }

    /**
     * Salva pares descobertos no armazenamento local.
     * @param {Array<Object>} peers - Lista de objetos de pares com peerId e address.
     */
    async saveDiscoveredPeers(peers) {
        console.log('[BootstrapPeerApi] Saving discovered peers:', peers);
        for (const peer of peers) {
            try {
                const existingPeer = await this.dbManager.get(this.peerMetadataStore, peer.peerId);
                if (existingPeer) {
                    // Atualizar peer existente
                    await this.dbManager.update(this.peerMetadataStore, peer.peerId, { ...existingPeer, ...peer, lastSeen: Date.now() });
                } else {
                    // Adicionar novo peer
                    await this.dbManager.add(this.peerMetadataStore, { ...peer, lastSeen: Date.now() });
                }
            } catch (error) {
                console.error(`[BootstrapPeerApi] Error saving peer ${peer.peerId}:`, error);
            }
        }
    }

    /**
     * Limpa todos os pares conhecidos do armazenamento local.
     */
    async clearKnownPeers() {
        try {
            await this.dbManager.clear(this.peerMetadataStore);
            console.log('[BootstrapPeerApi] All known peers cleared from local storage.');
        } catch (error) {
            console.error('[BootstrapPeerApi] Error clearing known peers:', error);
        }
    }
}

// Exportar instância singleton
const bootstrapPeerApi = new BootstrapPeerApi();
export default bootstrapPeerApi;


