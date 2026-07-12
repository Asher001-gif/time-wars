import {
  Player, GameState, Role,
  PLAYER_RADIUS, KILL_CLOSE_RANGE, SHOOTER_RANGE,
  BULLET_SPEED, BULLET_HIT_RADIUS, FreezeProjectile,
  KILL_COOLDOWN, MAP_WIDTH, MAP_HEIGHT, TASK_RANGE, TOTAL_TASKS,
  ARREST_RANGE, ARREST_COOLDOWN, JAIL_DURATION, JAIL_RECT, JAIL_RELEASE,
  DOOR_INTERACT_RANGE, DOOR_USE_COOLDOWN,
  GameSettings, DEFAULT_SETTINGS, Ability, TeamIndex,
  Powerup, PowerupKind, Door, Platform,
  POWERUP_RADIUS, POWERUP_PICKUP_RANGE,
  POWERUP_SPAWN_INTERVAL_MIN, POWERUP_SPAWN_INTERVAL_MAX,
  POWERUP_MAX_ON_MAP, SPEED_BOOST_DURATION, SPEED_BOOST_MULT,
  BUILDER_BLOCK_LIFETIME, BUILDER_BLOCK_SIZE, BUILDER_PREV_POS_DELAY_MS,
} from './types';

import { createTaskStations } from './tasks';
import { resolveCollisions, hasLineOfSight, createDoors } from './collision';
import { getNavigationDirection, getRoomAt } from './navigation';

const BOT_NAMES = [
  'StarBoy', 'error504', 'top_dawg', 'LunarLord', 'FireBender',
  'AlphaApex', 'KnightRider', 'ViperStriker', 'itz Anya',
  'Naruto23', 'Goku', 'technoblade_never_dies',
  'NovaStrike', 'unknown753', 'Riya', 'Alam', 'Keshav chandra',
  'Iiiiiiiiiiiiii.......', 'ZeroPixel9', 'LunaUsagi12', 'RapidAimYT',
  'GrimReaper_Pro', 'Cornely3', 'Emma', 'Amelia',
  'MoonWalker', 'CipherX', 'Aarav', 'Diya', 'Kabir',
  'PixelHawk', 'ToxicMango', 'NebulaNomad', 'rohit_07', 'Meera',
  'SilverShade', 'StormZ', 'BlitzBoy', 'CosmicCat', 'noob_master69',
  'Ishaan', 'Tara', 'VortexVibe', 'Anaya', 'GhostInTheShell',
];

// Distinct name pool for "enhanced" smart bots — players don't know
// these are different, but the names are unique to keep variety.
const ENHANCED_BOT_NAMES = [
  'ShadowFox', 'NeonPulse', 'GhostByte', 'CryoWave', 'IronVeil',
  'EchoRift', 'BlazeKite', 'OrbitJinx', 'PhantomZed', 'MysticOwl',
  'SilentArc', 'TitanFlux', 'VoidStrider', 'NovaHex', 'CinderJay',
  'HollowKing', 'Drift_07', 'PulsarMx', 'KaiRogue', 'Zephyr_Q',
  'AstralDune', 'ObsidianRay', 'QuantumLynx', 'FrostNova', 'EmberPyx',
  'ChronoVex', 'RiftWalker', 'NyxBlade', 'SolarFang', 'GlacierKai',
];

// Global bot action throttle: max 3 bots may act simultaneously, with a
// 0.5-1s gap between successive bot action ticks.
const MAX_CONCURRENT_BOT_ACTIONS = 3;
let _lastBotActionAt = 0;
let _nextBotActionGap = 600;

const BOT_VISION: Record<Ability, number> = {
  crew: 220,
  jail: 180,
  kill: 130,
  shooter: SHOOTER_RANGE,
};

const ABILITY_SPEED: Record<Ability, number> = {
  crew: 3.5,
  jail: 3.5,
  kill: 3.5,
  shooter: 3.5,
};

export function rangeForAbility(ab: Ability): number {
  if (ab === 'shooter') return SHOOTER_RANGE;
  if (ab === 'kill') return KILL_CLOSE_RANGE;
  if (ab === 'jail') return ARREST_RANGE;
  return 0;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

const PATROL_POINTS = [
  { x: 800, y: 200 }, { x: 200, y: 625 }, { x: 1400, y: 625 },
  { x: 800, y: 900 }, { x: 400, y: 300 }, { x: 1200, y: 300 },
  { x: 400, y: 1000 }, { x: 1200, y: 1000 },
];

const ABILITY_TO_ROLE: Record<Ability, Role> = {
  crew: 'crewmate',
  kill: 'imposter',
  shooter: 'imposter',
  jail: 'protector',
};

const SPEED_MULT: Record<GameSettings['speed'], number> = {
  slow: 0.7, medium: 1.0, fast: 1.45,
};

function jailDurationFromSetting(opt: GameSettings['jailTimer']): number {
  if (opt === 'off') return 0;
  if (opt === 'infinity') return Number.MAX_SAFE_INTEGER;
  return opt * 1000;
}

export function createGame(settings: GameSettings = DEFAULT_SETTINGS, playerName?: string): GameState {
  // Build (team, ability) list from settings
  type Slot = { team: TeamIndex; ability: Ability };
  const slots: Slot[] = [];
  for (let i = 0; i < 3; i++) {
    const ab = settings.roleAbilities[i];
    for (let k = 0; k < settings.roleCounts[i]; k++) {
      slots.push({ team: i as TeamIndex, ability: ab });
    }
  }
  // Pad/trim to playerCount (safety) — pad with team 0 / crew
  while (slots.length < settings.playerCount) {
    slots.push({ team: 0, ability: settings.roleAbilities[0] });
  }
  slots.length = settings.playerCount;
  // Shuffle so the human (index 0) is randomly assigned
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  const speedMult = SPEED_MULT[settings.speed];

  // Pick 9 random unique names for bots (player 0 is human, named "You")
  const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const shuffledEnhancedNames = [...ENHANCED_BOT_NAMES].sort(() => Math.random() - 0.5);
  const humanName = (playerName && playerName.trim()) || 'Astro';

  // Pick which bot indices are "enhanced" (smart). Count = round(playerCount/2).
  // Human (index 0) is never enhanced.
  const enhancedCount = Math.round(settings.playerCount / 2);
  const botIndices = slots.map((_, i) => i).filter(i => i !== 0);
  for (let i = botIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [botIndices[i], botIndices[j]] = [botIndices[j], botIndices[i]];
  }
  const enhancedSet = new Set(botIndices.slice(0, enhancedCount));
  let enhNameIdx = 0;

  const players: Player[] = slots.map((slot, i) => ({
    id: i,
    x: 200 + Math.random() * (MAP_WIDTH - 400),
    y: 200 + Math.random() * (MAP_HEIGHT - 400),
    role: ABILITY_TO_ROLE[slot.ability],
    ability: slot.ability,
    team: slot.team,
    alive: true,
    frozen: false,
    frozenUntil: 0,
    name: i === 0
      ? humanName
      : enhancedSet.has(i)
        ? shuffledEnhancedNames[(enhNameIdx++) % shuffledEnhancedNames.length]
        : shuffledNames[(i - 1) % shuffledNames.length],
    isHuman: i === 0,
    speed: ABILITY_SPEED[slot.ability] * speedMult,
    direction: { x: 0, y: 0 },
    aiTargetX: MAP_WIDTH / 2,
    aiTargetY: MAP_HEIGHT / 2,
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
    enhanced: i !== 0 && enhancedSet.has(i),
    lockedTargetId: null,
  }));

  // Keep players out of jail at spawn
  for (const p of players) {
    if (p.x > JAIL_RECT.x - 40 && p.x < JAIL_RECT.x + JAIL_RECT.w + 40 &&
        p.y > JAIL_RECT.y - 40 && p.y < JAIL_RECT.y + JAIL_RECT.h + 40) {
      p.x = 600; p.y = 600;
    }
  }

  // Generate task stations per crew-faction
  const stations = [];
  let nextId = 0;
  for (let t = 0; t < 3; t++) {
    if (settings.roleAbilities[t] === 'crew' && settings.roleCounts[t] > 0) {
      const subset = createTaskStations(settings.tasks, t as TeamIndex, nextId);
      nextId += subset.length;
      stations.push(...subset);
    }
  }

  return {
    players,
    phase: 'playing',
    winner: null,
    timeElapsed: 0,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    taskStations: stations,
    tasksCompleted: 0,
    totalTasks: stations.length,
    activeTask: null,
    projectiles: [],
    recentArrest: null,
    doors: createDoors(),
    jailDuration: jailDurationFromSetting(settings.jailTimer),
    settings,
    teamAbilities: [...settings.roleAbilities] as [Ability, Ability, Ability],
    teamCounts: [...settings.roleCounts] as [number, number, number],
    powerups: [],
    nextPowerupSpawnAt: 4000, // first spawn ~4s into the game
    nextPowerupId: 1,
    nextSyntheticDoorId: 1000,
    platforms: [],
    nextPlatformId: 1,
  };
}


function getVisiblePlayers(player: Player, allPlayers: Player[], state: GameState): Player[] {
  const vision = BOT_VISION[player.ability];
  return allPlayers.filter(p =>
    p.id !== player.id && p.alive && !p.jailed &&
    dist(player, p) <= vision &&
    hasLineOfSight(player.x, player.y, p.x, p.y, state.doors)
  );
}

function jailWander(player: Player, now: number) {
  if (now > player.aiChangeTime) {
    player.aiTargetX = JAIL_RECT.x + 30 + Math.random() * (JAIL_RECT.w - 60);
    player.aiTargetY = JAIL_RECT.y + 30 + Math.random() * (JAIL_RECT.h - 60);
    player.aiChangeTime = now + 1500 + Math.random() * 1500;
  }
  const dx = player.aiTargetX - player.x;
  const dy = player.aiTargetY - player.y;
  const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  player.direction = { x: dx / d, y: dy / d };
}

function nearestVisiblePowerup(player: Player, state: GameState) {
  const vision = BOT_VISION[player.ability];
  let best: Powerup | null = null;
  let bestD = Infinity;
  for (const pu of state.powerups) {
    const d = Math.hypot(pu.x - player.x, pu.y - player.y);
    if (d <= vision && d < bestD &&
        hasLineOfSight(player.x, player.y, pu.x, pu.y, state.doors)) {
      bestD = d; best = pu;
    }
  }
  return best;
}

function updateAI(player: Player, allPlayers: Player[], state: GameState, now: number) {
  if (!player.alive || player.isHuman) return;
  if (player.jailed) { jailWander(player, now); return; }

  // PRIORITY 1: Power-up in vision -> grab it (highest priority).
  const pu = nearestVisiblePowerup(player, state);
  if (pu) {
    player.direction = getNavigationDirection(player.x, player.y, pu.x, pu.y);
    return;
  }

  // PRIORITY 1b: Builder block in inventory + enemy visible -> place it defensively
  if ((player.builderCharges ?? 0) > 0) {
    const enemies = allPlayers.filter(p =>
      p.id !== player.id && p.alive && !p.jailed && p.team !== player.team &&
      (p.ability === 'kill' || p.ability === 'shooter' || p.ability === 'jail') &&
      Math.hypot(p.x - player.x, p.y - player.y) < 180 &&
      hasLineOfSight(player.x, player.y, p.x, p.y, state.doors)
    );
    if (enemies.length > 0) {
      // Face the enemy, then place
      const e = enemies[0];
      const dx = e.x - player.x, dy = e.y - player.y;
      const d = Math.hypot(dx, dy) || 1;
      player.facingX = dx / d; player.facingY = dy / d;
      placeBuilderBlock(state, player, now);
      // Flee in opposite direction this tick
      player.direction = { x: -dx / d, y: -dy / d };
      return;
    }
  }

  const visible = getVisiblePlayers(player, allPlayers, state);
  if (player.ability === 'kill' || player.ability === 'shooter') {
    aiHunterBehavior(player, visible, now);
  } else if (player.ability === 'jail') {
    aiJailerBehavior(player, visible, allPlayers, now);
  } else {
    aiCrewBehavior(player, visible, state, now);
  }
}

const ROOM_CENTERS = [
  { x: 800, y: 190 }, { x: 215, y: 625 }, { x: 1385, y: 625 },
];

// All 5 search waypoints used when a hunter can't find any enemy:
// 3 main rooms + 2 east-side shelters from the ASTERON expansion.
const SEARCH_ROUTE = [
  { x: 800,  y: 190 },  // RESEARCH
  { x: 215,  y: 625 },  // ECOSYSTEM
  { x: 1385, y: 625 },  // RECOVER
  { x: 1730, y: 450 },  // SHELTER A (east expansion)
  { x: 1880, y: 870 },  // SHELTER B (east expansion)
];
const NO_ENEMY_SEARCH_DELAY = 4000; // 4s without seeing an enemy → start sweeping rooms

function aiHunterBehavior(player: Player, visible: Player[], now: number) {
  // Chase any enemy (different team)
  const enemies = visible.filter(p => p.team !== player.team);

  // Track last time we actually saw an enemy
  if (enemies.length > 0) player.lastEnemySeenAt = now;
  else if (player.lastEnemySeenAt == null) player.lastEnemySeenAt = now;

  // Enhanced hunters lock onto the first crewmate (or any enemy) they spot
  // and chase relentlessly until that target is dead or jailed.
  if (player.enhanced) {
    if (player.lockedTargetId != null) {
      const locked = visible.find(p => p.id === player.lockedTargetId);
      if (locked && locked.alive && !locked.jailed) {
        player.direction = getNavigationDirection(player.x, player.y, locked.x, locked.y);
        return;
      }
      player.lockedTargetId = null;
    }
    if (enemies.length > 0) {
      const crew = enemies.filter(p => p.ability === 'crew');
      const pool = crew.length > 0 ? crew : enemies;
      const target = pool.reduce((a, b) => dist(player, a) < dist(player, b) ? a : b);
      player.lockedTargetId = target.id;
      player.direction = getNavigationDirection(player.x, player.y, target.x, target.y);
      return;
    }
  }

  // Avoid nearby enemy jailers when there's no kill opportunity yet
  const nearbyJailer = enemies.find(p => p.ability === 'jail' && dist(player, p) < 160);
  if (nearbyJailer && Math.random() < 0.6) {
    const dir = getNavigationDirection(player.x, player.y,
      player.x + (player.x - nearbyJailer.x),
      player.y + (player.y - nearbyJailer.y));
    player.direction = dir;
    return;
  }
  if (enemies.length > 0) {
    const nearest = enemies.reduce((a, b) => dist(player, a) < dist(player, b) ? a : b);
    player.direction = getNavigationDirection(player.x, player.y, nearest.x, nearest.y);
    return;
  }

  // Room-sweep mode: been more than 15s without spotting an enemy.
  // Walk every search waypoint in order until something shows up.
  const idle = now - (player.lastEnemySeenAt ?? now);
  if (idle > NO_ENEMY_SEARCH_DELAY) {
    if (player.searchRouteIdx == null) {
      // Start at the waypoint nearest to current position
      let best = 0, bestD = Infinity;
      for (let i = 0; i < SEARCH_ROUTE.length; i++) {
        const d = dist(player, SEARCH_ROUTE[i]);
        if (d < bestD) { bestD = d; best = i; }
      }
      player.searchRouteIdx = best;
      player.aiTargetX = SEARCH_ROUTE[best].x;
      player.aiTargetY = SEARCH_ROUTE[best].y;
    }
    // Reached current waypoint → advance to the next room
    if (dist(player, { x: player.aiTargetX, y: player.aiTargetY }) < 50) {
      player.searchRouteIdx = (player.searchRouteIdx + 1) % SEARCH_ROUTE.length;
      const next = SEARCH_ROUTE[player.searchRouteIdx];
      player.aiTargetX = next.x + (Math.random() - 0.5) * 40;
      player.aiTargetY = next.y + (Math.random() - 0.5) * 40;
    }
    player.direction = getNavigationDirection(player.x, player.y, player.aiTargetX, player.aiTargetY);
    return;
  }

  // Default short-range patrol (rotates between nearby rooms)
  if (now > player.aiChangeTime || dist(player, { x: player.aiTargetX, y: player.aiTargetY }) < 40) {
    const currentRoom = getRoomAt(player.x, player.y);
    let bestRoom = ROOM_CENTERS[0];
    let bestDist = Infinity;
    for (const rc of ROOM_CENTERS) {
      const roomIdx = ROOM_CENTERS.indexOf(rc);
      if (roomIdx === currentRoom) continue;
      const d = dist(player, rc);
      if (d < bestDist) { bestDist = d; bestRoom = rc; }
    }
    player.aiTargetX = bestRoom.x + (Math.random() - 0.5) * 60;
    player.aiTargetY = bestRoom.y + (Math.random() - 0.5) * 60;
    player.aiChangeTime = now + 4000 + Math.random() * 2000;
    // (Don't clear searchRouteIdx here — it belongs to the sweep mode above
    // and clearing it caused patrol to reset every few seconds.)
  }
  player.direction = getNavigationDirection(player.x, player.y, player.aiTargetX, player.aiTargetY);
}


function aiJailerBehavior(player: Player, visible: Player[], allPlayers: Player[], now: number) {
  // Jailers patrol and chase enemy (different team) players to arrest.
  const otherJailer = allPlayers.find(p => p.id !== player.id && p.team === player.team && p.alive && !p.jailed);
  const suspects = visible.filter(p => p.team !== player.team);
  if (suspects.length > 0) {
    const target = suspects.reduce((a, b) => dist(player, a) < dist(player, b) ? a : b);
    player.direction = getNavigationDirection(player.x, player.y, target.x, target.y);
    return;
  }
  patrolAI(player, otherJailer, now);
}

function patrolAI(player: Player, otherProtector: Player | undefined, now: number) {
  if (now > player.aiChangeTime || dist(player, { x: player.aiTargetX, y: player.aiTargetY }) < 30) {
    let bestPoint = PATROL_POINTS[Math.floor(Math.random() * PATROL_POINTS.length)];
    if (otherProtector) {
      const sorted = [...PATROL_POINTS].sort((a, b) => dist(otherProtector, b) - dist(otherProtector, a));
      bestPoint = sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
    }
    player.aiTargetX = bestPoint.x + (Math.random() - 0.5) * 100;
    player.aiTargetY = bestPoint.y + (Math.random() - 0.5) * 100;
    player.aiChangeTime = now + 3000 + Math.random() * 2000;
  }
  player.direction = getNavigationDirection(player.x, player.y, player.aiTargetX, player.aiTargetY);
}

function aiCrewBehavior(player: Player, visible: Player[], state: GameState, now: number) {
  // Crew bots focus on their own team's tasks.
  if (player.doingTask) { player.direction = { x: 0, y: 0 }; return; }

  const vision = BOT_VISION[player.ability];

  // Enhanced crew actively avoid threats (enemy killers/shooters/jailers).
  if (player.enhanced) {
    const threats = visible.filter(p =>
      p.team !== player.team && (p.ability === 'kill' || p.ability === 'shooter' || p.ability === 'jail')
    );
    if (threats.length > 0) {
      const nearest = threats.reduce((a, b) => dist(player, a) < dist(player, b) ? a : b);
      const dir = getNavigationDirection(
        player.x, player.y,
        player.x + (player.x - nearest.x),
        player.y + (player.y - nearest.y),
      );
      player.direction = dir;
      return;
    }
  }

  const nearbyTasks = state.taskStations.filter(t => !t.completed && t.team === player.team && dist(player, t) <= vision);
  if (nearbyTasks.length > 0) {
    const closest = nearbyTasks.reduce((a, b) => dist(player, a) < dist(player, b) ? a : b);
    player.direction = getNavigationDirection(player.x, player.y, closest.x, closest.y);
    return;
  }
  // If no nearby tasks, head to any uncompleted own-team task
  const ownTasks = state.taskStations.filter(t => !t.completed && t.team === player.team);
  if (ownTasks.length > 0) {
    const closest = ownTasks.reduce((a, b) => dist(player, a) < dist(player, b) ? a : b);
    player.aiTargetX = closest.x;
    player.aiTargetY = closest.y;
    player.direction = getNavigationDirection(player.x, player.y, closest.x, closest.y);
    return;
  }
  wanderAI(player, now);
}

function wanderAI(player: Player, now: number) {
  if (now > player.aiChangeTime || dist(player, { x: player.aiTargetX, y: player.aiTargetY }) < 30) {
    player.aiTargetX = 100 + Math.random() * (MAP_WIDTH - 200);
    player.aiTargetY = 100 + Math.random() * (MAP_HEIGHT - 200);
    player.aiChangeTime = now + 2000 + Math.random() * 3000;
  }
  player.direction = getNavigationDirection(player.x, player.y, player.aiTargetX, player.aiTargetY);
}

let _arrestEventId = 0;
function arrestPlayer(state: GameState, target: Player, now: number) {
  target.jailed = true;
  target.jailedUntil = now + state.jailDuration;
  target.doingTask = false;
  target.taskStationId = null;
  target.taskProgress = 0;
  target.frozen = false;
  target.x = JAIL_RECT.x + JAIL_RECT.w / 2 + (Math.random() - 0.5) * 60;
  target.y = JAIL_RECT.y + JAIL_RECT.h / 2 + (Math.random() - 0.5) * 60;
  target.direction = { x: 0, y: 0 };
  state.recentArrest = { name: target.name, time: now, eventId: ++_arrestEventId };
}

function releasePlayer(target: Player) {
  target.jailed = false;
  target.jailedUntil = 0;
  target.x = JAIL_RELEASE.x + (Math.random() - 0.5) * 80;
  target.y = JAIL_RELEASE.y + (Math.random() - 0.5) * 80;
}

/** Attack interception via shields. Returns true if attack was absorbed. */
function applyAttack(target: Player): boolean {
  if ((target.shields ?? 0) > 0) {
    target.shields = (target.shields ?? 0) - 1;
    return true;
  }
  target.alive = false;
  target.doingTask = false;
  target.taskStationId = null;
  return false;
}

/* ===================== POWER-UPS ===================== */
const POWERUP_KINDS: PowerupKind[] = [
  'speed', 'speed', 'speed', 'life', 'life', 'builder', // builder is rare
];

function pickRandomPowerupKind(): PowerupKind {
  return POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
}

function isPointInsideJail(x: number, y: number, pad = 30): boolean {
  return x > JAIL_RECT.x - pad && x < JAIL_RECT.x + JAIL_RECT.w + pad &&
         y > JAIL_RECT.y - pad && y < JAIL_RECT.y + JAIL_RECT.h + pad;
}

function findFreeSpawnPoint(doors: Door[]): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = 80 + Math.random() * (MAP_WIDTH - 160);
    const y = 80 + Math.random() * (MAP_HEIGHT - 160);
    if (isPointInsideJail(x, y, 40)) continue;
    // Reject if collision resolution would move the point (i.e. inside wall/rock/door)
    const r = resolveCollisions(x, y, doors);
    if (Math.hypot(r.x - x, r.y - y) > 0.5) continue;
    return { x, y };
  }
  return null;
}

function spawnPowerup(state: GameState, now: number) {
  if (state.powerups.length >= POWERUP_MAX_ON_MAP) return;
  const pt = findFreeSpawnPoint(state.doors);
  if (!pt) return;
  state.powerups.push({
    id: state.nextPowerupId++,
    kind: pickRandomPowerupKind(),
    x: pt.x, y: pt.y,
    spawnedAt: now,
  });
}

function applyPowerup(p: Player, kind: PowerupKind, now: number) {
  if (kind === 'speed') {
    p.speedBoostUntil = Math.max(p.speedBoostUntil ?? 0, now + SPEED_BOOST_DURATION);
  } else if (kind === 'life') {
    p.shields = (p.shields ?? 0) + 1;
  } else if (kind === 'builder') {
    p.builderCharges = (p.builderCharges ?? 0) + 1;
  }
}

function processPowerupPickups(state: GameState, now: number) {
  if (state.powerups.length === 0) return;
  const remaining: Powerup[] = [];
  for (const pu of state.powerups) {
    let pickedBy: Player | null = null;
    for (const p of state.players) {
      if (!p.alive || p.jailed) continue;
      if (Math.hypot(p.x - pu.x, p.y - pu.y) < POWERUP_PICKUP_RANGE + PLAYER_RADIUS - 6) {
        pickedBy = p;
        break;
      }
    }
    if (pickedBy) applyPowerup(pickedBy, pu.kind, now);
    else remaining.push(pu);
  }
  state.powerups = remaining;
}

function cleanupSyntheticDoors(state: GameState, now: number) {
  state.doors = state.doors.filter(d => !d.synthetic || (d.expiresAt ?? 0) > now);
}

/* ===================== PLATFORMS (Builder Blocks) ===================== */

function recordPosHistory(p: Player, now: number) {
  if (!p.posHistory) p.posHistory = [];
  p.posHistory.push({ x: p.x, y: p.y, t: now });
  // Keep ~1.5s of history
  const cutoff = now - 1500;
  while (p.posHistory.length > 0 && p.posHistory[0].t < cutoff) {
    p.posHistory.shift();
  }
}

function getPreviousPos(p: Player, now: number): { x: number; y: number } {
  const want = now - BUILDER_PREV_POS_DELAY_MS;
  if (!p.posHistory || p.posHistory.length === 0) return { x: p.x, y: p.y };
  // Find sample closest to `want`
  let best = p.posHistory[0];
  let bestDiff = Math.abs(best.t - want);
  for (const s of p.posHistory) {
    const d = Math.abs(s.t - want);
    if (d < bestDiff) { best = s; bestDiff = d; }
  }
  return { x: best.x, y: best.y };
}

/** Place a Builder Block PLATFORM at the player's previous position. */
export function placeBuilderBlock(state: GameState, p: Player, now: number): boolean {
  if ((p.builderCharges ?? 0) <= 0) return false;
  if (state.mode === 'football') return placeFootballBlock(state, p, now);
  if (p.elevatedPlatformId != null) return false; // can't place while standing on one

  // Spawn at the player's PREVIOUS position (~0.5s ago) — never current/mouse.
  const prev = getPreviousPos(p, now);

  // Validate that the previous position is sane (not stuck inside walls/rocks).
  const safe = resolveCollisions(prev.x, prev.y, state.doors);
  const cx = safe.x;
  const cy = safe.y;

  // Facing direction defines the FRONT face (faces away from the placer's back,
  // i.e. in the direction the placer is currently looking).
  let fx = p.facingX ?? p.direction.x;
  let fy = p.facingY ?? p.direction.y;
  if (Math.hypot(fx, fy) < 0.05) { fx = 1; fy = 0; }
  // Snap to dominant cardinal axis so the front face aligns to one square edge.
  if (Math.abs(fx) >= Math.abs(fy)) { fx = Math.sign(fx) || 1; fy = 0; }
  else { fx = 0; fy = Math.sign(fy) || 1; }

  // Prevent stacking platforms on top of each other.
  for (const existing of state.platforms) {
    if (Math.hypot(existing.cx - cx, existing.cy - cy) < BUILDER_BLOCK_SIZE) return false;
  }

  const plat: Platform = {
    id: state.nextPlatformId++,
    cx, cy,
    w: BUILDER_BLOCK_SIZE,
    h: BUILDER_BLOCK_SIZE,
    frontX: fx,
    frontY: fy,
    placedAt: now,
    expiresAt: now + BUILDER_BLOCK_LIFETIME,
    placerId: p.id,
  };
  state.platforms.push(plat);
  p.builderCharges = (p.builderCharges ?? 0) - 1;
  return true;
}

function pointToSegDistInline(
  px: number, py: number, x1: number, y1: number, x2: number, y2: number
): { dist: number; nx: number; ny: number } {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cxp = x1 + t * dx, cyp = y1 + t * dy;
  const nx = px - cxp, ny = py - cyp;
  const d = Math.hypot(nx, ny);
  return { dist: d, nx: d > 0 ? nx / d : 0, ny: d > 0 ? ny / d : 0 };
}

function platformFrontEdge(plat: Platform) {
  const hw = plat.w / 2, hh = plat.h / 2;
  if (Math.abs(plat.frontX) >= Math.abs(plat.frontY)) {
    const sx = Math.sign(plat.frontX) || 1;
    const x = plat.cx + sx * hw;
    return { x1: x, y1: plat.cy - hh, x2: x, y2: plat.cy + hh };
  } else {
    const sy = Math.sign(plat.frontY) || 1;
    const y = plat.cy + sy * hh;
    return { x1: plat.cx - hw, y1: y, x2: plat.cx + hw, y2: y };
  }
}

/** Apply platform interaction: ground players climb from non-front sides, get
 * blocked by the front face; elevated players move freely on top and drop off
 * when leaving the AABB. */
function resolvePlatforms(p: Player, state: GameState) {
  for (const plat of state.platforms) {
    const hw = plat.w / 2, hh = plat.h / 2;
    const insideAABB =
      p.x > plat.cx - hw && p.x < plat.cx + hw &&
      p.y > plat.cy - hh && p.y < plat.cy + hh;

    if (p.elevatedPlatformId === plat.id) {
      // Drop off when player center leaves the platform footprint.
      if (!insideAABB) p.elevatedPlatformId = null;
      continue;
    }

    // Ground player. Check front face collision first.
    const fe = platformFrontEdge(plat);
    const { dist, nx, ny } = pointToSegDistInline(p.x, p.y, fe.x1, fe.y1, fe.x2, fe.y2);

    // Determine which side of the platform the player is on.
    const toPx = p.x - plat.cx;
    const toPy = p.y - plat.cy;
    const frontDot = toPx * plat.frontX + toPy * plat.frontY;

    if (frontDot > 0 && dist < PLAYER_RADIUS) {
      // Approaching from the FRONT — solid collision, push back.
      const push = PLAYER_RADIUS - dist;
      p.x += nx * push;
      p.y += ny * push;
      continue;
    }

    // Approaching from top / back / sides — climb onto the platform when the
    // player's center crosses into the footprint.
    if (insideAABB) {
      p.elevatedPlatformId = plat.id;
    }
  }
}

function cleanupPlatforms(state: GameState, now: number) {
  const aliveIds = new Set<number>();
  state.platforms = state.platforms.filter(pl => {
    const keep = pl.expiresAt > now;
    if (keep) aliveIds.add(pl.id);
    return keep;
  });
  // Drop any players whose platform no longer exists.
  for (const pl of state.players) {
    if (pl.elevatedPlatformId != null && !aliveIds.has(pl.elevatedPlatformId)) {
      pl.elevatedPlatformId = null;
    }
  }
}

function sameElevation(a: Player, b: Player): boolean {
  return (a.elevatedPlatformId ?? null) === (b.elevatedPlatformId ?? null);
}



/** Spawn a bullet projectile aimed at `target`'s current position. */
function fireBullet(state: GameState, shooter: Player, target: Player, now: number) {
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const len = Math.hypot(dx, dy) || 1;
  const dirX = dx / len;
  const dirY = dy / len;
  const maxDistance = SHOOTER_RANGE + 40;
  const proj: FreezeProjectile = {
    x: shooter.x + dirX * (PLAYER_RADIUS + 2),
    y: shooter.y + dirY * (PLAYER_RADIUS + 2),
    targetX: shooter.x + dirX * maxDistance,
    targetY: shooter.y + dirY * maxDistance,
    speed: BULLET_SPEED,
    startTime: now,
    duration: maxDistance / BULLET_SPEED + 50,
    kind: 'bullet',
    ownerId: shooter.id,
    ownerTeam: shooter.team,
    dirX, dirY,
    maxDistance,
    hit: false,
  };
  state.projectiles.push(proj);
}

/** Advance bullets, detect wall blocks and player hits. */
function updateBullets(state: GameState, now: number) {
  for (const proj of state.projectiles) {
    if (proj.kind !== 'bullet' || proj.hit) continue;
    const elapsed = now - proj.startTime;
    const traveled = Math.min(elapsed * (proj.speed || BULLET_SPEED), proj.maxDistance || SHOOTER_RANGE);
    const cx = proj.x + (proj.dirX || 0) * traveled;
    const cy = proj.y + (proj.dirY || 0) * traveled;

    // Wall block: if line from origin to current position no longer has LOS,
    // bullet is absorbed by a wall/closed door.
    if (!hasLineOfSight(proj.x, proj.y, cx, cy, state.doors)) {
      proj.hit = true;
      continue;
    }

    // Player hit: any alive enemy of owner within hit radius.
    for (const p of state.players) {
      if (!p.alive || p.jailed) continue;
      if (p.id === proj.ownerId) continue;
      if (p.team === proj.ownerTeam) continue;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < BULLET_HIT_RADIUS + PLAYER_RADIUS - 8) {
        applyAttack(p);
        proj.hit = true;
        break;
      }
    }
  }
  // Remove bullets that have hit or reached end of life.
  state.projectiles = state.projectiles.filter(p => {
    if (p.kind === 'bullet') {
      if (p.hit) return false;
      return now - p.startTime < p.duration;
    }
    return now - p.startTime < p.duration;
  });
}

function performAIActions(player: Player, allPlayers: Player[], state: GameState, now: number) {
  if (!player.alive || player.isHuman || player.jailed) return;

  const visible = getVisiblePlayers(player, allPlayers, state);

  if (now < player.actionSkipUntil) {
    // skip planning this tick but still tick crew task logic below
  } else if ((player.ability === 'kill' || player.ability === 'shooter') && player.killCooldown <= 0) {
    const range = rangeForAbility(player.ability);
    // Melee kill requires same elevation; shooter ignores elevation.
    const candidates = visible.filter(p =>
      p.team !== player.team && dist(player, p) < range &&
      hasLineOfSight(player.x, player.y, p.x, p.y, state.doors) &&
      (player.ability === 'shooter' || sameElevation(player, p))
    );

    if (candidates.length > 0) {
      const target = candidates[0];
      // Be cautious if an enemy jailer is nearby
      const jailerNear = allPlayers.some(p =>
        p.alive && !p.jailed && p.team !== player.team && p.ability === 'jail' &&
        dist(player, p) < 200 && hasLineOfSight(player.x, player.y, p.x, p.y, state.doors)
      );
      if (!jailerNear || player.enhanced) {
        if (player.actionPlanTargetId !== target.id) {
          player.actionPlanTargetId = target.id;
          // Enhanced hunters commit faster (0.4-1.2s) — relentless pursuit.
          player.actionPlanAt = player.enhanced
            ? now + 400 + Math.random() * 800
            : now + 1000 + Math.random() * 2000;
        } else if (now >= player.actionPlanAt) {
          if (player.ability === 'shooter') {
            fireBullet(state, player, target, now);
          } else {
            applyAttack(target);
          }
          player.killCooldown = KILL_COOLDOWN;
          player.actionPlanTargetId = null;
          if (player.enhanced && player.lockedTargetId === target.id) {
            player.lockedTargetId = null;
          }
          if (Math.random() < 0.35) player.actionSkipUntil = now + 2500;
        }
      } else {
        player.actionPlanTargetId = null;
      }
    } else {
      player.actionPlanTargetId = null;
    }
  }

  if (player.ability === 'jail' && player.arrestCooldown <= 0 && now >= player.actionSkipUntil) {
    if (state.jailDuration <= 0) return;
    const candidates = visible.filter(p =>
      !p.jailed && p.team !== player.team && dist(player, p) < ARREST_RANGE &&
      hasLineOfSight(player.x, player.y, p.x, p.y, state.doors) &&
      sameElevation(player, p)
    );

    if (candidates.length > 0) {
      // Decision: stronger urge if a kill happened recently nearby
      const target = candidates.reduce((a, b) => dist(player, a) < dist(player, b) ? a : b);
      const sawKill = allPlayers.some(p =>
        !p.alive && dist(player, p) < 250 && hasLineOfSight(player.x, player.y, p.x, p.y, state.doors)
      );
      const chance = sawKill ? 0.9 : 0.6;
      if (player.actionPlanTargetId !== target.id) {
        player.actionPlanTargetId = target.id;
        // 1-2s ponder
        player.actionPlanAt = now + 1000 + Math.random() * 1000;
      } else if (now >= player.actionPlanAt) {
        if (Math.random() < chance) {
          arrestPlayer(state, target, now);
          player.arrestCooldown = ARREST_COOLDOWN;
        } else {
          player.actionSkipUntil = now + 2000 + Math.random() * 1500;
        }
        player.actionPlanTargetId = null;
      }
    } else {
      player.actionPlanTargetId = null;
    }
  }

  if (player.ability === 'crew' && !player.doingTask) {
    const incompleteTasks = state.taskStations.filter(t => !t.completed && t.team === player.team);
    const nearTask = incompleteTasks.find(t => dist(player, t) < TASK_RANGE);
    if (nearTask) {
      player.doingTask = true;
      player.taskStationId = nearTask.id;
      player.taskProgress = 0;
    }
  }

  // Task progress is ticked per-frame in updateGame (not throttled),
  // so bot crewmates reliably finish a task in ~5 seconds.
}

import { updateFootball as _updateFootball, placeFootballBlock } from './football';
export { createFootballGame } from './football';

export function updateGame(state: GameState, dt: number, keys: Set<string>, now: number, isMobile = false): GameState {
  if (state.mode === 'football') return _updateFootball(state, dt, keys, now, isMobile);
  if (state.phase !== 'playing') return state;

  const human = state.players[0];

  if (human.alive && !human.doingTask) {
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
  } else if (human.doingTask) {
    human.direction = { x: 0, y: 0 };
  }

  for (const p of state.players) {
    if (!p.alive) continue;

    if (p.jailed && now >= p.jailedUntil) releasePlayer(p);

    if (p.killCooldown > 0) p.killCooldown -= dt;
    if (p.arrestCooldown > 0) p.arrestCooldown -= dt;

    // Bot crewmates progress their current task every frame (5s to complete)
    if (!p.isHuman && p.alive && !p.jailed && p.role === 'crewmate' &&
        p.doingTask && p.taskStationId !== null) {
      p.taskProgress += dt / 5000;
      if (p.taskProgress >= 1) {
        const station = state.taskStations.find(t => t.id === p.taskStationId);
        if (station && !station.completed && station.team === p.team) {
          station.completed = true;
          state.tasksCompleted++;
        }
        p.doingTask = false;
        p.taskStationId = null;
        p.taskProgress = 0;
      }
    }

    // Bot busy interacting with a door (3s)
    if (!p.isHuman && p.doorBusyUntil > 0) {
      if (now >= p.doorBusyUntil) {
        if (p.doorBusyId !== null) {
          const door = state.doors.find(d => d.id === p.doorBusyId);
          if (door && now - door.lastUsedAt >= 0) {
            door.open = !door.open;
            door.lastUsedAt = now;
          }
        }
        p.doorBusyUntil = 0;
        p.doorBusyId = null;
      } else {
        p.direction = { x: 0, y: 0 };
      }
    }

    if (!p.isHuman && p.doorBusyUntil === 0) {
      // Check if there's a closed door right in front to interact with
      if (p.ability !== 'jail') {
        if (p.enhanced && p.ability === 'crew') {
          // Enhanced crew: don't toggle doors casually. Only close a nearby
          // OPEN door if an enemy threat is close by.
          const threatNear = state.players.some(other =>
            other.id !== p.id && other.alive && !other.jailed &&
            other.team !== p.team &&
            (other.ability === 'kill' || other.ability === 'shooter' || other.ability === 'jail') &&
            Math.hypot(other.x - p.x, other.y - p.y) < 260
          );
          if (threatNear) {
            const openDoor = state.doors.find(d =>
              d.open && !d.synthetic && Math.hypot(d.cx - p.x, d.cy - p.y) < 80
            );
            if (openDoor) {
              p.doorBusyUntil = now + 3000;
              p.doorBusyId = openDoor.id;
              p.direction = { x: 0, y: 0 };
            }
          }
        } else {
          const door = state.doors.find(d =>
            !d.open && !d.synthetic && Math.hypot(d.cx - p.x, d.cy - p.y) < 50
          );
          if (door) {
            // Door coordination: skip if another bot is already opening this door.
            const alreadyBusy = state.players.some(other =>
              other.id !== p.id && other.doorBusyId === door.id && other.doorBusyUntil > 0
            );
            if (!alreadyBusy) {
              p.doorBusyUntil = now + 3000;
              p.doorBusyId = door.id;
              p.direction = { x: 0, y: 0 };
            }
          }
        }
      }
    }

    if (!p.isHuman && p.doorBusyUntil === 0) {
      updateAI(p, state.players, state, now);
    }

    const boost = (p.speedBoostUntil ?? 0) > now ? SPEED_BOOST_MULT : 1;
    p.x += p.direction.x * p.speed * boost;
    p.y += p.direction.y * p.speed * boost;
    if (Math.abs(p.direction.x) + Math.abs(p.direction.y) > 0.1) {
      p.facingX = p.direction.x;
      p.facingY = p.direction.y;
    }

    if (p.jailed) {
      p.x = Math.max(JAIL_RECT.x + PLAYER_RADIUS, Math.min(JAIL_RECT.x + JAIL_RECT.w - PLAYER_RADIUS, p.x));
      p.y = Math.max(JAIL_RECT.y + PLAYER_RADIUS, Math.min(JAIL_RECT.y + JAIL_RECT.h - PLAYER_RADIUS, p.y));
    } else {
      p.x = Math.max(PLAYER_RADIUS, Math.min(state.mapWidth - PLAYER_RADIUS, p.x));
      p.y = Math.max(PLAYER_RADIUS, Math.min(state.mapHeight - PLAYER_RADIUS, p.y));
      const resolved = resolveCollisions(p.x, p.y, state.doors);
      p.x = resolved.x;
      p.y = resolved.y;
      // Builder-block platforms: climb / front-face collision / drop off
      resolvePlatforms(p, state);
    }
    // Track recent positions for builder-block "previous position" spawning.
    recordPosHistory(p, now);
  }


  // Throttled bot actions: at most 3 bots act per "tick window",
  // and tick windows are spaced 0.5-1s apart.
  if (now - _lastBotActionAt >= _nextBotActionGap) {
    const candidates = state.players.filter(p =>
      p.alive && !p.isHuman && !p.jailed && p.doorBusyUntil === 0
    );
    // Shuffle for fairness
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const acting = candidates.slice(0, MAX_CONCURRENT_BOT_ACTIONS);
    for (const p of acting) {
      performAIActions(p, state.players, state, now);
    }
    _lastBotActionAt = now;
    _nextBotActionGap = 500 + Math.random() * 500;
  }

  updateBullets(state, now);

  // Power-ups: spawn + pickup + cleanup synthetic walls
  if (now >= state.nextPowerupSpawnAt) {
    spawnPowerup(state, now);
    state.nextPowerupSpawnAt = now +
      POWERUP_SPAWN_INTERVAL_MIN +
      Math.random() * (POWERUP_SPAWN_INTERVAL_MAX - POWERUP_SPAWN_INTERVAL_MIN);
  }
  processPowerupPickups(state, now);
  cleanupSyntheticDoors(state, now);
  cleanupPlatforms(state, now);


  // Dynamic per-team win conditions
  const winner = computeWinner(state);
  if (winner !== null) {
    return { ...state, phase: 'gameover', winner, timeElapsed: state.timeElapsed + dt };
  }

  // If no living jailer remains on any team, free all prisoners (no one to guard them)
  const anyJailerAlive = state.players.some(p => p.ability === 'jail' && p.alive && !p.jailed);
  if (!anyJailerAlive) {
    for (const p of state.players) {
      if (p.jailed && p.alive) releasePlayer(p);
    }
  }

  return { ...state, timeElapsed: state.timeElapsed + dt };
}

function computeWinner(state: GameState): TeamIndex | null {
  const activeTeams: TeamIndex[] = [];
  for (let i = 0; i < 3; i++) {
    if (state.teamCounts[i] > 0) activeTeams.push(i as TeamIndex);
  }
  // If only one team has any presence (alive or jailed), it wins by default
  const teamsWithStanding = activeTeams.filter(t =>
    state.players.some(p => p.team === t && (p.alive || p.jailed))
  );
  if (activeTeams.length > 1 && teamsWithStanding.length === 1) {
    return teamsWithStanding[0];
  }
  for (const t of activeTeams) {
    const ab = state.teamAbilities[t];
    if (ab === 'crew') {
      const own = state.taskStations.filter(s => s.team === t);
      if (own.length > 0 && own.every(s => s.completed)) return t;
    } else if (ab === 'kill' || ab === 'shooter') {
      const enemiesAlive = state.players.some(p => p.team !== t && p.alive);
      if (!enemiesAlive) return t;
    } else if (ab === 'jail') {
      // Win when every enemy is either dead or currently jailed
      const enemiesFree = state.players.some(p => p.team !== t && p.alive && !p.jailed);
      if (!enemiesFree) return t;
    }
  }
  return null;
}

export function humanKill(state: GameState, now: number): boolean {
  const human = state.players[0];
  if (!human.alive || human.jailed || human.killCooldown > 0) return false;
  if (human.ability !== 'kill' && human.ability !== 'shooter') return false;
  const range = rangeForAbility(human.ability);
  const targets = state.players.filter(p =>
    p.alive && p.id !== 0 && !p.jailed && p.team !== human.team &&
    dist(human, p) < range &&
    hasLineOfSight(human.x, human.y, p.x, p.y, state.doors) &&
    (human.ability === 'shooter' || sameElevation(human, p))
  );

  if (targets.length > 0) {
    const target = targets.reduce((a, b) => dist(human, a) < dist(human, b) ? a : b);
    if (human.ability === 'shooter') {
      fireBullet(state, human, target, now);
    } else {
      applyAttack(target);
    }
    human.killCooldown = KILL_COOLDOWN;
    return true;
  }
  return false;
}

export function humanArrest(state: GameState, now: number): boolean {
  const human = state.players[0];
  if (!human.alive || human.jailed || human.ability !== 'jail' || human.arrestCooldown > 0) return false;
  if (state.jailDuration <= 0) return false;
  const targets = state.players.filter(p =>
    p.alive && p.id !== 0 && !p.jailed && p.team !== human.team &&
    dist(human, p) < ARREST_RANGE &&
    hasLineOfSight(human.x, human.y, p.x, p.y, state.doors) &&
    sameElevation(human, p)
  );

  if (targets.length > 0) {
    const target = targets.reduce((a, b) => dist(human, a) < dist(human, b) ? a : b);
    arrestPlayer(state, target, now);
    human.arrestCooldown = ARREST_COOLDOWN;
    return true;
  }
  return false;
}

export function getNearbyTask(state: GameState): number | null {
  const human = state.players[0];
  if (!human.alive || human.jailed || human.ability !== 'crew') return null;
  const nearby = state.taskStations.find(t =>
    !t.completed && t.team === human.team && dist(human, t) < TASK_RANGE
  );
  return nearby ? nearby.id : null;
}

export function getNearbyDoor(state: GameState): number | null {
  const human = state.players[0];
  if (!human.alive || human.jailed) return null;
  if (human.ability === 'jail') return null;
  const door = state.doors.find(d => !d.synthetic && Math.hypot(d.cx - human.x, d.cy - human.y) < DOOR_INTERACT_RANGE);
  return door ? door.id : null;
}

export function toggleDoor(state: GameState, doorId: number, now: number): boolean {
  const door = state.doors.find(d => d.id === doorId);
  if (!door || door.synthetic) return false;
  if (now - door.lastUsedAt < DOOR_USE_COOLDOWN) return false;
  door.open = !door.open;
  door.lastUsedAt = now;
  return true;
}
