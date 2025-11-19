/**
 * Developer Tools for NeoNet Platform
 * Provides comprehensive development and debugging tools for dApp developers
 * 
 * Features:
 * - Real-time debugging and inspection
 * - Performance profiling and monitoring
 * - Network traffic analysis
 * - State and data visualization
 * - Error tracking and logging
 * - Testing utilities and mocks
 * - Code hot-reloading
 * - API documentation and testing
 */

export class DeveloperTools {
    constructor(neoNetSDK) {
        this.sdk = neoNetSDK;
        this.nodeId = neoNetSDK.getNodeId();
        
        // Development state
        this.isEnabled = false;
        this.debugMode = false;
        this.profiling = false;
        
        // Debugging data
        this.logs = [];
        this.errors = [];
        this.warnings = [];
        this.networkTraffic = [];
        this.performanceMetrics = [];
        this.stateHistory = [];
        
        // Breakpoints and watches
        this.breakpoints = new Map(); // location -> condition
        this.watchedVariables = new Map(); // variable -> value
        this.eventBreakpoints = new Set(); // event types to break on
        
        // Performance profiling
        this.profileSessions = new Map(); // sessionId -> profile data
        this.currentProfile = null;
        
        // Mock data and services
        this.mocks = new Map(); // service -> mock implementation
        this.mockResponses = new Map(); // request pattern -> response
        
        // Hot reload
        this.hotReloadEnabled = false;
        this.watchedFiles = new Set();
        this.fileWatcher = null;
        
        // Testing framework
        this.testSuites = new Map(); // suiteName -> test suite
        this.testResults = new Map(); // testId -> result
        
        // Configuration
        this.config = {
            maxLogEntries: 10000,
            maxNetworkEntries: 5000,
            maxStateHistory: 1000,
            enableSourceMaps: true,
            enablePerformanceTracking: true,
            enableNetworkInterception: true,
            autoSaveDebugData: true
        };
        
        // Event handlers
        this.onBreakpoint = null;
        this.onError = null;
        this.onPerformanceIssue = null;
        this.onTestComplete = null;
        
        this.initializeDevTools();
    }
    
    initializeDevTools() {
        // Set up console interception
        this.setupConsoleInterception();
        
        // Set up error handling
        this.setupErrorHandling();
        
        // Set up network interception
        if (this.config.enableNetworkInterception) {
            this.setupNetworkInterception();
        }
        
        // Set up performance monitoring
        if (this.config.enablePerformanceTracking) {
            this.setupPerformanceMonitoring();
        }
        
        console.log('[DeveloperTools] Initialized successfully');
    }
    
    // Enable/disable dev tools
    enable() {
        this.isEnabled = true;
        this.debugMode = true;
        
        // Inject dev tools UI if in browser
        if (typeof window !== 'undefined') {
            this.injectDevToolsUI();
        }
        
        console.log('[DeveloperTools] Enabled');
    }
    
    disable() {
        this.isEnabled = false;
        this.debugMode = false;
        
        // Remove dev tools UI
        if (typeof window !== 'undefined') {
            this.removeDevToolsUI();
        }
        
        console.log('[DeveloperTools] Disabled');
    }
    
    // Console interception
    setupConsoleInterception() {
        if (typeof window === 'undefined') return;
        
        const originalConsole = { ...console };
        
        ['log', 'info', 'warn', 'error', 'debug'].forEach(method => {
            console[method] = (...args) => {
                // Call original method
                originalConsole[method](...args);
                
                // Capture for dev tools
                if (this.isEnabled) {
                    this.captureLog(method, args);
                }
            };
        });
    }
    
    captureLog(level, args) {
        const logEntry = {
            timestamp: Date.now(),
            level,
            message: args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' '),
            args: args,
            stack: new Error().stack,
            nodeId: this.nodeId
        };
        
        this.logs.push(logEntry);
        
        // Keep log size manageable
        if (this.logs.length > this.config.maxLogEntries) {
            this.logs = this.logs.slice(-Math.floor(this.config.maxLogEntries * 0.8));
        }
        
        // Check for breakpoints
        if (this.eventBreakpoints.has('console.' + level)) {
            this.triggerBreakpoint('console', { level, message: logEntry.message });
        }
    }
    
    // Error handling
    setupErrorHandling() {
        if (typeof window === 'undefined') return;
        
        // Capture unhandled errors
        window.addEventListener('error', (event) => {
            this.captureError({
                type: 'javascript',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error ? event.error.stack : null,
                timestamp: Date.now()
            });
        });
        
        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.captureError({
                type: 'promise',
                message: event.reason ? event.reason.message || event.reason : 'Unhandled promise rejection',
                stack: event.reason ? event.reason.stack : null,
                timestamp: Date.now()
            });
        });
    }
    
    captureError(error) {
        this.errors.push(error);
        
        // Keep error log size manageable
        if (this.errors.length > 1000) {
            this.errors = this.errors.slice(-800);
        }
        
        // Check for error breakpoints
        if (this.eventBreakpoints.has('error')) {
            this.triggerBreakpoint('error', error);
        }
        
        if (this.onError) {
            this.onError(error);
        }
    }
    
    // Network interception
    setupNetworkInterception() {
        if (typeof window === 'undefined') return;
        
        // Intercept fetch requests
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const startTime = Date.now();
            const [url, options = {}] = args;
            
            try {
                const response = await originalFetch(...args);
                
                this.captureNetworkRequest({
                    type: 'fetch',
                    url: url.toString(),
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body,
                    status: response.status,
                    statusText: response.statusText,
                    responseHeaders: Object.fromEntries(response.headers.entries()),
                    duration: Date.now() - startTime,
                    timestamp: startTime,
                    success: response.ok
                });
                
                return response;
                
            } catch (error) {
                this.captureNetworkRequest({
                    type: 'fetch',
                    url: url.toString(),
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body,
                    error: error.message,
                    duration: Date.now() - startTime,
                    timestamp: startTime,
                    success: false
                });
                
                throw error;
            }
        };
        
        // Intercept WebSocket connections
        const originalWebSocket = window.WebSocket;
        window.WebSocket = class extends originalWebSocket {
            constructor(url, protocols) {
                super(url, protocols);
                
                const startTime = Date.now();
                
                this.addEventListener('open', () => {
                    this.captureNetworkRequest({
                        type: 'websocket',
                        url: url,
                        event: 'open',
                        duration: Date.now() - startTime,
                        timestamp: startTime,
                        success: true
                    });
                });
                
                this.addEventListener('message', (event) => {
                    this.captureNetworkRequest({
                        type: 'websocket',
                        url: url,
                        event: 'message',
                        data: event.data,
                        timestamp: Date.now(),
                        success: true
                    });
                });
                
                this.addEventListener('error', (event) => {
                    this.captureNetworkRequest({
                        type: 'websocket',
                        url: url,
                        event: 'error',
                        error: 'WebSocket error',
                        timestamp: Date.now(),
                        success: false
                    });
                });
                
                this.addEventListener('close', (event) => {
                    this.captureNetworkRequest({
                        type: 'websocket',
                        url: url,
                        event: 'close',
                        code: event.code,
                        reason: event.reason,
                        timestamp: Date.now(),
                        success: true
                    });
                });
            }
            
            captureNetworkRequest(request) {
                // Access outer scope method
                if (window.neoNetDevTools) {
                    window.neoNetDevTools.captureNetworkRequest(request);
                }
            }
        };
        
        // Make dev tools accessible for WebSocket interception
        window.neoNetDevTools = this;
    }
    
    captureNetworkRequest(request) {
        this.networkTraffic.push(request);
        
        // Keep network log size manageable
        if (this.networkTraffic.length > this.config.maxNetworkEntries) {
            this.networkTraffic = this.networkTraffic.slice(-Math.floor(this.config.maxNetworkEntries * 0.8));
        }
        
        // Check for network breakpoints
        if (this.eventBreakpoints.has('network')) {
            this.triggerBreakpoint('network', request);
        }
    }
    
    // Performance monitoring
    setupPerformanceMonitoring() {
        if (typeof window === 'undefined' || !window.performance) return;
        
        // Monitor performance entries
        if (window.PerformanceObserver) {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.capturePerformanceEntry(entry);
                }
            });
            
            observer.observe({ entryTypes: ['measure', 'navigation', 'resource', 'paint'] });
        }
        
        // Monitor memory usage
        setInterval(() => {
            if (window.performance.memory) {
                this.captureMemoryUsage();
            }
        }, 5000); // Every 5 seconds
    }
    
    capturePerformanceEntry(entry) {
        const perfEntry = {
            name: entry.name,
            type: entry.entryType,
            startTime: entry.startTime,
            duration: entry.duration,
            timestamp: Date.now()
        };
        
        // Add type-specific data
        if (entry.entryType === 'resource') {
            perfEntry.transferSize = entry.transferSize;
            perfEntry.encodedBodySize = entry.encodedBodySize;
            perfEntry.decodedBodySize = entry.decodedBodySize;
        }
        
        this.performanceMetrics.push(perfEntry);
        
        // Keep performance log size manageable
        if (this.performanceMetrics.length > 5000) {
            this.performanceMetrics = this.performanceMetrics.slice(-4000);
        }
        
        // Check for performance issues
        if (entry.duration > 1000) { // Slow operation (>1s)
            if (this.onPerformanceIssue) {
                this.onPerformanceIssue({
                    type: 'slow_operation',
                    entry: perfEntry,
                    threshold: 1000
                });
            }
        }
    }
    
    captureMemoryUsage() {
        if (!window.performance.memory) return;
        
        const memory = window.performance.memory;
        const memoryEntry = {
            type: 'memory',
            used: memory.usedJSHeapSize,
            total: memory.totalJSHeapSize,
            limit: memory.jsHeapSizeLimit,
            timestamp: Date.now()
        };
        
        this.performanceMetrics.push(memoryEntry);
        
        // Check for memory issues
        const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
        if (usageRatio > 0.9) { // High memory usage (>90%)
            if (this.onPerformanceIssue) {
                this.onPerformanceIssue({
                    type: 'high_memory_usage',
                    usage: usageRatio,
                    threshold: 0.9
                });
            }
        }
    }
    
    // Breakpoints and debugging
    setBreakpoint(location, condition = null) {
        this.breakpoints.set(location, condition);
        console.log(`[DevTools] Breakpoint set at ${location}`);
    }
    
    removeBreakpoint(location) {
        this.breakpoints.delete(location);
        console.log(`[DevTools] Breakpoint removed from ${location}`);
    }
    
    setEventBreakpoint(eventType) {
        this.eventBreakpoints.add(eventType);
        console.log(`[DevTools] Event breakpoint set for ${eventType}`);
    }
    
    removeEventBreakpoint(eventType) {
        this.eventBreakpoints.delete(eventType);
        console.log(`[DevTools] Event breakpoint removed for ${eventType}`);
    }
    
    triggerBreakpoint(type, data) {
        if (!this.debugMode) return;
        
        console.log(`[DevTools] Breakpoint triggered: ${type}`, data);
        
        if (this.onBreakpoint) {
            this.onBreakpoint(type, data);
        }
        
        // In a real implementation, this would pause execution
        // For now, we just log the breakpoint
    }
    
    watchVariable(name, getValue) {
        this.watchedVariables.set(name, {
            getValue,
            lastValue: getValue(),
            changed: false
        });
    }
    
    unwatchVariable(name) {
        this.watchedVariables.delete(name);
    }
    
    checkWatchedVariables() {
        for (const [name, watch] of this.watchedVariables) {
            try {
                const currentValue = watch.getValue();
                if (currentValue !== watch.lastValue) {
                    console.log(`[DevTools] Variable changed: ${name}`, {
                        old: watch.lastValue,
                        new: currentValue
                    });
                    
                    watch.lastValue = currentValue;
                    watch.changed = true;
                }
            } catch (error) {
                console.warn(`[DevTools] Error watching variable ${name}:`, error);
            }
        }
    }
    
    // Profiling
    startProfiling(sessionName = 'default') {
        if (this.profiling) {
            this.stopProfiling();
        }
        
        this.profiling = true;
        this.currentProfile = {
            sessionName,
            startTime: Date.now(),
            samples: [],
            events: [],
            memory: []
        };
        
        // Start sampling
        this.profileInterval = setInterval(() => {
            this.takeSample();
        }, 100); // Sample every 100ms
        
        console.log(`[DevTools] Started profiling session: ${sessionName}`);
    }
    
    stopProfiling() {
        if (!this.profiling) return null;
        
        this.profiling = false;
        clearInterval(this.profileInterval);
        
        const profile = {
            ...this.currentProfile,
            endTime: Date.now(),
            duration: Date.now() - this.currentProfile.startTime
        };
        
        this.profileSessions.set(profile.sessionName, profile);
        this.currentProfile = null;
        
        console.log(`[DevTools] Stopped profiling session: ${profile.sessionName}`);
        return profile;
    }
    
    takeSample() {
        if (!this.currentProfile) return;
        
        const sample = {
            timestamp: Date.now(),
            stack: this.getCurrentStack(),
            memory: window.performance.memory ? {
                used: window.performance.memory.usedJSHeapSize,
                total: window.performance.memory.totalJSHeapSize
            } : null
        };
        
        this.currentProfile.samples.push(sample);
    }
    
    getCurrentStack() {
        try {
            throw new Error();
        } catch (e) {
            return e.stack.split('\n').slice(2, 10); // Get top 8 stack frames
        }
    }
    
    // Mocking
    mockService(serviceName, mockImplementation) {
        this.mocks.set(serviceName, mockImplementation);
        console.log(`[DevTools] Mocked service: ${serviceName}`);
    }
    
    unmockService(serviceName) {
        this.mocks.delete(serviceName);
        console.log(`[DevTools] Unmocked service: ${serviceName}`);
    }
    
    mockResponse(pattern, response) {
        this.mockResponses.set(pattern, response);
        console.log(`[DevTools] Mocked response for pattern: ${pattern}`);
    }
    
    unmockResponse(pattern) {
        this.mockResponses.delete(pattern);
        console.log(`[DevTools] Unmocked response for pattern: ${pattern}`);
    }
    
    // Testing framework
    createTestSuite(suiteName) {
        const suite = {
            name: suiteName,
            tests: [],
            setup: null,
            teardown: null,
            beforeEach: null,
            afterEach: null
        };
        
        this.testSuites.set(suiteName, suite);
        return new TestSuite(suite, this);
    }
    
    async runTests(suiteNames = null) {
        const suitesToRun = suiteNames ? 
            suiteNames.map(name => this.testSuites.get(name)).filter(Boolean) :
            Array.from(this.testSuites.values());
        
        const results = {
            totalSuites: suitesToRun.length,
            totalTests: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            suiteResults: []
        };
        
        const startTime = Date.now();
        
        for (const suite of suitesToRun) {
            const suiteResult = await this.runTestSuite(suite);
            results.suiteResults.push(suiteResult);
            results.totalTests += suiteResult.totalTests;
            results.passed += suiteResult.passed;
            results.failed += suiteResult.failed;
            results.skipped += suiteResult.skipped;
        }
        
        results.duration = Date.now() - startTime;
        
        if (this.onTestComplete) {
            this.onTestComplete(results);
        }
        
        return results;
    }
    
    async runTestSuite(suite) {
        const result = {
            suiteName: suite.name,
            totalTests: suite.tests.length,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            testResults: []
        };
        
        const startTime = Date.now();
        
        try {
            // Run setup
            if (suite.setup) {
                await suite.setup();
            }
            
            // Run tests
            for (const test of suite.tests) {
                const testResult = await this.runTest(test, suite);
                result.testResults.push(testResult);
                
                if (testResult.status === 'passed') result.passed++;
                else if (testResult.status === 'failed') result.failed++;
                else if (testResult.status === 'skipped') result.skipped++;
            }
            
            // Run teardown
            if (suite.teardown) {
                await suite.teardown();
            }
            
        } catch (error) {
            console.error(`[DevTools] Error running test suite ${suite.name}:`, error);
        }
        
        result.duration = Date.now() - startTime;
        return result;
    }
    
    async runTest(test, suite) {
        const result = {
            testName: test.name,
            status: 'pending',
            duration: 0,
            error: null,
            output: []
        };
        
        const startTime = Date.now();
        
        try {
            // Run beforeEach
            if (suite.beforeEach) {
                await suite.beforeEach();
            }
            
            // Run test
            if (test.skip) {
                result.status = 'skipped';
            } else {
                await test.fn();
                result.status = 'passed';
            }
            
            // Run afterEach
            if (suite.afterEach) {
                await suite.afterEach();
            }
            
        } catch (error) {
            result.status = 'failed';
            result.error = {
                message: error.message,
                stack: error.stack
            };
        }
        
        result.duration = Date.now() - startTime;
        return result;
    }
    
    // Hot reload
    enableHotReload() {
        this.hotReloadEnabled = true;
        console.log('[DevTools] Hot reload enabled');
    }
    
    disableHotReload() {
        this.hotReloadEnabled = false;
        if (this.fileWatcher) {
            this.fileWatcher.disconnect();
            this.fileWatcher = null;
        }
        console.log('[DevTools] Hot reload disabled');
    }
    
    watchFile(filePath) {
        this.watchedFiles.add(filePath);
        // In a real implementation, this would set up file system watching
        console.log(`[DevTools] Watching file: ${filePath}`);
    }
    
    unwatchFile(filePath) {
        this.watchedFiles.delete(filePath);
        console.log(`[DevTools] Stopped watching file: ${filePath}`);
    }
    
    // UI injection (for browser environments)
    injectDevToolsUI() {
        if (typeof document === 'undefined') return;
        
        // Create dev tools panel
        const panel = document.createElement('div');
        panel.id = 'neonet-devtools';
        panel.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 400px;
            height: 100vh;
            background: #1e1e1e;
            color: #fff;
            font-family: monospace;
            font-size: 12px;
            z-index: 10000;
            overflow: auto;
            border-left: 1px solid #333;
            display: none;
        `;
        
        // Create toggle button
        const toggleButton = document.createElement('button');
        toggleButton.textContent = 'DevTools';
        toggleButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10001;
            background: #007acc;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
        `;
        
        toggleButton.onclick = () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        };
        
        // Add content to panel
        this.updateDevToolsUI(panel);
        
        document.body.appendChild(panel);
        document.body.appendChild(toggleButton);
        
        // Update UI periodically
        setInterval(() => {
            if (panel.style.display !== 'none') {
                this.updateDevToolsUI(panel);
            }
        }, 1000);
    }
    
    updateDevToolsUI(panel) {
        const stats = this.getDebugStats();
        
        panel.innerHTML = `
            <div style="padding: 10px;">
                <h3>NeoNet Developer Tools</h3>
                
                <div style="margin: 10px 0;">
                    <strong>Status:</strong> ${this.isEnabled ? 'Enabled' : 'Disabled'}
                    <br>
                    <strong>Debug Mode:</strong> ${this.debugMode ? 'On' : 'Off'}
                    <br>
                    <strong>Profiling:</strong> ${this.profiling ? 'Active' : 'Inactive'}
                </div>
                
                <div style="margin: 10px 0;">
                    <strong>Logs:</strong> ${stats.logCount}
                    <br>
                    <strong>Errors:</strong> ${stats.errorCount}
                    <br>
                    <strong>Network Requests:</strong> ${stats.networkCount}
                    <br>
                    <strong>Performance Entries:</strong> ${stats.performanceCount}
                </div>
                
                <div style="margin: 10px 0;">
                    <strong>Breakpoints:</strong> ${stats.breakpointCount}
                    <br>
                    <strong>Watched Variables:</strong> ${stats.watchCount}
                    <br>
                    <strong>Mocks:</strong> ${stats.mockCount}
                </div>
                
                <div style="margin: 10px 0;">
                    <button onclick="window.neoNetDevTools.clearLogs()" style="margin: 2px; padding: 4px 8px;">Clear Logs</button>
                    <button onclick="window.neoNetDevTools.exportDebugData()" style="margin: 2px; padding: 4px 8px;">Export Data</button>
                </div>
                
                <div style="margin: 10px 0; max-height: 200px; overflow: auto; background: #2d2d2d; padding: 5px;">
                    <strong>Recent Logs:</strong><br>
                    ${this.logs.slice(-10).map(log => 
                        `<div style="margin: 2px 0; color: ${this.getLogColor(log.level)};">
                            [${new Date(log.timestamp).toLocaleTimeString()}] ${log.level.toUpperCase()}: ${log.message}
                        </div>`
                    ).join('')}
                </div>
            </div>
        `;
    }
    
    getLogColor(level) {
        switch (level) {
            case 'error': return '#ff6b6b';
            case 'warn': return '#ffd93d';
            case 'info': return '#6bcf7f';
            case 'debug': return '#74c0fc';
            default: return '#fff';
        }
    }
    
    removeDevToolsUI() {
        if (typeof document === 'undefined') return;
        
        const panel = document.getElementById('neonet-devtools');
        if (panel) {
            panel.remove();
        }
        
        // Remove toggle button (would need to track it better in real implementation)
    }
    
    // Data export/import
    exportDebugData() {
        const data = {
            nodeId: this.nodeId,
            timestamp: Date.now(),
            logs: this.logs,
            errors: this.errors,
            networkTraffic: this.networkTraffic,
            performanceMetrics: this.performanceMetrics,
            stateHistory: this.stateHistory,
            breakpoints: Object.fromEntries(this.breakpoints),
            watchedVariables: Object.fromEntries(this.watchedVariables),
            profileSessions: Object.fromEntries(this.profileSessions),
            config: this.config
        };
        
        // In browser, trigger download
        if (typeof window !== 'undefined') {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `neonet-debug-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
        
        return data;
    }
    
    importDebugData(data) {
        if (data.logs) this.logs = data.logs;
        if (data.errors) this.errors = data.errors;
        if (data.networkTraffic) this.networkTraffic = data.networkTraffic;
        if (data.performanceMetrics) this.performanceMetrics = data.performanceMetrics;
        if (data.stateHistory) this.stateHistory = data.stateHistory;
        if (data.breakpoints) this.breakpoints = new Map(Object.entries(data.breakpoints));
        if (data.watchedVariables) this.watchedVariables = new Map(Object.entries(data.watchedVariables));
        if (data.profileSessions) this.profileSessions = new Map(Object.entries(data.profileSessions));
        if (data.config) this.config = { ...this.config, ...data.config };
        
        console.log('[DevTools] Debug data imported');
    }
    
    // Utility methods
    clearLogs() {
        this.logs = [];
        this.errors = [];
        this.warnings = [];
        console.log('[DevTools] Logs cleared');
    }
    
    clearNetworkTraffic() {
        this.networkTraffic = [];
        console.log('[DevTools] Network traffic cleared');
    }
    
    clearPerformanceMetrics() {
        this.performanceMetrics = [];
        console.log('[DevTools] Performance metrics cleared');
    }
    
    getDebugStats() {
        return {
            logCount: this.logs.length,
            errorCount: this.errors.length,
            networkCount: this.networkTraffic.length,
            performanceCount: this.performanceMetrics.length,
            breakpointCount: this.breakpoints.size,
            watchCount: this.watchedVariables.size,
            mockCount: this.mocks.size + this.mockResponses.size,
            profileSessionCount: this.profileSessions.size
        };
    }
    
    // Configuration
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
    
    getConfig() {
        return { ...this.config };
    }
}

// Test Suite helper class
class TestSuite {
    constructor(suite, devTools) {
        this.suite = suite;
        this.devTools = devTools;
    }
    
    setup(fn) {
        this.suite.setup = fn;
        return this;
    }
    
    teardown(fn) {
        this.suite.teardown = fn;
        return this;
    }
    
    beforeEach(fn) {
        this.suite.beforeEach = fn;
        return this;
    }
    
    afterEach(fn) {
        this.suite.afterEach = fn;
        return this;
    }
    
    test(name, fn) {
        this.suite.tests.push({ name, fn, skip: false });
        return this;
    }
    
    skip(name, fn) {
        this.suite.tests.push({ name, fn, skip: true });
        return this;
    }
    
    async run() {
        return await this.devTools.runTestSuite(this.suite);
    }
}

// Assertion helpers
export const assert = {
    equal: (actual, expected, message) => {
        if (actual !== expected) {
            throw new Error(message || `Expected ${expected}, got ${actual}`);
        }
    },
    
    notEqual: (actual, expected, message) => {
        if (actual === expected) {
            throw new Error(message || `Expected not ${expected}, got ${actual}`);
        }
    },
    
    true: (value, message) => {
        if (value !== true) {
            throw new Error(message || `Expected true, got ${value}`);
        }
    },
    
    false: (value, message) => {
        if (value !== false) {
            throw new Error(message || `Expected false, got ${value}`);
        }
    },
    
    throws: async (fn, message) => {
        try {
            await fn();
            throw new Error(message || 'Expected function to throw');
        } catch (error) {
            if (error.message === (message || 'Expected function to throw')) {
                throw error;
            }
            // Function threw as expected
        }
    }
};

