const WebSocket = require("ws");
const http = require("http");
const { v4: uuidv4 } = require("uuid");

const PORT = process.env.PORT || 8080;
const HEARTBEAT_INTERVAL = 30 * 1000; // 30 segundos
const PEER_DISCOVERY_INTERVAL = 5 * 1000; // 5 segundos
const MAX_CONNECTIONS_PER_SSN = 50000; // Limite máximo de conexões por SSN
const CLEANUP_INTERVAL = 60 * 1000; // 1 minuto para limpeza de dados obsoletos

// --- Enhanced Signaling Server Network (SSN) Configuration ---
const OTHER_SSN_NODES = process.env.OTHER_SSN_NODES ? 
    process.env.OTHER_SSN_NODES.split(',') : [];

// Map to store connected clients (peers) with enhanced metadata
const clients = new Map(); // nodeId -> { ws, metadata, lastSeen, connectionTime }

// Map to store peer metadata with enhanced fields
const peerMetadata = new Map(); // nodeId -> { userName, userBio, lastSeen, ssnId, region, capabilities }

// Map to store connections to other SSN nodes with health monitoring
const ssnConnections = new Map(); // ssnId -> { ws, lastPing, isHealthy, region }

// Enhanced metrics and monitoring
const metrics = {
    totalConnections: 0,
    totalMessages: 0,
    totalSignalingMessages: 0,
    totalPeerDiscoveryRequests: 0,
    averageLatency: 0,
    errorCount: 0,
    startTime: Date.now()
};

// Unique ID for this SSN node with region information
const SSN_ID = uuidv4();
const SSN_REGION = process.env.SSN_REGION || 'default';
console.log(`[SSN] Enhanced Signaling Server Node ID: ${SSN_ID}`);
console.log(`[SSN] Region: ${SSN_REGION}`);
console.log(`[SSN] Max connections per SSN: ${MAX_CONNECTIONS_PER_SSN}`);

// --- Enhanced HTTP Server for Dashboard/Health Checks ---
const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Enable CORS for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    switch (url.pathname) {
        case "/health":
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ 
                status: "ok", 
                ssnId: SSN_ID, 
                region: SSN_REGION,
                connectedPeers: clients.size, 
                connectedSSNs: ssnConnections.size,
                metrics: {
                    ...metrics,
                    uptime: Date.now() - metrics.startTime,
                    memoryUsage: process.memoryUsage(),
                    cpuUsage: process.cpuUsage()
                }
            }));
            break;
            
        case "/dashboard":
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(generateDashboardHTML());
            break;
            
        case "/peers":
            res.writeHead(200, { "Content-Type": "application/json" });
            const peersArray = Array.from(peerMetadata.values());
            res.end(JSON.stringify(peersArray));
            break;
            
        case "/ssns":
            res.writeHead(200, { "Content-Type": "application/json" });
            const ssnArray = Array.from(ssnConnections.entries()).map(([id, conn]) => ({ 
                ssnId: id, 
                status: conn.ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected',
                region: conn.region,
                isHealthy: conn.isHealthy,
                lastPing: conn.lastPing
            }));
            res.end(JSON.stringify(ssnArray));
            break;
            
        case "/metrics":
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                ...metrics,
                uptime: Date.now() - metrics.startTime,
                connectionsPerSecond: metrics.totalConnections / ((Date.now() - metrics.startTime) / 1000),
                messagesPerSecond: metrics.totalMessages / ((Date.now() - metrics.startTime) / 1000)
            }));
            break;
            
        default:
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
    }
});

function generateDashboardHTML() {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>NeoNet Enhanced SSN Dashboard</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #333; }
                .container { max-width: 1200px; margin: auto; background: white; margin-top: 20px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); overflow: hidden; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
                .content { padding: 30px; }
                h1 { margin: 0; font-size: 2.5em; font-weight: 300; }
                h2 { color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
                .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0; }
                .metric-card { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; }
                .metric-value { font-size: 2em; font-weight: bold; color: #667eea; }
                .metric-label { color: #666; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; }
                pre { background: #f8f9fa; padding: 15px; border-radius: 8px; overflow-x: auto; border: 1px solid #e9ecef; }
                .status-ok { color: #28a745; font-weight: bold; }
                .status-warn { color: #ffc107; font-weight: bold; }
                .status-error { color: #dc3545; font-weight: bold; }
                .refresh-btn { background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin: 10px 0; }
                .refresh-btn:hover { background: #5a6fd8; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>NeoNet Enhanced SSN Dashboard</h1>
                    <p>Signaling Server Node: ${SSN_ID}</p>
                    <p>Region: ${SSN_REGION}</p>
                </div>
                <div class="content">
                    <button class="refresh-btn" onclick="location.reload()">Refresh Dashboard</button>
                    
                    <h2>System Status</h2>
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-value">${clients.size}</div>
                            <div class="metric-label">Connected Peers</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value">${ssnConnections.size}</div>
                            <div class="metric-label">Connected SSNs</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value">${metrics.totalMessages}</div>
                            <div class="metric-label">Total Messages</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value">${Math.round((Date.now() - metrics.startTime) / 1000 / 60)}</div>
                            <div class="metric-label">Uptime (minutes)</div>
                        </div>
                    </div>
                    
                    <h2>Real-time Data</h2>
                    <pre id="peersData">Loading...</pre>
                    <h2>SSN Network</h2>
                    <pre id="ssnData">Loading...</pre>
                    <h2>Performance Metrics</h2>
                    <pre id="metricsData">Loading...</pre>
                </div>
            </div>
            <script>
                function updateDashboard() {
                    Promise.all([
                        fetch("/peers").then(res => res.json()),
                        fetch("/ssns").then(res => res.json()),
                        fetch("/metrics").then(res => res.json())
                    ]).then(([peers, ssns, metrics]) => {
                        document.getElementById("peersData").textContent = JSON.stringify(peers.slice(0, 10), null, 2);
                        document.getElementById("ssnData").textContent = JSON.stringify(ssns, null, 2);
                        document.getElementById("metricsData").textContent = JSON.stringify(metrics, null, 2);
                    }).catch(err => console.error('Dashboard update failed:', err));
                }
                setInterval(updateDashboard, 3000);
                updateDashboard();
            </script>
        </body>
        </html>
    `;
}

// --- Enhanced WebSocket Server ---
const wss = new WebSocket.Server({ 
    server: httpServer,
    perMessageDeflate: true, // Enable compression
    maxPayload: 1024 * 1024 // 1MB max payload
});

wss.on("connection", (ws, req) => {
    // Check connection limits
    if (clients.size >= MAX_CONNECTIONS_PER_SSN) {
        console.warn(`[SSN] Connection limit reached. Rejecting new connection.`);
        ws.close(1013, "Server overloaded");
        return;
    }
    
    const nodeId = uuidv4();
    const clientInfo = {
        ws: ws,
        metadata: { 
            nodeId, 
            userName: `Guest-${Math.floor(Math.random() * 1000)}`, 
            userBio: '', 
            region: SSN_REGION,
            capabilities: [],
            connectionTime: Date.now()
        },
        lastSeen: Date.now()
    };
    
    clients.set(nodeId, clientInfo);
    peerMetadata.set(nodeId, { ...clientInfo.metadata, ssnId: SSN_ID });
    
    metrics.totalConnections++;
    
    console.log(`[SSN] Client connected: ${nodeId} (Total: ${clients.size})`);

    // Send enhanced connection confirmation
    ws.send(JSON.stringify({ 
        type: "connected", 
        nodeId: nodeId, 
        ssnId: SSN_ID,
        region: SSN_REGION,
        serverCapabilities: ['crdt_sync', 'distributed_state', 'load_balancing'],
        timestamp: Date.now()
    }));

    // Handle messages from peers with enhanced processing
    ws.on("message", (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            const startTime = Date.now();
            
            metrics.totalMessages++;
            
            console.log(`[SSN] Message from ${nodeId}:`, parsedMessage.type);

            switch (parsedMessage.type) {
                case "register":
                    handlePeerRegistration(nodeId, parsedMessage);
                    break;
                case "signal":
                    handleSignalingMessage(nodeId, parsedMessage);
                    break;
                case "peer_discovery_request":
                    handlePeerDiscoveryRequest(nodeId, ws, parsedMessage);
                    break;
                case "heartbeat":
                    handleHeartbeat(nodeId);
                    break;
                case "ssn_peer_update":
                    handleSSNPeerUpdate(parsedMessage);
                    break;
                case "crdt_sync":
                    handleCRDTSync(nodeId, parsedMessage);
                    break;
                case "state_update":
                    handleStateUpdate(nodeId, parsedMessage);
                    break;
                default:
                    console.warn(`[SSN] Unknown message type: ${parsedMessage.type}`);
                    metrics.errorCount++;
            }
            
            // Update latency metrics
            const processingTime = Date.now() - startTime;
            metrics.averageLatency = (metrics.averageLatency + processingTime) / 2;
            
        } catch (e) {
            console.error(`[SSN] Error parsing message from ${nodeId}:`, e);
            metrics.errorCount++;
        }
    });

    ws.on("close", () => {
        console.log(`[SSN] Client disconnected: ${nodeId} (Remaining: ${clients.size - 1})`);
        clients.delete(nodeId);
        peerMetadata.delete(nodeId);
        broadcastPeerList();
    });

    ws.on("error", (error) => {
        console.error(`[SSN] WebSocket error for ${nodeId}:`, error);
        metrics.errorCount++;
    });
});

// Enhanced message handlers
function handlePeerRegistration(nodeId, message) {
    const clientInfo = clients.get(nodeId);
    if (clientInfo) {
        clientInfo.metadata = { ...clientInfo.metadata, ...message.metadata, lastSeen: Date.now() };
        peerMetadata.set(nodeId, { ...clientInfo.metadata, ssnId: SSN_ID });
        console.log(`[SSN] Peer registered: ${nodeId} (${clientInfo.metadata.userName})`);
        broadcastPeerList(clientInfo.metadata);
    }
}

function handleSignalingMessage(nodeId, message) {
    metrics.totalSignalingMessages++;
    const targetPeerId = message.targetId;
    const targetClient = clients.get(targetPeerId);
    
    if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
        targetClient.ws.send(JSON.stringify({ 
            type: "signal", 
            senderId: nodeId, 
            signal: message.signal,
            timestamp: Date.now()
        }));
    } else {
        // Try to find peer in other SSNs
        const targetPeer = peerMetadata.get(targetPeerId);
        if (targetPeer && targetPeer.ssnId !== SSN_ID) {
            forwardMessageToSSN(targetPeer.ssnId, {
                type: "forward_signal",
                targetId: targetPeerId,
                senderId: nodeId,
                signal: message.signal
            });
        } else {
            const senderClient = clients.get(nodeId);
            if (senderClient && senderClient.ws.readyState === WebSocket.OPEN) {
                senderClient.ws.send(JSON.stringify({ 
                    type: "error", 
                    message: `Peer ${targetPeerId} not found.`,
                    timestamp: Date.now()
                }));
            }
        }
    }
}

function handlePeerDiscoveryRequest(nodeId, ws, message) {
    metrics.totalPeerDiscoveryRequests++;
    const allPeers = Array.from(peerMetadata.values());
    
    // Enhanced peer discovery with filtering and prioritization
    let filteredPeers = allPeers;
    
    if (message.filters) {
        if (message.filters.region) {
            filteredPeers = filteredPeers.filter(p => p.region === message.filters.region);
        }
        if (message.filters.capabilities) {
            filteredPeers = filteredPeers.filter(p => 
                message.filters.capabilities.some(cap => p.capabilities.includes(cap))
            );
        }
    }
    
    // Limit results and prioritize by proximity/activity
    const maxResults = message.maxResults || 50;
    const sortedPeers = filteredPeers
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, maxResults);
    
    ws.send(JSON.stringify({ 
        type: "peer_list", 
        peers: sortedPeers,
        totalAvailable: allPeers.length,
        filtered: filteredPeers.length,
        timestamp: Date.now()
    }));
}

function handleHeartbeat(nodeId) {
    const clientInfo = clients.get(nodeId);
    if (clientInfo) {
        clientInfo.lastSeen = Date.now();
        if (peerMetadata.has(nodeId)) {
            peerMetadata.get(nodeId).lastSeen = Date.now();
        }
    }
}

function handleSSNPeerUpdate(message) {
    message.peers.forEach(p => {
        if (!peerMetadata.has(p.nodeId) || peerMetadata.get(p.nodeId).lastSeen < p.lastSeen) {
            peerMetadata.set(p.nodeId, { ...p, ssnId: message.senderSsnId });
        }
    });
    console.log(`[SSN] Received peer update from SSN ${message.senderSsnId}. Total peers: ${peerMetadata.size}`);
}

function handleCRDTSync(nodeId, message) {
    // Forward CRDT sync messages to relevant peers
    const targetPeers = message.targetPeers || [];
    targetPeers.forEach(targetId => {
        const targetClient = clients.get(targetId);
        if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
            targetClient.ws.send(JSON.stringify({
                type: "crdt_sync",
                senderId: nodeId,
                data: message.data,
                timestamp: Date.now()
            }));
        }
    });
}

function handleStateUpdate(nodeId, message) {
    // Broadcast state updates to subscribed peers
    const subscribers = message.subscribers || [];
    subscribers.forEach(subscriberId => {
        const subscriberClient = clients.get(subscriberId);
        if (subscriberClient && subscriberClient.ws.readyState === WebSocket.OPEN) {
            subscriberClient.ws.send(JSON.stringify({
                type: "state_update",
                senderId: nodeId,
                state: message.state,
                timestamp: Date.now()
            }));
        }
    });
}

// Enhanced SSN interconnection with health monitoring
function connectToOtherSSN(ssnUrl) {
    const ssnWs = new WebSocket(ssnUrl);
    const tempId = uuidv4();
    
    const connectionInfo = {
        ws: ssnWs,
        lastPing: Date.now(),
        isHealthy: false,
        region: 'unknown'
    };
    
    ssnConnections.set(tempId, connectionInfo);

    ssnWs.on('open', () => {
        console.log(`[SSN] Connected to external SSN: ${ssnUrl}`);
        connectionInfo.isHealthy = true;
        ssnWs.send(JSON.stringify({ 
            type: 'ssn_register', 
            ssnId: SSN_ID, 
            region: SSN_REGION,
            capabilities: ['enhanced_routing', 'load_balancing', 'health_monitoring']
        }));
    });

    ssnWs.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            connectionInfo.lastPing = Date.now();
            
            switch (parsedMessage.type) {
                case 'ssn_registered':
                    const realSsnId = parsedMessage.ssnId;
                    ssnConnections.delete(tempId);
                    connectionInfo.region = parsedMessage.region || 'unknown';
                    ssnConnections.set(realSsnId, connectionInfo);
                    console.log(`[SSN] Remote SSN ${ssnUrl} registered as ${realSsnId}`);
                    break;
                case 'ssn_peer_update':
                    handleSSNPeerUpdate(parsedMessage);
                    break;
                case 'forward_signal':
                    handleForwardedSignal(parsedMessage);
                    break;
                case 'health_check':
                    ssnWs.send(JSON.stringify({ type: 'health_response', ssnId: SSN_ID, timestamp: Date.now() }));
                    break;
                default:
                    console.warn(`[SSN] Unknown message type from remote SSN: ${parsedMessage.type}`);
            }
        } catch (e) {
            console.error(`[SSN] Error parsing message from remote SSN ${ssnUrl}:`, e);
        }
    });

    ssnWs.on('close', () => {
        console.log(`[SSN] Disconnected from external SSN: ${ssnUrl}`);
        connectionInfo.isHealthy = false;
        // Attempt reconnection after delay
        setTimeout(() => connectToOtherSSN(ssnUrl), 30000);
    });

    ssnWs.on('error', (error) => {
        console.error(`[SSN] SSN connection error to ${ssnUrl}:`, error);
        connectionInfo.isHealthy = false;
    });
}

function handleForwardedSignal(message) {
    const targetClient = clients.get(message.targetId);
    if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
        targetClient.ws.send(JSON.stringify({
            type: "signal",
            senderId: message.senderId,
            signal: message.signal,
            timestamp: Date.now()
        }));
    }
}

function forwardMessageToSSN(targetSSNId, message) {
    const ssnConnection = ssnConnections.get(targetSSNId);
    if (ssnConnection && ssnConnection.ws.readyState === WebSocket.OPEN && ssnConnection.isHealthy) {
        ssnConnection.ws.send(JSON.stringify(message));
    }
}

// Enhanced broadcasting with optimizations
function broadcastPeerList(updatedPeer = null) {
    const allPeers = Array.from(peerMetadata.values());
    const message = updatedPeer ? 
        { type: "peer_update", peer: updatedPeer, timestamp: Date.now() } :
        { type: "peer_list", peers: allPeers, timestamp: Date.now() };

    // Broadcast to local clients with rate limiting
    let broadcastCount = 0;
    clients.forEach(clientInfo => {
        if (clientInfo.ws.readyState === WebSocket.OPEN && broadcastCount < 1000) {
            clientInfo.ws.send(JSON.stringify(message));
            broadcastCount++;
        }
    });

    // Broadcast to connected SSN nodes
    ssnConnections.forEach(connectionInfo => {
        if (connectionInfo.ws.readyState === WebSocket.OPEN && connectionInfo.isHealthy) {
            connectionInfo.ws.send(JSON.stringify({
                type: 'ssn_peer_update',
                senderSsnId: SSN_ID,
                peers: updatedPeer ? [updatedPeer] : allPeers,
                timestamp: Date.now()
            }));
        }
    });
}

// Enhanced health monitoring and cleanup
setInterval(() => {
    const now = Date.now();
    
    // Health check for clients
    clients.forEach((clientInfo, nodeId) => {
        if (clientInfo.ws.readyState === WebSocket.OPEN) {
            clientInfo.ws.ping();
        }
        
        // Clean up stale connections
        if (now - clientInfo.lastSeen > HEARTBEAT_INTERVAL * 3) {
            console.log(`[SSN] Cleaning up stale client: ${nodeId}`);
            clients.delete(nodeId);
            peerMetadata.delete(nodeId);
        }
    });
    
    // Health check for SSN connections
    ssnConnections.forEach((connectionInfo, ssnId) => {
        if (connectionInfo.ws.readyState === WebSocket.OPEN) {
            connectionInfo.ws.send(JSON.stringify({ type: 'health_check', ssnId: SSN_ID }));
        }
        
        if (now - connectionInfo.lastPing > HEARTBEAT_INTERVAL * 2) {
            connectionInfo.isHealthy = false;
        }
    });
    
    // Clean up old peer metadata from other SSNs
    peerMetadata.forEach((metadata, nodeId) => {
        if (metadata.ssnId !== SSN_ID && now - metadata.lastSeen > CLEANUP_INTERVAL * 2) {
            peerMetadata.delete(nodeId);
        }
    });
    
}, HEARTBEAT_INTERVAL);

// Connect to other SSN nodes
OTHER_SSN_NODES.forEach(url => connectToOtherSSN(url));

// Start the enhanced HTTP and WebSocket server
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[SSN] Enhanced Signaling Server Node running on port ${PORT}`);
    console.log(`[SSN] Dashboard available at http://localhost:${PORT}/dashboard`);
    console.log(`[SSN] Health check at http://localhost:${PORT}/health`);
    console.log(`[SSN] Metrics endpoint at http://localhost:${PORT}/metrics`);
});

// Enhanced graceful shutdown
function gracefulShutdown() {
    console.log("[SSN] Shutting down gracefully...");
    
    // Notify all connected clients
    clients.forEach(clientInfo => {
        if (clientInfo.ws.readyState === WebSocket.OPEN) {
            clientInfo.ws.send(JSON.stringify({ type: "server_shutdown", timestamp: Date.now() }));
        }
    });
    
    // Notify other SSNs
    ssnConnections.forEach(connectionInfo => {
        if (connectionInfo.ws.readyState === WebSocket.OPEN) {
            connectionInfo.ws.send(JSON.stringify({ type: "ssn_shutdown", ssnId: SSN_ID }));
        }
    });
    
    setTimeout(() => {
        wss.close(() => {
            console.log("[SSN] WebSocket server closed.");
            httpServer.close(() => {
                console.log("[SSN] HTTP server closed.");
                process.exit(0);
            });
        });
    }, 5000);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

