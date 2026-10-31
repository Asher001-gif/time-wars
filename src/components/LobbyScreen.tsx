import { toast } from 'sonner';

interface Props {
  onEnter: () => void;
}

// newest -> oldest
const RELEASES = [
  { date: '31 October 2026', text: 'Warehouse game! Happy Halloween 🎃' },
  { date: '20 October 2026', text: 'Volleyball game' },
  { date: '15 May 2026', text: 'Football game' },
  { date: '10 April 2026', text: 'First game' },
];

export default function LobbyScreen({ onEnter }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-background overflow-hidden">
      {/* Star field */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(60)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-primary/30"
            style={{
              width: 1 + Math.random() * 3,
              height: 1 + Math.random() * 3,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `pulse ${2 + Math.random() * 3}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      {/* Title */}
      <div className="relative text-center px-4">
        <h1
          className="text-5xl md:text-8xl font-bold font-mono tracking-widest text-orange-500"
          style={{ textShadow: '0 0 24px rgba(249,115,22,0.7), 0 0 48px rgba(249,115,22,0.4)' }}
        >
          TIME WARS
        </h1>
      </div>

      {/* Buttons */}
      <div className="relative mt-16 flex flex-col items-center gap-5 w-full max-w-sm px-6">
        <button
          onClick={onEnter}
          aria-label="Enter game"
          className="w-full py-4 rounded-2xl bg-blue-600/40 hover:bg-blue-500/60 text-white font-mono font-bold tracking-[0.4em] text-2xl border-2 border-blue-400 shadow-[0_0_24px_rgba(59,130,246,0.6)] transition-transform hover:scale-[1.03] active:scale-95"
        >
          ENTER
        </button>
        <button
          onClick={() => toast('Coming soon!')}
          aria-label="Add friends"
          className="w-full py-4 rounded-2xl bg-green-600/30 hover:bg-green-500/50 text-white font-mono font-bold tracking-[0.35em] text-xl border-2 border-green-400 shadow-[0_0_24px_rgba(34,197,94,0.55)] transition-transform hover:scale-[1.03] active:scale-95"
        >
          ADD FRIENDS
        </button>
        <div className="mt-2 w-full max-h-[28vh] overflow-y-auto space-y-2 pr-1">
          {RELEASES.map(r => (
            <div key={r.date} className="rounded-xl bg-[#2b2e38] border border-white/10 px-4 py-2.5 font-mono shadow-lg shadow-black/30">
              <div className="text-[11px] text-orange-400 tracking-wider">{r.date}</div>
              <div className="text-sm text-white font-semibold">{r.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
