import { GAME_LIST, GameId } from '@/game/gameList';

interface Props {
  onBack: () => void;
  onPlay: (game: GameId) => void;
}

export default function GameSelectScreen({ onBack, onPlay }: Props) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#1f2128] font-mono">
      <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded border border-white/30 text-white/80 text-sm hover:bg-white/10"
          >
            ← Back
          </button>
          <h1 className="text-lg sm:text-2xl font-bold tracking-widest text-orange-500">GAMES</h1>
          <div className="w-16" />
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
          {GAME_LIST.map(g => (
            <button
              key={g.id}
              onClick={() => onPlay(g.id)}
              aria-label={`Play ${g.name}`}
              className="flex flex-col gap-1.5 p-1.5 sm:p-2 rounded-2xl bg-[#2b2e38] hover:bg-[#363a47] shadow-lg shadow-black/30 hover:scale-[1.03] active:scale-95 transition text-left"
            >
              <img
                src={g.icon}
                alt={g.name}
                width={512}
                height={512}
                loading="eager"
                decoding="async"
                draggable={false}
                className="w-full aspect-square object-cover rounded-xl select-none"
              />
              <span className="px-1.5 pb-1 text-white text-[11px] sm:text-sm font-semibold truncate">
                {g.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
