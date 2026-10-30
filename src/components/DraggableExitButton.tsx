import { useEffect, useRef, useState, useCallback } from 'react';

interface Props {
  onExit: () => void;
}

const DRAG_THRESHOLD = 6; // px before a press becomes a drag
const STORAGE_KEY = 'timewars.exitBtnPos';

const STEPS = [
  { icon: '💔', title: 'Is it over for us and you??', sub: 'After everything we have been through.', yes: 'Yes', no: 'No' },
  { icon: '🔥', title: 'Never give up dude!', sub: 'Legends do not rage quit. You sure about this?', yes: 'Yes, I quit', no: 'No, I am back' },
  { icon: '👑', title: 'Fine. But this game was lucky to have you.', sub: 'Without you, nobody is the main character.', yes: 'Exit anyway', no: 'Stay, champ' },
];

export default function DraggableExitButton({ onExit }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<number | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 12, y: 12 };
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: 12, y: 12 };
  });

  const dragState = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  }>({ pointerId: null, startX: 0, startY: 0, origX: 0, origY: 0, moved: false });

  const clamp = useCallback((x: number, y: number) => {
    const el = btnRef.current;
    const w = el?.offsetWidth ?? 80;
    const h = el?.offsetHeight ?? 32;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
  }, []);

  useEffect(() => {
    const onResize = () => setPos(p => clamp(p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    btnRef.current?.setPointerCapture(e.pointerId);
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragState.current;
    if (ds.pointerId !== e.pointerId) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    ds.moved = true;
    const next = clamp(ds.origX + dx, ds.origY + dy);
    setPos(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragState.current;
    if (ds.pointerId !== e.pointerId) return;
    btnRef.current?.releasePointerCapture(e.pointerId);
    const wasDrag = ds.moved;
    dragState.current.pointerId = null;
    if (wasDrag) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {}
    } else {
      // Treat as tap → ask for confirmation first
      setStep(0);
    }
  };

  const confirmExit = () => {
    setStep(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onExit();
  };

  const onYes = () => {
    if (step === null) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else confirmExit();
  };

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStep(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const cur = step !== null ? STEPS[step] : null;

  return (
    <>
    <button
      ref={btnRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="fixed z-[90] px-3 py-1.5 rounded-md bg-background/80 border border-border text-foreground font-mono text-sm hover:bg-background select-none"
      style={{
        left: pos.x,
        top: pos.y,
        backdropFilter: 'blur(4px)',
        touchAction: 'none',
        cursor: dragState.current.pointerId !== null ? 'grabbing' : 'grab',
      }}
      aria-label="Exit (tap) or drag to move"
    >
      ⬅ Exit
    </button>
    {cur && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
        onPointerDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={cur.title}
      >
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-2xl space-y-4">
          <div className="text-4xl">{cur.icon}</div>
          <div>
            <p className="font-mono font-bold text-lg">{cur.title}</p>
            <p className="font-mono text-sm text-muted-foreground mt-1">{cur.sub}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onYes}
              className="flex-1 px-4 py-2 rounded-lg border border-border font-mono text-sm hover:bg-muted"
            >
              {cur.yes}
            </button>
            <button
              autoFocus
              onClick={() => setStep(null)}
              className="flex-1 px-4 py-2 rounded-lg font-mono text-sm font-bold bg-primary text-primary-foreground hover:opacity-90"
            >
              {cur.no}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}