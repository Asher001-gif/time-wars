import { useEffect, useRef, useState } from 'react';
import DraggableExitButton from './DraggableExitButton';
import RotateDevicePrompt from './RotateDevicePrompt';
import { useIsMobileDevice, useIsPortrait } from '@/hooks/use-device';
import {
  Game, Input, XP_SKILL, XP_ULT, createCombat, driftClouds, isMuted, makeClouds, newInput,
  preloadCombat, renderCombat, setMuted, stepCombat, unlockAudio, DT,
} from '@/game/combat';

interface Props { onExit: () => void }

export default function CombatMastersGame({ onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(createCombat());
  const inputRef = useRef<Input>(newInput());
  const cloudsRef = useRef(makeClouds());
  const [ready, setReady] = useState(false);
  const [round, setRound] = useState(0);
  const [muted, setMutedState] = useState(isMuted());
  const [banner, setBanner] = useState(true);
  const [result, setResult] = useState<null | { won: boolean }>(null);
  const [xp, setXp] = useState(0);
  const isMobile = useIsMobileDevice();
  const isPortrait = useIsPortrait();

  useEffect(() => { preloadCombat().then(() => setReady(true)); }, []);
  useEffect(() => {
    unlockAudio();
    const go = () => unlockAudio();
    window.addEventListener('pointerdown', go); window.addEventListener('keydown', go);
    return () => { window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); };
  }, []);
  useEffect(() => { const t = setTimeout(() => setBanner(false), 6000); return () => clearTimeout(t); }, []);

  // keyboard: arrows (or A/D/W) to move + jump, 4 punch, 2 skill, 8 ultimate
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase(), i = inputRef.current;
      if (k === 'arrowleft' || k === 'a') i.left = true;
      else if (k === 'arrowright' || k === 'd') i.right = true;
      else if ((k === 'arrowup' || k === 'w') && !e.repeat) i.jump = 8;
      else if (k === '4' && !e.repeat) i.punch = 8;
      else if (k === '2' && !e.repeat) i.skill = 8;
      else if (k === '8' && !e.repeat) i.ult = 8;
      else if (k === 'm' && !e.repeat) { const m = !isMuted(); setMuted(m); setMutedState(m); }
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase(), i = inputRef.current;
      if (k === 'arrowleft' || k === 'a') i.left = false;
      else if (k === 'arrowright' || k === 'd') i.right = false;
    };
    const clear = () => { const i = inputRef.current; i.left = i.right = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);

  // fullscreen on first interaction, like the other games
  useEffect(() => {
    const go = async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
        if (isMobile) (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')?.catch?.(() => {});
      } catch { /* ignore */ }
    };
    go();
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
    return () => {
      window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [isMobile]);

  // game loop
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!;
    let raf = 0, last = performance.now(), acc = 0;
    let cw = window.innerWidth, ch = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      cw = window.innerWidth; ch = window.innerHeight;
      canvas.width = cw * dpr; canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    };
    resize(); window.addEventListener('resize', resize);
    const loop = (time: number) => {
      acc = Math.min(acc + (time - last), DT * 5); last = time;
      const g = gameRef.current;
      while (acc >= DT) { stepCombat(g, inputRef.current); driftClouds(cloudsRef.current); acc -= DT; }
      if (g.phase === 'over' && !g.reported) { g.reported = true; setResult({ won: g.winner === 0 }); }
      renderCombat(ctx, g, cw, ch, dpr, cloudsRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const poll = setInterval(() => setXp(gameRef.current.f[0].xp), 150);
    return () => { cancelAnimationFrame(raf); clearInterval(poll); window.removeEventListener('resize', resize); };
  }, [ready, round]);

  const rematch = () => {
    gameRef.current = createCombat();
    inputRef.current = newInput();
    setResult(null); setRound(r => r + 1);
  };
  const toggleMute = () => { const m = !isMuted(); setMuted(m); setMutedState(m); };

  const btn = (label: string, style: React.CSSProperties, onDown: () => void, onUp?: () => void) => (
    <button
      className="pointer-events-auto absolute rounded-full text-white font-mono font-bold border-[3px] border-white/70 select-none"
      style={{ width: 72, height: 72, fontSize: 14, touchAction: 'none', ...style }}
      onPointerDown={(e) => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); onDown(); }}
      onPointerUp={() => onUp?.()} onPointerCancel={() => onUp?.()}
    >{label}</button>
  );

  return (
    <div className="fixed inset-0 bg-black overflow-hidden" style={{ touchAction: 'none' }}>
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-white font-mono tracking-widest">LOADING…</div>}
      <canvas ref={canvasRef} className="block" />

      <button
        onClick={toggleMute}
        className="fixed left-2 top-14 z-[60] w-10 h-10 rounded-full bg-black/60 border-2 border-white/60 text-white text-lg select-none"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >{muted ? '🔇' : '🔊'}</button>

      {banner && ready && (
        <div className="fixed inset-x-0 bottom-[8%] z-[70] flex justify-center px-4 pointer-events-none select-none">
          <div className="px-5 py-3 rounded-2xl bg-black/75 border-2 border-blue-400 font-mono text-center text-white shadow-[0_0_24px_rgba(80,140,255,0.6)]">
            <div className="font-bold text-lg sm:text-2xl">COMBAT MASTERS</div>
            <div className="text-xs sm:text-base opacity-90 mt-1">
              {isMobile
                ? 'Move • Jump • 4 punch • 2 skill (half XP) • 8 ultimate (full XP)'
                : '← → move • ↑ jump • 4 punch • 2 skill (half XP) • 8 ultimate (full XP)'}
            </div>
          </div>
        </div>
      )}

      {isMobile && !result && ready && (
        <div className="fixed inset-0 pointer-events-none z-40">
          {btn('◀', { bottom: 36, left: 20 }, () => { inputRef.current.left = true; }, () => { inputRef.current.left = false; })}
          {btn('▶', { bottom: 36, left: 106 }, () => { inputRef.current.right = true; }, () => { inputRef.current.right = false; })}
          {btn('▲', { bottom: 122, left: 63, background: 'rgba(74,144,217,0.75)' }, () => { inputRef.current.jump = 8; })}
          {btn('4', { bottom: 36, right: 20, background: 'rgba(224,48,48,0.85)', fontSize: 24 }, () => { inputRef.current.punch = 8; })}
          {btn('2', { bottom: 36, right: 106, background: 'rgba(60,120,255,0.85)', fontSize: 24, opacity: xp >= XP_SKILL ? 1 : 0.45 }, () => { inputRef.current.skill = 8; })}
          {btn('8', { bottom: 122, right: 63, background: 'rgba(140,80,240,0.9)', fontSize: 24, opacity: xp >= XP_ULT - 0.01 ? 1 : 0.45 }, () => { inputRef.current.ult = 8; })}
        </div>
      )}

      {isMobile && isPortrait && <RotateDevicePrompt />}

      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="text-center space-y-5 p-8 rounded-xl border border-border bg-card shadow-2xl max-w-md">
            <h1 className="text-4xl font-bold font-mono tracking-wider" style={{ color: result.won ? '#3dba6f' : '#e03030' }}>
              {result.won ? '🏆 YOU WIN!' : 'YOU LOSE'}
            </h1>
            <div className="flex flex-col gap-3">
              <button onClick={rematch} className="px-8 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">REMATCH</button>
              <button onClick={onExit} className="px-8 py-3 rounded-lg font-mono font-bold text-base border border-white/30 text-white/80 hover:bg-white/10">BACK TO GAMES</button>
            </div>
          </div>
        </div>
      )}

      <DraggableExitButton onExit={onExit} />
    </div>
  );
}
