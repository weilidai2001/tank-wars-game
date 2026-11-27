/**
 * Static-Webpage Multiplayer NetworkManager over Secure WebSockets (MQTT/WSS).
 * Uses public WSS MQTT brokers (EMQX primary, HiveMQ fallback) so two computers can
 * connect reliably in <300 ms even behind corporate firewalls, VPNs, symmetric NATs,
 * or Wi-Fi client isolation where WebRTC ICE gets blocked.
 *
 * Keeps the game 100% static (zero backend required) and loads mqtt.js on demand so
 * offline local play has zero external dependencies.
 */

export const NET_ROLE = Object.freeze({
  LOCAL: 'LOCAL',
  HOST: 'HOST',
  GUEST: 'GUEST',
});

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

    this._client = null;
    this._clientId = `tw-${randomId()}`;
    this._peerConnected = false;
    this._guestId = null;
    this._lastPeerRx = 0;

    this._subTopic = '';
    this._pubTopic = '';
    this._pingTimer = null;
    this._helloTimer = null;
    this._connectTimer = null;
    this._sessionNonce = 0;

    window.addEventListener('beforeunload', () => {
      if (this._client && this._peerConnected) {
        this._publishRaw({ type: 'bye', from: this._clientId });
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
    return Boolean(this._client && this._client.connected && this._peerConnected);
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
    const nonce = ++this._sessionNonce;
    this.role = NET_ROLE.HOST;
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
          this._setStatus('waiting', `Room ${this.roomCode} ready — waiting for Player 2...`);
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
      if (this._peerConnected) {
        this._handlePeerLost();
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

  _handleIncoming(msg) {
    this._lastPeerRx = performance.now();

    if (this.isHost()) {
      if (msg.type === 'hello') {
        const sender = msg.from || 'guest';
        if (this._peerConnected && this._guestId && this._guestId !== sender) {
          this._publishRaw({ type: 'full', to: sender });
          return;
        }
        this._guestId = sender;
        const wasConnected = this._peerConnected;
        this._peerConnected = true;
        this._publishRaw({ type: 'welcome', to: sender });
        if (!wasConnected) {
          this.pingMs = null;
          this._startHeartbeat();
          this._setStatus('connected', `Player 2 joined Room ${this.roomCode}!`);
          if (this.callbacks.onPeerConnected) this.callbacks.onPeerConnected();
        }
        return;
      }
      if (msg.type === 'bye') {
        if (this._peerConnected && (!this._guestId || msg.from === this._guestId)) {
          this._handlePeerLost();
        }
        return;
      }
    } else if (this.isGuest()) {
      if (msg.type === 'welcome' && (!msg.to || msg.to === this._clientId)) {
        if (!this._peerConnected) {
          this._clearTimers();
          this._peerConnected = true;
          this.pingMs = null;
          this._startHeartbeat();
          this._setStatus('connected', `Connected to Host (${this.roomCode})!`);
          if (this.callbacks.onPeerConnected) this.callbacks.onPeerConnected();
        }
        return;
      }
      if (msg.type === 'full' && (!msg.to || msg.to === this._clientId)) {
        this._clearTimers();
        this._setStatus('error', 'Room is already full.');
        this.disconnect(false);
        return;
      }
      if (msg.type === 'bye') {
        if (this._peerConnected) {
          this._handlePeerLost();
        }
        return;
      }
    }

    if (msg.type === 'ping') {
      this._publishRaw({ type: 'pong', t: msg.t });
      return;
    }
    if (msg.type === 'pong') {
      this.pingMs = Math.max(1, Math.round(performance.now() - msg.t));
      this._setStatus(this.status, this.statusMessage);
      return;
    }

    if (this._peerConnected && this.callbacks.onMessage) {
      this.callbacks.onMessage(msg);
    }
  }

  _startHeartbeat() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._lastPeerRx = performance.now();
    const tick = () => {
      if (!this.isConnected()) return;
      if (performance.now() - this._lastPeerRx > 10000) {
        this._handlePeerLost();
        return;
      }
      this._publishRaw({ type: 'ping', t: performance.now() });
    };
    tick();
    this._pingTimer = setInterval(tick, 2000);
  }

  _handlePeerLost() {
    this._clearTimers();
    this._peerConnected = false;
    this._guestId = null;
    this.pingMs = null;
    if (this.isHost()) {
      this._setStatus('waiting', `Player 2 disconnected. Room ${this.roomCode} still open...`);
    } else if (this.isGuest()) {
      this._setStatus('error', 'Disconnected from Host.');
    }
    if (this.callbacks.onPeerDisconnected) {
      this.callbacks.onPeerDisconnected();
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
    if (this.isConnected()) {
      this._publishRaw(payload);
    }
  }

  disconnect(notify = true) {
    this._sessionNonce++;
    this._clearTimers();
    if (this._client) {
      if (this._peerConnected) {
        this._publishRaw({ type: 'bye', from: this._clientId });
      }
      try { this._client.end(true); } catch {}
      this._client = null;
    }
    this._peerConnected = false;
    this._guestId = null;
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
