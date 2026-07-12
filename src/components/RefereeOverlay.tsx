import refereeImg from '@/assets/referee.png';

interface Props {
  message: string;
}

export default function RefereeOverlay({ message }: Props) {
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none select-none"
      style={{ animation: 'refFade 200ms ease-out both' }}
    >
      <style>{`
        @keyframes refFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes refZoom {
          from { transform: scale(1.0); }
          to   { transform: scale(1.12); }
        }
        @keyframes refPulse {
          0%, 100% { transform: scale(1); text-shadow: 0 0 20px rgba(250,204,21,.9); }
          50%      { transform: scale(1.04); text-shadow: 0 0 32px rgba(250,204,21,1); }
        }
      `}</style>
      <img
        src={refereeImg}
        alt="Referee"
        className="max-w-[90vw] max-h-[70vh] object-contain drop-shadow-[0_0_40px_rgba(250,204,21,0.6)]"
        style={{ animation: 'refZoom 2000ms ease-out both' }}
      />
      <div
        className="mt-6 px-8 py-4 rounded-lg bg-yellow-400 text-black font-black tracking-wider text-3xl md:text-5xl border-4 border-black shadow-2xl"
        style={{ animation: 'refPulse 700ms ease-in-out infinite', fontFamily: 'Impact, "Arial Black", sans-serif' }}
      >
        {message}
      </div>
    </div>
  );
}
