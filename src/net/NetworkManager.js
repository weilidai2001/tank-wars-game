/**
 * Peer-to-Peer WebRTC NetworkManager (Single Responsibility Principle).
 * Uses PeerJS for lightweight room-code signaling over the internet, while WebRTC ICE
 * automatically routes game traffic directly over the local LAN when both PCs share a network.
 *
 * Keeps the game 100% static (zero backend required) and loads PeerJS on demand so
 * offline local play has zero external dependencies.
 */

export const NET_ROLE = Object.freeze({
  LOCAL: 'LOCAL',
  HOST: 'HOST',
  GUEST: 'GUEST',
});

const PEER_PREFIX = 'ironsight-tw-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEERJS_CDNS = [
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
];

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

let _peerJsLoadPromise = null;

function loadPeerJS() {
  if (typeof window !== 'undefined' && window.Peer) {
    return Promise.resolve(window.Peer);
  }
  if (_peerJsLoadPromise) return _peerJsLoadPromise;

  _peerJsLoadPromise = new Promise((resolve, reject) => {
    const tryNext = (idx) => {
      if (idx >= PEERJS_CDNS.length) {
        _peerJsLoadPromise = null;
        reject(new Error('Failed to load PeerJS library. Check internet connection.'));
        return;
      }
      const script = document.createElement('script');
      script.src = PEERJS_CDNS[idx];
      script.async = true;
      script.onload = () => {
        if (window.Peer) resolve(window.Peer);
        else tryNext(idx + 1);
      };
      script.onerror = () => {
        script.remove();
        tryNext(idx + 1);
      };
      document.head.appendChild(script);
    };
    tryNext(0);
  });

  return _peerJsLoadPromise;
}

function generateRoomCode(len = 4) {
  let code = '';
  for (let i = 0; i < len; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export class NetworkManager {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;

    this.role = NET_ROLE.LOCAL;
    this.status = 'idle'; // idle | loading | waiting | connecting | connected | error
    this.statusMessage = '';
    this.roomCode = '';
    this.pingMs = null;

    this._peer = null;
    this._conn = null;
    this._pingTimer = null;
  }

  isNetworked() {
    return this.role !== NET_ROLE.LOCAL;
  }

  isHost() {
    return this.role === NET_ROLE.HOST;
  }

  isGuest() {
    return this.role === NET_ROLE.GUEST;
  }

  isConnected() {
    return Boolean(this._conn && this._conn.open);
  }

  getInviteUrl() {
    if (!this.roomCode) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('join', this.roomCode);
    url.searchParams.delete('autostart');
    return url.toString();
  }

  _setStatus(status, message = '') {
    this.status = status;
    this.statusMessage = message;
    if (this.callbacks.onStatusChanged) {
      this.callbacks.onStatusChanged({
        role: this.role,
        status: this.status,
        message: this.statusMessage,
        roomCode: this.roomCode,
        pingMs: this.pingMs,
      });
    }
  }

  async hostRoom(customCode = null) {
    this.disconnect(false);
    this.role = NET_ROLE.HOST;
    this.roomCode = (customCode || generateRoomCode(4)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    this._setStatus('loading', 'Initializing WebRTC host...');

    let PeerCtor;
    try {
      PeerCtor = await loadPeerJS();
    } catch (err) {
      this.role = NET_ROLE.LOCAL;
      this._setStatus('error', err.message);
      return;
    }

    const peerId = `${PEER_PREFIX}${this.roomCode}`;
    const peer = new PeerCtor(peerId, { config: ICE_CONFIG });
    this._peer = peer;

    peer.on('open', () => {
      if (this._peer !== peer) return;
      this._setStatus('waiting', `Room ${this.roomCode} ready — waiting for Player 2...`);
    });

    peer.on('connection', (conn) => {
      if (this._peer !== peer) return;
      // Only allow 1 guest in 2P mode; reject extra connections cleanly
      if (this._conn && this._conn.open) {
        conn.on('open', () => {
          conn.send({ type: 'full' });
          setTimeout(() => conn.close(), 120);
        });
        return;
      }
      this._attachConnection(conn);
    });

    peer.on('error', (err) => {
      if (this._peer !== peer) return;
      if (err && err.type === 'unavailable-id' && !customCode) {
        // Rare room code collision — retry with a fresh code
        this.hostRoom();
        return;
      }
      this._setStatus('error', `Host error: ${err?.message || err?.type || 'Connection failed'}`);
    });

    peer.on('disconnected', () => {
      if (this._peer !== peer) return;
      if (!this.isConnected()) {
        this._setStatus('error', 'Signaling disconnected. Click Host Room to retry.');
      }
    });
  }

  async joinRoom(rawCode) {
    const cleanCode = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanCode.length < 3) {
      this._setStatus('error', 'Please enter a valid room code.');
      return;
    }

    this.disconnect(false);
    this.role = NET_ROLE.GUEST;
    this.roomCode = cleanCode;
    this._setStatus('loading', `Connecting to room ${cleanCode}...`);

    let PeerCtor;
    try {
      PeerCtor = await loadPeerJS();
    } catch (err) {
      this.role = NET_ROLE.LOCAL;
      this._setStatus('error', err.message);
      return;
    }

    const peer = new PeerCtor(undefined, { config: ICE_CONFIG });
    this._peer = peer;

    peer.on('open', () => {
      if (this._peer !== peer) return;
      this._setStatus('connecting', `Joining room ${cleanCode}...`);
      const conn = peer.connect(`${PEER_PREFIX}${cleanCode}`, {
        reliable: true,
        serialization: 'json',
      });
      this._attachConnection(conn);
    });

    peer.on('error', (err) => {
      if (this._peer !== peer) return;
      const msg = err?.type === 'peer-unavailable'
        ? `Room ${cleanCode} not found. Check the code and ensure Host is open.`
        : `Connection error: ${err?.message || err?.type || 'Failed to connect'}`;
      this._setStatus('error', msg);
    });
  }

  _attachConnection(conn) {
    this._conn = conn;

    conn.on('open', () => {
      if (this._conn !== conn) return;
      this.pingMs = null;
      this._startPingLoop();
      this._setStatus(
        'connected',
        this.isHost()
          ? `Player 2 joined Room ${this.roomCode}!`
          : `Connected to Host (${this.roomCode})!`
      );
      if (this.callbacks.onPeerConnected) {
        this.callbacks.onPeerConnected();
      }
    });

    conn.on('data', (msg) => {
      if (this._conn !== conn || !msg || typeof msg !== 'object') return;
      if (msg.type === 'ping') {
        this.send({ type: 'pong', t: msg.t });
        return;
      }
      if (msg.type === 'pong') {
        this.pingMs = Math.max(1, Math.round(performance.now() - msg.t));
        this._setStatus(this.status, this.statusMessage);
        return;
      }
      if (msg.type === 'full') {
        this._setStatus('error', 'Room is already full.');
        this.disconnect(false);
        return;
      }
      if (this.callbacks.onMessage) {
        this.callbacks.onMessage(msg);
      }
    });

    conn.on('close', () => {
      if (this._conn !== conn) return;
      this._stopPingLoop();
      this._conn = null;
      this.pingMs = null;
      if (this.isHost()) {
        this._setStatus('waiting', `Player 2 disconnected. Room ${this.roomCode} still open...`);
      } else if (this.isGuest()) {
        this._setStatus('error', 'Disconnected from Host.');
      }
      if (this.callbacks.onPeerDisconnected) {
        this.callbacks.onPeerDisconnected();
      }
    });

    conn.on('error', (err) => {
      if (this._conn !== conn) return;
      this._setStatus('error', `Link error: ${err?.message || 'Connection lost'}`);
    });
  }

  _startPingLoop() {
    this._stopPingLoop();
    const sendPing = () => {
      if (this.isConnected()) {
        this.send({ type: 'ping', t: performance.now() });
      }
    };
    sendPing();
    this._pingTimer = setInterval(sendPing, 2000);
  }

  _stopPingLoop() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  send(payload) {
    if (this._conn && this._conn.open) {
      try {
        this._conn.send(payload);
      } catch {
        // Ignore transient send errors while closing
      }
    }
  }

  disconnect(notify = true) {
    this._stopPingLoop();
    if (this._conn) {
      try { this._conn.close(); } catch {}
      this._conn = null;
    }
    if (this._peer) {
      try { this._peer.destroy(); } catch {}
      this._peer = null;
    }
    this.role = NET_ROLE.LOCAL;
    this.roomCode = '';
    this.pingMs = null;
    if (notify) {
      this._setStatus('idle', '');
    } else {
      this.status = 'idle';
      this.statusMessage = '';
    }
  }
}
