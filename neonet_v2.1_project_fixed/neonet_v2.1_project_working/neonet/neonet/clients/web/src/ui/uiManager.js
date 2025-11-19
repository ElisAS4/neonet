// neonet/clients/web/src/ui/uiManager.js

/**
 * Gerenciador de Interface do Usuário para NeoNet
 * Centraliza a gestão da UI e fornece métodos para atualizar elementos da interface
 */
class UIManager {
    constructor() {
        this.messageContainer = null;
        this.networkStatusElement = null;
        this.peerCountElement = null;
    }

    /**
     * Inicializa o gerenciador de UI
     */
    init() {
        this.createMessageContainer();
        this.findUIElements();
        this.setupEventListeners();
        console.log('[UIManager] Initialized');
    }

    /**
     * Cria o container de mensagens se não existir
     */
    createMessageContainer() {
        this.messageContainer = document.getElementById('messageContainer');
        if (!this.messageContainer) {
            this.messageContainer = document.createElement('div');
            this.messageContainer.id = 'messageContainer';
            this.messageContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
                max-width: 300px;
            `;
            document.body.appendChild(this.messageContainer);
        }
    }

    /**
     * Encontra elementos da UI
     */
    findUIElements() {
        this.networkStatusElement = document.getElementById('networkStatus');
        this.peerCountElement = document.getElementById('peerCount');
        this.networkStatusTextElement = document.getElementById('networkStatusText');
    }

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Listener para eventos de conectividade customizados
        window.addEventListener('neonet-online', () => {
            this.displayMessage('Conexão restaurada!', 'success');
        });

        window.addEventListener('neonet-offline', () => {
            this.displayMessage('Operando offline', 'warning');
        });
    }

    /**
     * Exibe uma mensagem temporária
     * @param {string} message - Mensagem a ser exibida
     * @param {string} type - Tipo da mensagem (info, success, warning, error)
     * @param {number} duration - Duração em milissegundos (padrão: 3000)
     */
    displayMessage(message, type = 'info', duration = 3000) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        
        const colors = {
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FF9800',
            error: '#F44336'
        };

        messageElement.style.cssText = `
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease-out;
            cursor: pointer;
        `;

        // Adicionar animação CSS
        if (!document.getElementById('neonet-ui-styles')) {
            const style = document.createElement('style');
            style.id = 'neonet-ui-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        this.messageContainer.appendChild(messageElement);

        // Remover mensagem ao clicar
        messageElement.addEventListener('click', () => {
            this.removeMessage(messageElement);
        });

        // Remover automaticamente após a duração especificada
        setTimeout(() => {
            this.removeMessage(messageElement);
        }, duration);
    }

    /**
     * Remove uma mensagem com animação
     * @param {HTMLElement} messageElement - Elemento da mensagem
     */
    removeMessage(messageElement) {
        if (messageElement && messageElement.parentNode) {
            messageElement.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (messageElement.parentNode) {
                    messageElement.parentNode.removeChild(messageElement);
                }
            }, 300);
        }
    }

    /**
     * Atualiza o status da rede na UI
     * @param {string} status - Status da rede (online, offline, connecting)
     * @param {number} peerCount - Número de pares conectados
     */
    updateNetworkStatus(status, peerCount = 0) {
        if (this.networkStatusElement) {
            this.networkStatusElement.className = `status-indicator ${status}`;
        }

        if (this.networkStatusTextElement) {
            const statusTexts = {
                online: 'Conectado à rede P2P',
                offline: 'Modo offline - dados locais disponíveis',
                connecting: 'Conectando à rede P2P...'
            };
            this.networkStatusTextElement.textContent = statusTexts[status] || 'Status desconhecido';
        }

        if (this.peerCountElement) {
            this.peerCountElement.textContent = peerCount.toString();
        }

        console.log(`[UIManager] Network status updated: ${status}, peers: ${peerCount}`);
    }

    /**
     * Mostra um modal de confirmação
     * @param {string} message - Mensagem do modal
     * @param {Function} onConfirm - Callback para confirmação
     * @param {Function} onCancel - Callback para cancelamento
     */
    showConfirmModal(message, onConfirm, onCancel) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        `;

        modalContent.innerHTML = `
            <p style="margin-bottom: 20px; color: #333; font-size: 16px;">${message}</p>
            <button id="confirmBtn" style="background: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin-right: 10px; cursor: pointer;">Confirmar</button>
            <button id="cancelBtn" style="background: #ccc; color: #333; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Cancelar</button>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Event listeners
        modalContent.querySelector('#confirmBtn').addEventListener('click', () => {
            document.body.removeChild(modal);
            if (onConfirm) onConfirm();
        });

        modalContent.querySelector('#cancelBtn').addEventListener('click', () => {
            document.body.removeChild(modal);
            if (onCancel) onCancel();
        });

        // Fechar ao clicar fora do modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                if (onCancel) onCancel();
            }
        });
    }

    /**
     * Mostra um indicador de carregamento
     * @param {string} message - Mensagem do carregamento
     * @returns {Function} Função para remover o indicador
     */
    showLoading(message = 'Carregando...') {
        const loading = document.createElement('div');
        loading.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            color: white;
            font-size: 18px;
        `;

        loading.innerHTML = `
            <div style="text-align: center;">
                <div style="border: 4px solid #f3f3f3; border-top: 4px solid #2196F3; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
                <div>${message}</div>
            </div>
        `;

        // Adicionar animação de spin se não existir
        if (!document.getElementById('spin-animation')) {
            const style = document.createElement('style');
            style.id = 'spin-animation';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(loading);

        return () => {
            if (loading.parentNode) {
                loading.parentNode.removeChild(loading);
            }
        };
    }
}

export default UIManager;

