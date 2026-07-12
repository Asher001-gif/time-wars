export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(40)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-primary/20"
            style={{
              width: 2 + Math.random() * 3,
              height: 2 + Math.random() * 3,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `pulse ${2 + Math.random() * 3}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
      <div className="relative flex flex-col items-center gap-6">
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-4 h-4 rounded-full bg-primary"
              style={{
                animation: 'pulse 1s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
        <p className="text-primary font-mono text-2xl tracking-widest animate-pulse">
          Searching for Players...
        </p>
      </div>
    </div>
  );
}