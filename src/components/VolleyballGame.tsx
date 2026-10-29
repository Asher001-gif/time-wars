import { useEffect, useRef, useState } from 'react';
import crewImg from '@/assets/char-crew-a.png';
import DraggableExitButton from './DraggableExitButton';
import RotateDevicePrompt from './RotateDevicePrompt';
import { useIsMobileDevice, useIsPortrait } from '@/hooks/use-device';
import { CLOUD_RECTS, preloadVolleyballAssets, volleyballImages } from '@/game/volleyballAssets';

/* ===================== CONSTANTS (world is 1600 x 800) ===================== */
const W = 1600, H = 800;
const GROUND = 720;
const NET_X = W / 2, NET_HALF = 8, NET_TOP = 500;
const PR = 44;                  // player centre height above the ground when standing
const BALL_R = 24;
const G_P = 0.85;               // player gravity
const G_B = 0.34;               // ball gravity
const JUMP_V = -17.5;
const MOVE = 6.2;               // human speed (medium)
const BOT_MOVE = 5.8;
const BODY_HW = 48, BODY_TOP = 60, BODY_BOT = 48; // body box around player centre (head to feet)
const METER_GAIN = 10;          // % of the power meter each hit fills (10 hits = full)
const POWER_SPEED = 27;         // speed of a full-meter lightning shot
const REACH = 105;              // how far a player can hit the ball
const MAX_BALL_V = 17;
const DT = 1000 / 60;
const STAND_Y = GROUND - PR;

const COLORS = { L: '#4a90d9', R: '#e03030' } as const;
const NAMES = { L: 'BLUE', R: 'RED' } as const;

type Side = 'L' | 'R';
type Intent = 'set' | 'attack' | 'over';

interface VPlayer {
  id: number; side: Side; isHuman: boolean; name: string;
  x: number; y: number; vx: number; vy: number; onGround: boolean;
  facing: number; willMiss: boolean; react: number; wasInReach: boolean; meter: number; armed: boolean;
}
interface VBall { x: number; y: number; vx: number; vy: number; rot: number; side: Side; touches: number; lastHitter: number; rally: number; lastHitT: number; fire: boolean; trail: { x: number; y: number }[] }
interface VState {
  players: VPlayer[]; ball: VBall;
  score: { L: number; R: number };
  phase: 'serve' | 'play' | 'point' | 'over';
  t: number; until: number; serveSide: Side; pointMsg: string;
  target: number; humanSide: Side; reported: boolean;
}
interface Input { left: boolean; right: boolean; jumpBuf: number; hitBuf: number; setHeld: boolean; powerBuf: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dirOf = (s: Side) => (s === 'L' ? 1 : -1);

function homeX(side: Side, slot: number) {
  const l = slot === 0 ? 560 : 260;
  return side === 'L' ? l : W - l;
}
function bounds(side: Side) {
  const margin = 60, gap = NET_HALF + 50;
  return side === 'L' ? [margin, NET_X - gap] : [NET_X + gap, W - margin];
}

function makePlayer(id: number, side: Side, slot: number, isHuman: boolean, name: string): VPlayer {
  return {
    id, side, isHuman, name, x: homeX(side, slot), y: STAND_Y, vx: 0, vy: 0, onGround: true,
    facing: dirOf(side), willMiss: false, react: 0, wasInReach: false, meter: 0, armed: false,
  };
}

function createVolleyball(target: number, playerName: string): VState {
  const humanSide: Side = Math.random() < 0.5 ? 'L' : 'R';
  const other: Side = humanSide === 'L' ? 'R' : 'L';
  const players = [
    makePlayer(0, humanSide, 0, true, playerName || 'You'),
    makePlayer(1, humanSide, 1, false, 'Mate'),
    makePlayer(2, other, 0, false, 'Opponent'),
    makePlayer(3, other, 1, false, 'Opponent'),
  ];
  const s: VState = {
    players, ball: { x: 0, y: 0, vx: 0, vy: 0, rot: 0, side: 'L', touches: 0, lastHitter: -1, rally: 0, lastHitT: -9999, fire: false, trail: [] },
    score: { L: 0, R: 0 }, phase: 'serve', t: 0, until: 0, serveSide: Math.random() < 0.5 ? 'L' : 'R',
    pointMsg: '', target, humanSide, reported: false,
  };
  startServe(s);
  return s;
}

function startServe(s: VState) {
  s.players.forEach(p => {
    const slot = p.id === 0 || p.id === 2 ? 0 : 1;
    p.x = homeX(p.side, slot); p.y = STAND_Y; p.vx = 0; p.vy = 0; p.onGround = true;
    p.willMiss = false; p.react = 0; p.wasInReach = false;
  });
  const x = s.serveSide === 'L' ? NET_X - 380 : NET_X + 380;
  s.ball = { x, y: 300, vx: 0, vy: 0, rot: 0, side: s.serveSide, touches: 0, lastHitter: -1, rally: 0, lastHitT: -9999, fire: false, trail: [] };
  s.phase = 'serve';
  s.until = s.t + 1400;
}

/* ===================== PHYSICS / RULES ===================== */
function predictLanding(b: VBall): number {
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  for (let i = 0; i < 300; i++) {
    vy += G_B; x += vx; y += vy;
    if (x < BALL_R) { x = BALL_R; vx = Math.abs(vx) * 0.8; }
    if (x > W - BALL_R) { x = W - BALL_R; vx = -Math.abs(vx) * 0.8; }
    if (vy > 0 && y >= STAND_Y - 30) return x;
  }
  return x;
}

/** True if a ball at (x, y) touches ANY part of the player's body (head, torso, legs). */
function bodyContactAt(p: VPlayer, x: number, y: number) {
  const cx = clamp(x, p.x - BODY_HW, p.x + BODY_HW);
  const cy = clamp(y, p.y - BODY_TOP, p.y + BODY_BOT);
  return Math.hypot(x - cx, y - cy) < BALL_R;
}

/** Contact normal + a point just outside the body, for the ball at (x, y). */
function contact(p: VPlayer, x: number, y: number) {
  const l = p.x - BODY_HW, r = p.x + BODY_HW, t = p.y - BODY_TOP, bt = p.y + BODY_BOT;
  const cx = clamp(x, l, r), cy = clamp(y, t, bt);
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
  if (d > 0.001) return { nx: dx / d, ny: dy / d, px: cx + (dx / d) * (BALL_R + 0.5), py: cy + (dy / d) * (BALL_R + 0.5) };
  // ball centre is inside the box: leave through the nearest face
  const m = Math.min(x - l, r - x, y - t, bt - y);
  if (m === y - t) return { nx: 0, ny: -1, px: x, py: t - BALL_R - 0.5 };
  if (m === bt - y) return { nx: 0, ny: 1, px: x, py: bt + BALL_R + 0.5 };
  if (m === x - l) return { nx: -1, ny: 0, px: l - BALL_R - 0.5, py: y };
  return { nx: 1, ny: 0, px: r + BALL_R + 0.5, py: y };
}

/** Would a ball launched from (x, y) with this velocity clear the net (or land before it)? */
function clearsNet(x: number, y: number, vx: number, vy: number) {
  const sign = Math.sign(NET_X - x);
  if (sign === 0 || vx * sign <= 0) return true;
  for (let i = 0; i < 300; i++) {
    vy += G_B; x += vx; y += vy;
    if (y + BALL_R >= GROUND) return true;
    if (sign * (NET_X - x) <= NET_HALF) return y < NET_TOP - BALL_R - 4;
  }
  return true;
}

function inReach(p: VPlayer, b: VBall) {
  return Math.hypot(b.x - p.x, b.y - p.y) < REACH || bodyContactAt(p, b.x, b.y);
}

function canHit(s: VState, p: VPlayer) {
  const b = s.ball;
  return s.phase === 'play' && b.side === p.side && b.touches < 3 && (b.lastHitter !== p.id || s.t - b.lastHitT > 300) && inReach(p, b);
}

/** A spike only works if the ball is high enough to angle down over the net; otherwise it becomes a high bump. */
function spikeFits(b: VBall, p: VPlayer) {
  const hf = clamp((STAND_Y - p.y) / 180, 0.25, 1);
  const vx = 9 + 7 * hf;
  const tNet = Math.max(1, Math.abs(NET_X - b.x) / vx);
  const maxVy = (NET_TOP - BALL_R - 8 - b.y) / tNet;
  return maxVy > -1;
}

function doHit(s: VState, p: VPlayer, intent: Intent, power = 1) {
  const b = s.ball;
  const dir = dirOf(p.side);
  const airborne = p.y < STAND_Y - 30;
  // FULL METER => lightning shot: very fast, straight toward the other side (as flat as the net allows)
  if (intent !== 'set' && p.meter >= 100 && (p.armed || !p.isHuman)) {
    let vx = dir * POWER_SPEED * 0.95, vy = -POWER_SPEED * 0.1;
    for (let ang = -0.3; ang <= 1.2; ang += 0.04) {
      vx = dir * POWER_SPEED * Math.cos(ang); vy = -POWER_SPEED * Math.sin(ang);
      if (clearsNet(b.x, b.y, vx, vy)) break;
    }
    b.vx = vx; b.vy = vy; b.touches++; b.lastHitter = p.id; b.lastHitT = s.t; b.rally++;
    b.fire = true; b.trail = []; p.meter = 0; p.armed = false; p.facing = dir;
    return;
  }
  p.meter = Math.min(100, p.meter + METER_GAIN);
  b.fire = false; b.trail = [];
  let vx: number, vy: number;
  if (intent === 'set') {
    // soft lob toward the net-side spot where the teammate can spike it
    const tx = NET_X - dir * 170;
    vy = -13.5;
    vx = clamp((tx - b.x) / 78, -9, 9);
  } else if (airborne && spikeFits(b, p)) {
    // SPIKE: jumping adds speed; higher jump = harder hit
    const hf = clamp((STAND_Y - p.y) / 180, 0.25, 1);
    vx = dir * (9 + 7 * hf) * power;
    vy = (-3 + 11 * hf) * power;
    const tNet = Math.max(1, Math.abs(NET_X - b.x) / Math.abs(vx));
    const maxVy = (NET_TOP - BALL_R - 8 - b.y) / tNet;   // must still clear the net
    vy = Math.min(vy, maxVy);
  } else {
    // ground bump: high arc over the net
    const tx = NET_X + dir * (220 + Math.random() * 240);
    vy = -14.5;
    vx = clamp((tx - b.x) / 92, -12, 12);
  }
  // blend the aimed hit with real physics: bounce off the contact point + the player's own motion
  {
    const c = contact(p, b.x, b.y);
    const rvx = b.vx - p.vx, rvy = b.vy - p.vy;
    const vn = rvx * c.nx + rvy * c.ny;
    let pvx = b.vx, pvy = b.vy;
    if (vn < 0) { pvx = rvx - 1.8 * vn * c.nx + p.vx; pvy = rvy - 1.8 * vn * c.ny + p.vy; }
    const w = intent === 'set' ? 0.15 : 0.3;
    vx = vx * (1 - w) + pvx * w + p.vx * 0.35;
    vy = vy * (1 - w) + pvy * w + (p.vy < 0 ? p.vy * 0.25 : 0);
    if (intent !== 'set' && dir * vx < 3) vx = dir * 3;   // never send it backwards
  }
  // every consecutive hit in a rally makes the ball a little faster
  const boost = Math.min(1 + b.rally * 0.025, 1.4);
  const isSpike = intent !== 'set' && airborne && spikeFits(b, p);
  vx *= boost; if (!isSpike) vy *= boost; // spike keeps its net-clearing angle
  const cap = MAX_BALL_V * boost;
  const sp = Math.hypot(vx, vy);
  if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
  if (intent !== 'set') { let n = 0; while (n++ < 40 && !clearsNet(b.x, b.y, vx, vy)) vy -= 0.7; }
  const hard = MAX_BALL_V * 1.45;               // absolute speed limit after all blending
  const sp2 = Math.hypot(vx, vy);
  if (sp2 > hard) { vx *= hard / sp2; vy *= hard / sp2; }
  b.rally++;
  b.vx = vx; b.vy = vy; b.touches++; b.lastHitter = p.id; b.lastHitT = s.t;
  p.facing = dir;
}

function scorePoint(s: VState, winner: Side) {
  s.score[winner]++;
  s.serveSide = winner;
  s.pointMsg = `POINT ${NAMES[winner]}!`;
  if (s.score[winner] >= s.target) s.phase = 'over';
  else { s.phase = 'point'; s.until = s.t + 1500; }
}

function botIntent(s: VState, p: VPlayer): Intent {
  const b = s.ball;
  const mate = s.players.find(q => q.side === p.side && q.id !== p.id);
  if (mate && b.touches === 0 && Math.random() < 0.9) return 'set';
  return mate && b.touches === 1 ? 'attack' : 'over';
}

function botAI(s: VState, p: VPlayer) {
  const b = s.ball;
  const dir = dirOf(p.side);
  const mates = s.players.filter(q => q.side === p.side);
  const mate = mates.find(q => q.id !== p.id);
  const [minX, maxX] = bounds(p.side);
  const supportX = p.side === 'L' ? NET_X - 250 : NET_X + 250;
  let targetX = homeX(p.side, p.id === 1 || p.id === 3 ? 1 : 0);

  if (s.phase === 'play') {
    const landX = predictLanding(b);
    const mine = p.side === 'L' ? landX < NET_X : landX > NET_X;
    if (mine) {
      const myD = Math.abs(p.x - landX);
      const mateD = mate ? Math.abs(mate.x - landX) : Infinity;
      const chaser = myD <= mateD;
      targetX = chaser ? landX - dir * 22 : supportX;
    } else {
      targetX = supportX;
    }
    if (b.side === p.side && b.touches < 3) {
      const intent = botIntent(s, p);
      // jump to meet high balls
      const dx = Math.abs(b.x - p.x);
      const nearNet = Math.abs(NET_X - p.x) < 430;
      if (p.onGround && dx < 80 && b.vy > -2 && b.y < p.y - 110 && b.y > p.y - 300 && (intent !== 'set') && nearNet) {
        p.vy = JUMP_V; p.onGround = false;
      }
    }
  }

  // ball is balancing on this bot (almost no speed, touching/above its body): stop chasing it and JUMP to pop it off
  const stuck = s.phase === 'play' && b.side === p.side && Math.hypot(b.vx, b.vy) < 3 &&
    Math.abs(b.x - p.x) < BODY_HW + BALL_R + 10 && b.y < p.y && b.y > p.y - BODY_TOP - BALL_R - 40;
  if (stuck) {
    targetX = p.x;
    if (p.onGround) { p.vy = JUMP_V; p.onGround = false; }
  }

  const dx = targetX - p.x;
  p.vx = Math.abs(dx) < 8 ? 0 : Math.sign(dx) * BOT_MOVE;
  p.x = clamp(p.x + p.vx, minX, maxX);
  if (Math.abs(p.vx) > 0.1) p.facing = Math.sign(p.vx);
}

function humanControl(s: VState, p: VPlayer, inp: Input) {
  const [minX, maxX] = bounds(p.side);
  const dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  p.vx = dx * MOVE;
  p.x = clamp(p.x + p.vx, minX, maxX);
  if (dx !== 0) p.facing = dx;
  if (inp.powerBuf > 0) { if (p.meter >= 100) p.armed = true; inp.powerBuf = 0; }
  if (inp.jumpBuf > 0 && p.onGround) { p.vy = JUMP_V; p.onGround = false; inp.jumpBuf = 0; }
  if (inp.hitBuf > 0 && canHit(s, p)) {
    const b = s.ball;
    const mate = s.players.find(q => q.side === p.side && q.id !== p.id);
    // SET (hold down / SET button) lobs to the teammate; otherwise bump/spike over the net
    const intent: Intent = inp.setHeld && mate && b.touches < 2 ? 'set' : 'over';
    doHit(s, p, intent);
    inp.hitBuf = 0;
  }
}

function step(s: VState, inp: Input) {
  s.t += DT;
  if (inp.jumpBuf > 0) inp.jumpBuf--;
  if (inp.hitBuf > 0) inp.hitBuf--;
  if (inp.powerBuf > 0) inp.powerBuf--;
  if (s.phase === 'over') return;

  if (s.phase === 'point') {
    if (s.t >= s.until) startServe(s);
    return;
  }
  if (s.phase === 'serve' && s.t >= s.until) s.phase = 'play';

  for (const p of s.players) {
    if (p.isHuman) humanControl(s, p, inp); else botAI(s, p);
    p.vy += G_P; p.y += p.vy;
    if (p.y >= STAND_Y) { p.y = STAND_Y; p.vy = 0; p.onGround = true; }
  }

  if (s.phase !== 'play') return;
  const b = s.ball;
  const px = b.x, py = b.y;
  b.vy += G_B; b.x += b.vx; b.y += b.vy;
  b.rot += b.vx * 0.04;
  if (b.fire) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 14) b.trail.shift(); }
  if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.8; }
  if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.8; }

  // net
  const cx = clamp(b.x, NET_X - NET_HALF, NET_X + NET_HALF);
  const cy = clamp(b.y, NET_TOP, GROUND);
  let ndx = b.x - cx, ndy = b.y - cy;
  const nd = Math.hypot(ndx, ndy);
  if (nd < BALL_R) {
    if (nd === 0) { ndx = 0; ndy = -1; } else { ndx /= nd; ndy /= nd; }
    b.x = cx + ndx * BALL_R; b.y = cy + ndy * BALL_R;
    const vn = b.vx * ndx + b.vy * ndy;
    if (vn < 0) { b.vx -= 1.6 * vn * ndx; b.vy -= 1.6 * vn * ndy; }
  }

  // crossing the net resets the touch count for the receiving team
  const side: Side = b.x < NET_X ? 'L' : 'R';
  if (side !== b.side) { b.side = side; b.touches = 0; b.lastHitter = -1; }

  // everyone (you, mate, opponents): ball touching ANY part of the body is a hit (aimed + physics).
  // If the team already used 3 touches (or the ball is still leaving the player's own hit), it bounces off like a solid body.
  for (const p of s.players) {
    if (b.side !== p.side) continue;
    let touched = false;
    for (let k = 0; k <= 4 && !touched; k++) {
      const t = k / 4;
      touched = bodyContactAt(p, px + (b.x - px) * t, py + (b.y - py) * t);
    }
    if (!touched) continue;
    const c0 = contact(p, b.x, b.y);
    const approaching = (b.vx - p.vx) * c0.nx + (b.vy - p.vy) * c0.ny < 0;
    // the same player may hit again (after a short moment, when the ball comes back into them)
    const again = b.lastHitter !== p.id || (s.t - b.lastHitT > 300 && approaching);
    if (b.touches < 3 && again) {
      const mate = s.players.find(q => q.side === p.side && q.id !== p.id);
      const intent: Intent = p.isHuman
        ? (inp.setHeld && mate && b.touches < 2 ? 'set' : 'over')
        : botIntent(s, p);
      doHit(s, p, intent, p.isHuman ? 1 : 0.7);
    } else {
      const c = contact(p, b.x, b.y);
      const rvx = b.vx - p.vx, rvy = b.vy - p.vy;
      const vn = rvx * c.nx + rvy * c.ny;
      if (vn < 0) {
        b.vx = rvx - 1.6 * vn * c.nx + p.vx; b.vy = rvy - 1.6 * vn * c.ny + p.vy;
        if (Math.hypot(b.vx, b.vy) < 3.5) {      // ball would just sit on the head: roll it off
          b.vx = (b.x >= p.x ? 1 : -1) * (3 + Math.random() * 2); b.vy = -4;
        }
        const sp = Math.hypot(b.vx, b.vy), hard = MAX_BALL_V * 1.45;
        if (sp > hard) { b.vx *= hard / sp; b.vy *= hard / sp; }
      }
    }
    const c = contact(p, b.x, b.y);           // push the ball out so it never sits inside a body
    b.x = clamp(c.px, BALL_R, W - BALL_R); b.y = Math.min(c.py, GROUND - BALL_R);
    break;
  }

  // ball on the ground of a team => other team scores
  if (b.y + BALL_R >= GROUND) {
    b.y = GROUND - BALL_R;
    scorePoint(s, b.x < NET_X ? 'R' : 'L');
  }
}

/* ===================== RENDERING ===================== */
/* Drifting clouds: [sprite, y (world), height (world), speed px/s, phase 0..1, alpha]. Pure decoration, no physics. */
const CLOUDS: [number, number, number, number, number, number][] = [
  [0, 40, 150, 9, 0.05, 0.95], [3, 150, 100, 14, 0.30, 0.9], [5, 70, 70, 20, 0.55, 0.85],
  [1, 230, 80, 12, 0.80, 0.9], [8, 20, 60, 24, 0.15, 0.8], [4, 300, 70, 16, 0.65, 0.85],
  [10, 120, 45, 28, 0.92, 0.75], [2, 190, 90, 11, 0.42, 0.9], [6, 260, 55, 22, 0.20, 0.8],
];

/** Draws the scenery across the WHOLE visible area (x0..x1, y0..y1 in world units), so there are never black bars. */
function drawBackground(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, now: number) {
  const top = Math.min(0, y0), bottom = Math.max(H, y1);
  const { bg, clouds, ready } = volleyballImages;
  if (ready) {
    // ocean + sky image, scaled to cover the whole visible area
    const vw = x1 - x0, vh = bottom - top;
    const k = Math.max(vw / bg.naturalWidth, vh / bg.naturalHeight);
    const dw = bg.naturalWidth * k, dh = bg.naturalHeight * k;
    ctx.drawImage(bg, x0 + (vw - dw) / 2, top + (vh - dh) / 2, dw, dh);
    // slow drifting clouds in front of the image, behind the net / players / ball
    const span = vw + 800;
    for (const [idx, cy, ch, speed, phase, alpha] of CLOUDS) {
      const [sx, sy, sw, sh] = CLOUD_RECTS[idx];
      const cwid = ch * (sw / sh);
      const x = x0 - 400 + ((phase * span + (now / 1000) * speed) % span) - cwid / 2;
      ctx.globalAlpha = alpha;
      ctx.drawImage(clouds, sx, sy, sw, sh, x, cy, cwid, ch);
    }
    ctx.globalAlpha = 1;
  } else {
    const sky = ctx.createLinearGradient(0, top, 0, GROUND);
    sky.addColorStop(0, '#2e7bea'); sky.addColorStop(1, '#8fd0ff');
    ctx.fillStyle = sky; ctx.fillRect(x0 - 2, top - 2, x1 - x0 + 4, GROUND - top + 2);
  }
  const floor = ctx.createLinearGradient(0, GROUND, 0, bottom);
  floor.addColorStop(0, '#f0c777'); floor.addColorStop(1, '#c99650');
  ctx.fillStyle = floor; ctx.fillRect(x0 - 2, GROUND, x1 - x0 + 4, bottom - GROUND + 2);
  ctx.fillStyle = '#fff'; ctx.fillRect(x0 - 2, GROUND, x1 - x0 + 4, 5);
  ctx.fillRect(NET_X - 3, GROUND, 6, bottom - GROUND);
}

function drawNet(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#3c4050';
  ctx.fillRect(NET_X - NET_HALF, NET_TOP, NET_HALF * 2, GROUND - NET_TOP);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
  for (let y = NET_TOP + 14; y < NET_TOP + 150; y += 16) {
    ctx.beginPath(); ctx.moveTo(NET_X - 22, y); ctx.lineTo(NET_X + 22, y); ctx.stroke();
  }
  for (let x = NET_X - 22; x <= NET_X + 22; x += 11) {
    ctx.beginPath(); ctx.moveTo(x, NET_TOP + 6); ctx.lineTo(x, NET_TOP + 150); ctx.stroke();
  }
  ctx.fillStyle = '#fff'; ctx.fillRect(NET_X - 24, NET_TOP, 48, 8);
}

function shadow(ctx: CanvasRenderingContext2D, x: number, height: number, w: number) {
  const k = clamp(1 - height / 420, 0.3, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.3 * k})`;
  ctx.beginPath(); ctx.ellipse(x, GROUND + 14, w * k, 9 * k, 0, 0, Math.PI * 2); ctx.fill();
}

function lightning(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], jitter: number) {
  ctx.beginPath();
  pts.forEach((q, i) => {
    const jx = i === 0 || i === pts.length - 1 ? 0 : (Math.random() - 0.5) * jitter;
    const jy = i === 0 || i === pts.length - 1 ? 0 : (Math.random() - 0.5) * jitter;
    if (i === 0) ctx.moveTo(q.x + jx, q.y + jy); else ctx.lineTo(q.x + jx, q.y + jy);
  });
  ctx.stroke();
}

function drawLightning(ctx: CanvasRenderingContext2D, b: VBall) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = '#7fe7ff'; ctx.shadowBlur = 22;
  // glowing aura
  ctx.fillStyle = 'rgba(255,240,120,0.35)';
  ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R + 12 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
  // crackling trail behind the ball
  const trail = [...b.trail, { x: b.x, y: b.y }];
  if (trail.length > 1) {
    ctx.strokeStyle = 'rgba(80,200,255,0.55)'; ctx.lineWidth = 10; lightning(ctx, trail, 26);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; lightning(ctx, trail, 22);
  }
  // bolts thrown forward in the shot direction
  const base = Math.atan2(b.vy, b.vx);
  for (let k = 0; k < 5; k++) {
    const ang = base + (Math.random() - 0.5) * 1.3;
    const len = 50 + Math.random() * 70;
    const pts = [{ x: b.x, y: b.y }];
    for (let i = 1; i <= 4; i++) {
      const d = (len * i) / 4;
      pts.push({ x: b.x + Math.cos(ang) * d + (Math.random() - 0.5) * 16, y: b.y + Math.sin(ang) * d + (Math.random() - 0.5) * 16 });
    }
    ctx.strokeStyle = k % 2 ? '#fff6a8' : '#b8f1ff'; ctx.lineWidth = 3; lightning(ctx, pts, 0);
  }
  ctx.restore();
}

function drawMeter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, t: number) {
  const full = v >= 100, f = clamp(v, 0, 100) / 100;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#2fd0ff'); g.addColorStop(1, '#ffe14a');
  ctx.fillStyle = g; ctx.fillRect(x, y, w * f, h);
  if (full) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.02);
    ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 14;
    ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * pulse})`; ctx.lineWidth = 2;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  }
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, b: VBall) {
  shadow(ctx, b.x, GROUND - b.y, BALL_R);
  if (b.fire) drawLightning(ctx, b);
  ctx.save();
  ctx.translate(b.x, b.y); ctx.rotate(b.rot);
  ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#2d6bd8';
  ctx.beginPath(); ctx.arc(-BALL_R * 1.1, 0, BALL_R * 1.0, -0.9, 0.9); ctx.stroke();
  ctx.beginPath(); ctx.arc(BALL_R * 1.1, 0, BALL_R * 1.0, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
  ctx.strokeStyle = '#f2c230';
  ctx.beginPath(); ctx.arc(0, -BALL_R * 1.1, BALL_R, 0.7, Math.PI - 0.7); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, BALL_R * 1.1, BALL_R, Math.PI + 0.7, -0.7); ctx.stroke();
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = '#15203c';
  ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: VPlayer, img: HTMLImageElement, t: number) {
  shadow(ctx, p.x, STAND_Y - p.y, 40);
  const col = COLORS[p.side];
  // team-coloured ring at the feet
  ctx.strokeStyle = col; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(p.x, GROUND + 14, 40, 10, 0, 0, Math.PI * 2); ctx.stroke();

  const size = 118;
  const squash = p.onGround ? 1 + Math.sin(t * 0.008 + p.id) * 0.015 : 1;
  ctx.save();
  ctx.translate(p.x, p.y - 6);
  ctx.scale(p.facing, squash);
  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // tag above head
  const label = p.isHuman ? 'YOU' : p.name.toUpperCase();
  ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
  const wTag = ctx.measureText(label).width + 16;
  ctx.fillStyle = col; ctx.fillRect(p.x - wTag / 2, p.y - 98, wTag, 20);
  ctx.fillStyle = '#fff'; ctx.fillText(label, p.x, p.y - 83);
  if (p.armed) {
    ctx.save(); ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 24;
    ctx.strokeStyle = `rgba(255,225,74,${0.6 + 0.4 * Math.sin(t * 0.03)})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 6, 62, 70, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  // your meter is always shown; a bot's meter only appears once it is full (lightning shot incoming)
  if (p.isHuman || p.meter >= 100) drawMeter(ctx, p.x - 35, p.y - 114, 70, 8, p.meter, t);
  if (p.isHuman) {
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath(); ctx.moveTo(p.x - 9, p.y - 138); ctx.lineTo(p.x + 9, p.y - 138); ctx.lineTo(p.x, p.y - 124); ctx.fill();
  }
}

function drawHUD(ctx: CanvasRenderingContext2D, s: VState) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(W / 2 - 230, 14, 460, 74);
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px monospace';
  ctx.fillStyle = COLORS.L; ctx.fillText(`BLUE ${s.score.L}`, W / 2 - 110, 58);
  ctx.fillStyle = '#fff'; ctx.fillText('—', W / 2, 58);
  ctx.fillStyle = COLORS.R; ctx.fillText(`${s.score.R} RED`, W / 2 + 110, 58);
  ctx.font = 'bold 15px monospace'; ctx.fillStyle = '#ffe46a';
  ctx.fillText(`FIRST TO ${s.target}`, W / 2, 80);

  const me = s.players.find(q => q.isHuman);
  if (me) {
    const now = performance.now(), full = me.meter >= 100;
    ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = full ? '#ffe14a' : '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    const label = full ? (me.armed ? '⚡ POWER ARMED — HIT THE BALL! ⚡' : '⚡ POWER READY — PRESS 5 ⚡') : `POWER ${Math.floor(me.meter)}%`;
    ctx.strokeText(label, W / 2, 752); ctx.fillText(label, W / 2, 752);
    drawMeter(ctx, W / 2 - 160, 760, 320, 20, me.meter, now);
  }

  if (s.phase === 'play') {
    const b = s.ball;
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = COLORS[b.side];
    ctx.textAlign = b.side === 'L' ? 'left' : 'right';
    ctx.fillText(`TOUCHES ${b.touches}/3`, b.side === 'L' ? 30 : W - 30, 40);
  }

  if (s.phase === 'serve') {
    ctx.font = 'bold 64px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 6;
    ctx.strokeText('GET READY', W / 2, 250); ctx.fillText('GET READY', W / 2, 250);
  } else if (s.phase === 'point' || s.phase === 'over') {
    ctx.font = 'bold 72px monospace'; ctx.textAlign = 'center';
    const side: Side = s.pointMsg.includes('BLUE') ? 'L' : 'R';
    ctx.fillStyle = COLORS[side]; ctx.strokeStyle = '#000'; ctx.lineWidth = 8;
    ctx.strokeText(s.pointMsg, W / 2, 250); ctx.fillText(s.pointMsg, W / 2, 250);
  }
}

function render(ctx: CanvasRenderingContext2D, s: VState, cw: number, ch: number, dpr: number, img: HTMLImageElement) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const scale = Math.min(cw / W, ch / H);
  const ox = (cw - W * scale) / 2, oy = (ch - H * scale) / 2;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
  ctx.save();
  const now = performance.now();
  // the scenery is drawn over the entire screen; only the playing area stays 1600 x 800
  drawBackground(ctx, -ox / scale, -oy / scale, (cw - ox) / scale, (ch - oy) / scale, now);
  drawNet(ctx);
  s.players.forEach(p => drawPlayer(ctx, p, img, now));
  drawBall(ctx, s.ball);
  drawHUD(ctx, s);
  ctx.restore();
}

/* ===================== COMPONENT ===================== */
interface Props { target: number; playerName: string; onExit: () => void }

export default function VolleyballGame({ target, playerName, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<VState>(createVolleyball(target, playerName));
  const inputRef = useRef<Input>({ left: false, right: false, jumpBuf: 0, hitBuf: 0, setHeld: false, powerBuf: 0 });
  const imgRef = useRef<HTMLImageElement>(new Image());
  const [banner, setBanner] = useState(true);
  const [result, setResult] = useState<null | { won: boolean; l: number; r: number }>(null);
  const isMobile = useIsMobileDevice();
  const isPortrait = useIsPortrait();

  useEffect(() => { imgRef.current.src = crewImg; preloadVolleyballAssets(); }, []);
  useEffect(() => { const t = setTimeout(() => setBanner(false), 4500); return () => clearTimeout(t); }, []);

  // keyboard (desktop)
  useEffect(() => {
    if (isMobile) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase(); const i = inputRef.current;
      if (k === 'a' || k === 'arrowleft') i.left = true;
      else if (k === 'd' || k === 'arrowright') i.right = true;
      else if (k === 's' || k === 'arrowdown') i.setHeld = true;
      else if (k === '5' && !e.repeat) i.powerBuf = 10;
      else if ((k === 'w' || k === 'arrowup') && !e.repeat) { i.jumpBuf = 8; e.preventDefault(); }
      else if ((k === ' ' || k === 'k' || k === 'enter') && !e.repeat) { i.hitBuf = 10; e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase(); const i = inputRef.current;
      if (k === 'a' || k === 'arrowleft') i.left = false;
      else if (k === 'd' || k === 'arrowright') i.right = false;
      else if (k === 's' || k === 'arrowdown') i.setHeld = false;
    };
    const clear = () => { const i = inputRef.current; i.left = i.right = i.setHeld = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, [isMobile]);

  // fullscreen on first interaction (desktop + mobile)
  useEffect(() => {
    const go = async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
        if (isMobile) (screen as any).orientation?.lock?.('landscape')?.catch?.(() => {});
      } catch { /* ignore */ }
    };
    go(); // works right away when the game was opened by a click/tap
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
    return () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [isMobile]);

  // game loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0, last = performance.now(), acc = 0;
    let cw = window.innerWidth, ch = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      cw = window.innerWidth; ch = window.innerHeight;
      canvas.width = cw * dpr; canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = (time: number) => {
      acc = Math.min(acc + (time - last), DT * 5);
      last = time;
      const s = stateRef.current;
      while (acc >= DT) { step(s, inputRef.current); acc -= DT; }
      if (s.phase === 'over' && !s.reported) {
        s.reported = true;
        const winner: Side = s.score.L > s.score.R ? 'L' : 'R';
        setResult({ won: winner === s.humanSide, l: s.score.L, r: s.score.R });
      }
      render(ctx, s, cw, ch, dpr, imgRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  const s = stateRef.current;
  const mySide = s.humanSide;
  const enemy = mySide === 'L' ? 'red' : 'blue';
  const btn = (label: string, style: React.CSSProperties, onDown: () => void, onUp?: () => void) => (
    <button
      className="pointer-events-auto absolute rounded-full text-white font-mono font-bold border-[3px] border-white/70 select-none"
      style={{ width: 76, height: 76, fontSize: 14, touchAction: 'none', ...style }}
      onPointerDown={(e) => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); onDown(); }}
      onPointerUp={() => onUp?.()} onPointerCancel={() => onUp?.()}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black overflow-hidden" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="block" />

      {banner && (
        <div className="fixed inset-x-0 top-[22%] z-[70] flex justify-center px-4 pointer-events-none select-none">
          <div
            className="px-6 py-4 rounded-2xl bg-black/80 border-2 font-mono font-bold text-center text-lg sm:text-3xl text-white"
            style={{ borderColor: COLORS[mySide], boxShadow: `0 0 30px ${COLORS[mySide]}` }}
          >
            You are {NAMES[mySide]} TEAM. Land the ball on the {enemy} side to win.
            <div className="text-xs sm:text-base font-normal mt-2 opacity-80">
              {isMobile
                ? 'JUMP then HIT = hard spike • SET = pass to your mate • ⚡ = lightning shot when POWER is full'
                : 'A/D move • W jump • SPACE hit (jump first = hard spike) • hold S + SPACE = set for your mate • 5 = lightning shot when POWER is full'}
            </div>
          </div>
        </div>
      )}

      {isMobile && !result && (
        <div className="fixed inset-0 pointer-events-none z-40">
          {btn('◀', { bottom: 40, left: 24 }, () => { inputRef.current.left = true; }, () => { inputRef.current.left = false; })}
          {btn('▶', { bottom: 40, left: 116 }, () => { inputRef.current.right = true; }, () => { inputRef.current.right = false; })}
          {btn('JUMP', { bottom: 40, right: 116, background: 'rgba(74,144,217,0.8)' }, () => { inputRef.current.jumpBuf = 8; })}
          {btn('HIT', { bottom: 40, right: 24, background: 'rgba(224,48,48,0.85)' }, () => { inputRef.current.hitBuf = 10; })}
          {btn('⚡', { bottom: 130, right: 150, width: 62, height: 62, fontSize: 24, background: 'rgba(255,200,40,0.85)' }, () => { inputRef.current.powerBuf = 10; })}
          {btn('SET', { bottom: 130, right: 70, width: 62, height: 62, background: 'rgba(61,186,111,0.85)' },
            () => { inputRef.current.setHeld = true; inputRef.current.hitBuf = 10; }, () => { inputRef.current.setHeld = false; })}
        </div>
      )}

      {isMobile && isPortrait && <RotateDevicePrompt />}

      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="text-center space-y-5 p-8 rounded-xl border border-border bg-card shadow-2xl max-w-md">
            <h1 className="text-4xl font-bold font-mono tracking-wider" style={{ color: result.won ? '#3dba6f' : '#e03030' }}>
              {result.won ? '🏆 YOU WON!' : 'YOU LOST'}
            </h1>
            <p className="text-2xl font-mono font-bold">
              <span style={{ color: COLORS.L }}>BLUE {result.l}</span>
              <span className="text-white mx-3">—</span>
              <span style={{ color: COLORS.R }}>{result.r} RED</span>
            </p>
            <button
              onClick={onExit}
              className="px-8 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}

      <DraggableExitButton onExit={onExit} />
    </div>
  );
}
