import SimplePeer from 'simple-peer';
import P2PConnectionBase from './P2PConnectionBase.js';

class SimplePeerConnection extends P2PConnectionBase {
    constructor(peerId, initiator, signalingCallback) {
        super(peerId, initiator, signalingCallback);
        this.peer = null;
    }

    initiate() {
        this.peer = new SimplePeer({
            initiator: this.initiator,
            trickle: false // For simplicity, using false. Can be true with more complex signaling.
        });

        this.peer.on('signal', data => {
            this.signalingCallback(this.peerId, data); // Send signaling data back to PeerManager
        });

        this.peer.on('connect', () => {
            this.connected = true;
            if (this.onConnectCallback) {
                this.onConnectCallback();
            }
        });

        this.peer.on('data', data => {
            if (this.onDataCallback) {
                this.onDataCallback(data);
            }
        });

        this.peer.on('close', () => {
            this.connected = false;
            if (this.onCloseCallback) {
                this.onCloseCallback();
            }
        });

        this.peer.on('error', err => {
            if (this.onErrorCallback) {
                this.onErrorCallback(err);
            }
        });
    }

    signal(data) {
        if (this.peer) {
            this.peer.signal(data);
        }
    }

    send(data) {
        if (this.peer && this.connected) {
            this.peer.send(data);
        } else {
            console.warn(`[SimplePeerConnection] Cannot send data, peer ${this.peerId} not connected.`);
        }
    }

    destroy() {
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }
}

export default SimplePeerConnection;


