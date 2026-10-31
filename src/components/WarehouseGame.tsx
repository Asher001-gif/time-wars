import { useEffect, useRef, useState } from 'react';
import crackUrl from '@/assets/warehouse/crack.png';
import DraggableExitButton from './DraggableExitButton';
import { loadWarehouseAssets, WhImages } from '@/game/warehouseAssets';
import { buildLayout, WW, WH, type Rect, type Obs, type Decal, type PlateT } from '@/game/warehouseLayout';

const MS = 3, MC = 88; // walker monster: 88px pixel-art cells (9 walk frames x 8 directions: E SE S SW W NW N NE) drawn at 3x, feet at (44,82)
const KEY = 'warehouse.best';
type Chest = Rect & { key: boolean; bat: boolean; openUntil: number };
type Crate = Rect;
type Plate = PlateT;
type Bat = { x: number; y: number };
type Mon = { x: number; y: number; state: 'wander' | 'freeze' | 'vanish' | 'gone' | 'hunt' | 'search'; t: number; tx: number; ty: number; a: number; dir: number; anim: number; sawHide: boolean; next: number; det: number; detT: number; stuck: number; vx: number; vy: number; sv: number; d8: number; pd: number; db: number };
interface G {
  walls: Rect[]; decals: Decal[]; obs: Obs[]; chests: Chest[]; crates: Crate[]; plates: Plate[]; bats: Bat[];
  p: { x: number; y: number; hidden: Crate | null; face: number; aim: number; dir: 'up' | 'down' | 'left' | 'right' };
  m: Mon; battery: number; keys: number; time: number; toast: string; toastT: number;
  stepT: number; batT: number; dead: string; hbT: number; gT: number; shock: boolean; deadT: number; noiseFx: { x: number; y: number; t: number }[];
}
type Best = { time: number; score: number };
const readBest = (): Best => { try { return JSON.parse(localStorage.getItem(KEY) || '') as Best; } catch { return { time: 0, score: 0 }; } };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const hit = (a: Rect, b: Rect, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const scoreOf = (g: G) => Math.floor(g.time * 10 + g.keys * 100);

let ac: AudioContext | null = null;
function beep(f: number, d: number, type: OscillatorType = 'square', v = 0.05) {
  try {
    ac = ac || new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = v;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
  } catch { /* audio blocked */ }
}

function build(): G {
  const L = buildLayout();
  const chests: Chest[] = L.chests.map(r => ({ ...r, key: false, bat: false, openUntil: 0 }));
  const { walls, obs, crates, decals, plates } = L;
  chests[Math.floor(Math.random() * chests.length)].key = true;
  const cand = chests.filter(c => !c.key).sort(() => Math.random() - 0.5);
  cand.slice(0, 7).forEach(c => (c.bat = true));
  return {
    walls, decals, obs, chests, crates, plates, bats: [], p: { x: 880, y: 1000, hidden: null, face: 0, aim: Math.PI / 2, dir: 'down' },
    m: { x: rnd(3400, 4600), y: rnd(200, 1800), state: 'wander', t: 0, tx: WW / 2, ty: WH / 2, a: 1, dir: 1, anim: 0, sawHide: false, next: rnd(6, 10), det: 0, detT: 0, stuck: 0, vx: 0, vy: 0, sv: 0, d8: 2, pd: 2, db: 1 },
    battery: 100, keys: 0, time: 0, toast: '', toastT: 0, stepT: 0, batT: 6, dead: '', hbT: 0, gT: 0, shock: false, deadT: 0, noiseFx: [],
  };
}

export default function WarehouseGame({ onExit }: { onExit: () => void }) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const gref = useRef<G | null>(null);
  const [phase, setPhase] = useState<'menu' | 'play' | 'dead'>('menu');
  const [best, setBest] = useState<Best>(readBest);
  const [res, setRes] = useState<{ time: number; score: number; keys: number; why: string; nb: boolean; nbTime: boolean; ghost: boolean } | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const act = useRef(false);
  const joy = useRef({ x: 0, y: 0, id: -1, ox: 0, oy: 0 });
  const runLock = useRef(false);
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (!keys.current[k] && k === '5') act.current = true;
      if (!keys.current[k] && k === '0') runLock.current = !runLock.current;
      keys.current[k] = true;
    };
    const ku = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  useEffect(() => {
    if (phase !== 'play') return;
    const canvas = cvs.current!; const ctx = canvas.getContext('2d')!;
    const dark = document.createElement('canvas'); const dctx = dark.getContext('2d')!;
    let imgs: WhImages | null = null; let raf = 0, last = performance.now(), alive = true;
    loadWarehouseAssets().then(i => { imgs = i; });
    const g = build(); gref.current = g;
    const resize = () => { canvas.width = dark.width = window.innerWidth; canvas.height = dark.height = window.innerHeight; };
    resize(); window.addEventListener('resize', resize);
    const toast = (s: string) => { g.toast = s; g.toastT = 2.2; };
    const noise = (x: number, y: number, r: number) => {
      g.noiseFx.push({ x, y, t: 0.6 });
      const m = g.m;
      if (m.state !== 'gone' && !g.p.hidden || (g.p.hidden && Math.hypot(m.x - x, m.y - y) < r)) {
        if (Math.hypot(m.x - x, m.y - y) < r && m.state !== 'vanish') { m.state = 'hunt'; m.tx = x; m.ty = y; m.t = 0; }
      }
      if (m.state === 'gone' && Math.hypot(m.x - x, m.y - y) < r * 1.6) { m.state = 'hunt'; m.tx = x; m.ty = y; m.t = 0; m.a = 0.2; }
    };
    const SS: Rect[] = [...g.walls, ...g.obs, ...g.chests, ...g.crates]; const solids = () => SS;
    const mrect = (x: number, y: number): Rect => ({ x: x - 34, y: y - 84, w: 68, h: 84 }); // ghost collides with its legs (bottom half)
    const blocked = (x: number, y: number) => { const r = mrect(x, y); return SS.some(o => hit(r, o)); };
    const los = (ax: number, ay: number, bx: number, by: number) => {
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 14);
      for (let i = 1; i < n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; if (SS.some(o => x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h)) return false; }
      return true;
    };
    for (let i = 0; i < 60 && blocked(g.m.x, g.m.y); i++) { g.m.x = rnd(200, WW - 200); g.m.y = rnd(200, WH - 200); }
    const moveP = (dx: number, dy: number) => {
      const p = g.p, R = 14, ss = solids();
      for (const ax of [0, 1]) {
        if (ax === 0) p.x = Math.max(R, Math.min(WW - R, p.x + dx)); else p.y = Math.max(R, Math.min(WH - R, p.y + dy));
        for (const o of ss) {
          const cx = Math.max(o.x, Math.min(p.x, o.x + o.w)), cy = Math.max(o.y, Math.min(p.y, o.y + o.h));
          if (Math.hypot(p.x - cx, p.y - cy) < R) { if (ax === 0) p.x -= dx; else p.y -= dy; }
        }
      }
    };
    const die = (why: string, ghost = false) => {
      if (g.dead) return; g.dead = why; g.shock = ghost; beep(80, 0.8, 'sawtooth', 0.12);
      const s = scoreOf(g); const b = readBest(); const nb = s > b.score, nbTime = g.time > b.time;
      const nbest = { time: Math.max(b.time, g.time), score: Math.max(b.score, s) };
      try { localStorage.setItem(KEY, JSON.stringify(nbest)); } catch { /* ignore */ }
      setBest(nbest); setRes({ time: g.time, score: s, keys: g.keys, why, nb, nbTime, ghost });
      setTimeout(() => alive && setPhase('dead'), ghost ? 1800 : 900);
    };
    const nearest = <T extends Rect>(arr: T[], r: number): T | null => {
      let b: T | null = null, bd = r;
      for (const o of arr) { const d = Math.hypot(o.x + o.w / 2 - g.p.x, o.y + o.h / 2 - g.p.y); if (d < bd) { bd = d; b = o; } }
      return b;
    };

    const update = (dt: number) => {
      if (g.dead) return;
      const p = g.p, m = g.m; g.time += dt; g.toastT -= dt;
      const k = keys.current;
      let ix = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0) + joy.current.x;
      let iy = (k['s'] || k['arrowdown'] ? 1 : 0) - (k['w'] || k['arrowup'] ? 1 : 0) + joy.current.y;
      const len = Math.hypot(ix, iy); if (len > 1) { ix /= len; iy /= len; }
      const moving = len > 0.1 && !p.hidden;
      if (moving) {
        let da = Math.atan2(iy, ix) - p.aim; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        p.aim += da * Math.min(1, dt * 12);
      }
      if (moving) p.dir = Math.abs(ix) > Math.abs(iy) ? (ix > 0 ? 'right' : 'left') : (iy > 0 ? 'down' : 'up');
      const run = runLock.current && moving;
      g.battery -= (p.hidden ? 0.35 : run ? 1.0 : 0.6) * dt;
      if (g.battery <= 0) { g.battery = 0; die('Your battery ran out.'); return; }
      if (moving) {
        const sp = run ? 215 : 120; moveP(ix * sp * dt, iy * sp * dt); if (ix) p.face = ix;
        if (run) { g.stepT -= dt; if (g.stepT <= 0) { g.stepT = 0.5; noise(p.x, p.y, 330); beep(110, 0.05, 'triangle', 0.04); } }
      }
      // pressure plates
      for (const pl of g.plates) {
        pl.cd -= dt;
        if (!p.hidden && pl.cd <= 0 && Math.hypot(pl.x - p.x, pl.y - p.y) < 26) {
          pl.cd = 10; noise(pl.x, pl.y, 1100); beep(520, 0.5, 'sawtooth', 0.08); toast('CLANK! That was loud...');
        }
      }
      // batteries only appear inside chests
      g.batT -= dt;
      if (g.batT <= 0) {
        g.batT = 12;
        if (g.chests.filter(c => c.bat).length < 7) { const c = g.chests.filter(c => !c.bat && !c.key && !c.openUntil); if (c.length) c[Math.floor(Math.random() * c.length)].bat = true; }
      }
      // interact
      for (const c of g.chests) if (c.openUntil && c.openUntil < g.time) c.openUntil = 0;
      if (act.current) {
        act.current = false;
        if (p.hidden) { p.x = p.hidden.x + p.hidden.w / 2; p.y = p.hidden.y + p.hidden.h + 22; p.hidden = null; m.sawHide = false; }
        else {
          const cr = nearest(g.crates, 85);
          const ch = nearest(g.chests.filter(c => !c.openUntil), 70);
          const dc = cr ? Math.hypot(cr.x + 46 - p.x, cr.y + 44 - p.y) : 1e9, dh = ch ? Math.hypot(ch.x + 29 - p.x, ch.y + 27 - p.y) : 1e9;
          if (cr && dc <= dh) {
            p.hidden = cr; beep(200, 0.1, 'triangle', 0.04);
            const d = Math.hypot(m.x - p.x, m.y - p.y);
            m.sawHide = m.state !== 'gone' && m.state !== 'vanish' && d < 520 && (m.state === 'hunt' || (d < 380 && los(m.x, m.y, p.x, p.y)));
            if (m.sawHide) { m.state = 'hunt'; m.tx = cr.x + cr.w / 2; m.ty = cr.y + cr.h / 2; }
          } else if (ch) {
            ch.openUntil = g.time + 25; noise(ch.x, ch.y, 520); beep(300, 0.25, 'square', 0.06);
            if (ch.key) {
              g.keys++; ch.key = false; toast('KEY FOUND!  +100'); beep(1100, 0.3, 'sine', 0.08);
              const others = g.chests.filter(c => c !== ch && !c.bat); others[Math.floor(Math.random() * others.length)].key = true;
            } else if (ch.bat) { ch.bat = false; g.battery = Math.min(100, g.battery + 35); toast('BATTERY FOUND! +35%'); beep(880, 0.2, 'sine', 0.07); }
            else toast('Empty...');
          }
        }
      }
      if (p.hidden) { p.x = p.hidden.x + p.hidden.w / 2; p.y = p.hidden.y + p.hidden.h / 2; }
      // monster
      const spd = 150 + Math.min(75, g.time * 0.4);
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      m.t += dt;
      const go = (tx: number, ty: number, sp: number) => {
        const dx = tx - m.x, dy = ty - m.y, l = Math.hypot(dx, dy) || 1, step = sp * dt;
        let ang = Math.atan2(dy, dx);
        if (m.detT > 0) { m.detT -= dt; ang += m.det; }
        const ox = m.x, oy = m.y;
        if (blocked(m.x, m.y)) { m.x += Math.cos(ang) * step; m.y += Math.sin(ang) * step; }
        else {
          const nx = m.x + Math.cos(ang) * step; if (!blocked(nx, m.y)) m.x = nx;
          const ny = m.y + Math.sin(ang) * step; if (!blocked(m.x, ny)) m.y = ny;
        }
        m.x = Math.max(40, Math.min(WW - 40, m.x)); m.y = Math.max(100, Math.min(WH - 10, m.y));
        const moved = Math.hypot(m.x - ox, m.y - oy);
        if (moved < step * 0.4 && l > 40) { m.stuck += dt; if (m.detT <= 0) { m.det = (Math.random() < 0.5 ? 1 : -1) * rnd(1.0, 1.9); m.detT = 0.6; } }
        else m.stuck = Math.max(0, m.stuck - dt);
        // smoothed velocity -> stable 8-way facing (with hysteresis so it never flickers between sectors)
        const kv = 1 - Math.exp(-dt * 7);
        m.vx += ((m.x - ox) / dt - m.vx) * kv; m.vy += ((m.y - oy) / dt - m.vy) * kv;
        if (Math.hypot(m.vx, m.vy) > 12) {
          const ang = Math.atan2(m.vy, m.vx); let off = ang - m.d8 * Math.PI / 4;
          while (off > Math.PI) off -= 2 * Math.PI; while (off < -Math.PI) off += 2 * Math.PI;
          if (Math.abs(off) > 0.5) { m.pd = m.d8; m.db = 0; m.d8 = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8; }
        }
        m.sv += (moved / dt - m.sv) * (1 - Math.exp(-dt * 8)); // smoothed speed drives the walk cycle
        m.anim += (m.sv * dt) / 13;
        return l;
      };
      const pick = () => { for (let i = 0; i < 20; i++) { const tx = rnd(100, WW - 100), ty = rnd(120, WH - 100); if (!blocked(tx, ty)) { m.tx = tx; m.ty = ty; break; } } m.stuck = 0; m.t = 0; };
      const light = 70 + 230 * (g.battery / 100);
      const sees = !p.hidden && d < Math.min(340, light + 80) && los(m.x, m.y, p.x, p.y);
      if ((m.state === 'wander' || m.state === 'search') && sees) { m.state = 'hunt'; m.tx = p.x; m.ty = p.y; m.t = 0; beep(70, 0.4, 'sawtooth', 0.08); beep(1400, 0.3, 'sawtooth', 0.04); }
      if (m.state === 'wander') {
        m.a = Math.min(1, m.a + dt * 2);
        if (go(m.tx, m.ty, 75) < 30 || m.t > 9 || m.stuck > 1.5) pick();
        m.next -= dt; if (m.next <= 0) { m.state = 'freeze'; m.t = 0; }
      } else if (m.state === 'freeze') { if (m.t > 2.8) { m.state = 'vanish'; m.t = 0; } }
      else if (m.state === 'vanish') { m.a = Math.max(0, 1 - m.t / 1.2); if (m.t > 1.2) { m.state = 'gone'; m.t = 0; m.next = rnd(3, 6); } }
      else if (m.state === 'gone') {
        m.a = 0; if (m.t > m.next) {
          for (let i = 0; i < 20; i++) {
            const ang = Math.random() * 6.28, r = rnd(650, 1000);
            const nx = Math.max(60, Math.min(WW - 60, p.x + Math.cos(ang) * r)), ny = Math.max(110, Math.min(WH - 20, p.y + Math.sin(ang) * r));
            if (!blocked(nx, ny)) { m.x = nx; m.y = ny; break; }
          }
          m.state = 'wander'; m.next = rnd(7, 13); pick();
        }
      } else if (m.state === 'hunt') {
        m.a = Math.min(1, m.a + dt * 3);
        if (sees) { m.tx = p.x; m.ty = p.y; m.t = 0; }
        if (go(m.tx, m.ty, spd) < 34) {
          if (p.hidden && m.sawHide) { die('It saw you hide.', true); return; }
          m.state = 'search'; m.t = 0; m.sawHide = false;
        } else if (m.t > 14 || m.stuck > 2.5) { m.state = 'search'; m.t = 0; m.stuck = 0; }
      } else if (m.state === 'search') {
        m.a = 1; if (m.t % 2 < dt) { m.tx = m.x + rnd(-200, 200); m.ty = m.y + rnd(-200, 200); }
        go(m.tx, m.ty, 80); if (m.t > 6) { m.state = 'wander'; m.t = 0; m.next = rnd(6, 10); pick(); }
      }
      // horror audio: heartbeat that speeds up + growls as the monster closes in
      if (m.a > 0.2 && m.state !== 'gone') {
        const prox = Math.max(0, 1 - d / 900);
        if (prox > 0) {
          g.hbT -= dt;
          if (g.hbT <= 0) { g.hbT = 1.1 - prox * 0.75; const v = 0.04 + prox * 0.16; beep(55, 0.18, 'sine', v); setTimeout(() => beep(48, 0.2, 'sine', v * 0.8), 150); }
          if (m.state === 'hunt' && d < 450) { g.gT -= dt; if (g.gT <= 0) { g.gT = 1.4; beep(rnd(55, 90), 0.5, 'sawtooth', 0.03 + prox * 0.06); } }
        }
      }
      if (!p.hidden && m.a > 0.5 && d < 44) die('The monster got you.', true);
      m.db = Math.min(1, m.db + dt * 9); // quick crossfade when the facing changes
      g.noiseFx.forEach(n => (n.t -= dt)); g.noiseFx = g.noiseFx.filter(n => n.t > 0);
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height, z = Math.max(0.6, Math.min(1.2, H / 720));
      const p = g.p, m = g.m;
      const cx = Math.max(W / z / 2, Math.min(WW - W / z / 2, p.x)) , cy = Math.max(H / z / 2, Math.min(WH - H / z / 2, p.y));
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
      ctx.setTransform(z, 0, 0, z, W / 2 - cx * z, H / 2 - cy * z);
      // floor
      ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, WW, WH);
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(80, 80, WW - 160, 2020);
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.font = 'bold 120px monospace'; ctx.textAlign = 'center'; ctx.fillText('BACKYARD', WW / 2, 2700);
      ctx.strokeStyle = '#2f2f2f'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x <= WW; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, WH); }
      for (let y = 0; y <= WH; y += 100) { ctx.moveTo(0, y); ctx.lineTo(WW, y); }
      ctx.stroke(); ctx.strokeStyle = '#222'; ctx.lineWidth = 16; ctx.strokeRect(0, 0, WW, WH);
      ctx.fillStyle = '#121212'; for (const w of g.walls) ctx.fillRect(w.x, w.y, w.w, w.h);
      if (imgs) for (const d of g.decals) { ctx.globalAlpha = 0.75; ctx.drawImage(imgs[d.img], d.x, d.y, d.w, d.h); ctx.globalAlpha = 1; }
      // plates (faint)
      for (const pl of g.plates) {
        ctx.fillStyle = pl.cd > 0 ? '#555' : '#444'; ctx.fillRect(pl.x - 23, pl.y - 23, 46, 46);
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2; ctx.strokeRect(pl.x - 23, pl.y - 23, 46, 46);
      }
      type D = { y: number; f: () => void };
      const list: D[] = [];
      if (imgs) {
        for (const o of g.obs) list.push({ y: o.y + o.h, f: () => ctx.drawImage(imgs![o.img], o.x, o.y, o.w, o.h) });
        for (const c of g.chests) list.push({ y: c.y + c.h, f: () => { const im = c.openUntil ? imgs!.chestOpen : imgs!.chestClosed; const w = c.openUntil ? c.h * 273 / 249 : c.w; ctx.drawImage(im, c.x + (c.w - w) / 2, c.y, w, c.h); } });
        for (const c of g.crates) list.push({ y: c.y + c.h, f: () => { ctx.drawImage(imgs!.crateX, c.x, c.y, c.w, c.h); if (p.hidden === c) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(c.x, c.y, c.w, c.h); } } });
        if (!p.hidden) list.push({ y: p.y + 14, f: () => drawBot(ctx, imgs!, p.x, p.y, p.dir, g.time) });
        list.push({ y: m.y, f: () => {
          if (m.a <= 0.01) return;
          const moving = (m.state === 'wander' || m.state === 'hunt' || m.state === 'search') && m.sv > 6;
          const fr = moving ? Math.floor(m.anim) % 9 : 0;
          const pd = m.pd; let d8 = m.d8, db = m.db;
          if (g.dead && g.shock) { d8 = ((Math.round(Math.atan2(p.y - m.y, p.x - m.x) / (Math.PI / 4)) % 8) + 8) % 8; db = 1; } // face the player on the kill
          ctx.save(); ctx.imageSmoothingEnabled = false;
          const put = (dir: number, a: number) => { ctx.globalAlpha = m.a * a; ctx.drawImage(imgs!.monster, fr * MC, dir * MC, MC, MC, m.x - 44 * MS, m.y - 82 * MS, MC * MS, MC * MS); };
          if (db < 1 && pd !== d8) put(pd, 1);
          put(d8, db < 1 && pd !== d8 ? db : 1);
          ctx.restore();
        } });
      }
      list.sort((a, b) => a.y - b.y).forEach(d => d.f());
      for (const n of g.noiseFx) { ctx.strokeStyle = `rgba(255,255,255,${n.t})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(n.x, n.y, (0.6 - n.t) * 500, 0, 6.28); ctx.stroke(); }
      // darkness + flashlight
      dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.globalCompositeOperation = 'source-over'; dctx.clearRect(0, 0, W, H);
      dctx.fillStyle = `rgba(0,0,0,${0.9 + 0.08 * (1 - g.battery / 100)})`; dctx.fillRect(0, 0, W, H); // dim ambient: only a faint glimmer outside the spotlight
      const dm = Math.hypot(m.x - p.x, m.y - p.y);
      let rad = (60 + 240 * (g.battery / 100)) * z; let inten = 1;
      if (g.battery < 20) inten *= 0.75 + 0.25 * Math.sin(g.time * 30);
      if (m.a > 0.2 && dm < 600 && Math.random() < (1 - dm / 600) * 0.7) { inten = 0.12; rad *= 0.8; }
      if (p.hidden) rad *= 0.45;
      if (g.shock) { rad = Math.max(rad, 260 * z) * (1 + Math.min(1, g.deadT) * 0.4); inten = 1; }
      const sx = W / 2 + (p.x - cx) * z, sy = H / 2 + (p.y - cy) * z;
      dctx.globalCompositeOperation = 'destination-out';
      const cut = (r0: number, r1: number, a0: number, a1: number, half: number | null) => {
        const gr = dctx.createRadialGradient(sx, sy, r0, sx, sy, r1);
        gr.addColorStop(0, `rgba(0,0,0,${a0 * inten})`); gr.addColorStop(0.7, `rgba(0,0,0,${a1 * inten})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        dctx.fillStyle = gr; dctx.beginPath(); dctx.moveTo(sx, sy);
        if (half === null) dctx.arc(sx, sy, r1, 0, 6.2832); else dctx.arc(sx, sy, r1, p.aim - half, p.aim + half);
        dctx.closePath(); dctx.fill();
      };
      const L = rad * 1.7;
      cut(8, L * 0.9, 0.34, 0.2, 0.7);            // wide dim cone
      cut(8, L, 0.9, 0.7, 0.36);                  // bright spotlight in the facing direction
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(dark, 0, 0);
      // HUD
      ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#ddd'; ctx.textAlign = 'left';
      ctx.fillText(`TIME ${fmt(g.time)}   KEYS ${g.keys}   SCORE ${scoreOf(g)}`, 70, 30);
      ctx.fillText(`SPRINT [0]: ${runLock.current ? 'ON' : 'OFF'}`, 70, 78);
      ctx.fillStyle = '#222'; ctx.fillRect(70, 42, 160, 16); ctx.fillStyle = g.battery < 20 ? '#fff' : '#aaa';
      if (g.battery >= 20 || Math.floor(g.time * 4) % 2) ctx.fillRect(72, 44, 156 * g.battery / 100, 12);
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ctx.strokeRect(70, 42, 160, 16);
      ctx.fillStyle = '#ddd'; ctx.font = '12px monospace'; ctx.fillText(`${Math.ceil(g.battery)}%`, 238, 55);
      ctx.textAlign = 'center';
      if (g.toastT > 0) { ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(g.toast, W / 2, 80); }
      let prompt = '';
      if (p.hidden) prompt = '5: leave box'; else {
        const cr = nearest(g.crates, 85), ch = nearest(g.chests.filter(c => !c.openUntil), 70);
        prompt = cr ? '5: hide' : ch ? '5: open chest' : '';
      }
      if (prompt) { ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(prompt, W / 2, H / 2 + 60); }
      if (g.shock && imgs) {
        const t = g.deadT;
        if (t < 1.2) { const k = (1.2 - t) * 18; ctx.drawImage(canvas, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
        const cs = Math.min(1.15, 0.7 + t * 1.2) * Math.max(W, H) * 0.9;
        ctx.globalAlpha = Math.min(1, t * 6); ctx.drawImage(imgs.crack, W / 2 - cs / 2, H / 2 - cs / 2, cs, cs); ctx.globalAlpha = 1;
        if (t < 0.35) { ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - t / 0.35)})`; ctx.fillRect(0, 0, W, H); }
        ctx.fillStyle = `rgba(120,0,0,${Math.min(0.35, t * 0.3)})`; ctx.fillRect(0, 0, W, H);
      }
      if (touch && joy.current.id >= 0) { ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(joy.current.ox, joy.current.oy, 50, 0, 6.28); ctx.stroke(); ctx.beginPath(); ctx.arc(joy.current.ox + joy.current.x * 50, joy.current.oy + joy.current.y * 50, 22, 0, 6.28); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill(); }
    };

    const loop = (t: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (g.dead) g.deadT += dt;
      if (imgs) update(dt); draw(); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [phase, touch]);

  const onDown = (e: React.PointerEvent) => { if (joy.current.id < 0 && e.clientX < window.innerWidth * 0.6) joy.current = { x: 0, y: 0, id: e.pointerId, ox: e.clientX, oy: e.clientY }; };
  const onMove = (e: React.PointerEvent) => {
    const j = joy.current; if (e.pointerId !== j.id) return;
    const dx = e.clientX - j.ox, dy = e.clientY - j.oy, l = Math.hypot(dx, dy) || 1, c = Math.min(1, l / 50);
    j.x = dx / l * c; j.y = dy / l * c;
  };
  const onUp = (e: React.PointerEvent) => { if (e.pointerId === joy.current.id) joy.current = { x: 0, y: 0, id: -1, ox: 0, oy: 0 }; };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden font-mono select-none touch-none">
      <canvas ref={cvs} className="absolute inset-0 w-full h-full" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <DraggableExitButton onExit={onExit} />
      {phase === 'play' && touch && (
        <div className="absolute right-4 bottom-6 flex flex-col gap-3">
          <button className="w-16 h-16 rounded-full bg-white/20 border border-white/50 text-white font-bold" onPointerDown={() => { act.current = true; }}>5</button>
          <button className="w-16 h-16 rounded-full bg-white/20 border border-white/50 text-white text-xs font-bold" onPointerDown={() => { runLock.current = !runLock.current; }}>SPRINT</button>
        </div>
      )}
      {phase !== 'play' && (
        <div className="absolute inset-0 z-10 bg-black/90 flex flex-col items-center justify-center text-center text-neutral-200 p-6 gap-4">
          {phase === 'dead' && res?.ghost && <img src={crackUrl} alt="" className="absolute inset-0 m-auto w-full h-full object-contain opacity-30 pointer-events-none" />}
          <h1 className="relative text-4xl sm:text-5xl font-bold tracking-[0.3em] text-white">{phase === 'dead' ? 'YOU DIED' : 'THE WAREHOUSE'}</h1>
          {phase === 'dead' && res ? (
            <div className="space-y-1">
              <p className="text-neutral-400">{res.why}</p>
              <p className="text-lg">This run: <b>{fmt(res.time)}</b> · {res.keys} keys · Score <b>{res.score}</b></p>
              {(res.nb || res.nbTime) && <p className="text-white font-bold animate-pulse">NEW BEST {res.nb && res.nbTime ? 'SCORE & TIME' : res.nb ? 'SCORE' : 'TIME'}!</p>}
            </div>
          ) : (
            <div className="max-w-md text-sm text-neutral-400 space-y-1">
              <p>Explore 3 rooms and the backyard. Chests hold batteries — your battery is your life and your light.</p>
              <p>WASD/Arrows move · 5 open chest · 0 toggle sprint (loud)</p>
              <p>Stay out of the monster's sight. Hidden pressure plates are loud.</p>
            </div>
          )}
          <p className="text-neutral-400 text-sm">Best time: {fmt(best.time)} · Best score: {best.score}</p>
          <button onClick={() => { setRes(null); setPhase('play'); }} className="px-8 py-3 border border-white text-white tracking-widest hover:bg-white hover:text-black transition">{phase === 'dead' ? 'TRY AGAIN' : 'ENTER'}</button>
        </div>
      )}
    </div>
  );
}

function drawBot(ctx: CanvasRenderingContext2D, im: WhImages, x: number, y: number, dir: string, t: number) {
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 15, 16, 6, 0, 0, 6.28); ctx.fill();
  const img = dir === 'up' ? im.robotBack : im.robotFront;
  const h = 50, w = h * img.width / img.height, bob = Math.sin(t * 5) * 1;
  ctx.save(); ctx.translate(x, y + 17 + bob); if (dir === 'right') ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore();
}
