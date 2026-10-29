import { MATCH_MINUTE_OPTIONS, MatchMinutes } from '@/game/types';

interface Props {
  onBack: () => void;
  onPick: (minutes: MatchMinutes) => void;
}

export default function FootballTimeScreen({ onBack, onPick }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-background font-mono p-6">
      <button
        onClick={onBack}
        className="absolute top-4 left-4 px-3 py-1.5 rounded border border-white/30 text-white/80 text-sm hover:bg-white/10"
      >
        ← Back
      </button>
      <h1 className="text-2xl sm:text-4xl font-bold tracking-widest text-green-400 text-center">MATCH TIME</h1>
      <div className="grid grid-cols-3 gap-3 sm:gap-6 w-full max-w-xl">
        {MATCH_MINUTE_OPTIONS.map(m => (
          <button
            key={m}
            onClick={() => onPick(m)}
            className="py-8 rounded-2xl border-2 border-green-400 bg-green-600/25 hover:bg-green-500/45 text-white font-bold text-2xl sm:text-4xl shadow-[0_0_22px_rgba(34,197,94,0.5)] transition-transform hover:scale-105 active:scale-95"
          >
            {m}
            <div className="text-xs sm:text-sm tracking-widest opacity-80">MIN</div>
          </button>
        ))}
      </div>
    </div>
  );
}
