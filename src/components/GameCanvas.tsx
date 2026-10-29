import { useRef, useEffect, useCallback, useState } from 'react';
import { GameState, ARREST_RANGE, DOOR_USE_COOLDOWN } from '@/game/types';
import { updateGame, humanKill, humanArrest, getNearbyTask, getNearbyDoor, toggleDoor, rangeForAbility, placeBuilderBlock } from '@/game/engine';
import { generateTaskChallenge } from '@/game/tasks';
import { renderGame } from '@/game/renderer';
import TaskOverlay from './TaskOverlay';
import MobileControls from './MobileControls';
import { useIsMobileDevice, useIsPortrait } from '@/hooks/use-device';
import RotateDevicePrompt from './RotateDevicePrompt';
import DraggableExitButton from './DraggableExitButton';
import RefereeOverlay from './RefereeOverlay';

interface Props {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  onExit?: () => void;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export default function GameCanvas({ gameState, setGameState, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const stateRef = useRef(gameState);
  const animRef = useRef(0);
  const mobileDir = useRef({ x: 0, y: 0 });
  const lastArrestEventRef = useRef(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [showTask, setShowTask] = useState(false);
  const isMobile = useIsMobileDevice();
  const isPortrait = useIsPortrait();
  const needsRotate = isMobile && isPortrait;

  stateRef.current = gameState;

  useEffect(() => {
    const resize = () => {
      setSize({ w: window.innerWidth, h: window.innerHeight });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // On mobile, request fullscreen on the first user interaction (browsers
  // require a user gesture). Also try to lock orientation to landscape.
  useEffect(() => {
    if (!isMobile) return;
    const goFullscreen = async () => {
      try {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) {
          await el.requestFullscreen();
        }
        const orient = (screen as any).orientation;
        if (orient && typeof orient.lock === 'function') {
          orient.lock('landscape').catch(() => {});
        }
      } catch {}
      window.removeEventListener('touchstart', goFullscreen);
      window.removeEventListener('click', goFullscreen);
    };
    window.addEventListener('touchstart', goFullscreen, { once: true });
    window.addEventListener('click', goFullscreen, { once: true });
    return () => {
      window.removeEventListener('touchstart', goFullscreen);
      window.removeEventListener('click', goFullscreen);
    };
  }, [isMobile]);

  const handleKey = useCallback((e: KeyboardEvent, down: boolean) => {
    // Desktop-only: ignore all keyboard input on mobile devices.
    if (isMobile) return;
    if (showTask) return;

    const key = e.key.toLowerCase();
    if (down) {
      keysRef.current.add(key);
      if (key === ' ' || key === 'space') {
        e.preventDefault();
        const now = performance.now();
        const s = stateRef.current;
          const ab = s.players[0].ability;
          if (ab === 'kill' || ab === 'shooter') humanKill(s, now);
          else if (ab === 'jail') humanArrest(s, now);
        else {
          const taskId = getNearbyTask(s);
          if (taskId !== null) {
            const station = s.taskStations.find(t => t.id === taskId);
            if (station) {
              const challenge = generateTaskChallenge(station);
              s.activeTask = challenge;
              s.players[0].doingTask = true;
              s.players[0].taskStationId = taskId;
              setShowTask(true);
              setGameState({ ...s });
            }
          }
        }
      }
      if (key === 'e' || key === '5') {
        e.preventDefault();
        const s = stateRef.current;
        // Door takes priority
        const doorId = getNearbyDoor(s);
        if (doorId !== null) {
          const door = s.doors.find(d => d.id === doorId)!;
          if (performance.now() - door.lastUsedAt >= DOOR_USE_COOLDOWN) {
            s.activeTask = {
              type: 'door', stationId: -1, prompt: door.open ? 'Close door' : 'Open door',
              answer: '', doorId, doorAction: door.open ? 'close' : 'open',
            };
            s.players[0].doingTask = true;
            setShowTask(true);
            setGameState({ ...s });
          }
          return;
        }
        const taskId = getNearbyTask(s);
        if (taskId !== null) {
          const station = s.taskStations.find(t => t.id === taskId);
          if (station) {
            const challenge = generateTaskChallenge(station);
            s.activeTask = challenge;
            s.players[0].doingTask = true;
            s.players[0].taskStationId = taskId;
            setShowTask(true);
            setGameState({ ...s });
          }
        }
      }
      if (key === 'b') {
        e.preventDefault();
        const s = stateRef.current;
        const human = s.players[0];
        if (human.alive && !human.jailed && (human.builderCharges ?? 0) > 0) {
          placeBuilderBlock(s, human, performance.now());
          setGameState({ ...s });
        }
      }
    } else {
      keysRef.current.delete(key);
    }
  }, [showTask, setGameState, isMobile]);

  useEffect(() => {
    // Only register keyboard listeners on desktop.
    if (isMobile) return;
    const kd = (e: KeyboardEvent) => handleKey(e, true);
    const ku = (e: KeyboardEvent) => handleKey(e, false);
    // Clear all held keys if the window loses focus — otherwise a keyup
    // fired while another window/tab is focused is missed and the player
    // keeps moving indefinitely.
    const clear = () => keysRef.current.clear();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [handleKey, isMobile]);

  useEffect(() => {
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min(time - lastTime, 50);
      lastTime = time;

      // Apply mobile joystick direction
      const human = stateRef.current.players[0];
      if (isMobile && human.alive && !human.doingTask) {
        human.direction = { ...mobileDir.current };
      }

      if (stateRef.current.phase === 'playing') {
        const newState = updateGame(stateRef.current, dt, keysRef.current, time, isMobile);
        stateRef.current = newState;
        setGameState(newState);

        // Arrest sound effect
        const ra = newState.recentArrest;
        if (ra && ra.eventId !== lastArrestEventRef.current) {
          lastArrestEventRef.current = ra.eventId;
          try {
            const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (AC) {
              const ctx = new AC();
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.type = 'square';
              o.frequency.setValueAtTime(880, ctx.currentTime);
              o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.35);
              g.gain.setValueAtTime(0.18, ctx.currentTime);
              g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
              o.connect(g); g.connect(ctx.destination);
              o.start(); o.stop(ctx.currentTime + 0.4);
            }
          } catch {}
        }
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) renderGame(ctx, stateRef.current, size.w, size.h);
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [size, setGameState, isMobile]);

  const handleTaskComplete = useCallback(() => {
    const s = stateRef.current;
    if (s.activeTask && s.activeTask.type === 'door' && s.activeTask.doorId !== undefined) {
      toggleDoor(s, s.activeTask.doorId, performance.now());
    } else if (s.activeTask) {
      const station = s.taskStations.find(t => t.id === s.activeTask!.stationId);
      if (station && !station.completed) {
        station.completed = true;
        s.tasksCompleted++;
      }
    }
    s.players[0].doingTask = false;
    s.players[0].taskStationId = null;
    s.activeTask = null;
    setShowTask(false);
    setGameState({ ...s });
  }, [setGameState]);

  const handleTaskCancel = useCallback(() => {
    const s = stateRef.current;
    s.players[0].doingTask = false;
    s.players[0].taskStationId = null;
    s.activeTask = null;
    setShowTask(false);
    setGameState({ ...s });
  }, [setGameState]);

  const handleMobileMove = useCallback((dx: number, dy: number) => {
    mobileDir.current = { x: dx, y: dy };
  }, []);

  const handleMobileAction = useCallback(() => {
    const s = stateRef.current;
    const now = performance.now();
      const ab = s.players[0].ability;
      if (ab === 'kill' || ab === 'shooter') {
      humanKill(s, now);
      } else if (ab === 'jail') {
      humanArrest(s, now);
      } else if (ab === 'crew') {
      // Door has priority
      const doorId = getNearbyDoor(s);
      if (doorId !== null) {
        const door = s.doors.find(d => d.id === doorId)!;
        if (performance.now() - door.lastUsedAt >= DOOR_USE_COOLDOWN) {
          s.activeTask = {
            type: 'door', stationId: -1, prompt: door.open ? 'Close door' : 'Open door',
            answer: '', doorId, doorAction: door.open ? 'close' : 'open',
          };
          s.players[0].doingTask = true;
          setShowTask(true);
          setGameState({ ...s });
          return;
        }
      }
      const taskId = getNearbyTask(s);
      if (taskId !== null) {
        const station = s.taskStations.find(t => t.id === taskId);
        if (station) {
          const challenge = generateTaskChallenge(station);
          s.activeTask = challenge;
          s.players[0].doingTask = true;
          s.players[0].taskStationId = taskId;
          setShowTask(true);
          setGameState({ ...s });
        }
      }
    }
  }, [setGameState]);

  const handleMobileBuild = useCallback(() => {
    const s = stateRef.current;
    const human = s.players[0];
    if (human.alive && !human.jailed && (human.builderCharges ?? 0) > 0) {
      placeBuilderBlock(s, human, performance.now());
      setGameState({ ...s });
    }
  }, [setGameState]);

  // Determine action button state for mobile
  const human = gameState.players[0];
  let actionLabel = '';
  let canAction = false;
  const hAb = human.ability;
  if (hAb === 'kill' || hAb === 'shooter') {
    actionLabel = hAb === 'shooter' ? 'SHOOT' : 'KILL';
    const range = rangeForAbility(hAb);
    canAction = human.alive && !human.jailed && human.killCooldown <= 0 &&
      gameState.players.some(p => p.alive && p.id !== 0 && p.team !== human.team && dist(human, p) < range);
  } else if (hAb === 'jail') {
    actionLabel = 'ARREST';
    canAction = human.alive && !human.jailed && human.arrestCooldown <= 0 &&
      gameState.players.some(p => p.alive && p.id !== 0 && !p.jailed && p.team !== human.team && dist(human, p) < ARREST_RANGE);
  } else {
    const doorId = getNearbyDoor(gameState);
    if (doorId !== null) {
      const door = gameState.doors.find(d => d.id === doorId)!;
      actionLabel = door.open ? 'CLOSE' : 'OPEN';
      canAction = (performance.now() - door.lastUsedAt) >= DOOR_USE_COOLDOWN;
    } else {
      actionLabel = 'TASK';
      canAction = getNearbyTask(gameState) !== null;
    }
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        className="block"
        style={{ cursor: isMobile ? 'none' : 'default', touchAction: 'none' }}
        onClick={() => {
          if (isMobile) return;
          const s = stateRef.current;
          const now = performance.now();
          const ab = s.players[0].ability;
          if (ab === 'kill' || ab === 'shooter') humanKill(s, now);
          else if (ab === 'jail') humanArrest(s, now);
        }}
      />
      {showTask && gameState.activeTask && (
        <TaskOverlay
          task={gameState.activeTask}
          onComplete={handleTaskComplete}
          onCancel={handleTaskCancel}
        />
      )}
      {isMobile && !showTask && gameState.phase === 'playing' && (
        <MobileControls
          role={human.role}
          ability={human.ability}
          team={human.team}
          canAction={canAction}
          actionLabel={actionLabel}
          onMove={handleMobileMove}
          onAction={handleMobileAction}
          builderCharges={human.builderCharges ?? 0}
          onBuild={handleMobileBuild}
        />
      )}
      {needsRotate && <RotateDevicePrompt />}
      {gameState.refereeActive && gameState.refereeMessage && (
        <RefereeOverlay message={gameState.refereeMessage} />
      )}
      {onExit && <DraggableExitButton onExit={onExit} />}
    </>
  );
}
