import { TaskChallenge, TaskStation, TaskType, TOTAL_TASKS, MAP_WIDTH, MARS_MAP_HEIGHT, TeamIndex, JAIL_RECT } from './types';
import { pointClearance } from './collision';

const MIN_CLEAR = 60; // keep tasks well away from walls / rocks / pylons so they're always reachable
const JAIL_MARGIN = 80;

/** True when (x,y) is not near any wall, obstacle, the jail room, or the map edge. */
function isSafe(x: number, y: number): boolean {
  if (x < 80 || y < 80 || x > MAP_WIDTH - 80 || y > MARS_MAP_HEIGHT - 80) return false;
  if (x > JAIL_RECT.x - JAIL_MARGIN && x < JAIL_RECT.x + JAIL_RECT.w + JAIL_MARGIN &&
      y > JAIL_RECT.y - JAIL_MARGIN && y < JAIL_RECT.y + JAIL_RECT.h + JAIL_MARGIN) return false;
  return pointClearance(x, y) >= MIN_CLEAR;
}

/** Nearest safe point to (x,y), searching outward in rings. */
function nearestSafe(x: number, y: number, dx = 0): { x: number; y: number } {
  if (isSafe(x + dx, y)) return { x, y };
  for (let r = 20; r <= 500; r += 20) {
    for (let a = 0; a < 24; a++) {
      const nx = x + Math.cos((a / 24) * Math.PI * 2) * r, ny = y + Math.sin((a / 24) * Math.PI * 2) * r;
      if (isSafe(nx + dx, ny)) return { x: nx, y: ny };
    }
  }
  return { x, y };
}

const TASK_LABELS: Record<TaskType, string> = {
  frequency: '📻 Frequency',
  morse: '📟 Morse Code',
  satellite: '📡 Satellite',
  backup: '📁 Backup',
  solar: '🧼 Solar Panel',
  power: '🔋 Power',
  magnetic: '🧩 Magnetic',
  password: '🔑 Password',
  ice: '🧊 Ice Shatter',
  dna: '🧬 DNA Slider',
  door: '🚪 Door',
};

export function createTaskStations(count: number = TOTAL_TASKS, team: TeamIndex = 0, idOffset: number = 0): TaskStation[] {
  const positions = [
    // Research room
    { x: 680, y: 150 }, { x: 850, y: 200 }, { x: 950, y: 120 },
    // Ecosystem room
    { x: 150, y: 550 }, { x: 280, y: 680 }, { x: 150, y: 730 },
    // Recover room
    { x: 1320, y: 550 }, { x: 1450, y: 680 },
    // Open area
    { x: 800, y: 900 }, { x: 500, y: 1050 },
    // OUTPOST complex (inside the small rooms + central corridor)
    { x: 420, y: 1480 }, { x: 1220, y: 1480 }, { x: 820, y: 1840 }, { x: 1620, y: 1840 }, { x: 1000, y: 1660 },
  ];

  const types: TaskType[] = [
    'frequency', 'morse', 'satellite', 'backup', 'solar',
    'power', 'magnetic', 'password', 'ice', 'dna',
  ];

  const n = Math.max(0, Math.min(15, count));
  const stations: TaskStation[] = [];
  for (let i = 0; i < n; i++) {
    const dx = team === 1 ? 35 : team === 2 ? -35 : 0;
    let pos = positions[i];
    if (!pos) {
      // Repeat a previous task at a random location that is NOT in/near walls or the jail
      for (let tries = 0; tries < 200; tries++) {
        const c = { x: 150 + Math.random() * (MAP_WIDTH - 300), y: 150 + Math.random() * (MARS_MAP_HEIGHT - 300) };
        if (isSafe(c.x + dx, c.y)) { pos = c; break; }
      }
      if (!pos) pos = { x: 800, y: 900 };
    }
    pos = nearestSafe(pos.x, pos.y, dx);
    const type = types[i % types.length];
    stations.push({
      id: idOffset + i,
      x: pos.x + (team === 1 ? 35 : team === 2 ? -35 : 0),
      y: pos.y,
      label: TASK_LABELS[type],
      taskType: type,
      completed: false,
      team,
    });
  }
  return stations;
}

export function generateTaskChallenge(station: TaskStation): TaskChallenge {
  switch (station.taskType) {
    case 'frequency': {
      const targetAngle = Math.floor(Math.random() * 300) + 30;
      return { type: 'frequency', stationId: station.id, prompt: 'Tune the frequency', answer: '', targetAngle };
    }
    case 'morse': {
      const patterns: ('short' | 'long')[][] = [
        ['short', 'short', 'long'],
        ['long', 'short', 'short'],
        ['short', 'long', 'short'],
        ['long', 'long', 'short'],
        ['short', 'long', 'long'],
      ];
      const morsePattern = patterns[Math.floor(Math.random() * patterns.length)];
      return { type: 'morse', stationId: station.id, prompt: 'Repeat the pattern', answer: '', morsePattern };
    }
    case 'satellite': {
      const targetRotation = Math.floor(Math.random() * 300) + 30;
      return { type: 'satellite', stationId: station.id, prompt: 'Align the dish', answer: '', targetRotation };
    }
    case 'backup': {
      return { type: 'backup', stationId: station.id, prompt: 'Backing up data...', answer: '', duration: 5000 };
    }
    case 'solar': {
      return { type: 'solar', stationId: station.id, prompt: 'Swipe to clean!', answer: '' };
    }
    case 'power': {
      return { type: 'power', stationId: station.id, prompt: 'Flick batteries up!', answer: '' };
    }
    case 'magnetic': {
      return { type: 'magnetic', stationId: station.id, prompt: 'Snap the pieces!', answer: '' };
    }
    case 'password': {
      const digits = String(Math.floor(1000 + Math.random() * 9000));
      return { type: 'password', stationId: station.id, prompt: 'Remember the code', answer: digits, passwordDigits: digits };
    }
    case 'ice': {
      const tapsRequired = 15 + Math.floor(Math.random() * 10);
      return { type: 'ice', stationId: station.id, prompt: 'Tap to shatter!', answer: '', tapsRequired };
    }
    case 'dna': {
      const dnaOffset = Math.floor(Math.random() * 5) + 2;
      return { type: 'dna', stationId: station.id, prompt: 'Align the strands', answer: '', dnaOffset };
    }
  }
}
