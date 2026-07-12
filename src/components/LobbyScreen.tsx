import { toast } from 'sonner';

interface Props {
  onEnter: () => void;
  onTutorial: () => void;
}

export default function LobbyScreen({ onEnter, onTutorial }: Props) {
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

      {/* Top-left ? tutorial button */}
      <button
        onClick={onTutorial}
        aria-label="Tutorial"
        title="Tutorial"
        className="absolute top-4 left-4 z-10 w-14 h-14 rounded-xl border-2 border-blue-400 text-blue-300 font-mono font-bold text-2xl bg-blue-950/30 hover:bg-blue-900/50 transition-colors shadow-[0_0_18px_rgba(59,130,246,0.5)]"
      >
        ?
      </button>

      {/* Title */}
      <div className="relative text-center px-4">
        <h1
          className="text-6xl md:text-8xl font-bold font-mono tracking-widest text-orange-500"
          style={{ textShadow: '0 0 24px rgba(249,115,22,0.7), 0 0 48px rgba(249,115,22,0.4)' }}
        >
          ASTERON
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
        <a
          href="https://forms.gle/CLdBLKCmYo3h9EQX7"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
        >
          Send a suggestion
        </a>
      </div>
    </div>
  );
}
