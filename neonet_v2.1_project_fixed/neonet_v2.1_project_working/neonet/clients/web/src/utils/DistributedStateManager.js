/**
 * Distributed State Manager for NeoNet
 * Manages shared state across multiple peers using event sourcing and CRDTs
 * Supports pub/sub patterns for real-time state synchronization
 */

export class DistributedStateManager {
    constructor(options = {}) {
        this.nodeId = null;
        this.states = new Map(); // stateId -> StateContainer
        this.subscriptions = new Map(); // stateId -> Set of callback functions
        this.eventLog = []; // Array of events for event sourcing
        this.vectorClock = new Map(); // nodeId -> timestamp
        this.onStateChanged = null;
        
        // Configuration
        this.maxEventLogSize = options.maxEventLogSize || 10000;
        this.snapshotInterval = options.snapshotInterval || 1000; // events
        this.syncBatchSize = options.syncBatchSize || 100;
        this.conflictResolutionStrategy = options.conflictResolutionStrategy || 'last-writer-wins';
        
        // Performance optimization
        this.batchedUpdates = new Map(); // stateId -> pending updates
        this.updateTimer = null;
        this.batchDelay = options.batchDelay || 100; // ms
        
        // Event sourcing
        this.snapshots = new Map(); // stateId -> { snapshot, eventIndex }
        this.eventIndex = 0;
        
        this.startPeriodicTasks();
    }
    
    setNodeId(nodeId) {
        this.nodeId = nodeId;
        this.vectorClock.set(nodeId, 0);
    }
    
    // State management
    createState(stateId, initialValue = {}, options = {}) {
        if (this.states.has(stateId)) {
            console.warn(`[DistributedStateManager] State ${stateId} already exists`);
            return this.states.get(stateId);
        }
        
        const stateContainer = new StateContainer(stateId, this.nodeId, initialValue, options);
        this.states.set(stateId, stateContainer);
        
        // Create initial event
        this.addEvent({
            type: 'STATE_CREATED',
            stateId: stateId,
            nodeId: this.nodeId,
            timestamp: Date.now(),
            data: { initialValue, options }
        });
        
        return stateContainer;
    }
    
    getState(stateId) {
        const container = this.states.get(stateId);
        return container ? container.getValue() : undefined;
    }
    
    setState(stateId, value, metadata = {}) {
        const container = this.states.get(stateId);
        if (!container) {
            console.warn(`[DistributedStateManager] State ${stateId} does not exist`);
            return false;
        }
        
        const event = {
            type: 'STATE_UPDATED',
            stateId: stateId,
            nodeId: this.nodeId,
            timestamp: Date.now(),
            vectorClock: this.getVectorClockSnapshot(),
            data: { value, metadata, previousValue: container.getValue() }
        };
        
        this.addEvent(event);
        container.setValue(value, event.timestamp, this.nodeId);
        
        // Batch the update notification
        this.batchUpdate(stateId, value, event);
        
        return true;
    }
    
    updateState(stateId, updater, metadata = {}) {
        const container = this.states.get(stateId);
        if (!container) {
            console.warn(`[DistributedStateManager] State ${stateId} does not exist`);
            return false;
        }
        
        const currentValue = container.getValue();
        const newValue = updater(currentValue);
        
        return this.setState(stateId, newValue, metadata);
    }
    
    deleteState(stateId) {
        const container = this.states.get(stateId);
        if (!container) {
            return false;
        }
        
        const event = {
            type: 'STATE_DELETED',
            stateId: stateId,
            nodeId: this.nodeId,
            timestamp: Date.now(),
            data: { finalValue: container.getValue() }
        };
        
        this.addEvent(event);
        this.states.delete(stateId);
        this.subscriptions.delete(stateId);
        this.batchedUpdates.delete(stateId);
        
        this.notifySubscribers(stateId, null, event);
        
        return true;
    }
    
    // Subscription management
    subscribe(stateId, callback) {
        if (!this.subscriptions.has(stateId)) {
            this.subscriptions.set(stateId, new Set());
        }
        
        this.subscriptions.get(stateId).add(callback);
        
        // Return unsubscribe function
        return () => {
            const subscribers = this.subscriptions.get(stateId);
            if (subscribers) {
                subscribers.delete(callback);
                if (subscribers.size === 0) {
                    this.subscriptions.delete(stateId);
                }
            }
        };
    }
    
    unsubscribe(stateId, callback) {
        const subscribers = this.subscriptions.get(stateId);
        if (subscribers) {
            subscribers.delete(callback);
            if (subscribers.size === 0) {
                this.subscriptions.delete(stateId);
            }
        }
    }
    
    // Event sourcing
    addEvent(event) {
        event.eventId = `${this.nodeId}-${Date.now()}-${Math.random()}`;
        event.eventIndex = this.eventIndex++;
        
        this.eventLog.push(event);
        this.incrementVectorClock();
        
        // Cleanup old events if log is too large
        if (this.eventLog.length > this.maxEventLogSize) {
            this.createSnapshot();
            this.trimEventLog();
        }
    }
    
    createSnapshot() {
        this.states.forEach((container, stateId) => {
            this.snapshots.set(stateId, {
                snapshot: container.getSnapshot(),
                eventIndex: this.eventIndex - 1,
                timestamp: Date.now()
            });
        });
        
        console.log(`[DistributedStateManager] Created snapshots at event index ${this.eventIndex - 1}`);
    }
    
    trimEventLog() {
        const minSnapshotIndex = Math.min(...Array.from(this.snapshots.values()).map(s => s.eventIndex));
        const eventsToKeep = this.eventLog.filter(event => event.eventIndex > minSnapshotIndex);
        
        console.log(`[DistributedStateManager] Trimmed event log from ${this.eventLog.length} to ${eventsToKeep.length} events`);
        this.eventLog = eventsToKeep;
    }
    
    // Synchronization
    generateSyncData(targetNodeId = null, fromEventIndex = 0) {
        const relevantEvents = this.eventLog.filter(event => event.eventIndex >= fromEventIndex);
        
        return {
            nodeId: this.nodeId,
            vectorClock: Object.fromEntries(this.vectorClock),
            events: relevantEvents,
            snapshots: Object.fromEntries(this.snapshots),
            currentEventIndex: this.eventIndex,
            timestamp: Date.now()
        };
    }
    
    handleStateUpdate(senderId, syncData) {
        try {
            this.processSyncData(senderId, syncData);
        } catch (error) {
            console.error(`[DistributedStateManager] Error handling state update from ${senderId}:`, error);
        }
    }
    
    processSyncData(senderId, syncData) {
        // Update vector clock
        this.mergeVectorClock(syncData.vectorClock);
        
        // Process snapshots
        this.processSnapshots(syncData.snapshots);
        
        // Process events
        const newEvents = this.processEvents(syncData.events);
        
        // Rebuild states from events if needed
        if (newEvents.length > 0) {
            this.rebuildStatesFromEvents();
        }
    }
    
    processSnapshots(remoteSnapshots) {
        for (const [stateId, remoteSnapshot] of Object.entries(remoteSnapshots)) {
            const localSnapshot = this.snapshots.get(stateId);
            
            if (!localSnapshot || remoteSnapshot.eventIndex > localSnapshot.eventIndex) {
                this.snapshots.set(stateId, remoteSnapshot);
                
                // Restore state from snapshot if it doesn't exist locally
                if (!this.states.has(stateId)) {
                    const container = StateContainer.fromSnapshot(stateId, remoteSnapshot.snapshot);
                    this.states.set(stateId, container);
                }
            }
        }
    }
    
    processEvents(remoteEvents) {
        const newEvents = [];
        
        for (const event of remoteEvents) {
            // Check if we already have this event
            const existingEvent = this.eventLog.find(e => e.eventId === event.eventId);
            if (!existingEvent) {
                // Insert event in correct order based on vector clock
                const insertIndex = this.findEventInsertIndex(event);
                this.eventLog.splice(insertIndex, 0, event);
                newEvents.push(event);
            }
        }
        
        // Update event index
        this.eventIndex = Math.max(this.eventIndex, ...this.eventLog.map(e => e.eventIndex)) + 1;
        
        return newEvents;
    }
    
    findEventInsertIndex(event) {
        // Simple insertion based on timestamp
        // In production, use proper vector clock comparison
        for (let i = this.eventLog.length - 1; i >= 0; i--) {
            if (this.eventLog[i].timestamp <= event.timestamp) {
                return i + 1;
            }
        }
        return 0;
    }
    
    rebuildStatesFromEvents() {
        // Group events by state
        const stateEvents = new Map();
        
        this.eventLog.forEach(event => {
            if (event.stateId) {
                if (!stateEvents.has(event.stateId)) {
                    stateEvents.set(event.stateId, []);
                }
                stateEvents.get(event.stateId).push(event);
            }
        });
        
        // Rebuild each state
        stateEvents.forEach((events, stateId) => {
            this.rebuildState(stateId, events);
        });
    }
    
    rebuildState(stateId, events) {
        let container = this.states.get(stateId);
        
        // Start from snapshot if available
        const snapshot = this.snapshots.get(stateId);
        if (snapshot) {
            container = StateContainer.fromSnapshot(stateId, snapshot.snapshot);
            // Only process events after the snapshot
            events = events.filter(e => e.eventIndex > snapshot.eventIndex);
        }
        
        // Apply events in order
        events.sort((a, b) => a.eventIndex - b.eventIndex);
        
        for (const event of events) {
            switch (event.type) {
                case 'STATE_CREATED':
                    if (!container) {
                        container = new StateContainer(stateId, event.nodeId, event.data.initialValue, event.data.options);
                    }
                    break;
                    
                case 'STATE_UPDATED':
                    if (container) {
                        container.setValue(event.data.value, event.timestamp, event.nodeId);
                    }
                    break;
                    
                case 'STATE_DELETED':
                    container = null;
                    break;
            }
        }
        
        // Update local state
        if (container) {
            this.states.set(stateId, container);
        } else {
            this.states.delete(stateId);
        }
    }
    
    // Batched updates
    batchUpdate(stateId, value, event) {
        this.batchedUpdates.set(stateId, { value, event });
        
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        
        this.updateTimer = setTimeout(() => {
            this.flushBatchedUpdates();
        }, this.batchDelay);
    }
    
    flushBatchedUpdates() {
        this.batchedUpdates.forEach(({ value, event }, stateId) => {
            this.notifySubscribers(stateId, value, event);
        });
        
        this.batchedUpdates.clear();
        this.updateTimer = null;
        
        // Notify global state change
        if (this.onStateChanged) {
            this.onStateChanged(this.getAllStates());
        }
    }
    
    notifySubscribers(stateId, value, event) {
        const subscribers = this.subscriptions.get(stateId);
        if (subscribers) {
            subscribers.forEach(callback => {
                try {
                    callback(value, event);
                } catch (error) {
                    console.error(`[DistributedStateManager] Error in subscriber callback:`, error);
                }
            });
        }
    }
    
    // Vector clock management
    incrementVectorClock() {
        const current = this.vectorClock.get(this.nodeId) || 0;
        this.vectorClock.set(this.nodeId, current + 1);
    }
    
    mergeVectorClock(remoteVectorClock) {
        for (const [nodeId, timestamp] of Object.entries(remoteVectorClock)) {
            const localTimestamp = this.vectorClock.get(nodeId) || 0;
            this.vectorClock.set(nodeId, Math.max(localTimestamp, timestamp));
        }
    }
    
    getVectorClockSnapshot() {
        return Object.fromEntries(this.vectorClock);
    }
    
    // Utility methods
    getAllStates() {
        const result = {};
        this.states.forEach((container, stateId) => {
            result[stateId] = container.getValue();
        });
        return result;
    }
    
    getStateMetadata(stateId) {
        const container = this.states.get(stateId);
        return container ? container.getMetadata() : null;
    }
    
    getStats() {
        return {
            stateCount: this.states.size,
            eventLogSize: this.eventLog.length,
            snapshotCount: this.snapshots.size,
            subscriptionCount: Array.from(this.subscriptions.values()).reduce((sum, set) => sum + set.size, 0),
            vectorClockSize: this.vectorClock.size,
            currentEventIndex: this.eventIndex
        };
    }
    
    startPeriodicTasks() {
        // Periodic snapshot creation
        setInterval(() => {
            if (this.eventLog.length > this.snapshotInterval) {
                this.createSnapshot();
            }
        }, 60000); // Every minute
        
        // Periodic cleanup
        setInterval(() => {
            this.cleanup();
        }, 300000); // Every 5 minutes
    }
    
    cleanup() {
        // Remove old snapshots
        const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
        
        this.snapshots.forEach((snapshot, stateId) => {
            if (snapshot.timestamp < cutoffTime) {
                this.snapshots.delete(stateId);
            }
        });
        
        // Trim event log if it's still too large
        if (this.eventLog.length > this.maxEventLogSize * 1.5) {
            this.trimEventLog();
        }
    }
    
    clear() {
        this.states.clear();
        this.subscriptions.clear();
        this.eventLog = [];
        this.snapshots.clear();
        this.vectorClock.clear();
        this.batchedUpdates.clear();
        this.eventIndex = 0;
        
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
    }
}

// State Container class
class StateContainer {
    constructor(id, nodeId, initialValue = {}, options = {}) {
        this.id = id;
        this.nodeId = nodeId;
        this.value = initialValue;
        this.lastModified = Date.now();
        this.lastModifiedBy = nodeId;
        this.version = 1;
        this.options = options;
        this.metadata = {
            created: Date.now(),
            createdBy: nodeId,
            type: options.type || 'object'
        };
    }
    
    setValue(value, timestamp = Date.now(), modifiedBy = this.nodeId) {
        // Apply conflict resolution strategy
        if (this.shouldAcceptUpdate(timestamp, modifiedBy)) {
            this.value = value;
            this.lastModified = timestamp;
            this.lastModifiedBy = modifiedBy;
            this.version++;
            return true;
        }
        return false;
    }
    
    shouldAcceptUpdate(timestamp, modifiedBy) {
        // Last-writer-wins with tie-breaking by node ID
        return timestamp > this.lastModified || 
               (timestamp === this.lastModified && modifiedBy > this.lastModifiedBy);
    }
    
    getValue() {
        return this.value;
    }
    
    getMetadata() {
        return {
            ...this.metadata,
            lastModified: this.lastModified,
            lastModifiedBy: this.lastModifiedBy,
            version: this.version
        };
    }
    
    getSnapshot() {
        return {
            id: this.id,
            value: this.value,
            lastModified: this.lastModified,
            lastModifiedBy: this.lastModifiedBy,
            version: this.version,
            metadata: this.metadata,
            options: this.options
        };
    }
    
    static fromSnapshot(id, snapshot) {
        const container = new StateContainer(id, snapshot.lastModifiedBy, snapshot.value, snapshot.options);
        container.lastModified = snapshot.lastModified;
        container.lastModifiedBy = snapshot.lastModifiedBy;
        container.version = snapshot.version;
        container.metadata = snapshot.metadata;
        return container;
    }
}

