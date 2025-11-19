// neonet/clients/web/src/utils/IndexedDBManager.js

/**
 * Gerenciador de IndexedDB para NeoNet
 * Abstrai operações comuns com IndexedDB, incluindo criação de stores e transações.
 */
class IndexedDBManager {
    constructor(dbName = 'neonetDB', dbVersion = 1) {
        this.dbName = dbName;
        this.dbVersion = dbVersion;
        this.db = null;
    }

    /**
     * Abre a conexão com o IndexedDB e cria/atualiza os object stores.
     * @returns {Promise<IDBDatabase>} A instância do banco de dados.
     */
    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = event => {
                this.db = event.target.result;
                console.log(`[IndexedDBManager] Upgrading DB to version ${this.dbVersion}`);

                // Object store para dados gerais das dApps (ex: notas, chat messages)
                if (!this.db.objectStoreNames.contains('dappData')) {
                    this.db.createObjectStore('dappData', { keyPath: 'id' });
                }

                // Object store para a fila de sincronização (operações offline)
                if (!this.db.objectStoreNames.contains('syncQueue')) {
                    const syncQueueStore = this.db.createObjectStore('syncQueue', { keyPath: 'id' });
                    syncQueueStore.createIndex('status', 'status', { unique: false });
                    syncQueueStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Object store para metadados de pares P2P (para bootstrap)
                if (!this.db.objectStoreNames.contains('peerMetadata')) {
                    this.db.createObjectStore('peerMetadata', { keyPath: 'peerId' });
                }

                // Adicione outros object stores conforme necessário para suas dApps
            };

            request.onsuccess = event => {
                this.db = event.target.result;
                console.log('[IndexedDBManager] DB opened successfully');
                resolve(this.db);
            };

            request.onerror = event => {
                console.error('[IndexedDBManager] DB open error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Obtém uma transação para um ou mais object stores.
     * @param {string|string[]} storeNames - Nome(s) do(s) object store(s).
     * @param {IDBTransactionMode} mode - Modo da transação ('readonly' ou 'readwrite').
     * @returns {IDBTransaction} A instância da transação.
     */
    async getTransaction(storeNames, mode) {
        if (!this.db) {
            await this.open();
        }
        return this.db.transaction(storeNames, mode);
    }

    /**
     * Adiciona um item a um object store.
     * @param {string} storeName - Nome do object store.
     * @param {Object} item - O item a ser adicionado.
     * @returns {Promise<any>} A chave do item adicionado.
     */
    async add(storeName, item) {
        const transaction = await this.getTransaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.add(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Obtém um item de um object store pela chave.
     * @param {string} storeName - Nome do object store.
     * @param {any} key - A chave do item.
     * @returns {Promise<Object|undefined>} O item encontrado ou undefined.
     */
    async get(storeName, key) {
        const transaction = await this.getTransaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Atualiza um item em um object store.
     * @param {string} storeName - Nome do object store.
     * @param {any} key - A chave do item a ser atualizado.
     * @param {Object} newItem - O novo item (com a mesma chave).
     * @returns {Promise<any>} A chave do item atualizado.
     */
    async update(storeName, key, newItem) {
        const transaction = await this.getTransaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.put(newItem);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Deleta um item de um object store pela chave.
     * @param {string} storeName - Nome do object store.
     * @param {any} key - A chave do item a ser deletado.
     * @returns {Promise<void>} Promessa que resolve quando a operação é concluída.
     */
    async delete(storeName, key) {
        const transaction = await this.getTransaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Obtém todos os itens de um object store.
     * @param {string} storeName - Nome do object store.
     * @returns {Promise<Object[]>} Um array de todos os itens.
     */
    async getAll(storeName) {
        const transaction = await this.getTransaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Limpa todos os itens de um object store.
     * @param {string} storeName - Nome do object store.
     * @returns {Promise<void>} Promessa que resolve quando a operação é concluída.
     */
    async clear(storeName) {
        const transaction = await this.getTransaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Busca itens por um índice.
     * @param {string} storeName - Nome do object store.
     * @param {string} indexName - Nome do índice.
     * @param {IDBKeyRange|IDBValidKey} query - A query para o índice.
     * @returns {Promise<Object[]>} Um array de itens que correspondem à query.
     */
    async getByIndex(storeName, indexName, query) {
        const transaction = await this.getTransaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        return new Promise((resolve, reject) => {
            const request = index.getAll(query);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Exportar instância singleton
const indexedDBManager = new IndexedDBManager();
export default indexedDBManager;


