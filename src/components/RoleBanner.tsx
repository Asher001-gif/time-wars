import { useEffect, useState } from 'react';
import { GameState } from '@/game/types';

function describe(state: GameState): { text: string; color: string } {
  const me = state.players[0];
  if (state.mode === 'football') {
    const red = me.footballTeam === 'red';
    return {
      text: `You are ${red ? 'RED' : 'BLUE'} TEAM. Score more goals than the ${red ? 'blue' : 'red'} team to win.`,
      color: red ? '#e03030' : '#4a90d9',
    };
  }
  if (me.ability === 'kill' || me.ability === 'shooter') {
    return { text: 'You are a TRAITOR. Eliminate every enemy to win.', color: '#e03030' };
  }
  if (me.ability === 'jail') {
    return { text: 'You are a PROTECTOR. Arrest the traitors to win.', color: '#3dba6f' };
  }
  return { text: 'You are a CREW. Complete all tasks to win.', color: '#4a90d9' };
}

export default function RoleBanner({ state }: { state: GameState }) {
  const [visible, setVisible] = useState(true);
  const [info] = useState(() => describe(state));
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 top-[18%] z-[70] flex justify-center px-4 pointer-events-none select-none">
      <div
        className="px-6 py-4 rounded-2xl bg-black/80 border-2 font-mono font-bold text-center text-lg sm:text-3xl text-white"
        style={{ borderColor: info.color, boxShadow: `0 0 30px ${info.color}` }}
      >
        {info.text}
      </div>
    </div>
  );
}
