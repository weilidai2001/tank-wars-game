/**
 * Static-Webpage 2-4P Multiplayer NetworkManager over Secure WebSockets (MQTT/WSS).
 * Host acts as 1P (slot 0) and assigns joining computers to slots 1 (2P), 2 (3P), and 3 (4P).
 * Uses public WSS MQTT brokers (EMQX primary, HiveMQ fallback) so players connect reliably
 * in <300 ms while keeping the game 100% static (zero backend required).
 */

export const NET_ROLE = Object.freeze({
  LOCAL: 'LOCAL',
  HOST: 'HOST',
  GUEST: 'GUEST',
});

export const MAX_LAN_PLAYERS = 4;

const TOPIC_PREFIX = 'ironsight/tw/v1';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const MQTT_CDNS = [
  'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js',
  'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js',
];

const BROKER_URLS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

let _mqttLoadPromise = null;

function loadMqttJS() {
  if (typeof window !== 'undefined' && window.mqtt) {
    return Promise.resolve(window.mqtt);
  }
  if (_mqttLoadPromise) return _mqttLoadPromise;

  _mqttLoadPromise = new Promise((resolve, reject) => {
    const tryNext = (idx) => {
      if (idx >= MQTT_CDNS.length) {
        _mqttLoadPromise = null;
        reject(new Error('Failed to load network client library. Check internet connection.'));
        return;
      }
      const script = document.createElement('script');
      script.src = MQTT_CDNS[idx];
      script.async = true;
      script.onload = () => {
        if (window.mqtt) resolve(window.mqtt);
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

  return _mqttLoadPromise;
}

function generateRoomCode(len = 4) {
  let code = '';
  for (let i = 0; i < len; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
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

    this._client = null;
    this._clientId = `tw-${randomId()}`;
    this._peerConnected = false; // Guest connected to Host
    /** @type {Map<string, { slot: number, lastSeen: number }>} */
    this._guests = new Map(); // Host roster of connected Guests
    this._lastHostRx = 0;

    this._subTopic = '';
    this._pubTopic = '';
    this._pingTimer = null;
    this._helloTimer = null;
    this._connectTimer = null;
    this._sessionNonce = 0;

    window.addEventListener('beforeunload', () => {
      if (this._client && this.isConnected()) {
        this._publishRaw({ type: 'bye', from: this._clientId, slot: this.localPlayerIndex });
      }
    });
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
    if (!this._client || !this._client.connected) return false;
    return this.isHost() ? this._guests.size > 0 : this._peerConnected;
  }

  getConnectedGuestSlots() {
    const slots = [];
    for (const g of this._guests.values()) slots.push(g.slot);
    slots.sort((a, b) => a - b);
    return slots;
  }

  getPlayerCount() {
    if (this.isHost()) return Math.max(2, 1 + this._guests.size);
    return Math.max(2, this.localPlayerIndex + 1);
  }

  getConnectedTotalPlayers() {
    if (this.isHost()) return 1 + this._guests.size;
    return this._peerConnected ? Math.max(2, this.localPlayerIndex + 1) : 1;
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

  async hostRoom(customCode = null) {
    this.disconnect(false);
    const nonce = ++this._sessionNonce;
    this.role = NET_ROLE.HOST;
    this.localPlayerIndex = 0;
    this.roomCode = (customCode || generateRoomCode(4)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    this._subTopic = `${TOPIC_PREFIX}/${this.roomCode}/g2h`;
    this._pubTopic = `${TOPIC_PREFIX}/${this.roomCode}/h2g`;
    this._setStatus('loading', 'Connecting to relay...');

    try {
      await this._connectBroker(nonce, 0);
    } catch (err) {
      if (nonce !== this._sessionNonce) return;
      this.role = NET_ROLE.LOCAL;
      this._setStatus('error', err.message || 'Failed to open room.');
    }
  }

  async joinRoom(rawCode) {
    const cleanCode = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanCode.length < 3) {
      this._setStatus('error', 'Please enter a valid room code.');
      return;
    }

    this.disconnect(false);
    const nonce = ++this._sessionNonce;
    this.role = NET_ROLE.GUEST;
    this.localPlayerIndex = 1;
    this.roomCode = cleanCode;
    this._subTopic = `${TOPIC_PREFIX}/${cleanCode}/h2g`;
    this._pubTopic = `${TOPIC_PREFIX}/${cleanCode}/g2h`;
    this._setStatus('loading', `Connecting to room ${cleanCode}...`);

    try {
      await this._connectBroker(nonce, 0);
    } catch (err) {
      if (nonce !== this._sessionNonce) return;
      this.role = NET_ROLE.LOCAL;
      this._setStatus('error', err.message || 'Failed to join room.');
    }
  }

  async _connectBroker(nonce, brokerIdx) {
    const mqttLib = await loadMqttJS();
    if (nonce !== this._sessionNonce) return;

    const brokerUrl = BROKER_URLS[brokerIdx];
    const client = mqttLib.connect(brokerUrl, {
      clientId: `${this._clientId}-${randomId().slice(0, 4)}`,
      clean: true,
      connectTimeout: 6000,
      reconnectPeriod: 0,
      keepalive: 25,
    });
    this._client = client;

    let settled = false;

    client.on('connect', () => {
      if (nonce !== this._sessionNonce || this._client !== client) return;
      settled = true;

      client.subscribe(this._subTopic, { qos: 0 }, (err) => {
        if (nonce !== this._sessionNonce || this._client !== client) return;
        if (err) {
          this._setStatus('error', `Subscribe error: ${err.message}`);
          return;
        }

        if (this.isHost()) {
          this._startHeartbeat();
          this._setStatus('waiting', this._formatHostRosterMessage());
        } else {
          this._setStatus('connecting', `Joining room ${this.roomCode}...`);
          this._startGuestHello(nonce);
        }
      });
    });

    client.on('message', (_topic, payloadBuf) => {
      if (nonce !== this._sessionNonce || this._client !== client) return;
      let msg;
      try {
        msg = JSON.parse(payloadBuf.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      this._handleIncoming(msg);
    });

    client.on('error', () => {
      if (nonce !== this._sessionNonce || this._client !== client) return;
      if (!settled && brokerIdx + 1 < BROKER_URLS.length) {
        settled = true;
        try { client.end(true); } catch {}
        this._connectBroker(nonce, brokerIdx + 1).catch((e) => {
          if (nonce === this._sessionNonce) {
            this._setStatus('error', e.message || 'Could not reach relay server.');
          }
        });
      } else if (!settled) {
        settled = true;
        this._setStatus('error', 'Unable to reach relay server. Check internet connection.');
      }
    });

    client.on('close', () => {
      if (nonce !== this._sessionNonce || this._client !== client) return;
      if (!settled && brokerIdx + 1 < BROKER_URLS.length) {
        settled = true;
        this._connectBroker(nonce, brokerIdx + 1).catch(() => {});
        return;
      }
      if (this.isGuest() && this._peerConnected) {
        this._handleGuestDisconnected();
      }
    });
  }

  _startGuestHello(nonce) {
    this._clearTimers();
    const sendHello = () => {
      if (nonce !== this._sessionNonce || !this._client || !this._client.connected || this._peerConnected) return;
      this._publishRaw({ type: 'hello', from: this._clientId });
    };
    sendHello();
    this._helloTimer = setInterval(sendHello, 1200);

    this._connectTimer = setTimeout(() => {
      if (nonce !== this._sessionNonce || this._peerConnected) return;
      this._clearTimers();
      this._setStatus(
        'error',
        `Room ${this.roomCode} not found. Ensure Host clicked "Host Room" and the code matches.`
      );
    }, 10000);
  }

  _allocateGuestSlot() {
    const used = new Set();
    for (const g of this._guests.values()) used.add(g.slot);
    for (let s = 1; s < MAX_LAN_PLAYERS; s++) {
      if (!used.has(s)) return s;
    }
    return -1;
  }

  _handleIncoming(msg) {
    const now = performance.now();

    if (this.isHost()) {
      const sender = msg.from || '';

      if (msg.type === 'hello') {
        let entry = this._guests.get(sender);
        const isNew = !entry;
        if (!entry) {
          const slot = this._allocateGuestSlot();
          if (slot < 0) {
            this._publishRaw({ type: 'full', to: sender });
            return;
          }
          entry = { slot, lastSeen: now };
          this._guests.set(sender, entry);
        } else {
          entry.lastSeen = now;
        }

        this._publishRaw({
          type: 'welcome',
          to: sender,
          slot: entry.slot,
          totalPlayers: this.getConnectedTotalPlayers(),
        });

        this._setStatus('connected', this._formatHostRosterMessage());
        if (isNew && this.callbacks.onPeerConnected) {
          this.callbacks.onPeerConnected(entry.slot);
        }
        return;
      }

      if (sender && this._guests.has(sender)) {
        this._guests.get(sender).lastSeen = now;
      }

      if (msg.type === 'bye') {
        const entry = this._guests.get(sender);
        if (entry) {
          const leftSlot = entry.slot;
          this._guests.delete(sender);
          this._setStatus(
            this._guests.size > 0 ? 'connected' : 'waiting',
            this._formatHostRosterMessage()
          );
          if (this.callbacks.onPeerDisconnected) {
            this.callbacks.onPeerDisconnected(leftSlot);
          }
        }
        return;
      }

      if (msg.type === 'gping') {
        this._publishRaw({ type: 'gpong', to: sender, t: msg.t });
        return;
      }
      if (msg.type === 'pong') {
        this.pingMs = Math.max(1, Math.round(now - msg.t));
        this._setStatus(this.status, this.statusMessage);
        return;
      }

      const guest = this._guests.get(sender);
      if (guest && this.callbacks.onMessage) {
        this.callbacks.onMessage({ ...msg, slot: guest.slot });
      }
      return;
    }

    // Guest incoming handling
    this._lastHostRx = now;

    if (msg.type === 'welcome' && (!msg.to || msg.to === this._clientId)) {
      this.localPlayerIndex = typeof msg.slot === 'number' ? msg.slot : 1;
      if (!this._peerConnected) {
        this._clearTimers();
        this._peerConnected = true;
        this.pingMs = null;
        this._startHeartbeat();
        this._setStatus(
          'connected',
          `Connected as ${this.localPlayerIndex + 1}P in Room ${this.roomCode}!`
        );
        if (this.callbacks.onPeerConnected) {
          this.callbacks.onPeerConnected(this.localPlayerIndex);
        }
      }
      return;
    }

    if (msg.type === 'full' && (!msg.to || msg.to === this._clientId)) {
      this._clearTimers();
      this._setStatus('error', 'Room is already full (max 4 players).');
      this.disconnect(false);
      return;
    }

    if (msg.type === 'bye') {
      if (this._peerConnected) this._handleGuestDisconnected();
      return;
    }

    if (msg.type === 'ping') {
      this._publishRaw({ type: 'pong', from: this._clientId, t: msg.t });
      return;
    }

    if (msg.type === 'gpong' && (!msg.to || msg.to === this._clientId)) {
      this.pingMs = Math.max(1, Math.round(now - msg.t));
      this._setStatus(this.status, this.statusMessage);
      return;
    }

    if (this._peerConnected && this.callbacks.onMessage) {
      this.callbacks.onMessage(msg);
    }
  }

  _startHeartbeat() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._lastHostRx = performance.now();

    const tick = () => {
      if (!this._client || !this._client.connected) return;
      const now = performance.now();

      if (this.isHost()) {
        // Evict stale guests that haven't responded in 10s
        let removedAny = false;
        for (const [id, entry] of this._guests.entries()) {
          if (now - entry.lastSeen > 10000) {
            this._guests.delete(id);
            removedAny = true;
            if (this.callbacks.onPeerDisconnected) {
              this.callbacks.onPeerDisconnected(entry.slot);
            }
          }
        }
        if (removedAny) {
          if (this._guests.size === 0) this.pingMs = null;
          this._setStatus(
            this._guests.size > 0 ? 'connected' : 'waiting',
            this._formatHostRosterMessage()
          );
        }
        if (this._guests.size > 0) {
          this._publishRaw({ type: 'ping', t: now });
        }
      } else if (this.isGuest() && this._peerConnected) {
        if (now - this._lastHostRx > 10000) {
          this._handleGuestDisconnected();
          return;
        }
        this._publishRaw({ type: 'gping', from: this._clientId, t: now });
      }
    };

    tick();
    this._pingTimer = setInterval(tick, 2000);
  }

  _handleGuestDisconnected() {
    this._clearTimers();
    this._peerConnected = false;
    this.pingMs = null;
    this._setStatus('error', 'Disconnected from Host.');
    if (this.callbacks.onPeerDisconnected) {
      this.callbacks.onPeerDisconnected(this.localPlayerIndex);
    }
  }

  _clearTimers() {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    if (this._helloTimer) { clearInterval(this._helloTimer); this._helloTimer = null; }
    if (this._connectTimer) { clearTimeout(this._connectTimer); this._connectTimer = null; }
  }

  _publishRaw(payload) {
    if (this._client && this._client.connected && this._pubTopic) {
      try {
        this._client.publish(this._pubTopic, JSON.stringify(payload), { qos: 0 });
      } catch {
        // Ignore transient publish errors
      }
    }
  }

  send(payload) {
    if (!this.isConnected()) return;
    if (this.isGuest()) {
      this._publishRaw({ ...payload, from: this._clientId, slot: this.localPlayerIndex });
    } else {
      this._publishRaw(payload);
    }
  }

  disconnect(notify = true) {
    this._sessionNonce++;
    this._clearTimers();
    if (this._client) {
      if (this.isConnected()) {
        this._publishRaw({ type: 'bye', from: this._clientId, slot: this.localPlayerIndex });
      }
      try { this._client.end(true); } catch {}
      this._client = null;
    }
    this._peerConnected = false;
    this._guests.clear();
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
