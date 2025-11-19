// neonet/clients/web/src/utils/SyncManager_enhanced.js
// Gerenciador de Sincronização Aprimorado com CRDTs e Estratégias Offline-First

import CacheManager from './CacheManager_enhanced.js';

class SyncManagerEnhanced {
    constructor() {
        this.version = '2.0.0';
        this.syncQueue = [];
        this.isOnline = navigator.onLine;
        this.isSyncing = false;
        this.lastSyncTimestamp = 0;
        this.syncInterval = 30000; // 30 segundos
        this.maxRetries = 5;
        this.baseRetryDelay = 1000; // 1 segundo
        
        // Configurações de CRDT
        this.vectorClock = new Map();
        this.nodeId = this.generateNodeId();
        
        // Listeners de eventos
        this.syncListeners = new Set();
        this.conflictResolvers = new Map();
        
        this.init();
    }
    
    async init() {
        try {
            // Configurar listeners de conectividade
            window.addEventListener('online', this.handleOnline.bind(this));
            window.addEventListener('offline', this.handleOffline.bind(this));
            
            // Inicializar IndexedDB para dados de sincronização
            await this.initSyncDatabase();
            
            // Carregar fila de sincronização persistente
            await this.loadSyncQueue();
            
            // Configurar sincronização periódica
            this.setupPeriodicSync();
            
            // Registrar resolvedores de conflito padrão
            this.registerDefaultConflictResolvers();
            
            console.log('[SyncManager] Initialized successfully, nodeId:', this.nodeId);
        } catch (error) {
            console.error('[SyncManager] Initialization failed:', error);
        }
    }
    
    async initSyncDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('NeoNetSyncData', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.syncDB = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store para fila de sincronização
                if (!db.objectStoreNames.contains('syncQueue')) {
                    const store = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp');
                    store.createIndex('priority', 'priority');
                    store.createIndex('retryCount', 'retryCount');
                }
                
                // Store para dados CRDT
                if (!db.objectStoreNames.contains('crdtData')) {
                    const store = db.createObjectStore('crdtData', { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp');
                    store.createIndex('nodeId', 'nodeId');
                }
                
                // Store para metadados de sincronização
                if (!db.objectStoreNames.contains('syncMetadata')) {
                    const store = db.createObjectStore('syncMetadata', { keyPath: 'key' });
                }
                
                // Store para conflitos
                if (!db.objectStoreNames.contains('conflicts')) {
                    const store = db.createObjectStore('conflicts', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp');
                    store.createIndex('resolved', 'resolved');
                }
            };
        });
    }
    
    // Métodos de CRDT (Conflict-free Replicated Data Types)
    createCRDTOperation(type, key, value, metadata = {}) {
        const timestamp = Date.now();
        const vectorTimestamp = this.incrementVectorClock();
        
        return {
            id: this.generateOperationId(),
            type, // 'set', 'delete', 'increment', 'append', etc.
            key,
            value,
            metadata,
            timestamp,
            vectorTimestamp: Array.from(vectorTimestamp.entries()),
            nodeId: this.nodeId,
            applied: false
        };
    }
    
    async applyCRDTOperation(operation) {
        try {
            // Verificar se operação já foi aplicada
            if (await this.isOperationApplied(operation.id)) {
                return true;
            }
            
            // Atualizar vector clock
            this.updateVectorClock(new Map(operation.vectorTimestamp));
            
            // Aplicar operação baseada no tipo
            let result;
            switch (operation.type) {
                case 'set':
                    result = await this.applyCRDTSet(operation);
                    break;
                case 'delete':
                    result = await this.applyCRDTDelete(operation);
                    break;
                case 'increment':
                    result = await this.applyCRDTIncrement(operation);
                    break;
                case 'append':
                    result = await this.applyCRDTAppend(operation);
                    break;
                case 'merge':
                    result = await this.applyCRDTMerge(operation);
                    break;
                default:
                    throw new Error(`Unknown CRDT operation type: ${operation.type}`);
            }
            
            // Marcar operação como aplicada
            await this.markOperationApplied(operation.id);
            
            // Notificar listeners
            this.notifyDataChange(operation.key, operation.type, result);
            
            return result;
        } catch (error) {
            console.error('[SyncManager] Failed to apply CRDT operation:', error);
            return false;
        }
    }
    
    async applyCRDTSet(operation) {
        const existing = await this.getCRDTData(operation.key);
        
        if (!existing || this.isOperationNewer(operation, existing)) {
            await this.setCRDTData(operation.key, {
                value: operation.value,
                timestamp: operation.timestamp,
                vectorTimestamp: operation.vectorTimestamp,
                nodeId: operation.nodeId
            });
            return operation.value;
        }
        
        return existing.value;
    }
    
    async applyCRDTDelete(operation) {
        await this.deleteCRDTData(operation.key);
        return null;
    }
    
    async applyCRDTIncrement(operation) {
        const existing = await this.getCRDTData(operation.key);
        const currentValue = existing ? (existing.value || 0) : 0;
        const newValue = currentValue + (operation.value || 1);
        
        await this.setCRDTData(operation.key, {
            value: newValue,
            timestamp: operation.timestamp,
            vectorTimestamp: operation.vectorTimestamp,
            nodeId: operation.nodeId
        });
        
        return newValue;
    }
    
    async applyCRDTAppend(operation) {
        const existing = await this.getCRDTData(operation.key);
        const currentArray = existing ? (existing.value || []) : [];
        
        // Para append, usar timestamp para ordenação
        const newItem = {
            ...operation.value,
            _timestamp: operation.timestamp,
            _nodeId: operation.nodeId
        };
        
        const newArray = [...currentArray, newItem].sort((a, b) => a._timestamp - b._timestamp);
        
        await this.setCRDTData(operation.key, {
            value: newArray,
            timestamp: operation.timestamp,
            vectorTimestamp: operation.vectorTimestamp,
            nodeId: operation.nodeId
        });
        
        return newArray;
    }
    
    async applyCRDTMerge(operation) {
        const existing = await this.getCRDTData(operation.key);
        const currentObject = existing ? (existing.value || {}) : {};
        
        // Merge profundo com resolução de conflitos
        const mergedValue = this.deepMerge(currentObject, operation.value, operation);
        
        await this.setCRDTData(operation.key, {
            value: mergedValue,
            timestamp: operation.timestamp,
            vectorTimestamp: operation.vectorTimestamp,
            nodeId: operation.nodeId
        });
        
        return mergedValue;
    }
    
    // Métodos de sincronização
    async queueForSync(operation, priority = 1) {
        try {
            const syncItem = {
                operation,
                priority,
                timestamp: Date.now(),
                retryCount: 0,
                lastRetryAt: 0
            };
            
            // Adicionar à fila em memória
            this.syncQueue.push(syncItem);
            
            // Persistir na IndexedDB
            await this.persistSyncItem(syncItem);
            
            // Tentar sincronizar imediatamente se online
            if (this.isOnline && !this.isSyncing) {
                this.performSync();
            }
            
            console.log('[SyncManager] Operation queued for sync:', operation.id);
            return true;
        } catch (error) {
            console.error('[SyncManager] Failed to queue operation for sync:', error);
            return false;
        }
    }
    
    async performSync() {
        if (this.isSyncing || !this.isOnline) {
            return;
        }
        
        this.isSyncing = true;
        console.log('[SyncManager] Starting sync process...');
        
        try {
            // Ordenar fila por prioridade e timestamp
            this.syncQueue.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return b.priority - a.priority; // Prioridade maior primeiro
                }
                return a.timestamp - b.timestamp; // Mais antigo primeiro
            });
            
            const results = {
                successful: 0,
                failed: 0,
                total: this.syncQueue.length
            };
            
            // Processar itens da fila
            for (let i = this.syncQueue.length - 1; i >= 0; i--) {
                const item = this.syncQueue[i];
                
                try {
                    const success = await this.syncOperation(item.operation);
                    
                    if (success) {
                        // Remover da fila
                        this.syncQueue.splice(i, 1);
                        await this.removeSyncItem(item);
                        results.successful++;
                    } else {
                        // Incrementar contador de retry
                        item.retryCount++;
                        item.lastRetryAt = Date.now();
                        
                        if (item.retryCount >= this.maxRetries) {
                            // Remover após máximo de tentativas
                            this.syncQueue.splice(i, 1);
                            await this.removeSyncItem(item);
                            await this.logSyncFailure(item);
                            results.failed++;
                        } else {
                            // Atualizar item persistente
                            await this.updateSyncItem(item);
                        }
                    }
                } catch (error) {
                    console.error('[SyncManager] Error syncing operation:', error);
                    results.failed++;
                }
            }
            
            this.lastSyncTimestamp = Date.now();
            
            // Notificar listeners
            this.notifySyncComplete(results);
            
            console.log('[SyncManager] Sync completed:', results);
        } catch (error) {
            console.error('[SyncManager] Sync process failed:', error);
        } finally {
            this.isSyncing = false;
        }
    }
    
    async syncOperation(operation) {
        try {
            // Simular envio para servidor/rede P2P
            const response = await this.sendToNetwork(operation);
            
            if (response.success) {
                // Aplicar operações recebidas do servidor
                if (response.operations) {
                    for (const remoteOp of response.operations) {
                        await this.applyCRDTOperation(remoteOp);
                    }
                }
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('[SyncManager] Failed to sync operation:', error);
            return false;
        }
    }
    
    async sendToNetwork(operation) {
        // Implementação simulada - substituir por lógica real de rede
        return new Promise((resolve) => {
            setTimeout(() => {
                // Simular sucesso/falha baseado em conectividade
                const success = Math.random() > 0.1; // 90% de sucesso
                resolve({
                    success,
                    operations: success ? [] : null,
                    timestamp: Date.now()
                });
            }, 100 + Math.random() * 500); // Latência simulada
        });
    }
    
    // Resolução de conflitos
    registerConflictResolver(dataType, resolver) {
        this.conflictResolvers.set(dataType, resolver);
    }
    
    registerDefaultConflictResolvers() {
        // Resolver para timestamps (último vence)
        this.registerConflictResolver('timestamp', (local, remote) => {
            return local.timestamp > remote.timestamp ? local : remote;
        });
        
        // Resolver para contadores (soma)
        this.registerConflictResolver('counter', (local, remote) => {
            return {
                value: (local.value || 0) + (remote.value || 0),
                timestamp: Math.max(local.timestamp, remote.timestamp)
            };
        });
        
        // Resolver para arrays (merge ordenado)
        this.registerConflictResolver('array', (local, remote) => {
            const localArray = local.value || [];
            const remoteArray = remote.value || [];
            
            const merged = [...localArray, ...remoteArray]
                .filter((item, index, arr) => 
                    arr.findIndex(i => i.id === item.id) === index
                )
                .sort((a, b) => (a._timestamp || 0) - (b._timestamp || 0));
            
            return {
                value: merged,
                timestamp: Math.max(local.timestamp, remote.timestamp)
            };
        });
    }
    
    async resolveConflict(key, local, remote, dataType = 'timestamp') {
        try {
            const resolver = this.conflictResolvers.get(dataType);
            
            if (resolver) {
                const resolved = resolver(local, remote);
                await this.setCRDTData(key, resolved);
                
                // Log do conflito resolvido
                await this.logConflictResolution(key, local, remote, resolved);
                
                return resolved;
            } else {
                // Fallback: usar timestamp
                const resolved = local.timestamp > remote.timestamp ? local : remote;
                await this.setCRDTData(key, resolved);
                return resolved;
            }
        } catch (error) {
            console.error('[SyncManager] Failed to resolve conflict:', error);
            return local; // Fallback para dados locais
        }
    }
    
    // Métodos auxiliares
    generateNodeId() {
        return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    generateOperationId() {
        return `op-${this.nodeId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    
    isOperationNewer(operation, existing) {
        if (!existing) return true;
        
        const opVector = new Map(operation.vectorTimestamp);
        const existingVector = new Map(existing.vectorTimestamp || []);
        
        // Comparar vector clocks
        let isNewer = false;
        let isOlder = false;
        
        const allNodes = new Set([...opVector.keys(), ...existingVector.keys()]);
        
        for (const nodeId of allNodes) {
            const opTime = opVector.get(nodeId) || 0;
            const existingTime = existingVector.get(nodeId) || 0;
            
            if (opTime > existingTime) {
                isNewer = true;
            } else if (opTime < existingTime) {
                isOlder = true;
            }
        }
        
        // Se nem mais novo nem mais antigo, usar timestamp como desempate
        if (!isNewer && !isOlder) {
            return operation.timestamp > existing.timestamp;
        }
        
        return isNewer && !isOlder;
    }
    
    deepMerge(target, source, operation) {
        const result = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    result[key] = this.deepMerge(result[key] || {}, source[key], operation);
                } else {
                    result[key] = source[key];
                }
            }
        }
        
        return result;
    }
    
    // Métodos de persistência
    async persistSyncItem(item) {
        const transaction = this.syncDB.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        return store.add(item);
    }
    
    async updateSyncItem(item) {
        const transaction = this.syncDB.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        return store.put(item);
    }
    
    async removeSyncItem(item) {
        const transaction = this.syncDB.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        return store.delete(item.id);
    }
    
    async loadSyncQueue() {
        const transaction = this.syncDB.transaction(['syncQueue'], 'readonly');
        const store = transaction.objectStore('syncQueue');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                this.syncQueue = request.result || [];
                console.log(`[SyncManager] Loaded ${this.syncQueue.length} items from sync queue`);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }
    
    async setCRDTData(key, data) {
        const transaction = this.syncDB.transaction(['crdtData'], 'readwrite');
        const store = transaction.objectStore('crdtData');
        return store.put({ key, ...data });
    }
    
    async getCRDTData(key) {
        const transaction = this.syncDB.transaction(['crdtData'], 'readonly');
        const store = transaction.objectStore('crdtData');
        
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async deleteCRDTData(key) {
        const transaction = this.syncDB.transaction(['crdtData'], 'readwrite');
        const store = transaction.objectStore('crdtData');
        return store.delete(key);
    }
    
    // Event handlers
    handleOnline() {
        console.log('[SyncManager] Connection restored');
        this.isOnline = true;
        this.performSync();
    }
    
    handleOffline() {
        console.log('[SyncManager] Connection lost');
        this.isOnline = false;
    }
    
    setupPeriodicSync() {
        setInterval(() => {
            if (this.isOnline && !this.isSyncing && this.syncQueue.length > 0) {
                this.performSync();
            }
        }, this.syncInterval);
    }
    
    // Notificações
    notifyDataChange(key, type, value) {
        const event = new CustomEvent('neonet-data-change', {
            detail: { key, type, value, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }
    
    notifySyncComplete(results) {
        const event = new CustomEvent('neonet-sync-complete', {
            detail: { ...results, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }
    
    // API pública
    async setValue(key, value, dataType = 'timestamp') {
        const operation = this.createCRDTOperation('set', key, value, { dataType });
        await this.applyCRDTOperation(operation);
        await this.queueForSync(operation);
        return operation.id;
    }
    
    async getValue(key) {
        const data = await this.getCRDTData(key);
        return data ? data.value : null;
    }
    
    async deleteValue(key) {
        const operation = this.createCRDTOperation('delete', key, null);
        await this.applyCRDTOperation(operation);
        await this.queueForSync(operation);
        return operation.id;
    }
    
    async incrementCounter(key, amount = 1) {
        const operation = this.createCRDTOperation('increment', key, amount, { dataType: 'counter' });
        await this.applyCRDTOperation(operation);
        await this.queueForSync(operation);
        return operation.id;
    }
    
    async appendToArray(key, item) {
        const operation = this.createCRDTOperation('append', key, item, { dataType: 'array' });
        await this.applyCRDTOperation(operation);
        await this.queueForSync(operation);
        return operation.id;
    }
    
    async mergeObject(key, object) {
        const operation = this.createCRDTOperation('merge', key, object, { dataType: 'object' });
        await this.applyCRDTOperation(operation);
        await this.queueForSync(operation);
        return operation.id;
    }
    
    // Status e estatísticas
    getStatus() {
        return {
            isOnline: this.isOnline,
            isSyncing: this.isSyncing,
            queueLength: this.syncQueue.length,
            lastSyncTimestamp: this.lastSyncTimestamp,
            nodeId: this.nodeId,
            version: this.version
        };
    }
}

// Instância global
const syncManager = new SyncManagerEnhanced();

export default syncManager;

