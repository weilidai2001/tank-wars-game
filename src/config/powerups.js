import { TILE, GAME_MODE } from './constants.js';
import { EVENTS } from '../core/EventBus.js';

// ============================================================================
// Strategy-Pattern Power-Up Registry (Open/Closed Principle)
// Each power-up defines both its visual metadata and its self-contained
// `apply(ctx, player)` behavior. Adding a new power-up requires zero edits
// to PowerupSystem or GameEngine.
// ============================================================================

export const POWERUP = Object.freeze({
  SHIELD: 0,
  FREEZE: 1,
  FORTIFY: 2,
  STAR: 3,
  BOOM: 4,
  REPAIR: 5,
  MAX_GUN: 6,
  ARMOR: 7,
  HOVER: 8,
  RAPID: 9,
});

export const POWERUP_REGISTRY = Object.freeze([
  {
    id: POWERUP.SHIELD,
    label: 'SHIELD',
    short: 'SHD',
    color: '#38bdf8',
    hex: 0x38bdf8,
    versusAllowed: true,
    apply(_ctx, p) {
      p.shieldTimer = 12.0;
    },
  },
  {
    id: POWERUP.FREEZE,
    label: 'EMP HOLD',
    short: 'EMP',
    color: '#818cf8',
    hex: 0x818cf8,
    versusAllowed: false,
    apply(ctx) {
      ctx.setFreezeTimer(9.0);
    },
  },
  {
    id: POWERUP.FORTIFY,
    label: 'FORTIFY',
    short: 'FRT',
    color: '#cbd5e1',
    hex: 0xcbd5e1,
    versusAllowed: true,
    apply(ctx, p) {
      if (ctx.mode === GAME_MODE.COOP) {
        ctx.fortifyBase(20.0);
      } else {
        p.carriedTile = TILE.STEEL;
        p.carriedTileHp = 4;
      }
    },
  },
  {
    id: POWERUP.STAR,
    label: 'TANK UPGRADE',
    short: 'UPG',
    color: '#facc15',
    hex: 0xfacc15,
    versusAllowed: true,
    apply(ctx, p) {
      ctx.upgradePlayerTier(p, Math.min(3, p.weaponTier + 1));
    },
  },
  {
    id: POWERUP.BOOM,
    label: 'AIRSTRIKE',
    short: 'BOM',
    color: '#f97316',
    hex: 0xf97316,
    versusAllowed: true,
    apply(ctx, p) {
      ctx.triggerAirstrike(p);
    },
  },
  {
    id: POWERUP.REPAIR,
    label: '1UP + FIX',
    short: '1UP',
    color: '#4ade80',
    hex: 0x4ade80,
    versusAllowed: false,
    apply(_ctx, p) {
      p.lives += 1;
      p.hp = p.maxHp;
    },
  },
  {
    id: POWERUP.MAX_GUN,
    label: 'MAX TIER IV',
    short: 'MAX',
    color: '#f43f5e',
    hex: 0xf43f5e,
    versusAllowed: true,
    apply(ctx, p) {
      ctx.upgradePlayerTier(p, 3);
    },
  },
  {
    id: POWERUP.ARMOR,
    label: 'ARMOR +2',
    short: 'ARM',
    color: '#22d3ee',
    hex: 0x22d3ee,
    versusAllowed: true,
    apply(_ctx, p) {
      p.armor = Math.min(4, p.armor + 2);
      p.hp = p.maxHp;
    },
  },
  {
    id: POWERUP.HOVER,
    label: 'PONTOON',
    short: 'HVR',
    color: '#2dd4bf',
    hex: 0x2dd4bf,
    versusAllowed: true,
    apply(_ctx, p) {
      p.hasHover = true;
    },
  },
  {
    id: POWERUP.RAPID,
    label: 'OVERDRIVE',
    short: 'RPD',
    color: '#fbbf24',
    hex: 0xfbbf24,
    versusAllowed: true,
    apply(_ctx, p) {
      p.rapidTimer = 12.0;
    },
  },
]);

export function getPowerupDef(type) {
  return POWERUP_REGISTRY[type] || POWERUP_REGISTRY[0];
}

export function pickRandomPowerupType(mode) {
  const pool = mode === GAME_MODE.VERSUS
    ? POWERUP_REGISTRY.filter((d) => d.versusAllowed)
    : POWERUP_REGISTRY;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

export function emitPickupEvent(bus, player, def) {
  bus.emit(EVENTS.PICKUP_COLLECTED, { player, def });
  bus.emit(EVENTS.POPUP_SPAWNED, {
    x: player.x,
    y: 3.2,
    z: player.z,
    text: def.label,
    color: def.color,
  });
}
