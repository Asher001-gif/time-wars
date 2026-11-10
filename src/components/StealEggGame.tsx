import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DraggableExitButton from './DraggableExitButton';
import RotateDevicePrompt from './RotateDevicePrompt';
import { useIsMobileDevice, useIsPortrait } from '@/hooks/use-device';
import { botImg, eggImgs, eggVariantCount, MONSTER, monsterImgs, preloadStealEgg, SHEET, sheetImgs } from '@/game/stealEggAssets';
import {
  HELL_X, HELL_SPECIES_BY_TIER, HELL_TIER_INFO, LAVA_RATES, infoOf, lavaRate, type Realm,
  BASE_SPEED, CYCLE_LEN, DAY_LEN, MAX_PET_LEVEL, NIGHT_HATCH_MULT, PAY_INTERVAL, PLAYER_SIZE, SHOP, SPECIES, SPECIES_BY_TIER, TIERS, TIER_INFO,
  WORLD_H, WORLD_W, clearSave, hatchTime, loadSave, makeDeco, makeNests, newSave, petRate, petSellPrice, petSpeed, plotLayout, shopCost, shopLevel,
  treadRate, weightPenalty, writeSave, makePits, inPit, PIT_SLOW, PIT_SQUASH, type Pit,
  type Pet, type PlotLayout, type Rect, type Save, type ShopKey, type Species, type Tier,
} from '@/game/stealEgg';

/* ============================== types ============================== */
type Carry = { kind: 'egg'; sp: Species; v: number; nest: number } | { kind: 'pet'; pet: Pet };
type GState = 'patrol' | 'alert' | 'chase' | 'return' | 'hit';
interface Guard { x: number; y: number; hx: number; hy: number; kind: Species; state: GState; tx: number; ty: number; wait: number; face: number; timer: number; moving: boolean }
interface Nest { x: number; y: number; tier: Tier; realm: Realm; egg: Species | null; eggV: number; guard: Guard }
interface Wander { sp: string; ox: number; oy: number; tx: number; ty: number; wait: number; face: boolean; moving: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number; kind: 'dot' | 'coin' | 'ring' | 'star' }
interface Popup { x: number; y: number; text: string; color: string; life: number }
interface Cand { x: number; y: number; label: string; run: () => void }

// the guard is the same animal that hatches from the egg it protects (a hen guards a hen's egg, a wolf a wolf's egg ...)
const bigTier = (t: Tier) => t === 'rare' || t === 'epic';
const noticeOf = (k: Species) => (SPECIES[k].hell ? (SPECIES[k].tier === 'epic' ? 650 : SPECIES[k].tier === 'rare' ? 520 : SPECIES[k].tier === 'uncommon' ? 440 : 380) : bigTier(SPECIES[k].tier) ? 300 : 240);
const PATROL_R = 170;
// "sprint" mode: you move slowly, but guards notice you from much closer, so you can creep up to the animals
const SAFE_SPEED = 500;
const SPRINT_SLOW = 0.55, SPRINT_NOTICE = 0.45;
const patrolSpeedOf = (k: Species) => (SPECIES[k].hell ? 110 : bigTier(SPECIES[k].tier) ? 78 : 60);
const REACH = 78;
const guardSizeOf = (k: Species) => SPECIES[k].size * (SPECIES[k].hell ? 1 : 1.15);           // bigger animal = rarer animal (sizes are set per species in stealEgg.ts)
const eggKeepOut = (k: Species) => 46 + guardSizeOf(k) * 0.28;          // a guard can never walk into the egg it protects
const EGG_SQUASH = 1.5;                                                   // top-down view: the keep-out circle is squashed in y
function pushOutOfEgg(x: number, y: number, n: Nest, k: Species): [number, number] {
  let dx = x - n.x, dy = (y - (n.y + 10)) * EGG_SQUASH, d = Math.hypot(dx, dy);
  const R = eggKeepOut(k);
  if (d >= R) return [x, y];
  if (d < 0.01) { dx = 1; dy = 0; d = 1; }
  return [n.x + (dx / d) * R, n.y + 10 + (dy / d) * R / EGG_SQUASH];
}

/* ============================== tiny synth ============================== */
let actx: AudioContext | null = null;
let muted = false;
function unlockAudio() {
  try {
    if (!actx) { const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (C) actx = new C(); }
    if (actx && actx.state === 'suspended') actx.resume();
  } catch { /* no audio */ }
}
function beep(f: number, d: number, type: OscillatorType = 'square', vol = 0.05, f2?: number, delay = 0) {
  if (muted || !actx) return;
  try {
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
  } catch { /* ignore */ }
}
const sfx = {
  grab: () => { beep(520, 0.08, 'triangle', 0.06, 780); },
  place: () => { beep(300, 0.07, 'triangle', 0.06, 220); },
  coin: () => { beep(988, 0.06, 'square', 0.03); beep(1319, 0.1, 'square', 0.03, undefined, 0.06); },
  hatch: () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.14, 'triangle', 0.07, undefined, i * 0.09)); },
  bark: () => { beep(190, 0.12, 'sawtooth', 0.06, 110); beep(170, 0.12, 'sawtooth', 0.06, 100, 0.16); },
  hit: () => { beep(160, 0.35, 'sawtooth', 0.08, 40); },
  buy: () => { beep(660, 0.08, 'square', 0.05); beep(880, 0.08, 'square', 0.05, undefined, 0.08); beep(1320, 0.14, 'square', 0.05, undefined, 0.16); },
  no: () => { beep(150, 0.15, 'square', 0.05, 110); },
  night: () => { beep(330, 0.5, 'sine', 0.05, 220); },
};

/* ============================== helpers ============================== */
const inRect = (x: number, y: number, r: Rect, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
const fmtMoney = (n: number) => {
  if (n < 1000) return `$${Math.floor(n)}`;
  const u = ['K', 'M', 'B', 'T']; let i = -1, v = n;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `$${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)}${u[i]}`;
};
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const petLabel = (p: Pet) => `${SPECIES[p.sp].name}${p.lv > 1 ? ` Lv${p.lv}` : ''}`;
const pickVariant = (sp: Species) => Math.floor(Math.random() * eggVariantCount(sp));
const pickSpecies = (tier: Tier, realm: Realm = 'farm'): Species => { if (realm === 'hell' && tier === 'rare') return Math.random() < 0.5 ? 'dragon' : 'gollux';   // 50% legendary Dragon instead of rare
  const a = (realm === 'hell' ? HELL_SPECIES_BY_TIER[tier] : SPECIES_BY_TIER[tier]) ?? SPECIES_BY_TIER[tier]; return a[Math.floor(Math.random() * a.length)]; };

function makeGuard(nx: number, ny: number, kind: Species): Guard {
  const R = eggKeepOut(kind) + 16, x = nx + 0.8 * R, y = ny + 10 + 0.6 * R / EGG_SQUASH;   // home spot sits just outside the egg
  return { x, y, hx: x, hy: y, kind, state: 'patrol', tx: x, ty: y, wait: Math.random() * 2, face: -1, timer: 0, moving: false };
}
function buildNests(): Nest[] {
  return makeNests().map(d => {
    const egg = pickSpecies(d.tier, d.realm);
    return { x: d.x, y: d.y, tier: d.tier, realm: d.realm, egg, eggV: pickVariant(egg), guard: makeGuard(d.x, d.y, egg) };
  });
}

/* ============================== game state ============================== */
interface GameData {
  save: Save;
  nests: Nest[];
  deco: ReturnType<typeof makeDeco>;
  pits: Pit[];
  player: { x: number; y: number; face: number; stun: number; moving: boolean; onTread: boolean; onLava: boolean; inPit: boolean; sprint: boolean; sprintLock: boolean };
  carry: Carry | null;
  cycleT: number; t: number; wasNight: boolean;
  payT: number[]; popups: Popup[];
  saveT: number; flash: number; lastPrompt: string;
  nightMsg: number; tip: number;
  wander: Wander[]; parts: Particle[]; shake: number; cashPulse: number; lastCash: number; slotPop: Record<number, number>; carryPop: number; prevCarry: Carry | null;
}

function createData(): GameData {
  const save = loadSave();
  const lay = plotLayout(save);
  const nests = buildNests();
  return {
    save, nests, deco: makeDeco(nests.map(n => ({ x: n.x, y: n.y, tier: n.tier, realm: n.realm }))), pits: makePits(nests.map(n => ({ x: n.x, y: n.y, tier: n.tier, realm: n.realm }))),
    player: { x: lay.spawn.x, y: lay.spawn.y, face: 1, stun: 0, moving: false, onTread: false, onLava: false, inPit: false, sprint: false, sprintLock: false },
    carry: save.carry ? { kind: 'pet', pet: save.carry.pet } : null,
    cycleT: 0, t: 0, wasNight: false,
    payT: Array.from({ length: 200 }, (_, i) => (i * 0.37) % PAY_INTERVAL), popups: [], saveT: 0, flash: 0, lastPrompt: '', nightMsg: 0, tip: 0,
    wander: [], parts: [], shake: 0, cashPulse: 0, lastCash: save.cash, slotPop: {}, carryPop: 0, prevCarry: null,
  };
}

function effSpeed(g: GameData): number {
  const s = g.save;
  const lay = plotLayout(s);
  let v = s.speed;
  for (let i = 0; i < lay.penPos.length; i++) { const p = s.pen[i]; if (p) v += petSpeed(p); }
  if (g.carry && g.carry.kind === 'egg') v *= 1 - weightPenalty(g.carry.sp, s.armsLv);   // rarer egg = slower
  v = Math.max(40, v);
  if (g.player.inPit) v *= PIT_SLOW;                              // stuck in a dirt pit
  if (inSafe(lay, g.player.x, g.player.y)) v = Math.min(v, SAFE_SPEED);   // inside your base your speed is always 500
  return g.player.sprint ? Math.min(v, SAFE_SPEED) : v;                    // sprint on: speed 500 again
}
const petBonusSpeed = (g: GameData) => { const s = g.save, lay = plotLayout(s); let v = s.speed; for (let i = 0; i < lay.penPos.length; i++) { const p = s.pen[i]; if (p) v += petSpeed(p); } return v; };

/* ---------- game feel: particles, rings, screen shake ---------- */
const TIER_FX: Record<Tier, string[]> = { common: ['#ffffff', '#e8e8e8'], uncommon: ['#58d46a', '#c8ffd0'], rare: ['#4aa8ff', '#bfe0ff'], epic: ['#b565ff', '#ffd6ff'] };
function burst(g: GameData, x: number, y: number, colors: string[], n: number, speed = 160, o: { grav?: number; up?: number; size?: number; kind?: Particle['kind'] } = {}) {
  for (let i = 0; i < n && g.parts.length < 400; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.65);
    const life = 0.45 + Math.random() * 0.5;
    g.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up ?? 0), life, max: life, size: (o.size ?? 5) * (0.6 + Math.random() * 0.8), color: colors[i % colors.length], grav: o.grav ?? 380, kind: o.kind ?? 'dot' });
  }
}
function ring(g: GameData, x: number, y: number, color: string, r = 60) {
  g.parts.push({ x, y, vx: 0, vy: 0, life: 0.4, max: 0.4, size: r, color, grav: 0, kind: 'ring' });
}
const shakeIt = (g: GameData, a: number) => { g.shake = Math.min(1, Math.max(g.shake, a)); };
function popup(g: GameData, x: number, y: number, text: string, color = '#fff') { g.popups.push({ x, y, text, color, life: 1.4 }); }

function resetEggs(g: GameData) {
  g.nests.forEach(n => { const sp = pickSpecies(n.tier, n.realm); n.egg = sp; n.eggV = pickVariant(sp); n.guard = makeGuard(n.x, n.y, sp); });
}

function knockOut(g: GameData, lay: PlotLayout) {
  const c = g.carry;
  if (c && c.kind === 'egg') { const n = g.nests[c.nest]; if (n && !n.egg) { n.egg = c.sp; n.eggV = c.v; } g.carry = null; }
  g.player.x = lay.spawn.x; g.player.y = lay.spawn.y; g.player.stun = 2.4; g.player.sprintLock = false; g.flash = 1;
  sfx.hit();
  burst(g, g.player.x, g.player.y - 40, ['#ff4a4a', '#ffb0b0', '#ffffff'], 24, 260, { up: 100 }); shakeIt(g, 0.9);
}

/* ============================== simulation ============================== */
const inSafe = (lay: PlotLayout, x: number, y: number, pad = 0) => inRect(x, y, lay.rect, pad) || inRect(x, y, lay.lava, pad);   // base + the lava treadmill pad
function moveGuard(gd: Guard, tx: number, ty: number, sp: number, dt: number, lay: PlotLayout) {
  const dx = tx - gd.x, dy = ty - gd.y, d = Math.hypot(dx, dy);
  gd.moving = d > 2;
  if (d < 1) return;
  const step = Math.min(sp * dt, d), nx = gd.x + (dx / d) * step, ny = gd.y + (dy / d) * step;
  const blocked = (x: number, y: number) => inSafe(lay, x, y, 40);       // guards can never enter the safe zone
  if (!blocked(nx, ny)) { gd.x = nx; gd.y = ny; }
  else if (!blocked(nx, gd.y)) gd.x = nx;
  else if (!blocked(gd.x, ny)) gd.y = ny;
  if (Math.abs(dx) > 0.5) gd.face = dx > 0 ? 1 : -1;
}

const infoOfNest = (n: Nest) => infoOf(n.guard.kind);   // follows the species, so a Dragon in a rare nest is a legendary guard
function updateGuard(g: GameData, n: Nest, dt: number, lay: PlotLayout) {
  const gd = n.guard, p = g.player;
  const inBase = inSafe(lay, p.x, p.y, 0);
  const dP = Math.hypot(p.x - gd.x, p.y - gd.y);
  const speed = infoOfNest(n).guardSpeed;
  const hasEgg = !!g.carry && g.carry.kind === 'egg' && g.carry.nest === g.nests.indexOf(n);   // guards only care about the egg THEY guard
  const canSee = !inBase && p.stun <= 0 && hasEgg;
  gd.timer -= dt;
  switch (gd.state) {
    case 'patrol': {
      if (gd.wait > 0) { gd.wait -= dt; gd.moving = false; break; }
      moveGuard(gd, gd.tx, gd.ty, patrolSpeedOf(gd.kind), dt, lay);
      if (Math.hypot(gd.tx - gd.x, gd.ty - gd.y) < 6) {
        const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * PATROL_R;
        gd.tx = gd.hx + Math.cos(a) * r; gd.ty = gd.hy + Math.sin(a) * r; gd.wait = 0.8 + Math.random() * 2;
        [gd.tx, gd.ty] = pushOutOfEgg(gd.tx, gd.ty, n, gd.kind);
      }
      break;
    }
    case 'alert': { gd.moving = false; if (gd.timer <= 0) gd.state = 'chase'; break; }
    case 'chase': {
      if (!canSee) { gd.state = 'return'; break; }      // a guard never gives up until you are inside your home (or knocked out)
      moveGuard(gd, p.x, p.y, speed, dt, lay);
      if (dP < 36) { knockOut(g, lay); gd.state = 'hit'; gd.timer = 1.3; gd.moving = false; }
      break;
    }
    case 'hit': { gd.moving = false; if (gd.timer <= 0) gd.state = 'return'; break; }
    case 'return': {
      if (canSee && dP < noticeOf(gd.kind) * 0.7) { gd.state = 'chase'; break; }
      moveGuard(gd, gd.hx, gd.hy, speed * 0.75, dt, lay);
      if (Math.hypot(gd.hx - gd.x, gd.hy - gd.y) < 8) { gd.state = 'patrol'; gd.wait = 1; }
      break;
    }
  }
  // solid bodies: a guard collides with every nest (egg or empty) and with other guards instead of overlapping them
  for (const m of g.nests) {
    [gd.x, gd.y] = pushOutOfEgg(gd.x, gd.y, m, gd.kind);
    if (m === n) continue;
    const o = m.guard, dx = gd.x - o.x, dy = gd.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = (guardSizeOf(gd.kind) + guardSizeOf(o.kind)) * 0.3;
    if (d < min) { const k = (min - d) / 2 / d; gd.x += dx * k; gd.y += dy * k; o.x -= dx * k; o.y -= dy * k; }
  }
}

function buildCands(g: GameData, lay: PlotLayout, openShop: () => void): Cand[] {
  const s = g.save, p = g.player, out: Cand[] = [], c = g.carry;
  // nests
  g.nests.forEach((n, i) => {
    if (n.egg && !c) out.push({
      x: n.x, y: n.y, label: `Steal ${SPECIES[n.egg].name} egg`,
      run: () => { const sp = n.egg!; g.carry = { kind: 'egg', sp, v: n.eggV, nest: i }; n.egg = null; n.guard.state = 'chase'; sfx.grab(); sfx.bark(); popup(g, n.x, n.y - 80, 'Run!', '#ff8a5a'); burst(g, n.x, n.y - 20, TIER_FX[n.tier], 18, 200, { up: 120 }); ring(g, n.x, n.y + 6, TIER_FX[n.tier][0], 70); shakeIt(g, 0.3); },
    });
  });
  // hatch slots
  lay.hatchPos.forEach((pos, i) => {
    const slot = s.hatch[i] ?? null;
    if (!slot && c && c.kind === 'egg') {
      out.push({ ...pos, label: `Place ${SPECIES[c.sp].name} egg`, run: () => { s.hatch[i] = { sp: c.sp, t: 0, v: c.v }; g.carry = null; sfx.place(); g.slotPop[i] = 0.35; burst(g, pos.x, pos.y + 6, ['#e6c777', '#fff3c4'], 10, 110, { grav: 200 }); } });
    } else if (slot && slot.t >= hatchTime(slot.sp) && c && c.kind === 'egg') {
      // hatched animal waiting + holding an egg: swap them (egg goes in to hatch, animal comes out)
      out.push({ ...pos, label: `Swap: place ${SPECIES[c.sp].name} egg, take ${SPECIES[slot.sp].name}`, run: () => { g.carry = { kind: 'pet', pet: { sp: slot.sp, lv: 1 } }; s.hatch[i] = { sp: c.sp, t: 0, v: c.v }; sfx.place(); g.slotPop[i] = 0.35; burst(g, pos.x, pos.y - 10, ['#ffe14a', '#fff3c4'], 16, 170, { up: 80 }); ring(g, pos.x, pos.y + 6, '#ffe14a', 60); } });
    } else if (slot && slot.t >= hatchTime(slot.sp) && !c) {
      out.push({ ...pos, label: `Take ${SPECIES[slot.sp].name}`, run: () => { g.carry = { kind: 'pet', pet: { sp: slot.sp, lv: 1 } }; s.hatch[i] = null; sfx.grab(); burst(g, pos.x, pos.y - 20, ['#ffe14a', '#ffffff'], 14, 150, { up: 90 }); } });
    }
  });
  // pen spots
  lay.penPos.forEach((pos, i) => {
    const pet = s.pen[i] ?? null;
    if (!pet && c && c.kind === 'pet') out.push({ ...pos, label: `Place ${petLabel(c.pet)}`, run: () => { s.pen[i] = c.pet; g.carry = null; sfx.place(); burst(g, pos.x, pos.y + 10, ['#7dff9a', '#d4ffdc'], 12, 130, { up: 60 }); ring(g, pos.x, pos.y + 18, '#7dff9a', 46); } });
    else if (pet && !c) out.push({ ...pos, label: `Pick up ${petLabel(pet)}`, run: () => { g.carry = { kind: 'pet', pet }; s.pen[i] = null; sfx.grab(); } });
    else if (pet && c && c.kind === 'pet') out.push({ ...pos, label: `Swap with ${petLabel(pet)}`, run: () => { s.pen[i] = c.pet; g.carry = { kind: 'pet', pet }; sfx.place(); } });
  });
  const mid = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  // sell stand
  if (c && c.kind === 'pet') {
    const price = petSellPrice(c.pet), m = mid(lay.sell);
    out.push({ ...m, label: `Sell ${petLabel(c.pet)} for ${fmtMoney(price)}`, run: () => { s.cash += price; g.carry = null; sfx.coin(); popup(g, m.x, m.y - 40, `+${fmtMoney(price)}`, '#7dff9a'); burst(g, m.x, m.y - 10, ['#ffe14a', '#fff3a0', '#ffc02a'], 22, 230, { up: 200, kind: 'coin', size: 6 }); shakeIt(g, 0.15); } });
  }
  // fuse machine (unlocked by the first plot expansion)
  if (s.plotLv >= 1) {
    const m = mid(lay.fuse);
    if (c && c.kind === 'pet' && !s.fuseOut && c.pet.lv < MAX_PET_LEVEL && s.fuseIn.length < 3 && (s.fuseIn.length === 0 || (s.fuseIn[0].sp === c.pet.sp && s.fuseIn[0].lv === c.pet.lv))) {
      out.push({ ...m, label: `Fuse ${petLabel(c.pet)} (${s.fuseIn.length + 1}/3)`, run: () => {
        s.fuseIn.push(c.pet); g.carry = null; sfx.place();
        if (s.fuseIn.length === 3) { s.fuseOut = { sp: c.pet.sp, lv: c.pet.lv + 1 }; s.fuseIn = []; sfx.hatch(); popup(g, m.x, m.y - 50, 'FUSED!', '#ffe14a'); burst(g, m.x, m.y, ['#b565ff', '#ffe14a', '#ffffff'], 36, 260, { up: 120, kind: 'star', size: 7 }); ring(g, m.x, m.y, '#ffe14a', 90); shakeIt(g, 0.4); }
      } });
    }
    if (!c && s.fuseOut) { const o = s.fuseOut; out.push({ ...m, label: `Collect ${petLabel(o)}`, run: () => { g.carry = { kind: 'pet', pet: o }; s.fuseOut = null; sfx.grab(); } }); }
    else if (!c && s.fuseIn.length > 0) out.push({ ...m, label: `Take back ${petLabel(s.fuseIn[s.fuseIn.length - 1])}`, run: () => { g.carry = { kind: 'pet', pet: s.fuseIn.pop()! }; sfx.grab(); } });
  }
  // lava treadmill: there is ALWAYS an upgrade / purchase option here
  {
    const cost = shopCost(s, 'lava'), m = mid(lay.lava);
    if (cost !== null) out.push({ ...m, label: s.lavaLv === 0 ? `Buy Lava Treadmill ${fmtMoney(cost)}` : `Upgrade Lava Treadmill ${fmtMoney(cost)}`, run: openShop });
  }
  // shop
  out.push({ ...mid(lay.shop), label: 'Open shop', run: openShop });
  void p;
  return out;
}

function update(g: GameData, dt: number, inp: Input, lay: PlotLayout, openShop: () => void) {
  const s = g.save, p = g.player;
  g.t += dt;
  // day / night clock
  g.cycleT += dt;
  if (g.cycleT >= CYCLE_LEN) { g.cycleT -= CYCLE_LEN; resetEggs(g); popup(g, p.x, p.y - 100, 'Eggs have reset!', '#ffe14a'); }
  const night = g.cycleT >= DAY_LEN;
  if (night && !g.wasNight) { sfx.night(); g.nightMsg = 4; }
  g.wasNight = night;
  if (g.nightMsg > 0) g.nightMsg -= dt;

  // movement
  let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0) + inp.ax, my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0) + inp.ay;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  if (p.stun > 0) { p.stun -= dt; mx = my = 0; }
  const wasInPit = p.inPit; p.inPit = inPit(g.pits, p.x, p.y);
  if (p.inPit && !wasInPit) burst(g, p.x, p.y, ['#6b4a2b', '#8b5a2b', '#4a3220'], 10, 110, { up: 80, size: 4 });
  const sp = effSpeed(g);
  p.moving = ml > 0.05;
  p.x = Math.min(WORLD_W - 30, Math.max(30, p.x + mx * sp * dt));
  p.y = Math.min(WORLD_H - 30, Math.max(60, p.y + my * sp * dt));
  if (Math.abs(mx) > 0.05) p.face = mx > 0 ? 1 : -1;

  // treadmill: stand on it and your base speed grows for good
  p.onTread = p.stun <= 0 && inRect(p.x, p.y, lay.treadmill);
  p.onLava = p.stun <= 0 && s.lavaLv > 0 && inRect(p.x, p.y, lay.lava);
  if (p.onTread) s.speed += treadRate(s) * dt;
  if (p.onLava) s.speed += lavaRate(s) * dt;
  // embers drift up in Hell
  if (p.x > HELL_X - 250 && g.parts.length < 300 && Math.random() < dt * 22) {
    g.parts.push({ x: p.x + (Math.random() - 0.5) * 1300, y: p.y + 380 + Math.random() * 120, vx: (Math.random() - 0.5) * 30, vy: -90 - Math.random() * 90, life: 2.2, max: 2.2, size: 2 + Math.random() * 3, color: Math.random() < 0.5 ? '#ff7a1a' : '#ffd24a', grav: 0, kind: 'dot' });
  }

  // hatching (night boost)
  for (let i = 0; i < lay.hatchPos.length; i++) {
    const h = s.hatch[i];
    if (h && h.t < hatchTime(h.sp)) {
      h.t += dt * (night ? NIGHT_HATCH_MULT : 1);
      if (h.t >= hatchTime(h.sp)) { h.t = hatchTime(h.sp); sfx.hatch(); popup(g, lay.hatchPos[i].x, lay.hatchPos[i].y - 70, 'Hatched!', '#ffe14a'); g.slotPop[i] = 0.5; const hx = lay.hatchPos[i].x, hy = lay.hatchPos[i].y; burst(g, hx, hy - 20, ['#ffe14a', '#ffffff', ...TIER_FX[SPECIES[h.sp].tier]], 34, 250, { up: 160, kind: 'star', size: 6 }); ring(g, hx, hy + 6, '#ffe14a', 80); shakeIt(g, 0.35); }
    }
  }
  // pets in the pen pay out, even while you are out stealing
  for (let i = 0; i < lay.penPos.length; i++) {
    const pet = s.pen[i];
    if (!pet) continue;
    g.payT[i] += dt;
    if (g.payT[i] >= PAY_INTERVAL) {
      g.payT[i] -= PAY_INTERVAL;
      const amt = petRate(pet) * PAY_INTERVAL; s.cash += amt;
      popup(g, lay.penPos[i].x, lay.penPos[i].y - 50, `+${fmtMoney(amt)}`, '#7dff9a'); burst(g, lay.penPos[i].x, lay.penPos[i].y - 20, ['#ffe14a', '#7dff9a'], 6, 110, { up: 130, kind: 'coin', size: 4 });
    }
  }
  // guards
  for (const n of g.nests) updateGuard(g, n, dt, lay);

  // actions
  let best: Cand | null = null, bd = REACH;
  if (p.stun <= 0) for (const c of buildCands(g, lay, openShop)) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bd) { bd = d; best = c; }
  }
  g.lastPrompt = best ? best.label : '';
  if (inp.act) { inp.act = false; if (best) best.run(); }
  if (inp.sprintTog) { inp.sprintTog = false; if (p.stun <= 0) { p.sprintLock = !p.sprintLock; sfx.place(); } }
  p.sprint = (p.sprintLock || inp.shift) && p.stun <= 0;         // hold Shift, or press 0 to switch it on / off

  // game feel
  if (s.cash > g.lastCash + 0.001) g.cashPulse = 1;
  g.lastCash = s.cash;
  g.cashPulse = Math.max(0, g.cashPulse - dt * 3);
  g.shake = Math.max(0, g.shake - dt * 2.6);
  if (g.carry !== g.prevCarry) { if (g.carry) g.carryPop = 0.3; g.prevCarry = g.carry; }
  g.carryPop = Math.max(0, g.carryPop - dt);
  for (const k of Object.keys(g.slotPop)) { g.slotPop[+k] -= dt; if (g.slotPop[+k] <= 0) delete g.slotPop[+k]; }
  for (let i = 0; i < lay.hatchPos.length; i++) { const h = s.hatch[i]; if (h && h.t >= hatchTime(h.sp) && Math.random() < dt * 2.5) burst(g, lay.hatchPos[i].x + (Math.random() - 0.5) * 40, lay.hatchPos[i].y - 30 - Math.random() * 30, ['#ffe14a', '#ffffff'], 1, 25, { grav: -30, size: 3, kind: 'star' }); }
  // pen pets stroll around inside their own square so the pen looks alive
  for (let i = 0; i < lay.penPos.length; i++) {
    const pet = s.pen[i];
    if (!pet) { delete g.wander[i]; continue; }
    let w = g.wander[i];
    if (!w || w.sp !== pet.sp) w = g.wander[i] = { sp: pet.sp, ox: (Math.random() - 0.5) * 30, oy: 18 + Math.random() * 10, tx: 0, ty: 0, wait: Math.random() * 2, face: Math.random() < 0.5, moving: false };
    if (w.wait > 0) { w.wait -= dt; w.moving = false; if (w.wait <= 0) { w.tx = (Math.random() - 0.5) * 48; w.ty = 8 + Math.random() * 28; } continue; }
    const dx = w.tx - w.ox, dy = w.ty - w.oy, d = Math.hypot(dx, dy);
    if (d < 2) { w.wait = 0.8 + Math.random() * 2.5; w.moving = false; continue; }
    const st = Math.min(d, 26 * dt); w.ox += (dx / d) * st; w.oy += (dy / d) * st; w.moving = true;
    if (Math.abs(dx) > 1) w.face = dx > 0;
  }
  for (const q of g.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.grav * dt; q.vx *= 1 - Math.min(1, dt * 1.5); }
  g.parts = g.parts.filter(q => q.life > 0);
  // floating texts
  for (const q of g.popups) { q.life -= dt; q.y -= 28 * dt; }
  g.popups = g.popups.filter(q => q.life > 0);
  if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 1.2);

  g.saveT += dt;
  if (g.saveT > 2) { g.saveT = 0; persist(g); }
}
function persist(g: GameData) { g.save.carry = g.carry && g.carry.kind === 'pet' ? { kind: 'pet', pet: g.carry.pet } : null; writeSave(g.save); }

/* ============================== drawing ============================== */
const frameOf = (now: number, fps: number, off = 0) => Math.floor((now / 1000) * fps + off) % SHEET.frames;

/** Hell monsters: horizontal strips, size = body height in px. Sprites are pixel art, so no smoothing. */
function drawMonster(ctx: CanvasRenderingContext2D, sp: string, anim: string, frame: number, x: number, feetY: number, h: number, faceRight: boolean, alpha = 1) {
  const m = MONSTER[sp]; if (!m) return;
  let a = anim === 'run' && !m.frames.run ? 'walk' : anim; if (!m.frames[a]) a = 'idle';
  const img = monsterImgs[`${sp}_${a}`];
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const [cw, ch] = m.cell, bb = m.bbox, k = h / (bb[3] - bb[1]), n = m.frames[a], f = ((frame % n) + n) % n;
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
  ctx.translate(x, feetY);
  if (faceRight === m.facesLeft) ctx.scale(-1, 1);
  const cols = m.cols?.[a] ?? n;
  ctx.drawImage(img, (f % cols) * cw, Math.floor(f / cols) * ch, cw, ch, -((bb[0] + bb[2]) / 2) * k, -bb[3] * k, cw * k, ch * k);
  ctx.restore();
}
function drawAnimal(ctx: CanvasRenderingContext2D, key: string, frame: number, x: number, feetY: number, size: number, faceRight: boolean, alpha = 1) {
  const cut = key.indexOf('_'), who = key.slice(0, cut);
  if (MONSTER[who]) { drawMonster(ctx, who, key.slice(cut + 1), frame, x, feetY, size, faceRight, alpha); return; }
  const img = sheetImgs[key];
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const dw = size * 1.3;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, feetY);
  if (faceRight) ctx.scale(-1, 1);                                 // the sprites face left
  ctx.drawImage(img, (frame % SHEET.cols) * SHEET.cell, Math.floor(frame / SHEET.cols) * SHEET.cell, SHEET.cell, SHEET.cell, -dw / 2, -dw * 0.9, dw, dw);
  ctx.restore();
}
function drawEgg(ctx: CanvasRenderingContext2D, sp: Species, v: number, x: number, bottomY: number, h: number, wobble = 0, alpha = 1, shadowY?: number) {
  if (shadowY !== undefined) shadow(ctx, x, shadowY, h * 0.36 * (1 - Math.min(0.5, Math.abs(shadowY - bottomY) / 160)), 0.3 * alpha);
  const img = eggImgs[`${sp}_${v % eggVariantCount(sp)}`];
  if (!img || !img.complete || img.naturalWidth === 0) { ctx.fillStyle = '#f4e3c0'; ctx.beginPath(); ctx.ellipse(x, bottomY - h / 2, h * 0.36, h / 2, 0, 0, Math.PI * 2); ctx.fill(); return; }
  const w = (h * img.naturalWidth) / img.naturalHeight;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, bottomY); ctx.rotate(wobble);
  ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore();
}
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, a = 0.28) {
  // soft shadow: darkest in the middle, fading out at the edge
  if (rx <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.35);
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(0,0,0,${a * 1.25})`); gr.addColorStop(0.65, `rgba(0,0,0,${a * 0.8})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function dropShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 12, a = 0.25) {
  ctx.fillStyle = `rgba(0,0,0,${a})`; rrect(ctx, x + 6, y + 9, w, h, r); ctx.fill();
}
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 14, color = '#fff') {
  ctx.font = `bold ${size}px monospace`; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.fillStyle = color;
  ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
}
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

let hellPat: CanvasPattern | null = null;
function hellGround(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  if (hellPat) return hellPat;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const k = c.getContext('2d')!;
  k.fillStyle = '#2b1517'; k.fillRect(0, 0, 256, 256);
  let a = 23; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let i = 0; i < 26; i++) {
    k.fillStyle = r() > 0.5 ? 'rgba(70,24,24,0.35)' : 'rgba(10,4,6,0.3)';
    const bx = r() * 256, by = r() * 256, rx = 16 + r() * 34, ry = 10 + r() * 22, rot = r() * 3;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { k.beginPath(); k.ellipse(bx + ox, by + oy, rx, ry, rot, 0, Math.PI * 2); k.fill(); }
  }
  hellPat = ctx.createPattern(c, 'repeat');
  return hellPat ?? '#2b1517';
}
let groundPat: CanvasPattern | null = null;
function ground(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  if (groundPat) return groundPat;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const k = c.getContext('2d')!;
  k.fillStyle = '#6cae48'; k.fillRect(0, 0, 256, 256);
  let a = 11; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let i = 0; i < 22; i++) {
    k.fillStyle = r() > 0.5 ? 'rgba(90,150,60,0.22)' : 'rgba(130,195,85,0.2)';
    const bx = r() * 256, by = r() * 256, rx = 18 + r() * 36, ry = 12 + r() * 24, rot = r() * 3;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { k.beginPath(); k.ellipse(bx + ox, by + oy, rx, ry, rot, 0, Math.PI * 2); k.fill(); }   // wrap so the tile has no seams
  }
  groundPat = ctx.createPattern(c, 'repeat');
  return groundPat ?? '#6cae48';
}

/** the gate where the farm ends and Hell begins */
function drawHellEntrance(ctx: CanvasRenderingContext2D, now: number) {
  const gr = ctx.createLinearGradient(HELL_X - 140, 0, HELL_X + 160, 0);
  gr.addColorStop(0, 'rgba(43,21,23,0)'); gr.addColorStop(0.5, 'rgba(43,21,23,0.85)'); gr.addColorStop(1, 'rgba(43,21,23,0)');
  ctx.fillStyle = gr; ctx.fillRect(HELL_X - 140, 0, 300, WORLD_H);
  for (const y of [WORLD_H * 0.22, WORLD_H * 0.78]) {
    for (const dx of [-90, 90]) {          // two flaming gate pillars
      const x = HELL_X + dx;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 40, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3b2a30'; ctx.fillRect(x - 20, y - 150, 40, 150); ctx.fillStyle = '#51383f'; ctx.fillRect(x - 20, y - 150, 12, 150);
      const fl = 24 + Math.sin(now * 0.012 + x) * 6;
      ctx.fillStyle = '#ff6a1a'; ctx.beginPath(); ctx.ellipse(x, y - 160, 20, fl, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.ellipse(x, y - 156, 10, fl * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    label(ctx, '☠ HELL ☠', HELL_X, y - 200, 40, '#ff6a3a');
    label(ctx, 'monsters here are fast: bring 5000+ speed', HELL_X, y - 166, 15, '#ffb08a');
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, v: number) {
  const s = 0.9 + v * 0.5;
  shadow(ctx, x, y, 46 * s, 0.25);
  ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x - 9 * s, y - 50 * s, 18 * s, 52 * s);
  const cols = ['#2f8a3c', '#3a9c46', '#2a7a38'];
  [[0, -92, 50], [-30, -66, 38], [30, -64, 40]].forEach(([dx, dy, r], i) => { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(x - 12 * s, y - 104 * s, 20 * s, 0, Math.PI * 2); ctx.fill();
}

function drawPit(ctx: CanvasRenderingContext2D, pt: Pit, now = 0) {
  const ry = pt.r * PIT_SQUASH;
  if (pt.x >= HELL_X) {   // lava pool
    const glow = ctx.createRadialGradient(pt.x, pt.y, pt.r * 0.3, pt.x, pt.y, pt.r * 1.7);
    glow.addColorStop(0, 'rgba(255,120,20,0.35)'); glow.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, pt.r * 1.7, ry * 1.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c0e0e'; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, pt.r * 1.12, ry * 1.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8400a'; ctx.beginPath(); ctx.ellipse(pt.x, pt.y + 2, pt.r, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,${180 + Math.sin(now * 0.004 + pt.x) * 40},40,0.9)`; ctx.beginPath(); ctx.ellipse(pt.x + pt.r * 0.05, pt.y + ry * 0.15, pt.r * 0.65, ry * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.fillStyle = '#6b4a2b'; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, pt.r * 1.12, ry * 1.15, 0, 0, Math.PI * 2); ctx.fill();   // raised rim
  ctx.fillStyle = '#4a3220'; ctx.beginPath(); ctx.ellipse(pt.x, pt.y + 2, pt.r, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2718'; ctx.beginPath(); ctx.ellipse(pt.x + pt.r * 0.08, pt.y + ry * 0.2, pt.r * 0.72, ry * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.ellipse(pt.x - pt.r * 0.3, pt.y - ry * 0.25, pt.r * 0.25, ry * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a6a48'; for (let i = 0; i < 5; i++) { const a = i * 1.9 + pt.x; ctx.beginPath(); ctx.arc(pt.x + Math.cos(a) * pt.r * 1.15, pt.y + Math.sin(a) * ry * 1.2, 3, 0, Math.PI * 2); ctx.fill(); }   // pebbles
}

function drawPlot(ctx: CanvasRenderingContext2D, g: GameData, lay: PlotLayout, now: number) {
  const s = g.save, r = lay.rect;
  dropShadow(ctx, r.x, r.y, r.w, r.h, 18, 0.3);
  ctx.fillStyle = '#d9b97f'; rrect(ctx, r.x, r.y, r.w, r.h, 18); ctx.fill();
  ctx.fillStyle = 'rgba(120,80,40,0.10)';
  for (let yy = r.y + 30; yy < r.y + r.h - 10; yy += 34) ctx.fillRect(r.x + 8, yy, r.w - 16, 2);
  // fence + safe glow
  ctx.lineWidth = 10; ctx.strokeStyle = '#7a4d27'; rrect(ctx, r.x, r.y, r.w, r.h, 18); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = `rgba(120,255,160,${0.5 + Math.sin(now * 0.003) * 0.2})`; ctx.setLineDash([14, 10]); rrect(ctx, r.x - 10, r.y - 10, r.w + 20, r.h + 20, 24); ctx.stroke(); ctx.setLineDash([]);
  label(ctx, 'SAFE ZONE', r.x + r.w - 70, r.y + r.h - 14, 14, '#9dffb4');
  // treadmill
  const t = lay.treadmill;
  dropShadow(ctx, t.x, t.y, t.w, t.h, 12);
  ctx.fillStyle = '#2f3440'; rrect(ctx, t.x, t.y, t.w, t.h, 12); ctx.fill();
  ctx.save(); rrect(ctx, t.x + 6, t.y + 6, t.w - 12, t.h - 12, 8); ctx.clip();
  ctx.fillStyle = '#454c5c'; ctx.fillRect(t.x, t.y, t.w, t.h);
  const off = (g.player.onTread ? now * 0.25 : now * 0.04) % 24;
  ctx.fillStyle = '#5b6478'; for (let xx = t.x - 24 + off; xx < t.x + t.w; xx += 24) ctx.fillRect(xx, t.y, 10, t.h);
  ctx.restore();
  label(ctx, `TREADMILL +${treadRate(s)}/s`, t.x + t.w / 2, t.y - 6, 12, g.player.onTread ? '#ffe14a' : '#fff');
  // lava treadmill (above the base, always has a buy / upgrade option)
  {
    const L = lay.lava, owned = s.lavaLv > 0, cost = shopCost(s, 'lava');
    const gl = ctx.createRadialGradient(L.x + L.w / 2, L.y + L.h / 2, 10, L.x + L.w / 2, L.y + L.h / 2, 150); gl.addColorStop(0, 'rgba(255,100,20,0.3)'); gl.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = gl; ctx.fillRect(L.x - 60, L.y - 60, L.w + 120, L.h + 120);
    dropShadow(ctx, L.x, L.y, L.w, L.h, 12);
    ctx.fillStyle = '#3a1512'; rrect(ctx, L.x, L.y, L.w, L.h, 12); ctx.fill();
    ctx.save(); rrect(ctx, L.x + 6, L.y + 6, L.w - 12, L.h - 12, 8); ctx.clip();
    ctx.fillStyle = owned ? '#7a2a10' : '#3b2a2a'; ctx.fillRect(L.x, L.y, L.w, L.h);
    const off2 = owned ? (g.player.onLava ? now * 0.5 : now * 0.08) % 24 : 0;
    ctx.fillStyle = owned ? `rgba(255,${150 + Math.sin(now * 0.006) * 50},30,0.95)` : '#4a3838'; for (let xx = L.x - 24 + off2; xx < L.x + L.w; xx += 24) ctx.fillRect(xx, L.y, 10, L.h);
    ctx.restore();
    ctx.lineWidth = 4; ctx.strokeStyle = owned ? '#ff7a2a' : '#8a5a4a'; rrect(ctx, L.x, L.y, L.w, L.h, 12); ctx.stroke();
    if (owned) label(ctx, `🔥 LAVA TREADMILL +${lavaRate(s)}/s`, L.x + L.w / 2, L.y - 6, 12, g.player.onLava ? '#ffe14a' : '#ffb070');
    else { label(ctx, '🔒 LAVA TREADMILL', L.x + L.w / 2, L.y - 6, 12, '#ffb070'); label(ctx, fmtMoney(SHOP.lava.costs[0]), L.x + L.w / 2, L.y + L.h / 2 + 8, 22, '#ffe14a'); }
    if (cost !== null) label(ctx, owned ? `▲ upgrade ${fmtMoney(cost)}` : 'walk up + [E] to buy', L.x + L.w / 2, L.y + L.h + 16, 11, '#fff');
  }
  // shop
  const sh = lay.shop;
  dropShadow(ctx, sh.x, sh.y, sh.w, sh.h, 6);
  ctx.fillStyle = '#8b5a2b'; ctx.fillRect(sh.x + 6, sh.y + 30, sh.w - 12, sh.h - 30);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#e04545'; ctx.fillRect(sh.x + i * (sh.w / 6), sh.y, sh.w / 6, 34); }
  label(ctx, 'SHOP', sh.x + sh.w / 2, sh.y + sh.h - 22, 16, '#ffe14a'); label(ctx, '🛒', sh.x + sh.w / 2, sh.y + sh.h - 42, 18);
  // sell stand
  const se = lay.sell;
  dropShadow(ctx, se.x, se.y, se.w, se.h, 6);
  ctx.fillStyle = '#3f6fb5'; ctx.fillRect(se.x + 6, se.y + 30, se.w - 12, se.h - 30);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#3f6fb5'; ctx.fillRect(se.x + i * (se.w / 6), se.y, se.w / 6, 34); }
  label(ctx, 'SELL', se.x + se.w / 2, se.y + se.h - 22, 16, '#7dff9a'); label(ctx, '💰', se.x + se.w / 2, se.y + se.h - 42, 18);
  // fuse machine
  const f = lay.fuse, locked = s.plotLv < 1;
  dropShadow(ctx, f.x, f.y, f.w, f.h, 12);
  ctx.fillStyle = locked ? '#555' : '#7b4fb8'; rrect(ctx, f.x, f.y, f.w, f.h, 12); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; rrect(ctx, f.x + 10, f.y + 12, f.w - 20, 44, 8); ctx.fill();
  if (locked) { label(ctx, '🔒', f.x + f.w / 2, f.y + 44, 24); label(ctx, 'Expand plot', f.x + f.w / 2, f.y + f.h - 12, 11, '#ccc'); }
  else {
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < s.fuseIn.length ? '#ffe14a' : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(f.x + 24 + i * 26, f.y + 34, 9, 0, Math.PI * 2); ctx.fill(); }
    if (s.fuseOut) label(ctx, `${SPECIES[s.fuseOut.sp].name} Lv${s.fuseOut.lv}!`, f.x + f.w / 2, f.y + 76, 12, '#ffe14a');
    else label(ctx, s.fuseIn.length ? `${SPECIES[s.fuseIn[0].sp].name} ${s.fuseIn.length}/3` : 'FUSE 3→1', f.x + f.w / 2, f.y + 76, 12);
  }
  // hatch slots
  lay.hatchPos.forEach((pos, i) => {
    ctx.fillStyle = '#b08a4a'; ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 6, 38, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6c777'; ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 4, 30, 14, 0, 0, Math.PI * 2); ctx.fill();
    const h = s.hatch[i];
    if (!h) label(ctx, 'EGG', pos.x, pos.y + 40, 11, '#fff8d0');
  });
  // pen spots
  lay.penPos.forEach((pos, i) => {
    ctx.strokeStyle = 'rgba(122,77,39,0.65)'; ctx.lineWidth = 3; rrect(ctx, pos.x - 38, pos.y - 38, 76, 76, 10); ctx.stroke();
    ctx.fillStyle = s.pen[i] ? 'rgba(125,255,154,0.16)' : 'rgba(255,255,255,0.12)'; rrect(ctx, pos.x - 38, pos.y - 38, 76, 76, 10); ctx.fill();
  });
  label(ctx, 'PET PEN', r.x + 62, lay.penPos.length ? lay.penPos[0].y - 44 : r.y + 300, 12, '#5a3a1a');
}

function drawNest(ctx: CanvasRenderingContext2D, g: GameData, n: Nest, now: number, pSpeed: number) {
  const hell = n.realm === 'hell', info = infoOfNest(n);
  shadow(ctx, n.x, n.y + 12, hell ? 70 : 52, 0.25);
  const sc = hell ? 1.4 : 1;
  if (hell) { const gl = ctx.createRadialGradient(n.x, n.y + 10, 10, n.x, n.y + 10, 110); gl.addColorStop(0, 'rgba(255,90,20,0.4)'); gl.addColorStop(1, 'rgba(255,60,0,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(n.x, n.y + 10, 110, 60, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = hell ? '#1d1216' : '#8a6a2f'; ctx.beginPath(); ctx.ellipse(n.x, n.y + 10, 50 * sc, 24 * sc, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hell ? '#ff6a1a' : '#c9a24d'; ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(n.x + Math.cos(a) * 30 * sc, n.y + 10 + Math.sin(a) * 13 * sc); ctx.lineTo(n.x + Math.cos(a + 0.5) * 52 * sc, n.y + 10 + Math.sin(a + 0.5) * 24 * sc); ctx.stroke(); }
  ctx.fillStyle = hell ? '#4a1a10' : '#d9b560'; ctx.beginPath(); ctx.ellipse(n.x, n.y + 8, 34 * sc, 15 * sc, 0, 0, Math.PI * 2); ctx.fill();
  if (n.egg) {
    ctx.strokeStyle = info.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.5 + Math.sin(now * 0.005 + n.x) * 0.25;
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 10, 42, 19, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    drawEgg(ctx, n.egg, n.eggV, n.x, n.y + 14, info.eggH, Math.sin(now * 0.004 + n.x) * 0.03, 1, n.y + 15);
    const need = Math.ceil(info.guardSpeed / (1 - info.weight * (1 - 0.15 * g.save.armsLv)));
    label(ctx, `${info.label} · need ⚡${need}`, n.x, n.y + (hell ? 66 : 44), 12, pSpeed >= need ? '#9dffb4' : '#ff8a8a');
  } else {
    label(ctx, `back in ${fmtTime(CYCLE_LEN - g.cycleT)}`, n.x, n.y + (hell ? 66 : 44), 11, '#ddd');
  }
}

function drawGuard(ctx: CanvasRenderingContext2D, n: Nest, now: number, idx: number) {
  const gd = n.guard, sp = gd.kind, wolf = sp === 'wolf', size = guardSizeOf(sp);
  let key: string, fps: number;
  switch (gd.state) {
    case 'chase': key = wolf ? 'wolf_run' : `${sp}_run`; fps = 20; break;
    case 'alert': key = `${sp}_idle`; fps = 14; break;
    case 'hit': key = wolf ? 'wolf_hit' : SPECIES[sp].hell ? `${sp}_attack` : `${sp}_idle`; fps = 16; break;
    case 'return': key = wolf ? 'wolf_flee' : `${sp}_run`; fps = 16; break;
    default: key = gd.moving ? (wolf ? 'wolf_sneak_walk' : `${sp}_walk`) : `${sp}_idle`; fps = gd.moving ? 14 : 9;
  }
  shadow(ctx, gd.x, gd.y + 4, size * 0.4);
  drawAnimal(ctx, key, frameOf(now, fps, idx * 5), gd.x, gd.y, size, gd.face > 0);
  if (gd.state === 'chase' || gd.state === 'alert') label(ctx, '!', gd.x, gd.y - size * 1.0, 28, '#ff4040');
}

function drawPlayer(ctx: CanvasRenderingContext2D, g: GameData, now: number) {
  const p = g.player, size = PLAYER_SIZE;
  const bob = Math.sin(now * 0.005) * 5 + (p.moving ? Math.sin(now * 0.016) * 2 : 0);   // the bot floats
  shadow(ctx, p.x, p.y + 6, 30 - bob * 0.8, 0.3);
  ctx.save();
  if (p.stun > 0) { ctx.globalAlpha = 0.6 + Math.sin(now * 0.03) * 0.3; }
  ctx.translate(p.x, p.y - size * 0.55 - 10 - bob);
  if (p.onTread) ctx.rotate(Math.sin(now * 0.03) * 0.06);
  ctx.scale(p.face, 1);                                             // sprite faces right: left = mirror
  if (botImg.complete && botImg.naturalWidth > 0) ctx.drawImage(botImg, -size / 2, -size / 2, size, size);
  else { ctx.fillStyle = '#4a90d9'; ctx.beginPath(); ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // carried item floats beside the bot
  const c = g.carry;
  if (c) {
    const cx = p.x + p.face * 36, cy = p.y - size * 0.6 - 4 - bob;
    const pk = 1 + 0.3 * Math.sin((g.carryPop / 0.3) * Math.PI);          // little pop when you pick something up
    if (c.kind === 'egg') drawEgg(ctx, c.sp, c.v, cx, cy + 20, infoOf(c.sp).eggH * 0.85 * pk, Math.sin(now * 0.012) * 0.12, 1, p.y + 8);
    else { shadow(ctx, cx, p.y + 8, SPECIES[c.pet.sp].size * 0.22, 0.25); drawAnimal(ctx, `${c.pet.sp}_idle`, frameOf(now, 10), cx, cy + 34, (SPECIES[c.pet.sp].hell ? SPECIES[c.pet.sp].penH! * 0.9 : SPECIES[c.pet.sp].size * 0.6) * pk, p.face > 0); }
  }
  if (p.stun > 0) label(ctx, '💫', p.x, p.y - size - 18, 22);
  label(ctx, 'YOU', p.x, p.y - size - (p.stun > 0 ? 40 : 14), 12, '#9fd0ff');
}

function render(ctx: CanvasRenderingContext2D, g: GameData, cw: number, ch: number, dpr: number, now: number) {
  const lay = plotLayout(g.save), p = g.player;
  const S = Math.max(0.5, Math.min(cw / 1100, ch / 700));
  const vw = cw / S, vh = ch / S;
  const camX = Math.min(Math.max(0, WORLD_W - vw), Math.max(0, p.x - vw / 2)), camY = Math.min(Math.max(0, WORLD_H - vh), Math.max(0, p.y - vh / 2 - 20));
  const sh = g.shake * g.shake * 14, shx = (Math.random() - 0.5) * 2 * sh, shy = (Math.random() - 0.5) * 2 * sh;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#243a22'; ctx.fillRect(0, 0, cw * dpr, ch * dpr);
  ctx.setTransform(S * dpr, 0, 0, S * dpr, (-camX + shx) * S * dpr, (-camY + shy) * S * dpr);
  ctx.fillStyle = ground(ctx); ctx.fillRect(0, 0, HELL_X, WORLD_H);
  ctx.fillStyle = hellGround(ctx); ctx.fillRect(HELL_X, 0, WORLD_W - HELL_X, WORLD_H);
  drawHellEntrance(ctx, now);
  ctx.lineWidth = 16; ctx.strokeStyle = '#6b4a2b'; ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
  const vis = (x: number, y: number, m = 160) => x > camX - m && x < camX + vw + m && y > camY - m && y < camY + vh + m;
  for (const d of g.deco.cracks) if (vis(d.x, d.y, 80)) { ctx.strokeStyle = `rgba(255,${90 + d.k * 90},20,${0.5 + Math.sin(now * 0.003 + d.x) * 0.2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 30 + d.k * 40, d.y + 12 - d.v * 24); ctx.lineTo(d.x + 60 + d.k * 50, d.y + 4 + d.v * 20); ctx.stroke(); }
  for (const d of g.deco.rocks) if (vis(d.x, d.y, 40)) { const rr = 10 + d.k * 16; ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(d.x + 3, d.y + 4, rr * 1.1, rr * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = d.v > 0.5 ? '#3a2a30' : '#2a1d22'; ctx.beginPath(); ctx.moveTo(d.x - rr, d.y); ctx.lineTo(d.x - rr * 0.4, d.y - rr * 0.9); ctx.lineTo(d.x + rr * 0.5, d.y - rr * 0.8); ctx.lineTo(d.x + rr, d.y); ctx.closePath(); ctx.fill(); }

  // ground decoration
  for (const d of g.deco.tufts) if (vis(d.x, d.y, 30)) { ctx.strokeStyle = d.k > 0.5 ? '#4f9438' : '#84c45a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(d.x - 5, d.y); ctx.lineTo(d.x - 7, d.y - 10); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y - 13); ctx.moveTo(d.x + 5, d.y); ctx.lineTo(d.x + 8, d.y - 9); ctx.stroke(); }
  const fcols = ['#ffd84a', '#ff7a9a', '#ffffff', '#b58cff'];
  for (const d of g.deco.flowers) if (vis(d.x, d.y, 20)) { ctx.fillStyle = fcols[Math.floor(d.v * 4)]; ctx.beginPath(); ctx.arc(d.x, d.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ff9a1a'; ctx.beginPath(); ctx.arc(d.x, d.y, 1.6, 0, Math.PI * 2); ctx.fill(); }

  for (const pt of g.pits) if (vis(pt.x, pt.y, pt.r * 2)) drawPit(ctx, pt, now);
  drawPlot(ctx, g, lay, now);
  const pSpeed = petBonusSpeed(g);
  g.nests.forEach(n => { if (vis(n.x, n.y)) drawNest(ctx, g, n, now, pSpeed); });

  // things that stand up are drawn back-to-front
  const items: { y: number; draw: () => void }[] = [];
  for (const t of g.deco.trees) if (vis(t.x, t.y, 200)) items.push({ y: t.y, draw: () => drawTree(ctx, t.x, t.y, t.v) });
  g.nests.forEach((n, i) => { if (vis(n.guard.x, n.guard.y)) items.push({ y: n.guard.y, draw: () => drawGuard(ctx, n, now, i) }); });
  lay.hatchPos.forEach((pos, i) => {
    const h = g.save.hatch[i]; if (!h) return;
    const total = hatchTime(h.sp), done = h.t >= total, info = infoOf(h.sp);
    items.push({ y: pos.y + 10, draw: () => {
      const pop = 1 + 0.3 * Math.sin(((g.slotPop[i] ?? 0) / 0.35) * Math.PI);
      if (done) { shadow(ctx, pos.x, pos.y + 14, SPECIES[h.sp].size * 0.3, 0.28); drawAnimal(ctx, `${h.sp}_idle`, frameOf(now, 10, i * 3), pos.x, pos.y + 14, (SPECIES[h.sp].hell ? SPECIES[h.sp].penH! * 1.15 : 30 + SPECIES[h.sp].size * 0.55) * pop, false); label(ctx, 'READY!', pos.x, pos.y - 56, 12, '#ffe14a'); return; }
      const wob = (h.t / total) > 0.7 ? Math.sin(now * 0.03) * 0.14 : Math.sin(now * 0.006 + i) * 0.03;
      drawEgg(ctx, h.sp, h.v ?? 0, pos.x, pos.y + 12, info.eggH * 0.9 * pop, wob, 1, pos.y + 14);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(pos.x - 28, pos.y + 22, 56, 8);
      ctx.fillStyle = info.color; ctx.fillRect(pos.x - 27, pos.y + 23, 54 * (h.t / total), 6);
      label(ctx, fmtTime(Math.ceil(total - h.t)), pos.x, pos.y + 46, 11);
    } });
  });
  lay.penPos.forEach((pos, i) => {
    const pet = g.save.pen[i]; if (!pet) return;
    const hop = g.payT[i] < 0.25 ? Math.sin((g.payT[i] / 0.25) * Math.PI) * 10 : 0;
    items.push({ y: pos.y + (g.wander[i] ? g.wander[i].oy : 20), draw: () => {
      const sz = SPECIES[pet.sp].hell ? SPECIES[pet.sp].penH! : 34 + SPECIES[pet.sp].size * 0.42;      // still bigger for rarer pets, but fits the pen square
      const w = g.wander[i], wx = pos.x + (w ? w.ox : 0), wy = pos.y + (w ? w.oy : 24);
      const key = w && w.moving ? (pet.sp === 'wolf' ? 'wolf_sneak_walk' : `${pet.sp}_walk`) : `${pet.sp}_idle`;
      shadow(ctx, wx, wy - 2, sz * 0.4, 0.22);
      drawAnimal(ctx, key, frameOf(now, w && w.moving ? 12 : 10, i * 4), wx, wy - hop, sz, w ? w.face : i % 2 === 0);
      if (pet.lv > 1) label(ctx, `Lv${pet.lv}`, pos.x, pos.y - 40, 11, '#ffe14a');
    } });
  });
  items.push({ y: p.y, draw: () => drawPlayer(ctx, g, now) });
  items.sort((a, b) => a.y - b.y).forEach(i => i.draw());

  // floating texts
  for (const q of g.parts) {
    const k = Math.max(0, q.life / q.max); ctx.globalAlpha = Math.min(1, k * 1.6);
    if (q.kind === 'ring') { const r = q.size * (1 - k); ctx.strokeStyle = q.color; ctx.lineWidth = 5 * k + 1; ctx.beginPath(); ctx.ellipse(q.x, q.y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
    else if (q.kind === 'coin') { ctx.fillStyle = q.color; ctx.strokeStyle = 'rgba(120,70,0,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(q.x, q.y, q.size, q.size * Math.abs(Math.cos(q.life * 14)) + 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else if (q.kind === 'star') { const r = q.size * (0.5 + k * 0.7); ctx.fillStyle = q.color; ctx.beginPath(); ctx.moveTo(q.x, q.y - r * 1.5); ctx.lineTo(q.x + r * 0.4, q.y - r * 0.4); ctx.lineTo(q.x + r * 1.5, q.y); ctx.lineTo(q.x + r * 0.4, q.y + r * 0.4); ctx.lineTo(q.x, q.y + r * 1.5); ctx.lineTo(q.x - r * 0.4, q.y + r * 0.4); ctx.lineTo(q.x - r * 1.5, q.y); ctx.lineTo(q.x - r * 0.4, q.y - r * 0.4); ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (0.4 + k * 0.6), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  for (const q of g.popups) {
    const age = 1.4 - q.life, pop = age < 0.2 ? 1 + 0.7 * (1 - age / 0.2) : 1;      // text pops in big, then settles
    ctx.save(); ctx.translate(q.x, q.y); ctx.scale(pop, pop); ctx.globalAlpha = Math.min(1, q.life * 1.5); label(ctx, q.text, 0, 0, 18, q.color); ctx.restore();
  }

  // ---- screen space ----
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (p.x > HELL_X - 150) { const k = Math.min(1, (p.x - (HELL_X - 150)) / 400); ctx.fillStyle = `rgba(90,10,0,${0.16 * k})`; ctx.fillRect(0, 0, cw, ch); }
  const night = g.cycleT >= DAY_LEN;
  const dusk = g.cycleT > DAY_LEN - 8 && !night ? (g.cycleT - (DAY_LEN - 8)) / 8 : 0;
  if (night || dusk > 0) { ctx.fillStyle = `rgba(8,16,60,${night ? 0.5 : 0.35 * dusk})`; ctx.fillRect(0, 0, cw, ch); }
  if (g.flash > 0) { ctx.fillStyle = `rgba(255,0,0,${0.45 * g.flash})`; ctx.fillRect(0, 0, cw, ch); }

  drawHud(ctx, g, cw, ch, night);
}

function drawHud(ctx: CanvasRenderingContext2D, g: GameData, cw: number, ch: number, night: boolean) {
  const s = g.save, sp = effSpeed(g);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; rrect(ctx, 12, 54, 210, 70, 10); ctx.fill();
  ctx.save(); ctx.translate(24, 82); ctx.scale(1 + 0.3 * g.cashPulse, 1 + 0.3 * g.cashPulse); ctx.font = 'bold 22px monospace'; ctx.fillStyle = g.cashPulse > 0.3 ? '#eaffef' : '#7dff9a'; ctx.fillText(fmtMoney(s.cash), 0, 0); ctx.restore();
  ctx.font = 'bold 14px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(`⚡ SPEED ${Math.round(sp)}`, 24, 104);
  if (g.player.inPit) { ctx.save(); ctx.font = 'bold 12px monospace'; ctx.fillStyle = '#d9a066'; ctx.fillText('stuck in dirt: −50% speed', 24, 142); ctx.restore(); }
  const c = g.carry;
  if (c && c.kind === 'egg') { const w = weightPenalty(c.sp, s.armsLv); ctx.fillStyle = '#ffb36b'; ctx.fillText(`carrying egg −${Math.round(w * 100)}% speed`, 24, 120); }
  else if (c && c.kind === 'pet') { ctx.fillStyle = '#ffe14a'; ctx.fillText(`carrying ${petLabel(c.pet)}`, 24, 120); }
  // clock
  const left = night ? CYCLE_LEN - g.cycleT : DAY_LEN - g.cycleT;
  const bw = Math.min(300, cw - 260), bx = cw / 2 - bw / 2 + 40;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; rrect(ctx, bx, 12, bw, 30, 10); ctx.fill();
  ctx.fillStyle = night ? '#8fa8ff' : '#ffe14a'; ctx.fillRect(bx + 8, 33, (bw - 16) * (night ? (g.cycleT - DAY_LEN) / 10 : g.cycleT / DAY_LEN), 5);
  ctx.textAlign = 'center'; ctx.font = 'bold 13px monospace'; ctx.fillStyle = '#fff';
  ctx.fillText(night ? `🌙 NIGHT ${Math.ceil(left)}s` : `☀ Eggs reset in ${fmtTime(left)}`, bx + bw / 2, 28);
  if (g.nightMsg > 0) { ctx.globalAlpha = Math.min(1, g.nightMsg); label(ctx, `🌙 Night: eggs hatch ${NIGHT_HATCH_MULT}× faster!`, cw / 2, 90, 24, '#bcd0ff'); ctx.globalAlpha = 1; }
  if (g.player.stun > 0) label(ctx, 'KNOCKED OUT!', cw / 2, ch / 2 - 60, 40, '#ff6a6a');
}

/* ============================== input + UI ============================== */
interface Input { up: boolean; down: boolean; left: boolean; right: boolean; ax: number; ay: number; act: boolean; sprintTog: boolean; shift: boolean }

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 52;
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(d, R);
    setKnob({ x: (dx / d) * k, y: (dy / d) * k }); onMove(d > 8 ? dx / d : 0, d > 8 ? dy / d : 0);
  };
  const end = () => { setKnob({ x: 0, y: 0 }); onMove(0, 0); };
  return (
    <div ref={ref} className="pointer-events-auto absolute rounded-full border-[3px] border-white/50 bg-black/30 select-none" style={{ left: 28, bottom: 34, width: 130, height: 130, touchAction: 'none' }}
      onPointerDown={e => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); set(e); }} onPointerMove={e => { if (e.buttons || e.pointerType === 'touch') set(e); }} onPointerUp={end} onPointerCancel={end}>
      <div className="absolute rounded-full bg-white/70" style={{ width: 54, height: 54, left: 38 + knob.x, top: 38 + knob.y }} />
    </div>
  );
}

export default function StealEggGame({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gRef = useRef<GameData | null>(null);
  const inpRef = useRef<Input>({ up: false, down: false, left: false, right: false, ax: 0, ay: 0, act: false, sprintTog: false, shift: false });
  const shopRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [sprint, setSprint] = useState(false);
  const [banner, setBanner] = useState(true);
  const [mute, setMute] = useState(muted);
  const [, force] = useState(0);
  const isMobile = useIsMobileDevice();
  const isPortrait = useIsPortrait();

  const openShop = useCallback(() => { shopRef.current = true; setShopOpen(true); }, []);
  const closeShop = useCallback(() => { shopRef.current = false; setShopOpen(false); }, []);

  useEffect(() => { let on = true; preloadStealEgg().then(() => { if (on) { gRef.current = createData(); if (import.meta.env.DEV) (window as unknown as { __stealegg?: GameData }).__stealegg = gRef.current; setReady(true); } }); return () => { on = false; }; }, []);
  useEffect(() => { const t = setTimeout(() => setBanner(false), 9000); return () => clearTimeout(t); }, []);

  // sound needs a user gesture; fullscreen on first interaction (like the other games)
  useEffect(() => {
    const go = async () => {
      unlockAudio();
      try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.(); } catch { /* not allowed */ }
    };
    window.addEventListener('pointerdown', go, { once: true }); window.addEventListener('keydown', go, { once: true });
    return () => { window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
  }, []);

  // keyboard
  useEffect(() => {
    const set = (e: KeyboardEvent, v: boolean) => {
      const k = e.key.toLowerCase(), i = inpRef.current;
      if (k === 'w' || k === 'arrowup') i.up = v; else if (k === 's' || k === 'arrowdown') i.down = v;
      else if (k === 'a' || k === 'arrowleft') i.left = v; else if (k === 'd' || k === 'arrowright') i.right = v;
      else if ((k === 'e' || k === '5' || k === 'enter') && v && !e.repeat) i.act = true;
      else if ((e.code === 'Digit0' || e.code === 'Numpad0') && v && !e.repeat) i.sprintTog = true;
      else if (k === 'shift') i.shift = v;
      else if (k === 'escape' && v) closeShop();
      else return;
      if (k.startsWith('arrow')) e.preventDefault();
    };
    const d = (e: KeyboardEvent) => set(e, true), u = (e: KeyboardEvent) => set(e, false);
    window.addEventListener('keydown', d); window.addEventListener('keyup', u);
    const blur = () => { const i = inpRef.current; i.up = i.down = i.left = i.right = i.shift = false; };
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', d); window.removeEventListener('keyup', u); window.removeEventListener('blur', blur); };
  }, [closeShop]);

  // main loop
  useEffect(() => {
    if (!ready) return;
    const cv = canvasRef.current!, ctx = cv.getContext('2d')!;
    let raf = 0, last = performance.now(), cw = 0, ch = 0, dpr = 1;
    const resize = () => { dpr = Math.min(2, window.devicePixelRatio || 1); cw = window.innerWidth; ch = window.innerHeight; cv.width = Math.floor(cw * dpr); cv.height = Math.floor(ch * dpr); cv.style.width = `${cw}px`; cv.style.height = `${ch}px`; };
    resize(); window.addEventListener('resize', resize);
    const save = () => { if (gRef.current) persist(gRef.current); };
    const vis = () => { if (document.hidden) save(); };
    document.addEventListener('visibilitychange', vis); window.addEventListener('pagehide', save);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const g = gRef.current; if (!g) return;
      try {
        if (!shopRef.current) update(g, dt, inpRef.current, plotLayout(g.save), openShop); else { inpRef.current.act = false; g.lastPrompt = ''; }
        render(ctx, g, cw, ch, dpr, now);
      } catch (err) { console.error('stealegg frame failed', err); }
      setPrompt(p => (p === g.lastPrompt ? p : g.lastPrompt));
      setSprint(v => (v === g.player.sprint ? v : g.player.sprint));
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', save); save(); };
  }, [ready, openShop]);

  /* ---------- shop ---------- */
  const g = gRef.current;
  const lay = useMemo(() => (g ? plotLayout(g.save) : null), [g, shopOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const buy = (k: ShopKey) => {
    if (!g) return;
    const s = g.save, cost = shopCost(s, k), L = plotLayout(s);
    if (cost === null || s.cash < cost) { sfx.no(); return; }
    if (k === 'slot' && L.hatchPos.length >= L.hatchCap) { sfx.no(); return; }
    if (k === 'pen' && L.penPos.length >= L.penCap) { sfx.no(); return; }
    s.cash -= cost; sfx.buy(); burst(g, g.player.x, g.player.y - 60, ['#ffe14a', '#7dff9a', '#ffffff'], 22, 220, { up: 160, kind: 'star', size: 5 }); ring(g, g.player.x, g.player.y, '#ffe14a', 70);
    if (k === 'plot') s.plotLv++; else if (k === 'tread') s.treadLv++; else if (k === 'lava') s.lavaLv++; else if (k === 'arms') s.armsLv++; else if (k === 'slot') s.extraSlots++; else s.penUpg++;
    persist(g); force(n => n + 1);
  };
  const blockedReason = (k: ShopKey): string | null => {
    if (!g || !lay) return null;
    const L = plotLayout(g.save);
    if (k === 'slot' && L.hatchPos.length >= L.hatchCap) return 'Expand plot first';
    if (k === 'pen' && L.penPos.length >= L.penCap) return 'Expand plot first';
    return null;
  };
  const resetAll = () => {
    if (!window.confirm('Erase ALL Steal an Egg progress?')) return;
    clearSave(); const ns = newSave(); if (g) { g.save = ns; g.carry = null; g.nests = buildNests(); const l = plotLayout(ns); g.player.x = l.spawn.x; g.player.y = l.spawn.y; }
    force(n => n + 1);
  };

  const toggleMute = () => { muted = !muted; setMute(muted); unlockAudio(); };
  const actBtn = (
    <button
      className="pointer-events-auto absolute rounded-full text-white font-mono font-bold border-[3px] border-white/70 select-none flex items-center justify-center text-center leading-tight"
      style={{ right: 28, bottom: 40, width: 104, height: 104, fontSize: prompt ? 12 : 16, touchAction: 'none', background: prompt ? 'rgba(61,186,111,0.9)' : 'rgba(90,90,90,0.6)' }}
      onPointerDown={e => { e.preventDefault(); unlockAudio(); inpRef.current.act = true; }}
    >
      {prompt || 'ACTION'}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black overflow-hidden" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="block" />
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-white font-mono text-xl">Loading meadow…</div>}

      <button onClick={toggleMute} className="fixed left-2 top-[132px] z-[60] w-10 h-10 rounded-full bg-black/60 border-2 border-white/60 text-white text-lg select-none" aria-label={mute ? 'Unmute' : 'Mute'}>
        {mute ? '🔇' : '🔊'}
      </button>
      <button onClick={openShop} className="fixed right-3 top-3 z-[60] px-3 py-2 rounded-lg bg-black/60 border-2 border-yellow-300/80 text-yellow-200 font-mono font-bold text-sm select-none">🛒 Shop</button>

      {banner && ready && (
        <div className="fixed inset-x-0 top-[24%] z-[70] flex justify-center px-4 pointer-events-none select-none">
          <div className="px-5 py-4 rounded-2xl bg-black/80 border-2 border-yellow-300 font-mono text-center text-white max-w-2xl">
            <div className="font-bold text-lg sm:text-2xl">Steal an egg. Outrun the guard. Hatch it at home.</div>
            <div className="text-xs sm:text-sm mt-2 opacity-85">
              {isMobile ? 'Joystick to move • ACTION button to grab / place / sell' : 'WASD / arrows move • E or 5 to grab, place, sell and open the shop • hold Shift or press 0 to sprint (speed drops to 500)'}
              <br />🔥 Buy the Lava treadmill ($5M) to get fast enough for Hell, the map past the east edge of the farm.<br />Stand on the treadmill to get faster — heavier eggs need more speed. Pets in your pen earn cash.
            </div>
          </div>
        </div>
      )}

      {!shopOpen && (
        <div className="fixed inset-x-0 z-[56] flex justify-center pointer-events-none" style={{ bottom: isMobile ? 12 : 76 }}>
          <button
            className={`pointer-events-auto select-none rounded-full px-3 py-1 text-[11px] font-mono font-bold border ${sprint ? 'bg-orange-500/90 border-white text-white' : 'bg-black/55 border-white/40 text-white/90'}`}
            style={{ touchAction: 'none' }}
            onPointerDown={e => { e.preventDefault(); unlockAudio(); inpRef.current.sprintTog = true; }}
          >
            {sprint ? 'SPRINT ON · speed 500' : isMobile ? 'SPRINT' : 'Hold Shift or press 0 to sprint'}
          </button>
        </div>
      )}

      {!isMobile && prompt && !shopOpen && (
        <div className="fixed inset-x-0 bottom-8 z-[55] flex justify-center pointer-events-none">
          <div className="px-4 py-2 rounded-xl bg-black/75 border border-white/50 text-white font-mono font-bold text-base"><span className="text-yellow-300">[E]</span> {prompt}</div>
        </div>
      )}

      {isMobile && !shopOpen && (
        <div className="fixed inset-0 pointer-events-none z-40">
          <Joystick onMove={(x, y) => { inpRef.current.ax = x; inpRef.current.ay = y; }} />
          {actBtn}
        </div>
      )}
      {isMobile && isPortrait && <RotateDevicePrompt />}

      {shopOpen && g && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" onPointerDown={e => e.stopPropagation()}>
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border-2 border-yellow-300 bg-[#2a2118] p-4 font-mono text-white shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-yellow-300">🛒 SHOP</h2>
              <div className="text-green-300 font-bold text-lg">{fmtMoney(g.save.cash)}</div>
              <button onClick={closeShop} className="px-3 py-1 rounded border border-white/50 hover:bg-white/10">Close</button>
            </div>
            <div className="text-xs opacity-70 mb-3">Eggs are never for sale — you have to steal them. Speed {Math.round(g.save.speed)} · treadmill +{treadRate(g.save)}/s</div>
            <div className="space-y-2">
              {(Object.keys(SHOP) as ShopKey[]).map(k => {
                const cost = shopCost(g.save, k), lv = shopLevel(g.save, k), max = SHOP[k].costs.length, why = blockedReason(k);
                const can = cost !== null && g.save.cash >= cost && !why;
                return (
                  <div key={k} className={`flex items-center gap-3 p-3 rounded-xl border ${k === 'lava' ? 'bg-orange-900/40 border-orange-400/70' : 'bg-black/30 border-white/15'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold">{SHOP[k].name} <span className="text-xs text-yellow-200">Lv {lv}/{max}</span></div>
                      <div className="text-xs opacity-75">{k === 'lava' ? (lv === 0 ? `Hell-grade treadmill: +${LAVA_RATES[1]} speed/s (vs ${treadRate(g.save)}/s now). Your old treadmill gets 30% slower.` : lv < max ? `Lava treadmill now +${lavaRate(g.save)}/s → next level +${LAVA_RATES[lv + 1]}/s` : `Maxed: +${lavaRate(g.save)} speed/s`) : SHOP[k].desc}</div>
                    </div>
                    <button disabled={!can} onClick={() => buy(k)}
                      className={`px-3 py-2 rounded-lg font-bold text-sm min-w-[96px] ${can ? 'bg-green-500 text-black hover:bg-green-400' : 'bg-white/10 text-white/50'}`}>
                      {cost === null ? 'MAX' : why ?? (k === 'lava' && lv === 0 ? `Buy ${fmtMoney(cost)}` : fmtMoney(cost))}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-[11px] opacity-70 leading-relaxed">
              Pet income: {TIERS.map(t => `${TIER_INFO[t].label} ${SPECIES_BY_TIER[t].map(s => `${SPECIES[s].name} ${fmtMoney(SPECIES[s].rate)}/s`).join(', ')}`).join(' · ')}.
              Hell (east of the farm): {Object.entries(HELL_SPECIES_BY_TIER).map(([t, a]) => `${t} ${a!.map(x => `${SPECIES[x].name} ${fmtMoney(SPECIES[x].rate)}/s`).join(', ')}`).join(' · ')}. Fuse three identical pets to make one stronger one (unlocks with your first plot expansion).
            </div>
            <button onClick={resetAll} className="mt-3 text-[11px] underline opacity-50 hover:opacity-100">Reset all progress</button>
          </div>
        </div>
      )}

      <DraggableExitButton onExit={onExit} />
    </div>
  );
}

void BASE_SPEED;
