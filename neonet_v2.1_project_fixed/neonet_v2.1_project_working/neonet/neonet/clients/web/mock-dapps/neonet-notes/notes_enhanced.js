// neonet/clients/web/mock-dapps/neonet-notes/notes_enhanced.js
// NeoNet Notes dApp - Versão Aprimorada com Arquitetura Offline-First

class NeoNetNotesEnhanced {
    constructor() {
        this.version = '2.0.0';
        this.notes = new Map(); // Usar Map para melhor performance
        this.currentNote = null;
        this.isOnline = navigator.onLine;
        this.autoSaveTimeout = null;
        this.searchQuery = '';
        this.maxNotes = 500; // Limite de notas
        this.maxNoteSize = 1024 * 1024; // 1MB por nota
        
        // Configurações CRDT para resolução de conflitos
        this.vectorClock = new Map();
        this.nodeId = this.generateNodeId();
        this.userId = this.generateUserId();
        
        // Estado de sincronização
        this.syncStatus = {
            inProgress: false,
            lastSync: 0,
            pendingCount: 0,
            errorCount: 0,
            totalNotes: 0
        };
        
        // Configurações de backup
        this.backupConfig = {
            autoBackup: true,
            backupInterval: 5 * 60 * 1000, // 5 minutos
            maxBackups: 10
        };
        
        this.init();
    }
    
    async init() {
        try {
            console.log('[NeoNetNotes Enhanced] Initializing version', this.version);
            
            // Inicializar IndexedDB
            await this.initDatabase();
            
            // Inicializar elementos do DOM
            this.initializeElements();
            
            // Configurar event listeners
            this.initializeEventListeners();
            
            // Carregar notas armazenadas
            await this.loadStoredNotes();
            
            // Configurar auto-backup
            this.setupAutoBackup();
            
            // Configurar sincronização automática
            this.setupAutoSync();
            
            // Atualizar status inicial
            this.updateSyncStatus();
            
            // Registrar com o sistema principal
            this.registerWithNeoNet();
            
            console.log('[NeoNetNotes Enhanced] Initialization complete');
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Initialization failed:', error);
            this.handleInitializationError(error);
        }
    }
    
    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('NeoNetNotesDB', 2);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store para notas
                if (!db.objectStoreNames.contains('notes')) {
                    const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
                    noteStore.createIndex('title', 'title');
                    noteStore.createIndex('updatedAt', 'updatedAt');
                    noteStore.createIndex('createdAt', 'createdAt');
                    noteStore.createIndex('synced', 'synced');
                    noteStore.createIndex('tags', 'tags', { multiEntry: true });
                    noteStore.createIndex('vectorTimestamp', 'vectorTimestamp');
                }
                
                // Store para configurações
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }
                
                // Store para backups
                if (!db.objectStoreNames.contains('backups')) {
                    const backupStore = db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
                    backupStore.createIndex('timestamp', 'timestamp');
                    backupStore.createIndex('type', 'type');
                }
                
                // Store para histórico de versões
                if (!db.objectStoreNames.contains('versions')) {
                    const versionStore = db.createObjectStore('versions', { keyPath: 'id', autoIncrement: true });
                    versionStore.createIndex('noteId', 'noteId');
                    versionStore.createIndex('timestamp', 'timestamp');
                }
                
                // Store para fila de sincronização
                if (!db.objectStoreNames.contains('syncQueue')) {
                    const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                    syncStore.createIndex('timestamp', 'timestamp');
                    syncStore.createIndex('priority', 'priority');
                }
            };
        });
    }
    
    initializeElements() {
        this.notesList = document.getElementById('notesList');
        this.noteTitle = document.getElementById('noteTitle');
        this.noteContent = document.getElementById('noteContent');
        this.noteInfo = document.getElementById('noteInfo');
        this.searchInput = document.getElementById('searchInput');
        this.newNoteBtn = document.getElementById('newNoteBtn');
        this.saveBtn = document.getElementById('saveBtn');
        this.deleteBtn = document.getElementById('deleteBtn');
        this.syncStatus = document.getElementById('syncStatus');
        this.syncText = document.getElementById('syncText');
        this.exportBtn = document.getElementById('exportBtn');
        this.importBtn = document.getElementById('importBtn');
        this.tagsInput = document.getElementById('tagsInput');
        this.wordCount = document.getElementById('wordCount');
        
        // Criar elementos se não existirem
        if (!this.exportBtn) {
            this.createExportButton();
        }
        
        if (!this.importBtn) {
            this.createImportButton();
        }
        
        if (!this.tagsInput) {
            this.createTagsInput();
        }
        
        if (!this.wordCount) {
            this.createWordCounter();
        }
    }
    
    createExportButton() {
        const button = document.createElement('button');
        button.id = 'exportBtn';
        button.className = 'btn btn-secondary';
        button.innerHTML = '📤 Exportar';
        button.addEventListener('click', () => this.exportNotes());
        
        const toolbar = document.querySelector('.toolbar') || document.body;
        toolbar.appendChild(button);
        this.exportBtn = button;
    }
    
    createImportButton() {
        const button = document.createElement('button');
        button.id = 'importBtn';
        button.className = 'btn btn-secondary';
        button.innerHTML = '📥 Importar';
        button.addEventListener('click', () => this.importNotes());
        
        const toolbar = document.querySelector('.toolbar') || document.body;
        toolbar.appendChild(button);
        this.importBtn = button;
    }
    
    createTagsInput() {
        const input = document.createElement('input');
        input.id = 'tagsInput';
        input.type = 'text';
        input.placeholder = 'Tags (separadas por vírgula)';
        input.className = 'form-control';
        
        const editor = document.querySelector('.note-editor') || document.body;
        editor.appendChild(input);
        this.tagsInput = input;
    }
    
    createWordCounter() {
        const counter = document.createElement('div');
        counter.id = 'wordCount';
        counter.className = 'word-counter';
        counter.textContent = '0 palavras';
        
        const editor = document.querySelector('.note-editor') || document.body;
        editor.appendChild(counter);
        this.wordCount = counter;
    }
    
    initializeEventListeners() {
        // Botões principais
        this.newNoteBtn?.addEventListener('click', () => this.createNewNote());
        this.saveBtn?.addEventListener('click', () => this.saveCurrentNote());
        this.deleteBtn?.addEventListener('click', () => this.deleteCurrentNote());
        
        // Busca
        this.searchInput?.addEventListener('input', (e) => this.searchNotes(e.target.value));
        
        // Auto-save e contadores
        this.noteTitle?.addEventListener('input', () => {
            this.scheduleAutoSave();
            this.updateWordCount();
        });
        
        this.noteContent?.addEventListener('input', () => {
            this.scheduleAutoSave();
            this.updateWordCount();
        });
        
        // Tags
        this.tagsInput?.addEventListener('input', () => this.scheduleAutoSave());
        
        // Conectividade
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Atalhos de teclado
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Eventos do sistema NeoNet
        window.addEventListener('neonet-sync-complete', (event) => {
            this.handleSystemSync(event.detail);
        });
        
        // Visibilidade da página
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.performSync();
            }
        });
        
        // Auto-save ao sair
        window.addEventListener('beforeunload', () => {
            this.saveCurrentState();
        });
    }
    
    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 's':
                    e.preventDefault();
                    this.saveCurrentNote();
                    break;
                case 'n':
                    e.preventDefault();
                    this.createNewNote();
                    break;
                case 'f':
                    e.preventDefault();
                    this.searchInput?.focus();
                    break;
                case 'e':
                    e.preventDefault();
                    this.exportNotes();
                    break;
                case 'z':
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.redo();
                    } else {
                        e.preventDefault();
                        this.undo();
                    }
                    break;
            }
        }
    }
    
    generateNodeId() {
        let nodeId = localStorage.getItem('neonet-notes-node-id');
        if (!nodeId) {
            nodeId = `notes-node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('neonet-notes-node-id', nodeId);
        }
        return nodeId;
    }
    
    generateUserId() {
        let userId = localStorage.getItem('neonet-notes-user-id');
        if (!userId) {
            userId = `notes-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('neonet-notes-user-id', userId);
        }
        return userId;
    }
    
    async loadStoredNotes() {
        try {
            const transaction = this.db.transaction(['notes'], 'readonly');
            const store = transaction.objectStore('notes');
            const index = store.index('updatedAt');
            
            // Carregar todas as notas ordenadas por data de atualização
            const request = index.openCursor(null, 'prev');
            const notes = [];
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    notes.push(cursor.value);
                    cursor.continue();
                } else {
                    // Carregar notas na interface
                    notes.forEach(note => {
                        this.notes.set(note.id, note);
                    });
                    
                    this.renderNotesList();
                    this.updateSyncStatus();
                    
                    // Selecionar primeira nota se existir
                    if (notes.length > 0) {
                        this.selectNote(notes[0].id);
                    }
                    
                    console.log(`[NeoNetNotes Enhanced] Loaded ${notes.length} notes`);
                }
            };
            
            request.onerror = () => {
                console.error('[NeoNetNotes Enhanced] Error loading notes:', request.error);
            };
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error in loadStoredNotes:', error);
        }
    }
    
    async saveNote(note) {
        try {
            const transaction = this.db.transaction(['notes'], 'readwrite');
            const store = transaction.objectStore('notes');
            await store.put(note);
            
            // Salvar versão para histórico
            await this.saveNoteVersion(note);
            
            // Limpar notas antigas se necessário
            await this.cleanOldNotes();
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error saving note:', error);
        }
    }
    
    async saveNoteVersion(note) {
        try {
            const version = {
                noteId: note.id,
                title: note.title,
                content: note.content,
                tags: note.tags,
                timestamp: Date.now(),
                vectorTimestamp: note.vectorTimestamp,
                nodeId: this.nodeId
            };
            
            const transaction = this.db.transaction(['versions'], 'readwrite');
            const store = transaction.objectStore('versions');
            await store.add(version);
            
            // Manter apenas últimas 10 versões por nota
            await this.cleanOldVersions(note.id);
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error saving note version:', error);
        }
    }
    
    async cleanOldNotes() {
        try {
            const transaction = this.db.transaction(['notes'], 'readwrite');
            const store = transaction.objectStore('notes');
            const countRequest = store.count();
            
            countRequest.onsuccess = async () => {
                const count = countRequest.result;
                
                if (count > this.maxNotes) {
                    const index = store.index('updatedAt');
                    const deleteCount = count - this.maxNotes;
                    let deleted = 0;
                    
                    const request = index.openCursor();
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor && deleted < deleteCount) {
                            cursor.delete();
                            deleted++;
                            cursor.continue();
                        }
                    };
                }
            };
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error cleaning old notes:', error);
        }
    }
    
    async cleanOldVersions(noteId) {
        try {
            const transaction = this.db.transaction(['versions'], 'readwrite');
            const store = transaction.objectStore('versions');
            const index = store.index('noteId');
            
            const request = index.openCursor(IDBKeyRange.only(noteId));
            const versions = [];
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    versions.push(cursor.value);
                    cursor.continue();
                } else {
                    // Manter apenas últimas 10 versões
                    if (versions.length > 10) {
                        versions.sort((a, b) => b.timestamp - a.timestamp);
                        const toDelete = versions.slice(10);
                        
                        toDelete.forEach(version => {
                            store.delete(version.id);
                        });
                    }
                }
            };
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error cleaning old versions:', error);
        }
    }
    
    createNewNote() {
        // Salvar nota atual antes de criar nova
        if (this.currentNote) {
            this.saveCurrentNote();
        }
        
        const timestamp = Date.now();
        const vectorTimestamp = this.incrementVectorClock();
        
        const note = {
            id: this.generateNoteId(),
            title: '',
            content: '',
            tags: [],
            createdAt: timestamp,
            updatedAt: timestamp,
            vectorTimestamp: Array.from(vectorTimestamp.entries()),
            nodeId: this.nodeId,
            userId: this.userId,
            synced: false,
            version: 1,
            metadata: {
                wordCount: 0,
                charCount: 0,
                clientVersion: this.version
            }
        };
        
        this.notes.set(note.id, note);
        this.saveNote(note);
        this.renderNotesList();
        this.selectNote(note.id);
        this.noteTitle?.focus();
        
        console.log('[NeoNetNotes Enhanced] Created new note:', note.id);
    }
    
    selectNote(noteId) {
        const note = this.notes.get(noteId);
        if (!note) return;
        
        // Salvar nota atual antes de trocar
        if (this.currentNote && this.currentNote.id !== noteId) {
            this.saveCurrentNote();
        }
        
        this.currentNote = note;
        
        if (this.noteTitle) this.noteTitle.value = note.title;
        if (this.noteContent) this.noteContent.value = note.content;
        if (this.tagsInput) this.tagsInput.value = (note.tags || []).join(', ');
        
        this.updateNoteInfo();
        this.updateWordCount();
        this.updateActiveNoteInList(noteId);
        
        console.log('[NeoNetNotes Enhanced] Selected note:', note.title || 'Untitled');
    }
    
    async saveCurrentNote() {
        if (!this.currentNote) return;
        
        const title = this.noteTitle?.value?.trim() || '';
        const content = this.noteContent?.value?.trim() || '';
        const tagsText = this.tagsInput?.value?.trim() || '';
        
        // Não salvar se estiver completamente vazia
        if (!title && !content && !tagsText) {
            this.deleteNote(this.currentNote.id);
            return;
        }
        
        // Processar tags
        const tags = tagsText
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);
        
        // Verificar se houve mudanças
        const hasChanges = 
            this.currentNote.title !== title ||
            this.currentNote.content !== content ||
            JSON.stringify(this.currentNote.tags || []) !== JSON.stringify(tags);
        
        if (!hasChanges) {
            return; // Não há mudanças para salvar
        }
        
        // Atualizar nota
        const timestamp = Date.now();
        const vectorTimestamp = this.incrementVectorClock();
        
        this.currentNote.title = title || 'Nota sem título';
        this.currentNote.content = content;
        this.currentNote.tags = tags;
        this.currentNote.updatedAt = timestamp;
        this.currentNote.vectorTimestamp = Array.from(vectorTimestamp.entries());
        this.currentNote.synced = false;
        this.currentNote.version = (this.currentNote.version || 1) + 1;
        
        // Atualizar metadados
        this.currentNote.metadata = {
            ...this.currentNote.metadata,
            wordCount: this.countWords(content),
            charCount: content.length,
            lastModified: timestamp
        };
        
        // Salvar no banco
        await this.saveNote(this.currentNote);
        
        // Atualizar interface
        this.renderNotesList();
        this.updateNoteInfo();
        this.updateSyncStatus();
        
        // Adicionar à fila de sincronização
        await this.queueForSync(this.currentNote);
        
        // Tentar sincronizar se online
        if (this.isOnline) {
            this.performSync();
        }
        
        console.log('[NeoNetNotes Enhanced] Note saved:', this.currentNote.title);
    }
    
    async deleteCurrentNote() {
        if (!this.currentNote) return;
        
        if (confirm('Tem certeza que deseja excluir esta nota?')) {
            await this.deleteNote(this.currentNote.id);
        }
    }
    
    async deleteNote(noteId) {
        try {
            // Remover do banco
            const transaction = this.db.transaction(['notes', 'versions'], 'readwrite');
            const noteStore = transaction.objectStore('notes');
            const versionStore = transaction.objectStore('versions');
            
            await noteStore.delete(noteId);
            
            // Remover versões
            const versionIndex = versionStore.index('noteId');
            const versionRequest = versionIndex.openCursor(IDBKeyRange.only(noteId));
            
            versionRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            
            // Remover da memória
            this.notes.delete(noteId);
            
            // Atualizar interface
            this.renderNotesList();
            
            if (this.currentNote && this.currentNote.id === noteId) {
                this.currentNote = null;
                
                if (this.noteTitle) this.noteTitle.value = '';
                if (this.noteContent) this.noteContent.value = '';
                if (this.tagsInput) this.tagsInput.value = '';
                
                this.updateNoteInfo();
                this.updateWordCount();
                
                // Selecionar primeira nota se existir
                const firstNote = Array.from(this.notes.values())[0];
                if (firstNote) {
                    this.selectNote(firstNote.id);
                }
            }
            
            this.updateSyncStatus();
            
            console.log('[NeoNetNotes Enhanced] Note deleted:', noteId);
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error deleting note:', error);
        }
    }
    
    renderNotesList() {
        if (!this.notesList) return;
        
        let notesToRender = Array.from(this.notes.values());
        
        // Filtrar por busca se necessário
        if (this.searchQuery) {
            notesToRender = notesToRender.filter(note => 
                note.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                note.content.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                (note.tags || []).some(tag => tag.toLowerCase().includes(this.searchQuery.toLowerCase()))
            );
        }
        
        // Ordenar por data de atualização
        notesToRender.sort((a, b) => b.updatedAt - a.updatedAt);
        
        if (notesToRender.length === 0) {
            this.notesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <p>${this.searchQuery ? 'Nenhuma nota encontrada' : 'Nenhuma nota criada'}</p>
                    <small>${this.searchQuery ? 'Tente outros termos de busca' : 'Clique em "Nova Nota" para começar'}</small>
                </div>
            `;
            return;
        }
        
        this.notesList.innerHTML = notesToRender.map(note => {
            const preview = note.content.substring(0, 150);
            const date = new Date(note.updatedAt).toLocaleDateString('pt-BR');
            const time = new Date(note.updatedAt).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const syncIcon = this.getSyncIcon(note);
            const wordCount = note.metadata?.wordCount || 0;
            const tags = (note.tags || []).slice(0, 3); // Mostrar apenas 3 tags
            
            return `
                <div class="note-item ${this.currentNote?.id === note.id ? 'active' : ''}" data-note-id="${note.id}">
                    <div class="note-item-header">
                        <div class="note-item-title">${this.escapeHtml(note.title || 'Nota sem título')}</div>
                        <div class="note-item-sync">${syncIcon}</div>
                    </div>
                    <div class="note-item-preview">${this.escapeHtml(preview)}${preview.length >= 150 ? '...' : ''}</div>
                    <div class="note-item-tags">
                        ${tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}
                        ${note.tags && note.tags.length > 3 ? `<span class="tag-more">+${note.tags.length - 3}</span>` : ''}
                    </div>
                    <div class="note-item-meta">
                        <span class="note-date">${date} ${time}</span>
                        <span class="note-words">${wordCount} palavras</span>
                    </div>
                </div>
            `;
        }).join('');
        
        // Adicionar event listeners
        this.notesList.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => {
                const noteId = item.dataset.noteId;
                this.selectNote(noteId);
            });
        });
    }
    
    getSyncIcon(note) {
        if (note.synced) {
            return '✓';
        } else if (this.isOnline) {
            return '⏳';
        } else {
            return '📱';
        }
    }
    
    updateActiveNoteInList(noteId) {
        if (!this.notesList) return;
        
        this.notesList.querySelectorAll('.note-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.noteId === noteId) {
                item.classList.add('active');
            }
        });
    }
    
    searchNotes(query) {
        this.searchQuery = query.trim();
        this.renderNotesList();
    }
    
    scheduleAutoSave() {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        
        this.autoSaveTimeout = setTimeout(() => {
            this.saveCurrentNote();
        }, 2000); // Auto-save após 2 segundos de inatividade
    }
    
    updateNoteInfo() {
        if (!this.noteInfo) return;
        
        if (!this.currentNote) {
            this.noteInfo.textContent = 'Nenhuma nota selecionada';
            return;
        }
        
        const created = new Date(this.currentNote.createdAt);
        const updated = new Date(this.currentNote.updatedAt);
        
        const createdStr = created.toLocaleDateString('pt-BR') + ' às ' + created.toLocaleTimeString('pt-BR');
        const updatedStr = updated.toLocaleDateString('pt-BR') + ' às ' + updated.toLocaleTimeString('pt-BR');
        
        this.noteInfo.innerHTML = `
            <div>Criada: ${createdStr}</div>
            <div>Modificada: ${updatedStr}</div>
            <div>Versão: ${this.currentNote.version || 1}</div>
        `;
    }
    
    updateWordCount() {
        if (!this.wordCount || !this.noteContent) return;
        
        const content = this.noteContent.value || '';
        const words = this.countWords(content);
        const chars = content.length;
        
        this.wordCount.textContent = `${words} palavras, ${chars} caracteres`;
    }
    
    countWords(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }
    
    updateSyncStatus() {
        if (!this.syncStatus || !this.syncText) return;
        
        const unsyncedCount = Array.from(this.notes.values()).filter(n => !n.synced).length;
        this.syncStatus.pendingCount = unsyncedCount;
        this.syncStatus.totalNotes = this.notes.size;
        
        if (!this.isOnline) {
            this.syncStatus.className = 'sync-indicator offline';
            this.syncText.textContent = 'Offline';
        } else if (this.syncStatus.inProgress) {
            this.syncStatus.className = 'sync-indicator syncing';
            this.syncText.textContent = 'Sincronizando...';
        } else if (unsyncedCount > 0) {
            this.syncStatus.className = 'sync-indicator pending';
            this.syncText.textContent = `${unsyncedCount} não sincronizada(s)`;
        } else if (this.syncStatus.errorCount > 0) {
            this.syncStatus.className = 'sync-indicator error';
            this.syncText.textContent = 'Erro na sincronização';
        } else {
            this.syncStatus.className = 'sync-indicator synced';
            this.syncText.textContent = 'Sincronizado';
        }
    }
    
    // Métodos de sincronização (similar ao chat)
    incrementVectorClock() {
        const current = this.vectorClock.get(this.nodeId) || 0;
        this.vectorClock.set(this.nodeId, current + 1);
        return new Map(this.vectorClock);
    }
    
    async queueForSync(note) {
        try {
            const syncItem = {
                noteId: note.id,
                action: 'update',
                timestamp: Date.now(),
                priority: 1,
                retryCount: 0
            };
            
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            await store.add(syncItem);
            
            console.log('[NeoNetNotes Enhanced] Note queued for sync:', note.title);
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error queuing for sync:', error);
        }
    }
    
    async performSync() {
        if (this.syncStatus.inProgress || !this.isOnline) {
            return;
        }
        
        this.syncStatus.inProgress = true;
        this.updateSyncStatus();
        
        try {
            console.log('[NeoNetNotes Enhanced] Starting sync...');
            
            const unsyncedNotes = Array.from(this.notes.values()).filter(n => !n.synced);
            
            if (unsyncedNotes.length > 0) {
                const results = await Promise.allSettled(
                    unsyncedNotes.map(note => this.syncNote(note))
                );
                
                const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
                const failed = results.length - successful;
                
                this.syncStatus.errorCount = failed;
                this.syncStatus.lastSync = Date.now();
                
                console.log(`[NeoNetNotes Enhanced] Sync completed: ${successful} successful, ${failed} failed`);
            }
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Sync failed:', error);
            this.syncStatus.errorCount++;
        } finally {
            this.syncStatus.inProgress = false;
            this.updateSyncStatus();
        }
    }
    
    async syncNote(note) {
        try {
            // Simular sincronização com rede
            const success = await this.sendToNetwork(note);
            
            if (success) {
                note.synced = true;
                await this.saveNote(note);
                this.renderNotesList();
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error syncing note:', error);
            return false;
        }
    }
    
    async sendToNetwork(note) {
        // Simular envio para rede
        return new Promise((resolve) => {
            setTimeout(() => {
                const success = Math.random() > 0.1; // 90% de sucesso
                resolve(success);
            }, 100 + Math.random() * 500);
        });
    }
    
    setupAutoSync() {
        // Sincronização automática a cada 60 segundos
        setInterval(() => {
            if (this.isOnline) {
                this.performSync();
            }
        }, 60000);
    }
    
    setupAutoBackup() {
        if (!this.backupConfig.autoBackup) return;
        
        setInterval(() => {
            this.createBackup();
        }, this.backupConfig.backupInterval);
    }
    
    async createBackup() {
        try {
            const backup = {
                timestamp: Date.now(),
                type: 'auto',
                notes: Array.from(this.notes.values()),
                version: this.version,
                nodeId: this.nodeId
            };
            
            const transaction = this.db.transaction(['backups'], 'readwrite');
            const store = transaction.objectStore('backups');
            await store.add(backup);
            
            // Limpar backups antigos
            await this.cleanOldBackups();
            
            console.log('[NeoNetNotes Enhanced] Backup created');
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error creating backup:', error);
        }
    }
    
    async cleanOldBackups() {
        try {
            const transaction = this.db.transaction(['backups'], 'readwrite');
            const store = transaction.objectStore('backups');
            const index = store.index('timestamp');
            
            const request = index.openCursor(null, 'prev');
            const backups = [];
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    backups.push(cursor.value);
                    cursor.continue();
                } else {
                    // Manter apenas os últimos backups
                    if (backups.length > this.backupConfig.maxBackups) {
                        const toDelete = backups.slice(this.backupConfig.maxBackups);
                        toDelete.forEach(backup => {
                            store.delete(backup.id);
                        });
                    }
                }
            };
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error cleaning old backups:', error);
        }
    }
    
    // Métodos de exportação/importação
    async exportNotes() {
        try {
            const notes = Array.from(this.notes.values());
            const exportData = {
                notes,
                exportTimestamp: Date.now(),
                version: this.version,
                nodeId: this.nodeId,
                totalNotes: notes.length
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `neonet-notes-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            
            URL.revokeObjectURL(url);
            
            console.log('[NeoNetNotes Enhanced] Notes exported');
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error exporting notes:', error);
            alert('Erro ao exportar notas');
        }
    }
    
    async importNotes() {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (data.notes && Array.isArray(data.notes)) {
                    let imported = 0;
                    
                    for (const note of data.notes) {
                        // Verificar se nota já existe
                        if (!this.notes.has(note.id)) {
                            this.notes.set(note.id, note);
                            await this.saveNote(note);
                            imported++;
                        }
                    }
                    
                    this.renderNotesList();
                    this.updateSyncStatus();
                    
                    alert(`${imported} notas importadas com sucesso`);
                    console.log('[NeoNetNotes Enhanced] Notes imported:', imported);
                } else {
                    alert('Arquivo de importação inválido');
                }
            };
            
            input.click();
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error importing notes:', error);
            alert('Erro ao importar notas');
        }
    }
    
    // Event handlers
    handleOnline() {
        console.log('[NeoNetNotes Enhanced] Connection restored');
        this.isOnline = true;
        this.updateSyncStatus();
        setTimeout(() => this.performSync(), 1000);
    }
    
    handleOffline() {
        console.log('[NeoNetNotes Enhanced] Connection lost');
        this.isOnline = false;
        this.updateSyncStatus();
    }
    
    handleSystemSync(data) {
        console.log('[NeoNetNotes Enhanced] System sync completed:', data);
    }
    
    handleInitializationError(error) {
        console.error('[NeoNetNotes Enhanced] Initialization error:', error);
        this.initFallbackMode();
    }
    
    initFallbackMode() {
        console.log('[NeoNetNotes Enhanced] Initializing fallback mode...');
        this.useFallbackStorage = true;
        
        // Mostrar aviso
        if (this.notesList) {
            const warning = document.createElement('div');
            warning.className = 'system-message warning';
            warning.innerHTML = `
                <div class="warning-icon">⚠️</div>
                <div class="warning-text">
                    Modo limitado ativado. Algumas funcionalidades podem não estar disponíveis.
                </div>
            `;
            this.notesList.appendChild(warning);
        }
    }
    
    registerWithNeoNet() {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'neonet-dapp-register',
                dapp: {
                    id: 'neonet-notes',
                    name: 'NeoNet Notes Enhanced',
                    version: this.version,
                    capabilities: ['storage', 'sync', 'export', 'import'],
                    userId: this.userId
                }
            }, '*');
        }
    }
    
    saveCurrentState() {
        try {
            const state = {
                currentNoteId: this.currentNote?.id,
                searchQuery: this.searchQuery,
                lastSyncTimestamp: this.syncStatus.lastSync,
                vectorClock: Array.from(this.vectorClock.entries())
            };
            
            localStorage.setItem('neonet-notes-state-backup', JSON.stringify(state));
        } catch (error) {
            console.error('[NeoNetNotes Enhanced] Error saving state:', error);
        }
    }
    
    // Utility methods
    generateNoteId() {
        return `note_${this.nodeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // API pública
    getStatus() {
        return {
            version: this.version,
            isOnline: this.isOnline,
            noteCount: this.notes.size,
            syncStatus: this.syncStatus,
            currentNote: this.currentNote?.id,
            nodeId: this.nodeId,
            userId: this.userId
        };
    }
    
    async exportNotesData() {
        return {
            notes: Array.from(this.notes.values()),
            exportTimestamp: Date.now(),
            version: this.version,
            nodeId: this.nodeId
        };
    }
    
    async importNotesData(data) {
        if (data.notes && Array.isArray(data.notes)) {
            for (const note of data.notes) {
                this.notes.set(note.id, note);
                await this.saveNote(note);
            }
            this.renderNotesList();
            this.updateSyncStatus();
        }
    }
}

// Inicializar aplicativo quando DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    window.neonetNotes = new NeoNetNotesEnhanced();
});

// Exportar para uso em outros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeoNetNotesEnhanced;
}

