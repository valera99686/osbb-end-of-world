import { asset } from './assets';
import { fast } from './sprites';
// Living arenas: tiled floor art, seeded decor, explosive props and ambient
// motes. Every image is optional: a failed load keeps the procedural floor,
// and explosive props fall back to simple drawn shapes, so the mechanic
// works without art (and in Node tests, where nothing is ever drawn).
export type ArenaTheme = 'rust' | 'green' | 'core';
export const ARENA_THEMES: readonly ArenaTheme[] = ['rust', 'green', 'core'];
export const ARENA = { width: 1600, height: 1000, x: 800, y: 500 };
export const BLAST_RADIUS = 110;
// Explosive glow per location: fuel, fertiliser, overheated capacitor.
export const PROP_CHARGE = ['#ff7a3d', '#9dff5a', '#6fd8ff'];
const FLOOR_SCALE = 0.56;
// Softens the floor art under the old location gradient.
const FLOOR_TINT = 0.58;
const PROP_CELL = 128;
const AMBIENT_CAP = [44, 36, 56];
// World width of each atlas cell; cell 0 is the explosive prop.
const PROP_SIZES = [
  [60, 78, 86, 94, 100, 84, 70, 112, 104],
  [62, 96, 92, 100, 92, 96, 86, 112, 86],
  [74, 80, 84, 88, 90, 82, 96, 78, 110],
];
// Puddles, spills and glass lie flat: drawn first and never shadowed.
const FLAT = [[8], [7], [8]];
// The body of each prop, fitted to the silhouette of its picture by
// scripts/prop-bodies.py: circles [x, y, r] as fractions of the picture (from
// its top left, before mirroring), together covering the whole object as it is
// drawn: the house cannot overlap any part of it, walking enemies go round all
// of it and hostile bullets stop on any part of it. Thin parts (wires, rebar,
// glass shards) are not part of the body. Null: what lies flat (puddles, glass,
// pools). The explosive prop (cell 0) has a body too, for the bullets that hit it.
const BODY: readonly (readonly (
  | readonly (readonly [number, number, number])[]
  | null
)[])[] = [
  // rust

  [
    [
      [0.484, 0.656, 0.255],
      [0.484, 0.375, 0.254],
      [0.484, 0.719, 0.251],
    ],

    [
      [0.438, 0.547, 0.317],
      [0.703, 0.703, 0.236],
      [0.312, 0.422, 0.185],
      [0.25, 0.672, 0.141],
    ],

    [
      [0.469, 0.625, 0.313],
      [0.641, 0.734, 0.213],
      [0.391, 0.5, 0.228],
      [0.438, 0.297, 0.062],
    ],

    [
      [0.531, 0.578, 0.319],
      [0.328, 0.422, 0.255],
      [0.578, 0.188, 0.071],
      [0.891, 0.75, 0.068],
      [0.922, 0.453, 0.068],
      [0.312, 0.797, 0.063],
      [0.172, 0.25, 0.067],
      [0.75, 0.703, 0.105],
    ],

    [
      [0.516, 0.453, 0.371],
      [0.359, 0.359, 0.289],
      [0.844, 0.312, 0.107],
      [0.594, 0.531, 0.313],
      [0.188, 0.719, 0.061],
      [0.203, 0.594, 0.089],
    ],

    [
      [0.562, 0.562, 0.314],
      [0.344, 0.609, 0.228],
      [0.719, 0.641, 0.216],
      [0.25, 0.688, 0.158],
      [0.547, 0.266, 0.081],
      [0.359, 0.359, 0.088],
      [0.125, 0.656, 0.063],
    ],

    [
      [0.484, 0.453, 0.384],
      [0.781, 0.609, 0.094],
      [0.781, 0.312, 0.102],
    ],

    [
      [0.266, 0.641, 0.187],
      [0.812, 0.234, 0.129],
      [0.344, 0.422, 0.062],
      [0.156, 0.656, 0.117],
      [0.234, 0.562, 0.131],
      [0.391, 0.625, 0.095],
      [0.734, 0.219, 0.081],
      [0.844, 0.141, 0.062],
      [0.875, 0.297, 0.07],
      [0.297, 0.688, 0.144],
    ],

    null,
  ],

  // green

  [
    [
      [0.469, 0.656, 0.294],
      [0.469, 0.344, 0.257],
      [0.297, 0.5, 0.149],
      [0.641, 0.797, 0.107],
      [0.656, 0.25, 0.086],
      [0.453, 0.719, 0.254],
    ],

    [
      [0.484, 0.531, 0.398],
      [0.594, 0.578, 0.38],
      [0.266, 0.609, 0.245],
      [0.266, 0.266, 0.144],
      [0.828, 0.344, 0.106],
      [0.625, 0.188, 0.078],
    ],

    [
      [0.547, 0.578, 0.282],
      [0.203, 0.469, 0.105],
      [0.453, 0.719, 0.198],
      [0.688, 0.688, 0.177],
      [0.422, 0.344, 0.105],
      [0.297, 0.781, 0.071],
      [0.688, 0.828, 0.07],
      [0.75, 0.703, 0.134],
    ],

    [
      [0.328, 0.703, 0.214],
      [0.859, 0.344, 0.093],
      [0.328, 0.406, 0.088],
      [0.531, 0.172, 0.086],
      [0.422, 0.312, 0.088],
      [0.703, 0.703, 0.075],
      [0.281, 0.641, 0.201],
      [0.547, 0.672, 0.088],
      [0.719, 0.25, 0.067],
      [0.797, 0.25, 0.068],
      [0.469, 0.219, 0.067],
      [0.172, 0.578, 0.098],
    ],

    [
      [0.438, 0.516, 0.356],
      [0.75, 0.734, 0.158],
      [0.438, 0.391, 0.313],
      [0.609, 0.703, 0.216],
      [0.297, 0.656, 0.196],
    ],

    [
      [0.453, 0.594, 0.271],
      [0.625, 0.594, 0.251],
      [0.281, 0.344, 0.124],
      [0.203, 0.609, 0.14],
      [0.125, 0.719, 0.061],
      [0.734, 0.766, 0.094],
      [0.391, 0.5, 0.223],
    ],

    [
      [0.516, 0.5, 0.396],
      [0.375, 0.562, 0.303],
      [0.625, 0.484, 0.312],
    ],

    null,

    [
      [0.453, 0.609, 0.308],
      [0.703, 0.344, 0.2],
      [0.609, 0.188, 0.156],
      [0.688, 0.672, 0.192],
      [0.453, 0.172, 0.088],
      [0.359, 0.422, 0.161],
      [0.156, 0.641, 0.061],
      [0.266, 0.734, 0.114],
    ],
  ],

  // core

  [
    [
      [0.578, 0.531, 0.298],
      [0.344, 0.484, 0.243],
      [0.672, 0.641, 0.27],
      [0.656, 0.234, 0.097],
      [0.5, 0.844, 0.068],
      [0.25, 0.703, 0.068],
    ],

    [
      [0.531, 0.422, 0.322],
      [0.516, 0.656, 0.305],
      [0.516, 0.312, 0.291],
      [0.734, 0.156, 0.064],
    ],

    [
      [0.484, 0.547, 0.314],
      [0.359, 0.594, 0.293],
      [0.656, 0.562, 0.263],
      [0.719, 0.641, 0.212],
      [0.406, 0.828, 0.094],
      [0.719, 0.797, 0.094],
    ],

    [
      [0.484, 0.641, 0.243],
      [0.469, 0.5, 0.193],
      [0.266, 0.719, 0.125],
      [0.656, 0.344, 0.081],
      [0.812, 0.656, 0.075],
      [0.438, 0.156, 0.063],
      [0.328, 0.422, 0.098],
      [0.734, 0.703, 0.089],
      [0.453, 0.203, 0.061],
    ],

    [
      [0.516, 0.438, 0.4],
      [0.609, 0.547, 0.329],
      [0.297, 0.297, 0.219],
      [0.188, 0.656, 0.088],
      [0.781, 0.297, 0.155],
      [0.859, 0.672, 0.088],
    ],

    [
      [0.547, 0.484, 0.364],
      [0.297, 0.625, 0.192],
      [0.828, 0.703, 0.09],
      [0.312, 0.25, 0.075],
      [0.812, 0.266, 0.062],
      [0.312, 0.766, 0.083],
    ],

    [
      [0.391, 0.375, 0.263],
      [0.234, 0.578, 0.15],
      [0.797, 0.406, 0.081],
      [0.75, 0.625, 0.078],
      [0.359, 0.734, 0.081],
      [0.516, 0.406, 0.2],
      [0.516, 0.781, 0.075],
      [0.938, 0.484, 0.074],
      [0.141, 0.484, 0.078],
      [0.188, 0.281, 0.088],
      [0.812, 0.625, 0.061],
      [0.875, 0.453, 0.075],
    ],

    [
      [0.5, 0.141, 0.235],
      [0.531, 0.703, 0.176],
      [0.531, 0.469, 0.166],
      [0.766, 0.75, 0.067],
      [0.328, 0.734, 0.061],
      [0.5, 0.844, 0.079],
      [0.703, 0.188, 0.075],
      [0.344, 0.078, 0.097],
      [0.516, 0.594, 0.161],
      [0.688, 0.75, 0.075],
    ],

    null,
  ],
];
// The house spawns in the centre; decor keeps this ellipse clear.
const CLEAR = { rx: 340, ry: 240 };

export interface ArenaProp {
  // Ground contact point; the sprite stands above it.
  x: number;
  y: number;
  cell: number;
  // Which location's atlas the picture is from (0 to 2).
  theme?: number;
  size: number;
  flip: boolean;
  flat: boolean;
  explosive: boolean;
  // Blocks movement and enemy bullets (see solidCircles).
  solid: boolean;
  hp: number;
  max: number;
  // Hit flash, and a chain-reaction fuse while above zero.
  hit: number;
  fuse: number;
  blown: boolean;
}
export const themeIndex = (chapter: number) =>
  Number.isFinite(chapter) ? Math.max(0, Math.min(2, Math.floor(chapter))) : 0;
export interface Footprint {
  x: number;
  y: number;
  r: number;
}
// The circles of a prop's body in the world: its picture is drawn with the
// ground point 0.86 of the way down it (drawCell), a mirrored prop reads the
// picture from the other side.
function bodyCircles(p: ArenaProp, theme: number): Footprint[] {
  const body = BODY[theme]?.[p.cell];
  if (!body) return [];
  const s = p.size;
  return body.map(([x, y, r]) => ({
    x: p.x + ((p.flip ? 1 - x : x) - 0.5) * s,
    y: p.y + (y - 0.86) * s,
    r: r * s,
  }));
}
// What blocks the house, walking enemies and hostile bullets: the whole body
// of a standing prop. What lies flat and the explosive prop block nothing.
export function solidCircles(p: ArenaProp, chapter: number): Footprint[] {
  return p.cell === 0 ? [] : bodyCircles(p, themeIndex(chapter));
}
// The body of an explosive prop, which the bullets of the house hit anywhere on.
export function propBody(p: ArenaProp): Footprint[] {
  return bodyCircles(p, p.theme ?? 0);
}
// Does a point (a bullet, with its own reach) touch the explosive prop?
export function propTouches(p: ArenaProp, x: number, y: number, reach = 0) {
  return propBody(p).some((c) => Math.hypot(x - c.x, y - c.y) < c.r + reach);
}
// The heart of an explosive prop, where its blast goes off and where a bullet
// is aimed: the middle of its biggest circle.
export function propTarget(p: ArenaProp) {
  const body = propBody(p);
  if (!body.length) return { x: p.x, y: p.y - p.size * 0.28, r: p.size * 0.36 };
  const core = body.reduce((a, c) => (c.r > a.r ? c : a));
  return { x: core.x, y: core.y, r: core.r };
}

// Same mulberry32 as model.seeded; duplicated to keep this module leaf-level.
function stream(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 14-20 props per arena, 2-4 of them explosive. Everything that stands is
// solid; only the explosive ones and what lies flat can be walked over.
export function generateProps(seed: number, chapter: number): ArenaProp[] {
  const theme = themeIndex(chapter);
  const rng = stream((seed ^ 0x2c1b3c6d) + theme * 7919);
  const total = 14 + Math.floor(rng() * 7),
    explosives = 2 + Math.floor(rng() * 3);
  const props: ArenaProp[] = [];
  let flats = 0;
  for (let attempt = 0; props.length < total && attempt < 800; attempt++) {
    const explosive = props.length < explosives;
    const cell = explosive ? 0 : 1 + Math.floor(rng() * 8);
    const flat = FLAT[theme].includes(cell);
    const size = PROP_SIZES[theme][cell] * (0.86 + rng() * 0.24);
    let x: number, y: number;
    if (explosive) {
      // Mid ring, where enemies gather around the house.
      const a = rng() * Math.PI * 2,
        k = 1.05 + rng() * 0.7;
      x = ARENA.x + Math.cos(a) * CLEAR.rx * k;
      y = ARENA.y + Math.sin(a) * CLEAR.ry * k;
    } else {
      x = 90 + rng() * 1420;
      y = 100 + rng() * 820;
    }
    const flip = rng() < 0.5;
    if (flat && flats >= 2) continue;
    if (x < 80 || x > 1520 || y < 90 || y > 940) continue;
    const ex = (x - ARENA.x) / CLEAR.rx,
      ey = (y - ARENA.y) / CLEAR.ry;
    if (ex * ex + ey * ey < 1) continue;
    if (
      props.some(
        (p) => Math.hypot(p.x - x, p.y - y) < (p.size + size) * 0.5 + 24,
      )
    )
      continue;
    const max = explosive ? 32 + theme * 28 : 0;
    const solid = !explosive && !flat && !!BODY[theme][cell];
    props.push({
      x: Math.round(x),
      y: Math.round(y),
      cell,
      theme,
      size: Math.round(size),
      flip,
      flat,
      explosive,
      solid,
      hp: max,
      max,
      hit: 0,
      fuse: 0,
      blown: false,
    });
    if (flat) flats++;
  }
  return props.sort((a, b) => a.y - b.y);
}

type Cell = { body: HTMLCanvasElement; flash: HTMLCanvasElement | null };
class ArenaArt {
  floors: (HTMLImageElement | null)[] = [null, null, null];
  props: (Cell[] | null)[] = [null, null, null];
  private patterns = new WeakMap<
    CanvasRenderingContext2D,
    (CanvasPattern | null)[]
  >();
  constructor(first = 0) {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return;
    // One picture at a time with a short pause, the current location first:
    // six decodes at once froze the first seconds on slow phones.
    const order = ARENA_THEMES.map((_, i) => i).sort(
      (a, b) => Number(b === first) - Number(a === first) || a - b,
    );
    void (async () => {
      for (const i of order) {
        const theme = ARENA_THEMES[i];
        await this.image(
          asset(`art/floor-${theme}.webp`),
          (img) => (this.floors[i] = img),
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 120));
        await this.image(asset(`art/props-${theme}.webp`), (img) => {
          this.props[i] = cut(img);
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 120));
      }
    })();
  }
  private image(
    url: string,
    done: (img: HTMLImageElement) => void,
  ): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (img.naturalWidth) {
          try {
            done(img);
          } catch {}
        }
        resolve();
      };
      // Missing art keeps the procedural look.
      img.onerror = () => resolve();
      img.src = url;
    });
  }
  pattern(c: CanvasRenderingContext2D, theme: number) {
    const img = this.floors[theme];
    if (!img) return null;
    let list = this.patterns.get(c);
    if (!list) this.patterns.set(c, (list = []));
    if (list[theme] === undefined) {
      try {
        list[theme] = c.createPattern(img, 'repeat');
      } catch {
        list[theme] = null;
      }
    }
    return list[theme];
  }
}
// Atlas cells, row-major, cached small; only the explosive gets a flash.
function cut(img: HTMLImageElement): Cell[] | null {
  const w = img.naturalWidth / 3,
    h = img.naturalHeight / 3;
  const cells: Cell[] = [];
  for (let k = 0; k < 9; k++) {
    const body = document.createElement('canvas');
    body.width = body.height = PROP_CELL;
    const g = body.getContext('2d');
    if (!g) return null;
    g.imageSmoothingQuality = 'high';
    g.drawImage(
      img,
      (k % 3) * w,
      Math.floor(k / 3) * h,
      w,
      h,
      0,
      0,
      PROP_CELL,
      PROP_CELL,
    );
    let flash: HTMLCanvasElement | null = null;
    if (k === 0) {
      flash = document.createElement('canvas');
      flash.width = flash.height = PROP_CELL;
      const m = flash.getContext('2d');
      if (m) {
        m.drawImage(body, 0, 0);
        m.globalCompositeOperation = 'source-in';
        m.fillStyle = '#fff2d7';
        m.fillRect(0, 0, PROP_CELL, PROP_CELL);
      } else flash = null;
    }
    cells.push({ body, flash });
  }
  return cells;
}
let art: ArenaArt | undefined;
export function preloadArenaArt(chapter = 0) {
  art ??= new ArenaArt(chapter);
}

// Soft radial sprites (shadows, the house light), one per colour.
const blobs = new Map<string, HTMLCanvasElement | null>();
function blob(color: string) {
  const cached = blobs.get(color);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') return null;
  let sprite: HTMLCanvasElement | null = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  const g = sprite.getContext('2d');
  if (g) {
    const fill = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    fill.addColorStop(0, color);
    fill.addColorStop(1, color + '00');
    g.fillStyle = fill;
    g.fillRect(0, 0, 64, 64);
  } else sprite = null;
  blobs.set(color, sprite);
  return sprite;
}

// Tiled floor art under the location gradient; false keeps the old floor.
export function drawArenaFloor(
  c: CanvasRenderingContext2D,
  chapter: number,
  tint: readonly [string, string],
) {
  const pattern = art?.pattern(c, themeIndex(chapter));
  if (!pattern) return false;
  c.save();
  c.scale(FLOOR_SCALE, FLOOR_SCALE);
  c.fillStyle = pattern;
  c.fillRect(0, 0, ARENA.width / FLOOR_SCALE, ARENA.height / FLOOR_SCALE);
  c.restore();
  const bg = c.createLinearGradient(0, 0, ARENA.width, ARENA.height);
  bg.addColorStop(0, tint[0]);
  bg.addColorStop(1, tint[1]);
  c.globalAlpha = FLOOR_TINT;
  c.fillStyle = bg;
  c.fillRect(0, 0, ARENA.width, ARENA.height);
  c.globalAlpha = 1;
  return true;
}
export function drawArenaLight(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  radius = 330,
) {
  const sprite = blob(color);
  if (!sprite) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 0.11;
  c.drawImage(
    fast(sprite),
    x - radius,
    y - radius * 0.8,
    radius * 2,
    radius * 1.6,
  );
  c.restore();
}
function shadow(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const sprite = blob('#000000');
  if (!sprite) return;
  c.globalAlpha = 0.55;
  c.drawImage(fast(sprite), x - r, y - r * 0.36, r * 2, r * 0.72);
  c.globalAlpha = 1;
}

// One prop: its sprite, with its soft shadow if it stands, or its charged
// glow and scorch if it is the explosive one.
export function drawProp(
  c: CanvasRenderingContext2D,
  p: ArenaProp,
  chapter: number,
  time: number,
  colorblind = false,
) {
  const theme = themeIndex(chapter),
    cells = art?.props[theme];
  if (p.explosive) {
    drawExplosive(c, p, theme, time, cells?.[0] ?? null, colorblind);
    return;
  }
  const cell = cells?.[p.cell];
  if (!cell) return;
  if (!p.flat) shadow(c, p.x, p.y, p.size * 0.44);
  drawCell(c, cell.body, p, p.flat);
}
// The props that lie flat (flat = true) or the ones that stand (flat = false),
// in the order given. The flat ones go under everything; the standing ones are
// drawn by the fight among the house and the enemies, by depth (drawProp).
export function drawProps(
  c: CanvasRenderingContext2D,
  props: ArenaProp[],
  chapter: number,
  time: number,
  flat: boolean,
  colorblind = false,
  visible?: (x: number, y: number, margin?: number) => boolean,
) {
  for (const p of props) {
    // Everything a prop draws (sprite, decal, shadow, scorch) lies within
    // one size of its ground point.
    if (p.flat !== flat || (visible && !visible(p.x, p.y, p.size))) continue;
    drawProp(c, p, chapter, time, colorblind);
  }
}
function drawCell(
  c: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  p: ArenaProp,
  flat: boolean,
  dx = 0,
) {
  const s = p.size;
  c.save();
  c.translate(p.x + dx, flat ? p.y : p.y - s * 0.36);
  if (p.flip) c.scale(-1, 1);
  c.drawImage(fast(image), -s / 2, -s / 2, s, s);
  c.restore();
}
function drawExplosive(
  c: CanvasRenderingContext2D,
  p: ArenaProp,
  theme: number,
  time: number,
  cell: Cell | null,
  colorblind: boolean,
) {
  const s = p.size;
  if (p.blown) {
    const scorch = blob('#050607');
    if (!scorch) return;
    c.globalAlpha = 0.7;
    c.drawImage(fast(scorch), p.x - s * 0.75, p.y - s * 0.3, s * 1.5, s * 0.6);
    c.globalAlpha = 1;
    return;
  }
  // Charged glow at the base; it pulses faster once damaged or primed.
  const hurt = p.hp < p.max || p.fuse > 0,
    color = colorblind ? '#5fe0ff' : PROP_CHARGE[theme],
    beat = 0.5 + 0.5 * Math.sin(time * (hurt ? 11 : 3.2) + p.x * 0.01);
  shadow(c, p.x, p.y, s * 0.46);
  c.save();
  c.strokeStyle = color;
  c.lineWidth = colorblind ? 2.5 : 2;
  c.globalAlpha = 0.28 + beat * (hurt ? 0.5 : 0.3);
  c.setLineDash(colorblind ? [5, 4] : []);
  c.beginPath();
  c.ellipse(p.x, p.y, s * 0.5, s * 0.18, 0, 0, Math.PI * 2);
  c.stroke();
  c.restore();
  const jitter = p.hit > 0 ? Math.sin(time * 90) * 1.6 : 0;
  if (cell) {
    drawCell(c, cell.body, p, false, jitter);
    if (p.hit > 0 && cell.flash) {
      c.globalAlpha = Math.min(0.85, p.hit / 0.1);
      drawCell(c, cell.flash, p, false, jitter);
      c.globalAlpha = 1;
    }
    return;
  }
  c.save();
  c.translate(p.x + jitter, p.y);
  drawFallbackExplosive(c, theme, s, p.hit > 0, beat);
  c.restore();
}
// Drawn stand-ins for missing art: barrel, canister, capacitor.
function drawFallbackExplosive(
  c: CanvasRenderingContext2D,
  theme: number,
  s: number,
  lit: boolean,
  beat: number,
) {
  const w = s * 0.46,
    h = s * 0.62;
  if (theme === 2) {
    const len = s * 0.8,
      r = s * 0.2;
    c.fillStyle = lit ? '#f4f0e6' : '#2c3548';
    c.fillRect(-len / 2, -r * 2 - 4, len, r * 2);
    c.fillStyle = PROP_CHARGE[2];
    c.globalAlpha = 0.55 + beat * 0.45;
    c.fillRect(-len * 0.28, -r * 1.7 - 4, len * 0.56, r * 1.4);
    c.globalAlpha = 1;
    c.fillStyle = '#ff7a3d';
    c.fillRect(-len / 2 - 5, -r * 2 - 2, 7, r * 2 - 4);
    c.fillRect(len / 2 - 2, -r * 2 - 2, 7, r * 2 - 4);
    return;
  }
  const body = lit ? '#f4f0e6' : theme === 0 ? '#8e2f22' : '#4d5b45';
  c.fillStyle = '#0a1015';
  c.fillRect(-w / 2 - 2, -h - 2, w + 4, h + 4);
  c.fillStyle = body;
  c.fillRect(-w / 2, -h, w, h);
  c.beginPath();
  c.ellipse(0, -h, w / 2, w * 0.2, 0, 0, Math.PI * 2);
  c.fillStyle = theme === 0 ? '#b0493a' : '#65755b';
  c.fill();
  if (theme === 0) {
    c.fillStyle = '#e0b42c';
    c.fillRect(-w / 2, -h * 0.58, w, h * 0.2);
    c.fillStyle = '#1d1a17';
    for (let i = 0; i < 3; i++)
      c.fillRect(-w / 2 + (i + 0.2) * (w / 3), -h * 0.58, w / 7, h * 0.2);
  } else {
    c.fillStyle = PROP_CHARGE[1];
    c.globalAlpha = 0.55 + beat * 0.45;
    c.fillRect(-w * 0.28, -h * 0.8, w * 0.56, h * 0.55);
    c.globalAlpha = 1;
  }
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  phase: number;
}
export interface ArenaView {
  x: number;
  y: number;
  w: number;
  h: number;
}
// Location ambience in view: rust dust, greenhouse spores, core data rain.
// Steps of fade the ambient motes are drawn in (one path each).
const MOTE_STEPS = 4;
export class ArenaAmbient {
  motes: Mote[] = [];
  theme: number;
  time = 0;
  private rng: () => number;
  constructor(chapter: number, seed: number) {
    this.theme = themeIndex(chapter);
    this.rng = stream((seed ^ 0x9e3779b9) + 101);
  }
  // A weak screen keeps a third of the motes (pace.ts Pacer.lean).
  lean = false;
  update(dt: number, view: ArenaView) {
    if (!(dt > 0)) return;
    this.time += dt;
    const left = view.x - view.w / 2 - 40,
      top = view.y - view.h / 2 - 40,
      right = left + view.w + 80,
      bottom = top + view.h + 80;
    for (const m of this.motes) {
      m.life -= dt;
      const sway = Math.sin(this.time * 1.3 + m.phase);
      m.x += (m.vx + (this.theme === 2 ? 0 : sway * 6)) * dt;
      m.y += m.vy * dt;
    }
    this.motes = this.motes.filter(
      (m) =>
        m.life > 0 && m.x > left && m.x < right && m.y > top && m.y < bottom,
    );
    const cap = Math.round(AMBIENT_CAP[this.theme] / (this.lean ? 3 : 1));
    // Refill a few per frame so motes never appear in one burst.
    for (let n = 0; n < 3 && this.motes.length < cap; n++) {
      const r = this.rng;
      const m: Mote = {
        x: left + r() * (right - left),
        y: top + r() * (bottom - top),
        vx: 0,
        vy: 0,
        life: 0,
        max: 0,
        size: 0,
        phase: r() * 6.3,
      };
      if (this.theme === 0) {
        m.vx = 8 + r() * 16;
        m.vy = (r() - 0.5) * 8;
        m.max = 4 + r() * 4;
        m.size = 1 + r() * 1.5;
      } else if (this.theme === 1) {
        m.vx = (r() - 0.5) * 10;
        m.vy = -6 - r() * 12;
        m.max = 5 + r() * 4;
        m.size = 1.4 + r() * 1.8;
      } else {
        m.vy = 80 + r() * 90;
        m.max = 1.2 + r() * 1.4;
        m.size = 2 + Math.floor(r() * 2);
        m.x = Math.round(m.x / 6) * 6;
      }
      m.life = m.max * (0.4 + r() * 0.6);
      this.motes.push(m);
    }
  }
  draw(c: CanvasRenderingContext2D) {
    if (!this.motes.length) return;
    const theme = this.theme;
    c.fillStyle = ['#d9b48a', '#d8f59a', '#7fe8ff'][theme];
    // The motes are a few pixels across: they go in a few steps of fade, one
    // path per step, so a phone draws a handful of shapes instead of a hundred
    // (every fill is sent to the GPU one by one, and that is what costs).
    const steps: Mote[][] = Array.from({ length: MOTE_STEPS }, () => []);
    for (const m of this.motes) {
      const k = m.life / m.max,
        fade = Math.min(1, k * 4, (1 - k) * 4 + 0.15);
      steps[Math.min(MOTE_STEPS - 1, Math.floor(fade * MOTE_STEPS))].push(m);
    }
    for (let n = 0; n < MOTE_STEPS; n++) {
      const list = steps[n];
      if (!list.length) continue;
      const fade = (n + 0.5) / MOTE_STEPS;
      if (theme === 2) {
        // A falling pixel with a short fading trail.
        for (let i = 0; i < 3; i++) {
          c.globalAlpha = fade * (0.42 - i * 0.13);
          c.beginPath();
          for (const m of list)
            c.rect(m.x, m.y - i * m.size * 2.4, m.size, m.size);
          c.fill();
        }
        continue;
      }
      c.globalAlpha = fade * (theme === 0 ? 0.28 : 0.34);
      c.beginPath();
      for (const m of list) {
        c.moveTo(m.x + m.size, m.y);
        c.arc(m.x, m.y, m.size, 0, Math.PI * 2);
      }
      c.fill();
      if (theme === 1) {
        c.globalAlpha = fade * 0.07;
        c.beginPath();
        for (const m of list) {
          c.moveTo(m.x + m.size * 3, m.y);
          c.arc(m.x, m.y, m.size * 3, 0, Math.PI * 2);
        }
        c.fill();
      }
    }
    c.globalAlpha = 1;
  }
}
