import { useEffect, useRef, useState } from 'react';
import DraggableExitButton from './DraggableExitButton';
import RotateDevicePrompt from './RotateDevicePrompt';
import { useIsMobileDevice, useIsPortrait } from '@/hooks/use-device';
import asteronIcon from '@/assets/combat/profile.webp';
import redlaIcon from '@/assets/combat/redla_icon.webp';
import {
  CHAR_LABEL, Char, Game, Input, XP_SKILL, XP_ULT, createCombat, driftClouds, isMuted, makeClouds, newInput,
  preloadCombat, renderCombat, setMuted, stepCombat, stopMusic, unlockAudio, DT,
} from '@/game/combat';

interface Props { onExit: () => void }

export default function CombatMastersGame({ onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const inputRef = useRef<Input>(newInput());
  const cloudsRef = useRef(makeClouds());
  const [ready, setReady] = useState(false);
  const [round, setRound] = useState(0);
  const [muted, setMutedState] = useState(isMuted());
  const [banner, setBanner] = useState(true);
  const [result, setResult] = useState<null | { won: boolean; draw: boolean }>(null);
  const [xp, setXp] = useState(0);
  const [me, setMe] = useState<Char | null>(null);                       // step 1 pick
  const [match, setMatch] = useState<{ p: Char; o: Char } | null>(null);  // chosen fighters
  const isMobile = useIsMobileDevice();
  const isPortrait = useIsPortrait();

  useEffect(() => { preloadCombat().then(() => setReady(true)); return () => stopMusic(0.1); }, []);
  useEffect(() => {
    unlockAudio();
    const go = () => unlockAudio();
    window.addEventListener('pointerdown', go); window.addEventListener('keydown', go);
    return () => { window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); };
  }, []);
  useEffect(() => { if (!match) return; setBanner(true); const t = setTimeout(() => setBanner(false), 6000); return () => clearTimeout(t); }, [match]);

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
      else if (k === 'm' && !e.repeat) { const m = !isMuted(); setMuted(m); setMutedState(m); if (m) stopMusic(0.1); }
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
    if (!ready || !match) return;
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
      if (!g) { raf = requestAnimationFrame(loop); return; }
      while (acc >= DT) { stepCombat(g, inputRef.current); driftClouds(cloudsRef.current); acc -= DT; }
      if (g.phase === 'over' && !g.reported) { g.reported = true; setResult({ won: g.winner === 0, draw: g.winner < 0 }); }
      renderCombat(ctx, g, cw, ch, dpr, cloudsRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const poll = setInterval(() => setXp(gameRef.current?.f[0].xp ?? 0), 150);
    return () => { cancelAnimationFrame(raf); clearInterval(poll); window.removeEventListener('resize', resize); };
  }, [ready, round, match]);

  const choose = (c: Char | 'random') => {
    const pick: Char = c === 'random' ? (Math.random() < 0.5 ? 'asteron' : 'redla') : c;
    if (!me) { setMe(pick); return; }
    gameRef.current = createCombat(me, pick);
    inputRef.current = newInput();
    setResult(null); setRound(r => r + 1); setMatch({ p: me, o: pick });
  };
  const changeFighters = () => { gameRef.current = null; setResult(null); setMatch(null); setMe(null); };
  const rematch = () => {
    if (!match) return;
    gameRef.current = createCombat(match.p, match.o);
    inputRef.current = newInput();
    setResult(null); setRound(r => r + 1);
  };
  const toggleMute = () => { const m = !isMuted(); setMuted(m); setMutedState(m); if (m) stopMusic(0.1); };

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

      {match && banner && ready && (
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

      {isMobile && match && !result && ready && (
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

      {!match && (
        <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center gap-6 px-4 bg-gradient-to-b from-[#071735] via-[#14397a] to-[#0a1630] select-none">
          <div className="text-center font-mono text-white">
            <div className="text-2xl sm:text-4xl font-bold tracking-widest">COMBAT MASTERS</div>
            <div className="mt-2 text-sm sm:text-lg text-blue-200">
              {me ? `YOU: ${CHAR_LABEL[me]} — CHOOSE YOUR OPPONENT` : 'CHOOSE YOUR FIGHTER'}
            </div>
          </div>
          <div className="flex gap-3 sm:gap-8">
            {([['redla', 'REDLA', redlaIcon], ['asteron', 'ASTERON', asteronIcon], ['random', 'RANDOM', null]] as const).map(([id, label, icon]) => (
              <button
                key={id} onClick={() => choose(id)}
                className="group flex flex-col items-center gap-2 font-mono font-bold text-white"
              >
                <div className="w-24 h-24 sm:w-40 sm:h-40 rounded-xl overflow-hidden border-4 border-white/60 group-hover:border-yellow-300 group-active:scale-95 transition bg-black flex items-center justify-center shadow-[0_0_20px_rgba(80,140,255,0.45)]">
                  {icon ? <img src={icon} alt={label} className="w-full h-full object-cover" draggable={false} />
                    : <span className="text-5xl sm:text-7xl text-yellow-300">?</span>}
                </div>
                <span className="text-xs sm:text-base tracking-wider">{label}</span>
              </button>
            ))}
          </div>
          {me && <button onClick={() => setMe(null)} className="font-mono text-sm text-white/70 underline">← change my fighter</button>}
        </div>
      )}

      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="text-center space-y-5 p-8 rounded-xl border border-border bg-card shadow-2xl max-w-md">
            <h1 className="text-4xl font-bold font-mono tracking-wider" style={{ color: result.draw ? '#ffd23f' : result.won ? '#3dba6f' : '#e03030' }}>
              {result.draw ? 'DRAW!' : result.won ? '🏆 YOU WIN!' : 'YOU LOSE'}
            </h1>
            <div className="flex flex-col gap-3">
              <button onClick={rematch} className="px-8 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">REMATCH</button>
              <button onClick={changeFighters} className="px-8 py-3 rounded-lg font-mono font-bold text-base border border-white/30 text-white/80 hover:bg-white/10">CHANGE FIGHTERS</button>
              <button onClick={onExit} className="px-8 py-3 rounded-lg font-mono font-bold text-base border border-white/30 text-white/80 hover:bg-white/10">BACK TO GAMES</button>
            </div>
          </div>
        </div>
      )}

      <DraggableExitButton onExit={onExit} />
    </div>
  );
}
