// neonet/clients/web/mock-dapps/neonet-notes/notes.js

class NeoNetNotes {
    constructor() {
        this.notes = [];
        this.currentNote = null;
        this.isOnline = navigator.onLine;
        this.autoSaveTimeout = null;
        
        this.initializeElements();
        this.initializeEventListeners();
        this.loadStoredNotes();
        this.updateSyncStatus();
        
        console.log('[NeoNetNotes] Initialized');
    }

    /**
     * Inicializa elementos do DOM
     */
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
    }

    /**
     * Inicializa event listeners
     */
    initializeEventListeners() {
        // Botões
        this.newNoteBtn.addEventListener('click', () => this.createNewNote());
        this.saveBtn.addEventListener('click', () => this.saveCurrentNote());
        this.deleteBtn.addEventListener('click', () => this.deleteCurrentNote());

        // Busca
        this.searchInput.addEventListener('input', (e) => this.searchNotes(e.target.value));

        // Auto-save
        this.noteTitle.addEventListener('input', () => this.scheduleAutoSave());
        this.noteContent.addEventListener('input', () => this.scheduleAutoSave());

        // Conectividade
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateSyncStatus();
            this.syncNotes();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateSyncStatus();
        });

        // Atalhos de teclado
        document.addEventListener('keydown', (e) => {
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
                }
            }
        });
    }

    /**
     * Carrega notas armazenadas localmente
     */
    async loadStoredNotes() {
        try {
            const stored = localStorage.getItem('neonet-notes');
            if (stored) {
                this.notes = JSON.parse(stored);
                this.renderNotesList();
                
                if (this.notes.length > 0) {
                    this.selectNote(this.notes[0].id);
                }
            }
        } catch (error) {
            console.error('[NeoNetNotes] Error loading stored notes:', error);
        }
    }

    /**
     * Salva notas no armazenamento local
     */
    saveNotes() {
        try {
            localStorage.setItem('neonet-notes', JSON.stringify(this.notes));
        } catch (error) {
            console.error('[NeoNetNotes] Error saving notes:', error);
        }
    }

    /**
     * Cria uma nova nota
     */
    createNewNote() {
        const note = {
            id: this.generateNoteId(),
            title: '',
            content: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            synced: false
        };

        this.notes.unshift(note);
        this.saveNotes();
        this.renderNotesList();
        this.selectNote(note.id);
        this.noteTitle.focus();
    }

    /**
     * Seleciona uma nota para edição
     */
    selectNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        // Salvar nota atual antes de trocar
        if (this.currentNote) {
            this.saveCurrentNote();
        }

        this.currentNote = note;
        this.noteTitle.value = note.title;
        this.noteContent.value = note.content;
        this.updateNoteInfo();
        this.updateActiveNoteInList(noteId);
    }

    /**
     * Salva a nota atual
     */
    saveCurrentNote() {
        if (!this.currentNote) return;

        const title = this.noteTitle.value.trim();
        const content = this.noteContent.value.trim();

        // Não salvar se estiver vazia
        if (!title && !content) {
            this.deleteNote(this.currentNote.id);
            return;
        }

        this.currentNote.title = title || 'Nota sem título';
        this.currentNote.content = content;
        this.currentNote.updatedAt = Date.now();
        this.currentNote.synced = false;

        this.saveNotes();
        this.renderNotesList();
        this.updateNoteInfo();
        this.updateSyncStatus();

        // Tentar sincronizar se online
        if (this.isOnline) {
            this.syncNote(this.currentNote);
        }

        console.log('[NeoNetNotes] Note saved:', this.currentNote.title);
    }

    /**
     * Exclui a nota atual
     */
    deleteCurrentNote() {
        if (!this.currentNote) return;

        if (confirm('Tem certeza que deseja excluir esta nota?')) {
            this.deleteNote(this.currentNote.id);
        }
    }

    /**
     * Exclui uma nota pelo ID
     */
    deleteNote(noteId) {
        this.notes = this.notes.filter(n => n.id !== noteId);
        this.saveNotes();
        this.renderNotesList();

        if (this.currentNote && this.currentNote.id === noteId) {
            this.currentNote = null;
            this.noteTitle.value = '';
            this.noteContent.value = '';
            this.updateNoteInfo();

            // Selecionar primeira nota se existir
            if (this.notes.length > 0) {
                this.selectNote(this.notes[0].id);
            }
        }
    }

    /**
     * Renderiza a lista de notas
     */
    renderNotesList() {
        if (this.notes.length === 0) {
            this.notesList.innerHTML = `
                <div class="empty-state">
                    <p>Nenhuma nota encontrada</p>
                    <small>Clique em "Nova Nota" para começar</small>
                </div>
            `;
            return;
        }

        this.notesList.innerHTML = this.notes.map(note => {
            const preview = note.content.substring(0, 100);
            const date = new Date(note.updatedAt).toLocaleDateString('pt-BR');
            const syncIcon = note.synced ? '✓' : '⏳';
            
            return `
                <div class="note-item" data-note-id="${note.id}">
                    <div class="note-item-title">${this.escapeHtml(note.title || 'Nota sem título')} ${syncIcon}</div>
                    <div class="note-item-preview">${this.escapeHtml(preview)}</div>
                    <div class="note-item-date">${date}</div>
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

    /**
     * Atualiza a nota ativa na lista
     */
    updateActiveNoteInList(noteId) {
        this.notesList.querySelectorAll('.note-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.noteId === noteId) {
                item.classList.add('active');
            }
        });
    }

    /**
     * Busca notas
     */
    searchNotes(query) {
        if (!query.trim()) {
            this.renderNotesList();
            return;
        }

        const filteredNotes = this.notes.filter(note => 
            note.title.toLowerCase().includes(query.toLowerCase()) ||
            note.content.toLowerCase().includes(query.toLowerCase())
        );

        // Renderizar resultados filtrados
        if (filteredNotes.length === 0) {
            this.notesList.innerHTML = `
                <div class="empty-state">
                    <p>Nenhuma nota encontrada</p>
                    <small>Tente outros termos de busca</small>
                </div>
            `;
            return;
        }

        this.notesList.innerHTML = filteredNotes.map(note => {
            const preview = note.content.substring(0, 100);
            const date = new Date(note.updatedAt).toLocaleDateString('pt-BR');
            const syncIcon = note.synced ? '✓' : '⏳';
            
            return `
                <div class="note-item" data-note-id="${note.id}">
                    <div class="note-item-title">${this.escapeHtml(note.title || 'Nota sem título')} ${syncIcon}</div>
                    <div class="note-item-preview">${this.escapeHtml(preview)}</div>
                    <div class="note-item-date">${date}</div>
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

    /**
     * Agenda auto-save
     */
    scheduleAutoSave() {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        this.autoSaveTimeout = setTimeout(() => {
            this.saveCurrentNote();
        }, 2000); // Auto-save após 2 segundos de inatividade
    }

    /**
     * Atualiza informações da nota
     */
    updateNoteInfo() {
        if (!this.currentNote) {
            this.noteInfo.textContent = 'Última modificação: nunca';
            return;
        }

        const date = new Date(this.currentNote.updatedAt);
        const dateStr = date.toLocaleDateString('pt-BR') + ' às ' + date.toLocaleTimeString('pt-BR');
        this.noteInfo.textContent = `Última modificação: ${dateStr}`;
    }

    /**
     * Atualiza status de sincronização
     */
    updateSyncStatus() {
        const unsyncedCount = this.notes.filter(n => !n.synced).length;
        
        if (!this.isOnline) {
            this.syncStatus.className = 'sync-indicator error';
            this.syncText.textContent = 'Offline';
        } else if (unsyncedCount > 0) {
            this.syncStatus.className = 'sync-indicator syncing';
            this.syncText.textContent = `${unsyncedCount} não sincronizada(s)`;
        } else {
            this.syncStatus.className = 'sync-indicator';
            this.syncText.textContent = 'Sincronizado';
        }
    }

    /**
     * Sincroniza uma nota (simulado)
     */
    async syncNote(note) {
        console.log('[NeoNetNotes] Syncing note:', note.title);
        
        // Simular sincronização
        return new Promise(resolve => {
            setTimeout(() => {
                note.synced = true;
                this.saveNotes();
                this.renderNotesList();
                this.updateSyncStatus();
                resolve();
            }, 1000);
        });
    }

    /**
     * Sincroniza todas as notas não sincronizadas
     */
    async syncNotes() {
        const unsyncedNotes = this.notes.filter(n => !n.synced);
        
        if (unsyncedNotes.length > 0) {
            console.log('[NeoNetNotes] Syncing', unsyncedNotes.length, 'notes');
            
            for (const note of unsyncedNotes) {
                await this.syncNote(note);
            }
        }
    }

    /**
     * Gera ID único para nota
     */
    generateNoteId() {
        return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Escapa HTML para prevenir XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Inicializar aplicativo quando DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    new NeoNetNotes();
});

