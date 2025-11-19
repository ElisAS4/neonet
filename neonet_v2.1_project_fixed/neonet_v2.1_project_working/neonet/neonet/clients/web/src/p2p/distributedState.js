// neonet/clients/web/src/p2p/distributedState.js

import IndexedDBManager from '../utils/IndexedDBManager.js';

/**
 * Sistema de Estado Distribuído com CRDTs (Conflict-free Replicated Data Types)
 * Gerencia o estado compartilhado da rede P2P com resolução automática de conflitos
 */
class DistributedState {
    constructor() {
        this.dbManager = IndexedDBManager;
        this.stateStore = 'distributedState';
        this.vectorClock = new Map(); // Vector clock para ordenação causal
        this.nodeId = this.generateNodeId();
        this.state = new Map(); // Estado local
        this.subscribers = new Map(); // Callbacks para mudanças de estado
        
        this.initializeState();
    }

    /**
     * Inicializa o estado distribuído
     */
    async initializeState() {
        try {
            await this.dbManager.open();
            await this.loadStateFromStorage();
            console.log('[DistributedState] Initialized with node ID:', this.nodeId);
        } catch (error) {
            console.error('[DistributedState] Initialization error:', error);
        }
    }

    /**
     * Gera um ID único para este nó
     * @returns {string} ID único do nó
     */
    generateNodeId() {
        return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Carrega o estado do armazenamento local
     */
    async loadStateFromStorage() {
        try {
            const storedStates = await this.dbManager.getAll(this.stateStore);
            for (const stateItem of storedStates) {
                this.state.set(stateItem.key, stateItem.value);
            }
            console.log('[DistributedState] Loaded state from storage');
        } catch (error) {
            console.error('[DistributedState] Error loading state:', error);
        }
    }

    /**
     * Salva o estado no armazenamento local
     * @param {string} key - Chave do estado
     * @param {any} value - Valor do estado
     */
    async saveStateToStorage(key, value) {
        try {
            const stateItem = {
                id: key,
                key: key,
                value: value,
                timestamp: Date.now(),
                nodeId: this.nodeId
            };
            await this.dbManager.update(this.stateStore, key, stateItem);
        } catch (error) {
            console.error('[DistributedState] Error saving state:', error);
        }
    }

    /**
     * Define um valor no estado distribuído (CRDT G-Set - Grow-only Set para operações de adição)
     * @param {string} key - Chave do estado
     * @param {any} value - Valor a ser definido
     * @param {Object} metadata - Metadados da operação
     */
    async set(key, value, metadata = {}) {
        const operation = {
            type: 'SET',
            key: key,
            value: value,
            nodeId: this.nodeId,
            timestamp: Date.now(),
            vectorClock: this.incrementVectorClock(),
            metadata: metadata
        };

        await this.applyOperation(operation);
        await this.broadcastOperation(operation);
    }

    /**
     * Adiciona um item a um conjunto (CRDT G-Set)
     * @param {string} key - Chave do conjunto
     * @param {any} item - Item a ser adicionado
     */
    async addToSet(key, item) {
        let currentSet = this.state.get(key) || new Set();
        if (!(currentSet instanceof Set)) {
            currentSet = new Set();
        }

        const operation = {
            type: 'ADD_TO_SET',
            key: key,
            item: item,
            nodeId: this.nodeId,
            timestamp: Date.now(),
            vectorClock: this.incrementVectorClock()
        };

        await this.applyOperation(operation);
        await this.broadcastOperation(operation);
    }

    /**
     * Remove um item de um conjunto (CRDT 2P-Set - Two-Phase Set)
     * @param {string} key - Chave do conjunto
     * @param {any} item - Item a ser removido
     */
    async removeFromSet(key, item) {
        const operation = {
            type: 'REMOVE_FROM_SET',
            key: key,
            item: item,
            nodeId: this.nodeId,
            timestamp: Date.now(),
            vectorClock: this.incrementVectorClock()
        };

        await this.applyOperation(operation);
        await this.broadcastOperation(operation);
    }

    /**
     * Incrementa um contador (CRDT G-Counter - Grow-only Counter)
     * @param {string} key - Chave do contador
     * @param {number} increment - Valor a ser incrementado (padrão: 1)
     */
    async incrementCounter(key, increment = 1) {
        const operation = {
            type: 'INCREMENT_COUNTER',
            key: key,
            increment: increment,
            nodeId: this.nodeId,
            timestamp: Date.now(),
            vectorClock: this.incrementVectorClock()
        };

        await this.applyOperation(operation);
        await this.broadcastOperation(operation);
    }

    /**
     * Decrementa um contador (CRDT PN-Counter - Positive-Negative Counter)
     * @param {string} key - Chave do contador
     * @param {number} decrement - Valor a ser decrementado (padrão: 1)
     */
    async decrementCounter(key, decrement = 1) {
        const operation = {
            type: 'DECREMENT_COUNTER',
            key: key,
            decrement: decrement,
            nodeId: this.nodeId,
            timestamp: Date.now(),
            vectorClock: this.incrementVectorClock()
        };

        await this.applyOperation(operation);
        await this.broadcastOperation(operation);
    }

    /**
     * Aplica uma operação ao estado local
     * @param {Object} operation - Operação a ser aplicada
     */
    async applyOperation(operation) {
        switch (operation.type) {
            case 'SET':
                await this.applySetOperation(operation);
                break;
            case 'ADD_TO_SET':
                await this.applyAddToSetOperation(operation);
                break;
            case 'REMOVE_FROM_SET':
                await this.applyRemoveFromSetOperation(operation);
                break;
            case 'INCREMENT_COUNTER':
                await this.applyIncrementCounterOperation(operation);
                break;
            case 'DECREMENT_COUNTER':
                await this.applyDecrementCounterOperation(operation);
                break;
            default:
                console.warn('[DistributedState] Unknown operation type:', operation.type);
        }

        // Notificar subscribers
        this.notifySubscribers(operation.key, this.state.get(operation.key));
    }

    /**
     * Aplica operação SET com resolução de conflitos baseada em timestamp
     * @param {Object} operation - Operação SET
     */
    async applySetOperation(operation) {
        const currentValue = this.state.get(operation.key);
        
        // Resolução de conflitos: Last-Write-Wins baseado em timestamp e nodeId
        if (!currentValue || 
            operation.timestamp > currentValue.timestamp ||
            (operation.timestamp === currentValue.timestamp && operation.nodeId > currentValue.nodeId)) {
            
            const newValue = {
                value: operation.value,
                timestamp: operation.timestamp,
                nodeId: operation.nodeId,
                vectorClock: operation.vectorClock
            };
            
            this.state.set(operation.key, newValue);
            await this.saveStateToStorage(operation.key, newValue);
        }
    }

    /**
     * Aplica operação ADD_TO_SET (G-Set)
     * @param {Object} operation - Operação ADD_TO_SET
     */
    async applyAddToSetOperation(operation) {
        let currentSet = this.state.get(operation.key);
        if (!currentSet || !currentSet.value) {
            currentSet = { value: new Set(), timestamp: operation.timestamp, nodeId: operation.nodeId };
        }

        // Converter para Set se necessário
        if (!(currentSet.value instanceof Set)) {
            currentSet.value = new Set(currentSet.value);
        }

        currentSet.value.add(operation.item);
        currentSet.timestamp = Math.max(currentSet.timestamp, operation.timestamp);
        
        this.state.set(operation.key, currentSet);
        await this.saveStateToStorage(operation.key, {
            ...currentSet,
            value: Array.from(currentSet.value) // Serializar Set como Array
        });
    }

    /**
     * Aplica operação REMOVE_FROM_SET (2P-Set)
     * @param {Object} operation - Operação REMOVE_FROM_SET
     */
    async applyRemoveFromSetOperation(operation) {
        let currentSet = this.state.get(operation.key);
        if (!currentSet || !currentSet.value) {
            return; // Não há nada para remover
        }

        // Manter um conjunto de itens removidos para 2P-Set
        if (!currentSet.removed) {
            currentSet.removed = new Set();
        }

        currentSet.removed.add(operation.item);
        
        // Converter para Set se necessário
        if (!(currentSet.value instanceof Set)) {
            currentSet.value = new Set(currentSet.value);
        }
        if (!(currentSet.removed instanceof Set)) {
            currentSet.removed = new Set(currentSet.removed);
        }

        currentSet.value.delete(operation.item);
        currentSet.timestamp = Math.max(currentSet.timestamp, operation.timestamp);
        
        this.state.set(operation.key, currentSet);
        await this.saveStateToStorage(operation.key, {
            ...currentSet,
            value: Array.from(currentSet.value),
            removed: Array.from(currentSet.removed)
        });
    }

    /**
     * Aplica operação INCREMENT_COUNTER (G-Counter)
     * @param {Object} operation - Operação INCREMENT_COUNTER
     */
    async applyIncrementCounterOperation(operation) {
        let currentCounter = this.state.get(operation.key);
        if (!currentCounter) {
            currentCounter = { value: 0, nodeCounters: new Map() };
        }

        // G-Counter: cada nó mantém seu próprio contador
        const nodeCounter = currentCounter.nodeCounters.get(operation.nodeId) || 0;
        currentCounter.nodeCounters.set(operation.nodeId, nodeCounter + operation.increment);
        
        // Valor total é a soma de todos os contadores dos nós
        currentCounter.value = Array.from(currentCounter.nodeCounters.values()).reduce((sum, val) => sum + val, 0);
        currentCounter.timestamp = operation.timestamp;
        
        this.state.set(operation.key, currentCounter);
        await this.saveStateToStorage(operation.key, {
            ...currentCounter,
            nodeCounters: Object.fromEntries(currentCounter.nodeCounters)
        });
    }

    /**
     * Aplica operação DECREMENT_COUNTER (PN-Counter)
     * @param {Object} operation - Operação DECREMENT_COUNTER
     */
    async applyDecrementCounterOperation(operation) {
        let currentCounter = this.state.get(operation.key);
        if (!currentCounter) {
            currentCounter = { 
                value: 0, 
                positiveCounters: new Map(), 
                negativeCounters: new Map() 
            };
        }

        // PN-Counter: mantém contadores positivos e negativos separados
        if (!currentCounter.negativeCounters) {
            currentCounter.negativeCounters = new Map();
        }
        if (!currentCounter.positiveCounters) {
            currentCounter.positiveCounters = new Map();
        }

        const nodeNegativeCounter = currentCounter.negativeCounters.get(operation.nodeId) || 0;
        currentCounter.negativeCounters.set(operation.nodeId, nodeNegativeCounter + operation.decrement);
        
        // Valor total é a soma dos positivos menos a soma dos negativos
        const positiveSum = Array.from(currentCounter.positiveCounters.values()).reduce((sum, val) => sum + val, 0);
        const negativeSum = Array.from(currentCounter.negativeCounters.values()).reduce((sum, val) => sum + val, 0);
        currentCounter.value = positiveSum - negativeSum;
        currentCounter.timestamp = operation.timestamp;
        
        this.state.set(operation.key, currentCounter);
        await this.saveStateToStorage(operation.key, {
            ...currentCounter,
            positiveCounters: Object.fromEntries(currentCounter.positiveCounters || new Map()),
            negativeCounters: Object.fromEntries(currentCounter.negativeCounters || new Map())
        });
    }

    /**
     * Incrementa o vector clock para este nó
     * @returns {Object} Vector clock atualizado
     */
    incrementVectorClock() {
        const currentClock = this.vectorClock.get(this.nodeId) || 0;
        this.vectorClock.set(this.nodeId, currentClock + 1);
        return Object.fromEntries(this.vectorClock);
    }

    /**
     * Processa uma operação recebida de outro nó
     * @param {Object} operation - Operação recebida
     */
    async processRemoteOperation(operation) {
        // Atualizar vector clock
        if (operation.vectorClock) {
            for (const [nodeId, clock] of Object.entries(operation.vectorClock)) {
                const currentClock = this.vectorClock.get(nodeId) || 0;
                this.vectorClock.set(nodeId, Math.max(currentClock, clock));
            }
        }

        await this.applyOperation(operation);
        console.log('[DistributedState] Processed remote operation:', operation.type, operation.key);
    }

    /**
     * Transmite uma operação para outros nós da rede P2P
     * @param {Object} operation - Operação a ser transmitida
     */
    async broadcastOperation(operation) {
        try {
            // Aqui você integraria com o peerManager para transmitir a operação
            // Exemplo: await peerManager.broadcast('state-operation', operation);
            console.log('[DistributedState] Broadcasting operation:', operation.type, operation.key);
        } catch (error) {
            console.error('[DistributedState] Error broadcasting operation:', error);
        }
    }

    /**
     * Obtém um valor do estado
     * @param {string} key - Chave do estado
     * @returns {any} Valor do estado
     */
    get(key) {
        const stateItem = this.state.get(key);
        return stateItem ? stateItem.value : undefined;
    }

    /**
     * Subscreve a mudanças em uma chave específica
     * @param {string} key - Chave a ser observada
     * @param {Function} callback - Callback a ser executado quando a chave mudar
     */
    subscribe(key, callback) {
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
        }
        this.subscribers.get(key).add(callback);
    }

    /**
     * Remove uma subscrição
     * @param {string} key - Chave observada
     * @param {Function} callback - Callback a ser removido
     */
    unsubscribe(key, callback) {
        if (this.subscribers.has(key)) {
            this.subscribers.get(key).delete(callback);
        }
    }

    /**
     * Notifica subscribers sobre mudanças
     * @param {string} key - Chave que mudou
     * @param {any} value - Novo valor
     */
    notifySubscribers(key, value) {
        if (this.subscribers.has(key)) {
            for (const callback of this.subscribers.get(key)) {
                try {
                    callback(value, key);
                } catch (error) {
                    console.error('[DistributedState] Error in subscriber callback:', error);
                }
            }
        }
    }

    /**
     * Obtém estatísticas do estado distribuído
     * @returns {Object} Estatísticas
     */
    getStats() {
        return {
            nodeId: this.nodeId,
            stateSize: this.state.size,
            vectorClock: Object.fromEntries(this.vectorClock),
            subscriberCount: Array.from(this.subscribers.values()).reduce((sum, set) => sum + set.size, 0)
        };
    }
}

// Exportar instância singleton
const distributedState = new DistributedState();
export default distributedState;

