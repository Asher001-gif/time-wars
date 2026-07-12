import { GameState, Player, PLAYER_RADIUS, TASK_RANGE, FreezeProjectile, JAIL_RECT, JAIL_DURATION, DOOR_INTERACT_RANGE, TEAM_COLORS, TEAM_NAMES, TeamIndex, Platform, BUILDER_BLOCK_LIFETIME } from './types';
import { Powerup, POWERUP_RADIUS } from './types';
import { ROOM_WALLS, OBSTACLES, ROOMS, SHELTERS, BILLBOARDS } from './collision';

import crewA from '@/assets/char-crew-a.png';
import crewB from '@/assets/char-crew-b.png';
import protA from '@/assets/char-protector-a.png';
import protB from '@/assets/char-protector-b.png';
import traitorA from '@/assets/char-traitor-a.png';
import traitorB from '@/assets/char-traitor-b.png';
import deadPlayerImg from '@/assets/dead-player.png';

const SPRITES: Record<string, HTMLImageElement> = {};
function loadSprite(key: string, src: string) {
  const img = new Image();
  img.src = src;
  SPRITES[key] = img;
}
loadSprite('crew_a', crewA);
loadSprite('crew_b', crewB);
loadSprite('protector_a', protA);
loadSprite('protector_b', protB);
loadSprite('traitor_a', traitorA);
loadSprite('traitor_b', traitorB);
loadSprite('dead', deadPlayerImg);

// Per-player facing memory (renderer-local, no engine impact)
const FACING: Map<number, number> = new Map();

const FROZEN_COLOR = '#40d8f0';
let animTime = 0;

// Vision radii per ability
const VISION_RADIUS: Record<string, number> = {
  crew: 220,
  jail: 180,
  kill: 130,
  shooter: 220,
};

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number
) {
  if (state.mode === 'football') {
    renderFootball(ctx, state, canvasW, canvasH);
    return;
  }

  const human = state.players[0];
  const camX = Math.max(0, Math.min(state.mapWidth - canvasW, human.x - canvasW / 2));
  const camY = Math.max(0, Math.min(state.mapHeight - canvasH, human.y - canvasH / 2));

  ctx.save();
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Fill entire canvas black first (fog base)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.translate(-camX, -camY);

  animTime = performance.now();

  drawMarsSurface(ctx, state.mapWidth, state.mapHeight);
  drawJailRoom(ctx);
  drawTaskStations(ctx, state);
  drawDoors(ctx, state);
  drawPlatforms(ctx, state.platforms);
  drawPowerups(ctx, state.powerups);


  for (const p of state.players) {
    if (!p.alive) drawDeadPlayer(ctx, p);
  }
  for (const p of state.players) {
    if (p.alive) drawPlayer(ctx, p, human);
  }

  // Bot door-interaction progress rings
  for (const p of state.players) {
    if (!p.alive || p.isHuman || !p.doorBusyUntil) continue;
    const door = state.doors.find(d => d.id === p.doorBusyId);
    if (!door) continue;
    const remaining = Math.max(0, p.doorBusyUntil - performance.now());
    const progress = 1 - remaining / 3000;
    ctx.beginPath();
    ctx.arc(door.cx, door.cy, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Draw projectiles
  drawProjectiles(ctx, state.projectiles);

  ctx.restore();

  // Draw fog of war overlay
  const visionR = VISION_RADIUS[human.ability] || 220;
  const screenX = human.x - camX;
  const screenY = human.y - camY;

  // Create radial gradient mask: clear center -> dark edges
  const fogGrad = ctx.createRadialGradient(screenX, screenY, visionR * 0.5, screenX, screenY, visionR);
  fogGrad.addColorStop(0, 'rgba(0,0,0,0)');
  fogGrad.addColorStop(0.7, 'rgba(0,0,0,0.3)');
  fogGrad.addColorStop(1, 'rgba(0,0,0,0.92)');

  ctx.save();
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Hard fog outside vision radius
  ctx.beginPath();
  ctx.rect(0, 0, canvasW, canvasH);
  ctx.arc(screenX, screenY, visionR, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fill();
  ctx.restore();

  drawHUD(ctx, state, canvasW, canvasH);
}

/* ==================== FOOTBALL MODE ==================== */
function renderFootball(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number
) {
  const human = state.players[0];
  const camX = Math.max(0, Math.min(state.mapWidth - canvasW, human.x - canvasW / 2));
  const camY = Math.max(0, Math.min(state.mapHeight - canvasH, human.y - canvasH / 2));

  animTime = performance.now();
  ctx.save();
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = '#0a1a0a';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.translate(-camX, -camY);

  drawFootballField(ctx, state.mapWidth, state.mapHeight);
  drawPlatforms(ctx, state.platforms);
  drawPowerups(ctx, state.powerups);

  // Players
  for (const p of state.players) drawFootballPlayer(ctx, p);

  // Ball
  if (state.ball) drawSoccerBall(ctx, state.ball.x, state.ball.y, state.ball.radius);

  ctx.restore();

  // Scoreboard HUD
  drawFootballHUD(ctx, state, canvasW, canvasH);
}

function drawFootballField(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const m = 80; // FOOTBALL_FIELD.margin
  const goalW = 220;
  // Grass with subtle stripes
  ctx.fillStyle = '#4a8a35';
  ctx.fillRect(0, 0, w, h);
  // Stripe pattern
  const stripeH = 80;
  for (let y = 0; y < h; y += stripeH) {
    const dark = (Math.floor(y / stripeH) % 2) === 0;
    ctx.fillStyle = dark ? '#467f30' : '#4f933b';
    ctx.fillRect(0, y, w, stripeH);
  }
  // Outside border (out-of-bounds)
  ctx.fillStyle = '#2a4a1a';
  ctx.fillRect(0, 0, w, m);
  ctx.fillRect(0, h - m, w, m);
  ctx.fillRect(0, 0, m, h);
  ctx.fillRect(w - m, 0, m, h);

  // White lines
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
  // Halfway line
  ctx.beginPath();
  ctx.moveTo(m, h / 2);
  ctx.lineTo(w - m, h / 2);
  ctx.stroke();
  // Center circle
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 90, 0, Math.PI * 2);
  ctx.stroke();
  // Center dot
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2); ctx.fill();
  // Penalty boxes (top & bottom)
  const penW = 380, penH = 130;
  ctx.strokeRect(w / 2 - penW / 2, m, penW, penH);
  ctx.strokeRect(w / 2 - penW / 2, h - m - penH, penW, penH);
  // Goal areas
  const gaW = 200, gaH = 60;
  ctx.strokeRect(w / 2 - gaW / 2, m, gaW, gaH);
  ctx.strokeRect(w / 2 - gaW / 2, h - m - gaH, gaW, gaH);
  // Goals (white frame, sit slightly outside the line)
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(w / 2 - goalW / 2, m - 24, goalW, 24);
  ctx.fillRect(w / 2 - goalW / 2, h - m, goalW, 24);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.strokeRect(w / 2 - goalW / 2, m - 24, goalW, 24);
  ctx.strokeRect(w / 2 - goalW / 2, h - m, goalW, 24);
  // Goal posts (red/blue tint based on which team defends)
  ctx.fillStyle = '#e03030';
  ctx.fillRect(w / 2 - goalW / 2 - 6, m - 30, 6, 30);
  ctx.fillRect(w / 2 + goalW / 2, m - 30, 6, 30);
  ctx.fillStyle = '#4a90d9';
  ctx.fillRect(w / 2 - goalW / 2 - 6, h - m, 6, 30);
  ctx.fillRect(w / 2 + goalW / 2, h - m, 6, 30);
}

function drawSoccerBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  // Shadow
  ctx.beginPath();
  ctx.ellipse(x, y + r + 2, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  // White body
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#f5f5f5';
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Center pentagon (procedural)
  ctx.fillStyle = '#1a1a1a';
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    pts.push([x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < 5; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
  // Surrounding small dark patches
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 5) + Math.PI / 5;
    const px = x + Math.cos(a) * r * 0.78;
    const py = y + Math.sin(a) * r * 0.78;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
  }
  // Highlight
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

function drawFootballPlayer(ctx: CanvasRenderingContext2D, p: Player) {
  const x = p.x;
  const s = 1.0;
  const isMoving = Math.abs(p.direction.x) > 0.1 || Math.abs(p.direction.y) > 0.1;
  const floatBob = Math.sin(animTime * 0.003 + p.id * 1.3) * 2.5;
  const moveBob = isMoving ? Math.sin(animTime * 0.012 + p.id * 2) * 1.5 : 0;
  const y = p.y + floatBob + moveBob;

  // Lock facing on horizontal motion (same as Mars)
  let facing = FACING.get(p.id) ?? 1;
  if (isMoving && Math.abs(p.direction.x) > 0.5) {
    facing = p.direction.x > 0 ? 1 : -1;
  }
  FACING.set(p.id, facing);
  const tilt = isMoving ? p.direction.x * 0.18 : 0;

  // Soft shadow on ground
  ctx.beginPath();
  ctx.ellipse(x, p.y + 22, 14, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  // Team color (used only for the ground ring beneath the player)
  const teamColor = p.footballTeam === 'red' ? '#e03030' : '#4a90d9';


  // Team-colored ground ring (so robots stay readable on green grass)
  ctx.beginPath();
  ctx.arc(x, p.y + 20, 18, 0, Math.PI * 2);
  ctx.fillStyle = teamColor + '55';
  ctx.fill();
  ctx.strokeStyle = teamColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Reuse the existing ASTERON Mars robot sprite
  const img = SPRITES['crew_a'];
  const size = 52 * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(facing, 1);
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fillStyle = teamColor;
    ctx.fill();
  }
  ctx.restore();

  // (Team banner rectangle above head removed — team identity already shown
  // by the ground ring beneath the player.)


  // Power-shot aura
  if ((p.powerShotCharges ?? 0) > 0) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#ff5a3c';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(x, p.y, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  // Speed aura
  if ((p.speedBoostUntil ?? 0) > performance.now()) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#ffe46a';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(x, p.y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Name
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(p.name, x, y - 32);
  if (p.isHuman) {
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('▼ YOU', x, y - 56);
  }
}


function drawFootballHUD(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, w, 60);

  const score = state.score || { red: 0, blue: 0 };
  const round = (state.totalRounds ?? 5) - (state.roundsRemaining ?? 0) + 1;
  const total = state.totalRounds ?? 5;

  ctx.textAlign = 'center';
  ctx.font = 'bold 26px monospace';
  ctx.fillStyle = '#e03030';
  ctx.fillText(`RED ${score.red}`, w / 2 - 90, 36);
  ctx.fillStyle = '#fff';
  ctx.fillText('—', w / 2, 36);
  ctx.fillStyle = '#4a90d9';
  ctx.fillText(`${score.blue} BLUE`, w / 2 + 90, 36);

  ctx.fillStyle = '#ffe46a';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`Round ${Math.min(round, total)} / ${total}`, w / 2, 54);

  // Round timer
  const roundTimeMs = ((state.settings?.roundTime ?? 120) * 1000);
  const elapsed = performance.now() - (state.roundStartedAt ?? performance.now());
  const remainMs = Math.max(0, roundTimeMs - elapsed);
  const mm = Math.floor(remainMs / 60000);
  const ss = Math.floor((remainMs % 60000) / 1000);
  ctx.fillStyle = remainMs < 10000 ? '#ff6a6a' : '#9be7ff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`⏱ ${mm}:${ss.toString().padStart(2, '0')}`, w - 14, 22);
  ctx.textAlign = 'center';

  // Goal flash
  if (state.goalFlash) {
    const age = performance.now() - state.goalFlash.time;
    if (age < 1500) {
      const alpha = age < 1000 ? 1 : 1 - (age - 1000) / 500;
      ctx.save();
      ctx.globalAlpha = alpha;
      const flashTeam = state.goalFlash.team;
      ctx.fillStyle = flashTeam === 'red' ? 'rgba(224,48,48,0.85)'
        : flashTeam === 'blue' ? 'rgba(74,144,217,0.85)'
        : 'rgba(120,120,120,0.85)';
      ctx.fillRect(w / 2 - 220, h / 2 - 60, 440, 120);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 48px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(flashTeam === 'tie' ? 'ROUND TIE!' : 'GOAL!', w / 2, h / 2 + 16);
      ctx.restore();
    }
  }


  // Power-up chips for human
  const human = state.players[0];
  const chips: string[] = [];
  if ((human.speedBoostUntil ?? 0) > performance.now()) {
    chips.push(`⚡ ${Math.ceil(((human.speedBoostUntil ?? 0) - performance.now()) / 1000)}s`);
  }
  if ((human.powerShotCharges ?? 0) > 0) chips.push(`💥 POWER x${human.powerShotCharges}`);
  if ((human.builderCharges ?? 0) > 0) chips.push(`🛠 [B] BUILD x${human.builderCharges}`);
  if (chips.length > 0) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ffe46a';
    ctx.fillText(chips.join('   '), 12, 78);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, h - 26, w, 26);
  ctx.fillStyle = '#ccc';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('WASD/Arrows: Move • Run into the ball to kick it • [B] Build', w / 2, h - 8);
}


/* ==================== DOORS ==================== */
function drawDoors(ctx: CanvasRenderingContext2D, state: GameState) {
  const human = state.players[0];
  for (const d of state.doors) {
    if (d.synthetic) {
      // Player-placed wall block — looks like a thick metallic barricade.
      const cx = d.cx, cy = d.cy;
      const horizontal = d.y1 === d.y2;
      const w = Math.abs(d.x2 - d.x1);
      const h = Math.abs(d.y2 - d.y1);
      const thickness = 14;
      ctx.save();
      const remaining = Math.max(0, (d.expiresAt ?? 0) - performance.now());
      const fading = remaining < 5000;
      ctx.globalAlpha = fading ? 0.4 + 0.6 * Math.abs(Math.sin(performance.now() * 0.012)) : 1;
      ctx.fillStyle = '#6a6a78';
      if (horizontal) ctx.fillRect(d.x1, cy - thickness / 2, w, thickness);
      else ctx.fillRect(cx - thickness / 2, d.y1, thickness, h);
      ctx.strokeStyle = '#cfa050';
      ctx.lineWidth = 2;
      if (horizontal) ctx.strokeRect(d.x1, cy - thickness / 2, w, thickness);
      else ctx.strokeRect(cx - thickness / 2, d.y1, thickness, h);
      // Rivets
      ctx.fillStyle = '#ffd700';
      const dots = 3;
      for (let i = 1; i <= dots; i++) {
        const t = i / (dots + 1);
        const px = horizontal ? d.x1 + w * t : cx;
        const py = horizontal ? cy : d.y1 + h * t;
        ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      continue;
    }
    const cx = d.cx, cy = d.cy;
    const horizontal = d.y1 === d.y2;
    const w = Math.abs(d.x2 - d.x1);
    const h = Math.abs(d.y2 - d.y1);
    const thickness = 12;

    if (d.open) {
      // Open: glowing dashed slot, passable
      ctx.save();
      ctx.strokeStyle = '#3dba6f';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else {
      // Closed: solid metallic door
      ctx.save();
      if (horizontal) {
        ctx.fillStyle = '#5a3a20';
        ctx.fillRect(d.x1, cy - thickness / 2, w, thickness);
        ctx.strokeStyle = '#1a0a05';
        ctx.lineWidth = 2;
        ctx.strokeRect(d.x1, cy - thickness / 2, w, thickness);
        ctx.fillStyle = '#cc8860';
        ctx.fillRect(d.x1 + w / 2 - 4, cy - 2, 8, 4);
      } else {
        ctx.fillStyle = '#5a3a20';
        ctx.fillRect(cx - thickness / 2, d.y1, thickness, h);
        ctx.strokeStyle = '#1a0a05';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - thickness / 2, d.y1, thickness, h);
        ctx.fillStyle = '#cc8860';
        ctx.fillRect(cx - 2, d.y1 + h / 2 - 4, 4, 8);
      }
      ctx.restore();
    }

    // Interaction prompt
    const near = Math.hypot(human.x - cx, human.y - cy) < DOOR_INTERACT_RANGE;
    if (!d.synthetic && near && human.alive && !human.jailed && human.role !== 'protector') {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(d.open ? '[E] CLOSE' : '[E] OPEN', cx, cy - 18);
    }
  }
}



/* ==================== BUILDER-BLOCK PLATFORMS ==================== */
function drawPlatforms(ctx: CanvasRenderingContext2D, platforms: Platform[]) {
  const now = performance.now();
  for (const plat of platforms) {
    const remaining = Math.max(0, plat.expiresAt - now);
    const fading = remaining < 5000;
    const flicker = fading ? 0.55 + 0.45 * Math.abs(Math.sin(now * 0.012)) : 1;

    const hw = plat.w / 2, hh = plat.h / 2;
    // Determine front face geometry
    const horizontalFace = Math.abs(plat.frontX) >= Math.abs(plat.frontY);
    const sx = Math.sign(plat.frontX) || 0;
    const sy = Math.sign(plat.frontY) || 0;

    ctx.save();
    ctx.globalAlpha = flicker;

    // Drop shadow on ground
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(plat.cx, plat.cy + hh + 4, hw + 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Top surface (where players stand)
    const topGrad = ctx.createLinearGradient(0, plat.cy - hh, 0, plat.cy + hh);
    topGrad.addColorStop(0, '#c9d4e6');
    topGrad.addColorStop(1, '#7a8aa6');
    ctx.fillStyle = topGrad;
    ctx.fillRect(plat.cx - hw, plat.cy - hh, plat.w, plat.h);

    // Inner highlight (top edge)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plat.cx - hw + 4, plat.cy - hh + 3);
    ctx.lineTo(plat.cx + hw - 4, plat.cy - hh + 3);
    ctx.stroke();

    // Frame
    ctx.strokeStyle = '#1f2a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(plat.cx - hw, plat.cy - hh, plat.w, plat.h);

    // Front face (the side that blocks ground players)
    ctx.fillStyle = '#3b4a66';
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 3;
    if (horizontalFace) {
      const fx = plat.cx + sx * hw;
      ctx.fillRect(fx - 5 * sx - (sx > 0 ? 0 : 5), plat.cy - hh, 5, plat.h);
      ctx.beginPath();
      ctx.moveTo(fx, plat.cy - hh);
      ctx.lineTo(fx, plat.cy + hh);
      ctx.stroke();
    } else {
      const fy = plat.cy + sy * hh;
      ctx.fillRect(plat.cx - hw, fy - 5 * sy - (sy > 0 ? 0 : 5), plat.w, 5);
      ctx.beginPath();
      ctx.moveTo(plat.cx - hw, fy);
      ctx.lineTo(plat.cx + hw, fy);
      ctx.stroke();
    }

    // Corner rivets
    ctx.fillStyle = '#ffd166';
    for (const [rx, ry] of [
      [plat.cx - hw + 5, plat.cy - hh + 5],
      [plat.cx + hw - 5, plat.cy - hh + 5],
      [plat.cx - hw + 5, plat.cy + hh - 5],
      [plat.cx + hw - 5, plat.cy + hh - 5],
    ]) {
      ctx.beginPath(); ctx.arc(rx, ry, 1.8, 0, Math.PI * 2); ctx.fill();
    }

    // Lifetime ring (small clock on top)
    const pct = Math.max(0, Math.min(1, remaining / BUILDER_BLOCK_LIFETIME));
    ctx.strokeStyle = pct < 0.2 ? '#ff5555' : '#9ac9ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(plat.cx, plat.cy, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();

    ctx.restore();
  }
}



/* ==================== POWER-UPS ==================== */
function drawPowerups(ctx: CanvasRenderingContext2D, powerups: Powerup[]) {
  const now = performance.now();
  for (const pu of powerups) {
    const bob = Math.sin(now * 0.004 + pu.id * 1.7) * 3;
    const x = pu.x;
    const y = pu.y + bob;
    // Bubble background
    const colors: Record<string, [string, string]> = {
      speed:   ['#ffe46a', '#c98c1e'],
      life:    ['#ff7a8a', '#a3203a'],
      builder: ['#9ac9ff', '#235a99'],
    };
    const [fill, stroke] = colors[pu.kind];
    // Outer glow
    const glow = ctx.createRadialGradient(x, y, 4, x, y, POWERUP_RADIUS + 10);
    glow.addColorStop(0, fill + 'cc');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, POWERUP_RADIUS + 10, 0, Math.PI * 2); ctx.fill();
    // Bubble
    ctx.beginPath();
    ctx.arc(x, y, POWERUP_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Bubble highlight
    ctx.beginPath();
    ctx.arc(x - 5, y - 6, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
    // Icon
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#1a0a05';
    ctx.fillStyle = '#1a0a05';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pu.kind === 'speed') {
      // Lightning bolt
      ctx.beginPath();
      ctx.moveTo(2, -8);
      ctx.lineTo(-4, 1);
      ctx.lineTo(0, 1);
      ctx.lineTo(-2, 8);
      ctx.lineTo(5, -2);
      ctx.lineTo(0, -2);
      ctx.closePath();
      ctx.fill();
    } else if (pu.kind === 'life') {
      // Plus
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
      ctx.moveTo(0, -6); ctx.lineTo(0, 6);
      ctx.stroke();
    } else {
      // Wrench
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(-4, -4, 4, Math.PI * 0.2, Math.PI * 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, -2);
      ctx.lineTo(7, 7);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ==================== MAP DRAWING ==================== */

function drawMarsSurface(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Mars soil background
  const grad = ctx.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, w);
  grad.addColorStop(0, '#c4622a');
  grad.addColorStop(0.5, '#a0451e');
  grad.addColorStop(1, '#7a3015');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle terrain texture dots
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  const seed = 42;
  for (let i = 0; i < 300; i++) {
    const rx = ((seed * (i + 1) * 7919) % w);
    const ry = ((seed * (i + 1) * 6271) % h);
    const rr = ((seed * (i + 1) * 3571) % 8) + 2;
    ctx.beginPath();
    ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw rooms
  for (const room of ROOMS) {
    // Room floor (darker)
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(room.x, room.y, room.w, room.h);

    // Floor grid lines
    ctx.strokeStyle = 'rgba(80,80,80,0.3)';
    ctx.lineWidth = 1;
    for (let gx = room.x + 40; gx < room.x + room.w; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, room.y);
      ctx.lineTo(gx, room.y + room.h);
      ctx.stroke();
    }
    for (let gy = room.y + 40; gy < room.y + room.h; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(room.x, gy);
      ctx.lineTo(room.x + room.w, gy);
      ctx.stroke();
    }

    // Room label
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(room.label, room.x + room.w / 2, room.y + room.h / 2 + 10);

    // Room-specific decorations
    if (room.label === 'RESEARCH') drawResearchDecor(ctx, room);
    else if (room.label === 'ECOSYSTEM') drawEcosystemDecor(ctx, room);
    else if (room.label === 'RECOVER') drawRecoverDecor(ctx, room);
  }

  // East expansion: mini shelters + billboards (drawn before walls so the
  // shared wall lines render on top with the same #111 style).
  drawShelters(ctx);
  drawBillboards(ctx);



  // Draw walls (thick black)
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  for (const wall of ROOM_WALLS) {
    ctx.beginPath();
    ctx.moveTo(wall.x1, wall.y1);
    ctx.lineTo(wall.x2, wall.y2);
    ctx.stroke();
  }

  // Door indicators (small green markers)
  ctx.fillStyle = '#3dba6f';
  // Research door (bottom center)
  ctx.fillRect(775, 336, 50, 8);
  // Ecosystem door (right center)
  ctx.fillRect(386, 600, 8, 50);
  // Recover door (left center)
  ctx.fillRect(1206, 600, 8, 50);

  // Draw rock obstacles
  for (const obs of OBSTACLES) {
    // Rock shadow
    ctx.beginPath();
    ctx.ellipse(obs.x + 3, obs.y + 5, obs.r, obs.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Rock body
    ctx.beginPath();
    ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI * 2);
    const rockGrad = ctx.createRadialGradient(obs.x - obs.r * 0.3, obs.y - obs.r * 0.3, 2, obs.x, obs.y, obs.r);
    rockGrad.addColorStop(0, '#8a7060');
    rockGrad.addColorStop(1, '#4a3525');
    ctx.fillStyle = rockGrad;
    ctx.fill();
    ctx.strokeStyle = '#3a2515';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rock highlight
    ctx.beginPath();
    ctx.arc(obs.x - obs.r * 0.25, obs.y - obs.r * 0.25, obs.r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
  }

  // Small decorative craters
  const craters = [
    { x: 450, y: 420, r: 18 },
    { x: 1000, y: 850, r: 22 },
    { x: 300, y: 1050, r: 15 },
    { x: 1350, y: 1050, r: 20 },
    { x: 750, y: 1100, r: 12 },
  ];
  for (const c of craters) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Rim highlight
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r + 2, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.strokeStyle = 'rgba(255,200,150,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Map border
  ctx.strokeStyle = '#3a1a0a';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, w, h);
}

/* ==================== EAST EXPANSION (Asteron v4.0) ==================== */

// Per-billboard image cache. Replace BILLBOARDS[i].imageSrc to swap ads;
// the renderer lazily loads each URL exactly once.
const BILLBOARD_IMG_CACHE: Map<string, HTMLImageElement> = new Map();
function getBillboardImage(src: string): HTMLImageElement | null {
  if (!src) return null;
  let img = BILLBOARD_IMG_CACHE.get(src);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    BILLBOARD_IMG_CACHE.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function drawShelters(ctx: CanvasRenderingContext2D) {
  for (const sh of SHELTERS) {
    // Floor (slightly lighter than main rooms so it reads as "outpost").
    ctx.fillStyle = '#33302c';
    ctx.fillRect(sh.x, sh.y, sh.w, sh.h);
    // Subtle grid
    ctx.strokeStyle = 'rgba(90,80,70,0.35)';
    ctx.lineWidth = 1;
    for (let gx = sh.x + 30; gx < sh.x + sh.w; gx += 30) {
      ctx.beginPath(); ctx.moveTo(gx, sh.y); ctx.lineTo(gx, sh.y + sh.h); ctx.stroke();
    }
    for (let gy = sh.y + 30; gy < sh.y + sh.h; gy += 30) {
      ctx.beginPath(); ctx.moveTo(sh.x, gy); ctx.lineTo(sh.x + sh.w, gy); ctx.stroke();
    }
    // Door marker (green strip)
    ctx.fillStyle = '#3dba6f';
    if (sh.doorSide === 'bottom') ctx.fillRect(sh.doorCenter - 20, sh.y + sh.h - 4, 40, 6);
    if (sh.doorSide === 'top') ctx.fillRect(sh.doorCenter - 20, sh.y - 2, 40, 6);
    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(sh.label, sh.x + sh.w / 2, sh.y + sh.h / 2 + 4);
    // Tiny crate decoration inside
    ctx.fillStyle = '#6a5240';
    ctx.fillRect(sh.x + 14, sh.y + 14, 18, 18);
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sh.x + 14, sh.y + 14, 18, 18);
  }
}

function drawBillboards(ctx: CanvasRenderingContext2D) {
  for (const bb of BILLBOARDS) {
    // Cable to support base (subtle)
    ctx.strokeStyle = 'rgba(40,30,25,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bb.cx - bb.w / 2 + 14, bb.cy + bb.h / 2);
    ctx.lineTo(bb.baseX - 8, bb.baseY - 13);
    ctx.moveTo(bb.cx + bb.w / 2 - 14, bb.cy + bb.h / 2);
    ctx.lineTo(bb.baseX + 8, bb.baseY - 13);
    ctx.stroke();

    // Soft shadow under the base
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(bb.baseX + 3, bb.baseY + 16, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Support base (the impassable pylon — matches the collision rect)
    ctx.fillStyle = '#3a4250';
    ctx.fillRect(bb.baseX - 13, bb.baseY - 13, 26, 26);
    ctx.strokeStyle = '#1a1f28';
    ctx.lineWidth = 2;
    ctx.strokeRect(bb.baseX - 13, bb.baseY - 13, 26, 26);
    // Rivets
    ctx.fillStyle = '#ffd166';
    for (const [rx, ry] of [
      [bb.baseX - 9, bb.baseY - 9],
      [bb.baseX + 9, bb.baseY - 9],
      [bb.baseX - 9, bb.baseY + 9],
      [bb.baseX + 9, bb.baseY + 9],
    ]) { ctx.beginPath(); ctx.arc(rx, ry, 1.5, 0, Math.PI * 2); ctx.fill(); }

    // Screen frame
    const fx = bb.cx - bb.w / 2 - 6;
    const fy = bb.cy - bb.h / 2 - 6;
    const fw = bb.w + 12;
    const fh = bb.h + 12;
    ctx.fillStyle = '#2a3140';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeStyle = '#0e1218';
    ctx.lineWidth = 2;
    ctx.strokeRect(fx, fy, fw, fh);
    // Top mount tab
    ctx.fillStyle = '#3a4250';
    ctx.fillRect(bb.cx - 6, fy - 4, 12, 4);

    // Screen surface
    const sx = bb.cx - bb.w / 2;
    const sy = bb.cy - bb.h / 2;
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(sx, sy, bb.w, bb.h);

    const img = getBillboardImage(bb.imageSrc);
    if (img) {
      ctx.drawImage(img, sx, sy, bb.w, bb.h);
    } else {
      // Default "YOUR AD HERE!" panel.
      const grad = ctx.createLinearGradient(sx, sy, sx, sy + bb.h);
      grad.addColorStop(0, '#1a2030');
      grad.addColorStop(1, '#0d1320');
      ctx.fillStyle = grad;
      ctx.fillRect(sx, sy, bb.w, bb.h);
      ctx.strokeStyle = 'rgba(255,193,64,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 4, sy + 4, bb.w - 8, bb.h - 8);
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('YOUR AD HERE!', bb.cx, bb.cy + 4);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '7px monospace';
      ctx.fillText('ASTERON · v4.0', bb.cx, bb.cy + 16);
    }

    // Glass glare overlay
    const glare = ctx.createLinearGradient(sx, sy, sx + bb.w, sy + bb.h);
    glare.addColorStop(0, 'rgba(255,255,255,0.10)');
    glare.addColorStop(0.5, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = glare;
    ctx.fillRect(sx, sy, bb.w, bb.h);

    // Status LED dots (bottom of frame)
    ctx.fillStyle = '#3dba6f';
    ctx.beginPath(); ctx.arc(bb.cx - 6, fy + fh - 3, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath(); ctx.arc(bb.cx,     fy + fh - 3, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(bb.cx + 6, fy + fh - 3, 1.4, 0, Math.PI * 2); ctx.fill();
  }
}



/* ==================== ROOM DECORATIONS ==================== */

function drawResearchDecor(ctx: CanvasRenderingContext2D, room: { x: number; y: number; w: number; h: number }) {
  const rx = room.x, ry = room.y;

  // Lab table (top-left)
  ctx.fillStyle = 'rgba(100,110,130,0.4)';
  ctx.fillRect(rx + 30, ry + 40, 80, 35);
  ctx.strokeStyle = 'rgba(140,150,170,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + 30, ry + 40, 80, 35);

  // Monitor on table
  ctx.fillStyle = 'rgba(60,180,220,0.25)';
  ctx.fillRect(rx + 50, ry + 45, 30, 20);
  ctx.fillStyle = 'rgba(60,180,220,0.15)';
  ctx.fillRect(rx + 62, ry + 65, 6, 8);

  // Lab table (right side)
  ctx.fillStyle = 'rgba(100,110,130,0.4)';
  ctx.fillRect(rx + room.w - 120, ry + 50, 90, 30);
  ctx.strokeStyle = 'rgba(140,150,170,0.3)';
  ctx.strokeRect(rx + room.w - 120, ry + 50, 90, 30);

  // Beakers on right table
  ctx.fillStyle = 'rgba(100,220,160,0.2)';
  ctx.fillRect(rx + room.w - 105, ry + 52, 10, 22);
  ctx.fillStyle = 'rgba(220,160,80,0.2)';
  ctx.fillRect(rx + room.w - 85, ry + 55, 10, 19);

  // Floor device (center-bottom area)
  ctx.fillStyle = 'rgba(80,90,110,0.35)';
  ctx.beginPath();
  ctx.arc(rx + room.w / 2, ry + room.h - 80, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,180,220,0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Inner ring
  ctx.beginPath();
  ctx.arc(rx + room.w / 2, ry + room.h - 80, 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(60,180,220,0.15)';
  ctx.fill();
}

function drawEcosystemDecor(ctx: CanvasRenderingContext2D, room: { x: number; y: number; w: number; h: number }) {
  const rx = room.x, ry = room.y;

  // Green patches (garden beds)
  ctx.fillStyle = 'rgba(50,140,60,0.2)';
  ctx.fillRect(rx + 25, ry + 30, 100, 60);
  ctx.fillStyle = 'rgba(40,120,50,0.15)';
  ctx.fillRect(rx + 25, ry + 30, 100, 60);
  ctx.strokeStyle = 'rgba(60,160,70,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + 25, ry + 30, 100, 60);

  // Simple plant shapes (small circles as bushes)
  const plants = [
    { x: rx + 50, y: ry + 50 }, { x: rx + 80, y: ry + 55 },
    { x: rx + 100, y: ry + 48 }, { x: rx + 65, y: ry + 70 },
  ];
  for (const p of plants) {
    ctx.fillStyle = 'rgba(60,170,70,0.3)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(80,200,90,0.2)';
    ctx.beginPath();
    ctx.arc(p.x - 2, p.y - 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Second garden bed (bottom-right)
  ctx.fillStyle = 'rgba(50,140,60,0.2)';
  ctx.fillRect(rx + room.w - 140, ry + room.h - 100, 110, 65);
  ctx.strokeStyle = 'rgba(60,160,70,0.2)';
  ctx.strokeRect(rx + room.w - 140, ry + room.h - 100, 110, 65);

  // Tree-like shapes
  const trees = [
    { x: rx + room.w - 110, y: ry + room.h - 75 },
    { x: rx + room.w - 70, y: ry + room.h - 70 },
  ];
  for (const t of trees) {
    // Trunk
    ctx.fillStyle = 'rgba(100,70,40,0.25)';
    ctx.fillRect(t.x - 3, t.y, 6, 15);
    // Canopy
    ctx.fillStyle = 'rgba(50,160,60,0.3)';
    ctx.beginPath();
    ctx.arc(t.x, t.y - 4, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Water feature (small blue pool)
  ctx.fillStyle = 'rgba(40,120,200,0.15)';
  ctx.beginPath();
  ctx.ellipse(rx + room.w / 2, ry + room.h / 2 + 30, 30, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,150,220,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawRecoverDecor(ctx: CanvasRenderingContext2D, room: { x: number; y: number; w: number; h: number }) {
  const rx = room.x, ry = room.y;

  // Hospital beds (simple rectangles with headboards)
  const beds = [
    { x: rx + 30, y: ry + 40 },
    { x: rx + 30, y: ry + 130 },
    { x: rx + 30, y: ry + 220 },
  ];
  for (const b of beds) {
    // Bed frame
    ctx.fillStyle = 'rgba(90,100,120,0.35)';
    ctx.fillRect(b.x, b.y, 70, 35);
    ctx.strokeStyle = 'rgba(120,130,150,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y, 70, 35);
    // Pillow
    ctx.fillStyle = 'rgba(200,200,220,0.15)';
    ctx.fillRect(b.x + 2, b.y + 5, 18, 25);
    // Blanket
    ctx.fillStyle = 'rgba(80,140,200,0.12)';
    ctx.fillRect(b.x + 22, b.y + 3, 45, 29);
  }

  // Energy panel / battery (right side)
  ctx.fillStyle = 'rgba(80,90,110,0.35)';
  ctx.fillRect(rx + room.w - 90, ry + 60, 55, 80);
  ctx.strokeStyle = 'rgba(100,200,100,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + room.w - 90, ry + 60, 55, 80);
  // Battery bars
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(80,200,100,${0.15 + i * 0.05})`;
    ctx.fillRect(rx + room.w - 82, ry + 122 - i * 16, 39, 12);
  }

  // Medical cross symbol (bottom area)
  ctx.fillStyle = 'rgba(220,60,60,0.2)';
  const cx = rx + room.w / 2 + 40, cy = ry + room.h - 60;
  ctx.fillRect(cx - 4, cy - 14, 8, 28);
  ctx.fillRect(cx - 14, cy - 4, 28, 8);
}

/* ==================== TASK STATIONS ==================== */

function drawTaskStations(ctx: CanvasRenderingContext2D, state: GameState) {
  const human = state.players[0];

  for (const station of state.taskStations) {
    const completed = station.completed;
    const nearby = !completed && Math.sqrt((human.x - station.x) ** 2 + (human.y - station.y) ** 2) < TASK_RANGE;

    ctx.beginPath();
    ctx.arc(station.x, station.y, 25, 0, Math.PI * 2);
    ctx.fillStyle = completed ? 'rgba(61, 186, 111, 0.3)' : 'rgba(74, 144, 217, 0.3)';
    ctx.fill();
    ctx.strokeStyle = completed ? '#3dba6f' : (nearby ? '#ffd700' : '#4a90d9');
    ctx.lineWidth = nearby ? 3 : 2;
    ctx.setLineDash(completed ? [] : [4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = completed ? '#3dba6f' : '#4a90d9';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    const icons: Record<string, string> = { 'Calculate': '🧮', 'Adj. Temp': '🌡️', 'Send Email': '📧', 'Scan Data': '📡' };
    ctx.fillText(completed ? '✓' : (icons[station.label] || '📋'), station.x, station.y + 5);

    ctx.fillStyle = completed ? '#3dba6f' : '#cc8860';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(completed ? 'DONE' : station.label, station.x, station.y + 22);

    // Show team tag on station
    ctx.fillStyle = TEAM_COLORS[station.team];
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`▣ ${TEAM_NAMES[station.team]}`, station.x, station.y - 30);

    if (nearby && human.ability === 'crew' && station.team === human.team && human.alive && !human.frozen && !human.doingTask) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('[SPACE] USE', station.x, station.y - 42);
    }

    const aiWorker = state.players.find(p => p.doingTask && p.taskStationId === station.id && !p.isHuman);
    if (aiWorker) {
      ctx.fillStyle = 'rgba(74, 144, 217, 0.5)';
      ctx.fillRect(station.x - 20, station.y + 28, 40, 5);
      ctx.fillStyle = '#4a90d9';
      ctx.fillRect(station.x - 20, station.y + 28, 40 * aiWorker.taskProgress, 5);
    }
  }
}

/* ==================== PLAYER DRAWING ==================== */

function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, human: Player) {
  const x = p.x;
  const s = 1.0;
  const isMoving = Math.abs(p.direction.x) > 0.1 || Math.abs(p.direction.y) > 0.1;
  // Constant gentle floating for all (since char is "floating")
  const floatBob = Math.sin(animTime * 0.003 + p.id * 1.3) * 2.5;
  const moveBob = isMoving && !p.doingTask ? Math.sin(animTime * 0.012 + p.id * 2) * 1.5 : 0;
  // Builder-block elevation: lift the sprite visually so the player
  // clearly reads as "on top" of the platform.
  const elevationLift = p.elevatedPlatformId != null ? 18 : 0;
  const y = p.y + floatBob + moveBob - elevationLift;


  // Facing locks to last clear horizontal movement.
  // Stays the same until the player moves the OPPOSITE direction.
  let facing = FACING.get(p.id) ?? 1;
  if (isMoving && Math.abs(p.direction.x) > 0.5) {
    const newFacing = p.direction.x > 0 ? 1 : -1;
    if (newFacing !== facing) facing = newFacing;
  }
  FACING.set(p.id, facing);

  // Tilt in direction of movement
  const tilt = isMoving && !p.doingTask ? p.direction.x * 0.18 : 0;

  if (p.frozen) {
    ctx.beginPath();
    ctx.arc(x, p.y, 28 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(64, 216, 240, 0.2)';
    ctx.fill();
    ctx.strokeStyle = FROZEN_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (p.doingTask) {
    ctx.beginPath();
    ctx.arc(x, y - 5 * s, 26 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.taskProgress);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Soft shadow on ground (uses real p.y so it doesn't bob)
  ctx.beginPath();
  ctx.ellipse(x, p.y + 22, 14, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  // All players use the same unified visual regardless of ability or team.
  const spriteKey = 'crew_a';
  const img = SPRITES[spriteKey];

  const size = 52 * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(facing, 1);
  if (p.frozen) ctx.globalAlpha = 0.7;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    // Fallback circle while sprite loads
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#4a90d9';
    ctx.fill();
  }
  ctx.restore();

  // Team color banner above head (always visible — factions are public)
  const teamColor = TEAM_COLORS[p.team];
  const teamName = TEAM_NAMES[p.team];
  const bannerW = 52, bannerH = 12;
  const bannerY = y - 46 * s;
  ctx.fillStyle = teamColor;
  ctx.fillRect(x - bannerW / 2, bannerY, bannerW, bannerH);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - bannerW / 2, bannerY, bannerW, bannerH);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(teamName, x, bannerY + 9);

  // Name (white)
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(p.name, x, y - 32 * s);

  // Shield badges (small blue dots) under the team banner
  const shieldCount = p.shields ?? 0;
  if (shieldCount > 0) {
    const sx0 = x - (shieldCount - 1) * 6;
    for (let i = 0; i < shieldCount; i++) {
      const sx = sx0 + i * 12;
      const sy = y - 18 * s;
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#9ac9ff';
      ctx.fill();
      ctx.strokeStyle = '#235a99';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Speed-boost halo
  if ((p.speedBoostUntil ?? 0) > performance.now()) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#ffe46a';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(x, p.y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (p.isHuman) {
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('▼ YOU', bannerY === 0 ? x : x, y - 58 * s);
  }
}

/* ==================== PROJECTILES ==================== */

function drawProjectiles(ctx: CanvasRenderingContext2D, projectiles: FreezeProjectile[]) {
  const now = performance.now();
  for (const proj of projectiles) {
    let px: number, py: number;
    if (proj.kind === 'bullet') {
      const elapsed = now - proj.startTime;
      const traveled = Math.min(elapsed * (proj.speed || 1), proj.maxDistance || 9999);
      px = proj.x + (proj.dirX || 0) * traveled;
      py = proj.y + (proj.dirY || 0) * traveled;

      // Streak tail
      const tailLen = 22;
      const tx = px - (proj.dirX || 0) * tailLen;
      const ty = py - (proj.dirY || 0) * tailLen;
      const grad = ctx.createLinearGradient(tx, ty, px, py);
      grad.addColorStop(0, 'rgba(255, 180, 60, 0)');
      grad.addColorStop(1, 'rgba(255, 220, 120, 0.95)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(px, py);
      ctx.stroke();

      // Hot core
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff4c8';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      continue;
    }

    const t = Math.min(1, (now - proj.startTime) / proj.duration);
    px = proj.x + (proj.targetX - proj.x) * t;
    py = proj.y + (proj.targetY - proj.y) * t;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(64, 216, 240, 0.3)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#40d8f0';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
}

function drawCrewmateChar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, frozen: boolean) {
  const bodyColor = frozen ? FROZEN_COLOR : '#e8e8e8';
  const accentColor = frozen ? '#80e8f8' : '#4a90d9';
  const outlineColor = frozen ? '#6ac8d8' : '#888';

  // Body - egg/oval shape (white)
  ctx.beginPath();
  ctx.ellipse(x, y + 4 * s, 15 * s, 18 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Ear flaps (left and right)
  ctx.beginPath();
  ctx.ellipse(x - 14 * s, y + 2 * s, 5 * s, 10 * s, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x + 14 * s, y + 2 * s, 5 * s, 10 * s, 0.15, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Helmet dome (top)
  ctx.beginPath();
  ctx.arc(x, y - 10 * s, 13 * s, Math.PI, 0);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Visor (dark dome with cyan tint)
  ctx.beginPath();
  ctx.ellipse(x, y - 8 * s, 10 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? '#1a3a4a' : '#1a2a3a';
  ctx.fill();
  ctx.strokeStyle = frozen ? '#4ac8d8' : '#3a5a7a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ^^ Eyes (cyan chevrons)
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  // Left ^
  ctx.beginPath();
  ctx.moveTo(x - 7 * s, y - 6 * s);
  ctx.lineTo(x - 4 * s, y - 11 * s);
  ctx.lineTo(x - 1 * s, y - 6 * s);
  ctx.stroke();
  // Right ^
  ctx.beginPath();
  ctx.moveTo(x + 1 * s, y - 6 * s);
  ctx.lineTo(x + 4 * s, y - 11 * s);
  ctx.lineTo(x + 7 * s, y - 6 * s);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Collar ring (white band between head and body)
  ctx.beginPath();
  ctx.ellipse(x, y - 2 * s, 13 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? '#b0e8f0' : '#d0d0d0';
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Left arm antenna with blue orb
  ctx.beginPath();
  ctx.moveTo(x - 10 * s, y + 8 * s);
  ctx.lineTo(x - 16 * s, y + 20 * s);
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Blue orb
  ctx.beginPath();
  ctx.arc(x - 16 * s, y + 22 * s, 5 * s, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.strokeStyle = frozen ? '#5ab8d0' : '#3a70b0';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Orb glow
  ctx.beginPath();
  ctx.arc(x - 16 * s, y + 22 * s, 7 * s, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? 'rgba(64,216,240,0.2)' : 'rgba(74,144,217,0.25)';
  ctx.fill();
  // Orb shine
  ctx.beginPath();
  ctx.arc(x - 18 * s, y + 20 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
}

function drawImposterChar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, frozen: boolean) {
  const bodyColor = frozen ? FROZEN_COLOR : '#777';
  const darkBody = frozen ? '#6ac8d8' : '#555';
  const accentColor = frozen ? '#80e8f8' : '#e03030';
  const outlineColor = frozen ? '#5ab8c8' : '#444';

  // Knife arms (behind body) - angular dark blades
  ctx.save();
  // Left knife arm
  ctx.beginPath();
  ctx.moveTo(x - 14 * s, y + 2 * s);
  ctx.lineTo(x - 24 * s, y - 10 * s);
  ctx.lineTo(x - 22 * s, y - 16 * s);
  ctx.lineTo(x - 18 * s, y - 12 * s);
  ctx.closePath();
  ctx.fillStyle = frozen ? '#5ab8c8' : '#3a3a3a';
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Right knife arm
  ctx.beginPath();
  ctx.moveTo(x + 14 * s, y + 2 * s);
  ctx.lineTo(x + 24 * s, y - 10 * s);
  ctx.lineTo(x + 22 * s, y - 16 * s);
  ctx.lineTo(x + 18 * s, y - 12 * s);
  ctx.closePath();
  ctx.fillStyle = frozen ? '#5ab8c8' : '#3a3a3a';
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Body - slightly wider egg (dark gray)
  ctx.beginPath();
  ctx.ellipse(x, y + 4 * s, 16 * s, 19 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Helmet dome (darker gray)
  ctx.beginPath();
  ctx.arc(x, y - 10 * s, 14 * s, Math.PI, 0);
  ctx.fillStyle = darkBody;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Visor (very dark)
  ctx.beginPath();
  ctx.ellipse(x, y - 8 * s, 10 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0a0a';
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // XX Eyes (red X marks) - like bow-tie shapes
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  // Left X
  ctx.beginPath();
  ctx.moveTo(x - 7 * s, y - 11 * s);
  ctx.lineTo(x - 2 * s, y - 6 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 2 * s, y - 11 * s);
  ctx.lineTo(x - 7 * s, y - 6 * s);
  ctx.stroke();
  // Right X
  ctx.beginPath();
  ctx.moveTo(x + 2 * s, y - 11 * s);
  ctx.lineTo(x + 7 * s, y - 6 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 7 * s, y - 11 * s);
  ctx.lineTo(x + 2 * s, y - 6 * s);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Collar ring (gray)
  ctx.beginPath();
  ctx.ellipse(x, y - 2 * s, 14 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? '#90d8e8' : '#999';
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Center antenna with red orb (below body)
  ctx.beginPath();
  ctx.moveTo(x, y + 14 * s);
  ctx.lineTo(x, y + 24 * s);
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Red orb
  ctx.beginPath();
  ctx.arc(x, y + 26 * s, 5 * s, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.strokeStyle = frozen ? '#5ab8c8' : '#a02020';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Orb glow
  ctx.beginPath();
  ctx.arc(x, y + 26 * s, 7 * s, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? 'rgba(64,216,240,0.2)' : 'rgba(224,48,48,0.25)';
  ctx.fill();
  // Orb shine
  ctx.beginPath();
  ctx.arc(x - 2 * s, y + 24 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
}

function drawProtectorChar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, frozen: boolean) {
  const bodyColor = frozen ? FROZEN_COLOR : '#e8e8e8';
  const accentColor = frozen ? '#80e8f8' : '#3dba6f';
  const outlineColor = frozen ? '#6ac8d8' : '#888';

  // Body - egg/oval (white)
  ctx.beginPath();
  ctx.ellipse(x, y + 4 * s, 15 * s, 18 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Helmet dome (white, slightly taller)
  ctx.beginPath();
  ctx.arc(x, y - 11 * s, 14 * s, Math.PI, 0);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Visor (dark with green tint)
  ctx.beginPath();
  ctx.ellipse(x, y - 8 * s, 10 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? '#1a3a3a' : '#0a2a1a';
  ctx.fill();
  ctx.strokeStyle = frozen ? '#4ac8a8' : '#2a5a3a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Diamond eyes (green, filled)
  ctx.fillStyle = accentColor;
  // Left diamond
  ctx.beginPath();
  ctx.moveTo(x - 5 * s, y - 8 * s);
  ctx.lineTo(x - 3 * s, y - 12 * s);
  ctx.lineTo(x - 1 * s, y - 8 * s);
  ctx.lineTo(x - 3 * s, y - 5 * s);
  ctx.closePath();
  ctx.fill();
  // Right diamond
  ctx.beginPath();
  ctx.moveTo(x + 1 * s, y - 8 * s);
  ctx.lineTo(x + 3 * s, y - 12 * s);
  ctx.lineTo(x + 5 * s, y - 8 * s);
  ctx.lineTo(x + 3 * s, y - 5 * s);
  ctx.closePath();
  ctx.fill();
  // Eye glow
  ctx.beginPath();
  ctx.ellipse(x, y - 8 * s, 8 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(61,186,111,0.12)';
  ctx.fill();

  // Collar ring
  ctx.beginPath();
  ctx.ellipse(x, y - 2 * s, 13 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? '#b0e8f0' : '#d0d0d0';
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Solar panel device (right side)
  ctx.fillStyle = frozen ? '#5ab8c8' : '#444';
  ctx.fillRect(x + 14 * s, y - 8 * s, 7 * s, 14 * s);
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 14 * s, y - 8 * s, 7 * s, 14 * s);
  // Panel cells (green bars)
  ctx.fillStyle = accentColor;
  ctx.fillRect(x + 15.5 * s, y - 6 * s, 4 * s, 3 * s);
  ctx.fillRect(x + 15.5 * s, y - 1.5 * s, 4 * s, 3 * s);
  ctx.fillRect(x + 15.5 * s, y + 3 * s, 4 * s, 2 * s);

  // Right arm antenna with green orb
  ctx.beginPath();
  ctx.moveTo(x + 8 * s, y + 10 * s);
  ctx.lineTo(x + 14 * s, y + 20 * s);
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Green orb
  ctx.beginPath();
  ctx.arc(x + 14 * s, y + 22 * s, 5 * s, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.strokeStyle = frozen ? '#5ab8c8' : '#2a8a4f';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Orb glow
  ctx.beginPath();
  ctx.arc(x + 14 * s, y + 22 * s, 7 * s, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? 'rgba(64,216,240,0.2)' : 'rgba(61,186,111,0.25)';
  ctx.fill();
  // Orb shine
  ctx.beginPath();
  ctx.arc(x + 12 * s, y + 20 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
}

function drawDeadPlayer(ctx: CanvasRenderingContext2D, p: Player) {
  const x = p.x;
  const y = p.y;
  const img = SPRITES['dead'];
  const w = PLAYER_RADIUS * 2.6;
  const h = PLAYER_RADIUS * 1.9;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
  } else {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#888';
    ctx.fill();
    ctx.restore();
  }
}

/* ==================== HUD ==================== */

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number) {
  const human = state.players[0];

  ctx.fillStyle = 'rgba(10, 5, 3, 0.85)';
  ctx.fillRect(0, 0, w, 55);
  ctx.strokeStyle = '#8b4513';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 55); ctx.lineTo(w, 55); ctx.stroke();

  // Your team chip
  const myColor = TEAM_COLORS[human.team];
  ctx.fillStyle = myColor;
  ctx.fillRect(10, 8, 14, 14);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`TEAM ${TEAM_NAMES[human.team]} · ${human.ability.toUpperCase()}`, 30, 20);

  // Faction roster line
  ctx.font = 'bold 11px monospace';
  let xCursor = 10;
  for (let t = 0; t < 3; t++) {
    if (state.teamCounts[t] === 0) continue;
    const ti = t as TeamIndex;
    const alive = state.players.filter(p => p.team === ti && p.alive && !p.jailed).length;
    const jailed = state.players.filter(p => p.team === ti && p.jailed).length;
    ctx.fillStyle = TEAM_COLORS[ti];
    ctx.fillRect(xCursor, 32, 10, 10);
    ctx.fillStyle = '#ddd';
    const chip = `${TEAM_NAMES[ti]} ${alive}♦${jailed > 0 ? ` ⛓${jailed}` : ''}`;
    ctx.fillText(chip, xCursor + 14, 41);
    xCursor += ctx.measureText(chip).width + 30;
  }

  // Center: tasks progress per crew team (stacked compact)
  const crewTeams: TeamIndex[] = [];
  for (let t = 0; t < 3; t++) {
    if (state.teamAbilities[t] === 'crew' && state.teamCounts[t] > 0) crewTeams.push(t as TeamIndex);
  }
  if (crewTeams.length > 0) {
    const barW = 180, barH = 10;
    const cx = w / 2;
    crewTeams.forEach((t, i) => {
      const own = state.taskStations.filter(s => s.team === t);
      const done = own.filter(s => s.completed).length;
      const total = own.length || 1;
      const by = 6 + i * 14;
      ctx.fillStyle = 'rgba(40, 20, 10, 0.8)';
      ctx.fillRect(cx - barW / 2, by, barW, barH);
      ctx.fillStyle = TEAM_COLORS[t];
      ctx.fillRect(cx - barW / 2, by, barW * (done / total), barH);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - barW / 2, by, barW, barH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${TEAM_NAMES[t]} TASKS ${done}/${total}`, cx, by + 8);
    });
  }

  const time = Math.floor(state.timeElapsed / 1000);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cc8860';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`Time: ${time}s`, w - 15, 20);

  if (!human.alive) {
    ctx.fillStyle = '#ff3333';
    ctx.textAlign = 'right';
    ctx.fillText('☠ DEAD - Spectating', w - 15, 40);
  } else if (human.jailed) {
    const remaining = Math.max(0, Math.ceil((human.jailedUntil - performance.now()) / 1000));
    ctx.fillStyle = '#ffaa33';
    ctx.textAlign = 'right';
    ctx.fillText(`⛓ JAILED ${remaining}s`, w - 15, 40);
  }

  if (human.alive && !human.jailed) {
    ctx.textAlign = 'center';
    if (human.ability === 'kill' || human.ability === 'shooter') {
      const ready = human.killCooldown <= 0;
      ctx.fillStyle = ready ? '#ff4444' : '#664444';
      const lbl = human.ability === 'shooter' ? 'SHOOT' : 'KILL';
      ctx.fillText(ready ? `[SPACE] ${lbl}` : `${lbl}: ${Math.ceil(human.killCooldown / 1000)}s`, w / 2, 48);
    } else if (human.ability === 'jail') {
      const ready = human.arrestCooldown <= 0;
      ctx.fillStyle = ready ? '#3dba6f' : '#446644';
      ctx.fillText(ready ? '[SPACE] ARREST' : `Arrest: ${Math.ceil(human.arrestCooldown / 1000)}s`, w / 2, 48);
    } else {
      ctx.fillStyle = '#888';
      ctx.fillText('[SPACE/E] Do Your Team Tasks', w / 2, 48);
    }
  }

  // Power-up status chips (top-right under time)
  if (human.alive) {
    const chips: string[] = [];
    if ((human.shields ?? 0) > 0) chips.push(`🛡 ${human.shields}`);
    if ((human.speedBoostUntil ?? 0) > performance.now()) {
      const secs = Math.ceil(((human.speedBoostUntil ?? 0) - performance.now()) / 1000);
      chips.push(`⚡ ${secs}s`);
    }
    if ((human.builderCharges ?? 0) > 0) chips.push(`🛠 [B] BUILD x${human.builderCharges}`);
    if (chips.length > 0) {
      ctx.textAlign = 'right';
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#ffe46a';
      ctx.fillText(chips.join('   '), w - 15, 78);
    }
  }

  // Arrest notification banner (top center under HUD)
  if (state.recentArrest) {
    const age = performance.now() - state.recentArrest.time;
    if (age < 3000) {
      const alpha = age < 2500 ? 1 : 1 - (age - 2500) / 500;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(255,170,51,0.9)';
      ctx.fillRect(w / 2 - 180, 60, 360, 30);
      ctx.fillStyle = '#1a0a00';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`⛓ ${state.recentArrest.name} HAS BEEN ARRESTED`, w / 2, 80);
      ctx.restore();
    }
  }

  ctx.fillStyle = 'rgba(10, 5, 3, 0.7)';
  ctx.fillRect(0, h - 30, w, 30);
  ctx.fillStyle = '#886644';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('WASD/Arrows: Move | SPACE: Action', w / 2, h - 10);
}

/* ==================== JAIL ROOM ==================== */

function drawJailRoom(ctx: CanvasRenderingContext2D) {
  const r = JAIL_RECT;
  // Floor
  ctx.fillStyle = '#1c1410';
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Glow boundary
  ctx.save();
  ctx.shadowColor = '#ffaa33';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = '#ffaa33';
  ctx.lineWidth = 3;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();

  // Bars (vertical)
  ctx.strokeStyle = 'rgba(200,140,40,0.55)';
  ctx.lineWidth = 3;
  for (let bx = r.x + 20; bx < r.x + r.w; bx += 24) {
    ctx.beginPath();
    ctx.moveTo(bx, r.y);
    ctx.lineTo(bx, r.y + r.h);
    ctx.stroke();
  }

  // Label
  ctx.fillStyle = 'rgba(255,170,51,0.7)';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('JAIL', r.x + r.w / 2, r.y + 28);
}
