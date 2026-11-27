/**
 * 2-4P LAN / Online multiplayer over direct WebRTC DataChannels (PeerJS).
 *
 * Host is 1P (slot 0) and holds one peer-to-peer DataConnection per Guest (slots 1-3, star
 * topology). The PeerJS cloud server is used only for the room-code handshake; all game
 * traffic flows peer-to-peer, so on a shared LAN ICE picks the local path and round trips
 * stay in single-digit milliseconds. No message relay/broker sits in the game data path.
 *
 * PeerJS is loaded on demand so offline local play has zero external dependencies.
 */

export const NET_ROLE = Object.freeze({
  LOCAL: 'LOCAL',
  HOST: 'HOST',
  GUEST: 'GUEST',
});

export const MAX_LAN_PLAYERS = 4;

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
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

const HEARTBEAT_MS = 2000;
const STALE_LINK_MS = 10000;
const CONNECT_TIMEOUT_MS = 15000;

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
    this.localPlayerIndex = 0; // 0 for Host, 1..3 for Guests

    this._peer = null;
    /**
     * Host only: one entry per Guest DataConnection (pending or open).
     * @type {Map<object, { conn: object, slot: number, welcomed: boolean, lastRx: number, rttMs: number|null, timer: any }>}
     */
    this._links = new Map();
    // Guest only: the single P2P link to Host, and whether Host has assigned us a slot.
    this._hostConn = null;
    this._welcomed = false;
    this._hostLastRx = 0;

    this._heartbeatTimer = null;
    this._connectTimer = null;
    this._sessionNonce = 0;

    window.addEventListener('beforeunload', () => this.disconnect(false));
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
    if (this.isHost()) {
      for (const link of this._links.values()) {
        if (link.welcomed && link.conn.open) return true;
      }
      return false;
    }
    return Boolean(this._welcomed && this._hostConn && this._hostConn.open);
  }

  getConnectedGuestSlots() {
    const slots = [];
    for (const link of this._links.values()) {
      if (link.welcomed) slots.push(link.slot);
    }
    slots.sort((a, b) => a - b);
    return slots;
  }

  getPlayerCount() {
    if (this.isHost()) return Math.max(2, 1 + this.getConnectedGuestSlots().length);
    return Math.max(2, this.localPlayerIndex + 1);
  }

  getConnectedTotalPlayers() {
    if (this.isHost()) return 1 + this.getConnectedGuestSlots().length;
    return this.isConnected() ? Math.max(2, this.localPlayerIndex + 1) : 1;
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
        localPlayerIndex: this.localPlayerIndex,
        guestSlots: this.getConnectedGuestSlots(),
      });
    }
  }

  _formatHostRosterMessage() {
    const slots = this.getConnectedGuestSlots();
    if (slots.length === 0) {
      return `Room ${this.roomCode} ready — waiting for players (2-4P)...`;
    }
    const labels = slots.map((s) => `${s + 1}P`).join(', ');
    return `${1 + slots.length}P Connected (1P Host + ${labels}) in Room ${this.roomCode}`;
  }

  // ==========================================================================
  // Host
  // ==========================================================================
  async hostRoom(customCode = null) {
    this.disconnect(false);
    const nonce = this._sessionNonce;
    this.role = NET_ROLE.HOST;
    this.localPlayerIndex = 0;
    this.roomCode = (customCode || generateRoomCode(4)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    this._setStatus('loading', 'Initializing WebRTC host...');

    let PeerCtor;
    try {
      PeerCtor = await loadPeerJS();
    } catch (err) {
      if (nonce !== this._sessionNonce) return;
      this.role = NET_ROLE.LOCAL;
      this._setStatus('error', err.message);
      return;
    }
    if (nonce !== this._sessionNonce) return;

    const peer = new PeerCtor(`${PEER_PREFIX}${this.roomCode}`, { config: ICE_CONFIG });
    this._peer = peer;

    peer.on('open', () => {
      if (this._peer !== peer) return;
      this._startHeartbeat();
      this._setStatus(this.isConnected() ? 'connected' : 'waiting', this._formatHostRosterMessage());
    });

    peer.on('connection', (conn) => {
      if (this._peer !== peer) return;
      this._acceptGuest(conn);
    });

    peer.on('disconnected', () => {
      // Only the signaling socket dropped: open P2P links keep running. Re-register so
      // further Guests can still find this room.
      if (this._peer !== peer || peer.destroyed) return;
      setTimeout(() => {
        if (this._peer === peer && !peer.destroyed && peer.disconnected) {
          try { peer.reconnect(); } catch {}
        }
      }, 1000);
    });

    peer.on('error', (err) => {
      if (this._peer !== peer) return;
      if (err && err.type === 'unavailable-id' && !customCode) {
        // Rare room code collision — retry with a fresh code
        this.hostRoom();
        return;
      }
      // Signaling hiccups don't affect Guests already linked peer-to-peer.
      if (this.isConnected()) return;
      this._setStatus('error', `Host error: ${err?.message || err?.type || 'Connection failed'}`);
    });
  }

  _allocateGuestSlot() {
    const used = new Set(this.getConnectedGuestSlots());
    for (let s = 1; s < MAX_LAN_PLAYERS; s++) {
      if (!used.has(s)) return s;
    }
    return -1;
  }

  _acceptGuest(conn) {
    const link = {
      conn,
      slot: -1,
      welcomed: false,
      lastRx: performance.now(),
      rttMs: null,
      timer: null,
    };
    this._links.set(conn, link);
    link.timer = setTimeout(() => {
      if (!link.welcomed) this._dropGuest(conn);
    }, CONNECT_TIMEOUT_MS);

    const handleOpen = () => {
      if (this._links.get(conn) !== link || link.welcomed) return;
      clearTimeout(link.timer);
      const slot = this._allocateGuestSlot();
      if (slot < 0) {
        this._safeSend(conn, { type: 'full' });
        setTimeout(() => this._dropGuest(conn), 150);
        return;
      }
      link.slot = slot;
      link.welcomed = true;
      link.lastRx = performance.now();
      this._safeSend(conn, {
        type: 'welcome',
        slot,
        totalPlayers: this.getConnectedTotalPlayers(),
      });
      this._safeSend(conn, { type: 'ping', t: performance.now() });
      this._setStatus('connected', this._formatHostRosterMessage());
      if (this.callbacks.onPeerConnected) this.callbacks.onPeerConnected(slot);
    };

    conn.on('open', handleOpen);
    conn.on('data', (msg) => {
      if (this._links.get(conn) !== link || !msg || typeof msg !== 'object') return;
      link.lastRx = performance.now();
      this._handleHostData(link, msg);
    });
    conn.on('close', () => this._dropGuest(conn));
    conn.on('error', () => this._dropGuest(conn));
    conn.on('iceStateChanged', (iceState) => {
      if (iceState === 'failed' || iceState === 'closed') this._dropGuest(conn);
    });

    if (conn.open) handleOpen();
  }

  _dropGuest(conn) {
    const link = this._links.get(conn);
    if (!link) return;
    this._links.delete(conn);
    clearTimeout(link.timer);
    try { conn.close(); } catch {}
    if (!link.welcomed || !this.isHost()) return;

    this._updateHostPing();
    this._setStatus(this.isConnected() ? 'connected' : 'waiting', this._formatHostRosterMessage());
    if (this.callbacks.onPeerDisconnected) this.callbacks.onPeerDisconnected(link.slot);
  }

  _handleHostData(link, msg) {
    if (msg.type === 'ping') {
      this._safeSend(link.conn, { type: 'pong', t: msg.t });
      return;
    }
    if (msg.type === 'pong') {
      link.rttMs = Math.max(1, Math.round(performance.now() - msg.t));
      this._updateHostPing();
      this._setStatus(this.status, this.statusMessage);
      return;
    }
    if (msg.type === 'bye') {
      this._dropGuest(link.conn);
      return;
    }
    if (link.welcomed && this.callbacks.onMessage) {
      this.callbacks.onMessage({ ...msg, slot: link.slot });
    }
  }

  /** Host shows the worst Guest round trip so a slow link is never hidden. */
  _updateHostPing() {
    let worst = null;
    for (const link of this._links.values()) {
      if (link.welcomed && link.rttMs !== null) worst = Math.max(worst ?? 0, link.rttMs);
    }
    this.pingMs = worst;
  }

  // ==========================================================================
  // Guest
  // ==========================================================================
  async joinRoom(rawCode) {
    const cleanCode = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanCode.length < 3) {
      this._setStatus('error', 'Please enter a valid room code.');
      return;
    }

    this.disconnect(false);
    const nonce = this._sessionNonce;
    this.role = NET_ROLE.GUEST;
    this.localPlayerIndex = 1;
    this.roomCode = cleanCode;
    this._setStatus('loading', `Connecting to room ${cleanCode}...`);

    let PeerCtor;
    try {
      PeerCtor = await loadPeerJS();
    } catch (err) {
      if (nonce !== this._sessionNonce) return;
      this.role = NET_ROLE.LOCAL;
      this._setStatus('error', err.message);
      return;
    }
    if (nonce !== this._sessionNonce) return;

    const peer = new PeerCtor(undefined, { config: ICE_CONFIG });
    this._peer = peer;

    peer.on('open', () => {
      if (this._peer !== peer || this._hostConn) return;
      this._setStatus('connecting', `Joining room ${cleanCode}...`);
      const conn = peer.connect(`${PEER_PREFIX}${cleanCode}`, {
        reliable: true,
        serialization: 'json',
      });
      this._attachHostConn(conn);
    });

    peer.on('error', (err) => {
      if (this._peer !== peer) return;
      // Signaling hiccups don't affect an established P2P link to Host.
      if (this.isConnected()) return;
      this._clearConnectTimer();
      const msg = err?.type === 'peer-unavailable'
        ? `Room ${cleanCode} not found. Check the code and ensure Host is open.`
        : `Connection error: ${err?.message || err?.type || 'Failed to connect'}`;
      this._setStatus('error', msg);
    });
  }

  _attachHostConn(conn) {
    this._hostConn = conn;
    this._welcomed = false;
    this._clearConnectTimer();

    this._connectTimer = setTimeout(() => {
      if (this._hostConn === conn && !this._welcomed) {
        this._setStatus(
          'error',
          `Timed out connecting to room ${this.roomCode}. Check the code and ensure Host is still open, then retry.`
        );
      }
    }, CONNECT_TIMEOUT_MS);

    conn.on('open', () => {
      if (this._hostConn !== conn) return;
      this._hostLastRx = performance.now();
    });

    conn.on('iceStateChanged', (iceState) => {
      if (this._hostConn !== conn) return;
      if (iceState === 'checking' && !conn.open) {
        this._setStatus('connecting', `Negotiating P2P link (${this.roomCode})...`);
      } else if (iceState === 'failed') {
        if (this._welcomed) {
          this._handleGuestDisconnected('P2P link to Host failed.');
        } else {
          this._clearConnectTimer();
          this._setStatus('error', 'WebRTC P2P blocked by firewall/NAT. Try reconnecting or check network settings.');
        }
      }
    });

    conn.on('data', (msg) => {
      if (this._hostConn !== conn || !msg || typeof msg !== 'object') return;
      this._hostLastRx = performance.now();
      this._handleGuestData(msg);
    });

    conn.on('close', () => {
      if (this._hostConn !== conn) return;
      this._handleGuestDisconnected('Disconnected from Host.');
    });

    conn.on('error', (err) => {
      if (this._hostConn !== conn) return;
      this._handleGuestDisconnected(`Link error: ${err?.message || 'Connection lost'}`);
    });
  }

  _handleGuestData(msg) {
    if (msg.type === 'welcome') {
      this.localPlayerIndex = typeof msg.slot === 'number' ? msg.slot : 1;
      if (!this._welcomed) {
        this._welcomed = true;
        this._clearConnectTimer();
        this.pingMs = null;
        this._startHeartbeat();
        this._setStatus('connected', `Connected as ${this.localPlayerIndex + 1}P in Room ${this.roomCode}!`);
        if (this.callbacks.onPeerConnected) this.callbacks.onPeerConnected(this.localPlayerIndex);
      }
      return;
    }
    if (msg.type === 'full') {
      this.disconnect(false);
      this._setStatus('error', 'Room is already full (max 4 players).');
      return;
    }
    if (msg.type === 'bye') {
      this._handleGuestDisconnected('Host closed the room.');
      return;
    }
    if (msg.type === 'ping') {
      this._safeSend(this._hostConn, { type: 'pong', t: msg.t });
      return;
    }
    if (msg.type === 'pong') {
      this.pingMs = Math.max(1, Math.round(performance.now() - msg.t));
      this._setStatus(this.status, this.statusMessage);
      return;
    }
    if (this._welcomed && this.callbacks.onMessage) {
      this.callbacks.onMessage(msg);
    }
  }

  _handleGuestDisconnected(message) {
    if (!this.isGuest()) return;
    const wasConnected = this._welcomed;
    const conn = this._hostConn;
    this._stopHeartbeat();
    this._clearConnectTimer();
    this._hostConn = null;
    this._welcomed = false;
    this.pingMs = null;
    if (conn) {
      try { conn.close(); } catch {}
    }
    this._setStatus('error', message);
    if (wasConnected && this.callbacks.onPeerDisconnected) {
      this.callbacks.onPeerDisconnected(this.localPlayerIndex);
    }
  }

  // ==========================================================================
  // Shared
  // ==========================================================================
  _startHeartbeat() {
    this._stopHeartbeat();
    const tick = () => {
      const now = performance.now();
      if (this.isHost()) {
        for (const [conn, link] of [...this._links]) {
          if (!link.welcomed) continue;
          if (now - link.lastRx > STALE_LINK_MS) {
            this._dropGuest(conn);
            continue;
          }
          this._safeSend(conn, { type: 'ping', t: now });
        }
      } else if (this.isGuest() && this._welcomed) {
        if (now - this._hostLastRx > STALE_LINK_MS) {
          this._handleGuestDisconnected('Lost connection to Host.');
          return;
        }
        this._safeSend(this._hostConn, { type: 'ping', t: now });
      }
    };
    tick();
    this._heartbeatTimer = setInterval(tick, HEARTBEAT_MS);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _clearConnectTimer() {
    if (this._connectTimer) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }
  }

  _safeSend(conn, payload) {
    if (conn && conn.open) {
      try {
        conn.send(payload);
      } catch {
        // Ignore transient send errors while closing
      }
    }
  }

  /** Host broadcasts to every linked Guest; a Guest sends to Host. */
  send(payload) {
    if (this.isHost()) {
      for (const link of this._links.values()) {
        if (link.welcomed) this._safeSend(link.conn, payload);
      }
    } else if (this.isGuest() && this._welcomed) {
      this._safeSend(this._hostConn, payload);
    }
  }

  disconnect(notify = true) {
    this._sessionNonce++;
    this._stopHeartbeat();
    this._clearConnectTimer();

    // Best-effort goodbye so peers react instantly instead of waiting for the heartbeat timeout.
    const conns = [];
    for (const link of this._links.values()) {
      clearTimeout(link.timer);
      this._safeSend(link.conn, { type: 'bye' });
      conns.push(link.conn);
    }
    if (this._hostConn) {
      this._safeSend(this._hostConn, { type: 'bye' });
      conns.push(this._hostConn);
    }
    this._links.clear();
    this._hostConn = null;
    this._welcomed = false;
    for (const conn of conns) {
      try { conn.close(); } catch {}
    }
    if (this._peer) {
      try { this._peer.destroy(); } catch {}
      this._peer = null;
    }

    this.role = NET_ROLE.LOCAL;
    this.localPlayerIndex = 0;
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
