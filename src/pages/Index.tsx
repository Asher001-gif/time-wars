import { useState, useCallback, useEffect } from 'react';
import { GameSettings, GameState, MARS_SETTINGS, footballSettings, MatchMinutes } from '@/game/types';
import { createGame, createFootballGame } from '@/game/engine';
import GameCanvas from '@/components/GameCanvas';
import LobbyScreen from '@/components/LobbyScreen';
import GameSelectScreen from '@/components/GameSelectScreen';
import FootballTimeScreen from '@/components/FootballTimeScreen';
import RoleBanner from '@/components/RoleBanner';
import GameOverScreen from '@/components/GameOverScreen';
import LoadingScreen from '@/components/LoadingScreen';
import TutorialScreen from '@/components/TutorialScreen';

export default function Index() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [screen, setScreen] = useState<'lobby' | 'games' | 'footballTime'>('lobby');
  const [showTutorial, setShowTutorial] = useState(false);
  const [username, setUsername] = useState<string>('Astro');
  const [draftName, setDraftName] = useState<string>('');
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem('mb_username'); } catch { /* sandboxed iframe */ }
    const name = stored && stored.trim() ? stored : 'Astro';
    setUsername(name);
    setDraftName(name);
  }, []);

  const handleSaveName = useCallback(() => {
    const name = draftName.trim() || 'Astro';
    try { localStorage.setItem('mb_username', name); } catch { /* sandboxed iframe */ }
    setUsername(name);
    setDraftName(name);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 1500);
  }, [draftName]);

  const handleStart = useCallback((settings: GameSettings) => {
    try {
      const game = settings.mapMode === 'football'
        ? createFootballGame(settings, username)
        : createGame(settings, username);
      setGameState(game);
    } catch (err) {
      console.error('createGame failed', err);
    }
  }, [username]);

  const handleRestart = useCallback(() => {
    setGameState(null);
    setScreen('games');
  }, []);

  if (loading) return <LoadingScreen />;
  if (!gameState && screen === 'games') {
    return (
      <GameSelectScreen
        onBack={() => setScreen('lobby')}
        onPlay={(g) => (g === 'mars' ? handleStart(MARS_SETTINGS) : setScreen('footballTime'))}
      />
    );
  }
  if (!gameState && screen === 'footballTime') {
    return (
      <FootballTimeScreen
        onBack={() => setScreen('games')}
        onPick={(m: MatchMinutes) => handleStart(footballSettings(m))}
      />
    );
  }
  if (!gameState) {
    if (showTutorial) return <TutorialScreen onBack={() => setShowTutorial(false)} />;
    return (
      <>
        <div className="fixed top-4 right-4 z-[60] flex items-center gap-2 p-2 rounded-xl bg-blue-950/40 border-2 border-blue-400 backdrop-blur-sm max-w-[280px] shadow-[0_0_18px_rgba(59,130,246,0.5)]">
          {!editing ? (
            <>
              <span className="font-mono text-xs text-white px-1">
                Welcome, {username}!{saved && <span className="text-white/80 ml-1">✓</span>}
              </span>
              <button
                onClick={() => { setDraftName(username); setEditing(true); }}
                aria-label="Edit username"
                title="Edit name"
                className="w-6 h-6 flex items-center justify-center rounded border border-white/60 text-white text-xs hover:bg-white/20"
              >
                ✎
              </button>
            </>
          ) : (
            <>
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                placeholder="Enter username"
                maxLength={20}
                className="flex-1 min-w-0 px-2 py-1 rounded bg-white text-blue-900 placeholder:text-blue-400 border border-blue-300 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-white"
              />
              <button
                onClick={handleSaveName}
                className="px-3 py-1 rounded bg-white text-blue-700 font-mono text-xs font-bold hover:bg-blue-50"
              >
                Save
              </button>
            </>
          )}
        </div>
        <LobbyScreen
          onEnter={() => setScreen('games')}
          onTutorial={() => setShowTutorial(true)}
        />
      </>
    );
  }

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <RoleBanner state={gameState} />
      <GameCanvas gameState={gameState} setGameState={setGameState} onExit={handleRestart} />
      {gameState.phase === 'gameover' && (
        <GameOverScreen state={gameState} onRestart={handleRestart} />
      )}
    </div>
  );
}
