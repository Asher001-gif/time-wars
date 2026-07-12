export default function RotateDevicePrompt() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background text-center p-8">
      <div className="text-6xl mb-6 animate-pulse">📱↻</div>
      <h2 className="text-2xl font-mono font-bold text-primary mb-3">
        Rotate Your Device
      </h2>
      <p className="text-muted-foreground font-mono text-sm max-w-xs">
        This game runs only in landscape mode on mobile. Please rotate your phone sideways to play.
      </p>
    </div>
  );
}
