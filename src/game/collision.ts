import { PLAYER_RADIUS, JAIL_RECT, Door } from './types';

export interface Wall {
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface CollisionCircle {
  x: number; y: number;
  r: number;
}

// === Room definitions (1600x1200 map) ===
// Research room: top-center, door at bottom
// Ecosystem room: left-center, door on right
// Recover room: right-center, door on left

const DOOR_WIDTH = 70;

export const ROOM_WALLS: Wall[] = [
  // === Research Room (top center) ===
  // Rect: x=550, y=40, w=500, h=300
  // Top wall
  { x1: 550, y1: 40, x2: 1050, y2: 40 },
  // Left wall
  { x1: 550, y1: 40, x2: 550, y2: 340 },
  // Right wall
  { x1: 1050, y1: 40, x2: 1050, y2: 340 },
  // Bottom wall with door gap in center (800±35)
  { x1: 550, y1: 340, x2: 765, y2: 340 },
  { x1: 835, y1: 340, x2: 1050, y2: 340 },

  // === Ecosystem Room (left center) ===
  // Rect: x=40, y=450, w=350, h=350
  // Top wall
  { x1: 40, y1: 450, x2: 390, y2: 450 },
  // Left wall
  { x1: 40, y1: 450, x2: 40, y2: 800 },
  // Bottom wall
  { x1: 40, y1: 800, x2: 390, y2: 800 },
  // Right wall with door gap in center (625±35)
  { x1: 390, y1: 450, x2: 390, y2: 590 },
  { x1: 390, y1: 660, x2: 390, y2: 800 },

  // === Recover Room (right center) ===
  // Rect: x=1210, y=450, w=350, h=350
  // Top wall
  { x1: 1210, y1: 450, x2: 1560, y2: 450 },
  // Right wall
  { x1: 1560, y1: 450, x2: 1560, y2: 800 },
  // Bottom wall
  { x1: 1210, y1: 800, x2: 1560, y2: 800 },
  // Left wall with door gap in center (625±35)
  { x1: 1210, y1: 450, x2: 1210, y2: 590 },
  { x1: 1210, y1: 660, x2: 1210, y2: 800 },

  // === Jail Room (bottom-right corner) ===
  { x1: JAIL_RECT.x, y1: JAIL_RECT.y, x2: JAIL_RECT.x + JAIL_RECT.w, y2: JAIL_RECT.y },
  { x1: JAIL_RECT.x, y1: JAIL_RECT.y + JAIL_RECT.h, x2: JAIL_RECT.x + JAIL_RECT.w, y2: JAIL_RECT.y + JAIL_RECT.h },
  { x1: JAIL_RECT.x, y1: JAIL_RECT.y, x2: JAIL_RECT.x, y2: JAIL_RECT.y + JAIL_RECT.h },
  { x1: JAIL_RECT.x + JAIL_RECT.w, y1: JAIL_RECT.y, x2: JAIL_RECT.x + JAIL_RECT.w, y2: JAIL_RECT.y + JAIL_RECT.h },
  // ============================================================
  // === EAST EXPANSION (Asteron v4.0) ===
  // Map widened from 1600 → 2000. New strip occupies x≈1620..1990.
  // Contains 3 billboards (top) + 2 mini shelters (mid / lower).
  // ============================================================

  // --- Mini Shelter A (upper) — rect x=1660..1800, y=400..500, door bottom ---
  { x1: 1660, y1: 400, x2: 1800, y2: 400 }, // top
  { x1: 1660, y1: 400, x2: 1660, y2: 500 }, // left
  { x1: 1800, y1: 400, x2: 1800, y2: 500 }, // right
  { x1: 1660, y1: 500, x2: 1710, y2: 500 }, // bottom-left (door gap 1710..1750)
  { x1: 1750, y1: 500, x2: 1800, y2: 500 }, // bottom-right

  // --- Mini Shelter B (lower) — rect x=1810..1950, y=820..920, door top ---
  { x1: 1810, y1: 820, x2: 1860, y2: 820 }, // top-left (door gap 1860..1900)
  { x1: 1900, y1: 820, x2: 1950, y2: 820 }, // top-right
  { x1: 1810, y1: 820, x2: 1810, y2: 920 }, // left
  { x1: 1950, y1: 820, x2: 1950, y2: 920 }, // right
  { x1: 1810, y1: 920, x2: 1950, y2: 920 }, // bottom

  // --- Billboard support pylons (small impassable rects).
  // Each billboard mounts on a 26x26 base block; the screen itself is
  // visually drawn above the base but the base is what blocks movement.
  // Base 1 @ (1690,170)
  { x1: 1677, y1: 157, x2: 1703, y2: 157 },
  { x1: 1677, y1: 183, x2: 1703, y2: 183 },
  { x1: 1677, y1: 157, x2: 1677, y2: 183 },
  { x1: 1703, y1: 157, x2: 1703, y2: 183 },
  // Base 2 @ (1820,170)
  { x1: 1807, y1: 157, x2: 1833, y2: 157 },
  { x1: 1807, y1: 183, x2: 1833, y2: 183 },
  { x1: 1807, y1: 157, x2: 1807, y2: 183 },
  { x1: 1833, y1: 157, x2: 1833, y2: 183 },
  // Base 3 @ (1950,170)
  { x1: 1937, y1: 157, x2: 1963, y2: 157 },
  { x1: 1937, y1: 183, x2: 1963, y2: 183 },
  { x1: 1937, y1: 157, x2: 1937, y2: 183 },
  { x1: 1963, y1: 157, x2: 1963, y2: 183 },
];

/** 2 mini shelter rooms in the east expansion (decor + collision already in ROOM_WALLS). */
export interface ShelterInfo {
  label: string;
  x: number; y: number; w: number; h: number;
  doorSide: 'top' | 'bottom' | 'left' | 'right';
  doorCenter: number;
}
export const SHELTERS: ShelterInfo[] = [
  { label: 'SHELTER A', x: 1660, y: 400, w: 140, h: 100, doorSide: 'bottom', doorCenter: 1730 },
  { label: 'SHELTER B', x: 1810, y: 820, w: 140, h: 100, doorSide: 'top',    doorCenter: 1880 },
];

/** 3 billboards in the east expansion. `imageSrc` is the ad to display
 * inside the screen. Replace it later — the renderer auto-fits the image.
 * When `imageSrc` is empty, the default "YOUR AD HERE!" text is shown. */
export interface BillboardInfo {
  cx: number;        // screen center x
  cy: number;        // screen center y
  w: number;         // screen width (16:9)
  h: number;         // screen height
  baseX: number;     // base/pylon center x
  baseY: number;     // base/pylon center y
  imageSrc: string;  // swap this string to change the ad
}
// 16:9 screen, 144x81. Placed above the support base so the visible screen
// floats over the Mars terrain (top strip of the expansion area).
export const BILLBOARDS: BillboardInfo[] = [
  { cx: 1690, cy: 110, w: 144, h: 81, baseX: 1690, baseY: 170, imageSrc: '' },
  { cx: 1820, cy: 110, w: 144, h: 81, baseX: 1820, baseY: 170, imageSrc: '' },
  { cx: 1950, cy: 110, w: 144, h: 81, baseX: 1950, baseY: 170, imageSrc: '' },
];


// Decorative obstacles (circular, impassable)
export const OBSTACLES: CollisionCircle[] = [
  // Rock formations in the open area
  { x: 800, y: 600, r: 40 },   // Center rock
  { x: 600, y: 950, r: 30 },   // Bottom-left rock
  { x: 1100, y: 1000, r: 35 }, // Bottom-right rock
];

// Room info for rendering
export interface RoomInfo {
  label: string;
  x: number; y: number; w: number; h: number;
  doorSide: 'top' | 'bottom' | 'left' | 'right';
  doorCenter: number;
}

export const ROOMS: RoomInfo[] = [
  { label: 'RESEARCH', x: 550, y: 40, w: 500, h: 300, doorSide: 'bottom', doorCenter: 800 },
  { label: 'ECOSYSTEM', x: 40, y: 450, w: 350, h: 350, doorSide: 'right', doorCenter: 625 },
  { label: 'RECOVER', x: 1210, y: 450, w: 350, h: 350, doorSide: 'left', doorCenter: 625 },
];

// Door definitions matching the wall gaps.
export function createDoors(): Door[] {
  return [
    // Research bottom door (horizontal segment 765..835 at y=340)
    { id: 0, x1: 765, y1: 340, x2: 835, y2: 340, cx: 800, cy: 340, open: true, lastUsedAt: 0, label: 'RESEARCH' },
    // Ecosystem right door (vertical segment x=390, y 590..660)
    { id: 1, x1: 390, y1: 590, x2: 390, y2: 660, cx: 390, cy: 625, open: true, lastUsedAt: 0, label: 'ECOSYSTEM' },
    // Recover left door (vertical segment x=1210, y 590..660)
    { id: 2, x1: 1210, y1: 590, x2: 1210, y2: 660, cx: 1210, cy: 625, open: true, lastUsedAt: 0, label: 'RECOVER' },
  ];
}

function pointToSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): { dist: number; nx: number; ny: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const npx = px - closestX;
  const npy = py - closestY;
  const dist = Math.sqrt(npx * npx + npy * npy);
  return { dist, nx: dist > 0 ? npx / dist : 0, ny: dist > 0 ? npy / dist : 0 };
}

export function resolveCollisions(px: number, py: number, doors: Door[] = []): { x: number; y: number } {
  let x = px;
  let y = py;
  const r = PLAYER_RADIUS;

  // Wall collisions
  for (const wall of ROOM_WALLS) {
    const { dist, nx, ny } = pointToSegDist(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
    if (dist < r) {
      const push = r - dist;
      x += nx * push;
      y += ny * push;
    }
  }

  // Closed door collisions
  for (const door of doors) {
    if (door.open) continue;
    const { dist, nx, ny } = pointToSegDist(x, y, door.x1, door.y1, door.x2, door.y2);
    if (dist < r) {
      const push = r - dist;
      x += nx * push;
      y += ny * push;
    }
  }

  // Obstacle collisions
  for (const obs of OBSTACLES) {
    const dx = x - obs.x;
    const dy = y - obs.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = obs.r + r;
    if (dist < minDist && dist > 0) {
      const push = minDist - dist;
      x += (dx / dist) * push;
      y += (dy / dist) * push;
    }
  }

  return { x, y };
}

/* ===== Line of Sight ===== */
function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): boolean {
  const d1x = bx - ax, d1y = by - ay;
  const d2x = dx - cx, d2y = dy - cy;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false;
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function hasLineOfSight(
  ax: number, ay: number, bx: number, by: number, doors: Door[] = []
): boolean {
  for (const w of ROOM_WALLS) {
    if (segmentsIntersect(ax, ay, bx, by, w.x1, w.y1, w.x2, w.y2)) return false;
  }
  for (const d of doors) {
    if (d.open) continue;
    if (segmentsIntersect(ax, ay, bx, by, d.x1, d.y1, d.x2, d.y2)) return false;
  }
  return true;
}
