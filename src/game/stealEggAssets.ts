import botUrl from '@/assets/char-crew-a.png';

// every egg picture and every animal sprite sheet (5 x 5 frames of 128 px each, animals face LEFT)
const eggUrls = import.meta.glob('@/assets/stealegg/eggs/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const animalUrls = import.meta.glob('@/assets/stealegg/animals/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

// Hell monsters: one horizontal strip per animation (idle / walk / attack). cell = frame size, bbox = the body inside the idle frame.
const monsterUrls = import.meta.glob('@/assets/stealegg/monsters/*.{png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const MONSTER: Record<string, { cell: [number, number]; bbox: [number, number, number, number]; frames: Record<string, number>; cols?: Record<string, number>; facesLeft: boolean; fps: Record<string, number> }> = {
  fireworm:     { cell: [90, 90],   bbox: [17, 13, 69, 58],   frames: { idle: 9, walk: 9, attack: 16 }, facesLeft: false, fps: { idle: 9, walk: 12, attack: 18 } },
  skullwolf:    { cell: [64, 64],   bbox: [2, 39, 63, 64],    frames: { idle: 6, attack: 5 },          facesLeft: true,  fps: { idle: 8, attack: 14 } },
  demon:        { cell: [100, 100], bbox: [43, 38, 63, 59],   frames: { idle: 6, walk: 8, attack: 7 },  facesLeft: true,  fps: { idle: 8, walk: 12, attack: 14 } },
  bloodmonster: { cell: [100, 100], bbox: [42, 42, 62, 58],   frames: { idle: 6, walk: 8, attack: 8 },  facesLeft: true,  fps: { idle: 8, walk: 12, attack: 14 } },
  // Fire Dragon: 5x5 grids (idle, walk) and an 8x8 grid (run), 192 px cells, faces right
  dragon:       { cell: [192, 192], bbox: [37, 50, 157, 141], frames: { idle: 25, walk: 25, run: 64 }, cols: { idle: 5, walk: 5, run: 8 }, facesLeft: false, fps: { idle: 10, walk: 14, run: 24 } },
  gollux:       { cell: [160, 128], bbox: [51, 68, 116, 128], frames: { idle: 5, walk: 8, attack: 17 }, facesLeft: true,  fps: { idle: 6, walk: 10, attack: 20 } },
};
export const monsterImgs: Record<string, HTMLImageElement> = {};   // key like "demon_walk"

export const SHEET = { cell: 128, cols: 5, frames: 25 };

const base = (p: string) => p.split('/').pop()!.replace('.webp', '');   // (png names keep the extension, stripped where used)
export const eggImgs: Record<string, HTMLImageElement> = {};
export const sheetImgs: Record<string, HTMLImageElement> = {};   // key like "dog_run", "chicken_idle"
export const botImg = new Image();

let loading: Promise<void> | null = null;

/** Load + decode every picture. Safe to call many times; a missing picture never blocks the game. */
export function preloadStealEgg(): Promise<void> {
  if (!loading) {
    const load = (img: HTMLImageElement, src: string) => new Promise<void>(resolve => {
      img.onload = () => resolve(); img.onerror = () => resolve(); img.src = src;
    }).then(() => (img.decode ? img.decode().catch(() => {}) : undefined));
    const jobs: Promise<void>[] = [load(botImg, botUrl)];
    for (const [p, u] of Object.entries(eggUrls)) { const i = new Image(); eggImgs[base(p)] = i; jobs.push(load(i, u)); }
    for (const [p, u] of Object.entries(animalUrls)) { const i = new Image(); sheetImgs[base(p)] = i; jobs.push(load(i, u)); }
    for (const [p, u] of Object.entries(monsterUrls)) { const i = new Image(); monsterImgs[base(p).replace(/\.(png|webp)$/, '')] = i; jobs.push(load(i, u)); }
    loading = Promise.all(jobs).then(() => {});
  }
  return loading;
}

/** how many egg designs exist for a species (files are named like "chicken_0", "chicken_1", ...) */
export function eggVariantCount(sp: string): number {
  let n = 0;
  while (eggImgs[`${sp}_${n}`]) n++;
  return Math.max(1, n);
}
