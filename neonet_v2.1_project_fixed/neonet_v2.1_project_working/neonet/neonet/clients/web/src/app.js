// neonet/clients/web/src/app.js

import UIManager from './ui/uiManager.js';
import PeerManager from './p2p/peerManager.js';
import AppLoader from './platform/appLoader.js';
import IndexedDBManager from './utils/IndexedDBManager.js';

/**
 * Classe principal da aplicação NeoNet.
 * Orquestra a inicialização dos módulos e a lógica central.
 */
class NeoNetApp {
    constructor() {
        this.uiManager = new UIManager();
        this.peerManager = new PeerManager();
        this.appLoader = new AppLoader();
        this.dbManager = IndexedDBManager; // Usar a instância singleton
    }

    /**
     * Inicializa a aplicação NeoNet.
     */
    async init() {
        console.log("NeoNet App initializing...");

        // 1. Inicializar IndexedDB
        try {
            await this.dbManager.open();
            console.log("IndexedDB initialized successfully.");
        } catch (error) {
            console.error("Failed to initialize IndexedDB:", error);
            this.uiManager.displayMessage("Erro ao inicializar o armazenamento local.", "error");
            return;
        }

        // 2. Registrar Service Worker
        if ("serviceWorker" in navigator) {
            try {
                const registration = await navigator.serviceWorker.register("/sw.js");
                console.log("Service Worker registered with scope:", registration.scope);
            } catch (error) {
                console.error("Service Worker registration failed:", error);
                this.uiManager.displayMessage("Erro ao registrar o Service Worker.", "warning");
            }
        }

        // 3. Inicializar UI
        this.uiManager.init();
        this.uiManager.displayMessage("Bem-vindo à NeoNet!", "info");

        // 4. Conectar à rede P2P
        try {
            await this.peerManager.connect();
            this.uiManager.updateNetworkStatus("online", this.peerManager.getConnectedPeersCount());
            console.log("Connected to P2P network.");
        } catch (error) {
            console.error("Failed to connect to P2P network:", error);
            this.uiManager.updateNetworkStatus("offline", 0);
            this.uiManager.displayMessage("Não foi possível conectar à rede P2P. Operando offline.", "warning");
        }

        // 5. Carregar dApps
        await this.appLoader.loadInstalledDApps();
        console.log("DApps loaded.");

        // Exemplo de uso do IndexedDB
        // await this.dbManager.add("dappData", { id: "test-note-1", content: "Hello NeoNet!" });
        // const note = await this.dbManager.get("dappData", "test-note-1");
        // console.log("Retrieved note:", note);

        console.log("NeoNet App initialized.");
    }
}

// Inicializa a aplicação quando o DOM estiver carregado
document.addEventListener("DOMContentLoaded", () => {
    const app = new NeoNetApp();
    app.init();
});


