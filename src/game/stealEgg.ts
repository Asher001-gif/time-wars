/* Steal an Egg v1 – data tables, world layout and saving. Numbers here are placeholders to tune after playtesting. */

export type Tier = 'common' | 'uncommon' | 'rare' | 'epic';
export type Species = 'chicken' | 'duck' | 'sheep' | 'pig' | 'cow' | 'fox' | 'heron' | 'horse' | 'wolf';

export const WORLD_W = 3600;
export const WORLD_H = 2200;

export const TIERS: Tier[] = ['common', 'uncommon', 'rare', 'epic'];

export const TIER_INFO: Record<Tier, {
  label: string; color: string; hatch: number;      // hatch time in seconds
  guard: 'dog' | 'wolf'; guardSpeed: number;          // px/s while chasing = the nest's recommended speed
  weight: number;                                      // fraction of your speed lost while carrying this egg (rarer egg = heavier)
  eggH: number;                                        // drawn egg height in px
  speedBonus: number;                                  // px/s a pet of this tier adds while in the pen
}> = {
  common:   { label: 'Common',   color: '#e8e8e8', hatch: 10,  guard: 'dog',  guardSpeed: 150, weight: 0.08,  eggH: 38, speedBonus: 1 },
  uncommon: { label: 'Uncommon', color: '#58d46a', hatch: 30,  guard: 'dog',  guardSpeed: 190, weight: 0.18, eggH: 54, speedBonus: 2 },
  rare:     { label: 'Rare',     color: '#4aa8ff', hatch: 90,  guard: 'wolf', guardSpeed: 250, weight: 0.32, eggH: 72, speedBonus: 4 },
  epic:     { label: 'Epic',     color: '#b565ff', hatch: 300, guard: 'wolf', guardSpeed: 300, weight: 0.45, eggH: 92, speedBonus: 8 },
};

export const SPECIES: Record<Species, { name: string; tier: Tier; rate: number; size: number }> = {
  chicken: { name: 'Chicken', tier: 'common',   rate: 1,    size: 52 },
  duck:    { name: 'Duck',    tier: 'common',   rate: 1.3,  size: 56 },
  sheep:   { name: 'Sheep',   tier: 'uncommon', rate: 3,    size: 74 },
  pig:     { name: 'Pig',     tier: 'uncommon', rate: 3.6,  size: 72 },
  cow:     { name: 'Cow',     tier: 'rare',     rate: 9,    size: 104 },
  fox:     { name: 'Fox',     tier: 'rare',     rate: 11,   size: 92 },
  heron:   { name: 'Heron',   tier: 'rare',     rate: 12,   size: 100 },
  horse:   { name: 'Horse',   tier: 'epic',     rate: 30,   size: 130 },
  wolf:    { name: 'Wolf',    tier: 'epic',     rate: 36,   size: 124 },
};

export const SPECIES_BY_TIER: Record<Tier, Species[]> = {
  common: ['chicken', 'duck'],
  uncommon: ['sheep', 'pig'],
  rare: ['cow', 'fox', 'heron'],
  epic: ['horse', 'wolf'],
};

export const MAX_PET_LEVEL = 3;
export const PAY_INTERVAL = 3;          // seconds between pet payouts
export const DAY_LEN = 290;             // seconds of day
export const NIGHT_LEN = 10;            // seconds of night
export const CYCLE_LEN = DAY_LEN + NIGHT_LEN;
export const NIGHT_HATCH_MULT = 6;
export const BASE_SPEED = 180;
export const PLAYER_SIZE = 72;

export interface Pet { sp: Species; lv: number }
export interface HatchSlot { sp: Species; t: number; v?: number }   // egg hatching: t = seconds elapsed, v = which egg design
export interface Save {
  cash: number; speed: number; treadLv: number; plotLv: number; extraSlots: number; penUpg: number; armsLv: number;
  hatch: (HatchSlot | null)[]; pen: (Pet | null)[]; fuseIn: Pet[]; fuseOut: Pet | null; carry: { kind: 'pet'; pet: Pet } | null;
}

export const petRate = (p: Pet) => SPECIES[p.sp].rate * Math.pow(3, p.lv - 1);
export const petSpeed = (p: Pet) => TIER_INFO[SPECIES[p.sp].tier].speedBonus * Math.pow(2, p.lv - 1);
export const petSellPrice = (p: Pet) => Math.round(SPECIES[p.sp].rate * 45 * Math.pow(3, p.lv - 1));
export const hatchTime = (sp: Species) => TIER_INFO[SPECIES[sp].tier].hatch;

/* ---------- shop ---------- */
export type ShopKey = 'plot' | 'tread' | 'arms' | 'slot' | 'pen';
export const TREAD_RATES = [1, 2, 3.5, 6, 10, 20];       // speed gained per second standing on the treadmill, by level
export const SHOP: Record<ShopKey, { name: string; desc: string; costs: number[] }> = {
  plot:  { name: 'Plot expansion',    desc: 'Bigger base: +1 hatch slot and +2 pen spots',          costs: [150, 600, 2000, 7000, 20000] },
  tread: { name: 'Treadmill upgrade', desc: 'Gain speed faster while you stand on the treadmill',   costs: [250, 1200, 6000, 30000, 150000] },
  arms:  { name: 'Strong arms',       desc: 'Carried eggs slow you down 15% less per level',        costs: [200, 900, 4000, 18000, 80000] },
  slot:  { name: 'Extra hatch slot',  desc: 'One more egg hatching at the same time',               costs: [120, 500, 2200, 8000] },
  pen:   { name: 'Pen upgrade',       desc: '+2 pets earning at once',                               costs: [100, 400, 1500, 6000, 24000] },
};
export const shopLevel = (s: Save, k: ShopKey) => ({ plot: s.plotLv, tread: s.treadLv, arms: s.armsLv, slot: s.extraSlots, pen: s.penUpg })[k];
export const shopCost = (s: Save, k: ShopKey): number | null => SHOP[k].costs[shopLevel(s, k)] ?? null;
export const treadRate = (s: Save) => TREAD_RATES[s.treadLv];
/** fraction of speed lost while carrying an egg of this tier (Strong arms upgrades cut it by 15% per level) */
export const weightPenalty = (tier: Tier, armsLv: number) => TIER_INFO[tier].weight * (1 - 0.15 * armsLv);

/* ---------- base plot layout (world coords) ---------- */
export const PLOT_X = 120, PLOT_Y = 640;
export interface Rect { x: number; y: number; w: number; h: number }
export interface PlotLayout {
  rect: Rect; treadmill: Rect; shop: Rect; sell: Rect; fuse: Rect;
  hatchPos: { x: number; y: number }[]; penPos: { x: number; y: number }[]; hatchCap: number; penCap: number; spawn: { x: number; y: number };
}
const HATCH_STEP = 90, PEN_STEP = 86;

export function plotLayout(s: Save): PlotLayout {
  const L = s.plotLv;
  const w = 560 + 100 * L, h = 440 + 80 * L;
  const rect = { x: PLOT_X, y: PLOT_Y, w, h };
  const top = PLOT_Y + 24;
  const treadmill = { x: PLOT_X + 20, y: top, w: 150, h: 96 };
  const shop = { x: PLOT_X + 190, y: top, w: 110, h: 96 };
  const sell = { x: PLOT_X + 320, y: top, w: 110, h: 96 };
  const fuse = { x: PLOT_X + 450, y: top, w: 100, h: 96 };
  const hatchCols = Math.floor((w - 40) / HATCH_STEP);
  const penCols = Math.floor((w - 40) / PEN_STEP);
  const penRows = Math.max(1, Math.floor((h - 290) / PEN_STEP));
  const hatchCap = hatchCols, penCap = penCols * penRows;
  const hatchN = Math.min(hatchCap, 1 + s.plotLv + s.extraSlots);
  const penN = Math.min(penCap, 3 + 2 * s.plotLv + 2 * s.penUpg);
  const hatchPos = Array.from({ length: hatchN }, (_, i) => ({ x: PLOT_X + 20 + HATCH_STEP / 2 + i * HATCH_STEP, y: PLOT_Y + 190 }));
  const penPos = Array.from({ length: penN }, (_, i) => ({
    x: PLOT_X + 20 + PEN_STEP / 2 + (i % penCols) * PEN_STEP,
    y: PLOT_Y + 300 + PEN_STEP / 2 + Math.floor(i / penCols) * PEN_STEP,
  }));
  return { rect, treadmill, shop, sell, fuse, hatchPos, penPos, hatchCap, penCap, spawn: { x: PLOT_X + w / 2, y: PLOT_Y + 160 } };
}

/* ---------- saving ---------- */
const KEY = 'stealegg.save.v1';
export function newSave(): Save {
  return { cash: 0, speed: BASE_SPEED, treadLv: 0, plotLv: 0, extraSlots: 0, penUpg: 0, armsLv: 0, hatch: [], pen: [], fuseIn: [], fuseOut: null, carry: null };
}
export function loadSave(): Save {
  const s = newSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return s;
    const d = JSON.parse(raw);
    const num = (v: unknown, def: number, lo = 0, hi = 1e15) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
    const okSp = (v: unknown): v is Species => typeof v === 'string' && v in SPECIES;
    const pet = (v: { sp?: unknown; lv?: unknown } | null): Pet | null => (v && okSp(v.sp) ? { sp: v.sp, lv: num(v.lv, 1, 1, MAX_PET_LEVEL) } : null);
    s.cash = num(d.cash, 0); s.speed = num(d.speed, BASE_SPEED, BASE_SPEED);
    s.treadLv = num(d.treadLv, 0, 0, TREAD_RATES.length - 1); s.plotLv = num(d.plotLv, 0, 0, SHOP.plot.costs.length);
    s.extraSlots = num(d.extraSlots, 0, 0, SHOP.slot.costs.length); s.penUpg = num(d.penUpg, 0, 0, SHOP.pen.costs.length);
    s.armsLv = num(d.armsLv, 0, 0, SHOP.arms.costs.length);
    if (Array.isArray(d.hatch)) s.hatch = d.hatch.map((h: { sp?: unknown; t?: unknown; v?: unknown } | null) => (h && okSp(h.sp) ? { sp: h.sp, t: num(h.t, 0), v: num(h.v, 0, 0, 50) } : null));
    if (Array.isArray(d.pen)) s.pen = d.pen.map(pet);
    if (Array.isArray(d.fuseIn)) s.fuseIn = d.fuseIn.map(pet).filter((p: Pet | null): p is Pet => !!p).slice(0, 3);
    s.fuseOut = pet(d.fuseOut);
    const c = d.carry && d.carry.kind === 'pet' ? pet(d.carry.pet) : null;
    s.carry = c ? { kind: 'pet', pet: c } : null;
  } catch { /* private mode / corrupt save: start fresh */ }
  return s;
}
export function writeSave(s: Save) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

/* ---------- meadow: nests and decoration (deterministic) ---------- */
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export interface NestDef { x: number; y: number; tier: Tier }
const BANDS: Record<Tier, [number, number, number]> = { common: [1350, 1800, 5], uncommon: [1750, 2450, 4], rare: [2300, 3000, 3], epic: [2900, 3450, 2] };
export function makeNests(): NestDef[] {
  const r = rng(77); const out: NestDef[] = [];
  for (const tier of TIERS) {
    const [x0, x1, n] = BANDS[tier];
    let guard = 0;
    while (out.filter(o => o.tier === tier).length < n && guard++ < 500) {
      const x = x0 + r() * (x1 - x0), y = 200 + r() * (WORLD_H - 400);
      if (out.every(o => Math.hypot(o.x - x, o.y - y) > 400)) out.push({ x, y, tier });
    }
  }
  return out;
}

export interface Deco { x: number; y: number; k: number; v: number }
export function makeDeco(nests: NestDef[]): { tufts: Deco[]; flowers: Deco[]; trees: Deco[] } {
  const r = rng(5);
  const free = (x: number, y: number, pad: number) =>
    !(x > PLOT_X - 60 && x < PLOT_X + 1300 && y > PLOT_Y - 60 && y < PLOT_Y + 1000) && nests.every(n => Math.hypot(n.x - x, n.y - y) > pad);
  const make = (n: number, pad: number) => {
    const a: Deco[] = [];
    while (a.length < n) { const x = r() * WORLD_W, y = r() * WORLD_H; if (free(x, y, pad)) a.push({ x, y, k: r(), v: r() }); }
    return a;
  };
  return { tufts: make(520, 60), flowers: make(150, 60), trees: make(42, 200) };
}

/* ---------- dirt pits: slow you down while you stand in them ---------- */
export const PIT_SLOW = 0.5;          // speed multiplier inside a pit
export const PIT_SQUASH = 0.55;       // pits are flat ovals in the top-down view
export interface Pit { x: number; y: number; r: number }
export function makePits(nests: NestDef[]): Pit[] {
  const r = rng(31); const out: Pit[] = [];
  let guard = 0;
  while (out.length < 16 && guard++ < 800) {
    const x = 1300 + r() * 2150, y = 150 + r() * (WORLD_H - 300), rad = 36 + r() * 22;
    if (nests.every(n => Math.hypot(n.x - x, n.y - y) > 170) && out.every(o => Math.hypot(o.x - x, o.y - y) > 140)) out.push({ x, y, r: rad });
  }
  return out;
}
export const inPit = (pits: Pit[], x: number, y: number) => pits.some(p => ((x - p.x) / p.r) ** 2 + ((y - p.y) / (p.r * PIT_SQUASH)) ** 2 < 1);
