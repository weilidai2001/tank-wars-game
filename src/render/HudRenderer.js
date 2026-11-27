import * as THREE from '../../vendor/three.module.min.js';
import {
  SUB_GRID, CELL_SIZE, WORLD_SIZE, TILE, GAME_MODE, WALL_MAX_HP,
  AUTO_AIM_HALF_ANGLE, VERSUS_TARGET_FRAGS,
} from '../config/constants.js';
import { classifyArmorHit } from '../core/MathUtils.js';

const _projVec = new THREE.Vector3();

export function computeViewports(count, cssW, cssH) {
  const rects = [];
  if (count <= 1) {
    rects.push({ x: 0, y: 0, w: cssW, h: cssH });
  } else if (count === 2) {
    if (cssW >= cssH * 0.95) {
      const halfW = Math.floor(cssW / 2);
      rects.push({ x: 0, y: 0, w: halfW, h: cssH });
      rects.push({ x: halfW, y: 0, w: cssW - halfW, h: cssH });
    } else {
      const halfH = Math.floor(cssH / 2);
      rects.push({ x: 0, y: 0, w: cssW, h: halfH });
      rects.push({ x: 0, y: halfH, w: cssW, h: cssH - halfH });
    }
  } else {
    const halfW = Math.floor(cssW / 2);
    const halfH = Math.floor(cssH / 2);
    rects.push({ x: 0, y: 0, w: halfW, h: halfH });
    rects.push({ x: halfW, y: 0, w: cssW - halfW, h: halfH });
    rects.push({ x: 0, y: halfH, w: halfW, h: cssH - halfH });
    if (count >= 4) {
      rects.push({ x: halfW, y: halfH, w: cssW - halfW, h: cssH - halfH });
    }
  }

  return rects.map((r) => ({
    ...r,
    glX: r.x,
    glY: cssH - (r.y + r.h),
    glW: r.w,
    glH: r.h,
  }));
}

function projectToViewport(worldX, worldY, worldZ, camera, vp) {
  _projVec.set(worldX, worldY, worldZ);
  _projVec.project(camera);
  if (_projVec.z > 1.0 || _projVec.z < -1.0) return null;
  return {
    x: vp.x + (_projVec.x * 0.5 + 0.5) * vp.w,
    y: vp.y + (-_projVec.y * 0.5 + 0.5) * vp.h,
  };
}

function drawCornerBrackets(ctx, cx, cy, halfW, halfH, len, color, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, cy - halfH + len);
  ctx.lineTo(cx - halfW, cy - halfH);
  ctx.lineTo(cx - halfW + len, cy - halfH);
  ctx.moveTo(cx + halfW - len, cy - halfH);
  ctx.lineTo(cx + halfW, cy - halfH);
  ctx.lineTo(cx + halfW, cy - halfH + len);
  ctx.moveTo(cx - halfW, cy + halfH - len);
  ctx.lineTo(cx - halfW, cy + halfH);
  ctx.lineTo(cx - halfW + len, cy + halfH);
  ctx.moveTo(cx + halfW - len, cy + halfH);
  ctx.lineTo(cx + halfW, cy + halfH);
  ctx.lineTo(cx + halfW, cy + halfH - len);
  ctx.stroke();
}

/**
 * 2D Canvas Tactical HUD Renderer (SRP).
 * Features:
 *  - Per-player translucent status cards (toggleable via `H`, showing National Tank Name & Tier)
 *  - Auto-aim cone + directional armor target brackets
 *  - Rotating GPS minimap (hidden automatically in Full Map View!)
 *  - Full Map View top-row status bar & 3P 4th-quadrant Sat-Com overview
 */
export class HudRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  render(game, viewports, cssW, cssH, dpr) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (game.state === 'MENU') {
      ctx.restore();
      return;
    }

    const fullMap = game.cameraSystem.isFullMapMode();

    if (fullMap) {
      // Full Map Tactical Overview: no split-screen dividers, no minimap, optional top status cards
      const fullVp = { x: 0, y: 0, w: cssW, h: cssH };
      this._renderPopups(ctx, game, game.sceneManager.overviewCamera, fullVp, false);

      if (game.showStatusCards) {
        const cardW = 216;
        const gap = 12;
        const totalW = game.players.length * cardW + (game.players.length - 1) * gap;
        const startX = Math.max(12, (cssW - totalW) * 0.5);
        for (let i = 0; i < game.players.length; i++) {
          this._renderStatusCard(ctx, game, game.players[i], startX + i * (cardW + gap), 12, cardW, 74, false, 0.58);
        }
      }
    } else {
      // Split-screen viewports (human players only if AI wingman is active in 1P+AI mode)
      const activeViewPlayers = game.getViewportPlayers();
      for (let i = 0; i < activeViewPlayers.length; i++) {
        const player = activeViewPlayers[i];
        const vp = viewports[i];
        if (!vp) continue;

        ctx.save();
        ctx.beginPath();
        ctx.rect(vp.x, vp.y, vp.w, vp.h);
        ctx.clip();
        this.renderPlayerViewportHud(ctx, game, player, vp);
        ctx.restore();
      }

      if (activeViewPlayers.length === 3 && cssW > 0 && cssH > 0) {
        const halfW = Math.floor(cssW / 2);
        const halfH = Math.floor(cssH / 2);
        this.renderSatelliteQuadrant(ctx, game, { x: halfW, y: halfH, w: cssW - halfW, h: cssH - halfH });
      }

      // Split-screen divider lines
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      if (activeViewPlayers.length === 2) {
        if (cssW >= cssH * 0.95) {
          const halfW = Math.floor(cssW / 2);
          ctx.beginPath(); ctx.moveTo(halfW, 0); ctx.lineTo(halfW, cssH); ctx.stroke();
        } else {
          const halfH = Math.floor(cssH / 2);
          ctx.beginPath(); ctx.moveTo(0, halfH); ctx.lineTo(cssW, halfH); ctx.stroke();
        }
      } else if (activeViewPlayers.length >= 3) {
        const halfW = Math.floor(cssW / 2);
        const halfH = Math.floor(cssH / 2);
        ctx.beginPath();
        ctx.moveTo(halfW, 0); ctx.lineTo(halfW, cssH);
        ctx.moveTo(0, halfH); ctx.lineTo(cssW, halfH);
        ctx.stroke();
      }
    }

    this.renderGlobalBanner(ctx, game, cssW, cssH);
    ctx.restore();
  }

  renderPlayerViewportHud(ctx, game, p, vp) {
    const minDim = Math.min(vp.w, vp.h);
    const compact = minDim < 360;

    if (p.hitFlash > 0) {
      const alpha = Math.min(0.45, p.hitFlash * 0.9);
      const grad = ctx.createRadialGradient(
        vp.x + vp.w * 0.5, vp.y + vp.h * 0.5, minDim * 0.22,
        vp.x + vp.w * 0.5, vp.y + vp.h * 0.5, Math.max(vp.w, vp.h) * 0.7
      );
      grad.addColorStop(0, 'rgba(239, 68, 68, 0)');
      grad.addColorStop(1, `rgba(239, 68, 68, ${alpha.toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    }

    if (p.alive) {
      this.renderAimingHud(ctx, game, p, vp, compact);
    }

    // GPS Minimap (Top-Right)
    const gpsRadius = Math.round(Math.max(46, Math.min(82, minDim * 0.19)));
    const gpsCx = vp.x + vp.w - gpsRadius - 14;
    const gpsCy = vp.y + gpsRadius + 14;
    this.renderGpsMinimap(ctx, game, p, gpsCx, gpsCy, gpsRadius);

    // Status Card (Top-Left, toggleable with H)
    if (game.showStatusCards) {
      const cardW = compact ? 176 : 216;
      const cardH = compact ? 66 : 74;
      this._renderStatusCard(ctx, game, p, vp.x + 12, vp.y + 12, cardW, cardH, compact, 0.72);
    }

    // If AI Wingman is active in 1P+AI mode, show a compact P2 AI badge below P1's card
    if (game.aiWingman && p.index === 0 && game.players.length > 1 && game.showStatusCards) {
      const wingman = game.players[1];
      this._renderStatusCard(ctx, game, wingman, vp.x + 12, vp.y + 92, 194, 58, true, 0.6);
    }

    this._renderBuffPills(ctx, p, vp);
    this._renderPopups(ctx, game, p.camera, vp, compact);

    if (!p.alive) {
      ctx.fillStyle = 'rgba(9, 13, 22, 0.56)';
      ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
      ctx.textAlign = 'center';
      ctx.font = `bold ${compact ? 16 : 22}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      if (p.eliminated) {
        ctx.fillStyle = '#f87171';
        ctx.fillText(`${p.tag} OUT OF LIVES`, vp.x + vp.w * 0.5, vp.y + vp.h * 0.5);
      } else {
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(
          `DEPLOYING IN ${Math.max(0.1, p.respawnTimer).toFixed(1)}s`,
          vp.x + vp.w * 0.5,
          vp.y + vp.h * 0.5
        );
      }
    }
  }

  _renderPopups(ctx, game, camera, vp, compact) {
    for (const pop of game.popups) {
      const screen = projectToViewport(pop.x, pop.y, pop.z, camera, vp);
      if (!screen) continue;
      const alpha = Math.max(0, 1 - pop.life / pop.maxLife);
      ctx.font = `bold ${compact ? 12 : 14}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(0,0,0,${(alpha * 0.75).toFixed(2)})`;
      ctx.fillText(pop.text, screen.x + 1, screen.y + 1);
      ctx.fillStyle = pop.color || '#fef08a';
      ctx.globalAlpha = alpha;
      ctx.fillText(pop.text, screen.x, screen.y);
      ctx.globalAlpha = 1;
    }
  }

  renderAimingHud(ctx, game, p, vp, compact) {
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const borePt = projectToViewport(p.x + fx * 75, 2.1, p.z + fz * 75, p.camera, vp);

    if (borePt) {
      const coneHalfPx = Math.tan(AUTO_AIM_HALF_ANGLE) * (vp.h * 0.5) / Math.tan((p.camera.fov * 0.5 * Math.PI) / 180);
      const clampedCone = Math.min(vp.w * 0.36, coneHalfPx);
      const hasLock = Boolean(p.lockedTarget);

      ctx.strokeStyle = hasLock ? 'rgba(74, 222, 128, 0.48)' : 'rgba(148, 163, 184, 0.32)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(borePt.x - clampedCone + 12, borePt.y, 18, Math.PI * 0.72, Math.PI * 1.28);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(borePt.x + clampedCone - 12, borePt.y, 18, -Math.PI * 0.28, Math.PI * 0.28);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(borePt.x - 8, borePt.y); ctx.lineTo(borePt.x - 3, borePt.y);
      ctx.moveTo(borePt.x + 3, borePt.y); ctx.lineTo(borePt.x + 8, borePt.y);
      ctx.moveTo(borePt.x, borePt.y - 8); ctx.lineTo(borePt.x, borePt.y - 3);
      ctx.moveTo(borePt.x, borePt.y + 3); ctx.lineTo(borePt.x, borePt.y + 8);
      ctx.stroke();
    }

    const totalTurretYaw = p.yaw + p.turretOffset;
    const tfx = -Math.sin(totalTurretYaw);
    const tfz = -Math.cos(totalTurretYaw);
    const aimDist = p.lockedDist || 22;
    const turretPt = projectToViewport(p.x + tfx * aimDist, 1.55, p.z + tfz * aimDist, p.camera, vp);

    if (turretPt && !p.lockedTarget) {
      ctx.strokeStyle = p.cssColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(turretPt.x, turretPt.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (p.lockedTarget) {
      const t = p.lockedTarget;
      const tScreen = projectToViewport(t.x, 1.7, t.z, p.camera, vp);
      if (tScreen) {
        const aspectInfo = classifyArmorHit(p.x - t.x, p.z - t.z, t.yaw, t.maxHp);
        const bracketColor = aspectInfo.zone === 'BACK'
          ? '#f43f5e'
          : aspectInfo.zone === 'SIDE'
          ? '#fbbf24'
          : '#4ade80';
        const pulse = 1 + Math.sin(game.elapsed * (aspectInfo.zone === 'BACK' ? 18 : 11)) * 0.09;
        const boxSize = Math.max(18, Math.min(44, (520 / Math.max(8, p.lockedDist)) * pulse));
        drawCornerBrackets(ctx, tScreen.x, tScreen.y, boxSize, boxSize * 0.82, 9, bracketColor, 2.5);

        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(tScreen.x, tScreen.y - 5);
        ctx.lineTo(tScreen.x + 5, tScreen.y);
        ctx.lineTo(tScreen.x, tScreen.y + 5);
        ctx.lineTo(tScreen.x - 5, tScreen.y);
        ctx.closePath();
        ctx.stroke();

        ctx.font = `bold ${compact ? 10 : 11}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textAlign = 'center';
        const label = `${aspectInfo.hitsLabel} · ${Math.round(p.lockedDist)}m`;
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(9, 13, 22, 0.86)';
        ctx.fillRect(tScreen.x - tw * 0.5, tScreen.y - boxSize * 0.82 - 20, tw, 15);
        ctx.fillStyle = bracketColor;
        ctx.fillText(label, tScreen.x, tScreen.y - boxSize * 0.82 - 9);

        const maxHp = t.maxHp || 6;
        const curHp = Math.max(0, t.hp || 0);
        const bw = Math.max(36, boxSize * 1.65);
        const bx = tScreen.x - bw * 0.5;
        const by = tScreen.y + boxSize * 0.82 + 5;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(bx, by, bw, 5);
        ctx.fillStyle = curHp > maxHp * 0.5 ? '#22c55e' : curHp > maxHp * 0.3 ? '#eab308' : '#ef4444';
        ctx.fillRect(bx, by, bw * Math.min(1, curHp / maxHp), 5);
      }
    } else if (p.obstructedTarget) {
      const t = p.obstructedTarget;
      const tScreen = projectToViewport(t.x, 1.7, t.z, p.camera, vp);
      if (tScreen) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(tScreen.x - 18, tScreen.y - 14, 36, 28);
        ctx.restore();
        ctx.font = `bold ${compact ? 9 : 10}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
        ctx.fillText('WALL BLOCKING', tScreen.x, tScreen.y - 18);
      }
    }
  }

  renderGpsMinimap(ctx, game, viewer, cx, cy, radius) {
    const headingUp = game.gpsHeadingUp;
    const mapRangeMeters = WORLD_SIZE * 0.92;
    const pxPerMeter = radius / mapRangeMeters;
    const rotYaw = headingUp ? viewer.yaw : 0;
    const fx = -Math.sin(rotYaw);
    const fz = -Math.cos(rotYaw);
    const rx = Math.cos(rotYaw);
    const rz = -Math.sin(rotYaw);
    const originX = headingUp ? viewer.x : WORLD_SIZE * 0.5;
    const originZ = headingUp ? viewer.z : WORLD_SIZE * 0.5;
    const northScale = (radius * 0.9) / (WORLD_SIZE * 0.5);
    const scale = headingUp ? pxPerMeter : northScale;

    function toGps(wx, wz) {
      const dx = wx - originX;
      const dz = wz - originZ;
      return {
        x: cx + (dx * rx + dz * rz) * scale,
        y: cy - (dx * fx + dz * fz) * scale,
      };
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = 'rgba(13, 22, 36, 0.9)';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    const corners = [toGps(0, 0), toGps(WORLD_SIZE, 0), toGps(WORLD_SIZE, WORLD_SIZE), toGps(0, WORLD_SIZE)];
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.stroke();

    const cellPx = Math.max(2.2, CELL_SIZE * scale);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotYaw);
    ctx.translate(-originX * scale, -originZ * scale);

    const grid = game.arenaGrid.grid;
    const wallHp = game.arenaGrid.wallHp;
    for (let r = 0; r < SUB_GRID; r++) {
      const row = grid[r];
      const hpRow = wallHp[r];
      for (let c = 0; c < SUB_GRID; c++) {
        const t = row[c];
        if (t === TILE.EMPTY) continue;
        let hpRatio = 1.0;
        if (t === TILE.BRICK) {
          hpRatio = Math.max(0.2, hpRow[c] / WALL_MAX_HP);
          ctx.fillStyle = `rgba(194, 89, 63, ${(0.32 + 0.68 * hpRatio).toFixed(2)})`;
        } else if (t === TILE.CONCRETE) {
          ctx.fillStyle = '#9ca3af';
        } else if (t === TILE.STEEL) {
          ctx.fillStyle = '#cbd5e1';
        } else if (t === TILE.PERM_STEEL) {
          ctx.fillStyle = '#fde047';
        } else if (t === TILE.WATER) {
          ctx.fillStyle = '#0284c7';
        } else if (t === TILE.TREES) {
          ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
        } else if (t === TILE.ICE) {
          ctx.fillStyle = 'rgba(186, 230, 253, 0.4)';
        } else if (t === TILE.EAGLE) {
          ctx.fillStyle = '#facc15';
        } else {
          continue;
        }
        const shrink = (1 - hpRatio) * cellPx * 0.3;
        ctx.fillRect(
          c * CELL_SIZE * scale + shrink * 0.5,
          r * CELL_SIZE * scale + shrink * 0.5,
          cellPx + 0.4 - shrink,
          cellPx + 0.4 - shrink
        );
      }
    }
    ctx.restore();

    if (viewer.alive) {
      const vPt = toGps(viewer.x, viewer.z);
      const relHeading = headingUp ? 0 : -viewer.yaw;
      const coneCenterAngle = -Math.PI * 0.5 + relHeading;
      ctx.fillStyle = viewer.lockedTarget ? 'rgba(74, 222, 128, 0.22)' : 'rgba(250, 204, 21, 0.15)';
      ctx.beginPath();
      ctx.moveTo(vPt.x, vPt.y);
      ctx.arc(vPt.x, vPt.y, Math.min(radius * 0.88, 45 * scale), coneCenterAngle - AUTO_AIM_HALF_ANGLE, coneCenterAngle + AUTO_AIM_HALF_ANGLE);
      ctx.closePath();
      ctx.fill();
    }

    for (const cr of game.powerups.crates) {
      const pt = toGps(cr.x, cr.z);
      if (Math.floor(game.elapsed * 6) % 2 === 0) {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2); ctx.fill();
      }
    }

    for (const e of game.enemies) {
      if (!e.alive) continue;
      const pt = toGps(e.x, e.z);
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const d = Math.hypot(dx, dy);
      const clamped = d > radius - 5;
      const bx = clamped ? cx + (dx / d) * (radius - 5) : pt.x;
      const by = clamped ? cy + (dy / d) * (radius - 5) : pt.y;
      ctx.fillStyle = e.isBonus && Math.floor(game.elapsed * 8) % 2 === 0 ? '#facc15' : '#ef4444';
      ctx.beginPath(); ctx.arc(bx, by, clamped ? 3.2 : 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.stroke();
    }

    for (const pl of game.players) {
      if (!pl.alive) continue;
      const pt = toGps(pl.x, pl.z);
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const d = Math.hypot(dx, dy);
      const px = d > radius - 6 ? cx + (dx / d) * (radius - 6) : pt.x;
      const py = d > radius - 6 ? cy + (dy / d) * (radius - 6) : pt.y;
      const chevronRot = headingUp ? viewer.yaw - pl.yaw : -pl.yaw;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(chevronRot);
      ctx.fillStyle = pl.cssColor;
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -6.5); ctx.lineTo(5, 5.5); ctx.lineTo(0, 2.8); ctx.lineTo(-5, 5.5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    ctx.strokeStyle = viewer.cssColor;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();

    const northX = cx + Math.sin(rotYaw) * radius;
    const northY = cy - Math.cos(rotYaw) * radius;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(northX, northY, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', northX, northY + 0.5);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.font = 'bold 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(headingUp ? 'GPS · HDG UP' : 'GPS · NORTH', cx, cy + radius + 13);
  }

  _renderStatusCard(ctx, game, p, x, y, cardW, cardH, compact, bgAlpha = 0.72) {
    ctx.fillStyle = `rgba(9, 13, 22, ${bgAlpha})`;
    ctx.fillRect(x, y, cardW, cardH);
    ctx.fillStyle = p.cssColor;
    ctx.fillRect(x, y, 4, cardH);

    ctx.font = `bold ${compact ? 11 : 13}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'left';
    const tagText = p.isAIControlled ? `${p.tag} AI` : p.tag;
    ctx.fillText(tagText, x + 10, y + 16);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${compact ? 10 : 12}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    if (game.mode === GAME_MODE.VERSUS) {
      ctx.fillText(`FRAGS: ${p.frags}/${VERSUS_TARGET_FRAGS}`, x + 56, y + 16);
    } else {
      ctx.fillText(`${String(p.score).padStart(6, '0')} PTS`, x + 56, y + 16);
    }

    // Active national vehicle name!
    const vName = (p.vehicleSpec && p.vehicleSpec.shortName) || 'MBT';
    ctx.fillStyle = '#38bdf8';
    ctx.font = `bold ${compact ? 9 : 10}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(`${p.nationId} · ${vName}`, x + 10, y + 30);

    // Hull HP Bar
    const hpRatio = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 10, y + 36, cardW - 20, 7);
    ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#eab308' : '#ef4444';
    ctx.fillRect(x + 10, y + 36, (cardW - 20) * hpRatio, 7);

    // Reactive Armor Pips
    for (let a = 0; a < p.armor; a++) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(x + 10 + a * 18, y + 46, 14, 4);
    }

    // Lives & Weapon Tier
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${compact ? 9 : 10}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const tierNames = ['TIER I', 'TIER II', 'TIER III', 'TIER IV★'];
    const lifeText = game.mode === GAME_MODE.COOP ? `♥×${p.lives} · ` : '';
    ctx.fillText(`${lifeText}${tierNames[p.weaponTier] || 'TIER I'}`, x + 10, y + cardH - 7);
  }

  _renderBuffPills(ctx, p, vp) {
    const x = vp.x + 12;
    const by = vp.y + vp.h - 12;
    const pills = [];
    if (p.carriedTile === TILE.BRICK) pills.push({ text: 'CARRY: BRICK [DROP]', color: '#ea580c' });
    else if (p.carriedTile === TILE.CONCRETE) pills.push({ text: 'CARRY: CONCRETE [DROP]', color: '#9ca3af' });
    else if (p.carriedTile === TILE.STEEL) pills.push({ text: 'CARRY: STEEL [DROP]', color: '#cbd5e1' });
    if (p.shieldTimer > 0) pills.push({ text: `SHIELD ${Math.ceil(p.shieldTimer)}s`, color: '#38bdf8' });
    if (p.rapidTimer > 0) pills.push({ text: `RAPID ${Math.ceil(p.rapidTimer)}s`, color: '#fbbf24' });
    if (p.hasHover) pills.push({ text: 'PONTOON', color: '#2dd4bf' });

    let px = x;
    ctx.font = 'bold 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    for (const pill of pills) {
      const w = ctx.measureText(pill.text).width + 12;
      ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
      ctx.fillRect(px, by - 18, w, 18);
      ctx.strokeStyle = pill.color;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(px, by - 18, w, 18);
      ctx.fillStyle = pill.color;
      ctx.fillText(pill.text, px + 6, by - 5);
      px += w + 6;
    }
  }

  renderSatelliteQuadrant(ctx, game, q) {
    ctx.fillStyle = '#090f1a';
    ctx.fillRect(q.x, q.y, q.w, q.h);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SAT-COM OVERVIEW · LIVE TELEMETRY', q.x + 14, q.y + 22);

    const mapRadius = Math.max(40, Math.min(q.w, q.h) * 0.36);
    const dummyViewer = { x: WORLD_SIZE * 0.5, z: WORLD_SIZE * 0.5, yaw: 0, alive: false, cssColor: '#38bdf8' };
    const prevHeading = game.gpsHeadingUp;
    game.gpsHeadingUp = false;
    this.renderGpsMinimap(ctx, game, dummyViewer, q.x + q.w * 0.5, q.y + q.h * 0.54, mapRadius);
    game.gpsHeadingUp = prevHeading;
  }

  renderGlobalBanner(ctx, game, cssW, cssH) {
    ctx.textAlign = 'center';
    const topText = game.mode === GAME_MODE.COOP
      ? `STAGE ${game.stage} · ENEMIES LEFT: ${game.enemiesRemainingCount()}`
      : `VERSUS ARENA · FIRST TO ${VERSUS_TARGET_FRAGS} FRAGS`;
    ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    const tw = ctx.measureText(topText).width + 24;
    const pillY = cssH - 34;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
    ctx.fillRect((cssW - tw) * 0.5, pillY, tw, 24);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect((cssW - tw) * 0.5, pillY, tw, 24);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(topText, cssW * 0.5, pillY + 16);

    if (game.freezeTimer > 0 && game.state === 'PLAYING') {
      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(`EMP FREEZE ACTIVE: ${game.freezeTimer.toFixed(1)}s`, cssW * 0.5, pillY - 8);
    }

    if (game.paused && game.state === 'PLAYING') {
      this.drawModalBox(ctx, cssW, cssH, 'PAUSED', 'Press P to Resume · Esc for Menu', '#fbbf24');
      return;
    }

    if (game.state === 'STAGE_INTRO') {
      this.drawModalBox(
        ctx, cssW, cssH,
        game.mode === GAME_MODE.COOP ? `STAGE ${game.stage}: ${game.arenaTemplate.name}` : `ARENA: ${game.arenaTemplate.name}`,
        game.arenaTemplate.subtitle,
        '#38bdf8'
      );
    } else if (game.state === 'STAGE_CLEAR') {
      this.drawModalBox(ctx, cssW, cssH, `STAGE ${game.stage} CLEARED!`, 'Advancing to next sector...', '#4ade80');
    } else if (game.state === 'GAME_OVER') {
      this.drawModalBox(
        ctx, cssW, cssH,
        game.victoryBanner || 'MISSION FAILED',
        'Press Enter or Space to Play Again · Esc for Menu',
        game.isVictory ? '#4ade80' : '#f87171'
      );
    }
  }

  drawModalBox(ctx, cssW, cssH, title, subtitle, accent) {
    const bw = Math.min(cssW - 32, 480);
    const bh = 108;
    const bx = (cssW - bw) * 0.5;
    const by = (cssH - bh) * 0.5;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 21px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(title, cssW * 0.5, by + 46);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(subtitle, cssW * 0.5, by + 76);
  }
}
