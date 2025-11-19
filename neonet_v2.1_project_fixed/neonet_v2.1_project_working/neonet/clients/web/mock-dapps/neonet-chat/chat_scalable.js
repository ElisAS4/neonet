import { PeerManagerScalable } from "../../src/utils/PeerManager_scalable.js";

const myNodeIdSpan = document.getElementById("myNodeId");
const myUserNameSpan = document.getElementById("myUserName");
const peerListDiv = document.getElementById("peerList");
const chatHeaderDiv = document.getElementById("chatHeader");
const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");

let peerManager;
let myNodeId;
let myUserName;
let activePeerId = null;
const chatHistory = new Map(); // Map<peerId, [{ sender: string, message: string, timestamp: number }]>

export function initChatDApp() {
    myNodeId = localStorage.getItem("neonet_node_id");
    myUserName = localStorage.getItem("neonet_user_name");

    if (!myNodeId || !myUserName) {
        console.error("NeoNet: User ID or Name not found. Please connect to NeoNet main page first.");
        // Optionally, redirect or show a message to the user
        return;
    }

    myNodeIdSpan.textContent = myNodeId.substring(0, 8) + "...";
    myUserNameSpan.textContent = myUserName;

    peerManager = new PeerManagerScalable({
        signalingServerUrl: "ws://localhost:8080", // Use o mesmo servidor de sinalização
        onPeerJoined: handlePeerJoined,
        onPeerLeft: handlePeerLeft,
        onConnectionStatusChanged: handleConnectionStatusChanged,
        onMessage: handlePeerMessage
    });

    // Connect to the network if not already connected
    peerManager.connect({ userName: myUserName, userBio: localStorage.getItem("neonet_user_bio") || "" });

    sendMessageBtn.addEventListener("click", sendMessage);
    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendMessage();
        }
    });

    updatePeerList(); // Initial update
}

function handlePeerJoined(peer) {
    console.log("[Chat] Peer Joined:", peer);
    updatePeerList();
}

function handlePeerLeft(peer) {
    console.log("[Chat] Peer Left:", peer);
    if (activePeerId === peer.nodeId) {
        activePeerId = null;
        chatHeaderDiv.textContent = "Selecione um peer para conversar";
        messagesDiv.innerHTML = "";
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
    }
    updatePeerList();
}

function handleConnectionStatusChanged(status) {
    console.log("[Chat] Connection Status:", status);
    if (status === "disconnected") {
        console.warn("NeoNet Chat: Desconectado do servidor de sinalização.");
        // Optionally, disable chat functionality
    }
}

function handlePeerMessage(senderId, message) {
    console.log("[Chat] Message from", senderId, ":", message);
    if (message.type === "chat_message") {
        addMessageToHistory(senderId, { sender: peerManager.getPeerMetadata(senderId)?.userName || senderId.substring(0, 8) + "...", message: message.text, timestamp: Date.now() });
        if (activePeerId === senderId) {
            displayMessage({ sender: peerManager.getPeerMetadata(senderId)?.userName || senderId.substring(0, 8) + "...", message: message.text, timestamp: Date.now() }, "received");
        }
    }
}

function updatePeerList() {
    const peers = peerManager.getAllKnownPeers().filter(p => p.nodeId !== myNodeId);
    peerListDiv.innerHTML = "";
    if (peers.length === 0) {
        peerListDiv.innerHTML = 
            `<div style="text-align: center; padding: 20px; opacity: 0.7;">Nenhum peer conectado.</div>`;
        return;
    }

    peers.forEach(peer => {
        const peerItem = document.createElement("div");
        peerItem.className = `peer-item ${activePeerId === peer.nodeId ? "active" : ""}`;
        peerItem.innerHTML = `
            <div class="peer-avatar">${peer.userName.charAt(0).toUpperCase()}</div>
            <div>
                <div>${escapeHtml(peer.userName)}</div>
                <div style="font-size: 0.7rem; opacity: 0.8;">${peer.nodeId.substring(0, 8)}...</div>
            </div>
        `;
        peerItem.onclick = () => selectPeer(peer.nodeId);
        peerListDiv.appendChild(peerItem);
    });
}

function selectPeer(peerId) {
    activePeerId = peerId;
    const peer = peerManager.getPeerMetadata(peerId);
    chatHeaderDiv.textContent = `Conversando com: ${peer.userName}`;
    messageInput.disabled = false;
    sendMessageBtn.disabled = false;
    displayChatHistory(peerId);
    updatePeerList(); // Update active state in list
}

function sendMessage() {
    if (!activePeerId || messageInput.value.trim() === "") return;

    const messageText = messageInput.value.trim();
    const messagePayload = { type: "chat_message", text: messageText };

    const sent = peerManager.sendDataToPeer(activePeerId, messagePayload);
    
    if (sent) {
        addMessageToHistory(activePeerId, { sender: myUserName, message: messageText, timestamp: Date.now() });
        displayMessage({ sender: myUserName, message: messageText, timestamp: Date.now() }, "sent");
        messageInput.value = "";
    } else {
        alert("Não foi possível enviar a mensagem. Peer offline ou conexão P2P não estabelecida.");
    }
}

function addMessageToHistory(peerId, message) {
    if (!chatHistory.has(peerId)) {
        chatHistory.set(peerId, []);
    }
    chatHistory.get(peerId).push(message);
}

function displayChatHistory(peerId) {
    messagesDiv.innerHTML = "";
    const history = chatHistory.get(peerId) || [];
    history.forEach(msg => {
        const type = msg.sender === myUserName ? "sent" : "received";
        displayMessage(msg, type);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom
}

function displayMessage(msg, type) {
    const messageBubble = document.createElement("div");
    messageBubble.className = `message-bubble ${type}`;
    messageBubble.innerHTML = `
        <div class="message-sender">${msg.sender} (${new Date(msg.timestamp).toLocaleTimeString()})</div>
        <div>${escapeHtml(msg.message)}</div>
    `;
    messagesDiv.appendChild(messageBubble);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}


