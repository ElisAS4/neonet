# Propostas de Alteração para PeerManager_scalable.js e Arquitetura NeoNet

Para escalar o NeoNet para 100 milhões de peers, as seguintes alterações são propostas para o `PeerManager_scalable.js` e a arquitetura geral do NeoNet:

## 1. Abstração da Camada de Conexão P2P

Atualmente, `PeerManagerScalable` usa `SimplePeer` diretamente para todas as conexões P2P. Para suportar SFU/MCU e outras estratégias de escalabilidade, a lógica de conexão P2P precisa ser mais abstrata. Isso permitirá a integração de diferentes tipos de conexões (direta P2P, via SFU, via MCU) sem alterar a lógica central do `PeerManager`.

**Alterações Propostas:**
*   Introduzir uma interface ou classe base para `P2PConnection` que `SimplePeer` e futuras implementações de SFU/MCU possam aderir.
*   Modificar `initiatePeerConnection` para usar essa interface, permitindo que o `PeerManager` decida dinamicamente o tipo de conexão a ser estabelecida com base em fatores como o número de peers na sala ou a capacidade do peer.

## 2. Servidor de Sinalização Distribuído e Otimizado

O servidor de sinalização é um ponto crítico para a escalabilidade. A implementação atual pode não ser suficiente para 100 milhões de peers.

**Alterações Propostas:**
*   **Protocolo de Sinalização Otimizado:** Reduzir a verbosidade das mensagens de sinalização e otimizar o fluxo de descoberta de peers.
*   **Descoberta de Peers Hierárquica/Regional:** Em vez de enviar listas completas de peers, o servidor de sinalização pode enviar apenas peers relevantes (por exemplo, peers próximos geograficamente ou em 

