// neonet/clients/web/mock-dapps/neonet-chat/chat_enhanced.js
// NeoNet Chat dApp - Versão Aprimorada com Arquitetura Offline-First

class NeoNetChatEnhanced {
    constructor() {
        this.version = '2.0.0';
        this.messages = new Map(); // Usar Map para melhor performance
        this.userId = this.generateUserId();
        this.userName = this.getUserName();
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.lastSyncTimestamp = 0;
        this.maxMessages = 1000; // Limite de mensagens em memória
        this.maxStorageSize = 10 * 1024 * 1024; // 10MB
        
        // Configurações CRDT para resolução de conflitos
        this.vectorClock = new Map();
        this.nodeId = this.userId;
        
        // Estado de sincronização
        this.syncStatus = {
            inProgress: false,
            lastSync: 0,
            pendingCount: 0,
            errorCount: 0
        };
        
        this.init();
    }
    
    async init() {
        try {
            console.log('[NeoNetChat Enhanced] Initializing version', this.version);
            
            // Inicializar IndexedDB para armazenamento persistente
            await this.initDatabase();
            
            // Inicializar elementos do DOM
            this.initializeElements();
            
            // Configurar event listeners
            this.initializeEventListeners();
            
            // Carregar mensagens armazenadas
            await this.loadStoredMessages();
            
            // Configurar sincronização automática
            this.setupAutoSync();
            
            // Atualizar status inicial
            this.updateConnectionStatus();
            this.updateSyncStatus();
            
            // Registrar com o sistema principal NeoNet
            this.registerWithNeoNet();
            
            console.log('[NeoNetChat Enhanced] Initialization complete');
        } catch (error) {
            console.error('[NeoNetChat Enhanced] Initialization failed:', error);
            this.handleInitializationError(error);
        }
    }
    
    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('NeoNetChatDB', 2);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store para mensagens
                if (!db.objectStoreNames.contains('messages')) {
                    const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
                    messageStore.createIndex('timestamp', 'timestamp');
                    messageStore.createIndex('userId', 'userId');
                    messageStore.createIndex('synced', 'synced');
                    messageStore.createIndex('vectorTimestamp', 'vectorTimestamp');
                }
                
                // Store para configurações
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }
                
                // Store para peers
                if (!db.objectStoreNames.contains('peers')) {
                    const peerStore = db.createObjectStore('peers', { keyPath: 'id' });
                    peerStore.createIndex('lastSeen', 'lastSeen');
                    peerStore.createIndex('status', 'status');
                }
                
                // Store para fila de sincronização
                if (!db.objectStoreNames.contains('syncQueue')) {
                    const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                    syncStore.createIndex('timestamp', 'timestamp');
                    syncStore.createIndex('priority', 'priority');
                }
            };
        });
    }
    
    initializeElements() {
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusText = document.getElementById('statusText');
        this.syncIndicator = document.getElementById('syncIndicator');
        this.messageCount = document.getElementById('messageCount');
        this.userInfo = document.getElementById('userInfo');
        
        // Criar elementos se não existirem
        if (!this.syncIndicator) {
            this.createSyncIndicator();
        }
        
        if (!this.messageCount) {
            this.createMessageCounter();
        }
        
        if (!this.userInfo) {
            this.createUserInfo();
        }
    }
    
    createSyncIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'syncIndicator';
        indicator.className = 'sync-indicator';
        indicator.innerHTML = `
            <span class="sync-icon">⟳</span>
            <span class="sync-text">Sincronizado</span>
        `;
        
        const header = document.querySelector('.chat-header') || document.body;
        header.appendChild(indicator);
        this.syncIndicator = indicator;
    }
    
    createMessageCounter() {
        const counter = document.createElement('div');
        counter.id = 'messageCount';
        counter.className = 'message-counter';
        counter.textContent = '0 mensagens';
        
        const header = document.querySelector('.chat-header') || document.body;
        header.appendChild(counter);
        this.messageCount = counter;
    }
    
    createUserInfo() {
        const userInfo = document.createElement('div');
        userInfo.id = 'userInfo';
        userInfo.className = 'user-info';
        userInfo.innerHTML = `
            <span class="user-name">${this.userName}</span>
            <span class="user-id">${this.userId.slice(-8)}</span>
        `;
        
        const header = document.querySelector('.chat-header') || document.body;
        header.appendChild(userInfo);
        this.userInfo = userInfo;
    }
    
    initializeEventListeners() {
        // Enviar mensagem
        this.sendButton?.addEventListener('click', () => this.sendMessage());
        this.messageInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Monitorar conectividade
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Escutar eventos do sistema NeoNet
        window.addEventListener('neonet-peer-message', (event) => {
            this.handlePeerMessage(event.detail);
        });
        
        window.addEventListener('neonet-sync-complete', (event) => {
            this.handleSystemSync(event.detail);
        });
        
        // Escutar mensagens do parent window
        window.addEventListener('message', (event) => {
            this.handleParentMessage(event.data);
        });
        
        // Auto-save ao sair
        window.addEventListener('beforeunload', () => {
            this.saveCurrentState();
        });
        
        // Visibilidade da página
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.performSync();
            }
        });
    }
    
    generateUserId() {
        let userId = localStorage.getItem('neonet-chat-user-id');
        if (!userId) {
            userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('neonet-chat-user-id', userId);
        }
        return userId;
    }
    
    getUserName() {
        let userName = localStorage.getItem('neonet-chat-user-name');
        if (!userName) {
            userName = `Usuário_${this.userId.slice(-4)}`;
            localStorage.setItem('neonet-chat-user-name', userName);
        }
        return userName;
    }
    
    async loadStoredMessages() {
        try {
            const transaction = this.db.transaction(['messages'], 'readonly');
            const store = transaction.objectStore('messages');
            const index = store.index('timestamp');
            
            // Carregar últimas 100 mensagens
            const request = index.openCursor(null, 'prev');
            const messages = [];
            let count = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && count < 100) {
                    messages.unshift(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    // Carregar mensagens na interface
                    messages.forEach(message => {
                        this.messages.set(message.id, message);
                    });
                    
                    this.renderMessages();
                    this.updateMessageCount();
                    console.log(`[NeoNetChat Enhanced] Loaded ${messages.length} messages`);
                }
            };
            
            request.onerror = () => {
                console.error('[NeoNetChat Enhanced] Error loading messages:', request.error);
            };
        } catch (error) {
            console.error('[NeoNetChat Enhanced] Error in loadStoredMessages:', error);
        }
    }
    
    async saveMessage(message) {
        try {
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');
            await store.put(message);
            
            // Limpar mensagens antigas se necessário
            await this.cleanOldMessages();
        } catch (error) {
            console.error('[NeoNetChat Enhanced] Error saving message:', error);
        }
    }
    
    async cleanOldMessages() {
        try {
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');
            const countRequest = store.count();
            
            countRequest.onsuccess = async () => {
                const count = countRequest.result;
                
                if (count > this.maxMessages) {
                    const index = store.index('timestamp');
                    const deleteCount = count - this.maxMessages;
                    let deleted = 0;
                    
                    const request = index.openCursor();
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor && deleted < deleteCount) {
                            cursor.delete();
                            deleted++;
                            cursor.continue();
                        }
                    };
                }
            };
        } catch (error) {
            console.error('[NeoNetChat Enhanced] Error cleaning old messages:', error);
        }
    }
    
    async sendMessage() {
        const text = this.messageInput?.value?.trim();
        if (!text) return;
        
        const message = this.createMessage(text);
        
        // Adicionar à interface imediatamente
        await this.addMessage(message);
        
        // Limpar input
        if (this.messageInput) {
            this.messageInput.value = '';
        }
        
        // Adicionar à fila de sincronização
        await this.queueForSync(message);
        
        // Tentar sincronizar imediatamente se online
        if (this.isOnline) {
            this.performSync();
        }
    }
    
    createMessage(text) {
        const timestamp = Date.now();
        const vectorTimestamp = this.incrementVectorClock();
        
        return {
            id: this.generateMessageId(),
            text: text,
            userId: this.userId,
            userName: this.userName,
            timestamp: timestamp,
            vectorTimestamp: Array.from(vectorTimestamp.entries()),
            nodeId: this.nodeId,
            synced: false,
            type: 'user',
            metadata: {
                clientVersion: this.version,
                platform: navigator.platform,
                userAgent: navigator.userAgent.substring(0, 100)
            }
        };
    }
    
    async addMessage(message) {
        // Verificar se mensagem já existe (evitar duplicatas)
        if (this.messages.has(message.id)) {
            return false;
        }
        
        // Verificar conflitos usando CRDT
        const existingMessage = await this.findConflictingMessage(message);
        if (existingMessage) {
            const resolved = this.resolveMessageConflict(existingMessage, message);
            message = resolved;
        }
        
        // Adicionar à memória
        this.messages.set(message.id, message);
        
        // Salvar no banco
        await this.saveMessage(message);
        
        // Atualizar vector clock
        this.updateVectorClock(new Map(message.vectorTimestamp));
        
        // Renderizar na interface
        this.renderMessage(message);
        this.scrollToBottom();
        this.updateMessageCount();
        
        return true;
    }
    
    async findConflictingMessage(message) {
        // Procurar mensagens com timestamp similar do mesmo usuário
        const timeWindow = 1000; // 1 segundo
        
        for (const [id, existing] of this.messages) {
            if (existing.userId === message.userId &&
                Math.abs(existing.timestamp - message.timestamp) < timeWindow &&
                existing.text === message.text) {
                return existing;
            }
        }
        
        return null;
    }
    
    resolveMessageConflict(existing, incoming) {
        // Usar vector clock para determinar ordem
        const existingVector = new Map(existing.vectorTimestamp || []);
        const incomingVector = new Map(incoming.vectorTimestamp || []);
        
        // Se incoming é mais recente, usar incoming
        if (this.isVectorClockNewer(incomingVector, existingVector)) {
            return incoming;
        }
        
        // Senão, manter existing
        return existing;
    }
    
    isVectorClockNewer(vectorA, vectorB) {
        let isNewer = false;
        let isOlder = false;
        
        const allNodes = new Set([...vectorA.keys(), ...vectorB.keys()]);
        
        for (const nodeId of allNodes) {
            const timeA = vectorA.get(nodeId) || 0;
            const timeB = vectorB.get(nodeId) || 0;
            
            if (timeA > timeB) {
                isNewer = true;
            } else if (timeA < timeB) {
                isOlder = true;
            }
        }
        
        return isNewer && !isOlder;
    }
    
    incrementVectorClock() {
        const current = this.vectorClock.get(this.nodeId) || 0;
        this.vectorClock.set(this.nodeId, current + 1);
        return new Map(this.vectorClock);
    }
    
    updateVectorClock(remoteVectorClock) {
        for (const [nodeId, timestamp] of remoteVectorClock) {
            const current = this.vectorClock.get(nodeId) || 0;
            this.vectorClock.set(nodeId, Math.max(current, timestamp));
        }
    }
    
    renderMessages() {
        if (!this.chatMessages) return;
        
        this.chatMessages.innerHTML = `
            <div class="system-message">
                <div class="system-icon">🌐</div>
                <div class="system-text">
                    Bem-vindo ao NeoNet Chat Enhanced!<br>
                    Suas mensagens são sincronizadas automaticamente e funcionam 100% offline.
                </div>
            </div>
        `;
        
        // Ordenar mensagens por timestamp
        const sortedMessages = Array.from(this.messages.values())
            .sort((a, b) => a.timestamp - b.timestamp);
        
        sortedMessages.forEach(message => this.renderMessage(message));
        this.scrollToBottom();
    }
    
    renderMessage(message) {
        if (!this.chatMessages) return;
        
        const messageElement = document.createElement('div');
        const isOwn = message.userId === this.userId;
        
        messageElement.className = `message ${isOwn ? 'own' : 'other'} ${message.synced ? 'synced' : 'pending'}`;
        messageElement.dataset.messageId = message.id;
        
        const timeStr = new Date(message.timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const syncIcon = this.getSyncIcon(message);
        const conflictIcon = message.conflict ? '⚠️' : '';
        
        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(message.text)}</div>
                <div class="message-info">
                    ${isOwn ? '' : `<span class="sender">${this.escapeHtml(message.userName)}</span> • `}
                    <span class="time">${timeStr}</span>
                    <span class="sync-status">${syncIcon}</span>
                    ${conflictIcon}
                </div>
            </div>
        `;
        
        this.chatMessages.appendChild(messageElement);
    }
    
    getSyncIcon(message) {
        if (message.synced) {
            return '✓';
        } else if (this.isOnline) {
            return '⏳';
        } else {
            return '📱';
        }
    }
    
    scrollToBottom() {
        if (this.chatMessages) {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
    }
    
    updateConnectionStatus() {
        if (!this.connectionStatus || !this.statusText) return;
        
        if (this.isOnline) {
            this.connectionStatus.className = 'status-indicator online';
            this.statusText.textContent = 'Online';
        } else {
            this.connectionStatus.className = 'status-indicator offline';
            this.statusText.textContent = 'Offline';
        }
    }
    
    updateSyncStatus() {
        if (!this.syncIndicator) return;
        
        const icon = this.syncIndicator.querySelector('.sync-icon');
        const text = this.syncIndicator.querySelector('.sync-text');
        
        if (!icon || !text) return;
        
        if (this.syncStatus.inProgress) {
            icon.textContent = '⟳';
            text.textContent = 'Sincronizando...';
            this.syncIndicator.className = 'sync-indicator syncing';
        } else if (this.syncStatus.pendingCount > 0) {
            icon.textContent = '⏳';
            text.textContent = `${this.syncStatus.pendingCount} pendentes`;
            this.syncIndicator.className = 'sync-indicator pending';
        } else if (this.syncStatus.errorCount > 0) {
            icon.textContent = '⚠️';
            text.textContent = 'Erro na sincronização';
            this.syncIndicator.className = 'sync-indicator error';
        } else {
            icon.textContent = '✓';
            text.textContent = 'Sincronizado';
            this.syncIndicator.className = 'sync-indicator synced';
        }
    }
    
    updateMessageCount() {
        if (this.messageCount) {
            const count = this.messages.size;
            this.messageCount.textContent = `${count} mensagem${count !== 1 ? 's' : ''}`;
        }
    }
    
    async queueForSync(message) {
        try {
            const syncItem = {
                messageId: message.id,
                action: 'send',
                timestamp: Date.now(),
                priority: 1,
                retryCount: 0
            };
            
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            await store.add(syncItem);
            
            this.syncQueue.push(syncItem);
            this.syncStatus.pendingCount++;
            this.updateSyncStatus();
        } catch (error) {
            console.error('[NeoNetChat Enhanced] Error queuing for sync:', error);
        }
    }
    
    async performSync() {
        if (this.syncStatus.inProgress || !this.isOnline || this.syncQueue.length === 0) {
            return;
        }
        
        this.syncStatus.inProgress = true;
        this.updateSyncStatus();
        
        try {
            console.log('[NeoNetChat Enhanced] Starting sync...');
            
            // Processar fila de sincronização
            const results = await Promise.allSettled(
                this.syncQueue.map(item => this.syncItem(item))
            );
            
            // Atualizar estatísticas
            const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
            const failed = results.length - successful;
            
            // Remover itens sincronizados com sucesso
            this.syncQueue = this.syncQueue.filter((item, index) => {
                const result = results[index];
                return result.status === 'rejected' || !result.value;
            });
            
            this.syncStatus.pendingCount = this.syncQueue.length;
            this.syncStatus.errorCount = failed;
            this.lastSyncTimestamp = Date.now();
            
            console.log(`[NeoNetChat Enhanced] Sync completed: ${successful} successful, ${failed} failed`);
        } catch (error) {
            console.error('[NeoNetChat Enhanced] Sync failed:', error);
            this.syncStatus.errorCount++;
        } finally {
            this.syncStatus.inProgress = false;
            this.updateSyncStatus();
        }
    }
    
    async syncItem(item) {
        try {
            const message = this.messages.get(item.messageId);
            if (!message) {
                return true; // Item não existe mais, considerar como sincronizado
            }
            
            // Simular envio para rede P2P
            const success = await this.sendToNetwork(message);
            
            if (success) {
                // Marcar como sincronizado
                message.synced = true;
                await this.saveMessage(message);
                
                // Atualizar UI
                this.updateMessageInUI(message);
                
                // Remover da fila de sincronização
                await this.removeSyncItem(item);
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('[NeoNetChat Enhanced] Error syncing item:', error);
            return false;
        }
    }
    
    async sendToNetwork(message) {
        // Simular envio para rede
        return new Promise((resolve) => {
            setTimeout(() => {
                // Simular sucesso/falha
                const success = Math.random() > 0.1; // 90% de sucesso
                
                if (success) {
                    // Notificar parent window
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            type: 'neonet-chat-broadcast',
                            message: message
                        }, '*');
                    }
                }
                
                resolve(success);
            }, 100 + Math.random() * 500);
        });
    }
    
    updateMessageInUI(message) {
        const messageElement = this.chatMessages?.querySelector(`[data-message-id="${message.id}"]`);
        if (messageElement) {
            messageElement.className = messageElement.className.replace('pending', 'synced');
            
            const syncStatus = messageElement.querySelector('.sync-status');
            if (syncStatus) {
                syncStatus.textContent = this.getSyncIcon(message);
            }
        }
    }
    
    async removeSyncItem(item) {
        try {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            await store.delete(item.id);
        } catch (error) {
            console.error('[NeoNetChat Enhanced] Error removing sync item:', error);
        }
    }
    
    setupAutoSync() {
        // Sincronização automática a cada 30 segundos
        setInterval(() => {
            if (this.isOnline && this.syncQueue.length > 0) {
                this.performSync();
            }
        }, 30000);
        
        // Sincronização quando voltar online
        window.addEventListener('online', () => {
            setTimeout(() => this.performSync(), 1000);
        });
    }
    
    registerWithNeoNet() {
        // Registrar dApp com o sistema principal
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'neonet-dapp-register',
                dapp: {
                    id: 'neonet-chat',
                    name: 'NeoNet Chat Enhanced',
                    version: this.version,
                    capabilities: ['messaging', 'p2p', 'offline-sync'],
                    userId: this.userId
                }
            }, '*');
        }
    }
    
    // Event handlers
    handleOnline() {
        console.log('[NeoNetChat Enhanced] Connection restored');
        this.isOnline = true;
        this.updateConnectionStatus();
        
        // Sincronizar após um pequeno delay
        setTimeout(() => this.performSync(), 1000);
    }
    
    handleOffline() {
        console.log('[NeoNetChat Enhanced] Connection lost');
        this.isOnline = false;
        this.updateConnectionStatus();
    }
    
    handlePeerMessage(data) {
        if (data.type === 'chat-message') {
            const message = data.message;
            message.synced = true; // Mensagem recebida já está sincronizada
            this.addMessage(message);
        }
    }
    
    handleSystemSync(data) {
        console.log('[NeoNetChat Enhanced] System sync completed:', data);
        // Reagir a sincronizações do sistema principal
    }
    
    handleParentMessage(data) {
        if (data.type === 'neonet-chat-message') {
            this.addMessage(data.message);
        } else if (data.type === 'neonet-peer-connected') {
            console.log('[NeoNetChat Enhanced] Peer connected:', data.peer);
        }
    }
    
    handleInitializationError(error) {
        console.error('[NeoNetChat Enhanced] Initialization error:', error);
        
        // Tentar modo de fallback
        this.initFallbackMode();
    }
    
    initFallbackMode() {
        console.log('[NeoNetChat Enhanced] Initializing fallback mode...');
        
        // Usar localStorage como fallback
        this.useFallbackStorage = true;
        
        // Mostrar aviso
        if (this.chatMessages) {
            const warning = document.createElement('div');
            warning.className = 'system-message warning';
            warning.innerHTML = `
                <div class="system-icon">⚠️</div>
                <div class="system-text">
                    Modo limitado ativado. Algumas funcionalidades podem não estar disponíveis.
                </div>
            `;
            this.chatMessages.appendChild(warning);
        }
    }
    
    saveCurrentState() {
        try {
            // Salvar estado atual no localStorage como backup
            const state = {
                messages: Array.from(this.messages.values()),
                userId: this.userId,
                userName: this.userName,
                lastSyncTimestamp: this.lastSyncTimestamp,
                vectorClock: Array.from(this.vectorClock.entries())
            };
            
            localStorage.setItem('neonet-chat-state-backup', JSON.stringify(state));
        } catch (error) {
            console.error('[NeoNetChat Enhanced] Error saving state:', error);
        }
    }
    
    // Utility methods
    generateMessageId() {
        return `msg_${this.nodeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // API pública para integração
    getStatus() {
        return {
            version: this.version,
            isOnline: this.isOnline,
            messageCount: this.messages.size,
            syncStatus: this.syncStatus,
            userId: this.userId,
            userName: this.userName
        };
    }
    
    async exportMessages() {
        const messages = Array.from(this.messages.values());
        return {
            messages,
            exportTimestamp: Date.now(),
            version: this.version,
            userId: this.userId
        };
    }
    
    async importMessages(data) {
        if (data.messages && Array.isArray(data.messages)) {
            for (const message of data.messages) {
                await this.addMessage(message);
            }
            this.renderMessages();
        }
    }
}

// Inicializar chat quando DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    window.neonetChat = new NeoNetChatEnhanced();
});

// Exportar para uso em outros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeoNetChatEnhanced;
}

