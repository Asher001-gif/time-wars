import { ROOMS, ROOM_WALLS, OBSTACLES, RoomInfo } from './collision';
import { PLAYER_RADIUS } from './types';

// Door centers for each room
interface Door {
  roomIndex: number;
  x: number;
  y: number;
}

const DOORS: Door[] = [
  // Research room: door at bottom, center x=800
  { roomIndex: 0, x: 800, y: 345 },
  // Ecosystem room: door on right side, center y=625
  { roomIndex: 1, x: 395, y: 625 },
  // Recover room: door on left side, center y=625
  { roomIndex: 2, x: 1205, y: 625 },
];

function isInsideRoom(x: number, y: number, room: RoomInfo): boolean {
  return x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h;
}

export function getRoomAt(x: number, y: number): number {
  for (let i = 0; i < ROOMS.length; i++) {
    if (isInsideRoom(x, y, ROOMS[i])) return i;
  }
  return -1; // outside
}

function getDoorForRoom(roomIndex: number): Door | null {
  return DOORS.find(d => d.roomIndex === roomIndex) || null;
}

/**
 * Get navigation direction from source to target, respecting walls.
 * Returns normalized direction vector.
 */
export function getNavigationDirection(
  sx: number, sy: number,
  tx: number, ty: number
): { x: number; y: number } {
  const srcRoom = getRoomAt(sx, sy);
  const tgtRoom = getRoomAt(tx, ty);

  let goalX = tx;
  let goalY = ty;

  if (srcRoom === tgtRoom) {
    // Same room or both outside - go direct
    goalX = tx;
    goalY = ty;
  } else if (srcRoom >= 0) {
    // Source is inside a room, target is outside or different room
    // Navigate to source room's door first
    const door = getDoorForRoom(srcRoom);
    if (door) {
      goalX = door.x;
      goalY = door.y;
    }
  } else if (tgtRoom >= 0) {
    // Source is outside, target is inside a room
    // Navigate to target room's door first
    const door = getDoorForRoom(tgtRoom);
    if (door) {
      const distToDoor = Math.sqrt((sx - door.x) ** 2 + (sy - door.y) ** 2);
      if (distToDoor < 30) {
        // Close to door, go to target directly
        goalX = tx;
        goalY = ty;
      } else {
        goalX = door.x;
        goalY = door.y;
      }
    }
  } else {
    // Both outside but let's check if direct path crosses a room wall
    // Simple approach: just go direct since both are outside
    goalX = tx;
    goalY = ty;
  }

  const dx = goalX - sx;
  const dy = goalY - sy;
  const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  return { x: dx / d, y: dy / d };
}
