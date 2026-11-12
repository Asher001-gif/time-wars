import idleEUrl from '@/assets/combat/idle_e.png';
import idleWUrl from '@/assets/combat/idle_w.png';
import punchEUrl from '@/assets/combat/punch_e.png';
import punchWUrl from '@/assets/combat/punch_w.png';
import bombUrl from '@/assets/combat/bomb.png';
import shipUrl from '@/assets/combat/ship.webp';
import explosionUrl from '@/assets/combat/explosion.png';
import profileUrl from '@/assets/combat/profile.webp';

/* ============================ CONSTANTS ============================ */
export const W = 1600, H = 800, GROUND = 700;
export const DT = 1000 / 60;
const FW = 136, FH = 144, S = 1.7;              // sprite frame size + draw scale
const REST_Y = GROUND - 30;                       // Asteron floats above the ground
const SPEED = 6, AI_SPEED = 5.2, JUMP_V = 17.5, GRAV = 0.9;
const PUNCH_FRAME_MS = 45, PUNCH_MS = 360, PUNCH_HIT_AT = 150, PUNCH_CD = 480, REACH = 150;
const COMBO_MAX = 3, COMBO_WINDOW = 1000, COMBO_CD = 1500, COMBO_KB = 34, COMBO_STUN = 380;
const CHARGE_MS = 240, RECOVER_MS = 280, DASH_SPEED = 40;
export const MAX_HP = 250, XP_SKILL = 50, XP_ULT = 100;
const DMG = { punch: 4, skill: 15, ult: 35 } as const;
// ultimate timeline (ms)
const T_DROP = 1400, T_LEAVE = 2200, T_END = 3400;
const SHIP_W = 2400, SHIP_BOTTOM = 270, BLAST_R = 260, BOMB_HOMING = 4.5, GRACE_MS = 350;
const INTRO_MS = 1900;

/* ============================ TYPES ============================ */
export type Action = 'idle' | 'punch' | 'charge' | 'dash' | 'recover' | 'ult' | 'hit' | 'ko';
export interface Input { left: boolean; right: boolean; jump: number; punch: number; skill: number; ult: number }
export const newInput = (): Input => ({ left: false, right: false, jump: 0, punch: 0, skill: 0, ult: 0 });

export interface Fighter {
  id: 0 | 1; human: boolean; name: string;
  x: number; y: number; vx: number; vy: number; kx: number;
  face: 1 | -1; hp: number; hpTrail: number; xp: number;
  act: Action; t: number; cd: number; hitDone: boolean; stun: number; flash: number;
  tilt: number; moving: boolean; inv: boolean; grace: number; combo: number; comboT: number; fin: boolean;
  dashDir: 1 | -1; dashDest: number; dashHit: boolean;
  ai: { think: number; mode: number; modeT: number; dodgeX: number | null; dodgeAt: number; skillAt: number; inp: Input };
}
interface Ult { owner: number; t: number; dir: 1 | -1; cx0: number; tx: number; dropped: boolean; bomb: { x: number; y: number; vy: number } | null; blasted: boolean; tBlast: number; reacted: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; g: number; life: number; max: number; color: string; size: number; streak?: boolean }
interface Pop { x: number; y: number; text: string; t: number; color: string; big: boolean }
interface Ghost { x: number; y: number; face: 1 | -1; frame: number; ttl: number; sx: number }
interface Boom { x: number; y: number; t: number; scale: number; delay: number }
interface Ring { x: number; y: number; t: number; max: number; color: string }
export interface Game {
  f: [Fighter, Fighter]; time: number; phase: 'intro' | 'fight' | 'ko' | 'over'; phaseT: number;
  ults: Ult[]; booms: Boom[]; rings: Ring[]; parts: Particle[]; pops: Pop[]; ghosts: Ghost[];
  shake: number; whiteout: number; winner: number; reported: boolean;
  hint: { text: string; t: number } | null; slow: number;
}

/* ============================ ASSETS ============================ */
const urls = { idleE: idleEUrl, idleW: idleWUrl, punchE: punchEUrl, punchW: punchWUrl, bomb: bombUrl, ship: shipUrl, boom: explosionUrl, profile: profileUrl };
const imgs = {} as Record<keyof typeof urls, HTMLImageElement>;
const tints: Record<string, HTMLCanvasElement> = {};
let preloadP: Promise<void> | null = null;

export function preloadCombat(): Promise<void> {
  if (preloadP) return preloadP;
  preloadP = Promise.all((Object.keys(urls) as (keyof typeof urls)[]).map(k => new Promise<void>(res => {
    const im = new Image(); imgs[k] = im;
    im.onload = () => res(); im.onerror = () => res();
    im.src = urls[k];
  }))).then(() => undefined);
  return preloadP;
}
function tint(key: keyof typeof urls, color: string): HTMLCanvasElement {
  const id = key + color;
  if (tints[id]) return tints[id];
  const im = imgs[key], c = document.createElement('canvas');
  c.width = im.width || 1; c.height = im.height || 1;
  const x = c.getContext('2d')!;
  x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  tints[id] = c; return c;
}

/* ============================ SOUND (tiny synth) ============================ */
let actx: AudioContext | null = null, muted = false;
export const isMuted = () => muted;
export const setMuted = (m: boolean) => { muted = m; };
export function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* no audio */ }
}
function tone(f0: number, f1: number, dur: number, type: OscillatorType = 'sine', vol = 0.15) {
  if (muted || !actx) return;
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
}
function noise(dur: number, vol = 0.2, lp = 1800) {
  if (muted || !actx) return;
  const n = Math.floor(actx.sampleRate * dur), b = actx.createBuffer(1, n, actx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = vol;
  s.buffer = b; s.connect(f).connect(g).connect(actx.destination); s.start();
}
const sfx = {
  whoosh: () => tone(500, 180, 0.12, 'triangle', 0.08),
  hit: () => { noise(0.1, 0.25, 2500); tone(160, 60, 0.12, 'square', 0.1); },
  dash: () => { tone(220, 1400, 0.25, 'sawtooth', 0.07); noise(0.25, 0.1, 4000); },
  ship: () => tone(70, 55, 1.4, 'sawtooth', 0.09),
  drop: () => tone(900, 200, 0.6, 'sine', 0.07),
  boom: () => { noise(1.1, 0.5, 700); tone(90, 30, 0.9, 'sine', 0.35); },
  ko: () => tone(300, 40, 0.8, 'square', 0.12),
  ready: () => tone(660, 990, 0.15, 'triangle', 0.08),
};

/* ============================ HELPERS ============================ */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function mkFighter(id: 0 | 1, human: boolean, name: string, x: number, face: 1 | -1): Fighter {
  return {
    id, human, name, x, y: REST_Y, vx: 0, vy: 0, kx: 0, face, hp: MAX_HP, hpTrail: MAX_HP, xp: 0,
    act: 'idle', t: 0, cd: 0, hitDone: false, stun: 0, flash: 0, tilt: 0, moving: false, inv: false, grace: 0, combo: 0, comboT: 0, fin: false,
    dashDir: 1, dashDest: 0, dashHit: false,
    ai: { think: 600, mode: 0, modeT: 0, dodgeX: null, dodgeAt: 0, skillAt: 0, inp: newInput() },
  };
}

export function createCombat(): Game {
  return {
    f: [mkFighter(0, true, 'YOU', 420, 1), mkFighter(1, false, 'OPPONENT', 1180, -1)],
    time: 0, phase: 'intro', phaseT: 0, ults: [], booms: [], rings: [], parts: [], pops: [], ghosts: [],
    shake: 0, whiteout: 0, winner: -1, reported: false, hint: null, slow: 1,
  };
}

function burst(g: Game, x: number, y: number, color: string, n: number, speed: number, size = 4) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(speed * 0.3, speed);
    g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.25, life: 0, max: rnd(300, 600), color, size: rnd(size * 0.6, size) });
  }
}

/* ============================ COMBAT ACTIONS ============================ */
function damage(g: Game, att: Fighter, def: Fighter, kind: 'punch' | 'skill' | 'ult', amount: number, dir: number): boolean {
  if (def.act === 'ko') return false;
  // two bombs landing within half a second of each other can KO both fighters -> double KO
  const trade = g.phase === 'ko' && kind === 'ult' && g.phaseT < 500 && def.id === g.winner;
  if ((g.phase === 'ko' || g.phase === 'over') && !trade) return false;
  if (def.inv || def.grace > 0) {                 // dashing through it / just got up: nothing lands
    if (kind === 'ult') g.pops.push({ x: def.x, y: def.y - FH * S + 10, text: 'DODGED!', t: 0, color: '#7fd0ff', big: true });
    return false;
  }
  def.hp = Math.max(0, def.hp - amount);
  def.flash = 140;
  att.xp = Math.min(XP_ULT, att.xp + (kind === 'punch' ? 8 : kind === 'skill' ? 10 : 0));
  def.xp = Math.min(XP_ULT, def.xp + amount * 0.7);
  g.pops.push({ x: def.x + rnd(-20, 20), y: def.y - FH * S + 10, text: String(Math.round(amount)), t: 0, color: kind === 'ult' ? '#ffd23f' : kind === 'skill' ? '#6fd3ff' : '#ffffff', big: kind !== 'punch' });
  burst(g, def.x, def.y - 100, kind === 'punch' ? '#ffffff' : '#7fd0ff', kind === 'punch' ? 8 : 18, kind === 'punch' ? 5 : 9);
  g.shake = Math.max(g.shake, kind === 'punch' ? 5 : kind === 'skill' ? 12 : 30);
  sfx.hit();
  if (def.hp <= 0 && trade) {
    def.act = 'ko'; def.t = 0; def.kx = dir * 16; def.vy = -11; g.winner = -1; g.shake = 40;
    g.pops.push({ x: W / 2, y: 250, text: 'DOUBLE K.O.!', t: 0, color: '#ffd23f', big: true });
    return true;
  }
  if (def.hp <= 0) {
    def.act = 'ko'; def.t = 0; def.kx = dir * 16; def.vy = -11; def.inv = false;
    g.phase = 'ko'; g.phaseT = 0; g.winner = att.id; g.shake = 26; g.slow = 0.35;
    g.ults = g.ults.filter(u => u.owner !== def.id || u.dropped);
    sfx.ko();
    return true;
  }
  if (def.act !== 'ult') {                       // an ultimate can't be cancelled by damage
    def.act = 'hit'; def.t = 0; def.hitDone = true;
    def.stun = kind === 'punch' ? 240 : kind === 'skill' ? 520 : 750;
    def.kx = dir * (kind === 'punch' ? 9 : kind === 'skill' ? 16 : 22);
    if (kind !== 'punch') def.vy = -6;
    def.hitDone = false;
  }
  return true;
}

function startPunch(f: Fighter) {
  f.act = 'punch'; f.t = 0; f.hitDone = false; f.vx = 0; sfx.whoosh();
  f.combo += 1; f.comboT = COMBO_WINDOW; f.fin = f.combo >= COMBO_MAX;
  // after 3 punches the puncher has to wait (cooldown); the opponent gets knocked back on the 3rd
  if (f.combo >= COMBO_MAX) { f.cd = COMBO_CD; f.combo = 0; f.comboT = 0; } else f.cd = PUNCH_CD;
}

function startSkill(g: Game, f: Fighter, o: Fighter) {
  f.xp -= XP_SKILL; f.act = 'charge'; f.t = 0; f.vx = 0; f.inv = false;
  f.face = (o.x >= f.x ? 1 : -1);
  f.dashDir = f.face;
  g.rings.push({ x: f.x, y: f.y - 100, t: 0, max: 400, color: '#4aa8ff' });
}

function beginDash(g: Game, f: Fighter, o: Fighter) {
  f.act = 'dash'; f.t = 0; f.inv = true; f.dashHit = false;
  f.dashDir = (o.x >= f.x ? 1 : -1);
  f.face = f.dashDir;
  f.dashDest = clamp(o.x + f.dashDir * 240, 70, W - 70);
  sfx.dash();
}

function startUlt(g: Game, f: Fighter, o: Fighter) {
  f.xp = 0; f.act = 'ult'; f.t = 0; f.vx = 0;
  const dir: 1 | -1 = f.face;
  g.ults.push({ owner: f.id, t: 0, dir, cx0: dir > 0 ? -SHIP_W / 2 - 60 : W + SHIP_W / 2 + 60, tx: o.x, dropped: false, bomb: null, blasted: false, tBlast: 0, reacted: false });
  sfx.ship();
}

function shipCx(u: Ult): number {
  const t = u.t;
  if (t < T_DROP) return lerp(u.cx0, u.tx, easeOut(t / T_DROP));
  if (t < T_LEAVE) return u.tx + u.dir * (t - T_DROP) * 0.03;
  const e = clamp((t - T_LEAVE) / 1000, 0, 1);
  return u.tx + u.dir * (T_LEAVE - T_DROP) * 0.03 + u.dir * e * e * e * (W + SHIP_W);
}

function blast(g: Game, u: Ult, x: number, y: number) {
  const owner = g.f[u.owner], foe = g.f[1 - u.owner];
  const by = Math.min(GROUND - 150, y);
  g.booms.push({ x, y: by, t: 0, scale: 6.4, delay: 0 });
  g.booms.push({ x: x - 190, y: by + 30, t: 0, scale: 4.4, delay: 110 });
  g.booms.push({ x: x + 200, y: by + 30, t: 0, scale: 4.8, delay: 190 });
  g.rings.push({ x, y: GROUND, t: 0, max: 700, color: '#ffd27a' });
  g.rings.push({ x, y: GROUND, t: -120, max: 900, color: '#ff8a3d' });
  g.whiteout = 1; g.shake = 46; sfx.boom();
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI * rnd(0.05, 0.95), s = rnd(6, 24);
    g.parts.push({ x: x + rnd(-60, 60), y: GROUND - 40, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.5, life: 0, max: rnd(600, 1300), color: ['#ffd23f', '#ff8a3d', '#ff4d2d', '#fff4c2'][i % 4], size: rnd(4, 11) });
  }
  const dx = foe.x - x;
  if (Math.abs(dx) < BLAST_R && foe.act !== 'ko') {          // radius damage: full on a direct hit, 65% at the edge
    damage(g, owner, foe, 'ult', Math.round(DMG.ult * (1 - 0.35 * Math.abs(dx) / BLAST_R)), dx >= 0 ? 1 : -1);
  }
}

/* ============================ INPUT / AI ============================ */
function applyInput(g: Game, f: Fighter, o: Fighter, inp: Input) {
  f.moving = false;
  if (f.act !== 'idle' || g.phase !== 'fight') { f.vx = 0; return; }
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  const sp = f.human ? SPEED : AI_SPEED;
  f.vx = dir * sp;
  if (dir !== 0) { f.face = dir as 1 | -1; f.moving = true; }
  else if (!f.human && o.act !== 'ko') f.face = o.x >= f.x ? 1 : -1;   // opponent turns to face you when it stops
  const grounded = f.y >= REST_Y - 1;
  if (inp.jump > 0 && grounded) { f.vy = -JUMP_V; inp.jump = 0; }
  if (inp.punch > 0 && f.cd <= 0) { startPunch(f); inp.punch = 0; return; }
  if (inp.skill > 0) {
    if (f.xp >= XP_SKILL) { startSkill(g, f, o); inp.skill = 0; return; }
    if (f.human) g.hint = { text: 'SKILL NEEDS 50% XP', t: 900 };
    inp.skill = 0;
  }
  if (inp.ult > 0) {
    if (f.xp >= XP_ULT - 0.01) { startUlt(g, f, o); inp.ult = 0; return; }
    if (f.human) g.hint = { text: 'ULTIMATE NEEDS FULL XP', t: 900 };
    inp.ult = 0;
  }
}

function aiControl(g: Game, f: Fighter, o: Fighter) {
  const a = f.ai, inp = a.inp;
  inp.jump = Math.max(0, inp.jump - 1); inp.punch = Math.max(0, inp.punch - 1);
  inp.skill = Math.max(0, inp.skill - 1); inp.ult = Math.max(0, inp.ult - 1);
  if (g.phase !== 'fight' || o.act === 'ko') { inp.left = inp.right = false; return; }
  // react to a falling bomb: rarely run, rarely counter with the (invulnerable) dash
  for (const u of g.ults) {
    if (u.owner === f.id || u.reacted || !u.dropped) continue;
    u.reacted = true;
    const r = Math.random();
    if (r < 0.2) { a.dodgeX = clamp(f.x + (f.x < u.tx ? -1 : 1) * 420, 100, W - 100); a.dodgeAt = g.time + rnd(80, 200); }
    else if (r < 0.4 && f.xp >= XP_SKILL) a.skillAt = g.time + rnd(120, 260);
  }
  if (a.skillAt && g.time >= a.skillAt) { a.skillAt = 0; inp.skill = 8; }
  if (a.dodgeX !== null) {
    if (g.time >= a.dodgeAt && f.act === 'idle') {
      const d = a.dodgeX - f.x;
      inp.left = d < -8; inp.right = d > 8;
      if (Math.abs(d) <= 8 || g.ults.length === 0) { a.dodgeX = null; inp.left = inp.right = false; }
    }
    return;
  }
  a.think -= DT; a.modeT -= DT;
  if (a.modeT <= 0) { a.modeT = rnd(1200, 2600); const r = Math.random(); a.mode = r < 0.6 ? 0 : r < 0.85 ? 1 : 2; }
  if (a.think > 0) return;
  a.think = rnd(90, 190);
  const dx = o.x - f.x, dist = Math.abs(dx), toward = dx >= 0;
  inp.left = inp.right = false;
  if (a.mode === 0) { if (dist > 125) { inp.right = toward; inp.left = !toward; } }
  else if (a.mode === 1) {
    if (dist < 250) { inp.right = !toward; inp.left = toward; }
    else if (dist > 340) { inp.right = toward; inp.left = !toward; }
  } else { if (dist < 320) { inp.right = !toward; inp.left = toward; } }
  if (f.act !== 'idle') return;
  if (f.xp >= XP_ULT - 0.01 && g.ults.every(u => u.owner !== f.id) && Math.random() < 0.55) { inp.ult = 6; return; }
  if (f.xp >= XP_SKILL && dist < 520 && Math.random() < (f.xp >= 90 ? 0.1 : 0.25)) { inp.skill = 6; return; }
  if (dist < REACH - 10 && f.cd <= 0 && Math.random() < 0.55) inp.punch = 6;
  if (Math.random() < 0.035) inp.jump = 4;
}

/* ============================ UPDATE ============================ */
function updateFighter(g: Game, f: Fighter, o: Fighter) {
  f.t += DT; f.grace = Math.max(0, f.grace - DT); f.cd = Math.max(0, f.cd - DT); f.flash = Math.max(0, f.flash - DT);
  if (f.comboT > 0) { f.comboT -= DT; if (f.comboT <= 0) f.combo = 0; }
  switch (f.act) {
    case 'punch':
      if (!f.hitDone && f.t >= PUNCH_HIT_AT) {
        f.hitDone = true;
        const dx = (o.x - f.x) * f.face;
        if (dx > -30 && dx < REACH && Math.abs(o.y - f.y) < 170) {
          const finisher = f.fin;   // this is the 3rd punch of the combo
          if (damage(g, f, o, 'punch', DMG.punch, f.face) && finisher && o.act === 'hit') {
            o.kx = f.face * COMBO_KB; o.stun = COMBO_STUN;   // opponent flies back: walk forward again to punch
            g.shake = Math.max(g.shake, 14);
            g.pops.push({ x: o.x, y: o.y - FH * S - 20, text: 'KNOCKBACK!', t: 0, color: '#ffd23f', big: true });
          }
        }
      }
      if (f.t >= PUNCH_MS) { f.act = 'idle'; f.t = 0; }
      break;
    case 'charge':
      f.vy = 0; f.y = lerp(f.y, Math.min(f.y, REST_Y - 20), 0.1);
      if (f.t >= CHARGE_MS) beginDash(g, f, o);
      break;
    case 'dash': {
      f.vy = 0; f.kx = 0;
      f.x += f.dashDir * DASH_SPEED;
      f.y = lerp(f.y, o.y, 0.25);
      g.ghosts.push({ x: f.x, y: f.y, face: f.face, frame: 5, ttl: 280, sx: 1.25 });
      if (Math.random() < 0.8) g.parts.push({ x: f.x - f.dashDir * 40, y: f.y - rnd(40, 190), vx: -f.dashDir * rnd(4, 9), vy: 0, g: 0, life: 0, max: 260, color: '#8fd4ff', size: rnd(30, 70), streak: true });
      if (!f.dashHit && (f.x - o.x) * f.dashDir >= 0) {
        f.dashHit = true;
        damage(g, f, o, 'skill', DMG.skill, f.dashDir);
      }
      if ((f.x - f.dashDest) * f.dashDir >= 0) {
        f.x = f.dashDest; f.act = 'recover'; f.t = 0; f.inv = false;
        f.face = (o.x >= f.x ? 1 : -1);
        burst(g, f.x, f.y - 100, '#7fd0ff', 14, 8);
      }
      break;
    }
    case 'recover': if (f.t >= RECOVER_MS) { f.act = 'idle'; f.t = 0; } break;
    case 'hit': if (f.t >= f.stun) { f.act = 'idle'; f.t = 0; if (f.stun >= 500) f.grace = GRACE_MS; } break;
    default: break;
  }
  // physics
  if (f.act !== 'dash' && f.act !== 'charge') {
    if (f.y < REST_Y || f.vy < 0) { f.vy += GRAV; f.y += f.vy; if (f.y >= REST_Y) { f.y = REST_Y; f.vy = 0; } }
  }
  if (f.act !== 'dash') { f.x += f.vx + f.kx; f.kx *= 0.86; if (Math.abs(f.kx) < 0.1) f.kx = 0; }
  f.x = clamp(f.x, 80, W - 80);
  // lean into the direction of travel
  const target = f.act === 'idle' && f.moving ? Math.sign(f.vx) * 0.2 : f.act === 'hit' ? -f.face * 0.22 : f.act === 'dash' ? f.dashDir * 0.12 : 0;
  f.tilt = lerp(f.tilt, target, 0.18);
}

function updateUlts(g: Game) {
  for (const u of g.ults) {
    u.t += DT;
    const owner = g.f[u.owner], foe = g.f[1 - u.owner];
    if (!u.dropped) {
      if (owner.act === 'ko') { u.t = T_END + 1; continue; }
      u.tx = clamp(foe.x, 100, W - 100);
      if (u.t >= T_DROP) {
        u.dropped = true;
        u.bomb = { x: shipCx(u), y: SHIP_BOTTOM - 10, vy: 2 };
        sfx.drop();
      }
    } else if (u.bomb) {
      const bm = u.bomb;
      bm.vy += 0.75; bm.y += bm.vy;
      if (foe.act !== 'ko') bm.x += clamp(foe.x - bm.x, -BOMB_HOMING, BOMB_HOMING);   // locks on: it chases its target
      const contact = foe.act !== 'ko' && Math.abs(bm.x - foe.x) < 70 && bm.y >= foe.y - FH * S * 0.8 && bm.y < foe.y;
      if (bm.y >= GROUND - 40 || contact) { blast(g, u, bm.x, bm.y); u.bomb = null; u.blasted = true; u.tBlast = u.t; }
    } else if (u.blasted && u.t >= u.tBlast + 350 && owner.act === 'ult') {
      owner.act = 'idle'; owner.t = 0;
    }
  }
  g.ults = g.ults.filter(u => u.t <= T_END);
  for (const f of g.f) if (f.act === 'ult' && !g.ults.some(u => u.owner === f.id)) { f.act = 'idle'; f.t = 0; }
}

export function stepCombat(g: Game, inp: Input) {
  const dt = DT * g.slow;
  g.time += dt; g.phaseT += dt;
  const [p, o] = g.f;
  if (g.phase === 'intro' && g.phaseT >= INTRO_MS) { g.phase = 'fight'; g.phaseT = 0; sfx.ready(); }
  if (g.phase === 'ko' && g.phaseT > 700) g.slow = lerp(g.slow, 1, 0.05);
  if (g.phase === 'ko' && g.phaseT >= 2200) { g.phase = 'over'; g.phaseT = 0; }
  aiControl(g, o, p);
  applyInput(g, p, o, inp);
  applyInput(g, o, p, o.ai.inp);
  updateFighter(g, p, o); updateFighter(g, o, p);
  updateUlts(g);
  // both dash and cross paths: they simply hit each other (neither is invulnerable to the other's dash)
  if (p.act === 'dash' && o.act === 'dash' && p.dashDir !== o.dashDir && (p.x - o.x) * p.dashDir >= 0) {
    const pd = p.dashDir, od = o.dashDir;
    p.inv = false; o.inv = false; p.grace = 0; o.grace = 0;
    damage(g, p, o, 'skill', DMG.skill, pd);
    damage(g, o, p, 'skill', DMG.skill, od);
  }
  // keep the two fighters from overlapping (not while dashing through)
  if (!p.inv && !o.inv && p.act !== 'ko' && o.act !== 'ko' && Math.abs(p.y - o.y) < 150) {
    const d = o.x - p.x, m = 70 - Math.abs(d);
    if (m > 0) { const s = d >= 0 ? 1 : -1; p.x -= s * m * 0.25; o.x += s * m * 0.25; }
  }
  // effects
  for (const q of g.parts) { q.life += dt; q.x += q.vx; q.y += q.vy; q.vy += q.g; }
  g.parts = g.parts.filter(q => q.life < q.max);
  for (const q of g.pops) { q.t += dt; q.y -= 0.8; }
  g.pops = g.pops.filter(q => q.t < 900);
  for (const q of g.ghosts) q.ttl -= dt;
  g.ghosts = g.ghosts.filter(q => q.ttl > 0);
  for (const b of g.booms) b.t += dt;
  g.booms = g.booms.filter(b => b.t - b.delay < 700);
  for (const r of g.rings) r.t += dt;
  g.rings = g.rings.filter(r => r.t < r.max + 100);
  g.shake *= 0.9; g.whiteout *= 0.93;
  for (const f of g.f) f.hpTrail = f.hpTrail > f.hp ? Math.max(f.hp, f.hpTrail - Math.max(0.12, (f.hpTrail - f.hp) * 0.04)) : f.hp;
  if (g.hint) { g.hint.t -= dt; if (g.hint.t <= 0) g.hint = null; }
  inp.jump = Math.max(0, inp.jump - 1); inp.punch = Math.max(0, inp.punch - 1);
  inp.skill = Math.max(0, inp.skill - 1); inp.ult = Math.max(0, inp.ult - 1);
}

/* ============================ BACKGROUND (calm blue mountains) ============================ */
const BGX = 500, BGW = W + BGX * 2;
let bgCanvas: HTMLCanvasElement | null = null;
const cloudSprites: HTMLCanvasElement[] = [];

function ridge(x: number, seed: number, amp: number, f: number, peaky: boolean) {
  if (peaky) return Math.pow(1 - Math.abs(Math.sin(x * f + seed)), 1.5) * amp * 0.75 + Math.sin(x * f * 2.7 + seed * 2) * amp * 0.12;
  return (Math.sin(x * f + seed) * 0.5 + 0.5) * amp * 0.62 + Math.sin(x * f * 2.3 + seed * 1.7) * amp * 0.22 + Math.sin(x * f * 5.1 + seed * 0.6) * amp * 0.08;
}
function buildBackground() {
  const c = document.createElement('canvas'); c.width = BGW; c.height = H;
  const x = c.getContext('2d')!;
  const sky = x.createLinearGradient(0, 0, 0, 620);
  sky.addColorStop(0, '#071735'); sky.addColorStop(0.4, '#14397a'); sky.addColorStop(0.75, '#3b74be'); sky.addColorStop(1, '#a6cdf3');
  x.fillStyle = sky; x.fillRect(0, 0, BGW, H);
  // faint stars
  let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.4})`; const s = r() < 0.15 ? 2 : 1; x.fillRect(r() * BGW, r() * 260, s, s); }
  // soft moon glow
  const mx = BGX + 1180, my = 150;
  const glow = x.createRadialGradient(mx, my, 0, mx, my, 220);
  glow.addColorStop(0, 'rgba(235,245,255,0.55)'); glow.addColorStop(0.2, 'rgba(190,220,255,0.22)'); glow.addColorStop(1, 'rgba(190,220,255,0)');
  x.fillStyle = glow; x.fillRect(mx - 240, my - 240, 480, 480);
  x.fillStyle = '#eef6ff'; x.beginPath(); x.arc(mx, my, 34, 0, 7); x.fill();
  x.fillStyle = 'rgba(170,200,235,0.45)'; x.beginPath(); x.arc(mx - 9, my - 6, 8, 0, 7); x.arc(mx + 12, my + 10, 5, 0, 7); x.fill();
  // mountain layers
  const layers = [
    { base: 500, amp: 190, f: 0.0042, seed: 1.3, top: '#7ea6dd', bot: '#4f78b8', peaky: true },
    { base: 548, amp: 150, f: 0.0056, seed: 4.1, top: '#5f8acb', bot: '#3a64a6', peaky: true },
    { base: 600, amp: 120, f: 0.0074, seed: 2.2, top: '#46709f', bot: '#27487f', peaky: false },
    { base: 655, amp: 85, f: 0.0105, seed: 5.5, top: '#2f5589', bot: '#183360', peaky: false },
  ];
  for (const L of layers) {
    const pts: [number, number][] = [];
    let minY = H;
    for (let px = 0; px <= BGW; px += 6) { const py = L.base - ridge(px - BGX, L.seed, L.amp, L.f, L.peaky); pts.push([px, py]); minY = Math.min(minY, py); }
    const gr = x.createLinearGradient(0, minY, 0, L.base + 60);
    gr.addColorStop(0, L.top); gr.addColorStop(1, L.bot);
    x.fillStyle = gr; x.beginPath(); x.moveTo(0, H);
    for (const [px, py] of pts) x.lineTo(px, py);
    x.lineTo(BGW, H); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(210,230,255,0.28)'; x.lineWidth = 1.5; x.beginPath();
    pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
    const mist = x.createLinearGradient(0, L.base - 70, 0, L.base + 50);
    mist.addColorStop(0, 'rgba(170,205,245,0)'); mist.addColorStop(0.7, 'rgba(170,205,245,0.2)'); mist.addColorStop(1, 'rgba(170,205,245,0)');
    x.fillStyle = mist; x.fillRect(0, L.base - 70, BGW, 120);
  }
  // ground
  const gg = x.createLinearGradient(0, GROUND - 6, 0, H);
  gg.addColorStop(0, '#2b4f88'); gg.addColorStop(0.12, '#1a3668'); gg.addColorStop(1, '#0a1630');
  x.fillStyle = gg; x.fillRect(0, GROUND, BGW, H - GROUND);
  x.fillStyle = 'rgba(150,200,255,0.55)'; x.fillRect(0, GROUND, BGW, 2);
  x.fillStyle = 'rgba(120,170,235,0.10)';
  for (let i = -20; i < 60; i++) { x.beginPath(); x.moveTo(BGW / 2 + i * 40, GROUND + 2); x.lineTo(BGW / 2 + i * 150, H); x.lineTo(BGW / 2 + i * 150 + 4, H); x.lineTo(BGW / 2 + i * 40 + 1, GROUND + 2); x.fill(); }
  bgCanvas = c;
  for (let k = 0; k < 3; k++) {
    const cc = document.createElement('canvas'); cc.width = 320; cc.height = 90;
    const cx = cc.getContext('2d')!;
    for (let i = 0; i < 9; i++) {
      const bx = 50 + r() * 220, by = 45 + (r() - 0.5) * 22, br = 20 + r() * 26;
      const gr = cx.createRadialGradient(bx, by, 0, bx, by, br);
      gr.addColorStop(0, 'rgba(215,232,255,0.5)'); gr.addColorStop(1, 'rgba(215,232,255,0)');
      cx.fillStyle = gr; cx.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    cloudSprites.push(cc);
  }
}

/* ============================ RENDER ============================ */
function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, trail: number, colors: [string, string], track: string, trailColor: string | null, mirror: boolean) {
  ctx.fillStyle = track; ctx.fillRect(x, y, w, h);
  const fx = (fr: number) => (mirror ? x + w - w * fr : x);
  if (trailColor && trail > frac) { ctx.fillStyle = trailColor; ctx.fillRect(fx(trail), y, w * trail, h); }
  if (frac > 0) {
    const gr = ctx.createLinearGradient(x, y, mirror ? x + w : x + w, y);
    if (mirror) { gr.addColorStop(0, colors[1]); gr.addColorStop(1, colors[0]); } else { gr.addColorStop(0, colors[0]); gr.addColorStop(1, colors[1]); }
    ctx.fillStyle = gr; ctx.fillRect(fx(frac), y, w * frac, h);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(fx(frac), y, w * frac, h * 0.38);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
}

function drawHud(ctx: CanvasRenderingContext2D, g: Game, f: Fighter, right: boolean) {
  const ICON = 86, BW = 400, y = 30, pad = 130;
  const ix = right ? W - pad - ICON : pad;
  const bx = right ? ix - 16 - BW : ix + ICON + 16;
  ctx.fillStyle = '#000'; ctx.fillRect(ix, y, ICON, ICON);                       // profile icon
  if (imgs.profile.width) { ctx.imageSmoothingEnabled = true; ctx.drawImage(imgs.profile, ix, y, ICON, ICON); }
  ctx.strokeStyle = f.human ? '#6aa8ff' : '#ff6a78'; ctx.lineWidth = 4; ctx.strokeRect(ix, y, ICON, ICON);
  ctx.font = 'bold 22px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff'; ctx.textAlign = right ? 'right' : 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4;
  ctx.fillText(f.name, right ? bx + BW : bx, y + 20);
  ctx.shadowBlur = 0;
  drawBar(ctx, bx, y + 28, BW, 30, f.hp / MAX_HP, f.hpTrail / MAX_HP, ['#ff7d89', '#d7263d'], '#3a0a12', '#8f1727', right);
  ctx.font = 'bold 15px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#fff';
  ctx.fillText(`HP ${Math.ceil(f.hp)}`, right ? bx + BW - 8 : bx + 8, y + 49);
  const full = f.xp >= XP_ULT - 0.01, half = f.xp >= XP_SKILL;
  if (full) { ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 14 + Math.sin(g.time / 120) * 6; }
  else if (half) { ctx.shadowColor = '#5b7cff'; ctx.shadowBlur = 8; }
  drawBar(ctx, bx, y + 64, BW, 18, f.xp / XP_ULT, f.xp / XP_ULT, ['#2f54eb', '#9b5cf6'], '#10163a', null, right);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(bx + BW / 2 - 1, y + 62, 2, 22);                                 // 50% notch
  ctx.font = 'bold 14px ui-monospace, Menlo, monospace';
  const labels: [string, boolean, string][] = [['4 PUNCH', true, '#fff'], ['2 SKILL', half, '#7fd0ff'], ['8 ULTIMATE', full, '#c4a5ff']];
  let lx = right ? bx + BW : bx;
  for (const [t, on, col] of labels) {
    ctx.fillStyle = on ? col : 'rgba(255,255,255,0.3)';
    if (on && t !== '4 PUNCH') ctx.globalAlpha = 0.75 + 0.25 * Math.sin(g.time / 140);
    ctx.fillText(t, lx, y + 104); ctx.globalAlpha = 1;
    lx += (right ? -1 : 1) * (ctx.measureText(t).width + 18);
  }
}

function drawFighter(ctx: CanvasRenderingContext2D, g: Game, f: Fighter) {
  const east = f.face > 0;
  let key: 'idleE' | 'idleW' | 'punchE' | 'punchW' = east ? 'idleE' : 'idleW', frame = 0, sx = 1, sy = 1;
  const idleSpeed = f.moving ? 70 : 100;
  frame = Math.floor(g.time / idleSpeed) % 11;
  if (f.act === 'punch') { key = east ? 'punchE' : 'punchW'; frame = Math.min(7, Math.floor(f.t / PUNCH_FRAME_MS)); }
  else if (f.act === 'dash') { key = east ? 'punchE' : 'punchW'; frame = 5; sx = 1.25; sy = 0.92; }
  else if (f.act === 'charge') { frame = 0; sy = 1 - 0.1 * Math.min(1, f.t / CHARGE_MS); sx = 1 + 0.08 * Math.min(1, f.t / CHARGE_MS); }
  else if (f.act === 'hit' || f.act === 'ko') frame = 3;
  const strip = imgs[key]; if (!strip.width) return;
  const air = REST_Y - f.y;
  const bob = f.act === 'ko' ? 0 : Math.sin(g.time / (f.moving ? 150 : 250) + f.id * 2) * (f.moving ? 4 : 8);
  const cy = f.y + bob - (FH * S) / 2;
  ctx.save();
  ctx.translate(f.x, cy);
  let rot = f.tilt;
  if (f.act === 'ko') rot = -f.face * Math.min(1.45, f.t * 0.0035);
  ctx.rotate(rot); ctx.scale(sx, sy);
  if (f.grace > 0) ctx.globalAlpha = 0.45 + 0.35 * Math.sin(g.time / 40);
  if (f.act === 'charge' || f.act === 'dash') {
    const gl = ctx.createRadialGradient(0, 0, 10, 0, 0, 170);
    gl.addColorStop(0, 'rgba(110,190,255,0.75)'); gl.addColorStop(1, 'rgba(110,190,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(-170, -170, 340, 340);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(strip, frame * FW, 0, FW, FH, -FW * S / 2, -FH * S / 2, FW * S, FH * S);
  if (f.act === 'charge' || f.act === 'dash') {
    ctx.globalAlpha = 0.55; ctx.drawImage(tint(key, '#38a0ff'), frame * FW, 0, FW, FH, -FW * S / 2, -FH * S / 2, FW * S, FH * S); ctx.globalAlpha = 1;
  }
  if (f.flash > 0) {
    ctx.globalAlpha = Math.min(1, f.flash / 100) * 0.9;
    ctx.drawImage(tint(key, '#ffffff'), frame * FW, 0, FW, FH, -FW * S / 2, -FH * S / 2, FW * S, FH * S); ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (f.act !== 'ko') {   // name tag
    const ty = f.y - FH * S - 14 + bob;
    ctx.font = 'bold 18px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = f.human ? '#8ec0ff' : '#ff8d99';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText(f.human ? 'YOU' : 'OPPONENT', f.x, ty - 10);
    ctx.beginPath(); ctx.moveTo(f.x - 8, ty - 2); ctx.lineTo(f.x + 8, ty - 2); ctx.lineTo(f.x, ty + 8); ctx.fill();
    ctx.shadowBlur = 0;
  }
  void air;
}


/* ============================ BEAST K.O. BANNER ============================ */
function drawKO(ctx: CanvasRenderingContext2D, g: Game) {
  const dbl = g.winner < 0, text = dbl ? 'DOUBLE K.O.' : 'K.O.';
  const t = g.phase === 'over' ? 2000 + g.phaseT : g.phaseT;            // ms since the knockout
  const slam = clamp(t / 220, 0, 1);
  const sc = slam < 1 ? lerp(4.2, 0.92, easeOut(slam)) : 1 + Math.sin(t / 130) * 0.025 + Math.max(0, 0.08 - (t - 220) / 1500);
  const size = dbl ? 190 : 270, cx = W / 2, cy = 380;
  const c1 = dbl ? '#fff2a8' : '#ffe27a', c2 = dbl ? '#ffb020' : '#ff3b2f', c3 = dbl ? '#d96a00' : '#8f0a14';
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // dark vignette so the word pops
  ctx.globalAlpha = clamp(t / 250, 0, 0.55); ctx.fillStyle = '#000'; ctx.fillRect(-BGX, -400, BGW, H + 800); ctx.globalAlpha = 1;
  // spinning slash rays behind the word
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t / 2200);
  const rays = 18, ra = clamp(t / 300, 0, 1) * 0.35;
  for (let i = 0; i < rays; i++) {
    ctx.rotate(Math.PI * 2 / rays); ctx.fillStyle = i % 2 ? `rgba(255,70,50,${ra})` : `rgba(255,210,80,${ra * 0.7})`;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1500, -60); ctx.lineTo(1500, 60); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // shockwave ring on impact
  if (t < 600) { const e = easeOut(t / 600); ctx.globalAlpha = 1 - e; ctx.strokeStyle = '#fff'; ctx.lineWidth = 26 * (1 - e) + 3; ctx.beginPath(); ctx.arc(cx, cy, 80 + e * 900, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  // the word: slam in, then shake a little
  const jx = t < 900 ? (Math.random() - 0.5) * 14 * (1 - t / 900) : 0, jy = t < 900 ? (Math.random() - 0.5) * 14 * (1 - t / 900) : 0;
  ctx.translate(cx + jx, cy + jy); ctx.rotate(-0.07); ctx.scale(sc, sc);
  ctx.font = `900 ${size}px Impact, "Arial Black", ui-monospace, sans-serif`;
  ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  ctx.shadowColor = dbl ? 'rgba(255,170,30,0.9)' : 'rgba(255,40,30,0.95)'; ctx.shadowBlur = 50 + Math.sin(t / 90) * 14;
  ctx.lineWidth = size * 0.17; ctx.strokeStyle = '#000'; ctx.strokeText(text, 0, 14);                // heavy black outline
  ctx.shadowBlur = 0;
  ctx.fillStyle = c3; ctx.fillText(text, 0, size * 0.045 + 14);                                         // 3D extrusion
  ctx.lineWidth = size * 0.07; ctx.strokeStyle = '#fff'; ctx.strokeText(text, 0, 14);                  // white rim
  const gr = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
  gr.addColorStop(0, c1); gr.addColorStop(0.5, c2); gr.addColorStop(1, c3);
  ctx.fillStyle = gr; ctx.fillText(text, 0, 14);
  // glossy sweep
  ctx.save(); ctx.beginPath(); ctx.rect(-W, -size, W * 2, size * 0.5 + 14); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillText(text, 0, 14); ctx.restore();
  ctx.restore();
}

export function renderCombat(ctx: CanvasRenderingContext2D, g: Game, cw: number, ch: number, dpr: number, clouds: { x: number; y: number; k: number; s: number; v: number }[]) {
  if (!bgCanvas) buildBackground();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sk = ctx.createLinearGradient(0, 0, 0, ch); sk.addColorStop(0, '#071735'); sk.addColorStop(0.8, '#2b5aa0'); sk.addColorStop(1, '#0a1630');
  ctx.fillStyle = sk; ctx.fillRect(0, 0, cw, ch);
  const k = Math.min(cw / W, ch / H), ox = (cw - W * k) / 2, oy = (ch - H * k) / 2;
  const sh = g.shake;
  ctx.save();
  ctx.translate(ox + (Math.random() - 0.5) * sh * k, oy + (Math.random() - 0.5) * sh * k);
  ctx.scale(k, k);
  ctx.beginPath(); ctx.rect(-BGX - 2000, -2000, BGW + 4000, H + 4000); ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#071735'; ctx.fillRect(-BGX - 2000, -2000, BGW + 4000, 2000);          // sky above the arena (fills the whole screen)
  ctx.fillStyle = '#0a1630'; ctx.fillRect(-BGX - 2000, H, BGW + 4000, 2000);               // ground below the arena
  ctx.drawImage(bgCanvas!, -BGX, 0);
  // drifting clouds
  for (const c of clouds) { ctx.globalAlpha = 0.38; ctx.drawImage(cloudSprites[c.k % cloudSprites.length], c.x, c.y, 320 * c.s, 90 * c.s); }
  ctx.globalAlpha = 1;
  // sky dims while a ship is overhead
  let dim = 0;
  for (const u of g.ults) dim = Math.max(dim, u.t < 500 ? u.t / 500 : u.t < T_LEAVE ? 1 : Math.max(0, 1 - (u.t - T_LEAVE) / 900));
  if (dim > 0) { ctx.fillStyle = `rgba(2,8,28,${0.4 * dim})`; ctx.fillRect(-BGX, -400, BGW, H + 800); }
  // ship(s) – huge, only the underside is visible
  const ship = imgs.ship;
  for (const u of g.ults) {
    if (!ship.width) break;
    const cx = shipCx(u), h = SHIP_W * ship.height / ship.width;
    ctx.save(); ctx.translate(cx, SHIP_BOTTOM - h / 2);
    if (u.dir < 0) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(ship, -SHIP_W / 2, -h / 2, SHIP_W, h);
    ctx.restore();
  }
  // shadows
  for (const f of g.f) {
    const air = Math.max(0, REST_Y - f.y), w = Math.max(30, 84 - air * 0.12);
    ctx.fillStyle = `rgba(0,10,30,${0.35 * (1 - Math.min(0.7, air / 400))})`;
    ctx.beginPath(); ctx.ellipse(f.x, GROUND + 6, w, 11, 0, 0, 7); ctx.fill();
  }
  // dash after-images
  for (const gh of g.ghosts) {
    const key = gh.face > 0 ? 'punchE' : 'punchW';
    if (!imgs[key].width) continue;
    ctx.globalAlpha = (gh.ttl / 280) * 0.55; ctx.imageSmoothingEnabled = false;
    ctx.save(); ctx.translate(gh.x, gh.y - FH * S / 2); ctx.scale(gh.sx, 0.92);
    ctx.drawImage(tint(key, '#3b9cff'), gh.frame * FW, 0, FW, FH, -FW * S / 2, -FH * S / 2, FW * S, FH * S);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // fighters (the one acting is drawn on top)
  const order = [...g.f].sort((a, b) => (a.act === 'idle' ? 0 : 1) - (b.act === 'idle' ? 0 : 1));
  for (const f of order) drawFighter(ctx, g, f);
  // bombs
  for (const u of g.ults) {
    if (!u.bomb || !imgs.bomb.width) continue;
    const bs = 6, bw = imgs.bomb.width * bs, bh = imgs.bomb.height * bs;
    ctx.save(); ctx.translate(u.bomb.x, u.bomb.y); ctx.rotate(Math.PI); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imgs.bomb, -bw / 2, -bh / 2, bw, bh); ctx.restore();
  }
  // explosions
  ctx.imageSmoothingEnabled = false;
  for (const b of g.booms) {
    const t = b.t - b.delay; if (t < 0 || !imgs.boom.width) continue;
    const fi = Math.min(6, Math.floor(t / 85)), sz = 128 * b.scale;
    ctx.globalAlpha = t > 520 ? 1 - (t - 520) / 180 : 1;
    ctx.drawImage(imgs.boom, fi * 128, 0, 128, 128, b.x - sz / 2, b.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;
  // rings
  for (const r of g.rings) {
    if (r.t < 0) continue;
    const e = easeOut(r.t / r.max);
    ctx.save(); ctx.translate(r.x, r.y); ctx.scale(1, 0.25);
    ctx.globalAlpha = (1 - e) * 0.9; ctx.strokeStyle = r.color; ctx.lineWidth = 14 * (1 - e) + 2;
    ctx.beginPath(); ctx.arc(0, 0, 20 + e * r.max * 0.55, 0, 7); ctx.stroke(); ctx.restore();
  }
  ctx.globalAlpha = 1;
  // particles
  for (const q of g.parts) {
    const a = 1 - q.life / q.max; ctx.globalAlpha = a; ctx.fillStyle = q.color;
    if (q.streak) ctx.fillRect(q.x, q.y, q.size * Math.sign(q.vx || 1) * -1, 4);
    else ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  // damage numbers
  ctx.textAlign = 'center';
  for (const p of g.pops) {
    ctx.globalAlpha = 1 - p.t / 900; ctx.font = `bold ${p.big ? 44 : 30}px ui-monospace, Menlo, monospace`;
    ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  if (g.whiteout > 0.02) { ctx.fillStyle = `rgba(255,244,214,${g.whiteout * 0.85})`; ctx.fillRect(-BGX, -400, BGW, H + 800); }
  ctx.restore();

  // HUD + banners (anchored to the arena)
  ctx.save(); ctx.translate(ox, oy); ctx.scale(k, k);
  drawHud(ctx, g, g.f[0], false); drawHud(ctx, g, g.f[1], true);
  ctx.textAlign = 'center'; ctx.font = 'bold 34px ui-monospace, Menlo, monospace'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('VS', W / 2, 80);
  const banner = (text: string, color: string, size = 120, a = 1) => {
    ctx.globalAlpha = a; ctx.font = `900 ${size}px ui-monospace, Menlo, monospace`; ctx.lineWidth = 12; ctx.strokeStyle = '#000';
    ctx.strokeText(text, W / 2, 360); ctx.fillStyle = color; ctx.fillText(text, W / 2, 360); ctx.globalAlpha = 1;
  };
  if (g.phase === 'intro') {
    if (g.phaseT < 1000) banner('READY?', '#9cc4ff', 110);
    else banner('FIGHT!', '#ffd23f', 150, Math.min(1, (INTRO_MS - g.phaseT) / 300 + 0.2));
  } else if (g.phase === 'fight' && g.phaseT < 500) banner('FIGHT!', '#ffd23f', 150, 1 - g.phaseT / 500);
  if (g.phase === 'ko' || g.phase === 'over') drawKO(ctx, g);
  if (g.hint) { ctx.font = 'bold 26px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#ffd23f'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.fillText(g.hint.text, W / 2, 170); ctx.shadowBlur = 0; }
  ctx.restore();
}

export function makeClouds() {
  return Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * (W + 600) - 300, y: 60 + Math.random() * 300, k: i, s: 0.6 + Math.random() * 0.7, v: 0.06 + Math.random() * 0.1 }));
}
export function driftClouds(cl: { x: number; v: number; s: number }[]) {
  for (const c of cl) { c.x += c.v; if (c.x > W + 400) c.x = -400 * c.s; }
}
