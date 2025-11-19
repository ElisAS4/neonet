// neonet/clients/web/mock-dapps/neonet-chat/chat.js

class NeoNetChat {
    constructor() {
        this.messages = [];
        this.userId = this.generateUserId();
        this.userName = `Usuário_${this.userId.slice(-4)}`;
        this.isOnline = navigator.onLine;
        
        this.initializeElements();
        this.initializeEventListeners();
        this.loadStoredMessages();
        this.updateConnectionStatus();
        
        console.log('[NeoNetChat] Initialized with user ID:', this.userId);
    }

    /**
     * Inicializa elementos do DOM
     */
    initializeElements() {
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusText = document.getElementById('statusText');
    }

    /**
     * Inicializa event listeners
     */
    initializeEventListeners() {
        // Enviar mensagem
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Monitorar conectividade
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateConnectionStatus();
            this.syncMessages();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateConnectionStatus();
        });

        // Escutar mensagens P2P (simulado)
        window.addEventListener('neonet-peer-message', (event) => {
            this.handlePeerMessage(event.detail);
        });
    }

    /**
     * Gera um ID único para o usuário
     */
    generateUserId() {
        let userId = localStorage.getItem('neonet-chat-user-id');
        if (!userId) {
            userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('neonet-chat-user-id', userId);
        }
        return userId;
    }

    /**
     * Carrega mensagens armazenadas localmente
     */
    async loadStoredMessages() {
        try {
            const stored = localStorage.getItem('neonet-chat-messages');
            if (stored) {
                this.messages = JSON.parse(stored);
                this.renderMessages();
            }
        } catch (error) {
            console.error('[NeoNetChat] Error loading stored messages:', error);
        }
    }

    /**
     * Salva mensagens no armazenamento local
     */
    saveMessages() {
        try {
            localStorage.setItem('neonet-chat-messages', JSON.stringify(this.messages));
        } catch (error) {
            console.error('[NeoNetChat] Error saving messages:', error);
        }
    }

    /**
     * Envia uma mensagem
     */
    sendMessage() {
        const text = this.messageInput.value.trim();
        if (!text) return;

        const message = {
            id: this.generateMessageId(),
            text: text,
            userId: this.userId,
            userName: this.userName,
            timestamp: Date.now(),
            synced: this.isOnline
        };

        this.addMessage(message);
        this.messageInput.value = '';

        // Tentar enviar via P2P se online
        if (this.isOnline) {
            this.broadcastMessage(message);
        }
    }

    /**
     * Adiciona uma mensagem à lista
     */
    addMessage(message) {
        // Verificar se a mensagem já existe (evitar duplicatas)
        if (this.messages.find(m => m.id === message.id)) {
            return;
        }

        this.messages.push(message);
        this.saveMessages();
        this.renderMessage(message);
        this.scrollToBottom();
    }

    /**
     * Renderiza todas as mensagens
     */
    renderMessages() {
        this.chatMessages.innerHTML = `
            <div class="system-message">
                Bem-vindo ao NeoNet Chat! Suas mensagens são sincronizadas automaticamente quando online.
            </div>
        `;
        
        this.messages.forEach(message => this.renderMessage(message));
        this.scrollToBottom();
    }

    /**
     * Renderiza uma mensagem individual
     */
    renderMessage(message) {
        const messageElement = document.createElement('div');
        const isOwn = message.userId === this.userId;
        
        messageElement.className = `message ${isOwn ? 'own' : 'other'}`;
        
        const timeStr = new Date(message.timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const syncIcon = message.synced ? '✓' : '⏳';
        
        messageElement.innerHTML = `
            <div class="message-text">${this.escapeHtml(message.text)}</div>
            <div class="message-info">
                ${isOwn ? '' : message.userName + ' • '}${timeStr} ${syncIcon}
            </div>
        `;

        this.chatMessages.appendChild(messageElement);
    }

    /**
     * Faz scroll para o final do chat
     */
    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    /**
     * Atualiza o status de conexão na UI
     */
    updateConnectionStatus() {
        if (this.isOnline) {
            this.connectionStatus.className = 'status-indicator online';
            this.statusText.textContent = 'Online';
        } else {
            this.connectionStatus.className = 'status-indicator offline';
            this.statusText.textContent = 'Offline';
        }
    }

    /**
     * Transmite mensagem via P2P (simulado)
     */
    broadcastMessage(message) {
        // Em uma implementação real, isso usaria o PeerManager
        console.log('[NeoNetChat] Broadcasting message:', message.text);
        
        // Simular envio via parent window (NeoNet principal)
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'neonet-chat-broadcast',
                message: message
            }, '*');
        }
    }

    /**
     * Manipula mensagens recebidas de outros pares
     */
    handlePeerMessage(data) {
        if (data.type === 'chat-message') {
            const message = data.message;
            message.synced = true; // Mensagem recebida já está sincronizada
            this.addMessage(message);
        }
    }

    /**
     * Sincroniza mensagens não sincronizadas
     */
    syncMessages() {
        const unsyncedMessages = this.messages.filter(m => !m.synced && m.userId === this.userId);
        
        if (unsyncedMessages.length > 0) {
            console.log('[NeoNetChat] Syncing', unsyncedMessages.length, 'messages');
            
            unsyncedMessages.forEach(message => {
                message.synced = true;
                this.broadcastMessage(message);
            });
            
            this.saveMessages();
            this.renderMessages(); // Re-renderizar para atualizar ícones de sincronização
        }
    }

    /**
     * Gera ID único para mensagem
     */
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Escapa HTML para prevenir XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Inicializar chat quando DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    new NeoNetChat();
});

