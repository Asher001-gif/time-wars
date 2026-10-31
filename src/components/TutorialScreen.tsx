interface Props {
  onBack: () => void;
}

// newest -> oldest
const RELEASES = [
  { date: '31 October 2026', text: 'Warehouse game! Happy Halloween 🎃' },
  { date: '20 October 2026', text: 'Volleyball game' },
  { date: '15 May 2026', text: 'Football game' },
  { date: '10 April 2026', text: 'First game' },
];

export default function TutorialScreen({ onBack }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="relative max-w-lg w-full mx-4 p-6 rounded-xl border border-border bg-card shadow-2xl space-y-4">
        <h2 className="text-2xl font-bold font-mono tracking-wider text-primary text-center">
          UPDATES
        </h2>

        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
          {RELEASES.map(r => (
            <div key={r.date} className="rounded-xl bg-[#2b2e38] border border-white/10 px-4 py-3 font-mono shadow-lg shadow-black/30">
              <div className="text-[11px] text-orange-400 tracking-wider">{r.date}</div>
              <div className="text-sm text-white font-semibold">{r.text}</div>
            </div>
          ))}
        </div>

        <button
          onClick={onBack}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-mono font-bold hover:opacity-90 transition-opacity"
        >
          BACK
        </button>
      </div>
    </div>
  );
}
