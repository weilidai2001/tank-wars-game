/**
 * Lightweight synchronous publish/subscribe EventBus.
 * Decouples simulation systems from rendering, VFX, audio, HUD, and haptics
 * (Dependency Inversion Principle).
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   * @param {string} event
   * @param {Function} handler
   * @returns {() => void}
   */
  on(event, handler) {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe a handler from an event.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) this._listeners.delete(event);
    }
  }

  /**
   * Emit a domain event payload to all subscribers.
   * @param {string} event
   * @param {any} payload
   */
  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(payload);
    }
  }

  clear() {
    this._listeners.clear();
  }
}

export const EVENTS = Object.freeze({
  TANK_FIRED: 'tank:fired',
  TANK_HIT: 'tank:hit',
  TANK_DESTROYED: 'tank:destroyed',
  TANK_SPAWNED: 'tank:spawned',
  LOCK_ACQUIRED: 'lock:acquired',
  WALL_DAMAGED: 'wall:damaged',
  WALL_BREACHED: 'wall:breached',
  WALL_RICOCHET: 'wall:ricochet',
  SHELL_CANCELLED: 'shell:cancelled',
  TRACTOR_USED: 'tractor:used',
  PICKUP_COLLECTED: 'pickup:collected',
  EAGLE_DESTROYED: 'eagle:destroyed',
  STAGE_STARTED: 'stage:started',
  STAGE_CLEARED: 'stage:cleared',
  GAME_OVER: 'game:over',
  POPUP_SPAWNED: 'popup:spawned',
});
