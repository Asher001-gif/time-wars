import { useState, useEffect, useRef, useCallback } from 'react';
import { TaskChallenge } from '@/game/types';

interface Props {
  task: TaskChallenge;
  onComplete: () => void;
  onCancel: () => void;
}

export default function TaskOverlay({ task, onComplete, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()}>
      <div className="bg-card border-2 border-border rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl space-y-3 relative">
        {/* Close button */}
        <button onClick={onCancel}
          className="absolute top-3 left-3 w-7 h-7 rounded-full bg-destructive/20 hover:bg-destructive/40 flex items-center justify-center text-destructive font-bold text-sm transition-colors">
          ✕
        </button>
        <h2 className="font-mono font-bold text-base text-foreground text-center pt-1">
          {task.type === 'frequency' && '📻 FREQUENCY SCRUBBER'}
          {task.type === 'morse' && '📟 MORSE CODE SYNC'}
          {task.type === 'satellite' && '📡 SATELLITE REALIGNMENT'}
          {task.type === 'backup' && '📁 BACKUP DATA'}
          {task.type === 'solar' && '🧼 SOLAR PANEL SCRUBBER'}
          {task.type === 'power' && '🔋 POWER FLICK'}
          {task.type === 'magnetic' && '🧩 MAGNETIC SNAP'}
          {task.type === 'password' && '🔑 PASSWORD CRACK'}
          {task.type === 'ice' && '🧊 ICE SHATTER'}
          {task.type === 'dna' && '🧬 DNA SLIDER'}
          {task.type === 'door' && '🚪 DOOR CONTROL'}
        </h2>

        {task.type === 'frequency' && <FrequencyTask task={task} onComplete={onComplete} />}
        {task.type === 'morse' && <MorseTask task={task} onComplete={onComplete} />}
        {task.type === 'satellite' && <SatelliteTask task={task} onComplete={onComplete} />}
        {task.type === 'backup' && <BackupTask task={task} onComplete={onComplete} />}
        {task.type === 'solar' && <SolarTask onComplete={onComplete} />}
        {task.type === 'power' && <PowerTask onComplete={onComplete} />}
        {task.type === 'magnetic' && <MagneticTask onComplete={onComplete} />}
        {task.type === 'password' && <PasswordTask task={task} onComplete={onComplete} />}
        {task.type === 'ice' && <IceTask task={task} onComplete={onComplete} />}
        {task.type === 'dna' && <DnaTask task={task} onComplete={onComplete} />}
        {task.type === 'door' && <DoorTask task={task} onComplete={onComplete} />}
      </div>
    </div>
  );
}

/* ─── DOOR CONTROL ─── */
function DoorTask({ task, onComplete }: { task: TaskChallenge; onComplete: () => void }) {
  const action = task.doorAction || 'open';
  const [val, setVal] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (val >= 100 && !done) {
      setDone(true);
      setTimeout(onComplete, 250);
    }
  }, [val, done, onComplete]);

  return (
    <div className="space-y-3 text-center">
      <p className="text-xs font-mono text-muted-foreground">
        Slide all the way to {action === 'open' ? 'OPEN' : 'CLOSE'} the door
      </p>
      <div className="relative w-32 h-32 mx-auto rounded-full border-2 border-border bg-background flex items-center justify-center">
        <svg width="128" height="128" className="absolute inset-0">
          <circle cx="64" cy="64" r="56" stroke="hsl(var(--muted))" strokeWidth="6" fill="none" />
          <circle cx="64" cy="64" r="56"
            stroke={action === 'open' ? '#3dba6f' : '#e85d3a'}
            strokeWidth="6" fill="none"
            strokeDasharray={`${(val / 100) * 351.86} 351.86`}
            strokeLinecap="round"
            transform="rotate(-90 64 64)" />
        </svg>
        <span className="font-mono text-2xl">{action === 'open' ? '🚪→' : '←🚪'}</span>
      </div>
      <input type="range" min={0} max={100} value={val}
        onChange={e => setVal(Number(e.target.value))}
        className="w-full accent-primary" />
      <p className="text-xs font-mono text-muted-foreground">{val}%</p>
    </div>
  );
}

/* ─── FREQUENCY SCRUBBER ─── */
function FrequencyTask({ task, onComplete }: { task: TaskChallenge; onComplete: () => void }) {
  const target = task.targetAngle || 180;
  const [angle, setAngle] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const diff = Math.abs(angle - target);
  const signal = Math.max(0, 1 - diff / 180);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const w = canvasRef.current!.width, h = canvasRef.current!.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = signal > 0.9 ? '#22c55e' : '#f97316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const noise = (1 - signal) * Math.random() * 20;
      const y = h / 2 + Math.sin((x + angle) * 0.05) * 20 + noise;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [angle, signal]);

  useEffect(() => { if (signal > 0.95) setTimeout(onComplete, 400); }, [signal, onComplete]);

  return (
    <div className="space-y-3">
      <canvas ref={canvasRef} width={280} height={80} className="w-full rounded-lg bg-background border border-border" />
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground">TUNE</span>
        <input type="range" min={0} max={360} value={angle}
          onChange={e => setAngle(Number(e.target.value))}
          className="flex-1 accent-primary" />
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div className="h-full transition-all duration-150 rounded-full"
          style={{ width: `${signal * 100}%`, background: signal > 0.9 ? '#22c55e' : signal > 0.5 ? '#f97316' : '#ef4444' }} />
      </div>
      <p className="text-xs font-mono text-center text-muted-foreground">
        {signal > 0.9 ? '✓ Connected!' : 'Adjust dial to clear the signal...'}
      </p>
    </div>
  );
}

/* ─── MORSE CODE SYNC ─── */
function MorseTask({ task, onComplete }: { task: TaskChallenge; onComplete: () => void }) {
  const pattern = task.morsePattern || ['short', 'short', 'long'];
  const [phase, setPhase] = useState<'watch' | 'input'>('watch');
  const [flashIdx, setFlashIdx] = useState(-1);
  const [userInput, setUserInput] = useState<('short' | 'long')[]>([]);
  const [error, setError] = useState('');
  const tapStart = useRef(0);

  // Play the pattern
  useEffect(() => {
    if (phase !== 'watch') return;
    let i = 0;
    const play = () => {
      if (i >= pattern.length) {
        setTimeout(() => { setFlashIdx(-1); setPhase('input'); }, 600);
        return;
      }
      setFlashIdx(i);
      const dur = pattern[i] === 'long' ? 600 : 250;
      setTimeout(() => { setFlashIdx(-1); setTimeout(() => { i++; play(); }, 300); }, dur);
    };
    const t = setTimeout(play, 500);
    return () => clearTimeout(t);
  }, [phase, pattern]);

  const handleDown = () => { tapStart.current = Date.now(); };
  const handleUp = () => {
    const dur = Date.now() - tapStart.current;
    const type: 'short' | 'long' = dur > 350 ? 'long' : 'short';
    const next = [...userInput, type];
    setUserInput(next);

    const idx = next.length - 1;
    if (next[idx] !== pattern[idx]) {
      setError('Wrong pattern! Watch again.');
      setTimeout(() => { setUserInput([]); setError(''); setPhase('watch'); }, 1000);
      return;
    }
    if (next.length === pattern.length) setTimeout(onComplete, 400);
  };

  return (
    <div className="space-y-3 text-center">
      {/* Signal light */}
      <div className={`w-16 h-16 mx-auto rounded-full border-2 border-border transition-colors duration-100 ${flashIdx >= 0 ? 'bg-yellow-400 shadow-lg shadow-yellow-400/50' : 'bg-muted'}`} />
      {phase === 'watch' && <p className="text-xs font-mono text-muted-foreground">Watch the pattern...</p>}
      {phase === 'input' && (
        <>
          <p className="text-xs font-mono text-foreground">Tap: short press / Hold: long press</p>
          <div className="flex gap-1 justify-center">
            {pattern.map((p, i) => (
              <div key={i} className={`h-3 rounded ${p === 'long' ? 'w-10' : 'w-4'} ${i < userInput.length ? (userInput[i] === p ? 'bg-green-500' : 'bg-red-500') : 'bg-muted-foreground/30'}`} />
            ))}
          </div>
          <button onPointerDown={handleDown} onPointerUp={handleUp}
            className="w-20 h-20 mx-auto rounded-full bg-primary text-primary-foreground font-mono font-bold text-lg active:scale-90 transition-transform select-none">
            TAP
          </button>
        </>
      )}
      {error && <p className="text-xs font-mono text-destructive">{error}</p>}
    </div>
  );
}

/* ─── SATELLITE REALIGNMENT ─── */
function SatelliteTask({ task, onComplete }: { task: TaskChallenge; onComplete: () => void }) {
  const target = task.targetRotation || 120;
  const [rotation, setRotation] = useState(0);
  const diff = Math.abs(((rotation - target + 180) % 360) - 180);
  const signal = Math.max(0, 1 - diff / 180);

  useEffect(() => { if (signal > 0.95) setTimeout(onComplete, 400); }, [signal, onComplete]);

  return (
    <div className="space-y-3 text-center">
      <div className="relative w-40 h-40 mx-auto">
        {/* Satellite dot */}
        <div className="absolute w-4 h-4 rounded-full bg-yellow-400 border-2 border-yellow-600"
          style={{ top: `${50 - 40 * Math.cos(target * Math.PI / 180)}%`, left: `${50 + 40 * Math.sin(target * Math.PI / 180)}%`, transform: 'translate(-50%,-50%)' }} />
        {/* Dish */}
        <div className="absolute top-1/2 left-1/2 w-12 h-8 -translate-x-1/2 -translate-y-1/2 border-2 border-foreground rounded-t-full"
          style={{ transform: `translate(-50%,-50%) rotate(${rotation}deg)` }} />
        <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-foreground rounded-full -translate-x-1/2 -translate-y-1/2" />
      </div>
      <input type="range" min={0} max={360} value={rotation}
        onChange={e => setRotation(Number(e.target.value))}
        className="w-full accent-primary" />
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div className="h-full transition-all rounded-full"
          style={{ width: `${signal * 100}%`, background: signal > 0.9 ? '#22c55e' : signal > 0.5 ? '#f97316' : '#ef4444' }} />
      </div>
      <p className="text-xs font-mono text-muted-foreground">{signal > 0.9 ? '✓ Aligned!' : 'Rotate the dish toward the satellite'}</p>
    </div>
  );
}

/* ─── BACKUP DATA ─── */
function BackupTask({ task, onComplete }: { task: TaskChallenge; onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const duration = task.duration || 5000;
    const start = Date.now();
    const iv = setInterval(() => {
      const p = Math.min(1.01, (Date.now() - start) / duration);
      setProgress(p);
      if (p >= 1.01) { clearInterval(iv); setTimeout(onComplete, 300); }
    }, 50);
    return () => clearInterval(iv);
  }, [task, onComplete]);

  return (
    <div className="space-y-3 text-center">
      <div className="font-mono text-3xl text-foreground">{Math.min(101, Math.floor(progress * 101))}%</div>
      <div className="h-4 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all duration-100 rounded-full" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
      <p className="text-xs font-mono text-muted-foreground">Please wait... backing up data</p>
    </div>
  );
}

/* ─── SOLAR PANEL SCRUBBER ─── */
function SolarTask({ onComplete }: { onComplete: () => void }) {
  const [cleaned, setCleaned] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dustRef = useRef<boolean[]>([]);
  const total = 20 * 12;

  useEffect(() => {
    dustRef.current = new Array(total).fill(true);
    drawDust();
  }, []);

  const drawDust = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const w = canvasRef.current!.width, h = canvasRef.current!.height;
    // Panel
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(0, 0, w, h);
    // Grid lines
    ctx.strokeStyle = '#1e3a8a';
    for (let x = 0; x < w; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // Dust
    dustRef.current.forEach((hasDust, i) => {
      if (!hasDust) return;
      const col = i % 20, row = Math.floor(i / 20);
      ctx.fillStyle = `rgba(194, 120, 50, ${0.5 + Math.random() * 0.3})`;
      ctx.fillRect(col * 14, row * 14, 14, 14);
    });
  };

  const handleSwipe = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    const col = Math.floor((x * scaleX) / 14), row = Math.floor((y * scaleY) / 14);
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const idx = (row + dr) * 20 + (col + dc);
        if (idx >= 0 && idx < total && dustRef.current[idx]) {
          dustRef.current[idx] = false;
          count++;
        }
      }
    }
    if (count > 0) {
      const newCleaned = cleaned + count;
      setCleaned(newCleaned);
      drawDust();
      if (newCleaned / total > 0.85) setTimeout(onComplete, 300);
    }
  };

  return (
    <div className="space-y-2 text-center">
      <p className="text-xs font-mono text-muted-foreground">Swipe to clean the dust!</p>
      <canvas ref={canvasRef} width={280} height={168}
        className="w-full rounded-lg border border-border cursor-pointer touch-none"
        onPointerMove={handleSwipe} onPointerDown={handleSwipe} />
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-green-500 transition-all rounded-full" style={{ width: `${(cleaned / total) * 100}%` }} />
      </div>
    </div>
  );
}

/* ─── POWER FLICK ─── */
function PowerTask({ onComplete }: { onComplete: () => void }) {
  const [cells, setCells] = useState([false, false, false]);
  const handleFlick = (i: number) => {
    const next = [...cells];
    next[i] = true;
    setCells(next);
    if (next.every(Boolean)) setTimeout(onComplete, 500);
  };

  return (
    <div className="space-y-3 text-center">
      <p className="text-xs font-mono text-muted-foreground">Tap each battery to slam it into port!</p>
      <div className="flex justify-center gap-4">
        {cells.map((done, i) => (
          <div key={i} className="relative w-16 h-28">
            {/* Port */}
            <div className="absolute top-0 w-full h-12 rounded-lg border-2 border-dashed border-muted-foreground/40 flex items-center justify-center">
              <span className="text-xs font-mono text-muted-foreground">{done ? '✓' : 'PORT'}</span>
            </div>
            {/* Battery */}
            {!done && (
              <button onClick={() => handleFlick(i)}
                className="absolute bottom-0 w-full h-14 rounded-lg bg-yellow-500 border-2 border-yellow-600 flex items-center justify-center font-mono font-bold text-sm active:scale-90 active:-translate-y-8 transition-all cursor-pointer select-none">
                🔋
              </button>
            )}
            {done && (
              <div className="absolute top-0 w-full h-12 rounded-lg bg-green-500/30 flex items-center justify-center">
                <span className="text-lg">🔋</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── MAGNETIC SNAP ─── */
function MagneticTask({ onComplete }: { onComplete: () => void }) {
  const [pos, setPos] = useState({ left: 20, right: 240 });
  const [snapped, setSnapped] = useState(false);
  const dragging = useRef<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(260, e.clientX - rect.left - 20));
    setPos(p => ({ ...p, [dragging.current!]: x }));
    if (Math.abs(pos.left - pos.right) < 30 && !snapped) {
      setSnapped(true);
      setTimeout(onComplete, 600);
    }
  };

  return (
    <div className="space-y-3 text-center">
      <p className="text-xs font-mono text-muted-foreground">Drag pieces together to snap!</p>
      <div ref={containerRef} className="relative h-20 bg-background rounded-lg border border-border touch-none"
        onPointerMove={handleMove} onPointerUp={() => { dragging.current = null; }}>
        {!snapped ? (
          <>
            <div className="absolute top-4 h-12 w-16 bg-orange-500/80 rounded-l-lg border-2 border-orange-600 cursor-grab flex items-center justify-center font-mono text-xs text-foreground select-none"
              style={{ left: pos.left }}
              onPointerDown={() => { dragging.current = 'left'; }}>◄</div>
            <div className="absolute top-4 h-12 w-16 bg-orange-500/80 rounded-r-lg border-2 border-orange-600 cursor-grab flex items-center justify-center font-mono text-xs text-foreground select-none"
              style={{ left: pos.right }}
              onPointerDown={() => { dragging.current = 'right'; }}>►</div>
          </>
        ) : (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 h-12 w-32 bg-green-500/60 rounded-lg border-2 border-green-600 flex items-center justify-center font-mono text-sm text-foreground animate-pulse">
            🔗 LOCKED!
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── PASSWORD CRACK ─── */
function PasswordTask({ task, onComplete }: { task: TaskChallenge; onComplete: () => void }) {
  const digits = task.passwordDigits || '1234';
  const [phase, setPhase] = useState<'show' | 'input'>('show');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setPhase('input'), 3000);
    return () => clearTimeout(t);
  }, []);

  const handleKey = (n: string) => {
    if (input.length >= 4) return;
    const next = input + n;
    setInput(next);
    if (next.length === 4) {
      if (next === digits) {
        setTimeout(onComplete, 400);
      } else {
        setError('Wrong code!');
        setTimeout(() => { setInput(''); setError(''); }, 800);
      }
    }
  };

  return (
    <div className="space-y-3 text-center">
      {phase === 'show' && (
        <>
          <p className="text-xs font-mono text-muted-foreground">Remember this code!</p>
          <div className="font-mono text-5xl tracking-[0.3em] text-primary font-bold">{digits}</div>
          <div className="h-1 bg-primary/30 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-[shrink_3s_linear]" style={{ animation: 'shrink 3s linear forwards' }} />
          </div>
        </>
      )}
      {phase === 'input' && (
        <>
          <p className="text-xs font-mono text-muted-foreground">Enter the 4-digit code</p>
          <div className="flex gap-2 justify-center">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="w-12 h-14 rounded-lg border-2 border-border bg-background flex items-center justify-center font-mono text-2xl text-foreground">
                {input[i] || '_'}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1.5 max-w-[250px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(n => (
              <button key={n} onClick={() => handleKey(n)}
                className="h-10 rounded-lg bg-muted hover:bg-accent font-mono text-lg text-foreground font-bold active:scale-90 transition-transform">
                {n}
              </button>
            ))}
          </div>
          {error && <p className="text-xs font-mono text-destructive">{error}</p>}
        </>
      )}
    </div>
  );
}

/* ─── ICE SHATTER ─── */
function IceTask({ task, onComplete }: { task: TaskChallenge; onComplete: () => void }) {
  const required = task.tapsRequired || 20;
  const [taps, setTaps] = useState(0);
  const progress = taps / required;
  const cracks = Math.min(8, Math.floor(progress * 8));

  const handleTap = () => {
    const next = taps + 1;
    setTaps(next);
    if (next >= required) setTimeout(onComplete, 400);
  };

  return (
    <div className="space-y-3 text-center">
      <p className="text-xs font-mono text-muted-foreground">Tap rapidly to crack the ice!</p>
      <div className="relative w-48 h-32 mx-auto rounded-lg bg-sky-200/60 border-2 border-sky-300 overflow-hidden cursor-pointer select-none active:scale-95 transition-transform"
        onClick={handleTap}>
        {/* Crack lines */}
        <svg className="absolute inset-0 w-full h-full">
          {cracks > 0 && <line x1="50%" y1="0" x2="30%" y2="100%" stroke="#0ea5e9" strokeWidth="2" />}
          {cracks > 1 && <line x1="50%" y1="0" x2="70%" y2="100%" stroke="#0ea5e9" strokeWidth="2" />}
          {cracks > 2 && <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#0ea5e9" strokeWidth="1.5" />}
          {cracks > 3 && <line x1="20%" y1="0" x2="50%" y2="60%" stroke="#0ea5e9" strokeWidth="1.5" />}
          {cracks > 4 && <line x1="80%" y1="0" x2="50%" y2="70%" stroke="#0ea5e9" strokeWidth="1" />}
          {cracks > 5 && <line x1="0" y1="30%" x2="60%" y2="80%" stroke="#0ea5e9" strokeWidth="1" />}
          {cracks > 6 && <line x1="40%" y1="20%" x2="90%" y2="90%" stroke="#0ea5e9" strokeWidth="1" />}
          {cracks > 7 && <line x1="10%" y1="70%" x2="80%" y2="20%" stroke="#0ea5e9" strokeWidth="1" />}
        </svg>
        {progress < 1 && <div className="absolute inset-0 flex items-center justify-center font-mono text-xl text-sky-800/70">❄️ TAP!</div>}
        {progress >= 1 && <div className="absolute inset-0 flex items-center justify-center font-mono text-xl text-green-600">💥 Shattered!</div>}
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-sky-400 transition-all rounded-full" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

/* ─── DNA SLIDER ─── */
function DnaTask({ task, onComplete }: { task: TaskChallenge; onComplete: () => void }) {
  const offset = task.dnaOffset || 3;
  const [shift, setShift] = useState(offset);
  const pattern = ['A', 'T', 'G', 'C', 'A', 'G', 'T', 'C'];

  useEffect(() => { if (shift === 0) setTimeout(onComplete, 500); }, [shift, onComplete]);

  return (
    <div className="space-y-3 text-center">
      <p className="text-xs font-mono text-muted-foreground">Slide to align the strands</p>
      {/* Top strand */}
      <div className="flex justify-center gap-0.5 font-mono text-sm">
        {pattern.map((c, i) => (
          <div key={i} className="w-8 h-8 rounded bg-purple-500/30 border border-purple-500/50 flex items-center justify-center text-foreground"
            style={{ transform: `translateX(${shift * 10}px)` }}>
            {c}
          </div>
        ))}
      </div>
      {/* Connectors */}
      <div className="flex justify-center gap-0.5">
        {pattern.map((_, i) => (
          <div key={i} className={`w-8 h-1 rounded ${shift === 0 ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />
        ))}
      </div>
      {/* Bottom strand */}
      <div className="flex justify-center gap-0.5 font-mono text-sm">
        {pattern.map((c, i) => {
          const comp: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G' };
          return (
            <div key={i} className="w-8 h-8 rounded bg-blue-500/30 border border-blue-500/50 flex items-center justify-center text-foreground">
              {comp[c]}
            </div>
          );
        })}
      </div>
      <input type="range" min={-offset} max={offset} value={shift}
        onChange={e => setShift(Number(e.target.value))}
        className="w-full accent-primary" />
      <p className="text-xs font-mono text-muted-foreground">{shift === 0 ? '✓ Aligned!' : 'Slide to match...'}</p>
    </div>
  );
}
