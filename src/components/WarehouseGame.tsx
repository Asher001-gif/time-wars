import { useEffect, useRef, useState } from 'react';
import DraggableExitButton from './DraggableExitButton';
import { loadWarehouseAssets, WhImages } from '@/game/warehouseAssets';

const WW = 2600, WH = 1800;
const FW = 149, FH = 192, GS = 0.9;
const KEY = 'warehouse.best';
type Rect = { x: number; y: number; w: number; h: number };
type Obs = Rect & { img: 'cWide' | 'cTall' | 'cSmall' | 'bStripe' | 'bPlain' };
type Chest = Rect & { key: boolean; openUntil: number };
type Crate = Rect;
type Plate = { x: number; y: number; cd: number };
type Bat = { x: number; y: number };
type Mon = { x: number; y: number; state: 'wander' | 'freeze' | 'vanish' | 'gone' | 'hunt' | 'search'; t: number; tx: number; ty: number; a: number; dir: number; anim: number; sawHide: boolean; next: number };
interface G {
  obs: Obs[]; chests: Chest[]; crates: Crate[]; plates: Plate[]; bats: Bat[];
  p: { x: number; y: number; hidden: Crate | null; face: number };
  m: Mon; battery: number; keys: number; time: number; toast: string; toastT: number;
  stepT: number; batT: number; dead: string; noiseFx: { x: number; y: number; t: number }[];
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
  const obs: Obs[] = [], chests: Chest[] = [], crates: Crate[] = [];
  const all: Rect[] = [{ x: WW / 2 - 140, y: WH / 2 - 140, w: 280, h: 280 }]; // clear spawn
  const place = (w: number, h: number): Rect | null => {
    for (let i = 0; i < 80; i++) {
      const r = { x: rnd(80, WW - 80 - w), y: rnd(80, WH - 80 - h), w, h };
      if (!all.some(o => hit(r, o, 70))) { all.push(r); return r; }
    }
    return null;
  };
  const sizes: [Obs['img'], number, number][] = [['cWide', 230, 156], ['cTall', 132, 196], ['cSmall', 112, 152], ['bStripe', 180, 98], ['bPlain', 184, 98]];
  for (let i = 0; i < 30; i++) { const [img, w, h] = sizes[i % 5]; const r = place(w, h); if (r) obs.push({ ...r, img }); }
  for (let i = 0; i < 10; i++) { const r = place(58, 54); if (r) chests.push({ ...r, key: false, openUntil: 0 }); }
  for (let i = 0; i < 9; i++) { const r = place(92, 88); if (r) crates.push(r); }
  chests[Math.floor(Math.random() * chests.length)].key = true;
  const plates: Plate[] = [];
  for (let i = 0; i < 9; i++) { const r = place(46, 46); if (r) plates.push({ x: r.x + 23, y: r.y + 23, cd: 0 }); all.pop(); }
  return {
    obs, chests, crates, plates, bats: [], p: { x: WW / 2, y: WH / 2, hidden: null, face: 0 },
    m: { x: rnd(200, WW - 200), y: rnd(200, 500), state: 'wander', t: 0, tx: WW / 2, ty: WH / 2, a: 1, dir: 1, anim: 0, sawHide: false, next: rnd(6, 10) },
    battery: 100, keys: 0, time: 0, toast: '', toastT: 0, stepT: 0, batT: 0, dead: '', noiseFx: [],
  };
}

export default function WarehouseGame({ onExit }: { onExit: () => void }) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const gref = useRef<G | null>(null);
  const [phase, setPhase] = useState<'menu' | 'play' | 'dead'>('menu');
  const [best, setBest] = useState<Best>(readBest);
  const [res, setRes] = useState<{ time: number; score: number; keys: number; why: string; nb: boolean } | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const act = useRef(false);
  const joy = useRef({ x: 0, y: 0, id: -1, ox: 0, oy: 0 });
  const runBtn = useRef(false);
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!keys.current[k] && (k === 'e' || k === ' ')) act.current = true;
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
    const solids = (): Rect[] => [...g.obs, ...g.chests, ...g.crates];
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
    const die = (why: string) => {
      if (g.dead) return; g.dead = why; beep(80, 0.8, 'sawtooth', 0.12);
      const s = scoreOf(g); const b = readBest(); const nb = s > b.score;
      const nbest = { time: Math.max(b.time, g.time), score: Math.max(b.score, s) };
      try { localStorage.setItem(KEY, JSON.stringify(nbest)); } catch { /* ignore */ }
      setBest(nbest); setRes({ time: g.time, score: s, keys: g.keys, why, nb });
      setTimeout(() => alive && setPhase('dead'), 900);
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
      const run = (k['shift'] || runBtn.current) && moving;
      g.battery -= (p.hidden ? 0.5 : run ? 1.5 : 0.9) * dt;
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
      // batteries
      g.batT -= dt;
      if (g.bats.length < 4 && g.batT <= 0) {
        g.batT = 11;
        for (let i = 0; i < 30; i++) {
          const r = { x: rnd(80, WW - 80), y: rnd(80, WH - 80), w: 22, h: 38 };
          if (!solids().some(o => hit(r, o, 20)) && Math.hypot(r.x - p.x, r.y - p.y) > 300) { g.bats.push({ x: r.x, y: r.y }); break; }
        }
      }
      if (!p.hidden) g.bats = g.bats.filter(b => {
        if (Math.hypot(b.x - p.x, b.y - p.y) < 32) { g.battery = Math.min(100, g.battery + 35); toast('+35% BATTERY'); beep(880, 0.15, 'sine', 0.07); return false; }
        return true;
      });
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
            m.sawHide = m.state !== 'gone' && m.state !== 'vanish' && d < 520 && (m.state === 'hunt' || d < 380);
            if (m.sawHide) { m.state = 'hunt'; m.tx = cr.x + cr.w / 2; m.ty = cr.y + cr.h / 2; }
          } else if (ch) {
            ch.openUntil = g.time + 25; noise(ch.x, ch.y, 520); beep(300, 0.25, 'square', 0.06);
            if (ch.key) {
              g.keys++; ch.key = false; toast('KEY FOUND!  +100'); beep(1100, 0.3, 'sine', 0.08);
              const others = g.chests.filter(c => c !== ch); others[Math.floor(Math.random() * others.length)].key = true;
            } else if (Math.random() < 0.3) { g.battery = Math.min(100, g.battery + 25); toast('Battery cell inside! +25%'); }
            else toast('Empty...');
          }
        }
      }
      if (p.hidden) { p.x = p.hidden.x + p.hidden.w / 2; p.y = p.hidden.y + p.hidden.h / 2; }
      // monster
      const spd = 130 + Math.min(70, g.time * 0.35);
      const d = Math.hypot(m.x - p.x, m.y - p.y - 20);
      m.t += dt;
      const go = (tx: number, ty: number, sp: number) => {
        const dx = tx - m.x, dy = ty - m.y, l = Math.hypot(dx, dy) || 1;
        m.x += dx / l * sp * dt; m.y += dy / l * sp * dt; if (Math.abs(dx) > 4) m.dir = dx > 0 ? 1 : -1; m.anim += sp * dt / 38;
        return l;
      };
      const light = 70 + 230 * (g.battery / 100);
      if ((m.state === 'wander' || m.state === 'search') && !p.hidden && d < Math.min(300, light + 60)) { m.state = 'hunt'; m.tx = p.x; m.ty = p.y; m.t = 0; beep(70, 0.4, 'sawtooth', 0.08); }
      if (m.state === 'wander') {
        m.a = Math.min(1, m.a + dt * 2);
        if (go(m.tx, m.ty, 65) < 30 || m.t > 9) { m.tx = rnd(100, WW - 100); m.ty = rnd(100, WH - 100); m.t = 0; if (Math.random() < 0.35) m.tx = p.x + rnd(-500, 500), m.ty = p.y + rnd(-400, 400); }
        m.next -= dt; if (m.next <= 0) { m.state = 'freeze'; m.t = 0; }
      } else if (m.state === 'freeze') { if (m.t > 2.8) { m.state = 'vanish'; m.t = 0; } }
      else if (m.state === 'vanish') { m.a = Math.max(0, 1 - m.t / 1.2); if (m.t > 1.2) { m.state = 'gone'; m.t = 0; } }
      else if (m.state === 'gone') {
        m.a = 0; if (m.t > rnd(3, 6)) {
          const ang = Math.random() * 6.28, r = rnd(650, 1000);
          m.x = Math.max(60, Math.min(WW - 60, p.x + Math.cos(ang) * r)); m.y = Math.max(60, Math.min(WH - 60, p.y + Math.sin(ang) * r));
          m.state = 'wander'; m.t = 0; m.next = rnd(7, 13); m.tx = m.x; m.ty = m.y;
        }
      } else if (m.state === 'hunt') {
        m.a = Math.min(1, m.a + dt * 3);
        if (!p.hidden && d < 420) { m.tx = p.x; m.ty = p.y; }
        if (go(m.tx, m.ty, spd) < 34) {
          if (p.hidden && m.sawHide) { die('It saw you hide.'); return; }
          m.state = 'search'; m.t = 0; m.sawHide = false;
        }
      } else if (m.state === 'search') {
        m.a = 1; if (m.t % 2 < dt) { m.tx = m.x + rnd(-200, 200); m.ty = m.y + rnd(-200, 200); }
        go(m.tx, m.ty, 70); if (m.t > 6) { m.state = 'wander'; m.t = 0; m.next = rnd(6, 10); }
      }
      if (!p.hidden && m.a > 0.5 && m.state !== 'freeze' && d < 36) die('The monster got you.');
      else if (!p.hidden && m.a > 0.5 && d < 36) die('The monster got you.');
      g.noiseFx.forEach(n => (n.t -= dt)); g.noiseFx = g.noiseFx.filter(n => n.t > 0);
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height, z = Math.max(0.6, Math.min(1.2, H / 720));
      const p = g.p, m = g.m;
      const cx = Math.max(W / z / 2, Math.min(WW - W / z / 2, p.x)) , cy = Math.max(H / z / 2, Math.min(WH - H / z / 2, p.y));
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
      ctx.setTransform(z, 0, 0, z, W / 2 - cx * z, H / 2 - cy * z);
      // floor
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(0, 0, WW, WH);
      ctx.strokeStyle = '#2f2f2f'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x <= WW; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, WH); }
      for (let y = 0; y <= WH; y += 100) { ctx.moveTo(0, y); ctx.lineTo(WW, y); }
      ctx.stroke(); ctx.strokeStyle = '#222'; ctx.lineWidth = 16; ctx.strokeRect(0, 0, WW, WH);
      // plates (faint)
      for (const pl of g.plates) {
        ctx.fillStyle = pl.cd > 0 ? '#555' : '#444'; ctx.fillRect(pl.x - 23, pl.y - 23, 46, 46);
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2; ctx.strokeRect(pl.x - 23, pl.y - 23, 46, 46);
      }
      for (const b of g.bats) {
        if (imgs) { ctx.globalAlpha = 0.8 + 0.2 * Math.sin(g.time * 6); ctx.drawImage(imgs.battery, b.x, b.y, 22, 38); ctx.globalAlpha = 1; }
      }
      type D = { y: number; f: () => void };
      const list: D[] = [];
      if (imgs) {
        for (const o of g.obs) list.push({ y: o.y + o.h, f: () => ctx.drawImage(imgs![o.img], o.x, o.y, o.w, o.h) });
        for (const c of g.chests) list.push({ y: c.y + c.h, f: () => { const im = c.openUntil ? imgs!.chestOpen : imgs!.chestClosed; const w = c.openUntil ? c.h * 273 / 249 : c.w; ctx.drawImage(im, c.x + (c.w - w) / 2, c.y, w, c.h); } });
        for (const c of g.crates) list.push({ y: c.y + c.h, f: () => { ctx.drawImage(imgs!.crateX, c.x, c.y, c.w, c.h); if (p.hidden === c) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(c.x, c.y, c.w, c.h); } } });
        if (!p.hidden) list.push({ y: p.y + 14, f: () => drawRobot(ctx, p.x, p.y, p.face, g.time) });
        list.push({ y: m.y, f: () => {
          if (m.a <= 0.01) return;
          const fr = m.state === 'freeze' || m.state === 'vanish' ? 0 : Math.floor(m.anim) % 6;
          ctx.globalAlpha = m.a;
          ctx.drawImage(imgs!.ghost, fr * FW, (m.dir > 0 ? 0 : 1) * FH, FW, FH, m.x - FW * GS / 2, m.y - FH * GS, FW * GS, FH * GS);
          ctx.globalAlpha = 1;
        } });
      }
      list.sort((a, b) => a.y - b.y).forEach(d => d.f());
      for (const n of g.noiseFx) { ctx.strokeStyle = `rgba(255,255,255,${n.t})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(n.x, n.y, (0.6 - n.t) * 500, 0, 6.28); ctx.stroke(); }
      // darkness + flashlight
      dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.globalCompositeOperation = 'source-over'; dctx.clearRect(0, 0, W, H);
      dctx.fillStyle = 'rgba(0,0,0,0.985)'; dctx.fillRect(0, 0, W, H);
      const dm = Math.hypot(m.x - p.x, m.y - p.y);
      let rad = (60 + 240 * (g.battery / 100)) * z; let inten = 1;
      if (g.battery < 20) inten *= 0.75 + 0.25 * Math.sin(g.time * 30);
      if (m.a > 0.2 && dm < 600 && Math.random() < (1 - dm / 600) * 0.7) { inten = 0.12; rad *= 0.8; }
      if (p.hidden) rad *= 0.45;
      const sx = W / 2 + (p.x - cx) * z, sy = H / 2 + (p.y - cy) * z;
      const gr = dctx.createRadialGradient(sx, sy, rad * 0.1, sx, sy, rad);
      gr.addColorStop(0, `rgba(0,0,0,${inten})`); gr.addColorStop(0.55, `rgba(0,0,0,${0.8 * inten})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.globalCompositeOperation = 'destination-out'; dctx.fillStyle = gr; dctx.fillRect(0, 0, W, H);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(dark, 0, 0);
      // HUD
      ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#ddd'; ctx.textAlign = 'left';
      ctx.fillText(`TIME ${fmt(g.time)}   KEYS ${g.keys}   SCORE ${scoreOf(g)}`, 70, 30);
      ctx.fillStyle = '#222'; ctx.fillRect(70, 42, 160, 16); ctx.fillStyle = g.battery < 20 ? '#fff' : '#aaa';
      if (g.battery >= 20 || Math.floor(g.time * 4) % 2) ctx.fillRect(72, 44, 156 * g.battery / 100, 12);
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ctx.strokeRect(70, 42, 160, 16);
      ctx.fillStyle = '#ddd'; ctx.font = '12px monospace'; ctx.fillText(`${Math.ceil(g.battery)}%`, 238, 55);
      ctx.textAlign = 'center';
      if (g.toastT > 0) { ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(g.toast, W / 2, 80); }
      let prompt = '';
      if (p.hidden) prompt = 'E: leave box'; else {
        const cr = nearest(g.crates, 85), ch = nearest(g.chests.filter(c => !c.openUntil), 70);
        prompt = cr ? 'E: hide' : ch ? 'E: open chest' : '';
      }
      if (prompt) { ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(prompt, W / 2, H / 2 + 60); }
      ctx.font = '11px monospace'; ctx.fillStyle = '#888'; ctx.fillText('You can hide inside X crates!', W / 2, H - 10);
      if (touch && joy.current.id >= 0) { ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(joy.current.ox, joy.current.oy, 50, 0, 6.28); ctx.stroke(); ctx.beginPath(); ctx.arc(joy.current.ox + joy.current.x * 50, joy.current.oy + joy.current.y * 50, 22, 0, 6.28); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill(); }
    };

    const loop = (t: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
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
          <button className="w-16 h-16 rounded-full bg-white/20 border border-white/50 text-white font-bold" onPointerDown={() => { act.current = true; }}>E</button>
          <button className="w-16 h-16 rounded-full bg-white/20 border border-white/50 text-white text-xs font-bold" onPointerDown={() => { runBtn.current = true; }} onPointerUp={() => { runBtn.current = false; }} onPointerLeave={() => { runBtn.current = false; }}>RUN</button>
        </div>
      )}
      {phase !== 'play' && (
        <div className="absolute inset-0 z-10 bg-black/90 flex flex-col items-center justify-center text-center text-neutral-200 p-6 gap-4">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-[0.3em] text-white">{phase === 'dead' ? 'YOU DIED' : 'THE WAREHOUSE'}</h1>
          {phase === 'dead' && res ? (
            <div className="space-y-1">
              <p className="text-neutral-400">{res.why}</p>
              <p>Survived {fmt(res.time)} · {res.keys} keys · Score {res.score}</p>
              {res.nb && <p className="text-white font-bold">NEW BEST SCORE!</p>}
            </div>
          ) : (
            <div className="max-w-md text-sm text-neutral-400 space-y-1">
              <p>Survive. Find keys in chests. Find batteries — your battery is your life and your light.</p>
              <p>WASD/Arrows move · Shift run (loud) · E open chest / hide</p>
              <p>Hide in X crates. If the monster sees you enter, you're dead. Hidden pressure plates are loud.</p>
            </div>
          )}
          <p className="text-neutral-500 text-sm">Best: {fmt(best.time)} · Score {best.score}</p>
          <button onClick={() => { setRes(null); setPhase('play'); }} className="px-8 py-3 border border-white text-white tracking-widest hover:bg-white hover:text-black transition">{phase === 'dead' ? 'TRY AGAIN' : 'ENTER'}</button>
        </div>
      )}
    </div>
  );
}

function drawRobot(ctx: CanvasRenderingContext2D, x: number, y: number, face: number, t: number) {
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 14, 15, 6, 0, 0, 6.28); ctx.fill();
  const bob = Math.sin(t * 4) * 1.5;
  ctx.fillStyle = '#e6e6e6'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y + bob, 15, 0, 6.28); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.ellipse(x + face * 3, y - 2 + bob, 11, 8, 0, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.ellipse(x + face * 3 - 4, y - 2 + bob, 2.5, 3.5, 0, 0, 6.28); ctx.ellipse(x + face * 3 + 4, y - 2 + bob, 2.5, 3.5, 0, 0, 6.28); ctx.fill();
}
