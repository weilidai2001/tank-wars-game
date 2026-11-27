import * as THREE from '../vendor/three.module.min.js';
import {
  SUB_GRID, CELL_SIZE, WORLD_SIZE, TILE, GAME_MODE, WALL_MAX_HP,
  AUTO_AIM_HALF_ANGLE, POWERUP_INFO, VERSUS_TARGET_FRAGS, classifyArmorHit,
} from './constants.js';

const _projVec = new THREE.Vector3();

// Compute split-screen viewport rectangles in both CSS top-left coords and WebGL bottom-left coords
export function computeViewports(count, cssW, cssH, dpr) {
  const rects = [];
  if (count <= 1) {
    rects.push({ x: 0, y: 0, w: cssW, h: cssH });
  } else if (count === 2) {
    // Side-by-side on landscape screens, stacked on narrow portrait screens
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
    // 3P or 4P: 2x2 Quad Grid (in 3P, 4th quadrant becomes Live Tactical Satellite Map!)
    const halfW = Math.floor(cssW / 2);
    const halfH = Math.floor(cssH / 2);
    rects.push({ x: 0, y: 0, w: halfW, h: halfH });
    rects.push({ x: halfW, y: 0, w: cssW - halfW, h: halfH });
    rects.push({ x: 0, y: halfH, w: halfW, h: cssH - halfH });
    if (count >= 4) {
      rects.push({ x: halfW, y: halfH, w: cssW - halfW, h: cssH - halfH });
    }
  }

  // Note: Three.js renderer.setViewport / setScissor take CSS logical pixels
  // and multiply by devicePixelRatio internally — do NOT multiply by dpr here!
  return rects.map((r) => {
    const glX = r.x;
    const glW = r.w;
    const glH = r.h;
    const glY = cssH - (r.y + r.h);
    return { ...r, glX, glY, glW, glH };
  });
}

function projectToViewport(worldX, worldY, worldZ, camera, vp) {
  _projVec.set(worldX, worldY, worldZ);
  _projVec.project(camera);
  if (_projVec.z > 1.0 || _projVec.z < -1.0) return null;
  const sx = vp.x + (_projVec.x * 0.5 + 0.5) * vp.w;
  const sy = vp.y + (-_projVec.y * 0.5 + 0.5) * vp.h;
  return { x: sx, y: sy };
}

function drawCornerBrackets(ctx, cx, cy, halfW, halfH, len, color, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  // Top-left
  ctx.moveTo(cx - halfW, cy - halfH + len);
  ctx.lineTo(cx - halfW, cy - halfH);
  ctx.lineTo(cx - halfW + len, cy - halfH);
  // Top-right
  ctx.moveTo(cx + halfW - len, cy - halfH);
  ctx.lineTo(cx + halfW, cy - halfH);
  ctx.lineTo(cx + halfW, cy - halfH + len);
  // Bottom-left
  ctx.moveTo(cx - halfW, cy + halfH - len);
  ctx.lineTo(cx - halfW, cy + halfH);
  ctx.lineTo(cx - halfW + len, cy + halfH);
  // Bottom-right
  ctx.moveTo(cx + halfW - len, cy + halfH);
  ctx.lineTo(cx + halfW, cy + halfH);
  ctx.lineTo(cx + halfW, cy + halfH - len);
  ctx.stroke();
}

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

    // Render each active player's split-screen HUD
    for (let i = 0; i < game.players.length; i++) {
      const player = game.players[i];
      const vp = viewports[i];
      if (!vp) continue;

      ctx.save();
      ctx.beginPath();
      ctx.rect(vp.x, vp.y, vp.w, vp.h);
      ctx.clip();

      this.renderPlayerViewportHud(ctx, game, player, vp);
      ctx.restore();
    }

    // If 3 players in 2x2 grid, render the 4th quadrant as Live Tactical Satellite Command Map!
    if (game.players.length === 3 && cssW > 0 && cssH > 0) {
      const halfW = Math.floor(cssW / 2);
      const halfH = Math.floor(cssH / 2);
      const quad4 = { x: halfW, y: halfH, w: cssW - halfW, h: cssH - halfH };
      this.renderSatelliteQuadrant(ctx, game, quad4);
    }

    // Split-screen crisp divider lines
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    if (game.players.length === 2) {
      if (cssW >= cssH * 0.95) {
        const halfW = Math.floor(cssW / 2);
        ctx.beginPath();
        ctx.moveTo(halfW, 0);
        ctx.lineTo(halfW, cssH);
        ctx.stroke();
      } else {
        const halfH = Math.floor(cssH / 2);
        ctx.beginPath();
        ctx.moveTo(0, halfH);
        ctx.lineTo(cssW, halfH);
        ctx.stroke();
      }
    } else if (game.players.length >= 3) {
      const halfW = Math.floor(cssW / 2);
      const halfH = Math.floor(cssH / 2);
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW, cssH);
      ctx.moveTo(0, halfH);
      ctx.lineTo(cssW, halfH);
      ctx.stroke();
    }

    // Global Stage / Match Banner overlays (Stage Intro, Pause, Victory, Game Over)
    this.renderGlobalBanner(ctx, game, cssW, cssH);

    ctx.restore();
  }

  renderPlayerViewportHud(ctx, game, p, vp) {
    const minDim = Math.min(vp.w, vp.h);
    const compact = minDim < 360;

    // Damage hit flash vignette
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

    // 1. Forward Auto-Aim Cone Arc & Bore-Sight Reticle
    if (p.alive) {
      this.renderAimingHud(ctx, game, p, vp, compact);
    }

    // 2. GPS-like Minimap (Top-Right of Player Viewport)
    const gpsRadius = Math.round(Math.max(46, Math.min(82, minDim * 0.19)));
    const gpsCx = vp.x + vp.w - gpsRadius - 14;
    const gpsCy = vp.y + gpsRadius + 14;
    this.renderGpsMinimap(ctx, game, p, gpsCx, gpsCy, gpsRadius);

    // 3. Player Telemetry Badge & Armor/Weapon Strip (Top-Left / Bottom-Left)
    this.renderPlayerStatus(ctx, game, p, vp, compact);

    // 4. Floating 3D-projected pickups / callouts
    for (const pop of game.popups) {
      const screen = projectToViewport(pop.x, pop.y, pop.z, p.camera, vp);
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

    // Respawn / Eliminated overlay inside this player's viewport
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

  renderAimingHud(ctx, game, p, vp, compact) {
    // Project distant down-range bore-sight point & actual turret aim point onto viewport
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const borePt = projectToViewport(
      p.x + fx * 75,
      2.1,
      p.z + fz * 75,
      p.camera,
      vp
    );

    if (borePt) {
      // Forward +/-28 deg auto-aim cone boundary ticks
      const coneHalfPx = Math.tan(AUTO_AIM_HALF_ANGLE) * (vp.h * 0.5) / Math.tan((p.camera.fov * 0.5 * Math.PI) / 180);
      const clampedCone = Math.min(vp.w * 0.36, coneHalfPx);
      const hasLock = Boolean(p.lockedTarget);

      ctx.strokeStyle = hasLock ? 'rgba(74, 222, 128, 0.48)' : 'rgba(148, 163, 184, 0.32)';
      ctx.lineWidth = 1.5;
      // Left & right cone parentheses
      ctx.beginPath();
      ctx.arc(borePt.x - clampedCone + 12, borePt.y, 18, Math.PI * 0.72, Math.PI * 1.28);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(borePt.x + clampedCone - 12, borePt.y, 18, -Math.PI * 0.28, Math.PI * 0.28);
      ctx.stroke();

      // Center hull bore-sight cross
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(borePt.x - 8, borePt.y);
      ctx.lineTo(borePt.x - 3, borePt.y);
      ctx.moveTo(borePt.x + 3, borePt.y);
      ctx.lineTo(borePt.x + 8, borePt.y);
      ctx.moveTo(borePt.x, borePt.y - 8);
      ctx.lineTo(borePt.x, borePt.y - 3);
      ctx.moveTo(borePt.x, borePt.y + 3);
      ctx.lineTo(borePt.x, borePt.y + 8);
      ctx.stroke();
    }

    // Project actual turret barrel vector (shows auto-aim servo tracking!)
    const totalTurretYaw = p.yaw + p.turretOffset;
    const tfx = -Math.sin(totalTurretYaw);
    const tfz = -Math.cos(totalTurretYaw);
    const aimDist = p.lockedDist || 22;
    const turretPt = projectToViewport(
      p.x + tfx * aimDist,
      1.55,
      p.z + tfz * aimDist,
      p.camera,
      vp
    );

    if (turretPt && !p.lockedTarget) {
      ctx.strokeStyle = p.cssColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(turretPt.x, turretPt.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Locked-On Target 3D HUD Box (shows live Directional Armor Zone: FRONT 3x / SIDE 2x / BACK 1-HIT!)
    if (p.lockedTarget) {
      const t = p.lockedTarget;
      const tScreen = projectToViewport(t.x, 1.7, t.z, p.camera, vp);
      if (tScreen) {
        const aspectInfo = classifyArmorHit(p.x - t.x, p.z - t.z, t.yaw);
        const bracketColor = aspectInfo.zone === 'BACK'
          ? '#f43f5e'
          : aspectInfo.zone === 'SIDE'
          ? '#fbbf24'
          : '#4ade80';
        const pulse = 1 + Math.sin(game.elapsed * (aspectInfo.zone === 'BACK' ? 18 : 11)) * 0.09;
        const boxSize = Math.max(18, Math.min(44, (520 / Math.max(8, p.lockedDist)) * pulse));
        drawCornerBrackets(ctx, tScreen.x, tScreen.y, boxSize, boxSize * 0.82, 9, bracketColor, 2.5);

        // Center diamond on target
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(tScreen.x, tScreen.y - 5);
        ctx.lineTo(tScreen.x + 5, tScreen.y);
        ctx.lineTo(tScreen.x, tScreen.y + 5);
        ctx.lineTo(tScreen.x - 5, tScreen.y);
        ctx.closePath();
        ctx.stroke();

        // Target label + armor aspect + distance
        ctx.font = `bold ${compact ? 10 : 11}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textAlign = 'center';
        const distM = Math.round(p.lockedDist);
        const label = `${aspectInfo.hitsLabel} · ${distM}m`;
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(9, 13, 22, 0.86)';
        ctx.fillRect(tScreen.x - tw * 0.5, tScreen.y - boxSize * 0.82 - 20, tw, 15);
        ctx.fillStyle = bracketColor;
        ctx.fillText(label, tScreen.x, tScreen.y - boxSize * 0.82 - 9);

        // Target 3-segment Hull Integrity Bar
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
      // Enemy is in forward cone, but a Brick or Steel wall blocks line-of-sight!
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

  // ==========================================================================
  // GPS-like Minimap (Rotating Heading-Up Sat-Nav OR North-Up Tactical Map)
  // ==========================================================================
  renderGpsMinimap(ctx, game, viewer, cx, cy, radius) {
    const headingUp = game.gpsHeadingUp;
    // Scale so almost the entire 91m arena is visible on GPS even from southern spawn
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
      const localRight = dx * rx + dz * rz;
      const localForward = dx * fx + dz * fz;
      return {
        x: cx + localRight * scale,
        y: cy - localForward * scale,
      };
    }

    ctx.save();
    // Outer GPS bezel shadow & ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Sat-nav dark radar background
    ctx.fillStyle = 'rgba(13, 22, 36, 0.9)';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    // Subtle radar range rings
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Arena boundary outline on GPS
    const corners = [
      toGps(0, 0),
      toGps(WORLD_SIZE, 0),
      toGps(WORLD_SIZE, WORLD_SIZE),
      toGps(0, WORLD_SIZE),
    ];
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.stroke();

    // Draw walls & terrain cells on GPS
    const cellPx = Math.max(2.2, CELL_SIZE * scale);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotYaw);
    ctx.translate(-originX * scale, -originZ * scale);

    for (let r = 0; r < SUB_GRID; r++) {
      const row = game.grid[r];
      const hpRow = game.wallHp ? game.wallHp[r] : null;
      for (let c = 0; c < SUB_GRID; c++) {
        const t = row[c];
        if (t === TILE.EMPTY) continue;
        let hpRatio = 1.0;
        if (t === TILE.BRICK) {
          hpRatio = hpRow ? Math.max(0.2, hpRow[c] / WALL_MAX_HP) : 1.0;
          ctx.fillStyle = `rgba(194, 89, 63, ${(0.32 + 0.68 * hpRatio).toFixed(2)})`;
        } else if (t === TILE.STEEL) {
          ctx.fillStyle = '#cbd5e1';
        }
        else if (t === TILE.WATER) ctx.fillStyle = '#0284c7';
        else if (t === TILE.TREES) ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
        else if (t === TILE.ICE) ctx.fillStyle = 'rgba(186, 230, 253, 0.4)';
        else if (t === TILE.EAGLE) ctx.fillStyle = '#facc15';
        else continue;

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

    // Viewer's Forward Auto-Aim Cone shaded on GPS!
    if (viewer.alive) {
      const vPt = toGps(viewer.x, viewer.z);
      const relHeading = headingUp ? 0 : -viewer.yaw;
      const coneCenterAngle = -Math.PI * 0.5 + relHeading;
      ctx.fillStyle = viewer.lockedTarget
        ? 'rgba(74, 222, 128, 0.22)'
        : 'rgba(250, 204, 21, 0.15)';
      ctx.beginPath();
      ctx.moveTo(vPt.x, vPt.y);
      ctx.arc(
        vPt.x,
        vPt.y,
        Math.min(radius * 0.88, 45 * scale),
        coneCenterAngle - AUTO_AIM_HALF_ANGLE,
        coneCenterAngle + AUTO_AIM_HALF_ANGLE
      );
      ctx.closePath();
      ctx.fill();
    }

    // Power-up crates on GPS (blinking cyan star)
    for (const cr of game.crates) {
      const pt = toGps(cr.x, cr.z);
      if (Math.floor(game.elapsed * 6) % 2 === 0) {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Enemy AI Tanks on GPS (pulsing red blips + edge directional clamping so NEVER lost!)
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const pt = toGps(e.x, e.z);
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const d = Math.hypot(dx, dy);
      let bx = pt.x;
      let by = pt.y;
      const clamped = d > radius - 5;
      if (clamped) {
        bx = cx + (dx / d) * (radius - 5);
        by = cy + (dy / d) * (radius - 5);
      }
      ctx.fillStyle = e.isBonus && Math.floor(game.elapsed * 8) % 2 === 0 ? '#facc15' : '#ef4444';
      ctx.beginPath();
      ctx.arc(bx, by, clamped ? 3.2 : 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // All Players on GPS (colored heading chevrons!)
    for (const pl of game.players) {
      if (!pl.alive) continue;
      const pt = toGps(pl.x, pl.z);
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const d = Math.hypot(dx, dy);
      let px = pt.x;
      let py = pt.y;
      if (d > radius - 6) {
        px = cx + (dx / d) * (radius - 6);
        py = cy + (dy / d) * (radius - 6);
      }
      const chevronRot = headingUp ? viewer.yaw - pl.yaw : -pl.yaw;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(chevronRot);
      ctx.fillStyle = pl.cssColor;
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.lineTo(5, 5.5);
      ctx.lineTo(0, 2.8);
      ctx.lineTo(-5, 5.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // remove circle clip

    // Outer GPS bezel stroke + Rotating North ('N') Compass Badge
    ctx.strokeStyle = viewer.cssColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    const northX = cx + Math.sin(rotYaw) * radius;
    const northY = cy - Math.cos(rotYaw) * radius;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(northX, northY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', northX, northY + 0.5);
    ctx.textBaseline = 'alphabetic';

    // Tiny GPS mode label underneath
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.font = 'bold 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(headingUp ? 'GPS · HDG UP' : 'GPS · NORTH', cx, cy + radius + 13);
  }

  renderPlayerStatus(ctx, game, p, vp, compact) {
    const pad = 12;
    const x = vp.x + pad;
    const y = vp.y + pad;

    // Top-left Player Badge + Score / Frags + Lives
    ctx.fillStyle = 'rgba(9, 13, 22, 0.82)';
    const cardW = compact ? 168 : 204;
    const cardH = compact ? 58 : 66;
    ctx.fillRect(x, y, cardW, cardH);
    ctx.fillStyle = p.cssColor;
    ctx.fillRect(x, y, 4, cardH);

    ctx.font = `bold ${compact ? 12 : 14}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(p.tag, x + 10, y + 17);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${compact ? 11 : 12}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    if (game.mode === GAME_MODE.VERSUS) {
      ctx.fillText(`FRAGS: ${p.frags}/${VERSUS_TARGET_FRAGS}`, x + 42, y + 17);
    } else {
      ctx.fillText(`${String(p.score).padStart(6, '0')} PTS`, x + 42, y + 17);
    }

    // Hull HP + Reactive Armor Bar
    const hpRatio = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 10, y + 25, cardW - 20, 8);
    ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#eab308' : '#ef4444';
    ctx.fillRect(x + 10, y + 25, (cardW - 20) * hpRatio, 8);

    // Armor Pips
    for (let a = 0; a < p.armor; a++) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(x + 10 + a * 18, y + 36, 14, 4);
    }

    // Bottom row of badge: Lives / Weapon Tier
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${compact ? 10 : 11}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const tierNames = ['MK-I', 'MK-II', 'MK-III', 'MK-IV★'];
    const lifeText = game.mode === GAME_MODE.COOP ? `♥×${p.lives} · ` : '';
    ctx.fillText(`${lifeText}GUN ${tierNames[p.weaponTier] || 'MK-I'}`, x + 10, y + cardH - 8);

    // Bottom-left Active Buffs & Tractor-Beam Carried Wall Indicator
    const by = vp.y + vp.h - 12;
    const pills = [];
    if (p.carriedTile === TILE.BRICK) pills.push({ text: 'CARRY: BRICK [DROP]', color: '#ea580c' });
    else if (p.carriedTile === TILE.STEEL) pills.push({ text: 'CARRY: STEEL [DROP]', color: '#94a3b8' });
    if (p.shieldTimer > 0) pills.push({ text: `SHIELD ${Math.ceil(p.shieldTimer)}s`, color: '#38bdf8' });
    if (p.rapidTimer > 0) pills.push({ text: `RAPID ${Math.ceil(p.rapidTimer)}s`, color: '#fbbf24' });
    if (p.hasHover) pills.push({ text: 'PONTOON', color: '#2dd4bf' });

    let px = x;
    ctx.font = 'bold 10px ui-monospace, SFMono-Regular, Menlo, monospace';
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

  // 4th Quadrant Tactical Command View when 3 Players are active!
  renderSatelliteQuadrant(ctx, game, q) {
    ctx.fillStyle = '#090f1a';
    ctx.fillRect(q.x, q.y, q.w, q.h);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SAT-COM OVERVIEW · LIVE TELEMETRY', q.x + 14, q.y + 22);

    const mapRadius = Math.max(40, Math.min(q.w, q.h) * 0.36);
    const dummyViewer = {
      x: WORLD_SIZE * 0.5,
      z: WORLD_SIZE * 0.5,
      yaw: 0,
      alive: false,
      cssColor: '#38bdf8',
    };
    const prevHeading = game.gpsHeadingUp;
    game.gpsHeadingUp = false;
    this.renderGpsMinimap(ctx, game, dummyViewer, q.x + q.w * 0.5, q.y + q.h * 0.54, mapRadius);
    game.gpsHeadingUp = prevHeading;
  }

  renderGlobalBanner(ctx, game, cssW, cssH) {
    // Bottom-center compact match objective pill (never overlaps 2P top-left card or 1P GPS!)
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
        ctx,
        cssW,
        cssH,
        game.mode === GAME_MODE.COOP ? `STAGE ${game.stage}: ${game.arenaTemplate.name}` : `ARENA: ${game.arenaTemplate.name}`,
        game.arenaTemplate.subtitle,
        '#38bdf8'
      );
    } else if (game.state === 'STAGE_CLEAR') {
      this.drawModalBox(
        ctx,
        cssW,
        cssH,
        `STAGE ${game.stage} CLEARED!`,
        'Advancing to next sector...',
        '#4ade80'
      );
    } else if (game.state === 'GAME_OVER') {
      this.drawModalBox(
        ctx,
        cssW,
        cssH,
        game.victoryBanner || 'MISSION FAILED',
        'Press Enter or Space to Play Again · Esc for Menu',
        game.isVictory ? '#4ade80' : '#f87171'
      );
    }
  }

  drawModalBox(ctx, cssW, cssH, title, subtitle, accent) {
    const bw = Math.min(cssW - 32, 460);
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
    ctx.font = 'bold 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(title, cssW * 0.5, by + 46);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(subtitle, cssW * 0.5, by + 76);
  }
}
