/**
 * Security Manager for NeoNet
 * Provides comprehensive security features including:
 * - Rate limiting and DDoS protection
 * - Message validation and sanitization
 * - Peer authentication and reputation
 * - Encryption and data protection
 * - Attack detection and mitigation
 */

export class SecurityManager {
    constructor(options = {}) {
        this.nodeId = null;
        this.isEnabled = options.enabled !== false;
        
        // Rate limiting configuration
        this.rateLimits = {
            messagesPerMinute: options.messagesPerMinute || 1000,
            connectionsPerMinute: options.connectionsPerMinute || 50,
            bytesPerMinute: options.bytesPerMinute || 10 * 1024 * 1024, // 10MB
            signallingPerMinute: options.signallingPerMinute || 200
        };
        
        // Security policies
        this.policies = {
            requireEncryption: options.requireEncryption !== false,
            allowAnonymous: options.allowAnonymous !== false,
            maxMessageSize: options.maxMessageSize || 1024 * 1024, // 1MB
            maxConnectionsPerPeer: options.maxConnectionsPerPeer || 5,
            sessionTimeout: options.sessionTimeout || 24 * 60 * 60 * 1000, // 24 hours
            ...options.policies
        };
        
        // Rate limiting storage
        this.rateLimitData = new Map(); // peerId -> { messages: [], connections: [], bytes: 0, lastReset: timestamp }
        
        // Peer reputation system
        this.peerReputations = new Map(); // peerId -> reputation score (0-100)
        this.peerBehavior = new Map(); // peerId -> behavior metrics
        
        // Blocked and suspicious peers
        this.blockedPeers = new Set();
        this.suspiciousPeers = new Map(); // peerId -> { reason, timestamp, strikes }
        
        // Attack detection
        this.attackPatterns = new Map();
        this.anomalyDetection = {
            baselineMetrics: new Map(),
            currentMetrics: new Map(),
            alertThresholds: {
                messageSpike: 5.0, // 5x normal rate
                connectionSpike: 3.0, // 3x normal rate
                errorSpike: 10.0, // 10x normal rate
                latencySpike: 2.0 // 2x normal latency
            }
        };
        
        // Encryption keys and sessions
        this.encryptionKeys = new Map(); // peerId -> { publicKey, sharedSecret }
        this.sessions = new Map(); // sessionId -> { peerId, created, lastActivity, encrypted }
        
        // Event handlers
        this.onSecurityEvent = options.onSecurityEvent || null;
        this.onPeerBlocked = options.onPeerBlocked || null;
        this.onAttackDetected = options.onAttackDetected || null;
        
        // Validation rules
        this.messageValidators = new Map();
        this.setupDefaultValidators();
        
        if (this.isEnabled) {
            this.startSecurityMonitoring();
        }
    }
    
    setNodeId(nodeId) {
        this.nodeId = nodeId;
    }
    
    startSecurityMonitoring() {
        // Rate limit cleanup
        setInterval(() => {
            this.cleanupRateLimitData();
        }, 60000); // Every minute
        
        // Reputation updates
        setInterval(() => {
            this.updatePeerReputations();
        }, 300000); // Every 5 minutes
        
        // Attack pattern analysis
        setInterval(() => {
            this.analyzeAttackPatterns();
        }, 30000); // Every 30 seconds
        
        // Session cleanup
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 600000); // Every 10 minutes
        
        // Anomaly detection
        setInterval(() => {
            this.updateAnomalyBaseline();
        }, 900000); // Every 15 minutes
    }
    
    // Rate limiting
    checkRateLimit(peerId, type, size = 1) {
        if (!this.isEnabled || this.isWhitelisted(peerId)) {
            return true;
        }
        
        const now = Date.now();
        let peerData = this.rateLimitData.get(peerId);
        
        if (!peerData) {
            peerData = {
                messages: [],
                connections: [],
                bytes: 0,
                lastReset: now
            };
            this.rateLimitData.set(peerId, peerData);
        }
        
        // Reset counters if a minute has passed
        if (now - peerData.lastReset > 60000) {
            peerData.messages = [];
            peerData.connections = [];
            peerData.bytes = 0;
            peerData.lastReset = now;
        }
        
        // Check specific rate limits
        switch (type) {
            case 'message':
                peerData.messages.push(now);
                if (peerData.messages.length > this.rateLimits.messagesPerMinute) {
                    this.handleRateLimitViolation(peerId, 'messages', peerData.messages.length);
                    return false;
                }
                break;
                
            case 'connection':
                peerData.connections.push(now);
                if (peerData.connections.length > this.rateLimits.connectionsPerMinute) {
                    this.handleRateLimitViolation(peerId, 'connections', peerData.connections.length);
                    return false;
                }
                break;
                
            case 'bytes':
                peerData.bytes += size;
                if (peerData.bytes > this.rateLimits.bytesPerMinute) {
                    this.handleRateLimitViolation(peerId, 'bytes', peerData.bytes);
                    return false;
                }
                break;
                
            case 'signalling':
                // Use message array for signalling too
                peerData.messages.push(now);
                if (peerData.messages.length > this.rateLimits.signallingPerMinute) {
                    this.handleRateLimitViolation(peerId, 'signalling', peerData.messages.length);
                    return false;
                }
                break;
        }
        
        return true;
    }
    
    handleRateLimitViolation(peerId, type, value) {
        console.warn(`[SecurityManager] Rate limit violation by ${peerId}: ${type} = ${value}`);
        
        this.recordSecurityEvent('rate_limit_violation', peerId, {
            type,
            value,
            limit: this.rateLimits[type + 'PerMinute'] || this.rateLimits[type]
        });
        
        this.addSuspiciousBehavior(peerId, `rate_limit_${type}`, 'Rate limit exceeded');
    }
    
    // Message validation
    validateMessage(message, senderId) {
        if (!this.isEnabled) {
            return { valid: true };
        }
        
        // Basic structure validation
        if (!message || typeof message !== 'object') {
            return { valid: false, reason: 'Invalid message structure' };
        }
        
        // Size validation
        const messageSize = JSON.stringify(message).length;
        if (messageSize > this.policies.maxMessageSize) {
            return { valid: false, reason: 'Message too large' };
        }
        
        // Type-specific validation
        const validator = this.messageValidators.get(message.type);
        if (validator) {
            const result = validator(message, senderId);
            if (!result.valid) {
                this.recordSecurityEvent('message_validation_failed', senderId, {
                    messageType: message.type,
                    reason: result.reason
                });
                return result;
            }
        }
        
        // Content sanitization
        const sanitized = this.sanitizeMessage(message);
        
        return { valid: true, sanitized };
    }
    
    sanitizeMessage(message) {
        // Deep clone to avoid modifying original
        const sanitized = JSON.parse(JSON.stringify(message));
        
        // Sanitize string fields
        this.sanitizeObject(sanitized);
        
        return sanitized;
    }
    
    sanitizeObject(obj) {
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                // Remove potentially dangerous content
                obj[key] = value
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
                    .replace(/javascript:/gi, '') // Remove javascript: URLs
                    .replace(/on\w+\s*=/gi, '') // Remove event handlers
                    .trim();
            } else if (typeof value === 'object' && value !== null) {
                this.sanitizeObject(value);
            }
        }
    }
    
    setupDefaultValidators() {
        // Chat message validator
        this.messageValidators.set('chat', (message, senderId) => {
            if (!message.content || typeof message.content !== 'string') {
                return { valid: false, reason: 'Missing or invalid content' };
            }
            
            if (message.content.length > 10000) {
                return { valid: false, reason: 'Message content too long' };
            }
            
            // Check for spam patterns
            if (this.isSpamMessage(message.content, senderId)) {
                return { valid: false, reason: 'Spam detected' };
            }
            
            return { valid: true };
        });
        
        // Signal message validator
        this.messageValidators.set('signal', (message, senderId) => {
            if (!message.signal || typeof message.signal !== 'object') {
                return { valid: false, reason: 'Missing or invalid signal data' };
            }
            
            if (!message.targetId) {
                return { valid: false, reason: 'Missing target ID' };
            }
            
            return { valid: true };
        });
        
        // CRDT sync validator
        this.messageValidators.set('crdt_sync', (message, senderId) => {
            if (!message.data || typeof message.data !== 'object') {
                return { valid: false, reason: 'Missing or invalid CRDT data' };
            }
            
            // Validate CRDT structure
            if (!message.data.nodeId || !message.data.vectorClock) {
                return { valid: false, reason: 'Invalid CRDT structure' };
            }
            
            return { valid: true };
        });
    }
    
    addMessageValidator(messageType, validator) {
        this.messageValidators.set(messageType, validator);
    }
    
    // Spam detection
    isSpamMessage(content, senderId) {
        // Check for repeated messages
        const peerBehavior = this.peerBehavior.get(senderId);
        if (peerBehavior && peerBehavior.recentMessages) {
            const recentMessages = peerBehavior.recentMessages;
            const duplicateCount = recentMessages.filter(msg => msg === content).length;
            
            if (duplicateCount > 3) {
                return true;
            }
        }
        
        // Check for common spam patterns
        const spamPatterns = [
            /(.)\1{10,}/, // Repeated characters
            /https?:\/\/[^\s]+/gi, // Multiple URLs
            /\b(buy|sell|cheap|free|money|cash|prize|winner)\b/gi // Spam keywords
        ];
        
        for (const pattern of spamPatterns) {
            if (pattern.test(content)) {
                return true;
            }
        }
        
        return false;
    }
    
    // Peer reputation system
    updatePeerReputation(peerId, action, value = 0) {
        let reputation = this.peerReputations.get(peerId) || 50; // Start with neutral reputation
        
        switch (action) {
            case 'successful_connection':
                reputation = Math.min(100, reputation + 1);
                break;
            case 'failed_connection':
                reputation = Math.max(0, reputation - 2);
                break;
            case 'valid_message':
                reputation = Math.min(100, reputation + 0.1);
                break;
            case 'invalid_message':
                reputation = Math.max(0, reputation - 5);
                break;
            case 'rate_limit_violation':
                reputation = Math.max(0, reputation - 10);
                break;
            case 'spam_detected':
                reputation = Math.max(0, reputation - 20);
                break;
            case 'helpful_behavior':
                reputation = Math.min(100, reputation + value);
                break;
            case 'malicious_behavior':
                reputation = Math.max(0, reputation - value);
                break;
        }
        
        this.peerReputations.set(peerId, reputation);
        
        // Block peer if reputation is too low
        if (reputation < 10) {
            this.blockPeer(peerId, 'Low reputation score');
        }
        
        return reputation;
    }
    
    getPeerReputation(peerId) {
        return this.peerReputations.get(peerId) || 50;
    }
    
    updatePeerReputations() {
        // Gradually improve reputation over time for good behavior
        this.peerReputations.forEach((reputation, peerId) => {
            if (reputation < 50 && !this.blockedPeers.has(peerId)) {
                // Slowly recover reputation
                this.peerReputations.set(peerId, Math.min(50, reputation + 0.5));
            }
        });
    }
    
    // Suspicious behavior tracking
    addSuspiciousBehavior(peerId, type, reason) {
        let suspiciousData = this.suspiciousPeers.get(peerId);
        
        if (!suspiciousData) {
            suspiciousData = {
                strikes: 0,
                behaviors: [],
                firstSeen: Date.now()
            };
        }
        
        suspiciousData.strikes++;
        suspiciousData.behaviors.push({
            type,
            reason,
            timestamp: Date.now()
        });
        
        this.suspiciousPeers.set(peerId, suspiciousData);
        
        // Block peer if too many strikes
        if (suspiciousData.strikes >= 5) {
            this.blockPeer(peerId, `Multiple suspicious behaviors: ${reason}`);
        }
        
        this.recordSecurityEvent('suspicious_behavior', peerId, { type, reason });
    }
    
    // Peer blocking
    blockPeer(peerId, reason) {
        this.blockedPeers.add(peerId);
        
        console.warn(`[SecurityManager] Blocked peer ${peerId}: ${reason}`);
        
        this.recordSecurityEvent('peer_blocked', peerId, { reason });
        
        if (this.onPeerBlocked) {
            this.onPeerBlocked(peerId, reason);
        }
    }
    
    unblockPeer(peerId) {
        this.blockedPeers.delete(peerId);
        this.suspiciousPeers.delete(peerId);
        
        this.recordSecurityEvent('peer_unblocked', peerId, {});
    }
    
    isPeerBlocked(peerId) {
        return this.blockedPeers.has(peerId);
    }
    
    isWhitelisted(peerId) {
        // Add whitelist logic here if needed
        return false;
    }
    
    // Attack detection
    detectAttack(metrics) {
        const attacks = [];
        
        // DDoS detection
        if (this.detectDDoS(metrics)) {
            attacks.push({
                type: 'ddos',
                severity: 'high',
                description: 'Distributed Denial of Service attack detected'
            });
        }
        
        // Message flooding
        if (this.detectMessageFlooding(metrics)) {
            attacks.push({
                type: 'message_flooding',
                severity: 'medium',
                description: 'Message flooding attack detected'
            });
        }
        
        // Connection flooding
        if (this.detectConnectionFlooding(metrics)) {
            attacks.push({
                type: 'connection_flooding',
                severity: 'medium',
                description: 'Connection flooding attack detected'
            });
        }
        
        // Anomaly detection
        const anomalies = this.detectAnomalies(metrics);
        attacks.push(...anomalies);
        
        // Report attacks
        attacks.forEach(attack => {
            this.recordSecurityEvent('attack_detected', null, attack);
            
            if (this.onAttackDetected) {
                this.onAttackDetected(attack);
            }
        });
        
        return attacks;
    }
    
    detectDDoS(metrics) {
        // Simple DDoS detection based on connection rate
        const connectionRate = metrics.connectionsPerSecond || 0;
        const messageRate = metrics.messagesPerSecond || 0;
        
        return connectionRate > 100 || messageRate > 10000;
    }
    
    detectMessageFlooding(metrics) {
        const messageRate = metrics.messagesPerSecond || 0;
        const baseline = this.anomalyDetection.baselineMetrics.get('messagesPerSecond') || 100;
        
        return messageRate > baseline * this.anomalyDetection.alertThresholds.messageSpike;
    }
    
    detectConnectionFlooding(metrics) {
        const connectionRate = metrics.connectionsPerSecond || 0;
        const baseline = this.anomalyDetection.baselineMetrics.get('connectionsPerSecond') || 10;
        
        return connectionRate > baseline * this.anomalyDetection.alertThresholds.connectionSpike;
    }
    
    detectAnomalies(metrics) {
        const anomalies = [];
        
        for (const [metric, value] of Object.entries(metrics)) {
            const baseline = this.anomalyDetection.baselineMetrics.get(metric);
            const threshold = this.anomalyDetection.alertThresholds[metric + 'Spike'];
            
            if (baseline && threshold && value > baseline * threshold) {
                anomalies.push({
                    type: 'anomaly',
                    severity: 'low',
                    description: `Anomalous ${metric} detected`,
                    metric,
                    value,
                    baseline,
                    threshold
                });
            }
        }
        
        return anomalies;
    }
    
    updateAnomalyBaseline() {
        // Update baseline metrics based on recent normal behavior
        const recentMetrics = this.anomalyDetection.currentMetrics;
        
        recentMetrics.forEach((values, metric) => {
            if (values.length > 0) {
                const average = values.reduce((sum, val) => sum + val, 0) / values.length;
                this.anomalyDetection.baselineMetrics.set(metric, average);
            }
        });
        
        // Clear current metrics
        this.anomalyDetection.currentMetrics.clear();
    }
    
    recordMetric(metric, value) {
        if (!this.anomalyDetection.currentMetrics.has(metric)) {
            this.anomalyDetection.currentMetrics.set(metric, []);
        }
        
        const values = this.anomalyDetection.currentMetrics.get(metric);
        values.push(value);
        
        // Keep only recent values
        if (values.length > 100) {
            values.splice(0, values.length - 100);
        }
    }
    
    analyzeAttackPatterns() {
        // Analyze patterns in security events to identify coordinated attacks
        const recentEvents = this.getRecentSecurityEvents(300000); // Last 5 minutes
        
        // Group events by type and source
        const eventGroups = new Map();
        
        recentEvents.forEach(event => {
            const key = `${event.type}_${event.peerId || 'unknown'}`;
            if (!eventGroups.has(key)) {
                eventGroups.set(key, []);
            }
            eventGroups.get(key).push(event);
        });
        
        // Look for suspicious patterns
        eventGroups.forEach((events, key) => {
            if (events.length > 10) { // More than 10 events of same type from same peer
                const [type, peerId] = key.split('_');
                this.addSuspiciousBehavior(peerId, 'pattern_attack', `Repeated ${type} events`);
            }
        });
    }
    
    // Encryption and sessions
    createSession(peerId, encrypted = false) {
        const sessionId = this.generateSessionId();
        const session = {
            peerId,
            created: Date.now(),
            lastActivity: Date.now(),
            encrypted
        };
        
        this.sessions.set(sessionId, session);
        
        if (encrypted) {
            // Generate encryption keys for this session
            this.generateEncryptionKeys(peerId);
        }
        
        return sessionId;
    }
    
    updateSessionActivity(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivity = Date.now();
        }
    }
    
    validateSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }
        
        // Check if session has expired
        if (Date.now() - session.lastActivity > this.policies.sessionTimeout) {
            this.sessions.delete(sessionId);
            return false;
        }
        
        return true;
    }
    
    cleanupExpiredSessions() {
        const now = Date.now();
        const expiredSessions = [];
        
        this.sessions.forEach((session, sessionId) => {
            if (now - session.lastActivity > this.policies.sessionTimeout) {
                expiredSessions.push(sessionId);
            }
        });
        
        expiredSessions.forEach(sessionId => {
            this.sessions.delete(sessionId);
        });
        
        if (expiredSessions.length > 0) {
            console.log(`[SecurityManager] Cleaned up ${expiredSessions.length} expired sessions`);
        }
    }
    
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    generateEncryptionKeys(peerId) {
        // In a real implementation, use proper cryptographic libraries
        // This is a simplified example
        const keyPair = {
            publicKey: `pub_${peerId}_${Date.now()}`,
            privateKey: `priv_${peerId}_${Date.now()}`,
            sharedSecret: `shared_${peerId}_${Date.now()}`
        };
        
        this.encryptionKeys.set(peerId, keyPair);
        return keyPair;
    }
    
    // Security events
    recordSecurityEvent(type, peerId, data) {
        const event = {
            type,
            peerId,
            data,
            timestamp: Date.now(),
            nodeId: this.nodeId
        };
        
        // Store event (in a real implementation, use persistent storage)
        console.log(`[SecurityManager] Security event: ${type}`, event);
        
        if (this.onSecurityEvent) {
            this.onSecurityEvent(event);
        }
    }
    
    getRecentSecurityEvents(duration = 3600000) {
        // In a real implementation, retrieve from persistent storage
        // This is a placeholder
        return [];
    }
    
    // Cleanup and maintenance
    cleanupRateLimitData() {
        const now = Date.now();
        const cutoff = now - 60000; // 1 minute ago
        
        this.rateLimitData.forEach((data, peerId) => {
            // Clean up old entries
            data.messages = data.messages.filter(timestamp => timestamp > cutoff);
            data.connections = data.connections.filter(timestamp => timestamp > cutoff);
            
            if (now - data.lastReset > 60000) {
                data.bytes = 0;
                data.lastReset = now;
            }
            
            // Remove empty entries
            if (data.messages.length === 0 && data.connections.length === 0 && data.bytes === 0) {
                this.rateLimitData.delete(peerId);
            }
        });
    }
    
    // Configuration and status
    updateConfiguration(newConfig) {
        this.rateLimits = { ...this.rateLimits, ...newConfig.rateLimits };
        this.policies = { ...this.policies, ...newConfig.policies };
        
        if (newConfig.alertThresholds) {
            this.anomalyDetection.alertThresholds = {
                ...this.anomalyDetection.alertThresholds,
                ...newConfig.alertThresholds
            };
        }
    }
    
    getSecurityStatus() {
        return {
            enabled: this.isEnabled,
            blockedPeers: this.blockedPeers.size,
            suspiciousPeers: this.suspiciousPeers.size,
            activeSessions: this.sessions.size,
            rateLimitViolations: Array.from(this.rateLimitData.values())
                .reduce((sum, data) => sum + (data.violations || 0), 0),
            averageReputation: this.calculateAverageReputation(),
            policies: this.policies,
            rateLimits: this.rateLimits
        };
    }
    
    calculateAverageReputation() {
        if (this.peerReputations.size === 0) return 50;
        
        const total = Array.from(this.peerReputations.values())
            .reduce((sum, rep) => sum + rep, 0);
        
        return total / this.peerReputations.size;
    }
    
    // Export security data
    exportSecurityData() {
        return {
            nodeId: this.nodeId,
            blockedPeers: Array.from(this.blockedPeers),
            suspiciousPeers: Object.fromEntries(this.suspiciousPeers),
            peerReputations: Object.fromEntries(this.peerReputations),
            policies: this.policies,
            rateLimits: this.rateLimits,
            exportTime: Date.now()
        };
    }
    
    // Reset security state
    reset() {
        this.rateLimitData.clear();
        this.peerReputations.clear();
        this.peerBehavior.clear();
        this.blockedPeers.clear();
        this.suspiciousPeers.clear();
        this.sessions.clear();
        this.encryptionKeys.clear();
        this.anomalyDetection.baselineMetrics.clear();
        this.anomalyDetection.currentMetrics.clear();
    }
}

