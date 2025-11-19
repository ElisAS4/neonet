class P2PConnectionBase {
    constructor(peerId, initiator, signalingCallback) {
        this.peerId = peerId;
        this.initiator = initiator;
        this.signalingCallback = signalingCallback; // Callback to send signaling data to the server
        this.connected = false;
        this.onConnectCallback = null;
        this.onDataCallback = null;
        this.onCloseCallback = null;
        this.onErrorCallback = null;
    }

    onConnect(callback) {
        this.onConnectCallback = callback;
    }

    onData(callback) {
        this.onDataCallback = callback;
    }

    onClose(callback) {
        this.onCloseCallback = callback;
    }

    onError(callback) {
        this.onErrorCallback = callback;
    }

    // To be implemented by subclasses
    initiate() {
        throw new Error("Method 'initiate()' must be implemented.");
    }

    signal(data) {
        throw new Error("Method 'signal()' must be implemented.");
    }

    send(data) {
        throw new Error("Method 'send()' must be implemented.");
    }

    destroy() {
        throw new Error("Method 'destroy()' must be implemented.");
    }
}

export default P2PConnectionBase;


