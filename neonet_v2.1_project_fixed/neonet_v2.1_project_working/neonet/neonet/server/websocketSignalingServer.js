// neonet/server/websocketSignalingServer.js

const WebSocket = require('ws');

/**
 * Servidor de Sinalização WebSocket para NeoNet
 * Facilita a descoberta de pares e a troca de metadados para conexões P2P
 */
class SignalingServer {
    constructor(port = 8080) {
        this.port = port;
        this.clients = new Map(); // Map de WebSocket para metadados do cliente
        this.rooms = new Map(); // Map de salas para clientes
        
        this.initializeServer();
    }

    /**
     * Inicializa o servidor WebSocket
     */
    initializeServer() {
        this.wss = new WebSocket.Server({ 
            port: this.port,
            perMessageDeflate: false 
        });

        this.wss.on('connection', (ws, req) => {
            console.log(`[SignalingServer] New connection from ${req.socket.remoteAddress}`);
            this.handleNewConnection(ws, req);
        });

        console.log(`[SignalingServer] Server started on port ${this.port}`);
    }

    /**
     * Manipula uma nova conexão WebSocket
     * @param {WebSocket} ws - Socket do cliente
     * @param {IncomingMessage} req - Requisição HTTP
     */
    handleNewConnection(ws, req) {
        const clientId = this.generateClientId();
        
        // Armazenar metadados do cliente
        this.clients.set(ws, {
            id: clientId,
            address: req.socket.remoteAddress,
            connectedAt: Date.now(),
            room: null
        });

        // Enviar ID do cliente
        this.sendMessage(ws, {
            type: 'client-id',
            clientId: clientId
        });

        // Configurar event listeners
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(ws, message);
            } catch (error) {
                console.error('[SignalingServer] Invalid JSON received:', error);
                this.sendError(ws, 'Invalid JSON format');
            }
        });

        ws.on('close', () => {
            this.handleDisconnection(ws);
        });

        ws.on('error', (error) => {
            console.error('[SignalingServer] WebSocket error:', error);
            this.handleDisconnection(ws);
        });
    }

    /**
     * Manipula mensagens recebidas dos clientes
     * @param {WebSocket} ws - Socket do cliente
     * @param {Object} message - Mensagem recebida
     */
    handleMessage(ws, message) {
        const client = this.clients.get(ws);
        if (!client) {
            console.error('[SignalingServer] Message from unknown client');
            return;
        }

        console.log(`[SignalingServer] Message from ${client.id}:`, message.type);

        switch (message.type) {
            case 'join-room':
                this.handleJoinRoom(ws, message.room);
                break;
            
            case 'leave-room':
                this.handleLeaveRoom(ws);
                break;
            
            case 'peer-discovery':
                this.handlePeerDiscovery(ws);
                break;
            
            case 'webrtc-offer':
            case 'webrtc-answer':
            case 'webrtc-ice-candidate':
                this.handleWebRTCSignaling(ws, message);
                break;
            
            case 'broadcast':
                this.handleBroadcast(ws, message);
                break;
            
            case 'ping':
                this.sendMessage(ws, { type: 'pong' });
                break;
            
            default:
                console.warn('[SignalingServer] Unknown message type:', message.type);
                this.sendError(ws, 'Unknown message type');
        }
    }

    /**
     * Manipula entrada em sala
     * @param {WebSocket} ws - Socket do cliente
     * @param {string} roomName - Nome da sala
     */
    handleJoinRoom(ws, roomName) {
        const client = this.clients.get(ws);
        
        // Sair da sala atual se estiver em uma
        if (client.room) {
            this.handleLeaveRoom(ws);
        }

        // Entrar na nova sala
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, new Set());
        }
        
        this.rooms.get(roomName).add(ws);
        client.room = roomName;

        console.log(`[SignalingServer] Client ${client.id} joined room ${roomName}`);

        // Notificar cliente sobre sucesso
        this.sendMessage(ws, {
            type: 'room-joined',
            room: roomName,
            clientCount: this.rooms.get(roomName).size
        });

        // Notificar outros clientes na sala
        this.broadcastToRoom(roomName, {
            type: 'peer-joined',
            peerId: client.id
        }, ws);
    }

    /**
     * Manipula saída de sala
     * @param {WebSocket} ws - Socket do cliente
     */
    handleLeaveRoom(ws) {
        const client = this.clients.get(ws);
        if (!client.room) return;

        const room = this.rooms.get(client.room);
        if (room) {
            room.delete(ws);
            
            // Notificar outros clientes na sala
            this.broadcastToRoom(client.room, {
                type: 'peer-left',
                peerId: client.id
            }, ws);

            // Remover sala se vazia
            if (room.size === 0) {
                this.rooms.delete(client.room);
            }
        }

        console.log(`[SignalingServer] Client ${client.id} left room ${client.room}`);
        client.room = null;
    }

    /**
     * Manipula descoberta de pares
     * @param {WebSocket} ws - Socket do cliente
     */
    handlePeerDiscovery(ws) {
        const client = this.clients.get(ws);
        const peers = [];

        // Se estiver em uma sala, retornar pares da sala
        if (client.room && this.rooms.has(client.room)) {
            for (const peerWs of this.rooms.get(client.room)) {
                if (peerWs !== ws) {
                    const peerClient = this.clients.get(peerWs);
                    peers.push({
                        id: peerClient.id,
                        connectedAt: peerClient.connectedAt
                    });
                }
            }
        } else {
            // Retornar uma amostra de pares globais
            const allClients = Array.from(this.clients.entries());
            const sampleSize = Math.min(10, allClients.length - 1);
            
            for (let i = 0; i < sampleSize; i++) {
                const [peerWs, peerClient] = allClients[i];
                if (peerWs !== ws) {
                    peers.push({
                        id: peerClient.id,
                        connectedAt: peerClient.connectedAt
                    });
                }
            }
        }

        this.sendMessage(ws, {
            type: 'peer-list',
            peers: peers
        });
    }

    /**
     * Manipula sinalização WebRTC
     * @param {WebSocket} ws - Socket do cliente
     * @param {Object} message - Mensagem de sinalização
     */
    handleWebRTCSignaling(ws, message) {
        const client = this.clients.get(ws);
        
        if (!message.targetPeerId) {
            this.sendError(ws, 'Target peer ID required for WebRTC signaling');
            return;
        }

        // Encontrar o peer de destino
        const targetWs = this.findClientById(message.targetPeerId);
        if (!targetWs) {
            this.sendError(ws, 'Target peer not found');
            return;
        }

        // Encaminhar mensagem para o peer de destino
        this.sendMessage(targetWs, {
            ...message,
            fromPeerId: client.id
        });
    }

    /**
     * Manipula broadcast de mensagens
     * @param {WebSocket} ws - Socket do cliente
     * @param {Object} message - Mensagem para broadcast
     */
    handleBroadcast(ws, message) {
        const client = this.clients.get(ws);
        
        if (client.room) {
            // Broadcast para a sala
            this.broadcastToRoom(client.room, {
                type: 'broadcast',
                fromPeerId: client.id,
                data: message.data
            }, ws);
        } else {
            // Broadcast global (limitado)
            let count = 0;
            for (const [peerWs, peerClient] of this.clients) {
                if (peerWs !== ws && count < 50) { // Limitar a 50 pares
                    this.sendMessage(peerWs, {
                        type: 'broadcast',
                        fromPeerId: client.id,
                        data: message.data
                    });
                    count++;
                }
            }
        }
    }

    /**
     * Manipula desconexão de cliente
     * @param {WebSocket} ws - Socket do cliente
     */
    handleDisconnection(ws) {
        const client = this.clients.get(ws);
        if (!client) return;

        console.log(`[SignalingServer] Client ${client.id} disconnected`);

        // Sair da sala se estiver em uma
        this.handleLeaveRoom(ws);

        // Remover cliente
        this.clients.delete(ws);
    }

    /**
     * Envia mensagem para um cliente
     * @param {WebSocket} ws - Socket do cliente
     * @param {Object} message - Mensagem a ser enviada
     */
    sendMessage(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    /**
     * Envia erro para um cliente
     * @param {WebSocket} ws - Socket do cliente
     * @param {string} error - Mensagem de erro
     */
    sendError(ws, error) {
        this.sendMessage(ws, {
            type: 'error',
            message: error
        });
    }

    /**
     * Faz broadcast para todos os clientes de uma sala
     * @param {string} roomName - Nome da sala
     * @param {Object} message - Mensagem para broadcast
     * @param {WebSocket} excludeWs - Socket a ser excluído do broadcast
     */
    broadcastToRoom(roomName, message, excludeWs = null) {
        const room = this.rooms.get(roomName);
        if (!room) return;

        for (const ws of room) {
            if (ws !== excludeWs) {
                this.sendMessage(ws, message);
            }
        }
    }

    /**
     * Encontra um cliente pelo ID
     * @param {string} clientId - ID do cliente
     * @returns {WebSocket|null} Socket do cliente ou null
     */
    findClientById(clientId) {
        for (const [ws, client] of this.clients) {
            if (client.id === clientId) {
                return ws;
            }
        }
        return null;
    }

    /**
     * Gera um ID único para cliente
     * @returns {string} ID único
     */
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Obtém estatísticas do servidor
     * @returns {Object} Estatísticas
     */
    getStats() {
        return {
            connectedClients: this.clients.size,
            activeRooms: this.rooms.size,
            totalRoomMembers: Array.from(this.rooms.values()).reduce((sum, room) => sum + room.size, 0)
        };
    }
}

// Inicializar servidor
const server = new SignalingServer(process.env.PORT || 8080);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('[SignalingServer] Shutting down gracefully...');
    server.wss.close(() => {
        console.log('[SignalingServer] Server closed');
        process.exit(0);
    });
});

module.exports = SignalingServer;

