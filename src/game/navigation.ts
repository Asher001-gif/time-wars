import { ROOMS, ROOM_WALLS, OBSTACLES, RoomInfo, pointClearance } from './collision';
import { PLAYER_RADIUS, MAP_WIDTH, MARS_MAP_HEIGHT, Door as GameDoor } from './types';

// Door centers for each room
interface Door {
  roomIndex: number;
  x: number;
  y: number;
}

const DOORS: Door[] = [
  // Research room: door at bottom, center x=800
  { roomIndex: 0, x: 800, y: 345 },
  // Ecosystem room: door on right side, center y=625
  { roomIndex: 1, x: 395, y: 625 },
  // Recover room: door on left side, center y=625
  { roomIndex: 2, x: 1205, y: 625 },
];

function isInsideRoom(x: number, y: number, room: RoomInfo): boolean {
  return x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h;
}

export function getRoomAt(x: number, y: number): number {
  for (let i = 0; i < ROOMS.length; i++) {
    if (isInsideRoom(x, y, ROOMS[i])) return i;
  }
  return -1; // outside
}

function getDoorForRoom(roomIndex: number): Door | null {
  return DOORS.find(d => d.roomIndex === roomIndex) || null;
}

/**
 * Get navigation direction from source to target, respecting walls.
 * Returns normalized direction vector.
 */
function legacyDirection(
  sx: number, sy: number,
  tx: number, ty: number
): { x: number; y: number } {
  const srcRoom = getRoomAt(sx, sy);
  const tgtRoom = getRoomAt(tx, ty);

  let goalX = tx;
  let goalY = ty;

  if (srcRoom === tgtRoom) {
    // Same room or both outside - go direct
    goalX = tx;
    goalY = ty;
  } else if (srcRoom >= 0) {
    // Source is inside a room, target is outside or different room
    // Navigate to source room's door first
    const door = getDoorForRoom(srcRoom);
    if (door) {
      goalX = door.x;
      goalY = door.y;
    }
  } else if (tgtRoom >= 0) {
    // Source is outside, target is inside a room
    // Navigate to target room's door first
    const door = getDoorForRoom(tgtRoom);
    if (door) {
      const distToDoor = Math.sqrt((sx - door.x) ** 2 + (sy - door.y) ** 2);
      if (distToDoor < 30) {
        // Close to door, go to target directly
        goalX = tx;
        goalY = ty;
      } else {
        goalX = door.x;
        goalY = door.y;
      }
    }
  } else {
    // Both outside but let's check if direct path crosses a room wall
    // Simple approach: just go direct since both are outside
    goalX = tx;
    goalY = ty;
  }

  const dx = goalX - sx;
  const dy = goalY - sy;
  const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  return { x: dx / d, y: dy / d };
}


/* =====================================================================
 * GRID PATHFINDING
 * 10px lattice over the whole map. Static walls / rocks / pylons are baked
 * once. Closed doors are overlaid per door-state:
 *   - agents that can use doors (crew + traitors): door = passable but costly
 *     (they stop and open it when it's in their way)
 *   - protectors (can't use doors): closed door = wall
 * Builder blocks (synthetic closed doors) are walls for everyone.
 * Goal "flow fields" (Dijkstra from the goal) are cached and shared by every
 * bot heading to the same spot (tasks, power-ups, chased players...).
 * ===================================================================== */
const STEP = 10;
const GW = Math.floor(MAP_WIDTH / STEP) + 1;
const GH = Math.floor(MARS_MAP_HEIGHT / STEP) + 1;
const CLEAR = PLAYER_RADIUS + 1;
const DOOR_COST = 25;       // extra path cost (cost units = 10px steps) so bots prefer open routes but still go through doors when needed
const GOAL_SNAP = 4;        // goals are snapped to a 40px lattice so moving targets reuse fields
const MAX_FIELDS = 48;
const MIN_BUILD_GAP_MS = 40; // at most one ~13ms field build per few frames; bots use the old heuristic meanwhile
export const NAV_DEBUG = { unlimited: false };

let baseBlocked: Uint8Array | null = null;
function getBase(): Uint8Array {
  if (baseBlocked) return baseBlocked;
  const b = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const x = i * STEP, y = j * STEP;
      if (x < CLEAR || y < CLEAR || x > MAP_WIDTH - CLEAR || y > MARS_MAP_HEIGHT - CLEAR || pointClearance(x, y) < CLEAR) b[j * GW + i] = 1;
    }
  }
  baseBlocked = b;
  return b;
}

// Dynamic overlay (rebuilt when the set of closed doors changes)
let doorKey = '';
let dynBlocked = new Uint8Array(GW * GH); // 1 = synthetic block (wall for everyone)
let dynDoor = new Uint8Array(GW * GH);    // 1 = closed real door
let fields = new Map<string, Float64Array>();
let buildStamp = 0;

function rasterSegment(arr: Uint8Array, x1: number, y1: number, x2: number, y2: number, rad: number) {
  const minI = Math.max(0, Math.floor((Math.min(x1, x2) - rad) / STEP)), maxI = Math.min(GW - 1, Math.ceil((Math.max(x1, x2) + rad) / STEP));
  const minJ = Math.max(0, Math.floor((Math.min(y1, y2) - rad) / STEP)), maxJ = Math.min(GH - 1, Math.ceil((Math.max(y1, y2) + rad) / STEP));
  const dx = x2 - x1, dy = y2 - y1, ls = dx * dx + dy * dy;
  for (let j = minJ; j <= maxJ; j++) for (let i = minI; i <= maxI; i++) {
    const px = i * STEP, py = j * STEP;
    const t = ls === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / ls));
    if (Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)) <= rad) arr[j * GW + i] = 1;
  }
}

/** Call every AI tick with the live door list; cheap unless a door changed. */
export function navSetDoors(doors: GameDoor[]) {
  let key = '';
  for (const d of doors) if (!d.open) key += d.id + ',';
  if (key === doorKey) return;
  doorKey = key;
  dynBlocked = new Uint8Array(GW * GH);
  dynDoor = new Uint8Array(GW * GH);
  for (const d of doors) {
    if (d.open) continue;
    if (d.synthetic) rasterSegment(dynBlocked, d.x1, d.y1, d.x2, d.y2, CLEAR);
    else rasterSegment(dynDoor, d.x1, d.y1, d.x2, d.y2, STEP * 1.2);
  }
  fields = new Map();
}

let agentCanUseDoors = true;
/** The bot whose direction is being computed (protectors can't use doors). */
export function navSetAgent(canUseDoors: boolean) { agentCanUseDoors = canUseDoors; }

const idx = (i: number, j: number) => j * GW + i;
const toCell = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.round(v / STEP)));

function cellBlocked(i: number, j: number, canDoor: boolean): boolean {
  const k = idx(i, j);
  if (getBase()[k] || dynBlocked[k]) return true;
  return !canDoor && dynDoor[k] === 1;
}

/** Nearest free lattice cell to (i,j) (spiral search). */
function nearestFree(i: number, j: number, canDoor: boolean): [number, number] | null {
  if (!cellBlocked(i, j, canDoor)) return [i, j];
  for (let r = 1; r <= 8; r++) {
    let best: [number, number] | null = null, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= GW || nj >= GH || cellBlocked(ni, nj, canDoor)) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = [ni, nj]; }
    }
    if (best) return best;
  }
  return null;
}

// Binary min-heap on (cost, node) backed by typed arrays (no per-op allocation)
class Heap {
  c = new Float64Array(1 << 16); n = new Int32Array(1 << 16); size = 0;
  clear() { this.size = 0; }
  push(cost: number, node: number) {
    if (this.size >= this.c.length) {
      const c2 = new Float64Array(this.c.length * 2); c2.set(this.c); this.c = c2;
      const n2 = new Int32Array(this.n.length * 2); n2.set(this.n); this.n = n2;
    }
    const c = this.c, n = this.n; let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (c[p] <= cost) break;
      c[i] = c[p]; n[i] = n[p]; i = p;
    }
    c[i] = cost; n[i] = node;
  }
  popCost = 0; popNode = 0;
  pop() {
    const c = this.c, n = this.n;
    this.popCost = c[0]; this.popNode = n[0];
    const lc = c[--this.size], ln = n[this.size];
    const sz = this.size; let i = 0;
    if (sz > 0) {
      for (;;) {
        let m = 2 * i + 1; if (m >= sz) break;
        if (m + 1 < sz && c[m + 1] < c[m]) m++;
        if (c[m] >= lc) break;
        c[i] = c[m]; n[i] = n[m]; i = m;
      }
      c[i] = lc; n[i] = ln;
    }
  }
}
const HEAP = new Heap();

const NB: Array<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414],
];

function buildField(gi: number, gj: number, canDoor: boolean): Float64Array {
  const dist = new Float64Array(GW * GH).fill(Infinity);
  const heap = HEAP; heap.clear();
  dist[idx(gi, gj)] = 0; heap.push(0, idx(gi, gj));
  while (heap.size > 0) {
    heap.pop();
    const cost = heap.popCost, node = heap.popNode;
    if (cost > dist[node]) continue;
    const ci = node % GW, cj = (node - ci) / GW;
    for (const [di, dj, w] of NB) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= GW || nj >= GH || cellBlocked(ni, nj, canDoor)) continue;
      if (di !== 0 && dj !== 0 && (cellBlocked(ci + di, cj, canDoor) || cellBlocked(ci, cj + dj, canDoor))) continue; // no corner cutting
      const k = idx(ni, nj);
      const nc = cost + w + (dynDoor[k] ? DOOR_COST : 0);
      if (nc < dist[k]) { dist[k] = nc; heap.push(nc, k); }
    }
  }
  return dist;
}

function getField(tx: number, ty: number, canDoor: boolean): Float64Array | null {
  // snap goal to a coarse lattice so chasing a moving target reuses the field
  const gi0 = Math.round(toCell(tx, GW) / GOAL_SNAP) * GOAL_SNAP, gj0 = Math.round(toCell(ty, GH) / GOAL_SNAP) * GOAL_SNAP;
  const free = nearestFree(Math.min(GW - 1, gi0), Math.min(GH - 1, gj0), canDoor) ?? nearestFree(toCell(tx, GW), toCell(ty, GH), canDoor);
  if (!free) return null;
  const key = (canDoor ? 'd' : 'n') + free[0] + ',' + free[1];
  const hit = fields.get(key);
  if (hit) { fields.delete(key); fields.set(key, hit); return hit; } // LRU touch
  const now = performance.now();
  if (!NAV_DEBUG.unlimited && now - buildStamp < MIN_BUILD_GAP_MS) return null; // over budget -> caller falls back this frame
  buildStamp = now;
  const f = buildField(free[0], free[1], canDoor);
  fields.set(key, f);
  if (fields.size > MAX_FIELDS) fields.delete(fields.keys().next().value as string);
  return f;
}

/** True when a straight 18px-radius walk from a to b touches no wall / rock / block / closed door. */
function straightClear(ax: number, ay: number, bx: number, by: number, canDoor: boolean): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / (STEP * 0.5));
  for (let s = 1; s <= n; s++) {
    const t = s / n;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    // a point is walkable if the lattice cell(s) around it are free; check the 4 surrounding lattice nodes loosely
    const i = Math.floor(x / STEP), j = Math.floor(y / STEP);
    const fi = x / STEP - i, fj = y / STEP - j;
    const ci = fi < 0.5 ? i : i + 1, cj = fj < 0.5 ? j : j + 1;
    if (ci < 0 || cj < 0 || ci >= GW || cj >= GH) return false;
    const k = idx(ci, cj);
    if (getBase()[k] || dynBlocked[k] || dynDoor[k]) return false;
  }
  return true;
}

/**
 * Path distance (px-ish) from a point to a goal, or Infinity if unreachable / unknown.
 * Used by bots to decide whether a power-up is worth walking to.
 */
export function pathDistance(sx: number, sy: number, tx: number, ty: number): number {
  const direct = Math.hypot(tx - sx, ty - sy);
  if (straightClear(sx, sy, tx, ty, agentCanUseDoors)) return direct;
  const f = getField(tx, ty, agentCanUseDoors);
  if (!f) return direct * 1.6;
  const s = nearestFree(toCell(sx, GW), toCell(sy, GH), agentCanUseDoors);
  if (!s) return Infinity;
  const v = f[idx(s[0], s[1])];
  return v === Infinity ? Infinity : v * STEP + 20;
}

/**
 * Get navigation direction from source to target, routing around walls through
 * real doors / gaps (grid A*-style flow field). Falls back to the old room-door
 * heuristic only if the path budget is used up this frame.
 */
export function getNavigationDirection(
  sx: number, sy: number,
  tx: number, ty: number
): { x: number; y: number } {
  const canDoor = agentCanUseDoors;
  if (straightClear(sx, sy, tx, ty, canDoor)) {
    const dx = tx - sx, dy = ty - sy, d = Math.max(1, Math.hypot(dx, dy));
    return { x: dx / d, y: dy / d };
  }
  const f = getField(tx, ty, canDoor);
  const s = nearestFree(toCell(sx, GW), toCell(sy, GH), canDoor);
  if (!f || !s) return legacyDirection(sx, sy, tx, ty);
  if (f[idx(s[0], s[1])] === Infinity) return { x: 0, y: 0 }; // genuinely unreachable (e.g. protector vs closed door): don't grind into the wall

  // Walk the gradient a few steps and aim at the farthest node we can reach in a straight line (smooth, no zig-zag).
  let ci = s[0], cj = s[1];
  let aimX = ci * STEP, aimY = cj * STEP;
  let first = true;
  for (let step = 0; step < 10; step++) {
    let bi = ci, bj = cj, bv = f[idx(ci, cj)];
    for (const [di, dj] of NB) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const v = f[idx(ni, nj)];
      if (v < bv) { bv = v; bi = ni; bj = nj; }
    }
    if (bi === ci && bj === cj) break;
    ci = bi; cj = bj;
    const nx = ci * STEP, ny = cj * STEP;
    if (first || straightClear(sx, sy, nx, ny, canDoor)) { aimX = nx; aimY = ny; first = false; }
    else break;
  }
  const dx = aimX - sx, dy = aimY - sy, d = Math.hypot(dx, dy);
  if (d < 1) return legacyDirection(sx, sy, tx, ty);
  return { x: dx / d, y: dy / d };
}

/** Bake the static grid up-front so the first bot move in a match doesn't hitch. */
export function navWarmup() { getBase(); }
