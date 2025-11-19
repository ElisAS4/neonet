// neonet/clients/web/src/main.js

// Ponto de entrada principal do Webpack
import './app.js';

console.log("NeoNet main.js loaded");

// Configurações globais
window.NEONET_CONFIG = {
    version: "1.0.0",
    signalingServerUrl: "ws://localhost:8080",
    offlineFirst: true,
    debug: true
};

// Verificar compatibilidade do navegador
if (!window.indexedDB) {
    console.error("IndexedDB not supported");
    alert("Seu navegador não suporta IndexedDB. A NeoNet pode não funcionar corretamente.");
}

if (!("serviceWorker" in navigator)) {
    console.warn("Service Workers not supported");
    alert("Seu navegador não suporta Service Workers. A funcionalidade offline pode ser limitada.");
}

// Configurar event listeners globais
window.addEventListener("online", () => {
    console.log("Network connection restored");
    // Disparar evento customizado para outros módulos
    window.dispatchEvent(new CustomEvent("neonet-online"));
});

window.addEventListener("offline", () => {
    console.log("Network connection lost");
    // Disparar evento customizado para outros módulos
    window.dispatchEvent(new CustomEvent("neonet-offline"));
});

// Função global para debug
window.neonetDebug = {
    getStats: () => {
        return {
            online: navigator.onLine,
            serviceWorkerRegistered: !!navigator.serviceWorker.controller,
            indexedDBSupported: !!window.indexedDB
        };
    }
};

