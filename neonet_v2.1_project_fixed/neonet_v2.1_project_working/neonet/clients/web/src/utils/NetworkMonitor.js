/**
 * Network Monitor for NeoNet
 * Provides comprehensive monitoring and metrics collection for the P2P network
 * Tracks performance, health, and usage statistics
 */

export class NetworkMonitor {
    constructor(options = {}) {
        this.nodeId = null;
        this.isEnabled = options.enabled !== false;
        this.reportingInterval = options.reportingInterval || 30000; // 30 seconds
        this.metricsRetentionPeriod = options.metricsRetentionPeriod || 24 * 60 * 60 * 1000; // 24 hours
        
        // Metrics storage
        this.metrics = {
            network: new Map(), // timestamp -> network metrics
            connections: new Map(), // timestamp -> connection metrics
            messages: new Map(), // timestamp -> message metrics
            performance: new Map(), // timestamp -> performance metrics
            errors: new Map(), // timestamp -> error metrics
            custom: new Map() // timestamp -> custom metrics
        };
        
        // Real-time counters
        this.counters = {
            totalConnections: 0,
            activeConnections: 0,
            totalMessages: 0,
            messagesPerSecond: 0,
            bytesTransferred: 0,
            errors: 0,
            reconnections: 0,
            peerDiscoveries: 0
        };
        
        // Performance tracking
        this.performance = {
            connectionLatency: [],
            messageLatency: [],
            throughput: [],
            cpuUsage: [],
            memoryUsage: []
        };
        
        // Health indicators
        this.health = {
            networkHealth: 'unknown',
            connectionHealth: 'unknown',
            performanceHealth: 'unknown',
            overallHealth: 'unknown',
            lastHealthCheck: null
        };
        
        // Event handlers
        this.onMetricsUpdated = options.onMetricsUpdated || null;
        this.onHealthChanged = options.onHealthChanged || null;
        this.onAlert = options.onAlert || null;
        
        // Alert thresholds
        this.thresholds = {
            maxConnectionLatency: options.maxConnectionLatency || 5000, // 5 seconds
            maxMessageLatency: options.maxMessageLatency || 1000, // 1 second
            minConnectionSuccess: options.minConnectionSuccess || 0.8, // 80%
            maxErrorRate: options.maxErrorRate || 0.1, // 10%
            maxMemoryUsage: options.maxMemoryUsage || 0.9, // 90%
            ...options.thresholds
        };
        
        // Data collection
        this.startTime = Date.now();
        this.lastReportTime = Date.now();
        this.messageBuffer = [];
        this.connectionBuffer = [];
        
        if (this.isEnabled) {
            this.startMonitoring();
        }
    }
    
    setNodeId(nodeId) {
        this.nodeId = nodeId;
    }
    
    startMonitoring() {
        // Periodic metrics collection
        setInterval(() => {
            this.collectMetrics();
            this.calculateHealth();
            this.cleanupOldMetrics();
        }, this.reportingInterval);
        
        // High-frequency performance monitoring
        setInterval(() => {
            this.collectPerformanceMetrics();
        }, 1000); // Every second
        
        // Memory and resource monitoring
        if (typeof window !== 'undefined' && window.performance) {
            setInterval(() => {
                this.collectResourceMetrics();
            }, 5000); // Every 5 seconds
        }
    }
    
    // Connection monitoring
    recordConnectionAttempt(targetNodeId, timestamp = Date.now()) {
        this.connectionBuffer.push({
            type: 'attempt',
            targetNodeId,
            timestamp,
            startTime: timestamp
        });
        
        this.counters.totalConnections++;
    }
    
    recordConnectionSuccess(targetNodeId, latency, timestamp = Date.now()) {
        this.connectionBuffer.push({
            type: 'success',
            targetNodeId,
            timestamp,
            latency
        });
        
        this.counters.activeConnections++;
        this.performance.connectionLatency.push(latency);
        
        // Keep only recent latency data
        if (this.performance.connectionLatency.length > 100) {
            this.performance.connectionLatency = this.performance.connectionLatency.slice(-100);
        }
    }
    
    recordConnectionFailure(targetNodeId, error, timestamp = Date.now()) {
        this.connectionBuffer.push({
            type: 'failure',
            targetNodeId,
            timestamp,
            error: error.message || error
        });
        
        this.counters.errors++;
        this.recordError('connection_failure', error, { targetNodeId });
    }
    
    recordConnectionClosed(targetNodeId, reason, timestamp = Date.now()) {
        this.connectionBuffer.push({
            type: 'closed',
            targetNodeId,
            timestamp,
            reason
        });
        
        this.counters.activeConnections = Math.max(0, this.counters.activeConnections - 1);
    }
    
    recordReconnection(targetNodeId, timestamp = Date.now()) {
        this.counters.reconnections++;
        this.connectionBuffer.push({
            type: 'reconnection',
            targetNodeId,
            timestamp
        });
    }
    
    // Message monitoring
    recordMessageSent(targetNodeId, messageType, size, timestamp = Date.now()) {
        this.messageBuffer.push({
            type: 'sent',
            targetNodeId,
            messageType,
            size,
            timestamp,
            startTime: timestamp
        });
        
        this.counters.totalMessages++;
        this.counters.bytesTransferred += size;
    }
    
    recordMessageReceived(senderId, messageType, size, latency, timestamp = Date.now()) {
        this.messageBuffer.push({
            type: 'received',
            senderId,
            messageType,
            size,
            latency,
            timestamp
        });
        
        this.counters.totalMessages++;
        this.counters.bytesTransferred += size;
        
        if (latency !== undefined) {
            this.performance.messageLatency.push(latency);
            
            // Keep only recent latency data
            if (this.performance.messageLatency.length > 1000) {
                this.performance.messageLatency = this.performance.messageLatency.slice(-1000);
            }
        }
    }
    
    recordMessageError(targetNodeId, messageType, error, timestamp = Date.now()) {
        this.messageBuffer.push({
            type: 'error',
            targetNodeId,
            messageType,
            error: error.message || error,
            timestamp
        });
        
        this.counters.errors++;
        this.recordError('message_error', error, { targetNodeId, messageType });
    }
    
    // Peer discovery monitoring
    recordPeerDiscovery(peersFound, latency, timestamp = Date.now()) {
        this.counters.peerDiscoveries++;
        
        this.messageBuffer.push({
            type: 'peer_discovery',
            peersFound,
            latency,
            timestamp
        });
    }
    
    // Error tracking
    recordError(type, error, context = {}, timestamp = Date.now()) {
        const errorRecord = {
            type,
            message: error.message || error,
            stack: error.stack,
            context,
            timestamp,
            nodeId: this.nodeId
        };
        
        const timeKey = Math.floor(timestamp / 60000) * 60000; // Round to minute
        if (!this.metrics.errors.has(timeKey)) {
            this.metrics.errors.set(timeKey, []);
        }
        this.metrics.errors.get(timeKey).push(errorRecord);
        
        // Check if this triggers an alert
        this.checkErrorThresholds();
    }
    
    // Custom metrics
    recordCustomMetric(name, value, tags = {}, timestamp = Date.now()) {
        const timeKey = Math.floor(timestamp / 60000) * 60000; // Round to minute
        if (!this.metrics.custom.has(timeKey)) {
            this.metrics.custom.set(timeKey, new Map());
        }
        
        const minuteMetrics = this.metrics.custom.get(timeKey);
        if (!minuteMetrics.has(name)) {
            minuteMetrics.set(name, []);
        }
        
        minuteMetrics.get(name).push({ value, tags, timestamp });
    }
    
    // Metrics collection
    collectMetrics() {
        const now = Date.now();
        const timeKey = Math.floor(now / 60000) * 60000; // Round to minute
        
        // Network metrics
        const networkMetrics = {
            timestamp: now,
            activeConnections: this.counters.activeConnections,
            totalConnections: this.counters.totalConnections,
            reconnections: this.counters.reconnections,
            peerDiscoveries: this.counters.peerDiscoveries,
            uptime: now - this.startTime
        };
        this.metrics.network.set(timeKey, networkMetrics);
        
        // Connection metrics
        const connectionMetrics = this.analyzeConnections();
        this.metrics.connections.set(timeKey, connectionMetrics);
        
        // Message metrics
        const messageMetrics = this.analyzeMessages();
        this.metrics.messages.set(timeKey, messageMetrics);
        
        // Performance metrics
        const performanceMetrics = this.analyzePerformance();
        this.metrics.performance.set(timeKey, performanceMetrics);
        
        // Clear buffers
        this.connectionBuffer = [];
        this.messageBuffer = [];
        
        // Calculate messages per second
        const timeDiff = (now - this.lastReportTime) / 1000;
        this.counters.messagesPerSecond = messageMetrics.totalMessages / timeDiff;
        this.lastReportTime = now;
        
        // Notify listeners
        if (this.onMetricsUpdated) {
            this.onMetricsUpdated(this.getLatestMetrics());
        }
    }
    
    analyzeConnections() {
        const attempts = this.connectionBuffer.filter(c => c.type === 'attempt').length;
        const successes = this.connectionBuffer.filter(c => c.type === 'success').length;
        const failures = this.connectionBuffer.filter(c => c.type === 'failure').length;
        const closures = this.connectionBuffer.filter(c => c.type === 'closed').length;
        
        return {
            attempts,
            successes,
            failures,
            closures,
            successRate: attempts > 0 ? successes / attempts : 0,
            failureRate: attempts > 0 ? failures / attempts : 0,
            averageLatency: this.calculateAverageLatency(this.connectionBuffer, 'latency')
        };
    }
    
    analyzeMessages() {
        const sent = this.messageBuffer.filter(m => m.type === 'sent').length;
        const received = this.messageBuffer.filter(m => m.type === 'received').length;
        const errors = this.messageBuffer.filter(m => m.type === 'error').length;
        
        const totalBytes = this.messageBuffer.reduce((sum, m) => sum + (m.size || 0), 0);
        const averageLatency = this.calculateAverageLatency(this.messageBuffer, 'latency');
        
        // Message type distribution
        const messageTypes = {};
        this.messageBuffer.forEach(m => {
            if (m.messageType) {
                messageTypes[m.messageType] = (messageTypes[m.messageType] || 0) + 1;
            }
        });
        
        return {
            totalMessages: sent + received,
            messagesSent: sent,
            messagesReceived: received,
            messageErrors: errors,
            totalBytes,
            averageLatency,
            messageTypes,
            errorRate: (sent + received) > 0 ? errors / (sent + received) : 0
        };
    }
    
    analyzePerformance() {
        return {
            averageConnectionLatency: this.calculateAverage(this.performance.connectionLatency),
            averageMessageLatency: this.calculateAverage(this.performance.messageLatency),
            p95ConnectionLatency: this.calculatePercentile(this.performance.connectionLatency, 95),
            p95MessageLatency: this.calculatePercentile(this.performance.messageLatency, 95),
            throughput: this.calculateThroughput(),
            memoryUsage: this.getMemoryUsage(),
            cpuUsage: this.getCPUUsage()
        };
    }
    
    collectPerformanceMetrics() {
        // Collect throughput data
        const now = Date.now();
        const recentMessages = this.messageBuffer.filter(m => now - m.timestamp < 1000);
        const throughput = recentMessages.reduce((sum, m) => sum + (m.size || 0), 0);
        
        this.performance.throughput.push({ timestamp: now, value: throughput });
        
        // Keep only recent data
        if (this.performance.throughput.length > 300) { // 5 minutes at 1-second intervals
            this.performance.throughput = this.performance.throughput.slice(-300);
        }
    }
    
    collectResourceMetrics() {
        if (typeof window !== 'undefined' && window.performance) {
            const memory = window.performance.memory;
            if (memory) {
                this.performance.memoryUsage.push({
                    timestamp: Date.now(),
                    used: memory.usedJSHeapSize,
                    total: memory.totalJSHeapSize,
                    limit: memory.jsHeapSizeLimit
                });
                
                // Keep only recent data
                if (this.performance.memoryUsage.length > 720) { // 1 hour at 5-second intervals
                    this.performance.memoryUsage = this.performance.memoryUsage.slice(-720);
                }
            }
        }
    }
    
    // Health calculation
    calculateHealth() {
        const now = Date.now();
        
        // Network health
        const connectionSuccessRate = this.getRecentConnectionSuccessRate();
        const networkHealth = connectionSuccessRate >= this.thresholds.minConnectionSuccess ? 'healthy' : 'unhealthy';
        
        // Connection health
        const avgConnectionLatency = this.calculateAverage(this.performance.connectionLatency.slice(-10));
        const connectionHealth = avgConnectionLatency <= this.thresholds.maxConnectionLatency ? 'healthy' : 'unhealthy';
        
        // Performance health
        const avgMessageLatency = this.calculateAverage(this.performance.messageLatency.slice(-100));
        const memoryUsage = this.getMemoryUsageRatio();
        const performanceHealth = (avgMessageLatency <= this.thresholds.maxMessageLatency && 
                                 memoryUsage <= this.thresholds.maxMemoryUsage) ? 'healthy' : 'unhealthy';
        
        // Overall health
        const healthScores = [networkHealth, connectionHealth, performanceHealth];
        const healthyCount = healthScores.filter(h => h === 'healthy').length;
        let overallHealth;
        
        if (healthyCount === 3) {
            overallHealth = 'healthy';
        } else if (healthyCount >= 2) {
            overallHealth = 'degraded';
        } else {
            overallHealth = 'unhealthy';
        }
        
        // Update health status
        const previousHealth = this.health.overallHealth;
        this.health = {
            networkHealth,
            connectionHealth,
            performanceHealth,
            overallHealth,
            lastHealthCheck: now
        };
        
        // Notify if health changed
        if (previousHealth !== overallHealth && this.onHealthChanged) {
            this.onHealthChanged(this.health);
        }
        
        // Check for alerts
        this.checkHealthAlerts();
    }
    
    checkHealthAlerts() {
        const alerts = [];
        
        // High latency alert
        const avgLatency = this.calculateAverage(this.performance.messageLatency.slice(-10));
        if (avgLatency > this.thresholds.maxMessageLatency) {
            alerts.push({
                type: 'high_latency',
                severity: 'warning',
                message: `High message latency detected: ${avgLatency.toFixed(2)}ms`,
                value: avgLatency,
                threshold: this.thresholds.maxMessageLatency
            });
        }
        
        // High error rate alert
        const errorRate = this.getRecentErrorRate();
        if (errorRate > this.thresholds.maxErrorRate) {
            alerts.push({
                type: 'high_error_rate',
                severity: 'error',
                message: `High error rate detected: ${(errorRate * 100).toFixed(1)}%`,
                value: errorRate,
                threshold: this.thresholds.maxErrorRate
            });
        }
        
        // Memory usage alert
        const memoryUsage = this.getMemoryUsageRatio();
        if (memoryUsage > this.thresholds.maxMemoryUsage) {
            alerts.push({
                type: 'high_memory_usage',
                severity: 'warning',
                message: `High memory usage detected: ${(memoryUsage * 100).toFixed(1)}%`,
                value: memoryUsage,
                threshold: this.thresholds.maxMemoryUsage
            });
        }
        
        // Send alerts
        alerts.forEach(alert => {
            if (this.onAlert) {
                this.onAlert(alert);
            }
        });
    }
    
    checkErrorThresholds() {
        const errorRate = this.getRecentErrorRate();
        if (errorRate > this.thresholds.maxErrorRate && this.onAlert) {
            this.onAlert({
                type: 'error_threshold_exceeded',
                severity: 'error',
                message: `Error rate threshold exceeded: ${(errorRate * 100).toFixed(1)}%`,
                value: errorRate,
                threshold: this.thresholds.maxErrorRate
            });
        }
    }
    
    // Utility methods
    calculateAverage(values) {
        if (!values || values.length === 0) return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    
    calculatePercentile(values, percentile) {
        if (!values || values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }
    
    calculateAverageLatency(buffer, field) {
        const latencies = buffer.filter(item => item[field] !== undefined).map(item => item[field]);
        return this.calculateAverage(latencies);
    }
    
    calculateThroughput() {
        const recentThroughput = this.performance.throughput.slice(-60); // Last minute
        return this.calculateAverage(recentThroughput.map(t => t.value));
    }
    
    getMemoryUsage() {
        const recent = this.performance.memoryUsage.slice(-1)[0];
        return recent ? recent.used : 0;
    }
    
    getMemoryUsageRatio() {
        const recent = this.performance.memoryUsage.slice(-1)[0];
        return recent ? recent.used / recent.limit : 0;
    }
    
    getCPUUsage() {
        // Browser doesn't provide direct CPU usage, return 0
        return 0;
    }
    
    getRecentConnectionSuccessRate() {
        const recentConnections = this.connectionBuffer.filter(c => 
            Date.now() - c.timestamp < 300000 // Last 5 minutes
        );
        
        const attempts = recentConnections.filter(c => c.type === 'attempt').length;
        const successes = recentConnections.filter(c => c.type === 'success').length;
        
        return attempts > 0 ? successes / attempts : 1;
    }
    
    getRecentErrorRate() {
        const now = Date.now();
        const recentPeriod = 300000; // 5 minutes
        
        let totalOperations = 0;
        let totalErrors = 0;
        
        // Count recent messages and errors
        this.messageBuffer.forEach(m => {
            if (now - m.timestamp < recentPeriod) {
                totalOperations++;
                if (m.type === 'error') {
                    totalErrors++;
                }
            }
        });
        
        // Count recent connection errors
        this.connectionBuffer.forEach(c => {
            if (now - c.timestamp < recentPeriod) {
                totalOperations++;
                if (c.type === 'failure') {
                    totalErrors++;
                }
            }
        });
        
        return totalOperations > 0 ? totalErrors / totalOperations : 0;
    }
    
    // Data access methods
    getLatestMetrics() {
        const latest = {};
        
        for (const [category, metricsMap] of Object.entries(this.metrics)) {
            const timestamps = Array.from(metricsMap.keys()).sort((a, b) => b - a);
            if (timestamps.length > 0) {
                latest[category] = metricsMap.get(timestamps[0]);
            }
        }
        
        return {
            ...latest,
            counters: { ...this.counters },
            health: { ...this.health },
            timestamp: Date.now()
        };
    }
    
    getMetricsHistory(category, duration = 3600000) { // 1 hour default
        const now = Date.now();
        const cutoff = now - duration;
        
        const metricsMap = this.metrics[category];
        if (!metricsMap) return [];
        
        return Array.from(metricsMap.entries())
            .filter(([timestamp]) => timestamp >= cutoff)
            .sort(([a], [b]) => a - b)
            .map(([timestamp, data]) => ({ timestamp, ...data }));
    }
    
    getPerformanceStats() {
        return {
            connectionLatency: {
                average: this.calculateAverage(this.performance.connectionLatency),
                p95: this.calculatePercentile(this.performance.connectionLatency, 95),
                p99: this.calculatePercentile(this.performance.connectionLatency, 99)
            },
            messageLatency: {
                average: this.calculateAverage(this.performance.messageLatency),
                p95: this.calculatePercentile(this.performance.messageLatency, 95),
                p99: this.calculatePercentile(this.performance.messageLatency, 99)
            },
            throughput: this.calculateThroughput(),
            memoryUsage: this.getMemoryUsageRatio()
        };
    }
    
    // Cleanup
    cleanupOldMetrics() {
        const cutoff = Date.now() - this.metricsRetentionPeriod;
        
        for (const metricsMap of Object.values(this.metrics)) {
            const keysToDelete = [];
            for (const [timestamp] of metricsMap) {
                if (timestamp < cutoff) {
                    keysToDelete.push(timestamp);
                }
            }
            keysToDelete.forEach(key => metricsMap.delete(key));
        }
    }
    
    // Export/Import
    exportMetrics() {
        const data = {
            nodeId: this.nodeId,
            startTime: this.startTime,
            counters: this.counters,
            health: this.health,
            metrics: {},
            exportTime: Date.now()
        };
        
        // Convert Maps to Objects for JSON serialization
        for (const [category, metricsMap] of Object.entries(this.metrics)) {
            data.metrics[category] = Object.fromEntries(metricsMap);
        }
        
        return data;
    }
    
    reset() {
        this.counters = {
            totalConnections: 0,
            activeConnections: 0,
            totalMessages: 0,
            messagesPerSecond: 0,
            bytesTransferred: 0,
            errors: 0,
            reconnections: 0,
            peerDiscoveries: 0
        };
        
        this.performance = {
            connectionLatency: [],
            messageLatency: [],
            throughput: [],
            cpuUsage: [],
            memoryUsage: []
        };
        
        for (const metricsMap of Object.values(this.metrics)) {
            metricsMap.clear();
        }
        
        this.startTime = Date.now();
        this.lastReportTime = Date.now();
        this.messageBuffer = [];
        this.connectionBuffer = [];
    }
}

