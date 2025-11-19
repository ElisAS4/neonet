import { PeerManagerScalable } from "./utils/PeerManager_scalable.js";

// This file serves as the main entry point for the Webpack build.
// It will initialize the core NeoNet application logic.

// Get references to main page elements
const userNameInput = document.getElementById("userNameInput");
const connectBtn = document.getElementById("connectBtn");
const connectionStatus = document.getElementById("connectionStatus");
const myNodeIdSpan = document.getElementById("myNodeId");
const peerListUl = document.getElementById("peerList");
const peerCountSpan = document.getElementById("peerCount");

let peerManager;
let myNodeId = localStorage.getItem("neonet_node_id") || `node_${Date.now()}`;
let myUserName = localStorage.getItem("neonet_user_name") || "Usuário NeoNet";

// Set initial values
userNameInput.value = myUserName;
myNodeIdSpan.textContent = myNodeId.substring(0, 8) + "...";

// Save to localStorage for dApps to use
localStorage.setItem("neonet_node_id", myNodeId);
localStorage.setItem("neonet_user_name", myUserName);

connectBtn.addEventListener("click", () => {
    myUserName = userNameInput.value.trim();
    if (!myUserName) {
        alert("Por favor, insira um nome de usuário.");
        return;
    }
    localStorage.setItem("neonet_user_name", myUserName);

    connectBtn.disabled = true;
    connectionStatus.textContent = "Conectando...";

    peerManager = new PeerManagerScalable({
        signalingServerUrl: "wss://api.munduuu.com", // Servidor de sinalização de Produção
        onPeerJoined: handlePeerJoined,
        onPeerLeft: handlePeerLeft,
        onConnectionStatusChanged: handleConnectionStatusChanged,
        onMessage: handlePeerMessage
    });

    peerManager.connect({ userName: myUserName, userBio: "" }); // userBio pode ser adicionado depois
});

function handlePeerJoined(peer) {
    console.log("[Main] Peer Joined:", peer);
    updatePeerList();
}

function handlePeerLeft(peer) {
    console.log("[Main] Peer Left:", peer);
    updatePeerList();
}

function handleConnectionStatusChanged(status) {
    console.log("[Main] Connection Status:", status);
    connectionStatus.textContent = `Status: ${status}`;
    if (status === "connected") {
        connectBtn.textContent = "Conectado";
        connectBtn.disabled = true;
        userNameInput.disabled = true;
    } else {
        connectBtn.textContent = "Conectar";
        connectBtn.disabled = false;
        userNameInput.disabled = false;
    }
    updatePeerList();
}

function handlePeerMessage(senderId, message) {
    console.log("[Main] Message from", senderId, ":", message);
    // Main page can handle global messages or just log them
}

function updatePeerList() {
    const peers = peerManager ? peerManager.getAllKnownPeers().filter(p => p.nodeId !== myNodeId) : [];
    peerListUl.innerHTML = "";
    peerCountSpan.textContent = peers.length;

    if (peers.length === 0) {
        const li = document.createElement("li");
        li.textContent = "Nenhum peer conectado ainda.";
        peerListUl.appendChild(li);
        return;
    }

    peers.forEach(peer => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${escapeHtml(peer.userName)}</span> (${peer.nodeId.substring(0, 8)}...)`;
        peerListUl.appendChild(li);
    });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// Initial update of peer list
updatePeerList();


