const WebSocket = require("ws");
const http = require("http");
const { v4: uuidv4 } = require("uuid");

const PORT = process.env.PORT || 8080;
const HEARTBEAT_INTERVAL = 30 * 1000; // 30 segundos
const PEER_DISCOVERY_INTERVAL = 5 * 1000; // 5 segundos

// --- Signaling Server Network (SSN) Configuration ---
// In a real-world scenario, this would be dynamically managed or configured via a discovery service.
// For this simulation, we'll use a simple hardcoded list of other SSNs.
const OTHER_SSN_NODES = [
    // 'ws://other-ssn-node-1.example.com:8080',
    // 'ws://other-ssn-node-2.example.com:8080',
];

// Map to store connected clients (peers)
const clients = new Map(); // nodeId -> WebSocket

// Map to store peer metadata (userName, bio, etc.)
const peerMetadata = new Map(); // nodeId -> { userName, userBio, lastSeen, ssnId }

// Map to store connections to other SSN nodes
const ssnConnections = new Map(); // ssnId -> WebSocket

// Unique ID for this SSN node
const SSN_ID = uuidv4();
console.log(`[SSN] This Signaling Server Node ID: ${SSN_ID}`);

// --- HTTP Server for Dashboard/Health Checks ---
const httpServer = http.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", ssnId: SSN_ID, connectedPeers: clients.size, connectedSSNs: ssnConnections.size }));
    } else if (req.url === "/dashboard") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>NeoNet SSN Dashboard</title>
                <style>
                    body { font-family: sans-serif; margin: 20px; background-color: #f4f4f4; color: #333; }
                    .container { max-width: 800px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    h1, h2 { color: #0056b3; }
                    pre { background: #eee; padding: 10px; border-radius: 4px; overflow-x: auto; }
                    .status-ok { color: green; font-weight: bold; }
                    .status-warn { color: orange; font-weight: bold; }
                    .status-error { color: red; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>NeoNet Signaling Server Node Dashboard</h1>
                    <p><strong>SSN ID:</strong> ${SSN_ID}</p>
                    <p><strong>Status:</strong> <span class="status-ok">Running</span></p>
                    <h2>Connected Peers (${clients.size})</h2>
                    <pre id="peersData"></pre>
                    <h2>Connected SSN Nodes (${ssnConnections.size})</h2>
                    <pre id="ssnData"></pre>
                </div>
                <script>
                    function updateDashboard() {
                        fetch("/health")
                            .then(res => res.json())
                            .then(data => {
                                document.querySelector(".status-ok").textContent = data.status;
                            });
                        fetch("/peers")
                            .then(res => res.json())
                            .then(data => {
                                document.getElementById("peersData").textContent = JSON.stringify(data, null, 2);
                            });
                        fetch("/ssns")
                            .then(res => res.json())
                            .then(data => {
                                document.getElementById("ssnData").textContent = JSON.stringify(data, null, 2);
                            });
                    }
                    setInterval(updateDashboard, 2000);
                    updateDashboard();
                </script>
            </body>
            </html>
        `);
    } else if (req.url === "/peers") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const peersArray = Array.from(peerMetadata.values());
        res.end(JSON.stringify(peersArray));
    } else if (req.url === "/ssns") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const ssnArray = Array.from(ssnConnections.keys()).map(id => ({ ssnId: id, status: ssnConnections.get(id).readyState === WebSocket.OPEN ? 'connected' : 'disconnected' }));
        res.end(JSON.stringify(ssnArray));
    } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
    }
});

// --- WebSocket Server ---
const wss = new WebSocket.Server({ server: httpServer });

wss.on("connection", (ws, req) => {
    const nodeId = uuidv4(); // Assign a unique ID to each connecting peer
    clients.set(nodeId, ws);
    peerMetadata.set(nodeId, { nodeId, userName: `Guest-${Math.floor(Math.random() * 1000)}`, userBio: '', lastSeen: Date.now(), ssnId: SSN_ID });

    console.log(`[SSN] Client connected: ${nodeId}`);

    // Send initial connection confirmation and assigned ID to the client
    ws.send(JSON.stringify({ type: "connected", nodeId: nodeId, ssnId: SSN_ID }));

    // Handle messages from peers
    ws.on("message", (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log(`[SSN] Message from ${nodeId}:`, parsedMessage.type);

            switch (parsedMessage.type) {
                case "register":
                    // Peer registers its metadata (name, bio)
                    peerMetadata.set(nodeId, { ...peerMetadata.get(nodeId), ...parsedMessage.metadata, lastSeen: Date.now() });
                    console.log(`[SSN] Peer registered: ${nodeId} (${peerMetadata.get(nodeId).userName})`);
                    // Notify all connected peers (and other SSNs) about the new peer
                    broadcastPeerList(peerMetadata.get(nodeId));
                    break;
                case "signal":
                    // Relay signaling messages between peers
                    const targetPeerId = parsedMessage.targetId;
                    const targetWs = clients.get(targetPeerId);
                    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                        targetWs.send(JSON.stringify({ type: "signal", senderId: nodeId, signal: parsedMessage.signal }));
                    } else {
                        console.warn(`[SSN] Target peer ${targetPeerId} not found or not open.`);
                        ws.send(JSON.stringify({ type: "error", message: `Peer ${targetPeerId} not found.` }));
                    }
                    break;
                case "peer_discovery_request":
                    // A peer is asking for a list of other peers
                    ws.send(JSON.stringify({ type: "peer_list", peers: Array.from(peerMetadata.values()) }));
                    break;
                case "heartbeat":
                    // Update lastSeen for the peer
                    if (peerMetadata.has(nodeId)) {
                        peerMetadata.get(nodeId).lastSeen = Date.now();
                    }
                    break;
                case "ssn_peer_update":
                    // Message from another SSN about its peers
                    parsedMessage.peers.forEach(p => {
                        // Only add/update if this SSN doesn't have a more recent record
                        if (!peerMetadata.has(p.nodeId) || peerMetadata.get(p.nodeId).lastSeen < p.lastSeen) {
                            peerMetadata.set(p.nodeId, { ...p, ssnId: parsedMessage.senderSsnId });
                        }
                    });
                    console.log(`[SSN] Received peer update from SSN ${parsedMessage.senderSsnId}. Total peers: ${peerMetadata.size}`);
                    broadcastPeerList(p); // Propagate updated list
                    break;
                default:
                    console.warn(`[SSN] Unknown message type: ${parsedMessage.type}`);
            }
        } catch (e) {
            console.error(`[SSN] Error parsing message from ${nodeId}:`, e);
        }
    });

    ws.on("close", () => {
        console.log(`[SSN] Client disconnected: ${nodeId}`);
        clients.delete(nodeId);
        peerMetadata.delete(nodeId);
        broadcastPeerList(); // Notify others about disconnected peer
    });

    ws.on("error", (error) => {
        console.error(`[SSN] WebSocket error for ${nodeId}:`, error);
    });
});

// --- SSN Interconnection Logic ---
function connectToOtherSSN(ssnUrl) {
    const ssnWs = new WebSocket(ssnUrl);
    const ssnId = uuidv4(); // Assign a temporary ID until real one is received
    ssnConnections.set(ssnId, ssnWs);

    ssnWs.on('open', () => {
        console.log(`[SSN] Connected to external SSN: ${ssnUrl}`);
        // Register this SSN with the remote SSN
        ssnWs.send(JSON.stringify({ type: 'ssn_register', ssnId: SSN_ID }));
        // Request initial peer list from remote SSN
        ssnWs.send(JSON.stringify({ type: 'ssn_peer_discovery_request', senderSsnId: SSN_ID }));
    });

    ssnWs.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            switch (parsedMessage.type) {
                case 'ssn_registered':
                    // Remote SSN confirmed registration and sent its real ID
                    const realSsnId = parsedMessage.ssnId;
                    if (ssnConnections.has(ssnId)) {
                        ssnConnections.delete(ssnId);
                    }
                    ssnConnections.set(realSsnId, ssnWs);
                    console.log(`[SSN] Remote SSN ${ssnUrl} registered as ${realSsnId}`);
                    break;
                case 'ssn_peer_update':
                    // Receive peer updates from remote SSN
                    parsedMessage.peers.forEach(p => {
                        if (!peerMetadata.has(p.nodeId) || peerMetadata.get(p.nodeId).lastSeen < p.lastSeen) {
                            peerMetadata.set(p.nodeId, { ...p, ssnId: parsedMessage.senderSsnId });
                        }
                    });
                    console.log(`[SSN] Received peer update from remote SSN ${parsedMessage.senderSsnId}. Total peers: ${peerMetadata.size}`);
                    broadcastPeerList(p); // Propagate to local clients and other SSNs
                    break;
                case 'ssn_peer_discovery_request':
                    // Another SSN is requesting our peer list
                    ssnWs.send(JSON.stringify({ type: 'ssn_peer_update', senderSsnId: SSN_ID, peers: Array.from(peerMetadata.values()) }));
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
        // Remove from ssnConnections map
        for (let [key, value] of ssnConnections.entries()) {
            if (value === ssnWs) {
                ssnConnections.delete(key);
                break;
            }
        }
        // Clean up peers associated with this SSN (optional, depending on desired behavior)
    });

    ssnWs.on('error', (error) => {
        console.error(`[SSN] SSN connection error to ${ssnUrl}:`, error);
    });
}

// Connect to pre-configured other SSN nodes
OTHER_SSN_NODES.forEach(url => connectToOtherSSN(url));

// --- Broadcasting and Health Checks ---
function broadcastPeerList(updatedPeer = null) {
    const allPeers = Array.from(peerMetadata.values());

    // Send full list to newly connected peers or on specific request
    // For existing peers, send only updates if 'updatedPeer' is provided

    // Broadcast to local clients
    clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            if (updatedPeer) {
                // Send only the updated peer to existing clients
                ws.send(JSON.stringify({ type: "peer_update", peer: updatedPeer }));
            } else {
                // Send full list (e.g., on initial connection or significant change)
                ws.send(JSON.stringify({ type: "peer_list", peers: allPeers }));
            }
        }
    });

    // Broadcast to connected SSN nodes
    ssnConnections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            if (updatedPeer) {
                ws.send(JSON.stringify({ type: 'ssn_peer_update', senderSsnId: SSN_ID, peers: [updatedPeer] }));
            } else {
                ws.send(JSON.stringify({ type: 'ssn_peer_update', senderSsnId: SSN_ID, peers: allPeers }));
            }
        }
    });
}

// Heartbeat to check client liveness
setInterval(() => {
    clients.forEach((ws, nodeId) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping(); // Send a ping frame
        } else {
            // If not open, it will be handled by 'close' event
        }
    });

    // Clean up old peer metadata (e.g., if a client disconnected without proper close)
    const now = Date.now();
    for (let [nodeId, metadata] of peerMetadata.entries()) {
        if (now - metadata.lastSeen > HEARTBEAT_INTERVAL * 2) { // If not seen for 2 heartbeats
            if (!clients.has(nodeId)) { // Only remove if not a currently connected client
                peerMetadata.delete(nodeId);
                console.log(`[SSN] Cleaned up stale peer: ${nodeId}`);
                broadcastPeerList();
            }
        }
    }
}, HEARTBEAT_INTERVAL);

// Periodically send peer list to other SSNs (for eventual consistency)
setInterval(() => {
    ssnConnections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ssn_peer_update', senderSsnId: SSN_ID, peers: Array.from(peerMetadata.values()) }));
        }
    });
}, PEER_DISCOVERY_INTERVAL);

// Start the HTTP and WebSocket server
httpServer.listen(PORT, () => {
    console.log(`[SSN] Signaling Server Node running on port ${PORT}`);
    console.log(`[SSN] Dashboard available at http://localhost:${PORT}/dashboard`);
    console.log(`[SSN] Health check at http://localhost:${PORT}/health`);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
    console.log("[SSN] Shutting down gracefully...");
    wss.close(() => {
        console.log("[SSN] WebSocket server closed.");
        httpServer.close(() => {
            console.log("[SSN] HTTP server closed.");
            process.exit(0);
        });
    });
});

process.on("SIGINT", () => {
    console.log("[SSN] Shutting down gracefully...");
    wss.close(() => {
        console.log("[SSN] WebSocket server closed.");
        httpServer.close(() => {
            console.log("[SSN] HTTP server closed.");
            process.exit(0);
        });
    });
});


