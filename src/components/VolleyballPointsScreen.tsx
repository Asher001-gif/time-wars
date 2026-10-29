interface Props {
  onBack: () => void;
  onPick: (points: number) => void;
}

const OPTIONS = [5, 10, 15];

export default function VolleyballPointsScreen({ onBack, onPick }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-background font-mono p-6">
      <button
        onClick={onBack}
        className="absolute top-4 left-4 px-3 py-1.5 rounded border border-white/30 text-white/80 text-sm hover:bg-white/10"
      >
        ← Back
      </button>
      <h1 className="text-2xl sm:text-4xl font-bold tracking-widest text-sky-400 text-center">FIRST TO</h1>
      <div className="grid grid-cols-3 gap-3 sm:gap-6 w-full max-w-xl">
        {OPTIONS.map(n => (
          <button
            key={n}
            onClick={() => onPick(n)}
            className="py-8 rounded-2xl border-2 border-sky-400 bg-sky-600/25 hover:bg-sky-500/45 text-white font-bold text-2xl sm:text-4xl shadow-[0_0_22px_rgba(56,189,248,0.5)] transition-transform hover:scale-105 active:scale-95"
          >
            {n}
            <div className="text-xs sm:text-sm tracking-widest opacity-80">POINTS</div>
          </button>
        ))}
      </div>
    </div>
  );
}
