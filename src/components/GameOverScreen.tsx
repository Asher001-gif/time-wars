import { GameState, TEAM_COLORS, TEAM_NAMES, TeamIndex } from '@/game/types';

interface Props {
  state: GameState;
  onRestart: () => void;
}

export default function GameOverScreen({ state, onRestart }: Props) {
  // Football mode result
  if (state.mode === 'football') {
    const score = state.score || { red: 0, blue: 0 };
    const winner = score.red > score.blue ? 'RED' : score.red < score.blue ? 'BLUE' : 'DRAW';
    const color = winner === 'RED' ? '#e03030' : winner === 'BLUE' ? '#4a90d9' : '#888';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
        <div className="text-center space-y-6 p-8 rounded-xl border border-border bg-card shadow-2xl max-w-md">
          <h1 className="text-4xl font-bold font-mono tracking-wider" style={{ color }}>
            {winner === 'DRAW' ? '🤝 IT\'S A DRAW!' : `🏆 ${winner} TEAM WINS!`}
          </h1>
          <p className="text-2xl font-mono font-bold">
            <span style={{ color: '#e03030' }}>RED {score.red}</span>
            <span className="text-white mx-3">—</span>
            <span style={{ color: '#4a90d9' }}>{score.blue} BLUE</span>
          </p>
          <div className="text-sm text-muted-foreground font-mono">
            Time: {Math.floor(state.timeElapsed / 1000)}s · Rounds: {state.totalRounds}
          </div>
          <button
            onClick={onRestart}
            className="px-8 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            PLAY AGAIN
          </button>
        </div>
      </div>
    );
  }

  const winner = state.winner as TeamIndex | null;
  const team = winner ?? 0;
  const color = winner !== null ? TEAM_COLORS[team] : '#888';
  const teamName = winner !== null ? TEAM_NAMES[team] : '—';
  const ability = winner !== null ? state.teamAbilities[team] : '';
  const objectiveText: Record<string, string> = {
    crew: 'Completed all assigned tasks!',
    kill: 'Eliminated every enemy player!',
    shooter: 'Shot down every enemy player!',
    jail: 'All enemies are jailed or down!',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="text-center space-y-6 p-8 rounded-xl border border-border bg-card shadow-2xl max-w-md">
        <h1 className="text-4xl font-bold font-mono tracking-wider" style={{ color }}>
          🏆 {teamName} TEAM WINS!
        </h1>
        <p className="text-muted-foreground font-mono uppercase text-xs tracking-widest">
          Ability: {ability}
        </p>
        <p className="text-muted-foreground font-mono">
          {objectiveText[ability] || 'Objective achieved.'}
        </p>
        <div className="text-sm text-muted-foreground font-mono">
          Time: {Math.floor(state.timeElapsed / 1000)}s |
          Survivors: {state.players.filter(p => p.alive).length}/{state.players.length}
        </div>
        <button
          onClick={onRestart}
          className="px-8 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          PLAY AGAIN
        </button>
      </div>
    </div>
  );
}
