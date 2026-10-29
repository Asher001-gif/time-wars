import marsIcon from '@/assets/icon-mars-mission.webp';
import footballIcon from '@/assets/icon-football.webp';

interface Props {
  onBack: () => void;
  onPlay: (game: 'mars' | 'football') => void;
}

const GAMES = [
  { id: 'mars' as const, name: 'Mars Mission', icon: marsIcon, glow: 'rgba(59,130,246,0.7)', border: 'border-blue-400' },
  { id: 'football' as const, name: 'Football', icon: footballIcon, glow: 'rgba(34,197,94,0.65)', border: 'border-green-400' },
];

export default function GameSelectScreen({ onBack, onPlay }: Props) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-background font-mono">
      <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
        <div className="w-full max-w-3xl flex items-center justify-between">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded border border-white/30 text-white/80 text-sm hover:bg-white/10"
          >
            ← Back
          </button>
          <h1 className="text-xl sm:text-3xl font-bold tracking-widest text-orange-500">GAMES</h1>
          <div className="w-16" />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-8 w-full max-w-3xl">
          {GAMES.map(g => (
            <button
              key={g.id}
              onClick={() => onPlay(g.id)}
              aria-label={`Play ${g.name}`}
              className={`group flex flex-col items-center gap-3 p-3 sm:p-4 rounded-3xl border-2 ${g.border} bg-white/5 transition-transform hover:scale-[1.04] active:scale-95`}
              style={{ boxShadow: `0 0 26px ${g.glow}` }}
            >
              <img
                src={g.icon}
                alt={g.name}
                width={512}
                height={512}
                loading="eager"
                decoding="async"
                draggable={false}
                className="w-full aspect-square object-cover rounded-2xl select-none"
              />
              <span className="text-white font-bold tracking-widest text-base sm:text-2xl">{g.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
