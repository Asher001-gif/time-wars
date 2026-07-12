// Football Stadium mode — self-contained game logic.
// Same map dimensions as Mars (MAP_WIDTH x MAP_HEIGHT). All Mars systems
// (tasks, kill, jail, fog, rooms) are disabled. Only movement, ball physics,
// goal scoring, and power-ups (speed / builder / power-shot) are active.

import {
  GameState, GameSettings, Player, MAP_WIDTH, MAP_HEIGHT,
  PLAYER_RADIUS, BALL_RADIUS, BALL_FRICTION, BALL_MAX_SPEED,
  BALL_HIT_FORCE, BALL_POWER_SHOT_MULT, FOOTBALL_FIELD,
  Powerup, PowerupKind, SPEED_BOOST_DURATION, SPEED_BOOST_MULT,
  POWERUP_PICKUP_RANGE, POWERUP_MAX_ON_MAP, POWERUP_SPAWN_INTERVAL_MIN,
  POWERUP_SPAWN_INTERVAL_MAX, BUILDER_BLOCK_LIFETIME, BUILDER_BLOCK_SIZE,
  Platform, FOOTBALL_SPEED_MULT,
} from './types';
import { pickRefereeMessage } from './refereeMessages';

// ============ REFEREE INTERVENTION ============
const REF_CORNER_TRIGGER_MS = 6000;
const REF_CUTSCENE_MS = 2000;
const REF_FREEZE_MS = 1000;
const REF_COOLDOWN_MS = 10000;

function playRefereeWhistle() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    // Two-tone whistle burst: high pitched, short, sharp.
    const now = ctx.currentTime;
    [0, 0.18].forEach((offset, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(2400 + i * 200, now + offset);
      o.frequency.linearRampToValueAtTime(2650 + i * 200, now + offset + 0.14);
      g.gain.setValueAtTime(0.0001, now + offset);
      g.gain.exponentialRampToValueAtTime(0.28, now + offset + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);
      // Slight vibrato via a tiny second osc
      const v = ctx.createOscillator();
      const vg = ctx.createGain();
      v.frequency.value = 22;
      vg.gain.value = 40;
      v.connect(vg); vg.connect(o.frequency);
      o.connect(g); g.connect(ctx.destination);
      o.start(now + offset); o.stop(now + offset + 0.18);
      v.start(now + offset); v.stop(now + offset + 0.18);
    });
  } catch {}
}


// Returns the centralized speed multiplier for the current football match.
function fbSpeedMult(state: GameState): number {
  const key = state.settings?.footballSpeed ?? 'medium';
  return FOOTBALL_SPEED_MULT[key] ?? 1.0;
}

// Players and bots may roam the entire stadium freely — no corner steering.


const FB_BOT_NAMES = [
  'Strikeer', 'Speedy', 'BoltFox', 'GoalGod', 'Comet', 'NovaKick',
  'WingLord', 'RoboFC', 'Pulse', 'Falcon', 'KaiBoot', 'Aero',
  'TurboJax', 'ZipZap', 'MegaBoot', 'IronToe', 'SwiftKik', 'BlazePass',
  'RocketRay', 'ThunderTap', 'GhostStrike', 'NeoKick', 'VoltVex', 'JetSpin',
  'CrimsonFox', 'NightOwl', 'StormPaw', 'PixelPro', 'OmegaJet', 'AstroBoot',
  'SonicSam', 'RogueArc', 'HyperHex', 'DashDuke', 'FlareFin', 'EchoKik',
  'TankZero', 'LunaPunt', 'KaiserK', 'ViperVolt', 'NebulaNyx', 'ZenoBlitz',
];

const TEAM_SIZE = 6;
const TOTAL_PLAYERS = TEAM_SIZE * 2;

export function fieldGoals() {
  const w = FOOTBALL_FIELD.goalWidth;
  return {
    top:    { x1: MAP_WIDTH / 2 - w / 2, x2: MAP_WIDTH / 2 + w / 2, y: 0 },
    bottom: { x1: MAP_WIDTH / 2 - w / 2, x2: MAP_WIDTH / 2 + w / 2, y: MAP_HEIGHT },
  };
}

function spawnPositions(): Array<{ x: number; y: number; team: 'red' | 'blue' }> {
  // Red defends TOP, attacks BOTTOM. Blue defends BOTTOM, attacks TOP.
  const cx = MAP_WIDTH / 2;
  const out: Array<{ x: number; y: number; team: 'red' | 'blue' }> = [];
  // Red — upper half
  const redRow1Y = 240, redRow2Y = 440;
  const redXs1 = [cx - 260, cx, cx + 260];
  const redXs2 = [cx - 140, cx + 140, cx];
  for (const x of redXs1) out.push({ x, y: redRow1Y, team: 'red' });
  for (let i = 0; i < 3; i++) out.push({ x: redXs2[i], y: redRow2Y, team: 'red' });
  // Blue — lower half
  const blueRow1Y = MAP_HEIGHT - 240, blueRow2Y = MAP_HEIGHT - 440;
  const blueXs1 = [cx - 260, cx, cx + 260];
  const blueXs2 = [cx - 140, cx + 140, cx];
  for (const x of blueXs1) out.push({ x, y: blueRow1Y, team: 'blue' });
  for (let i = 0; i < 3; i++) out.push({ x: blueXs2[i], y: blueRow2Y, team: 'blue' });
  return out;
}

export function createFootballGame(settings: GameSettings, playerName?: string): GameState {
  const positions = spawnPositions();
  const humanName = (playerName && playerName.trim()) || 'Astro';
  const totalRounds = settings.matchRounds ?? 5;

  // Shuffle bot names
  const shuffled = [...FB_BOT_NAMES].sort(() => Math.random() - 0.5);

  const players: Player[] = [];
  // Half of the bots per team are "enhanced" (aggressive attackers).
  // The rest stay near their spawn and defend their side.
  // Per-team enhanced indices: positions 0..5 are red, 6..11 are blue.
  const redBotIdx = [1, 2, 3, 4, 5];                          // index 0 is human
  const blueBotIdx = [6, 7, 8, 9, 10, 11];
  const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
  const redEnhanced = new Set(shuffle(redBotIdx).slice(0, 2));   // 2 of 5 red bots aggressive
  const blueEnhanced = new Set(shuffle(blueBotIdx).slice(0, 3)); // 3 of 6 blue bots aggressive
  for (let i = 0; i < TOTAL_PLAYERS; i++) {
    const pos = positions[i];
    const isEnhanced = i !== 0 && (redEnhanced.has(i) || blueEnhanced.has(i));
    players.push({
      id: i,
      x: pos.x, y: pos.y,
      role: 'crewmate',
      ability: 'crew',
      team: pos.team === 'red' ? 1 : 0, // re-use mars TeamIndex (1=red, 0=blue)
      alive: true,
      frozen: false,
      frozenUntil: 0,
      name: i === 0 ? humanName : shuffled[(i - 1) % shuffled.length],
      isHuman: i === 0,
      speed: 3.5,
      direction: { x: 0, y: 0 },
      aiTargetX: pos.x, aiTargetY: pos.y, // home/patrol anchor
      aiChangeTime: 0,
      killCooldown: 0,
      freezeCooldown: 0,
      doingTask: false,
      taskStationId: null,
      taskProgress: 0,
      jailed: false,
      jailedUntil: 0,
      arrestCooldown: 0,
      actionPlanAt: 0,
      actionPlanTargetId: null,
      actionSkipUntil: 0,
      doorBusyUntil: 0,
      doorBusyId: null,
      footballTeam: pos.team,
      powerShotCharges: 0,
      enhanced: isEnhanced,
    });
  }


  return {
    players,
    phase: 'playing',
    winner: null,
    timeElapsed: 0,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    taskStations: [],
    tasksCompleted: 0,
    totalTasks: 0,
    activeTask: null,
    projectiles: [],
    recentArrest: null,
    doors: [],
    jailDuration: 0,
    settings,
    teamAbilities: ['crew', 'crew', 'crew'],
    teamCounts: [TEAM_SIZE, TEAM_SIZE, 0],
    powerups: [],
    nextPowerupSpawnAt: 5000,
    nextPowerupId: 1,
    nextSyntheticDoorId: 1000,
    platforms: [],
    nextPlatformId: 1,
    mode: 'football',
    ball: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, vx: 0, vy: 0, radius: BALL_RADIUS, lastTouchTeam: null },
    score: { red: 0, blue: 0 },
    roundsRemaining: totalRounds,
    totalRounds,
    lastGoalAt: 0,
    goalFlash: null,
    roundStartedAt: performance.now(),
  };
}


export function resetForKickoff(state: GameState) {
  const positions = spawnPositions();
  for (let i = 0; i < state.players.length && i < positions.length; i++) {
    const p = state.players[i];
    const pos = positions[i];
    p.x = pos.x; p.y = pos.y;
    p.direction = { x: 0, y: 0 };
    p.speedBoostUntil = 0;
  }
  state.ball = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, vx: 0, vy: 0, radius: BALL_RADIUS, lastTouchTeam: null };
  state.platforms = [];
  state.lastGoalAt = performance.now();
  state.roundStartedAt = performance.now();
}


function clampField(x: number, y: number, r: number) {
  const m = FOOTBALL_FIELD.margin;
  return {
    x: Math.max(m + r, Math.min(MAP_WIDTH - m - r, x)),
    y: Math.max(m + r, Math.min(MAP_HEIGHT - m - r, y)),
  };
}

function reflectBallOnWalls(ball: { x: number; y: number; vx: number; vy: number; radius: number }) {
  const m = FOOTBALL_FIELD.margin;
  const goals = fieldGoals();
  const r = ball.radius;
  // Side walls: always reflect.
  if (ball.x < m + r) { ball.x = m + r; ball.vx = Math.abs(ball.vx) * 0.85; }
  if (ball.x > MAP_WIDTH - m - r) { ball.x = MAP_WIDTH - m - r; ball.vx = -Math.abs(ball.vx) * 0.85; }
  // Top/Bottom walls — only reflect outside the goal mouth.
  if (ball.y < m + r) {
    const inGoal = ball.x > goals.top.x1 && ball.x < goals.top.x2;
    if (!inGoal) { ball.y = m + r; ball.vy = Math.abs(ball.vy) * 0.85; }
  }
  if (ball.y > MAP_HEIGHT - m - r) {
    const inGoal = ball.x > goals.bottom.x1 && ball.x < goals.bottom.x2;
    if (!inGoal) { ball.y = MAP_HEIGHT - m - r; ball.vy = -Math.abs(ball.vy) * 0.85; }
  }
}

function reflectBallOnPlatforms(state: GameState) {
  if (!state.ball) return;
  const b = state.ball;
  for (const plat of state.platforms) {
    const hw = plat.w / 2, hh = plat.h / 2;
    // Find closest point on AABB
    const cx = Math.max(plat.cx - hw, Math.min(b.x, plat.cx + hw));
    const cy = Math.max(plat.cy - hh, Math.min(b.y, plat.cy + hh));
    const dx = b.x - cx, dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < b.radius && d > 0.0001) {
      const nx = dx / d, ny = dy / d;
      const push = b.radius - d;
      b.x += nx * push; b.y += ny * push;
      // Reflect velocity
      const vn = b.vx * nx + b.vy * ny;
      b.vx -= 2 * vn * nx;
      b.vy -= 2 * vn * ny;
      b.vx *= 0.8; b.vy *= 0.8;
    }
  }
}

function handlePlayerBallCollision(state: GameState, p: Player) {
  if (!state.ball) return;
  const b = state.ball;
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const d = Math.hypot(dx, dy);
  const sum = b.radius + PLAYER_RADIUS;
  if (d < sum && d > 0.0001) {
    const nx = dx / d, ny = dy / d;
    // Push ball out of player
    const overlap = sum - d;
    b.x += nx * overlap;
    b.y += ny * overlap;
    // Force = player velocity (from direction) + radial push
    const boost = (p.speedBoostUntil ?? 0) > performance.now() ? SPEED_BOOST_MULT : 1;
    const sMult = fbSpeedMult(state);
    const pvx = p.direction.x * p.speed * boost * sMult;
    const pvy = p.direction.y * p.speed * boost * sMult;
    let mult = BALL_HIT_FORCE;
    if ((p.powerShotCharges ?? 0) > 0) {
      mult = BALL_POWER_SHOT_MULT;
      p.powerShotCharges = (p.powerShotCharges ?? 0) - 1;
    }
    // Inject player movement into ball + radial nudge (scaled by speed setting)
    b.vx = pvx * mult + nx * 3.0 * sMult;
    b.vy = pvy * mult + ny * 3.0 * sMult;
    // Cap (scaled so faster matches allow faster balls)
    const capped = BALL_MAX_SPEED * sMult;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > capped) {
      b.vx = b.vx / sp * capped;
      b.vy = b.vy / sp * capped;
    }
    b.lastTouchTeam = p.footballTeam ?? null;
  }
}

function checkGoal(state: GameState): 'red' | 'blue' | null {
  if (!state.ball) return null;
  const goals = fieldGoals();
  const b = state.ball;
  // Top goal: ball crosses y=0 within goal x range -> blue scored (defends bottom)
  if (b.y - b.radius <= goals.top.y + 2 && b.x > goals.top.x1 && b.x < goals.top.x2) {
    return 'blue';
  }
  // Bottom goal: ball crosses y=MAP_HEIGHT within goal x range -> red scored
  if (b.y + b.radius >= goals.bottom.y - 2 && b.x > goals.bottom.x1 && b.x < goals.bottom.x2) {
    return 'red';
  }
  return null;
}

/* ============ POWER-UPS (football) ============ */
const FB_POWERUP_KINDS: PowerupKind[] = ['speed', 'speed', 'life', 'builder'];

function spawnFootballPowerup(state: GameState, now: number) {
  if (state.powerups.length >= POWERUP_MAX_ON_MAP) return;
  // Random point inside field
  const m = FOOTBALL_FIELD.margin + 40;
  for (let i = 0; i < 30; i++) {
    const x = m + Math.random() * (MAP_WIDTH - m * 2);
    const y = m + Math.random() * (MAP_HEIGHT - m * 2);
    // Avoid near ball or center spot
    if (state.ball && Math.hypot(state.ball.x - x, state.ball.y - y) < 80) continue;
    state.powerups.push({
      id: state.nextPowerupId++,
      kind: FB_POWERUP_KINDS[Math.floor(Math.random() * FB_POWERUP_KINDS.length)],
      x, y, spawnedAt: now,
    });
    return;
  }
}

function applyFootballPowerup(p: Player, kind: PowerupKind, now: number) {
  if (kind === 'speed') {
    p.speedBoostUntil = Math.max(p.speedBoostUntil ?? 0, now + SPEED_BOOST_DURATION);
  } else if (kind === 'life') {
    // In football: "Power-Shot" charge
    p.powerShotCharges = (p.powerShotCharges ?? 0) + 1;
  } else if (kind === 'builder') {
    p.builderCharges = (p.builderCharges ?? 0) + 1;
  }
}

function processFootballPickups(state: GameState, now: number) {
  if (state.powerups.length === 0) return;
  const remaining: Powerup[] = [];
  for (const pu of state.powerups) {
    let picked: Player | null = null;
    for (const p of state.players) {
      if (Math.hypot(p.x - pu.x, p.y - pu.y) < POWERUP_PICKUP_RANGE + PLAYER_RADIUS - 4) {
        picked = p; break;
      }
    }
    if (picked) applyFootballPowerup(picked, pu.kind, now);
    else remaining.push(pu);
  }
  state.powerups = remaining;
}

function cleanupPlatforms(state: GameState, now: number) {
  state.platforms = state.platforms.filter(pl => pl.expiresAt > now);
}

/* ============ FOOTBALL BOT AI ============ */
const STUCK_SAMPLE_INTERVAL = 1500;   // ms between position samples
const STUCK_DIST_THRESHOLD = 28;       // px; less than this in interval = stuck
const PILE_RADIUS = 70;                // px; neighbours within this count as a pile
const PILE_MIN_BOTS = 3;               // 3+ bots = pile
const BALL_STILL_SPEED = 0.6;          // |v| below this = ball idle
const CORNER_MARGIN = 220;             // px from a corner to count as "in a corner"

function isInCorner(x: number, y: number): boolean {
  const m = FOOTBALL_FIELD.margin;
  const nearLeft = x < m + CORNER_MARGIN;
  const nearRight = x > MAP_WIDTH - m - CORNER_MARGIN;
  const nearTop = y < m + CORNER_MARGIN;
  const nearBot = y > MAP_HEIGHT - m - CORNER_MARGIN;
  return (nearLeft || nearRight) && (nearTop || nearBot);
}

function pickEscapeTarget(p: Player, state: GameState): { x: number; y: number } {
  const m = FOOTBALL_FIELD.margin + 60;
  // Try a few random points away from current cluster and away from walls
  let best = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
  let bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const tx = m + Math.random() * (MAP_WIDTH - m * 2);
    const ty = m + Math.random() * (MAP_HEIGHT - m * 2);
    // Reward distance from self & from nearest teammate cluster
    let minTeammate = Infinity;
    for (const o of state.players) {
      if (o.id === p.id) continue;
      const d = Math.hypot(o.x - tx, o.y - ty);
      if (d < minTeammate) minTeammate = d;
    }
    const selfD = Math.hypot(p.x - tx, p.y - ty);
    // Prefer mid-field points (penalise corners)
    const cornerPenalty = isInCorner(tx, ty) ? -400 : 0;
    const score = minTeammate + selfD * 0.4 + cornerPenalty;
    if (score > bestScore) { bestScore = score; best = { x: tx, y: ty }; }
  }
  return best;
}

function footballAI(state: GameState, p: Player) {
  if (!state.ball) return;
  const ball = state.ball;
  const now = performance.now();

  // ---- Stuck detection sampling ----
  if (p.stuckSampleAt == null || now - p.stuckSampleAt > STUCK_SAMPLE_INTERVAL) {
    const movedSinceSample =
      p.stuckSampleX == null || p.stuckSampleY == null
        ? Infinity
        : Math.hypot(p.x - p.stuckSampleX, p.y - p.stuckSampleY);

    // Count nearby teammates/players within PILE_RADIUS
    let neighbours = 0;
    for (const o of state.players) {
      if (o.id === p.id) continue;
      if (Math.hypot(o.x - p.x, o.y - p.y) < PILE_RADIUS) neighbours++;
    }
    const ballSpeed = Math.hypot(ball.vx, ball.vy);
    const stuck =
      movedSinceSample < STUCK_DIST_THRESHOLD &&
      neighbours + 1 >= PILE_MIN_BOTS &&
      ballSpeed < BALL_STILL_SPEED &&
      isInCorner(p.x, p.y);

    if (stuck && (p.escapeUntil ?? 0) < now) {
      // Enter Escape Mode for 2-4s
      const dur = 2000 + Math.random() * 2000;
      p.escapeUntil = now + dur;
      const t = pickEscapeTarget(p, state);
      p.escapeTX = t.x; p.escapeTY = t.y;
    }
    p.stuckSampleAt = now;
    p.stuckSampleX = p.x;
    p.stuckSampleY = p.y;
  }

  // ---- Escape Mode active ----
  if ((p.escapeUntil ?? 0) > now) {
    // Cancel early if ball suddenly moves
    const ballSpeed = Math.hypot(ball.vx, ball.vy);
    if (ballSpeed > 2.2) {
      p.escapeUntil = 0;
    } else {
      aim(p, p.escapeTX ?? p.x, p.escapeTY ?? p.y);
      // Arrived? End early.
      if (Math.hypot((p.escapeTX ?? p.x) - p.x, (p.escapeTY ?? p.y) - p.y) < 24) {
        p.escapeUntil = 0;
      }
      return;
    }
  }


  const myTeam = p.footballTeam;

  const goals = fieldGoals();
  const ownGoalY = myTeam === 'red' ? goals.top.y : goals.bottom.y;
  const oppGoalY = myTeam === 'red' ? goals.bottom.y : goals.top.y;
  const oppGoalX = MAP_WIDTH / 2;
  const homeX = p.aiTargetX ?? p.x;
  const homeY = p.aiTargetY ?? p.y;
  const ballOnMySide = myTeam === 'red' ? ball.y < MAP_HEIGHT / 2 : ball.y > MAP_HEIGHT / 2;
  const distToBall = Math.hypot(ball.x - p.x, ball.y - p.y);

  // Power-up pickup range — enhanced bots roam further for them
  const puRange = p.enhanced ? 320 : 160;
  let nearestPU: Powerup | null = null;
  let puDist = Infinity;
  for (const pu of state.powerups) {
    const d = Math.hypot(pu.x - p.x, pu.y - p.y);
    if (d < puRange && d < puDist) { puDist = d; nearestPU = pu; }
  }
  if (nearestPU) {
    aim(p, nearestPU.x, nearestPU.y);
    return;
  }

  // Defensive intercept — any bot reacts when ball threatens own goal
  const ballNearOwnGoal = Math.abs(ball.y - ownGoalY) < 380;
  const ballMovesToOwnGoal = (myTeam === 'red' ? ball.vy < -0.3 : ball.vy > 0.3);
  if (ballNearOwnGoal && ballMovesToOwnGoal) {
    aim(p, ball.x, ball.y + (myTeam === 'red' ? -60 : 60));
    return;
  }

  if (p.enhanced) {
    // Enhanced bots: aggressive attackers. Always chase ball and shoot toward opp goal.
    const dirToOppX = oppGoalX - ball.x;
    const dirToOppY = oppGoalY - ball.y;
    const lenOpp = Math.hypot(dirToOppX, dirToOppY) || 1;
    const ux = dirToOppX / lenOpp, uy = dirToOppY / lenOpp;
    const offset = PLAYER_RADIUS + BALL_RADIUS - 4;
    aim(p, ball.x - ux * offset, ball.y - uy * offset);
    return;
  }

  // Normal bots: patrol/defend home position. Only engage if ball is on own side
  // AND reasonably close, so they don't all abandon defense.
  if (ballOnMySide && distToBall < 260) {
    const dirToOppX = oppGoalX - ball.x;
    const dirToOppY = oppGoalY - ball.y;
    const lenOpp = Math.hypot(dirToOppX, dirToOppY) || 1;
    const ux = dirToOppX / lenOpp, uy = dirToOppY / lenOpp;
    const offset = PLAYER_RADIUS + BALL_RADIUS - 4;
    aim(p, ball.x - ux * offset, ball.y - uy * offset);
    return;
  }

  // Otherwise drift back toward home with a small jitter for liveliness
  const jitter = Math.sin((performance.now() * 0.001) + p.id) * 24;
  const tx = homeX + jitter;
  const ty = homeY + (ballOnMySide ? (ball.y - homeY) * 0.15 : 0);
  const d = Math.hypot(tx - p.x, ty - p.y);
  if (d < 10) {
    p.direction = { x: 0, y: 0 };
  } else {
    aim(p, tx, ty);
  }
}


function aim(p: Player, tx: number, ty: number) {
  const dx = tx - p.x, dy = ty - p.y;
  const d = Math.hypot(dx, dy) || 1;
  p.direction = { x: dx / d, y: dy / d };
}

/* ============ MAIN UPDATE ============ */
export function updateFootball(state: GameState, dt: number, keys: Set<string>, now: number, isMobile = false): GameState {
  if (state.phase !== 'playing') return state;
  if (!state.ball || !state.score) return state;

  const human = state.players[0];
  // Human input
  if (human.alive) {
    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (dx || dy) {
      const d = Math.sqrt(dx * dx + dy * dy);
      human.direction = { x: dx / d, y: dy / d };
    } else if (!isMobile) {
      // Desktop: no movement keys held → stop immediately.
      human.direction = { x: 0, y: 0 };
    }
  }

  // ---- Referee intervention ----
  // Freeze movement + ball for the first REF_FREEZE_MS. Overlay stays visible
  // for REF_CUTSCENE_MS total. Then teleport ball to center + start cooldown.
  if (state.refereeActive) {
    const elapsed = now - (state.refereeStartedAt ?? now);
    if (elapsed >= REF_CUTSCENE_MS) {
      if (state.ball) { state.ball.x = MAP_WIDTH / 2; state.ball.y = MAP_HEIGHT / 2; state.ball.vx = 0; state.ball.vy = 0; }
      state.refereeActive = false;
      state.refereeMessage = null;
      state.refereeStartedAt = 0;
      state.ballCornerSince = 0;
      state.refereeCooldownUntil = now + REF_COOLDOWN_MS;
    } else if (elapsed < REF_FREEZE_MS) {
      // Hard-freeze physics for the first second — no AI, no movement.
      return { ...state, timeElapsed: state.timeElapsed + dt };
    }
    // else: 1s ≤ elapsed < 2s → overlay still shown but game may tick normally.
  }

  // Trigger check: ball parked in a corner for 6s+ (and off cooldown).
  {
    const b = state.ball;
    const inCorner = isInCorner(b.x, b.y);
    if (inCorner) {
      if (!state.ballCornerSince) state.ballCornerSince = now;
      const cornerDur = now - state.ballCornerSince;
      const cdOk = (state.refereeCooldownUntil ?? 0) <= now;
      if (cornerDur >= REF_CORNER_TRIGGER_MS && cdOk && !state.refereeActive) {
        state.refereeActive = true;
        state.refereeStartedAt = now;
        state.refereeMessage = pickRefereeMessage();
        playRefereeWhistle();
        return { ...state, timeElapsed: state.timeElapsed + dt };
      }
    } else {
      state.ballCornerSince = 0;
    }
  }

  // Brief freeze after a goal
  const frozen = (state.lastGoalAt ?? 0) > 0 && now - (state.lastGoalAt ?? 0) < 1200;

  // Bot AI — bots can roam the entire stadium freely.
  for (const p of state.players) {
    if (!p.isHuman) {
      footballAI(state, p);
    }
  }


  // Move players
  for (const p of state.players) {
    const boost = (p.speedBoostUntil ?? 0) > now ? SPEED_BOOST_MULT : 1;
    const sMult = fbSpeedMult(state);
    if (!frozen) {
      p.x += p.direction.x * p.speed * boost * sMult;
      p.y += p.direction.y * p.speed * boost * sMult;
    }
    if (Math.abs(p.direction.x) + Math.abs(p.direction.y) > 0.1) {
      p.facingX = p.direction.x;
      p.facingY = p.direction.y;
    }
    const c = clampField(p.x, p.y, PLAYER_RADIUS);
    p.x = c.x; p.y = c.y;
  }

  // Player-vs-player soft separation
  for (let i = 0; i < state.players.length; i++) {
    for (let j = i + 1; j < state.players.length; j++) {
      const a = state.players[i], b = state.players[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const minD = PLAYER_RADIUS * 2;
      if (d < minD && d > 0.0001) {
        const nx = dx / d, ny = dy / d;
        const push = (minD - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }

  // Ball-vs-platforms (block ball)
  reflectBallOnPlatforms(state);
  // Player-vs-ball collisions
  if (!frozen) {
    for (const p of state.players) handlePlayerBallCollision(state, p);
  }

  // Ball physics
  const b = state.ball;
  if (!frozen) {
    b.x += b.vx;
    b.y += b.vy;
    b.vx *= BALL_FRICTION;
    b.vy *= BALL_FRICTION;
    if (Math.abs(b.vx) < 0.02) b.vx = 0;
    if (Math.abs(b.vy) < 0.02) b.vy = 0;
  }
  reflectBallOnWalls(b);

  // Round-timer expiry — if no goal in time, count as a tie for the round.
  const roundTimeMs = (state.settings?.roundTime ?? 120) * 1000;
  const roundElapsed = now - (state.roundStartedAt ?? now);
  if (roundElapsed >= roundTimeMs) {
    state.roundsRemaining = (state.roundsRemaining ?? 1) - 1;
    state.goalFlash = { team: 'tie', time: now };
    if ((state.roundsRemaining ?? 0) <= 0) {
      const winColor = state.score.red > state.score.blue ? 1 : state.score.red < state.score.blue ? 0 : null;
      return { ...state, phase: 'gameover', winner: winColor as any, timeElapsed: state.timeElapsed + dt };
    }
    resetForKickoff(state);
  }

  // Goal check
  const scored = checkGoal(state);
  if (scored) {
    state.score[scored]++;
    state.roundsRemaining = (state.roundsRemaining ?? 1) - 1;
    state.goalFlash = { team: scored, time: now };
    playGoalSound();
    if ((state.roundsRemaining ?? 0) <= 0) {
      const winColor = state.score.red > state.score.blue ? 1 : state.score.red < state.score.blue ? 0 : null;
      return { ...state, phase: 'gameover', winner: winColor as any, timeElapsed: state.timeElapsed + dt };
    }
    resetForKickoff(state);
  }


  // Power-ups
  if (now >= state.nextPowerupSpawnAt) {
    spawnFootballPowerup(state, now);
    state.nextPowerupSpawnAt = now + POWERUP_SPAWN_INTERVAL_MIN +
      Math.random() * (POWERUP_SPAWN_INTERVAL_MAX - POWERUP_SPAWN_INTERVAL_MIN);
  }
  processFootballPickups(state, now);
  cleanupPlatforms(state, now);

  return { ...state, timeElapsed: state.timeElapsed + dt };
}

/** Place builder block for football mode — simpler than mars version. */
export function placeFootballBlock(state: GameState, p: Player, now: number): boolean {
  if ((p.builderCharges ?? 0) <= 0) return false;
  let fx = p.facingX ?? p.direction.x;
  let fy = p.facingY ?? p.direction.y;
  if (Math.hypot(fx, fy) < 0.05) { fx = 1; fy = 0; }
  if (Math.abs(fx) >= Math.abs(fy)) { fx = Math.sign(fx) || 1; fy = 0; }
  else { fx = 0; fy = Math.sign(fy) || 1; }
  const cx = p.x + fx * 40;
  const cy = p.y + fy * 40;
  const plat: Platform = {
    id: state.nextPlatformId++,
    cx, cy,
    w: BUILDER_BLOCK_SIZE, h: BUILDER_BLOCK_SIZE,
    frontX: fx, frontY: fy,
    placedAt: now,
    expiresAt: now + BUILDER_BLOCK_LIFETIME,
    placerId: p.id,
  };
  state.platforms.push(plat);
  p.builderCharges = (p.builderCharges ?? 0) - 1;
  return true;
}

function playGoalSound() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const notes = [523, 659, 784, 1046];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      g.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.18);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.12);
      o.stop(ctx.currentTime + i * 0.12 + 0.2);
    });
  } catch {}
}
