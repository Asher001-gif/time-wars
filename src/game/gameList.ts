import marsIcon from '@/assets/icon-mars-mission.webp';
import footballIcon from '@/assets/icon-football.webp';
import volleyballIcon from '@/assets/icon-volleyball.webp';
import warehouseIcon from '@/assets/warehouse/icon-warehouse.webp';

export type GameId = 'mars' | 'football' | 'volleyball' | 'warehouse';

export interface GameEntry {
  id: GameId;
  name: string;
  icon: string;
}

// To add a new game: drop its icon in src/assets, add a line here,
// then handle its id in `handlePlay` in src/pages/Index.tsx.
export const GAME_LIST: GameEntry[] = [
  { id: 'mars', name: 'Mars Mission', icon: marsIcon },
  { id: 'football', name: 'Football', icon: footballIcon },
  { id: 'volleyball', name: 'Volleyball', icon: volleyballIcon },
  { id: 'warehouse', name: 'Warehouse', icon: warehouseIcon },
];
