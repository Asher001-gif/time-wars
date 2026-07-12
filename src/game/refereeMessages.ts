// Referee cutscene messages — edit this list freely.
// Selected at random when the referee event triggers in football mode.
export const REFEREE_MESSAGES: string[] = [
  '🟨 PLAY FOOTBALL.',
  '🟨 STOP CAMPING.',
  '🟨 UNSPORTSMANLIKE BEHAVIOR.',
  '🟨 CORNER ABUSE DETECTED.',
  '🟨 THE REFEREE IS DISAPPOINTED.',
  '🟨 GET BACK ON THE PITCH!',
  '🟨 YELLOW CARD — DELAY OF GAME.',
  '🟨 THIS IS NOT HIDE-AND-SEEK.',
];

export function pickRefereeMessage(): string {
  return REFEREE_MESSAGES[Math.floor(Math.random() * REFEREE_MESSAGES.length)];
}
