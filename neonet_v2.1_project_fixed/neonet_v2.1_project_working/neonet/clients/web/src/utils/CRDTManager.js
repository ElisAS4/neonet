/**
 * CRDT (Conflict-free Replicated Data Type) Manager
 * Handles distributed data synchronization for NeoNet
 * Supports various CRDT types for different use cases
 */

export class CRDTManager {
    constructor() {
        this.crdts = new Map(); // id -> CRDT instance
        this.vectorClock = new Map(); // nodeId -> timestamp
        this.myNodeId = null;
        this.onDataChanged = null;
        this.syncQueue = [];
        this.isProcessingSync = false;
        
        // Performance optimization
        this.batchSize = 100;
        this.syncInterval = 1000; // 1 second
        this.compressionEnabled = true;
        
        this.startSyncProcessor();
    }
    
    setNodeId(nodeId) {
        this.myNodeId = nodeId;
        this.vectorClock.set(nodeId, 0);
    }
    
    // Create different types of CRDTs
    createGSet(id, initialData = []) {
        const gset = new GSet(id, this.myNodeId, initialData);
        this.crdts.set(id, gset);
        return gset;
    }
    
    createORSet(id, initialData = []) {
        const orset = new ORSet(id, this.myNodeId, initialData);
        this.crdts.set(id, orset);
        return orset;
    }
    
    createLWWRegister(id, initialValue = null) {
        const lww = new LWWRegister(id, this.myNodeId, initialValue);
        this.crdts.set(id, lww);
        return lww;
    }
    
    createPNCounter(id, initialValue = 0) {
        const counter = new PNCounter(id, this.myNodeId, initialValue);
        this.crdts.set(id, counter);
        return counter;
    }
    
    createORMap(id, initialData = {}) {
        const ormap = new ORMap(id, this.myNodeId, initialData);
        this.crdts.set(id, ormap);
        return ormap;
    }
    
    getCRDT(id) {
        return this.crdts.get(id);
    }
    
    getAllCRDTs() {
        return Array.from(this.crdts.values());
    }
    
    // Synchronization methods
    generateSyncData(targetNodeId = null) {
        const syncData = {
            nodeId: this.myNodeId,
            vectorClock: Object.fromEntries(this.vectorClock),
            crdts: {},
            timestamp: Date.now()
        };
        
        this.crdts.forEach((crdt, id) => {
            syncData.crdts[id] = {
                type: crdt.type,
                state: crdt.getState(),
                vectorClock: crdt.vectorClock
            };
        });
        
        if (this.compressionEnabled) {
            return this.compressSyncData(syncData);
        }
        
        return syncData;
    }
    
    handleIncomingSync(senderId, syncData) {
        this.syncQueue.push({ senderId, syncData, timestamp: Date.now() });
        this.processSyncQueue();
    }
    
    startSyncProcessor() {
        setInterval(() => {
            this.processSyncQueue();
        }, this.syncInterval);
    }
    
    async processSyncQueue() {
        if (this.isProcessingSync || this.syncQueue.length === 0) {
            return;
        }
        
        this.isProcessingSync = true;
        
        try {
            const batch = this.syncQueue.splice(0, this.batchSize);
            
            for (const { senderId, syncData } of batch) {
                await this.processSyncData(senderId, syncData);
            }
        } catch (error) {
            console.error("[CRDTManager] Error processing sync queue:", error);
        } finally {
            this.isProcessingSync = false;
        }
    }
    
    async processSyncData(senderId, syncData) {
        try {
            // Decompress if needed
            const data = this.compressionEnabled ? 
                this.decompressSyncData(syncData) : syncData;
            
            // Update vector clock
            this.updateVectorClock(senderId, data.vectorClock);
            
            // Process each CRDT
            let hasChanges = false;
            
            for (const [crdtId, crdtData] of Object.entries(data.crdts)) {
                const localCRDT = this.crdts.get(crdtId);
                
                if (!localCRDT) {
                    // Create new CRDT if it doesn't exist locally
                    this.createCRDTFromSync(crdtId, crdtData);
                    hasChanges = true;
                } else {
                    // Merge with existing CRDT
                    const changed = localCRDT.merge(crdtData.state, crdtData.vectorClock);
                    if (changed) {
                        hasChanges = true;
                    }
                }
            }
            
            // Notify about changes
            if (hasChanges && this.onDataChanged) {
                this.onDataChanged(this.getAllStates());
            }
            
        } catch (error) {
            console.error(`[CRDTManager] Error processing sync from ${senderId}:`, error);
        }
    }
    
    createCRDTFromSync(id, crdtData) {
        let crdt;
        
        switch (crdtData.type) {
            case 'GSet':
                crdt = new GSet(id, this.myNodeId);
                break;
            case 'ORSet':
                crdt = new ORSet(id, this.myNodeId);
                break;
            case 'LWWRegister':
                crdt = new LWWRegister(id, this.myNodeId);
                break;
            case 'PNCounter':
                crdt = new PNCounter(id, this.myNodeId);
                break;
            case 'ORMap':
                crdt = new ORMap(id, this.myNodeId);
                break;
            default:
                console.warn(`[CRDTManager] Unknown CRDT type: ${crdtData.type}`);
                return;
        }
        
        crdt.setState(crdtData.state);
        crdt.vectorClock = crdtData.vectorClock;
        this.crdts.set(id, crdt);
    }
    
    updateVectorClock(nodeId, remoteVectorClock) {
        for (const [remoteNodeId, remoteTimestamp] of Object.entries(remoteVectorClock)) {
            const localTimestamp = this.vectorClock.get(remoteNodeId) || 0;
            this.vectorClock.set(remoteNodeId, Math.max(localTimestamp, remoteTimestamp));
        }
        
        // Increment our own timestamp
        const myTimestamp = this.vectorClock.get(this.myNodeId) || 0;
        this.vectorClock.set(this.myNodeId, myTimestamp + 1);
    }
    
    getAllStates() {
        const states = {};
        this.crdts.forEach((crdt, id) => {
            states[id] = crdt.getValue();
        });
        return states;
    }
    
    compressSyncData(data) {
        // Simple compression using JSON stringification and basic encoding
        // In production, consider using more sophisticated compression
        try {
            const jsonString = JSON.stringify(data);
            return {
                compressed: true,
                data: btoa(jsonString),
                originalSize: jsonString.length
            };
        } catch (error) {
            console.warn("[CRDTManager] Compression failed, sending uncompressed:", error);
            return data;
        }
    }
    
    decompressSyncData(data) {
        if (!data.compressed) {
            return data;
        }
        
        try {
            const jsonString = atob(data.data);
            return JSON.parse(jsonString);
        } catch (error) {
            console.error("[CRDTManager] Decompression failed:", error);
            throw error;
        }
    }
    
    syncWithPeer(peerId, peerConnection) {
        const syncData = this.generateSyncData(peerId);
        peerConnection.send(JSON.stringify({
            type: "crdt_sync",
            data: syncData
        }));
    }
    
    // Utility methods
    clear() {
        this.crdts.clear();
        this.vectorClock.clear();
        this.syncQueue = [];
    }
    
    getStats() {
        return {
            crdtCount: this.crdts.size,
            queueSize: this.syncQueue.length,
            vectorClockSize: this.vectorClock.size,
            isProcessing: this.isProcessingSync
        };
    }
}

// Base CRDT class
class BaseCRDT {
    constructor(id, nodeId, type) {
        this.id = id;
        this.nodeId = nodeId;
        this.type = type;
        this.vectorClock = {};
        this.lastModified = Date.now();
    }
    
    incrementClock() {
        this.vectorClock[this.nodeId] = (this.vectorClock[this.nodeId] || 0) + 1;
        this.lastModified = Date.now();
    }
    
    updateClock(remoteVectorClock) {
        for (const [nodeId, timestamp] of Object.entries(remoteVectorClock)) {
            this.vectorClock[nodeId] = Math.max(this.vectorClock[nodeId] || 0, timestamp);
        }
    }
}

// G-Set (Grow-only Set)
class GSet extends BaseCRDT {
    constructor(id, nodeId, initialData = []) {
        super(id, nodeId, 'GSet');
        this.elements = new Set(initialData);
    }
    
    add(element) {
        if (!this.elements.has(element)) {
            this.elements.add(element);
            this.incrementClock();
            return true;
        }
        return false;
    }
    
    has(element) {
        return this.elements.has(element);
    }
    
    getValue() {
        return Array.from(this.elements);
    }
    
    getState() {
        return {
            elements: Array.from(this.elements)
        };
    }
    
    setState(state) {
        this.elements = new Set(state.elements);
    }
    
    merge(remoteState, remoteVectorClock) {
        let changed = false;
        const remoteElements = new Set(remoteState.elements);
        
        for (const element of remoteElements) {
            if (!this.elements.has(element)) {
                this.elements.add(element);
                changed = true;
            }
        }
        
        if (changed) {
            this.updateClock(remoteVectorClock);
        }
        
        return changed;
    }
}

// OR-Set (Observed-Remove Set)
class ORSet extends BaseCRDT {
    constructor(id, nodeId, initialData = []) {
        super(id, nodeId, 'ORSet');
        this.added = new Map(); // element -> Set of unique tags
        this.removed = new Map(); // element -> Set of unique tags
        
        initialData.forEach(element => this.add(element));
    }
    
    add(element) {
        const tag = `${this.nodeId}-${Date.now()}-${Math.random()}`;
        
        if (!this.added.has(element)) {
            this.added.set(element, new Set());
        }
        
        this.added.get(element).add(tag);
        this.incrementClock();
        return true;
    }
    
    remove(element) {
        if (this.added.has(element)) {
            const tags = this.added.get(element);
            
            if (!this.removed.has(element)) {
                this.removed.set(element, new Set());
            }
            
            for (const tag of tags) {
                this.removed.get(element).add(tag);
            }
            
            this.incrementClock();
            return true;
        }
        return false;
    }
    
    has(element) {
        if (!this.added.has(element)) return false;
        
        const addedTags = this.added.get(element);
        const removedTags = this.removed.get(element) || new Set();
        
        // Element exists if there are added tags not in removed tags
        for (const tag of addedTags) {
            if (!removedTags.has(tag)) {
                return true;
            }
        }
        
        return false;
    }
    
    getValue() {
        const result = [];
        
        for (const [element, addedTags] of this.added) {
            const removedTags = this.removed.get(element) || new Set();
            
            for (const tag of addedTags) {
                if (!removedTags.has(tag)) {
                    result.push(element);
                    break;
                }
            }
        }
        
        return result;
    }
    
    getState() {
        return {
            added: Object.fromEntries(
                Array.from(this.added.entries()).map(([k, v]) => [k, Array.from(v)])
            ),
            removed: Object.fromEntries(
                Array.from(this.removed.entries()).map(([k, v]) => [k, Array.from(v)])
            )
        };
    }
    
    setState(state) {
        this.added = new Map(
            Object.entries(state.added).map(([k, v]) => [k, new Set(v)])
        );
        this.removed = new Map(
            Object.entries(state.removed).map(([k, v]) => [k, new Set(v)])
        );
    }
    
    merge(remoteState, remoteVectorClock) {
        let changed = false;
        
        // Merge added tags
        for (const [element, remoteTags] of Object.entries(remoteState.added)) {
            if (!this.added.has(element)) {
                this.added.set(element, new Set());
            }
            
            const localTags = this.added.get(element);
            for (const tag of remoteTags) {
                if (!localTags.has(tag)) {
                    localTags.add(tag);
                    changed = true;
                }
            }
        }
        
        // Merge removed tags
        for (const [element, remoteTags] of Object.entries(remoteState.removed)) {
            if (!this.removed.has(element)) {
                this.removed.set(element, new Set());
            }
            
            const localTags = this.removed.get(element);
            for (const tag of remoteTags) {
                if (!localTags.has(tag)) {
                    localTags.add(tag);
                    changed = true;
                }
            }
        }
        
        if (changed) {
            this.updateClock(remoteVectorClock);
        }
        
        return changed;
    }
}

// LWW-Register (Last-Writer-Wins Register)
class LWWRegister extends BaseCRDT {
    constructor(id, nodeId, initialValue = null) {
        super(id, nodeId, 'LWWRegister');
        this.value = initialValue;
        this.timestamp = Date.now();
        this.writerNodeId = nodeId;
    }
    
    set(value) {
        this.value = value;
        this.timestamp = Date.now();
        this.writerNodeId = this.nodeId;
        this.incrementClock();
        return true;
    }
    
    getValue() {
        return this.value;
    }
    
    getState() {
        return {
            value: this.value,
            timestamp: this.timestamp,
            writerNodeId: this.writerNodeId
        };
    }
    
    setState(state) {
        this.value = state.value;
        this.timestamp = state.timestamp;
        this.writerNodeId = state.writerNodeId;
    }
    
    merge(remoteState, remoteVectorClock) {
        let changed = false;
        
        // Use timestamp and node ID for tie-breaking
        if (remoteState.timestamp > this.timestamp ||
            (remoteState.timestamp === this.timestamp && remoteState.writerNodeId > this.writerNodeId)) {
            this.value = remoteState.value;
            this.timestamp = remoteState.timestamp;
            this.writerNodeId = remoteState.writerNodeId;
            changed = true;
        }
        
        if (changed) {
            this.updateClock(remoteVectorClock);
        }
        
        return changed;
    }
}

// PN-Counter (Increment/Decrement Counter)
class PNCounter extends BaseCRDT {
    constructor(id, nodeId, initialValue = 0) {
        super(id, nodeId, 'PNCounter');
        this.increments = new Map(); // nodeId -> count
        this.decrements = new Map(); // nodeId -> count
        
        if (initialValue > 0) {
            this.increments.set(nodeId, initialValue);
        } else if (initialValue < 0) {
            this.decrements.set(nodeId, Math.abs(initialValue));
        }
    }
    
    increment(amount = 1) {
        const current = this.increments.get(this.nodeId) || 0;
        this.increments.set(this.nodeId, current + amount);
        this.incrementClock();
        return true;
    }
    
    decrement(amount = 1) {
        const current = this.decrements.get(this.nodeId) || 0;
        this.decrements.set(this.nodeId, current + amount);
        this.incrementClock();
        return true;
    }
    
    getValue() {
        let total = 0;
        
        for (const count of this.increments.values()) {
            total += count;
        }
        
        for (const count of this.decrements.values()) {
            total -= count;
        }
        
        return total;
    }
    
    getState() {
        return {
            increments: Object.fromEntries(this.increments),
            decrements: Object.fromEntries(this.decrements)
        };
    }
    
    setState(state) {
        this.increments = new Map(Object.entries(state.increments));
        this.decrements = new Map(Object.entries(state.decrements));
    }
    
    merge(remoteState, remoteVectorClock) {
        let changed = false;
        
        // Merge increments
        for (const [nodeId, count] of Object.entries(remoteState.increments)) {
            const localCount = this.increments.get(nodeId) || 0;
            if (count > localCount) {
                this.increments.set(nodeId, count);
                changed = true;
            }
        }
        
        // Merge decrements
        for (const [nodeId, count] of Object.entries(remoteState.decrements)) {
            const localCount = this.decrements.get(nodeId) || 0;
            if (count > localCount) {
                this.decrements.set(nodeId, count);
                changed = true;
            }
        }
        
        if (changed) {
            this.updateClock(remoteVectorClock);
        }
        
        return changed;
    }
}

// OR-Map (Observed-Remove Map)
class ORMap extends BaseCRDT {
    constructor(id, nodeId, initialData = {}) {
        super(id, nodeId, 'ORMap');
        this.keys = new ORSet(`${id}_keys`, nodeId);
        this.values = new Map(); // key -> LWWRegister
        
        for (const [key, value] of Object.entries(initialData)) {
            this.set(key, value);
        }
    }
    
    set(key, value) {
        this.keys.add(key);
        
        if (!this.values.has(key)) {
            this.values.set(key, new LWWRegister(`${this.id}_${key}`, this.nodeId));
        }
        
        this.values.get(key).set(value);
        this.incrementClock();
        return true;
    }
    
    get(key) {
        if (this.keys.has(key) && this.values.has(key)) {
            return this.values.get(key).getValue();
        }
        return undefined;
    }
    
    has(key) {
        return this.keys.has(key);
    }
    
    delete(key) {
        if (this.keys.has(key)) {
            this.keys.remove(key);
            this.incrementClock();
            return true;
        }
        return false;
    }
    
    getValue() {
        const result = {};
        const activeKeys = this.keys.getValue();
        
        for (const key of activeKeys) {
            if (this.values.has(key)) {
                result[key] = this.values.get(key).getValue();
            }
        }
        
        return result;
    }
    
    getState() {
        const valuesState = {};
        for (const [key, register] of this.values) {
            valuesState[key] = register.getState();
        }
        
        return {
            keys: this.keys.getState(),
            values: valuesState
        };
    }
    
    setState(state) {
        this.keys.setState(state.keys);
        
        this.values.clear();
        for (const [key, registerState] of Object.entries(state.values)) {
            const register = new LWWRegister(`${this.id}_${key}`, this.nodeId);
            register.setState(registerState);
            this.values.set(key, register);
        }
    }
    
    merge(remoteState, remoteVectorClock) {
        let changed = false;
        
        // Merge keys
        if (this.keys.merge(remoteState.keys.added, remoteState.keys.removed)) {
            changed = true;
        }
        
        // Merge values
        for (const [key, registerState] of Object.entries(remoteState.values)) {
            if (!this.values.has(key)) {
                const register = new LWWRegister(`${this.id}_${key}`, this.nodeId);
                this.values.set(key, register);
            }
            
            if (this.values.get(key).merge(registerState, remoteVectorClock)) {
                changed = true;
            }
        }
        
        if (changed) {
            this.updateClock(remoteVectorClock);
        }
        
        return changed;
    }
}

