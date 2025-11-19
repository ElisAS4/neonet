/**
 * DApp Registry and Discovery System for NeoNet
 * Provides decentralized discovery, installation, and management of dApps
 * 
 * Features:
 * - Decentralized dApp registry using CRDTs
 * - Peer-to-peer dApp distribution
 * - Version management and updates
 * - Security verification and signatures
 * - Installation and dependency management
 * - Rating and review system
 */

import { CRDTManager } from '../utils/CRDTManager.js';
import { SecurityManager } from '../utils/SecurityManager.js';

export class DAppRegistry {
    constructor(neoNetSDK) {
        this.sdk = neoNetSDK;
        this.nodeId = neoNetSDK.getNodeId();
        
        // Registry storage
        this.registryData = null; // CRDT-based registry
        this.installedDApps = new Map(); // dappId -> installation info
        this.availableDApps = new Map(); // dappId -> dapp metadata
        this.downloadCache = new Map(); // dappId -> cached content
        
        // Security
        this.securityManager = new SecurityManager();
        this.trustedPublishers = new Set();
        this.blockedDApps = new Set();
        
        // Installation management
        this.installationQueue = [];
        this.isInstalling = false;
        this.maxConcurrentInstalls = 3;
        
        // Event handlers
        this.onDAppDiscovered = null;
        this.onDAppInstalled = null;
        this.onDAppUninstalled = null;
        this.onDAppUpdated = null;
        this.onInstallProgress = null;
        this.onError = null;
        
        // Configuration
        this.config = {
            registryId: 'neonet_dapp_registry',
            maxDAppSize: 50 * 1024 * 1024, // 50MB
            allowUnsignedDApps: false,
            autoUpdate: true,
            updateCheckInterval: 24 * 60 * 60 * 1000, // 24 hours
            maxInstallTime: 5 * 60 * 1000, // 5 minutes
            enablePeerDistribution: true
        };
        
        this.initialize();
    }
    
    async initialize() {
        try {
            // Initialize registry CRDT
            this.registryData = this.sdk.apis.data.createMap(this.config.registryId, {});
            
            // Load installed dApps from storage
            await this.loadInstalledDApps();
            
            // Subscribe to registry updates
            this.sdk.on('data:changed', (data) => {
                if (data[this.config.registryId]) {
                    this.handleRegistryUpdate(data[this.config.registryId]);
                }
            });
            
            // Start periodic tasks
            this.startPeriodicTasks();
            
            console.log('[DAppRegistry] Initialized successfully');
            
        } catch (error) {
            console.error('[DAppRegistry] Initialization failed:', error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }
    
    startPeriodicTasks() {
        // Periodic update checks
        if (this.config.autoUpdate) {
            setInterval(() => {
                this.checkForUpdates();
            }, this.config.updateCheckInterval);
        }
        
        // Cleanup old cache entries
        setInterval(() => {
            this.cleanupCache();
        }, 60 * 60 * 1000); // Every hour
    }
    
    // DApp discovery
    async discoverDApps(filters = {}) {
        try {
            // Get registry data
            const registryData = this.sdk.apis.data.getData(this.config.registryId) || {};
            
            // Filter dApps based on criteria
            const discovered = [];
            
            for (const [dappId, dappInfo] of Object.entries(registryData)) {
                if (this.matchesFilters(dappInfo, filters)) {
                    discovered.push({
                        id: dappId,
                        ...dappInfo,
                        isInstalled: this.installedDApps.has(dappId),
                        isBlocked: this.blockedDApps.has(dappId)
                    });
                }
            }
            
            // Sort by relevance/rating
            discovered.sort((a, b) => {
                return (b.rating || 0) - (a.rating || 0);
            });
            
            // Update available dApps
            discovered.forEach(dapp => {
                this.availableDApps.set(dapp.id, dapp);
            });
            
            return discovered;
            
        } catch (error) {
            console.error('[DAppRegistry] Discovery failed:', error);
            throw error;
        }
    }
    
    matchesFilters(dappInfo, filters) {
        // Category filter
        if (filters.category && dappInfo.category !== filters.category) {
            return false;
        }
        
        // Search query
        if (filters.query) {
            const query = filters.query.toLowerCase();
            const searchText = `${dappInfo.name} ${dappInfo.description} ${dappInfo.tags?.join(' ') || ''}`.toLowerCase();
            if (!searchText.includes(query)) {
                return false;
            }
        }
        
        // Minimum rating
        if (filters.minRating && (dappInfo.rating || 0) < filters.minRating) {
            return false;
        }
        
        // Publisher filter
        if (filters.publisher && dappInfo.publisher !== filters.publisher) {
            return false;
        }
        
        // Version compatibility
        if (filters.minVersion && !this.isVersionCompatible(dappInfo.version, filters.minVersion)) {
            return false;
        }
        
        return true;
    }
    
    // DApp publishing
    async publishDApp(dappInfo, dappContent) {
        try {
            // Validate dApp info
            this.validateDAppInfo(dappInfo);
            
            // Validate content
            await this.validateDAppContent(dappContent);
            
            // Generate dApp ID
            const dappId = this.generateDAppId(dappInfo);
            
            // Create manifest
            const manifest = {
                id: dappId,
                name: dappInfo.name,
                version: dappInfo.version,
                description: dappInfo.description,
                author: dappInfo.author,
                publisher: this.nodeId,
                category: dappInfo.category || 'utility',
                tags: dappInfo.tags || [],
                permissions: dappInfo.permissions || [],
                dependencies: dappInfo.dependencies || [],
                size: dappContent.length,
                contentHash: await this.calculateHash(dappContent),
                publishedAt: Date.now(),
                updatedAt: Date.now(),
                rating: 0,
                downloads: 0,
                reviews: [],
                signature: null
            };
            
            // Sign the manifest
            manifest.signature = await this.signManifest(manifest);
            
            // Store in registry
            const currentRegistry = this.sdk.apis.data.getData(this.config.registryId) || {};
            currentRegistry[dappId] = manifest;
            
            // Update registry CRDT
            this.registryData.set(dappId, manifest);
            
            // Store content for distribution
            await this.storeDAppContent(dappId, dappContent);
            
            console.log(`[DAppRegistry] Published dApp: ${dappInfo.name} (${dappId})`);
            
            return dappId;
            
        } catch (error) {
            console.error('[DAppRegistry] Publishing failed:', error);
            throw error;
        }
    }
    
    validateDAppInfo(dappInfo) {
        const required = ['name', 'version', 'description', 'author'];
        
        for (const field of required) {
            if (!dappInfo[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        // Validate version format
        if (!/^\d+\.\d+\.\d+$/.test(dappInfo.version)) {
            throw new Error('Invalid version format. Use semantic versioning (x.y.z)');
        }
        
        // Validate name
        if (dappInfo.name.length < 3 || dappInfo.name.length > 50) {
            throw new Error('dApp name must be between 3 and 50 characters');
        }
        
        // Validate permissions
        if (dappInfo.permissions) {
            const validPermissions = ['network', 'storage', 'ui', 'camera', 'microphone', 'location'];
            for (const permission of dappInfo.permissions) {
                if (!validPermissions.includes(permission)) {
                    throw new Error(`Invalid permission: ${permission}`);
                }
            }
        }
    }
    
    async validateDAppContent(content) {
        // Check size
        if (content.length > this.config.maxDAppSize) {
            throw new Error(`dApp size exceeds limit: ${content.length} > ${this.config.maxDAppSize}`);
        }
        
        // Basic security scan
        const securityIssues = this.scanForSecurityIssues(content);
        if (securityIssues.length > 0) {
            throw new Error(`Security issues found: ${securityIssues.join(', ')}`);
        }
        
        // Validate HTML structure
        if (!this.isValidHTML(content)) {
            throw new Error('Invalid HTML structure');
        }
    }
    
    scanForSecurityIssues(content) {
        const issues = [];
        const contentStr = typeof content === 'string' ? content : content.toString();
        
        // Check for dangerous patterns
        const dangerousPatterns = [
            /<script[^>]*src\s*=\s*["'][^"']*["'][^>]*>/gi, // External scripts
            /eval\s*\(/gi, // eval() calls
            /Function\s*\(/gi, // Function constructor
            /document\.write/gi, // document.write
            /innerHTML\s*=/gi, // innerHTML assignments
            /outerHTML\s*=/gi, // outerHTML assignments
        ];
        
        for (const pattern of dangerousPatterns) {
            if (pattern.test(contentStr)) {
                issues.push(`Potentially dangerous pattern: ${pattern.source}`);
            }
        }
        
        return issues;
    }
    
    isValidHTML(content) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            
            // Check for parser errors
            const errors = doc.querySelectorAll('parsererror');
            return errors.length === 0;
            
        } catch (error) {
            return false;
        }
    }
    
    // DApp installation
    async installDApp(dappId, options = {}) {
        try {
            // Check if already installed
            if (this.installedDApps.has(dappId)) {
                throw new Error('dApp is already installed');
            }
            
            // Check if blocked
            if (this.blockedDApps.has(dappId)) {
                throw new Error('dApp is blocked');
            }
            
            // Get dApp info
            const dappInfo = this.availableDApps.get(dappId);
            if (!dappInfo) {
                throw new Error('dApp not found in registry');
            }
            
            // Verify security
            await this.verifyDAppSecurity(dappInfo);
            
            // Add to installation queue
            return new Promise((resolve, reject) => {
                this.installationQueue.push({
                    dappId,
                    dappInfo,
                    options,
                    resolve,
                    reject,
                    startTime: Date.now()
                });
                
                this.processInstallationQueue();
            });
            
        } catch (error) {
            console.error(`[DAppRegistry] Installation failed for ${dappId}:`, error);
            throw error;
        }
    }
    
    async processInstallationQueue() {
        if (this.isInstalling || this.installationQueue.length === 0) {
            return;
        }
        
        this.isInstalling = true;
        
        try {
            const installation = this.installationQueue.shift();
            await this.performInstallation(installation);
            
        } catch (error) {
            console.error('[DAppRegistry] Installation processing failed:', error);
        } finally {
            this.isInstalling = false;
            
            // Process next in queue
            if (this.installationQueue.length > 0) {
                setTimeout(() => this.processInstallationQueue(), 100);
            }
        }
    }
    
    async performInstallation(installation) {
        const { dappId, dappInfo, options, resolve, reject } = installation;
        
        try {
            // Notify start
            if (this.onInstallProgress) {
                this.onInstallProgress(dappId, 'starting', 0);
            }
            
            // Download dApp content
            if (this.onInstallProgress) {
                this.onInstallProgress(dappId, 'downloading', 25);
            }
            
            const content = await this.downloadDAppContent(dappId, dappInfo);
            
            // Verify content integrity
            if (this.onInstallProgress) {
                this.onInstallProgress(dappId, 'verifying', 50);
            }
            
            await this.verifyContentIntegrity(content, dappInfo);
            
            // Install dependencies
            if (this.onInstallProgress) {
                this.onInstallProgress(dappId, 'dependencies', 75);
            }
            
            await this.installDependencies(dappInfo.dependencies || []);
            
            // Complete installation
            if (this.onInstallProgress) {
                this.onInstallProgress(dappId, 'finalizing', 90);
            }
            
            const installInfo = {
                dappId,
                dappInfo,
                content,
                installedAt: Date.now(),
                version: dappInfo.version,
                size: content.length,
                permissions: dappInfo.permissions || [],
                options
            };
            
            // Store installation info
            this.installedDApps.set(dappId, installInfo);
            await this.saveInstalledDApps();
            
            // Cache content
            this.downloadCache.set(dappId, content);
            
            // Notify completion
            if (this.onInstallProgress) {
                this.onInstallProgress(dappId, 'completed', 100);
            }
            
            if (this.onDAppInstalled) {
                this.onDAppInstalled(dappId, installInfo);
            }
            
            console.log(`[DAppRegistry] Successfully installed ${dappInfo.name}`);
            resolve(installInfo);
            
        } catch (error) {
            console.error(`[DAppRegistry] Installation failed for ${dappId}:`, error);
            
            if (this.onInstallProgress) {
                this.onInstallProgress(dappId, 'failed', 0);
            }
            
            reject(error);
        }
    }
    
    async downloadDAppContent(dappId, dappInfo) {
        // Check cache first
        if (this.downloadCache.has(dappId)) {
            return this.downloadCache.get(dappId);
        }
        
        // Try to download from peers
        if (this.config.enablePeerDistribution) {
            const content = await this.downloadFromPeers(dappId, dappInfo);
            if (content) {
                return content;
            }
        }
        
        // Fallback to original source
        if (dappInfo.downloadUrl) {
            const response = await fetch(dappInfo.downloadUrl);
            if (!response.ok) {
                throw new Error(`Download failed: ${response.statusText}`);
            }
            return await response.text();
        }
        
        throw new Error('No download source available');
    }
    
    async downloadFromPeers(dappId, dappInfo) {
        const peers = this.sdk.getConnectedPeers();
        
        for (const peer of peers) {
            try {
                // Request dApp content from peer
                const response = await this.sdk.apis.p2p.sendMessage(peer.nodeId, {
                    type: 'dapp_content_request',
                    dappId: dappId,
                    contentHash: dappInfo.contentHash
                });
                
                if (response && response.content) {
                    // Verify hash
                    const hash = await this.calculateHash(response.content);
                    if (hash === dappInfo.contentHash) {
                        return response.content;
                    }
                }
                
            } catch (error) {
                console.warn(`[DAppRegistry] Failed to download from peer ${peer.nodeId}:`, error);
            }
        }
        
        return null;
    }
    
    async verifyDAppSecurity(dappInfo) {
        // Check signature if required
        if (!this.config.allowUnsignedDApps && !dappInfo.signature) {
            throw new Error('Unsigned dApps are not allowed');
        }
        
        // Verify signature
        if (dappInfo.signature) {
            const isValid = await this.verifySignature(dappInfo, dappInfo.signature);
            if (!isValid) {
                throw new Error('Invalid dApp signature');
            }
        }
        
        // Check trusted publishers
        if (this.trustedPublishers.size > 0 && !this.trustedPublishers.has(dappInfo.publisher)) {
            throw new Error('Publisher is not trusted');
        }
        
        // Check permissions
        const dangerousPermissions = ['camera', 'microphone', 'location'];
        const requestedDangerous = (dappInfo.permissions || []).filter(p => dangerousPermissions.includes(p));
        
        if (requestedDangerous.length > 0) {
            console.warn(`[DAppRegistry] dApp requests dangerous permissions: ${requestedDangerous.join(', ')}`);
        }
    }
    
    async verifyContentIntegrity(content, dappInfo) {
        const hash = await this.calculateHash(content);
        
        if (hash !== dappInfo.contentHash) {
            throw new Error('Content integrity check failed');
        }
    }
    
    async installDependencies(dependencies) {
        for (const dependency of dependencies) {
            if (!this.installedDApps.has(dependency.id)) {
                // Auto-install dependency
                await this.installDApp(dependency.id, { isDependency: true });
            }
        }
    }
    
    // DApp uninstallation
    async uninstallDApp(dappId, options = {}) {
        try {
            const installInfo = this.installedDApps.get(dappId);
            if (!installInfo) {
                throw new Error('dApp is not installed');
            }
            
            // Check for dependents
            if (!options.force) {
                const dependents = this.findDependents(dappId);
                if (dependents.length > 0) {
                    throw new Error(`Cannot uninstall: ${dependents.length} dApps depend on this`);
                }
            }
            
            // Remove from installed dApps
            this.installedDApps.delete(dappId);
            await this.saveInstalledDApps();
            
            // Clear cache
            this.downloadCache.delete(dappId);
            
            if (this.onDAppUninstalled) {
                this.onDAppUninstalled(dappId, installInfo);
            }
            
            console.log(`[DAppRegistry] Uninstalled ${installInfo.dappInfo.name}`);
            
        } catch (error) {
            console.error(`[DAppRegistry] Uninstallation failed for ${dappId}:`, error);
            throw error;
        }
    }
    
    findDependents(dappId) {
        const dependents = [];
        
        for (const [installedId, installInfo] of this.installedDApps) {
            const dependencies = installInfo.dappInfo.dependencies || [];
            if (dependencies.some(dep => dep.id === dappId)) {
                dependents.push(installedId);
            }
        }
        
        return dependents;
    }
    
    // Update management
    async checkForUpdates() {
        const updates = [];
        
        for (const [dappId, installInfo] of this.installedDApps) {
            const availableInfo = this.availableDApps.get(dappId);
            
            if (availableInfo && this.isNewerVersion(availableInfo.version, installInfo.version)) {
                updates.push({
                    dappId,
                    currentVersion: installInfo.version,
                    availableVersion: availableInfo.version,
                    dappInfo: availableInfo
                });
            }
        }
        
        return updates;
    }
    
    async updateDApp(dappId) {
        try {
            const installInfo = this.installedDApps.get(dappId);
            if (!installInfo) {
                throw new Error('dApp is not installed');
            }
            
            const availableInfo = this.availableDApps.get(dappId);
            if (!availableInfo) {
                throw new Error('Update not available');
            }
            
            if (!this.isNewerVersion(availableInfo.version, installInfo.version)) {
                throw new Error('No newer version available');
            }
            
            // Backup current installation
            const backup = { ...installInfo };
            
            try {
                // Uninstall current version
                await this.uninstallDApp(dappId, { force: true });
                
                // Install new version
                await this.installDApp(dappId);
                
                if (this.onDAppUpdated) {
                    this.onDAppUpdated(dappId, backup.version, availableInfo.version);
                }
                
                console.log(`[DAppRegistry] Updated ${availableInfo.name} from ${backup.version} to ${availableInfo.version}`);
                
            } catch (error) {
                // Restore backup on failure
                this.installedDApps.set(dappId, backup);
                await this.saveInstalledDApps();
                throw error;
            }
            
        } catch (error) {
            console.error(`[DAppRegistry] Update failed for ${dappId}:`, error);
            throw error;
        }
    }
    
    // Utility methods
    generateDAppId(dappInfo) {
        const base = `${dappInfo.name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${dappInfo.author.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        return `${base}_${Date.now()}`;
    }
    
    async calculateHash(content) {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    async signManifest(manifest) {
        // Simplified signing - in production, use proper cryptographic signing
        const content = JSON.stringify(manifest, null, 0);
        return await this.calculateHash(content + this.nodeId);
    }
    
    async verifySignature(manifest, signature) {
        // Simplified verification - in production, use proper cryptographic verification
        const content = JSON.stringify({ ...manifest, signature: null }, null, 0);
        const expectedSignature = await this.calculateHash(content + manifest.publisher);
        return signature === expectedSignature;
    }
    
    isVersionCompatible(version, minVersion) {
        const parseVersion = (v) => v.split('.').map(Number);
        const ver = parseVersion(version);
        const min = parseVersion(minVersion);
        
        for (let i = 0; i < 3; i++) {
            if (ver[i] > min[i]) return true;
            if (ver[i] < min[i]) return false;
        }
        
        return true; // Equal versions are compatible
    }
    
    isNewerVersion(version, currentVersion) {
        const parseVersion = (v) => v.split('.').map(Number);
        const ver = parseVersion(version);
        const cur = parseVersion(currentVersion);
        
        for (let i = 0; i < 3; i++) {
            if (ver[i] > cur[i]) return true;
            if (ver[i] < cur[i]) return false;
        }
        
        return false; // Equal versions
    }
    
    // Storage management
    async loadInstalledDApps() {
        try {
            const stored = this.sdk.apis.storage.getItem('installed_dapps');
            if (stored) {
                for (const [dappId, installInfo] of Object.entries(stored)) {
                    this.installedDApps.set(dappId, installInfo);
                }
            }
        } catch (error) {
            console.error('[DAppRegistry] Failed to load installed dApps:', error);
        }
    }
    
    async saveInstalledDApps() {
        try {
            const data = Object.fromEntries(this.installedDApps);
            this.sdk.apis.storage.setItem('installed_dapps', data);
        } catch (error) {
            console.error('[DAppRegistry] Failed to save installed dApps:', error);
        }
    }
    
    async storeDAppContent(dappId, content) {
        // Store content for peer distribution
        this.downloadCache.set(dappId, content);
        
        // Also store in persistent storage if needed
        try {
            this.sdk.apis.storage.setItem(`dapp_content_${dappId}`, content);
        } catch (error) {
            console.warn(`[DAppRegistry] Failed to store content for ${dappId}:`, error);
        }
    }
    
    cleanupCache() {
        const maxCacheSize = 10; // Keep only 10 dApps in cache
        const cacheEntries = Array.from(this.downloadCache.entries());
        
        if (cacheEntries.length > maxCacheSize) {
            // Remove oldest entries
            const toRemove = cacheEntries.slice(0, cacheEntries.length - maxCacheSize);
            toRemove.forEach(([dappId]) => {
                this.downloadCache.delete(dappId);
            });
        }
    }
    
    handleRegistryUpdate(registryData) {
        // Process new dApps
        for (const [dappId, dappInfo] of Object.entries(registryData)) {
            if (!this.availableDApps.has(dappId)) {
                this.availableDApps.set(dappId, dappInfo);
                
                if (this.onDAppDiscovered) {
                    this.onDAppDiscovered(dappId, dappInfo);
                }
            }
        }
    }
    
    // Public API
    getInstalledDApps() {
        return Array.from(this.installedDApps.values());
    }
    
    getAvailableDApps() {
        return Array.from(this.availableDApps.values());
    }
    
    getDAppInfo(dappId) {
        return this.installedDApps.get(dappId) || this.availableDApps.get(dappId);
    }
    
    isInstalled(dappId) {
        return this.installedDApps.has(dappId);
    }
    
    getInstallationStatus() {
        return {
            isInstalling: this.isInstalling,
            queueLength: this.installationQueue.length,
            installedCount: this.installedDApps.size,
            availableCount: this.availableDApps.size
        };
    }
    
    // Trust and security management
    addTrustedPublisher(publisherId) {
        this.trustedPublishers.add(publisherId);
    }
    
    removeTrustedPublisher(publisherId) {
        this.trustedPublishers.delete(publisherId);
    }
    
    blockDApp(dappId, reason) {
        this.blockedDApps.add(dappId);
        console.log(`[DAppRegistry] Blocked dApp ${dappId}: ${reason}`);
    }
    
    unblockDApp(dappId) {
        this.blockedDApps.delete(dappId);
    }
    
    // Configuration
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
    
    getConfig() {
        return { ...this.config };
    }
}

