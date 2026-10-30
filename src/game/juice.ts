/**
 * Mars Mission "juice": particles, screen shake, floating text, announcer banners and
 * tiny synthesized sound effects. Purely cosmetic — the engine just calls these helpers
 * and the renderer draws the result, so nothing here touches game rules.
 */

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number }
interface Floater { x: number; y: number; text: string; color: string; t0: number; size: number }
interface Ring { x: number; y: number; r0: number; r1: number; t0: number; dur: number; color: string; width: number }
interface Banner { text: string; sub?: string; color: string; t0: number; dur: number }

const fx = {
  particles: [] as Particle[],
  floaters: [] as Floater[],
  rings: [] as Ring[],
  banners: [] as Banner[],
  shake: 0,
  flash: null as { color: string; t0: number; dur: number } | null,
  last: 0,
};

const MAX_PARTICLES = 400;

export function resetFx() {
  fx.particles = []; fx.floaters = []; fx.rings = []; fx.banners = []; fx.shake = 0; fx.flash = null; fx.last = 0;
}

export function burst(x: number, y: number, color: string, n = 14, speed = 3.2, size = 3, grav = 0.04) {
  for (let i = 0; i < n && fx.particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.85);
    const max = 420 + Math.random() * 420;
    fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, size: size * (0.6 + Math.random() * 0.8), color, grav });
  }
}

export function floater(x: number, y: number, text: string, color = '#fff', size = 16) {
  fx.floaters.push({ x, y, text, color, t0: performance.now(), size });
}

export function ring(x: number, y: number, r1: number, color: string, dur = 520, width = 4, r0 = 8) {
  fx.rings.push({ x, y, r0, r1, t0: performance.now(), dur, color, width });
}

export function shake(mag: number) { fx.shake = Math.max(fx.shake, mag); }

export function flash(color: string, dur = 260) { fx.flash = { color, t0: performance.now(), dur }; }

export function banner(text: string, color = '#ffe46a', sub?: string, dur = 2200) {
  fx.banners.push({ text, sub, color, t0: performance.now(), dur });
  if (fx.banners.length > 3) fx.banners.shift();
}

/** Advance particles / shake. Call once per rendered frame. */
export function stepFx(now: number) {
  const dt = fx.last ? Math.min(50, now - fx.last) : 16;
  fx.last = now;
  const k = dt / 16;
  for (const p of fx.particles) {
    p.x += p.vx * k; p.y += p.vy * k; p.vy += p.grav * k; p.vx *= 0.985; p.life -= dt;
  }
  fx.particles = fx.particles.filter(p => p.life > 0);
  fx.floaters = fx.floaters.filter(f => now - f.t0 < 1300);
  fx.rings = fx.rings.filter(r => now - r.t0 < r.dur);
  fx.banners = fx.banners.filter(b => now - b.t0 < b.dur);
  fx.shake *= Math.pow(0.9, k);
  if (fx.shake < 0.3) fx.shake = 0;
  if (fx.flash && now - fx.flash.t0 > fx.flash.dur) fx.flash = null;
}

export function shakeOffset() {
  if (fx.shake <= 0) return { x: 0, y: 0 };
  return { x: (Math.random() - 0.5) * 2 * fx.shake, y: (Math.random() - 0.5) * 2 * fx.shake };
}

/** World-space effects (call inside the camera transform). */
export function drawWorldFx(ctx: CanvasRenderingContext2D, now: number) {
  ctx.save();
  for (const r of fx.rings) {
    const t = (now - r.t0) / r.dur;
    const e = 1 - Math.pow(1 - t, 3);
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - t * 0.6);
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * (p.life / p.max)), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center';
  for (const f of fx.floaters) {
    const t = (now - f.t0) / 1300;
    const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.6 : 1.2 - Math.min(0.2, (t - 0.12) * 0.4);
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    ctx.font = `bold ${Math.round(f.size * pop)}px monospace`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    const y = f.y - 26 - t * 46;
    ctx.strokeText(f.text, f.x, y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, y);
  }
  ctx.restore();
}

/** Screen-space effects: colour flash + big announcer banners. */
export function drawScreenFx(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
  if (fx.flash) {
    const t = (now - fx.flash.t0) / fx.flash.dur;
    ctx.save(); ctx.globalAlpha = 0.35 * (1 - t); ctx.fillStyle = fx.flash.color; ctx.fillRect(0, 0, w, h); ctx.restore();
  }
  fx.banners.forEach((b, i) => {
    const t = (now - b.t0) / b.dur;
    const inT = Math.min(1, t / 0.12), outT = t > 0.8 ? (t - 0.8) / 0.2 : 0;
    const scale = 0.5 + 0.5 * (1 - Math.pow(1 - inT, 3)) + (t < 0.2 ? Math.sin(inT * Math.PI) * 0.18 : 0);
    const y = h * 0.28 + i * 78;
    ctx.save();
    ctx.globalAlpha = (1 - outT) * Math.min(1, inT * 1.5);
    ctx.translate(w / 2, y); ctx.scale(scale, scale);
    const size = Math.max(26, Math.min(60, w / 16));
    ctx.textAlign = 'center';
    ctx.font = `900 ${size}px monospace`;
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineJoin = 'round';
    ctx.shadowColor = b.color; ctx.shadowBlur = 24;
    ctx.strokeText(b.text, 0, 0); ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0);
    if (b.sub) {
      ctx.shadowBlur = 0; ctx.font = `bold ${Math.round(size * 0.34)}px monospace`;
      ctx.lineWidth = 4; ctx.strokeText(b.sub, 0, size * 0.55); ctx.fillStyle = '#fff'; ctx.fillText(b.sub, 0, size * 0.55);
    }
    ctx.restore();
  });
}

/* ===================== SOUND (WebAudio, no assets) ===================== */
let ac: AudioContext | null = null;
const lastPlay: Record<string, number> = {};

function audio(): AudioContext | null {
  try {
    if (!ac) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  } catch { return null; }
}

function tone(c: AudioContext, freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number) {
  const t0 = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export type Sfx = 'pickup' | 'task' | 'kill' | 'shield' | 'streak' | 'surge' | 'warn' | 'boom' | 'emp' | 'laststand' | 'hack';

export function sfx(name: Sfx) {
  const now = performance.now();
  if (now - (lastPlay[name] ?? 0) < 70) return;
  lastPlay[name] = now;
  const c = audio(); if (!c) return;
  switch (name) {
    case 'pickup': [660, 880, 1320].forEach((f, i) => tone(c, f, 0.12, 'triangle', 0.16, i * 0.06)); break;
    case 'task': [523, 659, 784, 1046].forEach((f, i) => tone(c, f, 0.16, 'square', 0.1, i * 0.07)); break;
    case 'kill': tone(c, 180, 0.28, 'sawtooth', 0.2, 0, 40); tone(c, 90, 0.3, 'square', 0.15); break;
    case 'shield': tone(c, 900, 0.18, 'sine', 0.2, 0, 1800); tone(c, 1800, 0.15, 'sine', 0.1, 0.05); break;
    case 'streak': [392, 523, 659, 784, 1046].forEach((f, i) => tone(c, f, 0.12, 'sawtooth', 0.11, i * 0.05)); break;
    case 'surge': [262, 330, 392, 523, 659, 784].forEach((f, i) => tone(c, f, 0.2, 'triangle', 0.14, i * 0.06)); break;
    case 'warn': tone(c, 520, 0.14, 'square', 0.12); tone(c, 520, 0.14, 'square', 0.12, 0.22); break;
    case 'boom': tone(c, 110, 0.55, 'sawtooth', 0.28, 0, 28); tone(c, 60, 0.6, 'sine', 0.3); break;
    case 'emp': tone(c, 1400, 0.4, 'sawtooth', 0.14, 0, 90); tone(c, 300, 0.4, 'square', 0.1, 0.05, 60); break;
    case 'laststand': tone(c, 196, 0.5, 'sawtooth', 0.2, 0, 392); tone(c, 392, 0.5, 'square', 0.12, 0.12, 784); break;
    case 'hack': [1200, 900, 1500, 1100, 1800].forEach((f, i) => tone(c, f, 0.06, 'square', 0.09, i * 0.04)); break;
  }
}
