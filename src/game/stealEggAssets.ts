import botUrl from '@/assets/char-crew-a.png';

// every egg picture and every animal sprite sheet (5 x 5 frames of 128 px each, animals face LEFT)
const eggUrls = import.meta.glob('@/assets/stealegg/eggs/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const animalUrls = import.meta.glob('@/assets/stealegg/animals/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const SHEET = { cell: 128, cols: 5, frames: 25 };

const base = (p: string) => p.split('/').pop()!.replace('.webp', '');
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
    loading = Promise.all(jobs).then(() => {});
  }
  return loading;
}
