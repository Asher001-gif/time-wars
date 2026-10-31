// Warehouse map layout: tidy aligned rows (like a real warehouse) plus a few scattered pieces for atmosphere.
export const WW = 4800, WH = 3200, WT = 30;
export type Rect = { x: number; y: number; w: number; h: number };
export type ObsImg = 'cWide' | 'cTall' | 'cSmall' | 'bStripe' | 'bPlain' | 'bed' | 'chair' | 'table' | 'candle' | 'skull' | 'teddy' | 'plant';
export type Obs = Rect & { img: ObsImg };
export type Decal = Rect & { img: 'help' | 'run' };
export type PlateT = { x: number; y: number; cd: number };

const SZ: Record<ObsImg | 'chest' | 'crate', [number, number]> = {
  cWide: [230, 156], cTall: [132, 196], cSmall: [112, 152], bStripe: [180, 98], bPlain: [184, 98],
  bed: [104, 167], chair: [80, 109], table: [142, 150], plant: [80, 77], teddy: [69, 73], skull: [38, 46], candle: [26, 58],
  chest: [58, 54], crate: [92, 88],
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const hit = (a: Rect, b: Rect, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;

export function buildLayout() {
  const walls: Rect[] = [], doors: { x: number; y: number }[] = [];
  const hw = (x1: number, x2: number, y: number, gaps: number[]) => {
    let cur = x1;
    for (const c of [...gaps].sort((a, b) => a - b)) { if (c - 90 > cur) walls.push({ x: cur, y: y - WT / 2, w: c - 90 - cur, h: WT }); cur = c + 90; doors.push({ x: c, y }); }
    if (x2 > cur) walls.push({ x: cur, y: y - WT / 2, w: x2 - cur, h: WT });
  };
  const vw = (y1: number, y2: number, x: number, gaps: number[]) => {
    let cur = y1;
    for (const c of [...gaps].sort((a, b) => a - b)) { if (c - 90 > cur) walls.push({ x: x - WT / 2, y: cur, w: WT, h: c - 90 - cur }); cur = c + 90; doors.push({ x, y: c }); }
    if (y2 > cur) walls.push({ x: x - WT / 2, y: cur, w: WT, h: y2 - cur });
  };
  // Warehouse building: 3 rooms side by side, backyard to the south
  hw(80, 4720, 80, []); hw(80, 4720, 2100, [880, 2480, 4000]);
  vw(80, 2100, 80, []); vw(80, 2100, 4720, []);
  vw(80, 2100, 1680, [1100]); vw(80, 2100, 3280, [1500]);

  const obs: Obs[] = [], chests: Rect[] = [], crates: Rect[] = [], decals: Decal[] = [], plates: PlateT[] = [];
  const all: Rect[] = [...walls, { x: 680, y: 800, w: 400, h: 400 }, ...doors.map(d => ({ x: d.x - 140, y: d.y - 140, w: 280, h: 280 }))];
  const yardGaps: [number, number][] = [[680, 1080], [2280, 2680], [3800, 4200]]; // keep the doorways onto the backyard open

  type Kind = ObsImg | 'chest' | 'crate';
  const add = (kind: Kind, x: number, y: number): boolean => {
    const [w, h] = SZ[kind]; const r = { x, y, w, h };
    if (all.some(o => hit(r, o))) return false; // never overlaps walls, doorways, spawn or an earlier piece
    all.push(r);
    if (kind === 'chest') chests.push(r); else if (kind === 'crate') crates.push(r); else obs.push({ ...r, img: kind });
    return true;
  };
  // a straight line of pieces; `kind` may be a list that is cycled; `gaps` are x-ranges to leave open
  const line = (kind: Kind | Kind[], x: number, y: number, n: number, step: number, gaps: [number, number][] = []) => {
    for (let i = 0; i < n; i++) {
      const k = Array.isArray(kind) ? kind[i % kind.length] : kind; const px = x + i * step, w = SZ[k][0];
      if (gaps.some(([a, b]) => px < b && px + w > a)) continue;
      add(k, px, y);
    }
  };

  const column = (kind: Kind, x: number, y: number, n: number, step: number) => { for (let i = 0; i < n; i++) add(kind, x, y + i * step); }; // vertical stack

  // ---------- Room A (west): container storage ----------
  line('cWide', 240, 190, 4, 290); line('cWide', 240, 346, 4, 290);          // back-to-back block along the north wall
  line('chest', 260, 560, 5, 190);                                           // chest line in the aisle
  for (const x of [295, 427, 1201, 1333]) column('cTall', x, 700, 3, 196);     // two tall stacks flanking the spawn
  line('cSmall', 230, 1650, 7, 190, [[690, 1090]]);                          // row with an aisle to the south door
  line(['bStripe', 'bPlain'], 160, 1950, 4, 215); line(['bPlain', 'bStripe'], 1120, 1950, 3, 215); // barrier queue lines
  line('crate', 620, 1440, 4, 220);

  // ---------- Room B (middle): long aisles ----------
  line('cTall', 1850, 190, 7, 200);                                          // tall containers along the north wall
  line(['bStripe', 'bPlain'], 1850, 560, 6, 260);                            // barrier lane
  line('chest', 2000, 720, 5, 210);
  line('cWide', 1995, 900, 4, 290); line('cWide', 1995, 1056, 4, 290);       // central back-to-back block
  line('crate', 2000, 1400, 4, 250);
  line('cSmall', 1850, 1650, 8, 175);
  line(['bStripe', 'bPlain'], 1760, 1950, 3, 210); line(['bPlain', 'bStripe'], 2650, 1950, 3, 210);

  // ---------- Room C (east): living quarters ----------
  line('bed', 3450, 100, 5, 240); line('teddy', 3560, 194, 2, 480);          // beds in a row, a teddy between some
  line('chair', 3480, 420, 7, 170);                                          // chairs
  line('table', 3520, 620, 4, 290);                                          // tables
  line('candle', 3500, 870, 7, 180);                                         // candles
  line('chest', 3550, 1020, 5, 220);
  line('crate', 3550, 1300, 4, 250);
  line('cWide', 3450, 1650, 4, 300);
  line(['bStripe', 'bPlain'], 3380, 1950, 3, 210); line(['bPlain', 'bStripe'], 4180, 1950, 3, 200);

  // ---------- Backyard: fenced container yard ----------
  line(['bStripe', 'bPlain'], 120, 2180, 24, 195, yardGaps);                 // fence line north of the yard
  for (const x of [420, 1280, 1840, 3120, 3640, 4480, 4620]) add('chest', x, 2340);
  line('cWide', 200, 2470, 15, 290, yardGaps); line('cWide', 200, 2626, 15, 290, yardGaps); // two back-to-back rows
  line('crate', 1300, 2850, 4, 440);
  line('cTall', 160, 2975, 19, 250);                                         // tall containers along the south edge

  // ---------- a few pieces left scattered for atmosphere ----------
  const place = (w: number, h: number, margin: number, yMax = WH - 140): Rect | null => {
    for (let i = 0; i < 300; i++) {
      const r = { x: rnd(140, WW - 140 - w), y: rnd(140, yMax - h), w, h };
      if (!all.some(o => hit(r, o, margin))) { all.push(r); return r; }
    }
    return null;
  };
  const loose: [ObsImg, number][] = [['cWide', 2], ['cSmall', 2], ['cTall', 1], ['bStripe', 2], ['plant', 4], ['skull', 4], ['teddy', 1]];
  for (const [img, n] of loose) for (let i = 0; i < n; i++) { const r = place(SZ[img][0], SZ[img][1], 90); if (r) obs.push({ ...r, img }); }
  for (let i = 0; i < 8; i++) { const img = i % 2 ? 'run' : 'help'; const [w, h] = img === 'help' ? [144, 127] : [126, 134]; const r = place(w, h, 30, 2060); if (r) decals.push({ ...r, img }); }
  for (let i = 0; i < 18; i++) { const r = place(46, 46, 70); if (r) plates.push({ x: r.x + 23, y: r.y + 23, cd: 0 }); } // hidden floor plates
  return { walls, obs, chests, crates, decals, plates, doors };
}
