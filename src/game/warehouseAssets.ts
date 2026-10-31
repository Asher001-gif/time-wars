import monster from '@/assets/warehouse/gore-crawler-sheet.png';
import chestOpen from '@/assets/warehouse/chest-open.png';
import chestClosed from '@/assets/warehouse/chest-closed.png';
import cWide from '@/assets/warehouse/container-wide.png';
import cTall from '@/assets/warehouse/container-tall.png';
import cSmall from '@/assets/warehouse/container-small.png';
import crateX from '@/assets/warehouse/crate-x.png';
import bStripe from '@/assets/warehouse/barrier-striped.png';
import bPlain from '@/assets/warehouse/barrier-plain.png';
import robotFront from '@/assets/warehouse/robot-front.png';
import robotBack from '@/assets/warehouse/robot-back.png';
import crack from '@/assets/warehouse/crack.png';
import bedImg from '@/assets/warehouse/bed.png';
import chairImg from '@/assets/warehouse/chair.png';
import tableImg from '@/assets/warehouse/table.png';
import candleImg from '@/assets/warehouse/candle.png';
import skullImg from '@/assets/warehouse/skull.png';
import teddyImg from '@/assets/warehouse/teddy.png';
import plantImg from '@/assets/warehouse/plant.png';
import helpImg from '@/assets/warehouse/help.png';
import runImg from '@/assets/warehouse/run.png';
import battery from '@/assets/warehouse/battery.png';

const urls = { monster, chestOpen, chestClosed, cWide, cTall, cSmall, crateX, bStripe, bPlain, battery, robotFront, robotBack, crack, bed: bedImg, chair: chairImg, table: tableImg, candle: candleImg, skull: skullImg, teddy: teddyImg, plant: plantImg, help: helpImg, run: runImg };
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
