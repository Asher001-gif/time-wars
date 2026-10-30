/* Volleyball "dopamine" layer: synthesized sound effects (no audio files), blockbuster-style
   pop-up text, sparks / confetti, screen shake and flashes. Purely cosmetic - no gameplay impact. */

/* ===================== AUDIO ===================== */
let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
try { muted = localStorage.getItem('vb-muted') === '1'; } catch { /* ignore */ }

export function unlockAudio() {
  try {
    if (!ac) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.85;
      master.connect(comp); comp.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  } catch { /* ignore */ }
}

export function isMuted() { return muted; }
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('vb-muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.85;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, to = freq, delay = 0) {
  if (!ac || !master || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.03);
}

function noise(dur: number, vol: number, type: BiquadFilterType, f0: number, f1 = f0, delay = 0, q = 1) {
  if (!ac || !master || !noiseBuf || muted) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.03);
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note -> Hz
function fanfare(notes: number[], step: number, vol: number, type: OscillatorType = 'sawtooth') {
  notes.forEach((n, i) => {
    tone(NOTE(n), 0.32, type, vol, NOTE(n), i * step);
    tone(NOTE(n + 12), 0.32, 'square', vol * 0.35, NOTE(n + 12), i * step);
  });
}

/* ===================== VISUAL FX STATE ===================== */
interface Popup { text: string; sub?: string; c0: string; c1: string; size: number; y: number; t0: number; dur: number; rot: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; g: number; rect: boolean; rot: number }

const popups: Popup[] = [];
const particles: Particle[] = [];
let shakeMag = 0, flashA = 0, flashC = '255,255,255', lastT = 0;
let lastKind: 'fire' | 'spike' | 'normal' = 'normal';
let streakSide: 'L' | 'R' | null = null, streak = 0;
let lastNet = 0;

export const getLastKind = () => lastKind;
export const resetKind = () => { lastKind = 'normal'; };
export function resetFx() { popups.length = 0; particles.length = 0; shakeMag = 0; flashA = 0; streak = 0; streakSide = null; lastKind = 'normal'; }

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function addPopup(text: string, o: { sub?: string; c0?: string; c1?: string; size?: number; y?: number; dur?: number; rot?: number } = {}) {
  const y = o.y ?? 400;
  for (let i = popups.length - 1; i >= 0; i--) if (Math.abs(popups[i].y - y) < 60) popups.splice(i, 1);
  popups.push({
    text, sub: o.sub, c0: o.c0 ?? '#fff6a8', c1: o.c1 ?? '#ff9a1f', size: o.size ?? 120, y,
    t0: performance.now(), dur: o.dur ?? 1300, rot: o.rot ?? (Math.random() < 0.5 ? -0.07 : 0.07),
  });
}

function burst(x: number, y: number, n: number, colors: string[], speed: number, g = 0.25, rect = false) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random() * 0.9);
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.2, life: 0, max: 0.5 + Math.random() * 0.7,
      size: 3 + Math.random() * 5, color: pick(colors), g, rect, rot: Math.random() * 6,
    });
  }
}

function confetti(n: number, colors: string[]) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x: 100 + Math.random() * 1400, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 5,
      life: 0, max: 1.6 + Math.random() * 1.2, size: 6 + Math.random() * 8, color: pick(colors), g: 0.08, rect: true, rot: Math.random() * 6,
    });
  }
}

/* ===================== EVENTS (called from the game logic) ===================== */
export function fxHit(rally: number, x: number, y: number) {
  lastKind = 'normal';
  const p = Math.min(rally, 14) * 9;
  tone(190 + p, 0.13, 'sine', 0.55, 80);
  noise(0.07, 0.25, 'lowpass', 1400, 400);
  if (rally >= 6) tone(600 + p * 6, 0.08, 'triangle', 0.14, 900 + p * 6);   // faster rally = brighter ping
  burst(x, y, 5, ['#ffffff', '#cfe8ff'], 4);
}

export function fxSet(x: number, y: number) {
  lastKind = 'normal';
  tone(520, 0.12, 'sine', 0.3, 760);
  noise(0.05, 0.12, 'bandpass', 900, 600);
  burst(x, y, 3, ['#9be7a8', '#ffffff'], 3);
}

export function fxSpike(x: number, y: number) {
  lastKind = 'spike';
  noise(0.22, 0.5, 'highpass', 3500, 600);
  tone(150, 0.2, 'square', 0.45, 45);
  tone(1100, 0.06, 'square', 0.25, 400);
  burst(x, y, 16, ['#ffe14a', '#ffffff', '#ff9a1f'], 9);
  shakeMag = Math.max(shakeMag, 7);
}

export function fxFire(x: number, y: number, rally: number) {
  lastKind = 'fire';
  noise(0.8, 0.55, 'bandpass', 250, 3200, 0, 2);
  tone(90, 0.7, 'sawtooth', 0.5, 420);
  tone(55, 0.5, 'sine', 0.7, 30);
  tone(NOTE(76), 0.25, 'square', 0.18, NOTE(88), 0.05);
  burst(x, y, 36, ['#ff5a14', '#ffb02e', '#ffe14a', '#ffffff'], 12, 0.15);
  shakeMag = Math.max(shakeMag, 16);
  flashA = 0.55; flashC = '255,170,60';
  addPopup('FIREBALL!', { c0: '#fff2a0', c1: '#ff3a0a', size: 150, y: 330, dur: 1100 });
  fxRally(rally);
}

export function fxNet() {
  const now = performance.now();
  if (now - lastNet < 160) return;
  lastNet = now;
  tone(110, 0.14, 'triangle', 0.4, 60);
  noise(0.12, 0.2, 'lowpass', 500, 200);
}

export function fxReady() {
  [72, 76, 79, 84].forEach((n, i) => tone(NOTE(n), 0.22, 'triangle', 0.3, NOTE(n), i * 0.07));
  addPopup('POWER READY!', { c0: '#fffbd0', c1: '#ffc400', size: 90, y: 620, dur: 1200, rot: 0 });
  flashA = 0.2; flashC = '255,225,74';
}

export function fxArmed() {
  tone(900, 0.16, 'square', 0.25, 1900);
  tone(NOTE(60), 0.4, 'sawtooth', 0.2, NOTE(72));
  addPopup('LOCKED & LOADED!', { c0: '#ffffff', c1: '#ff7a00', size: 80, y: 620, dur: 1000, rot: 0 });
  shakeMag = Math.max(shakeMag, 4);
}

export function fxWhistle() {
  tone(2300, 0.28, 'sine', 0.22, 2100);
  tone(2330, 0.28, 'sine', 0.16, 2080);
}

export function fxRally(n: number) {
  const labels: Record<number, [string, string, string]> = {
    5: ['NICE RALLY!', '#d6f5ff', '#2fa8ff'],
    10: ['INSANE RALLY!', '#fff2a0', '#ff8a00'],
    15: ['LEGENDARY!', '#ffd6f5', '#e02fa0'],
    20: ['UNREAL!!', '#fff', '#ff2f2f'],
    25: ['GODLIKE!!!', '#fff', '#9a2fff'],
  };
  const l = labels[n];
  if (!l) return;
  [79, 83, 88].forEach((m, i) => tone(NOTE(m), 0.18, 'triangle', 0.3, NOTE(m), i * 0.06));
  addPopup(l[0], { sub: `${n} HITS`, c0: l[1], c1: l[2], size: 110, y: 270, dur: 1200 });
  shakeMag = Math.max(shakeMag, 6);
  burst(800, 300, 24, ['#ffffff', l[2], '#ffe14a'], 10, 0.12);
}

export function fxPoint(kind: 'fire' | 'spike' | 'normal' | 'error', mine: boolean, winner: 'L' | 'R', matchPoint: boolean, x: number, y: number) {
  streak = streakSide === winner ? streak + 1 : 1; streakSide = winner;
  // ball hits the sand
  tone(120, 0.3, 'sine', 0.7, 35);
  noise(0.25, 0.3, 'lowpass', 900, 150);
  // crowd
  noise(1.1, mine ? 0.28 : 0.12, 'bandpass', 1400, 2200, 0.05, 0.6);
  if (mine) fanfare([72, 76, 79, 84], 0.09, 0.2);
  else { tone(NOTE(67), 0.3, 'triangle', 0.3, NOTE(66), 0); tone(NOTE(64), 0.3, 'triangle', 0.3, NOTE(62), 0.2); tone(NOTE(60), 0.6, 'triangle', 0.3, NOTE(55), 0.4); }

  let text: string, c0: string, c1: string;
  if (mine) {
    if (kind === 'fire') { text = pick(['FIREBALL FINISH!', 'INFERNO!', 'BURN BABY BURN!']); c0 = '#fff2a0'; c1 = '#ff3a0a'; }
    else if (kind === 'spike') { text = pick(['SPIKE KILL!', 'DEVASTATING!', 'SMASHED!']); c0 = '#fff'; c1 = '#ff8a00'; }
    else if (kind === 'error') { text = pick(['THEY CHOKED!', 'FREE POINT!']); c0 = '#e8ffe8'; c1 = '#2fc45a'; }
    else { text = pick(['POINT!', 'BOOM!', 'CLEAN!', 'NICE ONE!']); c0 = '#fffbd0'; c1 = '#ffc400'; }
  } else {
    if (kind === 'fire') { text = pick(['TORCHED!', 'OUCH! FIREBALL!']); c0 = '#ffd0c0'; c1 = '#c01818'; }
    else if (kind === 'spike') { text = pick(['GOT SPIKED!', 'DESTROYED!']); c0 = '#ffd0d0'; c1 = '#c01818'; }
    else if (kind === 'error') { text = pick(['SELF-DESTRUCT!', 'WHAT A MISS!']); c0 = '#e0e0e8'; c1 = '#70708a'; }
    else { text = pick(['DROPPED!', 'OUCH!', 'THEY SCORE!']); c0 = '#e0e8ff'; c1 = '#4a6fd0'; }
  }
  const subs: string[] = [];
  if (streak >= 2) subs.push(`${streak} IN A ROW!`);
  if (matchPoint) subs.push('MATCH POINT!');
  addPopup(text, { sub: subs.join('  •  ') || undefined, c0, c1, size: 130, y: 420, dur: 1500 });
  shakeMag = Math.max(shakeMag, mine ? 14 : 9);
  flashA = mine ? 0.35 : 0.2; flashC = mine ? '255,240,160' : '255,255,255';
  burst(x, Math.min(y, 700), 30, mine ? ['#ffe14a', '#ffffff', '#ff9a1f'] : ['#c8d0e0', '#8a96b0'], 10);
  if (mine) confetti(70, ['#ffe14a', '#ff5a5a', '#4a90d9', '#3dba6f', '#ffffff']);
  if (streak >= 3) [76, 79, 83, 88, 91].forEach((n, i) => tone(NOTE(n), 0.2, 'square', 0.14, NOTE(n), 0.45 + i * 0.06));
}

export function fxOver(won: boolean) {
  if (won) {
    fanfare([67, 72, 76, 79, 84, 79, 84, 88], 0.13, 0.22);
    noise(2, 0.3, 'bandpass', 1500, 2500, 0.1, 0.6);
    confetti(160, ['#ffe14a', '#ff5a5a', '#4a90d9', '#3dba6f', '#ffffff']);
  } else {
    [64, 62, 60, 55].forEach((n, i) => tone(NOTE(n), 0.5, 'triangle', 0.3, NOTE(n - 1), i * 0.28));
  }
}

/* ===================== PER-FRAME ===================== */
export function shakeOffset(): [number, number] {
  if (shakeMag < 0.3) return [0, 0];
  return [(Math.random() - 0.5) * shakeMag * 2, (Math.random() - 0.5) * shakeMag * 2];
}

const easeOutBack = (t: number) => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/** Advances + draws sparks, flash and blockbuster text. Call last inside the world-space transform. */
export function drawFx(ctx: CanvasRenderingContext2D, now: number, x0: number, y0: number, x1: number, y1: number) {
  const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016; lastT = now;
  const top = Math.min(0, y0), bottom = Math.max(800, y1);
  shakeMag = Math.max(0, shakeMag - dt * 38);

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.max) { particles.splice(i, 1); continue; }
    p.vy += p.g * dt * 60; p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.rot += dt * 6;
    ctx.globalAlpha = Math.min(1, (1 - p.life / p.max) * 1.6);
    ctx.fillStyle = p.color;
    if (p.rect) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - p.life / p.max * 0.5), 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;

  // screen flash
  if (flashA > 0.01) {
    ctx.fillStyle = `rgba(${flashC},${flashA})`;
    ctx.fillRect(x0 - 2, top - 2, x1 - x0 + 4, bottom - top + 4);
    flashA -= dt * 1.8;
  }

  // blockbuster text
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i], age = now - p.t0;
    if (age > p.dur) { popups.splice(i, 1); continue; }
    const k = age / p.dur;
    const pop = age < 220 ? easeOutBack(age / 220) : 1 + Math.sin(age * 0.012) * 0.015;
    const scale = 0.15 + 0.85 * pop;
    const alpha = k > 0.75 ? (1 - k) / 0.25 : 1;
    const cx = (x0 + x1) / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    // cinematic band behind the text
    const bh = p.size * 1.5 * Math.min(1, age / 120);
    const band = ctx.createLinearGradient(x0, 0, x1, 0);
    band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.2, 'rgba(0,0,0,0.55)');
    band.addColorStop(0.8, 'rgba(0,0,0,0.55)'); band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band; ctx.fillRect(x0, p.y - bh / 2, x1 - x0, bh);
    // text
    ctx.translate(cx, p.y); ctx.rotate(p.rot * Math.min(1, age / 220)); ctx.scale(scale, scale);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `italic 900 ${p.size}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.shadowColor = p.c1; ctx.shadowBlur = 40;
    ctx.lineWidth = p.size * 0.14; ctx.strokeStyle = '#000';
    ctx.strokeText(p.text, 0, 0);
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(0, -p.size / 2, 0, p.size / 2);
    g.addColorStop(0, p.c0); g.addColorStop(0.55, p.c1); g.addColorStop(1, p.c1);
    ctx.fillStyle = g; ctx.fillText(p.text, 0, 0);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.strokeText(p.text, 0, -1);
    if (p.sub) {
      ctx.font = `bold ${Math.round(p.size * 0.3)}px monospace`;
      ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(p.sub, 0, p.size * 0.72);
      ctx.fillStyle = '#fff'; ctx.fillText(p.sub, 0, p.size * 0.72);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
