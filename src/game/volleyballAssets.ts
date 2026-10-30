import oceanUrl from '@/assets/volleyball/ocean-bg.webp';
import cloudsUrl from '@/assets/volleyball/clouds.webp';
import fireballUrl from '@/assets/volleyball/fireball.webp';

/** Fireball atlas: 18 frames, 6 columns x 3 rows, each frame FIRE_W x FIRE_H. The fireball head is centred at (FIRE_CX, FIRE_CY), tail points left. */
export const FIRE = { frames: 18, cols: 6, w: 340, h: 170, cx: 200, cy: 85 };

/** Cloud sprites inside clouds.webp: [x, y, w, h] */
export const CLOUD_RECTS: [number, number, number, number][] = [
  [0, 0, 560, 249], [478, 253, 560, 142], [0, 425, 405, 140], [409, 425, 560, 140],
  [0, 569, 470, 125], [0, 698, 266, 97], [270, 698, 381, 81], [655, 698, 302, 75],
  [0, 799, 303, 74], [307, 799, 170, 65], [481, 799, 247, 63],
];

interface VolleyballImages { bg: HTMLImageElement; clouds: HTMLImageElement; fire: HTMLImageElement; ready: boolean }

// Module-level references so the browser never evicts the decoded images.
const images: VolleyballImages = { bg: new Image(), clouds: new Image(), fire: new Image(), ready: false };
let loading: Promise<void> | null = null;

/** Load + decode the background and cloud sprites. Safe to call many times. */
export function preloadVolleyballAssets(): Promise<void> {
  if (!loading) {
    const load = (img: HTMLImageElement, src: string) => new Promise<void>(resolve => {
      img.onload = () => resolve();
      img.onerror = () => resolve(); // game still works with the gradient fallback
      img.src = src;
    }).then(() => (img.decode ? img.decode().catch(() => {}) : undefined));
    loading = Promise.all([load(images.bg, oceanUrl), load(images.clouds, cloudsUrl), load(images.fire, fireballUrl)]).then(() => {
      images.ready = images.bg.naturalWidth > 0 && images.clouds.naturalWidth > 0;
    });
  }
  return loading;
}

export const volleyballImages = images;
