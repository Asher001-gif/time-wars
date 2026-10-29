import { GameState, Player } from './types';

/** Living players the dead human can watch: remaining teammates first, otherwise anyone alive. */
export function spectateCandidates(state: GameState): Player[] {
  const me = state.players[0];
  const alive = state.players.filter(p => p.id !== 0 && p.alive);
  const mates = alive.filter(p => p.team === me.team);
  return mates.length > 0 ? mates : alive;
}

/** Who the camera follows: the human while alive, otherwise a surviving teammate. */
export function getViewTarget(state: GameState): Player {
  const me = state.players[0];
  if (me.alive) return me;
  const list = spectateCandidates(state);
  if (list.length === 0) return me;
  const current = list.find(p => p.id === state.spectateId);
  if (current) return current;
  state.spectateId = list[0].id;
  return list[0];
}

/** Switch spectated player (dir = 1 next, -1 previous). */
export function cycleSpectate(state: GameState, dir: 1 | -1) {
  if (state.players[0].alive) return;
  const list = spectateCandidates(state);
  if (list.length === 0) return;
  const idx = list.findIndex(p => p.id === state.spectateId);
  const next = list[(idx + dir + list.length) % list.length];
  state.spectateId = next.id;
}
