import { useMemo, useState, useEffect } from 'react';
import { Ability, GameSettings, DEFAULT_SETTINGS, JailTimerOption, SpeedOption, FOOTBALL_SPEED_OPTIONS, FOOTBALL_SPEED_LABELS, ROUND_TIME_OPTIONS, ROUND_TIME_LABELS } from '@/game/types';

interface Props {
  initial?: GameSettings;
  onBack: () => void;
  onStart: (settings: GameSettings) => void;
}

const ABILITIES: { id: Ability; label: string; desc: string }[] = [
  { id: 'crew', label: 'Crew', desc: 'Do tasks & explore' },
  { id: 'kill', label: 'Kill', desc: 'Eliminate others in melee' },
  { id: 'shooter', label: 'Shooter', desc: 'Ranged kills (reload required)' },
  { id: 'jail', label: 'Jail', desc: 'Arrest suspects to jail' },
];

const ROLE_LABELS = ['Role 1 (Blue)', 'Role 2 (Red)', 'Role 3 (Green)'];
const ROLE_COLORS = ['#4a90d9', '#e03030', '#3dba6f'];

const JAIL_OPTIONS: JailTimerOption[] = ['off', 10, 20, 'infinity'];
const SPEED_OPTIONS: SpeedOption[] = ['slow', 'medium', 'fast'];

export default function SettingsScreen({ initial, onBack, onStart }: Props) {
  const [settings, setSettings] = useState<GameSettings>(initial ?? DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      localStorage.setItem('asteron_settings', JSON.stringify(settings));
    } catch {
      /* sandboxed iframe (e.g. itch.io) — storage unavailable, ignore */
    }
  }, [settings]);

  const sumCounts = settings.roleCounts.reduce((a, b) => a + b, 0);
  const isFootball = settings.mapMode === 'football';
  const valid = isFootball || (sumCounts === settings.playerCount && settings.playerCount >= 2);

  const update = (patch: Partial<GameSettings>) => setSettings(s => ({ ...s, ...patch }));

  const setCount = (idx: 0 | 1 | 2, val: number) => {
    const next = [...settings.roleCounts] as [number, number, number];
    next[idx] = Math.max(0, Math.min(settings.playerCount, val));
    update({ roleCounts: next });
  };

  const setAbility = (idx: 0 | 1 | 2, ability: Ability) => {
    const next = [...settings.roleAbilities] as [Ability, Ability, Ability];
    next[idx] = ability;
    update({ roleAbilities: next });
  };

  const autoBalance = () => {
    // Distribute playerCount across the 3 role slots; give remainder to Role 1
    const base = Math.floor(settings.playerCount / 3);
    const rem = settings.playerCount - base * 3;
    update({ roleCounts: [base + rem, base, base] });
  };

  const speedWarning = settings.speed === 'fast';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 font-mono">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded border border-white/30 text-white/80 text-sm hover:bg-white/10"
          >
            ← Back
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-primary tracking-widest">GAME SETTINGS</h1>
          <div className="w-16" />
        </div>

        {/* --- Map Mode --- */}
        <section className="rounded-xl border border-primary/30 bg-card/60 p-4 space-y-3">
          <h2 className="text-primary font-bold text-sm tracking-widest">MAP</h2>
          <div className="grid grid-cols-2 gap-2">
            {(['mars', 'football'] as const).map(m => (
              <button
                key={m}
                onClick={() => update({ mapMode: m })}
                className={`px-3 py-3 rounded text-sm border capitalize ${
                  (settings.mapMode ?? 'mars') === m
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-white/20 text-foreground hover:bg-white/5'
                }`}
              >
                {m === 'mars' ? '🪐 Mars (Default)' : '⚽ Football Stadium'}
              </button>
            ))}
          </div>
          {settings.mapMode === 'football' && (
            <div className="space-y-1 pt-2">
              <div className="text-sm text-foreground">Match Rounds</div>
              <div className="grid grid-cols-3 gap-2">
                {([3, 5, 10] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => update({ matchRounds: r })}
                    className={`px-2 py-2 rounded text-xs border ${
                      (settings.matchRounds ?? 5) === r
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-white/20 text-foreground hover:bg-white/5'
                    }`}
                  >{r} rounds</button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Football: 12 players (6 Red + 6 Blue). All roles, tasks, kills, and jail are disabled.
              </p>
            </div>
          )}
        </section>

        {/* --- Football-only settings --- */}
        {isFootball && (
          <section className="rounded-xl border border-primary/30 bg-card/60 p-4 space-y-4">
            <h2 className="text-primary font-bold text-sm tracking-widest">FOOTBALL RULES</h2>

            {/* Football Speed (5 options) */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-foreground">Game Speed</span>
                <span className="text-primary font-bold">
                  {FOOTBALL_SPEED_LABELS[settings.footballSpeed ?? 'medium']}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {FOOTBALL_SPEED_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => update({ footballSpeed: opt })}
                    className={`px-1 py-2 rounded text-[10px] sm:text-xs border leading-tight ${
                      (settings.footballSpeed ?? 'medium') === opt
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-white/20 text-foreground hover:bg-white/5'
                    }`}
                  >
                    {FOOTBALL_SPEED_LABELS[opt]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Affects players, bots, and ball pacing. Medium = recommended.
                {(settings.footballSpeed === 'high' || settings.footballSpeed === 'extreme') && (
                  <span className="block text-yellow-400">
                    ⚠ High/Extreme can be very chaotic and impact weaker devices.
                  </span>
                )}
              </p>
            </div>

            {/* Round Timer */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-foreground">Round Timer</span>
                <span className="text-primary font-bold">
                  {ROUND_TIME_LABELS[settings.roundTime ?? 120]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ROUND_TIME_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => update({ roundTime: opt })}
                    className={`px-2 py-2 rounded text-xs border ${
                      (settings.roundTime ?? 120) === opt
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-white/20 text-foreground hover:bg-white/5'
                    }`}
                  >
                    {ROUND_TIME_LABELS[opt]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                If no goal happens before the timer runs out, the round is a tie (no points) and the next round starts. If both teams finish the match with equal points, the match is a tie.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Football Stadium uses fixed teams (6 Red + 6 Blue). Roles, tasks, jail, and kills are disabled.
            </p>
          </section>
        )}


        {/* --- Mars-only: Main Rules --- */}
        {!isFootball && (
        <section className="rounded-xl border border-primary/30 bg-card/60 p-4 space-y-4">
          <h2 className="text-primary font-bold text-sm tracking-widest">MAIN RULES</h2>

          {/* Tasks */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-foreground">Tasks</span>
              <span className="text-primary font-bold">{settings.tasks}</span>
            </div>
            <input
              type="range" min={0} max={15} step={1}
              value={settings.tasks}
              onChange={(e) => update({ tasks: Number(e.target.value) })}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0</span><span>default 10</span><span>15</span>
            </div>
          </div>

          {/* Jail Timer */}
          <div className="space-y-1">
            <div className="text-sm text-foreground">Jail Timer</div>
            <div className="grid grid-cols-4 gap-2">
              {JAIL_OPTIONS.map(opt => (
                <button
                  key={String(opt)}
                  onClick={() => update({ jailTimer: opt })}
                  className={`px-2 py-2 rounded text-xs border ${
                    settings.jailTimer === opt
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-white/20 text-foreground hover:bg-white/5'
                  }`}
                >
                  {opt === 'off' ? 'OFF' : opt === 'infinity' ? '∞' : `${opt}s`}
                </button>
              ))}
            </div>
          </div>

          {/* Player Count */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-foreground">Players (incl. you & bots)</span>
              <span className="text-primary font-bold">{settings.playerCount}</span>
            </div>
            <input
              type="range" min={2} max={12} step={1}
              value={settings.playerCount}
              onChange={(e) => {
                const pc = Number(e.target.value);
                const counts = settings.roleCounts.map(c => Math.min(c, pc)) as [number, number, number];
                update({ playerCount: pc, roleCounts: counts });
              }}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>2</span><span>default 10</span><span>12</span>
            </div>
          </div>

          {/* Speed */}
          <div className="space-y-1">
            <div className="text-sm text-foreground">Speed</div>
            <div className="grid grid-cols-3 gap-2">
              {SPEED_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => update({ speed: opt })}
                  className={`px-2 py-2 rounded text-xs border capitalize ${
                    settings.speed === opt
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-white/20 text-foreground hover:bg-white/5'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            {speedWarning && (
              <p className="text-[11px] text-yellow-400 mt-1">
                ⚠ Faster speed can affect performance on weaker devices — ignore if your device is good, Buddy!
              </p>
            )}
          </div>
        </section>
        )}

        {/* --- Mars-only: Roles --- */}
        {!isFootball && (
        <section className="rounded-xl border border-primary/30 bg-card/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-primary font-bold text-sm tracking-widest">ROLES</h2>
            <button
              onClick={autoBalance}
              className="text-[11px] px-2 py-1 rounded border border-white/30 text-white/80 hover:bg-white/10"
            >
              Auto-balance
            </button>
          </div>

          {[0, 1, 2].map(i => {
            const idx = i as 0 | 1 | 2;
            return (
              <div key={i} className="rounded-lg border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: ROLE_COLORS[i] }}>
                    {ROLE_LABELS[i]}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCount(idx, settings.roleCounts[i] - 1)}
                      className="w-7 h-7 rounded border border-white/30 text-white"
                    >-</button>
                    <span className="w-8 text-center text-foreground font-bold">{settings.roleCounts[i]}</span>
                    <button
                      onClick={() => setCount(idx, settings.roleCounts[i] + 1)}
                      className="w-7 h-7 rounded border border-white/30 text-white"
                    >+</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ABILITIES.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setAbility(idx, a.id)}
                      className={`px-2 py-1.5 rounded text-[11px] border text-left ${
                        settings.roleAbilities[i] === a.id
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'border-white/15 text-foreground hover:bg-white/5'
                      }`}
                    >
                      <div className="font-bold">{a.label}</div>
                      <div className="text-[9px] opacity-70 leading-tight">{a.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          <div className={`text-xs ${valid ? 'text-emerald-400' : 'text-red-400'}`}>
            Total: {sumCounts} / {settings.playerCount}
            {!valid && ' — counts must equal player count'}
          </div>
        </section>
        )}


        <button
          disabled={!valid}
          onClick={() => onStart(settings)}
          className={`w-full py-4 rounded-xl font-mono font-bold tracking-widest text-lg transition ${
            valid
              ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/40'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          START GAME
        </button>
      </div>
    </div>
  );
}