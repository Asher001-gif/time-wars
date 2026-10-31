import ghost from '@/assets/warehouse/ghost-sheet.png';
import chestOpen from '@/assets/warehouse/chest-open.png';
import chestClosed from '@/assets/warehouse/chest-closed.png';
import cWide from '@/assets/warehouse/container-wide.png';
import cTall from '@/assets/warehouse/container-tall.png';
import cSmall from '@/assets/warehouse/container-small.png';
import crateX from '@/assets/warehouse/crate-x.png';
import bStripe from '@/assets/warehouse/barrier-striped.png';
import bPlain from '@/assets/warehouse/barrier-plain.png';
import battery from '@/assets/warehouse/battery.png';

const urls = { ghost, chestOpen, chestClosed, cWide, cTall, cSmall, crateX, bStripe, bPlain, battery };
export type WhKey = keyof typeof urls;
export type WhImages = Record<WhKey, HTMLImageElement>;
const imgs = {} as WhImages;
let p: Promise<WhImages> | null = null;

export function loadWarehouseAssets(): Promise<WhImages> {
  if (p) return p;
  p = Promise.all((Object.keys(urls) as WhKey[]).map(k => new Promise<void>(res => {
    const i = new Image(); i.onload = () => res(); i.onerror = () => res(); i.src = urls[k]; imgs[k] = i;
  }))).then(() => imgs);
  return p;
}
