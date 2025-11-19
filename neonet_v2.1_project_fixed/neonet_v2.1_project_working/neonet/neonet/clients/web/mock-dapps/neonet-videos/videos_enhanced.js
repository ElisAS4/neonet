// neonet/clients/web/mock-dapps/neonet-videos/videos_enhanced.js
// NeoNet Videos dApp - Sistema de Streaming P2P Offline-First

class NeoNetVideosEnhanced {
    constructor() {
        this.version = '1.0.0';
        this.videos = new Map();
        this.currentVideo = null;
        this.isOnline = navigator.onLine;
        this.currentCategory = 'all';
        this.currentView = 'grid';
        this.searchQuery = '';
        this.sortBy = 'date-desc';
        
        // Configurações
        this.config = {
            maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
            supportedFormats: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'm4v'],
            storageLimit: 1024 * 1024 * 1024, // 1GB
            chunkSize: 1024 * 1024, // 1MB
            maxPeers: 10,
            autoplay: false,
            defaultVolume: 50,
            autoShare: false,
            autoDownload: false
        };
        
        // Estado da aplicação
        this.state = {
            dbReady: false,
            p2pReady: false,
            uploading: false,
            sharing: false,
            downloading: false
        };
        
        // Estatísticas
        this.stats = {
            totalVideos: 0,
            totalSize: 0,
            totalDuration: 0,
            favoritesCount: 0,
            sharedCount: 0,
            peerCount: 0,
            downloadCount: 0
        };
        
        // P2P e sincronização
        this.nodeId = this.generateNodeId();
        this.peers = new Map();
        this.sharedVideos = new Set();
        this.downloadQueue = [];
        
        this.init();
    }
    
    async init() {
        try {
            console.log('[NeoNet Videos] Initializing version', this.version);
            
            // Inicializar banco de dados
            await this.initDatabase();
            
            // Inicializar elementos DOM
            this.initializeElements();
            
            // Configurar event listeners
            this.initializeEventListeners();
            
            // Carregar vídeos armazenados
            await this.loadStoredVideos();
            
            // Configurar P2P
            await this.initializeP2P();
            
            // Carregar configurações
            this.loadSettings();
            
            // Atualizar interface
            this.updateUI();
            
            // Registrar com NeoNet
            this.registerWithNeoNet();
            
            console.log('[NeoNet Videos] Initialization complete');
        } catch (error) {
            console.error('[NeoNet Videos] Initialization failed:', error);
            this.handleInitializationError(error);
        }
    }
    
    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('NeoNetVideosDB', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                this.state.dbReady = true;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store para vídeos
                if (!db.objectStoreNames.contains('videos')) {
                    const videoStore = db.createObjectStore('videos', { keyPath: 'id' });
                    videoStore.createIndex('title', 'title');
                    videoStore.createIndex('dateAdded', 'dateAdded');
                    videoStore.createIndex('size', 'size');
                    videoStore.createIndex('duration', 'duration');
                    videoStore.createIndex('category', 'category');
                    videoStore.createIndex('favorite', 'favorite');
                    videoStore.createIndex('shared', 'shared');
                }
                
                // Store para configurações
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
                
                // Store para peers
                if (!db.objectStoreNames.contains('peers')) {
                    const peerStore = db.createObjectStore('peers', { keyPath: 'id' });
                    peerStore.createIndex('lastSeen', 'lastSeen');
                    peerStore.createIndex('status', 'status');
                }
                
                // Store para downloads
                if (!db.objectStoreNames.contains('downloads')) {
                    const downloadStore = db.createObjectStore('downloads', { keyPath: 'id' });
                    downloadStore.createIndex('status', 'status');
                    downloadStore.createIndex('progress', 'progress');
                }
            };
        });
    }
    
    initializeElements() {
        // Elementos principais
        this.importBtn = document.getElementById('import-btn');
        this.fileInput = document.getElementById('file-input');
        this.searchInput = document.getElementById('search-input');
        this.sortSelect = document.getElementById('sort-select');
        this.viewSelect = document.getElementById('view-select');
        this.videoContainer = document.getElementById('video-container');
        this.emptyState = document.getElementById('empty-state');
        
        // Elementos de status
        this.connectionStatus = document.getElementById('connection-status');
        this.syncStatus = document.getElementById('sync-status');
        this.storageStatus = document.getElementById('storage-status');
        
        // Estatísticas
        this.totalVideosEl = document.getElementById('total-videos');
        this.totalSizeEl = document.getElementById('total-size');
        this.totalDurationEl = document.getElementById('total-duration');
        this.peerCountEl = document.getElementById('peer-count');
        this.sharedCountEl = document.getElementById('shared-count');
        this.downloadCountEl = document.getElementById('download-count');
        
        // Categorias
        this.categoryList = document.getElementById('category-list');
        
        // Player modal
        this.playerModal = document.getElementById('player-modal');
        this.videoPlayer = document.getElementById('video-player');
        this.playerTitle = document.getElementById('player-title');
        this.videoTitle = document.getElementById('video-title');
        this.videoDuration = document.getElementById('video-duration');
        this.videoSize = document.getElementById('video-size');
        this.videoFormat = document.getElementById('video-format');
        
        // Botões do player
        this.favoriteBtn = document.getElementById('favorite-btn');
        this.shareBtn = document.getElementById('share-btn');
        this.downloadBtn = document.getElementById('download-btn');
        this.deleteBtn = document.getElementById('delete-btn');
        this.closePlayerBtn = document.getElementById('close-player');
        
        // Modais
        this.shareModal = document.getElementById('share-modal');
        this.uploadModal = document.getElementById('upload-modal');
        this.settingsModal = document.getElementById('settings-modal');
        
        // Upload progress
        this.uploadProgressItem = document.getElementById('upload-progress-item');
        this.progressFill = document.getElementById('progress-fill');
        
        // Share elements
        this.shareLinkInput = document.getElementById('share-link');
        this.copyLinkBtn = document.getElementById('copy-link-btn');
        this.shareP2PBtn = document.getElementById('share-p2p-btn');
        this.qrCodeContainer = document.getElementById('qr-code');
        
        // Settings elements
        this.autoplaySettingEl = document.getElementById('autoplay-setting');
        this.volumeSettingEl = document.getElementById('volume-setting');
        this.volumeValueEl = document.getElementById('volume-value');
        this.autoShareSettingEl = document.getElementById('auto-share-setting');
        this.autoDownloadSettingEl = document.getElementById('auto-download-setting');
        this.storageLimitSettingEl = document.getElementById('storage-limit-setting');
        this.storageLimitValueEl = document.getElementById('storage-limit-value');
        this.clearCacheBtn = document.getElementById('clear-cache-btn');
    }
    
    initializeEventListeners() {
        // Import de vídeos
        this.importBtn?.addEventListener('click', () => this.openFileDialog());
        this.fileInput?.addEventListener('change', (e) => this.handleFileSelection(e));
        
        // Busca e filtros
        this.searchInput?.addEventListener('input', (e) => this.handleSearch(e.target.value));
        this.sortSelect?.addEventListener('change', (e) => this.handleSortChange(e.target.value));
        this.viewSelect?.addEventListener('change', (e) => this.handleViewChange(e.target.value));
        
        // Categorias
        this.categoryList?.addEventListener('click', (e) => this.handleCategoryClick(e));
        
        // Player
        this.closePlayerBtn?.addEventListener('click', () => this.closePlayer());
        this.favoriteBtn?.addEventListener('click', () => this.toggleFavorite());
        this.shareBtn?.addEventListener('click', () => this.openShareModal());
        this.downloadBtn?.addEventListener('click', () => this.downloadVideo());
        this.deleteBtn?.addEventListener('click', () => this.deleteVideo());
        
        // Share modal
        this.shareP2PBtn?.addEventListener('click', () => this.shareToP2P());
        this.copyLinkBtn?.addEventListener('click', () => this.copyShareLink());
        
        // Settings
        this.volumeSettingEl?.addEventListener('input', (e) => this.updateVolumeSetting(e.target.value));
        this.storageLimitSettingEl?.addEventListener('input', (e) => this.updateStorageLimitSetting(e.target.value));
        this.clearCacheBtn?.addEventListener('click', () => this.clearCache());
        
        // Conectividade
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Atalhos de teclado
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Eventos do NeoNet
        window.addEventListener('neonet-peer-connected', (e) => this.handlePeerConnected(e.detail));
        window.addEventListener('neonet-peer-disconnected', (e) => this.handlePeerDisconnected(e.detail));
        window.addEventListener('neonet-data-received', (e) => this.handleP2PData(e.detail));
        
        // Drag and drop
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => this.handleFileDrop(e));
    }
    
    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'o':
                    e.preventDefault();
                    this.openFileDialog();
                    break;
                case 'f':
                    e.preventDefault();
                    this.searchInput?.focus();
                    break;
                case 'Escape':
                    this.closeAllModals();
                    break;
            }
        }
        
        // Player controls
        if (this.playerModal?.classList.contains('active')) {
            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                case 'f':
                    if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        this.toggleFullscreen();
                    }
                    break;
                case 'Escape':
                    this.closePlayer();
                    break;
            }
        }
    }
    
    async loadStoredVideos() {
        try {
            const transaction = this.db.transaction(['videos'], 'readonly');
            const store = transaction.objectStore('videos');
            const request = store.getAll();
            
            request.onsuccess = () => {
                const videos = request.result;
                videos.forEach(video => {
                    this.videos.set(video.id, video);
                });
                
                this.updateStats();
                this.renderVideoList();
                
                console.log(`[NeoNet Videos] Loaded ${videos.length} videos`);
            };
        } catch (error) {
            console.error('[NeoNet Videos] Error loading videos:', error);
        }
    }
    
    async initializeP2P() {
        try {
            // Simular inicialização P2P
            this.state.p2pReady = true;
            console.log('[NeoNet Videos] P2P initialized');
        } catch (error) {
            console.error('[NeoNet Videos] P2P initialization failed:', error);
        }
    }
    
    loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('neonet-videos-settings') || '{}');
            
            this.config = { ...this.config, ...settings };
            
            // Aplicar configurações na interface
            if (this.autoplaySettingEl) this.autoplaySettingEl.checked = this.config.autoplay;
            if (this.volumeSettingEl) this.volumeSettingEl.value = this.config.defaultVolume;
            if (this.volumeValueEl) this.volumeValueEl.textContent = `${this.config.defaultVolume}%`;
            if (this.autoShareSettingEl) this.autoShareSettingEl.checked = this.config.autoShare;
            if (this.autoDownloadSettingEl) this.autoDownloadSettingEl.checked = this.config.autoDownload;
            if (this.storageLimitSettingEl) this.storageLimitSettingEl.value = this.config.storageLimit / (1024 * 1024);
            if (this.storageLimitValueEl) this.storageLimitValueEl.textContent = `${Math.round(this.config.storageLimit / (1024 * 1024 * 1024) * 10) / 10} GB`;
        } catch (error) {
            console.error('[NeoNet Videos] Error loading settings:', error);
        }
    }
    
    saveSettings() {
        try {
            localStorage.setItem('neonet-videos-settings', JSON.stringify(this.config));
        } catch (error) {
            console.error('[NeoNet Videos] Error saving settings:', error);
        }
    }
    
    openFileDialog() {
        this.fileInput?.click();
    }
    
    async handleFileSelection(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        
        // Filtrar apenas arquivos de vídeo suportados
        const videoFiles = files.filter(file => this.isVideoFile(file));
        
        if (videoFiles.length === 0) {
            alert('Nenhum arquivo de vídeo válido selecionado.');
            return;
        }
        
        // Verificar tamanho total
        const totalSize = videoFiles.reduce((sum, file) => sum + file.size, 0);
        if (totalSize > this.config.storageLimit) {
            alert('O tamanho total dos arquivos excede o limite de armazenamento.');
            return;
        }
        
        await this.importVideos(videoFiles);
    }
    
    async handleFileDrop(event) {
        event.preventDefault();
        
        const files = Array.from(event.dataTransfer.files);
        const videoFiles = files.filter(file => this.isVideoFile(file));
        
        if (videoFiles.length > 0) {
            await this.importVideos(videoFiles);
        }
    }
    
    isVideoFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        return this.config.supportedFormats.includes(extension);
    }
    
    async importVideos(files) {
        this.state.uploading = true;
        this.showUploadModal();
        
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                await this.importSingleVideo(file, i + 1, files.length);
            }
            
            this.updateStats();
            this.renderVideoList();
            this.hideUploadModal();
            
            console.log(`[NeoNet Videos] Imported ${files.length} videos`);
        } catch (error) {
            console.error('[NeoNet Videos] Import failed:', error);
            alert('Erro ao importar vídeos.');
        } finally {
            this.state.uploading = false;
        }
    }
    
    async importSingleVideo(file, current, total) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const videoData = e.target.result;
                    const video = await this.createVideoObject(file, videoData);
                    
                    // Salvar no banco
                    await this.saveVideo(video);
                    
                    // Adicionar à memória
                    this.videos.set(video.id, video);
                    
                    // Atualizar progresso
                    this.updateUploadProgress(file.name, (current / total) * 100);
                    
                    resolve(video);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }
    
    async createVideoObject(file, data) {
        const id = this.generateVideoId();
        const thumbnail = await this.generateThumbnail(file);
        const duration = await this.getVideoDuration(file);
        
        return {
            id,
            title: file.name.replace(/\.[^/.]+$/, ""),
            filename: file.name,
            size: file.size,
            format: file.name.split('.').pop().toLowerCase(),
            duration,
            thumbnail,
            data: new Uint8Array(data),
            dateAdded: Date.now(),
            dateModified: file.lastModified,
            favorite: false,
            shared: false,
            category: 'all',
            tags: [],
            metadata: {
                type: file.type,
                lastAccessed: null,
                playCount: 0,
                nodeId: this.nodeId
            }
        };
    }
    
    async generateThumbnail(file) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            video.onloadedmetadata = () => {
                canvas.width = 320;
                canvas.height = 180;
                
                video.currentTime = Math.min(video.duration * 0.1, 10); // 10% ou 10s
            };
            
            video.onseeked = () => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
                resolve(thumbnail);
            };
            
            video.onerror = () => resolve(null);
            
            video.src = URL.createObjectURL(file);
        });
    }
    
    async getVideoDuration(file) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            
            video.onloadedmetadata = () => {
                resolve(video.duration);
                URL.revokeObjectURL(video.src);
            };
            
            video.onerror = () => {
                resolve(0);
                URL.revokeObjectURL(video.src);
            };
            
            video.src = URL.createObjectURL(file);
        });
    }
    
    async saveVideo(video) {
        try {
            const transaction = this.db.transaction(['videos'], 'readwrite');
            const store = transaction.objectStore('videos');
            await store.put(video);
        } catch (error) {
            console.error('[NeoNet Videos] Error saving video:', error);
            throw error;
        }
    }
    
    renderVideoList() {
        if (!this.videoContainer) return;
        
        let filteredVideos = this.getFilteredVideos();
        
        if (filteredVideos.length === 0) {
            this.showEmptyState();
            return;
        }
        
        this.hideEmptyState();
        
        // Aplicar ordenação
        filteredVideos = this.sortVideos(filteredVideos);
        
        // Renderizar vídeos
        const isGridView = this.currentView === 'grid';
        this.videoContainer.className = `video-container ${isGridView ? 'video-grid' : 'video-list'}`;
        
        this.videoContainer.innerHTML = filteredVideos.map(video => 
            this.renderVideoItem(video, isGridView)
        ).join('');
        
        // Adicionar event listeners
        this.videoContainer.querySelectorAll('.video-item').forEach(item => {
            item.addEventListener('click', () => {
                const videoId = item.dataset.videoId;
                this.playVideo(videoId);
            });
        });
    }
    
    renderVideoItem(video, isGridView) {
        const sizeFormatted = this.formatFileSize(video.size);
        const durationFormatted = this.formatDuration(video.duration);
        const dateFormatted = new Date(video.dateAdded).toLocaleDateString('pt-BR');
        
        const thumbnailHtml = video.thumbnail 
            ? `<img src="${video.thumbnail}" alt="${video.title}">`
            : `<div class="video-thumbnail-placeholder">🎬</div>`;
        
        const viewClass = isGridView ? '' : 'list-view';
        
        return `
            <div class="video-item ${viewClass}" data-video-id="${video.id}">
                <div class="video-thumbnail">
                    ${thumbnailHtml}
                    <div class="video-duration">${durationFormatted}</div>
                </div>
                <div class="video-info">
                    <h4 class="video-title">${this.escapeHtml(video.title)}</h4>
                    <div class="video-meta">
                        <span class="video-size">${sizeFormatted}</span>
                        <span class="video-date">${dateFormatted}</span>
                        <span class="video-format">${video.format.toUpperCase()}</span>
                    </div>
                    <div class="video-actions">
                        <button class="video-action-btn" onclick="event.stopPropagation(); neonetVideos.toggleVideoFavorite('${video.id}')">
                            ${video.favorite ? '⭐' : '☆'}
                        </button>
                        <button class="video-action-btn" onclick="event.stopPropagation(); neonetVideos.shareVideo('${video.id}')">
                            🔗
                        </button>
                        <button class="video-action-btn" onclick="event.stopPropagation(); neonetVideos.deleteVideoConfirm('${video.id}')">
                            🗑️
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    getFilteredVideos() {
        let videos = Array.from(this.videos.values());
        
        // Filtrar por categoria
        if (this.currentCategory !== 'all') {
            switch (this.currentCategory) {
                case 'favorites':
                    videos = videos.filter(v => v.favorite);
                    break;
                case 'recent':
                    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                    videos = videos.filter(v => v.dateAdded > weekAgo);
                    break;
                case 'shared':
                    videos = videos.filter(v => v.shared);
                    break;
            }
        }
        
        // Filtrar por busca
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            videos = videos.filter(v => 
                v.title.toLowerCase().includes(query) ||
                v.filename.toLowerCase().includes(query) ||
                v.format.toLowerCase().includes(query)
            );
        }
        
        return videos;
    }
    
    sortVideos(videos) {
        switch (this.sortBy) {
            case 'date-desc':
                return videos.sort((a, b) => b.dateAdded - a.dateAdded);
            case 'date-asc':
                return videos.sort((a, b) => a.dateAdded - b.dateAdded);
            case 'name-asc':
                return videos.sort((a, b) => a.title.localeCompare(b.title));
            case 'name-desc':
                return videos.sort((a, b) => b.title.localeCompare(a.title));
            case 'size-desc':
                return videos.sort((a, b) => b.size - a.size);
            case 'size-asc':
                return videos.sort((a, b) => a.size - b.size);
            default:
                return videos;
        }
    }
    
    playVideo(videoId) {
        const video = this.videos.get(videoId);
        if (!video) return;
        
        this.currentVideo = video;
        
        // Atualizar informações do player
        if (this.playerTitle) this.playerTitle.textContent = video.title;
        if (this.videoTitle) this.videoTitle.textContent = video.title;
        if (this.videoDuration) this.videoDuration.textContent = this.formatDuration(video.duration);
        if (this.videoSize) this.videoSize.textContent = this.formatFileSize(video.size);
        if (this.videoFormat) this.videoFormat.textContent = video.format.toUpperCase();
        
        // Configurar player
        if (this.videoPlayer) {
            const blob = new Blob([video.data], { type: `video/${video.format}` });
            const url = URL.createObjectURL(blob);
            
            this.videoPlayer.src = url;
            this.videoPlayer.volume = this.config.defaultVolume / 100;
            
            if (this.config.autoplay) {
                this.videoPlayer.play();
            }
        }
        
        // Atualizar botão de favorito
        if (this.favoriteBtn) {
            const icon = this.favoriteBtn.querySelector('.btn-icon');
            if (icon) icon.textContent = video.favorite ? '⭐' : '☆';
        }
        
        // Mostrar modal
        this.showModal('player-modal');
        
        // Atualizar estatísticas
        video.metadata.lastAccessed = Date.now();
        video.metadata.playCount++;
        this.saveVideo(video);
    }
    
    closePlayer() {
        if (this.videoPlayer) {
            this.videoPlayer.pause();
            this.videoPlayer.src = '';
        }
        
        this.hideModal('player-modal');
        this.currentVideo = null;
    }
    
    togglePlayPause() {
        if (!this.videoPlayer) return;
        
        if (this.videoPlayer.paused) {
            this.videoPlayer.play();
        } else {
            this.videoPlayer.pause();
        }
    }
    
    toggleFullscreen() {
        if (!this.videoPlayer) return;
        
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            this.videoPlayer.requestFullscreen();
        }
    }
    
    toggleFavorite() {
        if (!this.currentVideo) return;
        
        this.currentVideo.favorite = !this.currentVideo.favorite;
        this.saveVideo(this.currentVideo);
        
        // Atualizar botão
        const icon = this.favoriteBtn?.querySelector('.btn-icon');
        if (icon) icon.textContent = this.currentVideo.favorite ? '⭐' : '☆';
        
        // Atualizar lista
        this.updateStats();
        this.renderVideoList();
    }
    
    toggleVideoFavorite(videoId) {
        const video = this.videos.get(videoId);
        if (!video) return;
        
        video.favorite = !video.favorite;
        this.saveVideo(video);
        
        this.updateStats();
        this.renderVideoList();
    }
    
    openShareModal() {
        if (!this.currentVideo) return;
        
        // Gerar link de compartilhamento
        const shareLink = this.generateShareLink(this.currentVideo.id);
        if (this.shareLinkInput) this.shareLinkInput.value = shareLink;
        
        // Gerar QR Code (simulado)
        if (this.qrCodeContainer) {
            this.qrCodeContainer.innerHTML = `
                <div style="font-size: 1rem; text-align: center;">
                    📱<br>
                    QR Code para<br>
                    ${this.currentVideo.title}
                </div>
            `;
        }
        
        this.showModal('share-modal');
    }
    
    generateShareLink(videoId) {
        return `neonet://videos/share/${videoId}?node=${this.nodeId}`;
    }
    
    copyShareLink() {
        if (!this.shareLinkInput) return;
        
        this.shareLinkInput.select();
        document.execCommand('copy');
        
        // Feedback visual
        const originalText = this.copyLinkBtn?.textContent;
        if (this.copyLinkBtn) {
            this.copyLinkBtn.textContent = 'Copiado!';
            setTimeout(() => {
                if (this.copyLinkBtn) this.copyLinkBtn.textContent = originalText;
            }, 2000);
        }
    }
    
    shareToP2P() {
        if (!this.currentVideo) return;
        
        this.currentVideo.shared = true;
        this.sharedVideos.add(this.currentVideo.id);
        this.saveVideo(this.currentVideo);
        
        // Simular compartilhamento P2P
        this.broadcastVideoAvailability(this.currentVideo);
        
        this.updateStats();
        this.renderVideoList();
        this.hideModal('share-modal');
        
        alert('Vídeo compartilhado na rede P2P!');
    }
    
    broadcastVideoAvailability(video) {
        const message = {
            type: 'video-available',
            videoId: video.id,
            title: video.title,
            size: video.size,
            duration: video.duration,
            format: video.format,
            nodeId: this.nodeId,
            timestamp: Date.now()
        };
        
        // Enviar para peers conectados
        this.peers.forEach(peer => {
            this.sendToPeer(peer.id, message);
        });
    }
    
    sendToPeer(peerId, message) {
        // Simular envio P2P
        console.log(`[NeoNet Videos] Sending to peer ${peerId}:`, message);
    }
    
    deleteVideoConfirm(videoId) {
        const video = this.videos.get(videoId);
        if (!video) return;
        
        if (confirm(`Tem certeza que deseja excluir "${video.title}"?`)) {
            this.deleteVideoById(videoId);
        }
    }
    
    deleteVideo() {
        if (!this.currentVideo) return;
        
        if (confirm(`Tem certeza que deseja excluir "${this.currentVideo.title}"?`)) {
            this.deleteVideoById(this.currentVideo.id);
            this.closePlayer();
        }
    }
    
    async deleteVideoById(videoId) {
        try {
            // Remover do banco
            const transaction = this.db.transaction(['videos'], 'readwrite');
            const store = transaction.objectStore('videos');
            await store.delete(videoId);
            
            // Remover da memória
            this.videos.delete(videoId);
            this.sharedVideos.delete(videoId);
            
            this.updateStats();
            this.renderVideoList();
            
            console.log(`[NeoNet Videos] Deleted video: ${videoId}`);
        } catch (error) {
            console.error('[NeoNet Videos] Error deleting video:', error);
        }
    }
    
    handleSearch(query) {
        this.searchQuery = query.trim();
        this.renderVideoList();
    }
    
    handleSortChange(sortBy) {
        this.sortBy = sortBy;
        this.renderVideoList();
    }
    
    handleViewChange(view) {
        this.currentView = view;
        this.renderVideoList();
    }
    
    handleCategoryClick(event) {
        const categoryItem = event.target.closest('.category-item');
        if (!categoryItem) return;
        
        // Remover active de todas as categorias
        this.categoryList?.querySelectorAll('.category-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Adicionar active na categoria clicada
        categoryItem.classList.add('active');
        
        // Atualizar categoria atual
        this.currentCategory = categoryItem.dataset.category;
        
        // Renderizar lista filtrada
        this.renderVideoList();
    }
    
    updateStats() {
        const videos = Array.from(this.videos.values());
        
        this.stats.totalVideos = videos.length;
        this.stats.totalSize = videos.reduce((sum, v) => sum + v.size, 0);
        this.stats.totalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
        this.stats.favoritesCount = videos.filter(v => v.favorite).length;
        this.stats.sharedCount = videos.filter(v => v.shared).length;
        
        // Atualizar interface
        if (this.totalVideosEl) this.totalVideosEl.textContent = this.stats.totalVideos;
        if (this.totalSizeEl) this.totalSizeEl.textContent = this.formatFileSize(this.stats.totalSize);
        if (this.totalDurationEl) this.totalDurationEl.textContent = this.formatDuration(this.stats.totalDuration);
        if (this.sharedCountEl) this.sharedCountEl.textContent = this.stats.sharedCount;
        
        // Atualizar contadores de categoria
        this.updateCategoryCounts();
        
        // Atualizar status de armazenamento
        if (this.storageStatus) {
            const statusText = this.storageStatus.querySelector('.status-text');
            if (statusText) statusText.textContent = `${this.stats.totalVideos} vídeos`;
        }
    }
    
    updateCategoryCounts() {
        const videos = Array.from(this.videos.values());
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        
        const counts = {
            all: videos.length,
            favorites: videos.filter(v => v.favorite).length,
            recent: videos.filter(v => v.dateAdded > weekAgo).length,
            shared: videos.filter(v => v.shared).length
        };
        
        this.categoryList?.querySelectorAll('.category-item').forEach(item => {
            const category = item.dataset.category;
            const countEl = item.querySelector('.category-count');
            if (countEl && counts[category] !== undefined) {
                countEl.textContent = counts[category];
            }
        });
    }
    
    updateUI() {
        this.updateConnectionStatus();
        this.updateStats();
        this.renderVideoList();
    }
    
    updateConnectionStatus() {
        if (!this.connectionStatus) return;
        
        const icon = this.connectionStatus.querySelector('.status-icon');
        const text = this.connectionStatus.querySelector('.status-text');
        
        if (this.isOnline && this.state.p2pReady) {
            if (icon) icon.textContent = '🟢';
            if (text) text.textContent = 'Online';
        } else if (this.isOnline) {
            if (icon) icon.textContent = '🟡';
            if (text) text.textContent = 'Conectando...';
        } else {
            if (icon) icon.textContent = '🔴';
            if (text) text.textContent = 'Offline';
        }
    }
    
    showUploadModal() {
        this.showModal('upload-modal');
    }
    
    hideUploadModal() {
        this.hideModal('upload-modal');
    }
    
    updateUploadProgress(filename, percentage) {
        if (this.uploadProgressItem) {
            const filenameEl = this.uploadProgressItem.querySelector('.progress-filename');
            const percentageEl = this.uploadProgressItem.querySelector('.progress-percentage');
            
            if (filenameEl) filenameEl.textContent = filename;
            if (percentageEl) percentageEl.textContent = `${Math.round(percentage)}%`;
        }
        
        if (this.progressFill) {
            this.progressFill.style.width = `${percentage}%`;
        }
    }
    
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('active');
    }
    
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    }
    
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }
    
    showEmptyState() {
        if (this.emptyState) this.emptyState.style.display = 'flex';
        if (this.videoContainer) this.videoContainer.style.display = 'none';
    }
    
    hideEmptyState() {
        if (this.emptyState) this.emptyState.style.display = 'none';
        if (this.videoContainer) this.videoContainer.style.display = 'block';
    }
    
    // Event handlers
    handleOnline() {
        this.isOnline = true;
        this.updateConnectionStatus();
        console.log('[NeoNet Videos] Connection restored');
    }
    
    handleOffline() {
        this.isOnline = false;
        this.updateConnectionStatus();
        console.log('[NeoNet Videos] Connection lost');
    }
    
    handlePeerConnected(peer) {
        this.peers.set(peer.id, peer);
        this.stats.peerCount = this.peers.size;
        
        if (this.peerCountEl) this.peerCountEl.textContent = this.stats.peerCount;
        
        console.log('[NeoNet Videos] Peer connected:', peer.id);
    }
    
    handlePeerDisconnected(peer) {
        this.peers.delete(peer.id);
        this.stats.peerCount = this.peers.size;
        
        if (this.peerCountEl) this.peerCountEl.textContent = this.stats.peerCount;
        
        console.log('[NeoNet Videos] Peer disconnected:', peer.id);
    }
    
    handleP2PData(data) {
        switch (data.type) {
            case 'video-available':
                this.handleVideoAvailable(data);
                break;
            case 'video-request':
                this.handleVideoRequest(data);
                break;
            case 'video-chunk':
                this.handleVideoChunk(data);
                break;
        }
    }
    
    handleVideoAvailable(data) {
        console.log('[NeoNet Videos] Video available from peer:', data);
        
        if (this.config.autoDownload) {
            this.requestVideoFromPeer(data.nodeId, data.videoId);
        }
    }
    
    requestVideoFromPeer(nodeId, videoId) {
        const message = {
            type: 'video-request',
            videoId,
            requesterId: this.nodeId,
            timestamp: Date.now()
        };
        
        this.sendToPeer(nodeId, message);
    }
    
    handleVideoRequest(data) {
        const video = this.videos.get(data.videoId);
        if (!video || !video.shared) return;
        
        // Enviar vídeo em chunks
        this.sendVideoInChunks(data.requesterId, video);
    }
    
    sendVideoInChunks(peerId, video) {
        const chunkSize = this.config.chunkSize;
        const totalChunks = Math.ceil(video.data.length / chunkSize);
        
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, video.data.length);
            const chunk = video.data.slice(start, end);
            
            const message = {
                type: 'video-chunk',
                videoId: video.id,
                chunkIndex: i,
                totalChunks,
                chunk: Array.from(chunk),
                metadata: i === 0 ? {
                    title: video.title,
                    size: video.size,
                    format: video.format,
                    duration: video.duration
                } : null
            };
            
            this.sendToPeer(peerId, message);
        }
    }
    
    handleVideoChunk(data) {
        // Implementar recebimento de chunks de vídeo
        console.log('[NeoNet Videos] Received video chunk:', data.chunkIndex, '/', data.totalChunks);
    }
    
    handleInitializationError(error) {
        console.error('[NeoNet Videos] Critical error:', error);
        
        // Mostrar mensagem de erro
        if (this.videoContainer) {
            this.videoContainer.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h3>Erro na Inicialização</h3>
                    <p>Ocorreu um erro ao inicializar o NeoNet Videos. Recarregue a página.</p>
                    <button class="btn btn-primary" onclick="location.reload()">Recarregar</button>
                </div>
            `;
        }
    }
    
    registerWithNeoNet() {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'neonet-dapp-register',
                dapp: {
                    id: 'neonet-videos',
                    name: 'NeoNet Videos',
                    version: this.version,
                    capabilities: ['storage', 'p2p', 'media'],
                    nodeId: this.nodeId
                }
            }, '*');
        }
    }
    
    // Settings methods
    updateVolumeSetting(value) {
        this.config.defaultVolume = parseInt(value);
        if (this.volumeValueEl) this.volumeValueEl.textContent = `${value}%`;
        if (this.videoPlayer) this.videoPlayer.volume = value / 100;
        this.saveSettings();
    }
    
    updateStorageLimitSetting(value) {
        this.config.storageLimit = parseInt(value) * 1024 * 1024; // Convert MB to bytes
        if (this.storageLimitValueEl) {
            this.storageLimitValueEl.textContent = `${Math.round(value / 1024 * 10) / 10} GB`;
        }
        this.saveSettings();
    }
    
    async clearCache() {
        if (confirm('Tem certeza que deseja limpar todo o cache? Esta ação não pode ser desfeita.')) {
            try {
                // Limpar vídeos
                this.videos.clear();
                
                // Limpar banco
                const transaction = this.db.transaction(['videos'], 'readwrite');
                const store = transaction.objectStore('videos');
                await store.clear();
                
                this.updateStats();
                this.renderVideoList();
                
                alert('Cache limpo com sucesso!');
            } catch (error) {
                console.error('[NeoNet Videos] Error clearing cache:', error);
                alert('Erro ao limpar cache.');
            }
        }
    }
    
    // Utility methods
    generateNodeId() {
        let nodeId = localStorage.getItem('neonet-videos-node-id');
        if (!nodeId) {
            nodeId = `videos-node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('neonet-videos-node-id', nodeId);
        }
        return nodeId;
    }
    
    generateVideoId() {
        return `video_${this.nodeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    formatDuration(seconds) {
        if (!seconds || seconds === 0) return '0:00';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Public API
    getStatus() {
        return {
            version: this.version,
            isOnline: this.isOnline,
            videoCount: this.videos.size,
            stats: this.stats,
            state: this.state,
            nodeId: this.nodeId
        };
    }
    
    async exportVideos() {
        const videos = Array.from(this.videos.values()).map(video => ({
            ...video,
            data: null // Não exportar dados binários
        }));
        
        const exportData = {
            version: this.version,
            timestamp: Date.now(),
            nodeId: this.nodeId,
            videos,
            stats: this.stats
        };
        
        return exportData;
    }
}

// Inicializar quando DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    window.neonetVideos = new NeoNetVideosEnhanced();
});

// Funções globais para event handlers inline
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// Exportar para uso em outros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeoNetVideosEnhanced;
}

