import { PeerManagerScalable } from "../../src/utils/PeerManager_scalable.js";

const myNodeIdSpan = document.getElementById("myNodeId");
const myUserNameSpan = document.getElementById("myUserName");
const videoChannelsDiv = document.getElementById("videoChannels");
const videoPlayerModal = document.getElementById("videoPlayerModal");
const videoPlayer = document.getElementById("videoPlayer");
const playerVideoTitle = document.getElementById("playerVideoTitle");
const playerVideoOwner = document.getElementById("playerVideoOwner");
const closePlayerBtn = document.getElementById("closePlayerBtn");

let peerManager;
let myNodeId;
let myUserName;
const peerVideoCatalogs = new Map(); // Map<peerId, [{ id, title, ownerId, ownerName, thumbnailUrl, duration, streamUrl }]>

export function initVideosDApp() {
    myNodeId = localStorage.getItem("neonet_node_id");
    myUserName = localStorage.getItem("neonet_user_name");

    if (!myNodeId || !myUserName) {
        console.error("NeoNet: User ID or Name not found. Please connect to NeoNet main page first.");
        return;
    }

    myNodeIdSpan.textContent = myNodeId.substring(0, 8) + "...";
    myUserNameSpan.textContent = myUserName;

    peerManager = new PeerManagerScalable({
        signalingServerUrl: "ws://localhost:8080",
        onPeerJoined: handlePeerJoined,
        onPeerLeft: handlePeerLeft,
        onConnectionStatusChanged: handleConnectionStatusChanged,
        onMessage: handlePeerMessage
    });

    peerManager.connect({ userName: myUserName, userBio: localStorage.getItem("neonet_user_bio") || "" });

    closePlayerBtn.addEventListener("click", closePlayerBtn);

    // Request catalogs from existing peers after connection
    peerManager.getAllKnownPeers().forEach(peer => {
        if (peer.nodeId !== myNodeId) {
            peerManager.sendDataToPeer(peer.nodeId, { type: "video_catalog_request" });
        }
    });
    updateVideoChannels(); // Initial render
}

function handlePeerJoined(peer) {
    console.log("[Videos] Peer Joined:", peer);
    // Request video catalog from the new peer
    peerManager.sendDataToPeer(peer.nodeId, { type: "video_catalog_request" });
    updateVideoChannels();
}

function handlePeerLeft(peer) {
    console.log("[Videos] Peer Left:", peer);
    peerVideoCatalogs.delete(peer.nodeId);
    updateVideoChannels();
}

function handleConnectionStatusChanged(status) {
    console.log("[Videos] Connection Status:", status);
    if (status === "disconnected") {
        console.warn("NeoNet Videos: Desconectado do servidor de sinalização.");
    }
}

function handlePeerMessage(senderId, message) {
    console.log("[Videos] Message from", senderId, ":", message);
    switch (message.type) {
        case "video_catalog_request":
            sendMyVideoCatalog(senderId);
            break;
        case "video_catalog_response":
            peerVideoCatalogs.set(senderId, message.catalog);
            updateVideoChannels();
            break;
        case "video_stream_request":
            const requestedVideo = getMyVideoById(message.videoId);
            if (requestedVideo) {
                peerManager.sendDataToPeer(senderId, { type: "video_stream_response", videoId: message.videoId, streamUrl: "https://www.w3schools.com/html/mov_bbb.mp4" }); // Example URL
            } else {
                peerManager.sendDataToPeer(senderId, { type: "video_stream_error", videoId: message.videoId, message: "Video not found" });
            }
            break;
        case "video_stream_response":
            if (videoPlayerModal.classList.contains("show") && videoPlayer.dataset.videoId === message.videoId) {
                videoPlayer.src = message.streamUrl;
                videoPlayer.play();
            }
            break;
        case "video_stream_error":
            if (videoPlayerModal.classList.contains("show") && videoPlayer.dataset.videoId === message.videoId) {
                alert(`Erro ao carregar vídeo: ${message.message}`);
                closeVideoPlayer();
            }
            break;
    }
}

function updateVideoChannels() {
    videoChannelsDiv.innerHTML = "";
    const allPeers = peerManager.getAllKnownPeers();

    if (allPeers.length === 0) {
        videoChannelsDiv.innerHTML = `
            <div class="empty-state">
                <div class="icon">🔍</div>
                <p>Conecte-se à rede para ver vídeos de outros peers.</p>
            </div>
        `;
        return;
    }

    // Add my own channel first
    const myVideos = getMyVideos();
    if (myVideos.length > 0) {
        renderVideoChannel(myNodeId, myUserName, myVideos);
    }

    // Add other peers\ channels
    allPeers.forEach(peer => {
        if (peer.nodeId !== myNodeId) {
            const videos = peerVideoCatalogs.get(peer.nodeId) || [];
            if (videos.length > 0) {
                renderVideoChannel(peer.nodeId, peer.userName, videos);
            }
        }
    });

    if (videoChannelsDiv.innerHTML === "") {
         videoChannelsDiv.innerHTML = `
            <div class="empty-state">
                <div class="icon">😔</div>
                <p>Nenhum vídeo disponível na rede no momento.</p>
            </div>
        `;
    }
}

function renderVideoChannel(ownerId, ownerName, videos) {
    const channelDiv = document.createElement("div");
    channelDiv.className = "peer-channel";
    channelDiv.innerHTML = `
        <h2 class="peer-channel-header">Canal de <span>${escapeHtml(ownerName)}</span></h2>
        <div class="video-grid" id="videoGrid-${ownerId}"></div>
    `;
    videoChannelsDiv.appendChild(channelDiv);

    const videoGrid = channelDiv.querySelector(`#videoGrid-${ownerId}`);
    videos.forEach(video => {
        const videoCard = document.createElement("div");
        videoCard.className = "video-card";
        videoCard.innerHTML = `
            <div class="video-thumbnail">
                ${video.thumbnailUrl ? `<img src="${escapeHtml(video.thumbnailUrl)}" alt="${escapeHtml(video.title)}">` : `▶️`}
                <span class="video-duration">${video.duration || "0:00"}</span>
            </div>
            <div class="video-info">
                <div class="video-title">${escapeHtml(video.title)}</div>
                <div class="video-owner">${escapeHtml(ownerName)}</div>
            </div>
        `;
        videoCard.onclick = () => playVideo(ownerId, video.id, video.title, ownerName);
        videoGrid.appendChild(videoCard);
    });
}

function getMyVideos() {
    // This is where a user\s local video library would be managed
    // For now, return mock videos
    return [
        { id: "my_video_1", title: "Meu Primeiro Vídeo Offline", ownerId: myNodeId, ownerName: myUserName, thumbnailUrl: "https://via.placeholder.com/320x180?text=Video+1", duration: "2:30" },
        { id: "my_video_2", title: "Aventura P2P", ownerId: myNodeId, ownerName: myUserName, thumbnailUrl: "https://via.placeholder.com/320x180?text=Video+2", duration: "5:15" },
    ];
}

function getMyVideoById(videoId) {
    return getMyVideos().find(v => v.id === videoId);
}

function sendMyVideoCatalog(targetPeerId) {
    const myCatalog = getMyVideos();
    peerManager.sendDataToPeer(targetPeerId, { type: "video_catalog_response", catalog: myCatalog });
}

function playVideo(ownerId, videoId, videoTitle, videoOwnerName) {
    playerVideoTitle.textContent = videoTitle;
    playerVideoOwner.textContent = `De: ${videoOwnerName}`;
    videoPlayerModal.classList.add("show");
    videoPlayer.src = ""; // Clear previous source
    videoPlayer.dataset.videoId = videoId; // Store video ID for response handling

    if (ownerId === myNodeId) {
        const video = getMyVideoById(videoId);
        if (video) {
            videoPlayer.src = "https://www.w3schools.com/html/mov_bbb.mp4"; // Use a dummy URL for local video
            videoPlayer.play();
        }
    } else {
        peerManager.sendDataToPeer(ownerId, { type: "video_stream_request", videoId: videoId });
        // The video will play when video_stream_response is received
    }
}

function closeVideoPlayer() {
    videoPlayer.pause();
    videoPlayer.src = "";
    videoPlayerModal.classList.remove("show");
    delete videoPlayer.dataset.videoId;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}


