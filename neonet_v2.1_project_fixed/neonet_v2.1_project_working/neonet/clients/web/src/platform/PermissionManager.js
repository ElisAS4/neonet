/**
 * Permission Manager for NeoNet Platform
 * Provides comprehensive permission and access control system for dApps
 * 
 * Features:
 * - Granular permission system
 * - Role-based access control (RBAC)
 * - Dynamic permission granting/revocation
 * - Permission inheritance and delegation
 * - Audit logging and compliance
 * - Temporary and conditional permissions
 */

export class PermissionManager {
    constructor(neoNetSDK) {
        this.sdk = neoNetSDK;
        this.nodeId = neoNetSDK.getNodeId();
        
        // Permission storage
        this.dappPermissions = new Map(); // dappId -> Set of permissions
        this.userPermissions = new Map(); // userId -> Set of permissions
        this.rolePermissions = new Map(); // roleId -> Set of permissions
        this.userRoles = new Map(); // userId -> Set of roles
        this.dappRoles = new Map(); // dappId -> Set of roles
        
        // Permission definitions
        this.permissionDefinitions = new Map();
        this.permissionGroups = new Map();
        
        // Temporary permissions
        this.temporaryPermissions = new Map(); // permissionId -> { expiry, conditions }
        
        // Delegation system
        this.delegatedPermissions = new Map(); // delegatorId -> delegateeId -> Set of permissions
        
        // Audit logging
        this.auditLog = [];
        this.maxAuditLogSize = 10000;
        
        // Event handlers
        this.onPermissionGranted = null;
        this.onPermissionRevoked = null;
        this.onPermissionDenied = null;
        this.onAuditEvent = null;
        
        // Configuration
        this.config = {
            enableAuditLogging: true,
            enablePermissionInheritance: true,
            enableDelegation: true,
            defaultPermissionTTL: 24 * 60 * 60 * 1000, // 24 hours
            maxDelegationDepth: 3,
            requireExplicitGrant: true
        };
        
        this.initializePermissionSystem();
    }
    
    initializePermissionSystem() {
        // Define standard permissions
        this.defineStandardPermissions();
        
        // Define standard roles
        this.defineStandardRoles();
        
        // Start cleanup tasks
        this.startCleanupTasks();
        
        console.log('[PermissionManager] Initialized successfully');
    }
    
    defineStandardPermissions() {
        // Network permissions
        this.definePermission('network.connect', {
            description: 'Connect to other peers',
            category: 'network',
            riskLevel: 'medium',
            userConsent: true
        });
        
        this.definePermission('network.broadcast', {
            description: 'Broadcast messages to all peers',
            category: 'network',
            riskLevel: 'medium',
            userConsent: true
        });
        
        this.definePermission('network.listen', {
            description: 'Listen for incoming connections',
            category: 'network',
            riskLevel: 'low',
            userConsent: false
        });
        
        // Data permissions
        this.definePermission('data.read', {
            description: 'Read shared data',
            category: 'data',
            riskLevel: 'low',
            userConsent: false
        });
        
        this.definePermission('data.write', {
            description: 'Write and modify shared data',
            category: 'data',
            riskLevel: 'medium',
            userConsent: true
        });
        
        this.definePermission('data.delete', {
            description: 'Delete shared data',
            category: 'data',
            riskLevel: 'high',
            userConsent: true
        });
        
        // Storage permissions
        this.definePermission('storage.read', {
            description: 'Read local storage',
            category: 'storage',
            riskLevel: 'low',
            userConsent: false
        });
        
        this.definePermission('storage.write', {
            description: 'Write to local storage',
            category: 'storage',
            riskLevel: 'medium',
            userConsent: true
        });
        
        this.definePermission('storage.clear', {
            description: 'Clear all local storage',
            category: 'storage',
            riskLevel: 'high',
            userConsent: true
        });
        
        // UI permissions
        this.definePermission('ui.notification', {
            description: 'Show notifications',
            category: 'ui',
            riskLevel: 'low',
            userConsent: true
        });
        
        this.definePermission('ui.modal', {
            description: 'Show modal dialogs',
            category: 'ui',
            riskLevel: 'medium',
            userConsent: true
        });
        
        this.definePermission('ui.fullscreen', {
            description: 'Enter fullscreen mode',
            category: 'ui',
            riskLevel: 'medium',
            userConsent: true
        });
        
        // Device permissions
        this.definePermission('device.camera', {
            description: 'Access camera',
            category: 'device',
            riskLevel: 'high',
            userConsent: true,
            requiresUserGesture: true
        });
        
        this.definePermission('device.microphone', {
            description: 'Access microphone',
            category: 'device',
            riskLevel: 'high',
            userConsent: true,
            requiresUserGesture: true
        });
        
        this.definePermission('device.location', {
            description: 'Access location',
            category: 'device',
            riskLevel: 'high',
            userConsent: true
        });
        
        // Security permissions
        this.definePermission('security.admin', {
            description: 'Administrative security functions',
            category: 'security',
            riskLevel: 'critical',
            userConsent: true,
            requiresElevation: true
        });
        
        this.definePermission('security.block_peer', {
            description: 'Block other peers',
            category: 'security',
            riskLevel: 'medium',
            userConsent: true
        });
        
        // System permissions
        this.definePermission('system.install_dapp', {
            description: 'Install other dApps',
            category: 'system',
            riskLevel: 'high',
            userConsent: true
        });
        
        this.definePermission('system.uninstall_dapp', {
            description: 'Uninstall dApps',
            category: 'system',
            riskLevel: 'high',
            userConsent: true
        });
        
        // Create permission groups
        this.createPermissionGroup('basic', [
            'network.listen',
            'data.read',
            'storage.read',
            'ui.notification'
        ]);
        
        this.createPermissionGroup('standard', [
            'network.connect',
            'network.broadcast',
            'data.read',
            'data.write',
            'storage.read',
            'storage.write',
            'ui.notification',
            'ui.modal'
        ]);
        
        this.createPermissionGroup('advanced', [
            'network.connect',
            'network.broadcast',
            'data.read',
            'data.write',
            'data.delete',
            'storage.read',
            'storage.write',
            'storage.clear',
            'ui.notification',
            'ui.modal',
            'ui.fullscreen',
            'security.block_peer'
        ]);
        
        this.createPermissionGroup('device_access', [
            'device.camera',
            'device.microphone',
            'device.location'
        ]);
        
        this.createPermissionGroup('system_admin', [
            'security.admin',
            'system.install_dapp',
            'system.uninstall_dapp'
        ]);
    }
    
    defineStandardRoles() {
        // User roles
        this.defineRole('guest', {
            description: 'Guest user with minimal permissions',
            permissions: ['basic'],
            inherits: []
        });
        
        this.defineRole('user', {
            description: 'Standard user',
            permissions: ['standard'],
            inherits: ['guest']
        });
        
        this.defineRole('power_user', {
            description: 'Power user with advanced permissions',
            permissions: ['advanced'],
            inherits: ['user']
        });
        
        this.defineRole('admin', {
            description: 'Administrator with full permissions',
            permissions: ['system_admin'],
            inherits: ['power_user']
        });
        
        // dApp roles
        this.defineRole('dapp_basic', {
            description: 'Basic dApp permissions',
            permissions: ['basic'],
            inherits: []
        });
        
        this.defineRole('dapp_standard', {
            description: 'Standard dApp permissions',
            permissions: ['standard'],
            inherits: ['dapp_basic']
        });
        
        this.defineRole('dapp_privileged', {
            description: 'Privileged dApp with device access',
            permissions: ['advanced', 'device_access'],
            inherits: ['dapp_standard']
        });
        
        this.defineRole('dapp_system', {
            description: 'System dApp with administrative permissions',
            permissions: ['system_admin'],
            inherits: ['dapp_privileged']
        });
    }
    
    definePermission(permissionId, definition) {
        this.permissionDefinitions.set(permissionId, {
            id: permissionId,
            description: definition.description || '',
            category: definition.category || 'general',
            riskLevel: definition.riskLevel || 'low',
            userConsent: definition.userConsent || false,
            requiresUserGesture: definition.requiresUserGesture || false,
            requiresElevation: definition.requiresElevation || false,
            dependencies: definition.dependencies || [],
            conflicts: definition.conflicts || [],
            ...definition
        });
    }
    
    createPermissionGroup(groupId, permissions) {
        this.permissionGroups.set(groupId, new Set(permissions));
    }
    
    defineRole(roleId, definition) {
        const permissions = new Set();
        
        // Add direct permissions
        for (const permission of definition.permissions || []) {
            if (this.permissionGroups.has(permission)) {
                // Add all permissions from group
                for (const groupPermission of this.permissionGroups.get(permission)) {
                    permissions.add(groupPermission);
                }
            } else {
                permissions.add(permission);
            }
        }
        
        this.rolePermissions.set(roleId, {
            id: roleId,
            description: definition.description || '',
            permissions: permissions,
            inherits: new Set(definition.inherits || []),
            created: Date.now()
        });
    }
    
    // Permission checking
    async checkPermission(subjectId, permissionId, context = {}) {
        try {
            // Check if permission exists
            if (!this.permissionDefinitions.has(permissionId)) {
                this.logAudit('permission_check', subjectId, {
                    permission: permissionId,
                    result: 'denied',
                    reason: 'permission_not_defined'
                });
                return false;
            }
            
            // Check direct permissions
            if (this.hasDirectPermission(subjectId, permissionId)) {
                this.logAudit('permission_check', subjectId, {
                    permission: permissionId,
                    result: 'granted',
                    source: 'direct'
                });
                return true;
            }
            
            // Check role-based permissions
            if (this.hasRolePermission(subjectId, permissionId)) {
                this.logAudit('permission_check', subjectId, {
                    permission: permissionId,
                    result: 'granted',
                    source: 'role'
                });
                return true;
            }
            
            // Check delegated permissions
            if (this.config.enableDelegation && this.hasDelegatedPermission(subjectId, permissionId)) {
                this.logAudit('permission_check', subjectId, {
                    permission: permissionId,
                    result: 'granted',
                    source: 'delegation'
                });
                return true;
            }
            
            // Check temporary permissions
            if (this.hasTemporaryPermission(subjectId, permissionId, context)) {
                this.logAudit('permission_check', subjectId, {
                    permission: permissionId,
                    result: 'granted',
                    source: 'temporary'
                });
                return true;
            }
            
            // Permission denied
            this.logAudit('permission_check', subjectId, {
                permission: permissionId,
                result: 'denied',
                reason: 'no_permission'
            });
            
            if (this.onPermissionDenied) {
                this.onPermissionDenied(subjectId, permissionId, context);
            }
            
            return false;
            
        } catch (error) {
            console.error('[PermissionManager] Error checking permission:', error);
            this.logAudit('permission_check', subjectId, {
                permission: permissionId,
                result: 'error',
                error: error.message
            });
            return false;
        }
    }
    
    hasDirectPermission(subjectId, permissionId) {
        // Check dApp permissions
        const dappPermissions = this.dappPermissions.get(subjectId);
        if (dappPermissions && dappPermissions.has(permissionId)) {
            return true;
        }
        
        // Check user permissions
        const userPermissions = this.userPermissions.get(subjectId);
        if (userPermissions && userPermissions.has(permissionId)) {
            return true;
        }
        
        return false;
    }
    
    hasRolePermission(subjectId, permissionId) {
        // Get subject roles
        const roles = this.getSubjectRoles(subjectId);
        
        for (const roleId of roles) {
            if (this.roleHasPermission(roleId, permissionId)) {
                return true;
            }
        }
        
        return false;
    }
    
    roleHasPermission(roleId, permissionId, visited = new Set()) {
        // Prevent infinite recursion
        if (visited.has(roleId)) {
            return false;
        }
        visited.add(roleId);
        
        const role = this.rolePermissions.get(roleId);
        if (!role) {
            return false;
        }
        
        // Check direct role permissions
        if (role.permissions.has(permissionId)) {
            return true;
        }
        
        // Check inherited roles
        if (this.config.enablePermissionInheritance) {
            for (const inheritedRoleId of role.inherits) {
                if (this.roleHasPermission(inheritedRoleId, permissionId, visited)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    hasDelegatedPermission(subjectId, permissionId) {
        for (const [delegatorId, delegations] of this.delegatedPermissions) {
            const delegatedToSubject = delegations.get(subjectId);
            if (delegatedToSubject && delegatedToSubject.has(permissionId)) {
                // Verify delegator still has the permission
                if (this.hasDirectPermission(delegatorId, permissionId) || 
                    this.hasRolePermission(delegatorId, permissionId)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    hasTemporaryPermission(subjectId, permissionId, context) {
        const tempPermKey = `${subjectId}:${permissionId}`;
        const tempPerm = this.temporaryPermissions.get(tempPermKey);
        
        if (!tempPerm) {
            return false;
        }
        
        // Check expiry
        if (Date.now() > tempPerm.expiry) {
            this.temporaryPermissions.delete(tempPermKey);
            return false;
        }
        
        // Check conditions
        if (tempPerm.conditions) {
            for (const condition of tempPerm.conditions) {
                if (!this.evaluateCondition(condition, context)) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    evaluateCondition(condition, context) {
        switch (condition.type) {
            case 'user_gesture':
                return context.userGesture === true;
                
            case 'secure_context':
                return context.secureContext === true;
                
            case 'time_range':
                const now = Date.now();
                return now >= condition.start && now <= condition.end;
                
            case 'location':
                // Simplified location check
                return context.location && 
                       context.location.lat === condition.lat && 
                       context.location.lng === condition.lng;
                
            default:
                return true;
        }
    }
    
    getSubjectRoles(subjectId) {
        const roles = new Set();
        
        // Get user roles
        const userRoles = this.userRoles.get(subjectId);
        if (userRoles) {
            userRoles.forEach(role => roles.add(role));
        }
        
        // Get dApp roles
        const dappRoles = this.dappRoles.get(subjectId);
        if (dappRoles) {
            dappRoles.forEach(role => roles.add(role));
        }
        
        return roles;
    }
    
    // Permission granting
    async grantPermission(subjectId, permissionId, options = {}) {
        try {
            // Validate permission
            if (!this.permissionDefinitions.has(permissionId)) {
                throw new Error(`Permission ${permissionId} is not defined`);
            }
            
            const permissionDef = this.permissionDefinitions.get(permissionId);
            
            // Check if user consent is required
            if (permissionDef.userConsent && !options.userConsent) {
                throw new Error(`User consent required for permission ${permissionId}`);
            }
            
            // Check dependencies
            for (const dependency of permissionDef.dependencies || []) {
                if (!await this.checkPermission(subjectId, dependency)) {
                    throw new Error(`Missing dependency: ${dependency}`);
                }
            }
            
            // Check conflicts
            for (const conflict of permissionDef.conflicts || []) {
                if (await this.checkPermission(subjectId, conflict)) {
                    throw new Error(`Conflicting permission: ${conflict}`);
                }
            }
            
            // Grant permission
            if (options.isDApp) {
                if (!this.dappPermissions.has(subjectId)) {
                    this.dappPermissions.set(subjectId, new Set());
                }
                this.dappPermissions.get(subjectId).add(permissionId);
            } else {
                if (!this.userPermissions.has(subjectId)) {
                    this.userPermissions.set(subjectId, new Set());
                }
                this.userPermissions.get(subjectId).add(permissionId);
            }
            
            // Handle temporary permissions
            if (options.temporary) {
                const expiry = Date.now() + (options.duration || this.config.defaultPermissionTTL);
                const tempPermKey = `${subjectId}:${permissionId}`;
                
                this.temporaryPermissions.set(tempPermKey, {
                    expiry: expiry,
                    conditions: options.conditions || []
                });
            }
            
            this.logAudit('permission_granted', subjectId, {
                permission: permissionId,
                temporary: options.temporary || false,
                duration: options.duration,
                grantedBy: options.grantedBy || this.nodeId
            });
            
            if (this.onPermissionGranted) {
                this.onPermissionGranted(subjectId, permissionId, options);
            }
            
            return true;
            
        } catch (error) {
            console.error('[PermissionManager] Error granting permission:', error);
            this.logAudit('permission_grant_failed', subjectId, {
                permission: permissionId,
                error: error.message
            });
            throw error;
        }
    }
    
    // Permission revocation
    async revokePermission(subjectId, permissionId, options = {}) {
        try {
            let revoked = false;
            
            // Revoke from dApp permissions
            const dappPermissions = this.dappPermissions.get(subjectId);
            if (dappPermissions && dappPermissions.has(permissionId)) {
                dappPermissions.delete(permissionId);
                revoked = true;
            }
            
            // Revoke from user permissions
            const userPermissions = this.userPermissions.get(subjectId);
            if (userPermissions && userPermissions.has(permissionId)) {
                userPermissions.delete(permissionId);
                revoked = true;
            }
            
            // Revoke temporary permissions
            const tempPermKey = `${subjectId}:${permissionId}`;
            if (this.temporaryPermissions.has(tempPermKey)) {
                this.temporaryPermissions.delete(tempPermKey);
                revoked = true;
            }
            
            if (revoked) {
                this.logAudit('permission_revoked', subjectId, {
                    permission: permissionId,
                    revokedBy: options.revokedBy || this.nodeId,
                    reason: options.reason
                });
                
                if (this.onPermissionRevoked) {
                    this.onPermissionRevoked(subjectId, permissionId, options);
                }
            }
            
            return revoked;
            
        } catch (error) {
            console.error('[PermissionManager] Error revoking permission:', error);
            throw error;
        }
    }
    
    // Role management
    assignRole(subjectId, roleId, options = {}) {
        if (!this.rolePermissions.has(roleId)) {
            throw new Error(`Role ${roleId} is not defined`);
        }
        
        if (options.isDApp) {
            if (!this.dappRoles.has(subjectId)) {
                this.dappRoles.set(subjectId, new Set());
            }
            this.dappRoles.get(subjectId).add(roleId);
        } else {
            if (!this.userRoles.has(subjectId)) {
                this.userRoles.set(subjectId, new Set());
            }
            this.userRoles.get(subjectId).add(roleId);
        }
        
        this.logAudit('role_assigned', subjectId, {
            role: roleId,
            assignedBy: options.assignedBy || this.nodeId
        });
    }
    
    removeRole(subjectId, roleId, options = {}) {
        let removed = false;
        
        const dappRoles = this.dappRoles.get(subjectId);
        if (dappRoles && dappRoles.has(roleId)) {
            dappRoles.delete(roleId);
            removed = true;
        }
        
        const userRoles = this.userRoles.get(subjectId);
        if (userRoles && userRoles.has(roleId)) {
            userRoles.delete(roleId);
            removed = true;
        }
        
        if (removed) {
            this.logAudit('role_removed', subjectId, {
                role: roleId,
                removedBy: options.removedBy || this.nodeId
            });
        }
        
        return removed;
    }
    
    // Permission delegation
    delegatePermission(delegatorId, delegateeId, permissionId, options = {}) {
        if (!this.config.enableDelegation) {
            throw new Error('Permission delegation is disabled');
        }
        
        // Check if delegator has the permission
        if (!this.hasDirectPermission(delegatorId, permissionId) && 
            !this.hasRolePermission(delegatorId, permissionId)) {
            throw new Error('Delegator does not have the permission to delegate');
        }
        
        // Check delegation depth
        const depth = this.getDelegationDepth(delegatorId, permissionId);
        if (depth >= this.config.maxDelegationDepth) {
            throw new Error('Maximum delegation depth exceeded');
        }
        
        if (!this.delegatedPermissions.has(delegatorId)) {
            this.delegatedPermissions.set(delegatorId, new Map());
        }
        
        const delegatorDelegations = this.delegatedPermissions.get(delegatorId);
        if (!delegatorDelegations.has(delegateeId)) {
            delegatorDelegations.set(delegateeId, new Set());
        }
        
        delegatorDelegations.get(delegateeId).add(permissionId);
        
        this.logAudit('permission_delegated', delegatorId, {
            permission: permissionId,
            delegatee: delegateeId,
            duration: options.duration
        });
    }
    
    revokeDelegation(delegatorId, delegateeId, permissionId) {
        const delegatorDelegations = this.delegatedPermissions.get(delegatorId);
        if (delegatorDelegations) {
            const delegateeDelegations = delegatorDelegations.get(delegateeId);
            if (delegateeDelegations) {
                delegateeDelegations.delete(permissionId);
                
                if (delegateeDelegations.size === 0) {
                    delegatorDelegations.delete(delegateeId);
                }
            }
        }
        
        this.logAudit('delegation_revoked', delegatorId, {
            permission: permissionId,
            delegatee: delegateeId
        });
    }
    
    getDelegationDepth(subjectId, permissionId, visited = new Set()) {
        if (visited.has(subjectId)) {
            return 0; // Prevent infinite recursion
        }
        visited.add(subjectId);
        
        let maxDepth = 0;
        
        for (const [delegatorId, delegations] of this.delegatedPermissions) {
            const delegatedToSubject = delegations.get(subjectId);
            if (delegatedToSubject && delegatedToSubject.has(permissionId)) {
                const depth = 1 + this.getDelegationDepth(delegatorId, permissionId, visited);
                maxDepth = Math.max(maxDepth, depth);
            }
        }
        
        return maxDepth;
    }
    
    // Audit logging
    logAudit(action, subjectId, details) {
        if (!this.config.enableAuditLogging) {
            return;
        }
        
        const auditEntry = {
            timestamp: Date.now(),
            action,
            subjectId,
            nodeId: this.nodeId,
            details: { ...details }
        };
        
        this.auditLog.push(auditEntry);
        
        // Keep log size manageable
        if (this.auditLog.length > this.maxAuditLogSize) {
            this.auditLog = this.auditLog.slice(-Math.floor(this.maxAuditLogSize * 0.8));
        }
        
        if (this.onAuditEvent) {
            this.onAuditEvent(auditEntry);
        }
    }
    
    // Cleanup tasks
    startCleanupTasks() {
        // Clean up expired temporary permissions
        setInterval(() => {
            this.cleanupExpiredPermissions();
        }, 60000); // Every minute
        
        // Clean up old audit logs
        setInterval(() => {
            this.cleanupAuditLog();
        }, 3600000); // Every hour
    }
    
    cleanupExpiredPermissions() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, tempPerm] of this.temporaryPermissions) {
            if (now > tempPerm.expiry) {
                expiredKeys.push(key);
            }
        }
        
        expiredKeys.forEach(key => {
            this.temporaryPermissions.delete(key);
            const [subjectId, permissionId] = key.split(':');
            this.logAudit('temporary_permission_expired', subjectId, { permission: permissionId });
        });
        
        if (expiredKeys.length > 0) {
            console.log(`[PermissionManager] Cleaned up ${expiredKeys.length} expired permissions`);
        }
    }
    
    cleanupAuditLog() {
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
        const originalLength = this.auditLog.length;
        
        this.auditLog = this.auditLog.filter(entry => entry.timestamp > cutoff);
        
        const removed = originalLength - this.auditLog.length;
        if (removed > 0) {
            console.log(`[PermissionManager] Cleaned up ${removed} old audit log entries`);
        }
    }
    
    // Query methods
    getSubjectPermissions(subjectId) {
        const permissions = new Set();
        
        // Direct permissions
        const dappPermissions = this.dappPermissions.get(subjectId);
        if (dappPermissions) {
            dappPermissions.forEach(p => permissions.add(p));
        }
        
        const userPermissions = this.userPermissions.get(subjectId);
        if (userPermissions) {
            userPermissions.forEach(p => permissions.add(p));
        }
        
        // Role-based permissions
        const roles = this.getSubjectRoles(subjectId);
        for (const roleId of roles) {
            const rolePerms = this.getRolePermissions(roleId);
            rolePerms.forEach(p => permissions.add(p));
        }
        
        return Array.from(permissions);
    }
    
    getRolePermissions(roleId, visited = new Set()) {
        if (visited.has(roleId)) {
            return new Set(); // Prevent infinite recursion
        }
        visited.add(roleId);
        
        const role = this.rolePermissions.get(roleId);
        if (!role) {
            return new Set();
        }
        
        const permissions = new Set(role.permissions);
        
        // Add inherited permissions
        if (this.config.enablePermissionInheritance) {
            for (const inheritedRoleId of role.inherits) {
                const inheritedPerms = this.getRolePermissions(inheritedRoleId, visited);
                inheritedPerms.forEach(p => permissions.add(p));
            }
        }
        
        return permissions;
    }
    
    getAuditLog(filters = {}) {
        let filteredLog = this.auditLog;
        
        if (filters.subjectId) {
            filteredLog = filteredLog.filter(entry => entry.subjectId === filters.subjectId);
        }
        
        if (filters.action) {
            filteredLog = filteredLog.filter(entry => entry.action === filters.action);
        }
        
        if (filters.since) {
            filteredLog = filteredLog.filter(entry => entry.timestamp >= filters.since);
        }
        
        if (filters.until) {
            filteredLog = filteredLog.filter(entry => entry.timestamp <= filters.until);
        }
        
        return filteredLog;
    }
    
    // Configuration
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
    
    getConfig() {
        return { ...this.config };
    }
    
    // Export/Import
    exportPermissions() {
        return {
            dappPermissions: Object.fromEntries(
                Array.from(this.dappPermissions.entries()).map(([k, v]) => [k, Array.from(v)])
            ),
            userPermissions: Object.fromEntries(
                Array.from(this.userPermissions.entries()).map(([k, v]) => [k, Array.from(v)])
            ),
            userRoles: Object.fromEntries(
                Array.from(this.userRoles.entries()).map(([k, v]) => [k, Array.from(v)])
            ),
            dappRoles: Object.fromEntries(
                Array.from(this.dappRoles.entries()).map(([k, v]) => [k, Array.from(v)])
            ),
            exportTime: Date.now()
        };
    }
    
    importPermissions(data) {
        // Import dApp permissions
        if (data.dappPermissions) {
            for (const [dappId, permissions] of Object.entries(data.dappPermissions)) {
                this.dappPermissions.set(dappId, new Set(permissions));
            }
        }
        
        // Import user permissions
        if (data.userPermissions) {
            for (const [userId, permissions] of Object.entries(data.userPermissions)) {
                this.userPermissions.set(userId, new Set(permissions));
            }
        }
        
        // Import roles
        if (data.userRoles) {
            for (const [userId, roles] of Object.entries(data.userRoles)) {
                this.userRoles.set(userId, new Set(roles));
            }
        }
        
        if (data.dappRoles) {
            for (const [dappId, roles] of Object.entries(data.dappRoles)) {
                this.dappRoles.set(dappId, new Set(roles));
            }
        }
    }
}

