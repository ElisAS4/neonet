// neonet/clients/web/src/utils/CryptoManager.js

/**
 * Gerenciador Criptográfico para NeoNet
 * Fornece funcionalidades para criptografia/descriptografia de dados locais
 * e gerenciamento de chaves offline.
 */
class CryptoManager {
    constructor() {
        this.keyStoreName = 'neonetCryptoKeys';
        this.dbManager = null; // Será inicializado externamente ou em um método async
    }

    /**
     * Inicializa o CryptoManager com uma instância de IndexedDBManager.
     * @param {IndexedDBManager} dbManagerInstance - Instância do IndexedDBManager.
     */
    setDbManager(dbManagerInstance) {
        this.dbManager = dbManagerInstance;
    }

    /**
     * Gera uma chave AES para criptografia de dados.
     * @returns {Promise<CryptoKey>} A chave gerada.
     */
    async generateDataKey() {
        return await crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256,
            },
            true, // exportable
            ["encrypt", "decrypt"]
        );
    }

    /**
     * Gera um par de chaves RSA para assinatura/verificação ou troca de chaves.
     * @returns {Promise<CryptoKeyPair>} O par de chaves gerado.
     */
    async generateKeyPair() {
        return await crypto.subtle.generateKey(
            {
                name: "RSA-PSS",
                modulusLength: 2048,
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                hash: "SHA-256",
            },
            true, // exportable
            ["sign", "verify"]
        );
    }

    /**
     * Exporta uma chave criptográfica para armazenamento.
     * @param {CryptoKey} key - A chave a ser exportada.
     * @returns {Promise<JsonWebKey>} A chave em formato JWK.
     */
    async exportKey(key) {
        return await crypto.subtle.exportKey(
            "jwk",
            key
        );
    }

    /**
     * Importa uma chave criptográfica a partir de um JWK.
     * @param {JsonWebKey} jwk - A chave em formato JWK.
     * @param {string} algorithmName - Nome do algoritmo (ex: "AES-GCM", "RSA-PSS").
     * @param {string[]} usages - Usos da chave (ex: ["encrypt", "decrypt"]).
     * @returns {Promise<CryptoKey>} A chave importada.
     */
    async importKey(jwk, algorithmName, usages) {
        return await crypto.subtle.importKey(
            "jwk",
            jwk,
            { name: algorithmName },
            true, // extractable
            usages
        );
    }

    /**
     * Criptografa dados usando uma chave AES.
     * @param {CryptoKey} key - A chave AES para criptografar.
     * @param {ArrayBuffer} data - Os dados a serem criptografados.
     * @returns {Promise<{encryptedData: ArrayBuffer, iv: Uint8Array}>} Dados criptografados e IV.
     */
    async encrypt(key, data) {
        const iv = crypto.getRandomValues(new Uint8Array(12)); // Initialization Vector
        const encryptedData = await crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv,
            },
            key,
            data
        );
        return { encryptedData, iv };
    }

    /**
     * Descriptografa dados usando uma chave AES.
     * @param {CryptoKey} key - A chave AES para descriptografar.
     * @param {ArrayBuffer} encryptedData - Os dados criptografados.
     * @param {Uint8Array} iv - O Initialization Vector usado na criptografia.
     * @returns {Promise<ArrayBuffer>} Os dados descriptografados.
     */
    async decrypt(key, encryptedData, iv) {
        return await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv,
            },
            key,
            encryptedData
        );
    }

    /**
     * Armazena uma chave criptográfica no IndexedDB.
     * @param {string} keyId - ID único para a chave.
     * @param {CryptoKey} key - A chave a ser armazenada.
     * @param {string} type - Tipo da chave (e.g., 'data', 'private', 'public').
     * @returns {Promise<void>}
     */
    async storeKey(keyId, key, type) {
        if (!this.dbManager) {
            throw new Error("IndexedDBManager not set in CryptoManager.");
        }
        const exportedKey = await this.exportKey(key);
        await this.dbManager.add(this.keyStoreName, { id: keyId, type, jwk: exportedKey });
        console.log(`[CryptoManager] Key ${keyId} stored.`);
    }

    /**
     * Recupera uma chave criptográfica do IndexedDB.
     * @param {string} keyId - ID da chave.
     * @param {string} algorithmName - Nome do algoritmo.
     * @param {string[]} usages - Usos da chave.
     * @returns {Promise<CryptoKey|undefined>}
     */
    async retrieveKey(keyId, algorithmName, usages) {
        if (!this.dbManager) {
            throw new Error("IndexedDBManager not set in CryptoManager.");
        }
        const stored = await this.dbManager.get(this.keyStoreName, keyId);
        if (stored) {
            return await this.importKey(stored.jwk, algorithmName, usages);
        }
        return undefined;
    }

    /**
     * Deriva uma chave de uma senha usando PBKDF2.
     * @param {string} password - A senha do usuário.
     * @param {Uint8Array} salt - O salt para a derivação.
     * @returns {Promise<CryptoKey>} A chave derivada.
     */
    async deriveKeyFromPassword(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );

        return await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000, // Número de iterações, quanto maior, mais seguro (e mais lento)
                hash: "SHA-256",
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            true, // exportable
            ["encrypt", "decrypt"]
        );
    }

    /**
     * Gera um salt aleatório.
     * @returns {Uint8Array} O salt gerado.
     */
    generateSalt() {
        return crypto.getRandomValues(new Uint8Array(16));
    }

    /**
     * Converte ArrayBuffer para string Base64.
     * @param {ArrayBuffer} buffer - O buffer a ser convertido.
     * @returns {string} A string Base64.
     */
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    /**
     * Converte string Base64 para ArrayBuffer.
     * @param {string} base64 - A string Base64.
     * @returns {ArrayBuffer} O ArrayBuffer.
     */
    base64ToArrayBuffer(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

// Exportar instância singleton
const cryptoManager = new CryptoManager();
export default cryptoManager;


