import refereeImg from '@/assets/referee.webp';

// Keep a module-level reference so the browser never evicts the decoded image.
let refereeCache: HTMLImageElement | null = null;

/** Load + decode the referee image ahead of time so the yellow-card popup shows instantly. */
export function preloadReferee(): Promise<void> {
  if (!refereeCache) {
    refereeCache = new Image();
    refereeCache.src = refereeImg;
  }
  const img = refereeCache;
  return (img.decode ? img.decode() : Promise.resolve()).catch(() => {});
}
