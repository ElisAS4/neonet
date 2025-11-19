// neonet/clients/web/src/utils/SyncManager.js

import IndexedDBManager from './IndexedDBManager.js';

/**
 * Gerenciador de Sincronização para operações offline-first
 * Gerencia filas de operações offline e sincronização bidirecional
 */
class SyncManager {
    constructor() {
        this.dbManager = new IndexedDBManager();
        this.syncQueueStore = 'syncQueue';
        this.isOnline = navigator.onLine;
        this.syncInProgress = false;
        this.syncCallbacks = new Map();
        this.retryAttempts = 3;
        this.retryDelay = 1000; // 1 segundo
        
        this.initializeEventListeners();
    }

    /**
     * Inicializa os event listeners para conectividade
     */
    initializeEventListeners() {
        window.addEventListener('online', () => {
            console.log('[SyncManager] Network connection restored');
            this.isOnline = true;
            this.processSyncQueue();
        });

        window.addEventListener('offline', () => {
            console.log('[SyncManager] Network connection lost');
            this.isOnline = false;
        });

        // Verificação periódica de conectividade real
        setInterval(() => this.checkRealConnectivity(), 30000);
    }

    /**
     * Verifica conectividade real fazendo uma requisição de teste
     * @returns {Promise<boolean>} Status de conectividade real
     */
    async checkRealConnectivity() {
        try {
            const response = await fetch('/api/ping', {
                method: 'HEAD',
                cache: 'no-cache',
                timeout: 5000
            });
            const reallyOnline = response.ok;
            
            if (reallyOnline !== this.isOnline) {
                this.isOnline = reallyOnline;
                if (reallyOnline) {
                    console.log('[SyncManager] Real connectivity detected, processing sync queue');
                    this.processSyncQueue();
                }
            }
            
            return reallyOnline;
        } catch (error) {
            this.isOnline = false;
            return false;
        }
    }

    /**
     * Adiciona uma operação à fila de sincronização
     * @param {Object} operation - Operação a ser sincronizada
     * @param {string} operation.type - Tipo da operação (CREATE, UPDATE, DELETE)
     * @param {string} operation.entity - Entidade afetada
     * @param {Object} operation.data - Dados da operação
     * @param {string} operation.id - ID único da operação
     * @returns {Promise<string>} ID da operação na fila
     */
    async addToSyncQueue(operation) {
        const queueItem = {
            id: operation.id || this.generateOperationId(),
            type: operation.type,
            entity: operation.entity,
            data: operation.data,
            timestamp: Date.now(),
            attempts: 0,
            status: 'pending'
        };

        await this.dbManager.add(this.syncQueueStore, queueItem);
        console.log('[SyncManager] Added operation to sync queue:', queueItem.id);

        // Se estiver online, tentar processar imediatamente
        if (this.isOnline) {
            this.processSyncQueue();
        }

        return queueItem.id;
    }

    /**
     * Processa a fila de sincronização
     */
    async processSyncQueue() {
        if (this.syncInProgress || !this.isOnline) {
            return;
        }

        this.syncInProgress = true;
        console.log('[SyncManager] Processing sync queue...');

        try {
            const pendingOperations = await this.dbManager.getAll(this.syncQueueStore);
            const sortedOperations = pendingOperations
                .filter(op => op.status === 'pending')
                .sort((a, b) => a.timestamp - b.timestamp);

            for (const operation of sortedOperations) {
                await this.processOperation(operation);
            }

            console.log('[SyncManager] Sync queue processing completed');
        } catch (error) {
            console.error('[SyncManager] Error processing sync queue:', error);
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Processa uma operação individual
     * @param {Object} operation - Operação a ser processada
     */
    async processOperation(operation) {
        try {
            console.log('[SyncManager] Processing operation:', operation.id);
            
            // Simular envio para a rede P2P ou servidor
            const success = await this.sendToNetwork(operation);
            
            if (success) {
                // Marcar como concluída
                operation.status = 'completed';
                operation.completedAt = Date.now();
                await this.dbManager.update(this.syncQueueStore, operation.id, operation);
                
                // Executar callback se existir
                if (this.syncCallbacks.has(operation.id)) {
                    const callback = this.syncCallbacks.get(operation.id);
                    callback(null, operation);
                    this.syncCallbacks.delete(operation.id);
                }
                
                console.log('[SyncManager] Operation completed:', operation.id);
            } else {
                throw new Error('Network operation failed');
            }
        } catch (error) {
            console.error('[SyncManager] Error processing operation:', operation.id, error);
            
            operation.attempts++;
            operation.lastError = error.message;
            
            if (operation.attempts >= this.retryAttempts) {
                operation.status = 'failed';
                console.error('[SyncManager] Operation failed after max attempts:', operation.id);
                
                // Executar callback de erro
                if (this.syncCallbacks.has(operation.id)) {
                    const callback = this.syncCallbacks.get(operation.id);
                    callback(error, operation);
                    this.syncCallbacks.delete(operation.id);
                }
            } else {
                // Reagendar para retry
                setTimeout(() => {
                    this.processOperation(operation);
                }, this.retryDelay * operation.attempts);
            }
            
            await this.dbManager.update(this.syncQueueStore, operation.id, operation);
        }
    }

    /**
     * Simula o envio de operação para a rede
     * @param {Object} operation - Operação a ser enviada
     * @returns {Promise<boolean>} Sucesso da operação
     */
    async sendToNetwork(operation) {
        try {
            // Aqui você integraria com os módulos P2P do NeoNet
            // Por exemplo: peerManager.broadcast(operation) ou dhtNode.store(operation)
            
            const response = await fetch('/api/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(operation)
            });

            return response.ok;
        } catch (error) {
            console.error('[SyncManager] Network send failed:', error);
            return false;
        }
    }

    /**
     * Registra um callback para uma operação específica
     * @param {string} operationId - ID da operação
     * @param {Function} callback - Callback a ser executado
     */
    onOperationComplete(operationId, callback) {
        this.syncCallbacks.set(operationId, callback);
    }

    /**
     * Gera um ID único para operação
     * @returns {string} ID único
     */
    generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Obtém estatísticas da fila de sincronização
     * @returns {Promise<Object>} Estatísticas da fila
     */
    async getSyncStats() {
        const allOperations = await this.dbManager.getAll(this.syncQueueStore);
        
        const stats = {
            total: allOperations.length,
            pending: allOperations.filter(op => op.status === 'pending').length,
            completed: allOperations.filter(op => op.status === 'completed').length,
            failed: allOperations.filter(op => op.status === 'failed').length,
            oldestPending: null,
            isOnline: this.isOnline,
            syncInProgress: this.syncInProgress
        };

        const pendingOps = allOperations.filter(op => op.status === 'pending');
        if (pendingOps.length > 0) {
            stats.oldestPending = Math.min(...pendingOps.map(op => op.timestamp));
        }

        return stats;
    }

    /**
     * Limpa operações concluídas antigas
     * @param {number} maxAge - Idade máxima em milissegundos (padrão: 7 dias)
     */
    async cleanCompletedOperations(maxAge = 7 * 24 * 60 * 60 * 1000) {
        const allOperations = await this.dbManager.getAll(this.syncQueueStore);
        const cutoffTime = Date.now() - maxAge;
        
        const operationsToDelete = allOperations.filter(op => 
            op.status === 'completed' && 
            op.completedAt < cutoffTime
        );

        for (const operation of operationsToDelete) {
            await this.dbManager.delete(this.syncQueueStore, operation.id);
        }

        console.log(`[SyncManager] Cleaned ${operationsToDelete.length} old completed operations`);
    }

    /**
     * Força a sincronização de uma operação específica
     * @param {string} operationId - ID da operação
     * @returns {Promise<boolean>} Sucesso da operação
     */
    async forceSyncOperation(operationId) {
        const operation = await this.dbManager.get(this.syncQueueStore, operationId);
        if (!operation) {
            throw new Error(`Operation ${operationId} not found`);
        }

        if (operation.status === 'completed') {
            return true;
        }

        operation.attempts = 0; // Reset attempts
        operation.status = 'pending';
        await this.dbManager.update(this.syncQueueStore, operationId, operation);

        if (this.isOnline) {
            await this.processOperation(operation);
            return operation.status === 'completed';
        }

        return false;
    }

    /**
     * Cancela uma operação pendente
     * @param {string} operationId - ID da operação
     */
    async cancelOperation(operationId) {
        const operation = await this.dbManager.get(this.syncQueueStore, operationId);
        if (operation && operation.status === 'pending') {
            operation.status = 'cancelled';
            await this.dbManager.update(this.syncQueueStore, operationId, operation);
            
            // Remover callback se existir
            if (this.syncCallbacks.has(operationId)) {
                this.syncCallbacks.delete(operationId);
            }
            
            console.log('[SyncManager] Operation cancelled:', operationId);
        }
    }
}

// Exportar instância singleton
const syncManager = new SyncManager();
export default syncManager;

