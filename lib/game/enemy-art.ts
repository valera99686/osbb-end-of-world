import { asset } from './assets';
import { ENEMY_DEFS, campaignBoss } from './encounters';
import { MINIBOSS_TYPE, minibossFor } from './minibosses';
import { preloadArenaArt } from './arena';
import type { Enemy } from './engine';

export const ENEMY_PALETTES = [
  '#dc9865',
  '#82c8f0',
  '#b895d6',
  '#91cd84',
  '#79d6db',
  '#e197c4',
];
const SIZES = [52, 54, 82, 58, 58, 60];
type Sprite = {
  body: HTMLCanvasElement;
  flash: HTMLCanvasElement;
  // Solid-colour silhouettes for swift afterimages.
  tints?: Map<string, HTMLCanvasElement>;
  // Affix halo plus rim, pre-rendered once per colour.
  outlines?: Map<string, HTMLCanvasElement>;
};
// Elite affix look passed by the engine: outline colour and badge glyph.
export interface AffixLook {
  id: string;
  color: string;
}
// Okabe-Ito hues for the colour-blind setting: the medic green, volatile
// orange and magnetic yellow otherwise merge under red-green deficiency.
const AFFIX_COLORBLIND: Record<string, string> = {
  armored: '#e6e6e6',
  swift: '#56b4e9',
  volatile: '#d55e00',
  medic: '#009e73',
  splitter: '#cc79a7',
  magnetic: '#f0e442',
};
export function affixLook(affix: AffixLook, colorblind: boolean): AffixLook {
  const color = colorblind ? AFFIX_COLORBLIND[affix.id] : undefined;
  return color ? { id: affix.id, color } : affix;
}
const OUTLINE = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, 0.7],
  [0.7, -0.7],
  [-0.7, -0.7],
];

// All animation is driven by simulation time. Rendering never consumes the
// combat RNG, and the two atlases are decoded only once across expeditions.
class EnemyAtlas {
  enemies: Sprite[] = [];
  bosses: Sprite[] = [];
  regions: Sprite[][] = [];
  constructor() {
    if (typeof Image === 'undefined') return;
    this.load(asset('art/enemies-v1.webp'), false);
    this.load(asset('art/bosses-v1.webp'), true);
    this.load(asset('art/enemies-rust-v2.webp'), false, 0);
    this.load(asset('art/enemies-green-v2.webp'), false, 1);
    // If missing, location 3 keeps the v1 fallback sprites.
    this.load(asset('art/enemies-core-v2.webp'), false, 2);
  }
  private load(url: string, boss: boolean, location?: number) {
    const atlas = new Image();
    atlas.decoding = 'async';
    atlas.onload = () => {
      const source = document.createElement('canvas');
      source.width = atlas.naturalWidth;
      source.height = atlas.naturalHeight;
      const sourceContext = source.getContext('2d', {
        willReadFrequently: true,
      });
      if (!sourceContext) return;
      sourceContext.drawImage(atlas, 0, 0);
      const pixels = sourceContext.getImageData(
        0,
        0,
        source.width,
        source.height,
      );
      // Atlas export can use a green matte instead of alpha. Key it once at
      // original resolution, before making the small cached game sprites.
      const data = pixels.data;
      if (data[1] > 180 && data[0] < 80 && data[2] < 80 && data[3] > 0) {
        for (let p = 0; p < data.length; p += 4) {
          const other = Math.max(data[p], data[p + 2]);
          const excess = data[p + 1] - other;
          if (data[p + 1] > 110 && excess > 35) {
            const key = Math.min(1, (excess - 35) / 90);
            data[p + 3] = Math.round(data[p + 3] * (1 - key));
            data[p + 1] = Math.min(data[p + 1], other + 20);
          }
        }
        sourceContext.putImageData(pixels, 0, 0);
      }
      const frames: Sprite[] = [];
      const cellWidth = atlas.naturalWidth / 3,
        cellHeight = atlas.naturalHeight / (location === undefined ? 2 : 3);
      for (
        let index = 0;
        index < (location !== undefined ? 9 : boss ? 5 : 6);
        index++
      ) {
        const size = boss ? 256 : location !== undefined ? 160 : 112;
        const body = document.createElement('canvas');
        body.width = body.height = size;
        const context = body.getContext('2d');
        if (!context) return;
        context.imageSmoothingQuality = 'high';
        context.drawImage(
          source,
          (index % 3) * cellWidth,
          Math.floor(index / 3) * cellHeight,
          cellWidth,
          cellHeight,
          0,
          0,
          size,
          size,
        );
        const flash = document.createElement('canvas');
        flash.width = flash.height = size;
        const mask = flash.getContext('2d');
        if (!mask) return;
        mask.drawImage(body, 0, 0);
        mask.globalCompositeOperation = 'source-in';
        mask.fillStyle = '#fff2d7';
        mask.fillRect(0, 0, size, size);
        frames.push({ body, flash });
      }
      if (location !== undefined) this.regions[location] = frames;
      else if (boss) this.bosses = frames;
      else this.enemies = frames;
    };
    atlas.onerror = () => {};
    atlas.src = url;
  }
}
let atlas: EnemyAtlas | undefined;
export function preloadEnemyArt() {
  atlas ??= new EnemyAtlas();
  // Floors and props share the warm-up the UI already triggers.
  preloadArenaArt();
}
function silhouette(sprite: Sprite, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = sprite.body.width;
  canvas.height = sprite.body.height;
  const g = canvas.getContext('2d');
  if (g) {
    g.drawImage(sprite.body, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}
function tinted(sprite: Sprite, color: string) {
  sprite.tints ??= new Map();
  let canvas = sprite.tints.get(color);
  if (!canvas) sprite.tints.set(color, (canvas = silhouette(sprite, color)));
  return canvas;
}
// Halo (the silhouette 16% larger, 40% alpha) under an eight-way rim, in
// sprite pixels with `pad` spare on every side: one drawImage per frame.
function outlined(sprite: Sprite, color: string) {
  sprite.outlines ??= new Map();
  let canvas = sprite.outlines.get(color);
  if (canvas) return canvas;
  const n = sprite.body.width,
    rim = n * 0.04,
    pad = Math.ceil(n * 0.09 + rim),
    tint = sprite.tints?.get(color) ?? silhouette(sprite, color);
  canvas = document.createElement('canvas');
  canvas.width = canvas.height = n + pad * 2;
  const g = canvas.getContext('2d');
  if (g) {
    g.globalAlpha = 0.4;
    g.drawImage(tint, pad - n * 0.08, pad - n * 0.076, n * 1.16, n * 1.16);
    g.globalAlpha = 1;
    for (const [dx, dy] of OUTLINE)
      g.drawImage(tint, pad + dx * rim, pad + dy * rim);
  }
  sprite.outlines.set(color, canvas);
  return canvas;
}
// Definition, drawn size and cached sprite, shared by bodies and ghosts.
function look(enemy: Enemy, chapter: number, variant: number, mini: number) {
  const boss = enemy.type === 99;
  const isMini = enemy.type === MINIBOSS_TYPE;
  const def = boss
    ? campaignBoss(chapter, variant)
    : isMini
      ? minibossFor(chapter, mini)
      : ENEMY_DEFS[enemy.type];
  const size =
    (boss
      ? campaignBoss(chapter, variant).size
      : isMini
        ? minibossFor(chapter, mini).size
        : SIZES[def.artIndex] * ENEMY_DEFS[enemy.type].scale) *
    (enemy.scale ?? 1);
  const sprite = boss
    ? atlas?.bosses[def.artIndex]
    : (atlas?.regions[def.location]?.[
        isMini
          ? 6 + mini
          : enemy.type < 9
            ? enemy.type % 3
            : 3 + ((enemy.type - 9) % 3)
      ] ?? atlas?.enemies[def.artIndex]);
  return { def, size, sprite };
}
// How far drawEnemy can paint from the enemy's centre: the sprite (with
// recoil and the death pop), health bar, affix badge, rim and plates, and
// the windup aim line. Off-screen culling uses it as the margin.
export function enemyReach(
  enemy: Enemy,
  chapter: number,
  variant = 0,
  miniVariant = 0,
) {
  const { size } = look(enemy, chapter, variant, miniVariant);
  return Math.max(size * 0.72 + enemy.r * 0.13 + 16, enemy.r * 1.7 + 8, 96);
}
// Swift afterimage: a solid silhouette at an earlier position.
export function drawEnemyGhost(
  c: CanvasRenderingContext2D,
  enemy: Enemy,
  chapter: number,
  x: number,
  y: number,
  alpha: number,
  color: string,
  variant = 0,
  miniVariant = 0,
) {
  const { size, sprite } = look(enemy, chapter, variant, miniVariant);
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y - enemy.r * 0.13);
  if (sprite) {
    c.scale(enemy.facing, 1);
    c.drawImage(tinted(sprite, color), -size / 2, -size * 0.62, size, size);
  } else ellipse(c, 0, 0, enemy.r * 0.8, enemy.r, color);
  c.restore();
}
// Small badge above the health bar, one shape per affix.
function drawGlyph(
  c: CanvasRenderingContext2D,
  id: string,
  color: string,
  y: number,
) {
  c.save();
  c.translate(0, y);
  c.fillStyle = '#081016e0';
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(0, 0, 7.5, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = color;
  c.lineWidth = 1.8;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  switch (id) {
    case 'armored':
      c.moveTo(0, -4.5);
      c.lineTo(4, -2.6);
      c.lineTo(3.2, 1.6);
      c.lineTo(0, 4.5);
      c.lineTo(-3.2, 1.6);
      c.lineTo(-4, -2.6);
      c.closePath();
      c.fill();
      break;
    case 'swift':
      c.moveTo(-4, -3.5);
      c.lineTo(-1, 0);
      c.lineTo(-4, 3.5);
      c.moveTo(0.5, -3.5);
      c.lineTo(3.5, 0);
      c.lineTo(0.5, 3.5);
      c.stroke();
      break;
    case 'volatile':
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6,
          r = i % 2 ? 2 : 4.6;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      break;
    case 'medic':
      c.fillRect(-1.4, -4.2, 2.8, 8.4);
      c.fillRect(-4.2, -1.4, 8.4, 2.8);
      break;
    case 'splitter':
      c.arc(-2.2, 0, 2.3, 0, Math.PI * 2);
      c.moveTo(4.5, 0);
      c.arc(2.2, 0, 2.3, 0, Math.PI * 2);
      c.fill();
      break;
    default:
      // Magnet: a horseshoe with pale tips.
      c.arc(0, 0.2, 3.2, 0, Math.PI);
      c.moveTo(-3.2, 0.2);
      c.lineTo(-3.2, -3.6);
      c.moveTo(3.2, 0.2);
      c.lineTo(3.2, -3.6);
      c.stroke();
      c.fillStyle = '#f3ecdf';
      c.fillRect(-4.1, -4.4, 1.8, 1.6);
      c.fillRect(2.3, -4.4, 1.8, 1.6);
  }
  c.restore();
}

function ellipse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}

function fallback(
  c: CanvasRenderingContext2D,
  enemy: Enemy,
  color: string,
  clock: number,
) {
  // A small mechanical silhouette also keeps play readable if an asset is
  // still loading or unavailable. The illustrated atlas replaces it on load.
  const radius = enemy.r;
  c.lineCap = 'round';
  for (let side = -1; side <= 1; side += 2) {
    for (let leg = 0; leg < 3; leg++) {
      c.strokeStyle = '#09131b';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(side * radius * 0.45, (leg - 1) * radius * 0.4);
      c.lineTo(side * radius * 1.1, (leg - 1) * radius * 0.7);
      c.lineTo(
        side * radius * 1.25,
        leg * radius * 0.5 + Math.sin(clock + leg * 2 + side) * 3,
      );
      c.stroke();
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.stroke();
    }
  }
  ellipse(c, 0, 0, radius * 0.9, radius * 1.05, '#0b141b');
  ellipse(c, 0, -2, radius * 0.75, radius * 0.9, color);
  ellipse(c, 0, 0, radius * 0.45, radius * 0.65, '#283945');
  c.fillStyle = '#ffdb93';
  c.fillRect(-radius * 0.4, -3, radius * 0.8, 4);
}

export function drawEnemy(
  c: CanvasRenderingContext2D,
  enemy: Enemy,
  chapter: number,
  time: number,
  dying = 0,
  variant = 0,
  miniVariant = 0,
  colorblind = false,
  affix: AffixLook | null = null,
) {
  const boss = enemy.type === 99;
  const mini = enemy.type === MINIBOSS_TYPE;
  const { def, size, sprite } = look(enemy, chapter, variant, miniVariant);
  const color = def?.color ?? '#efb96a';
  const phase = enemy.walk + enemy.visualSeed * 1.7;
  const hovering = def.artIndex === 4 || (boss && def.artIndex === 3);
  const bob = hovering
    ? Math.sin(time * 3.5 + enemy.visualSeed) * 3.2 - 4
    : Math.sin(phase * 2) * (boss ? 1.4 : 1.3);
  const tilt =
    Math.sin(phase) * (boss ? 0.018 : enemy.type === 1 ? 0.055 : 0.035);
  const recoil =
    Math.sin(Math.min(1, enemy.attack / 0.18) * Math.PI) *
      (boss ? 0.055 : 0.11) +
    (dying ? 0 : Math.max(0, enemy.hit / 0.12) * (boss ? 0.03 : 0.08));
  // Same orange as colour-blind hazards, so every telegraph reads alike.
  const warn = colorblind ? '#ffb000' : null;
  c.save();
  c.translate(enemy.x, enemy.y);
  if (dying) c.globalAlpha = Math.max(0, 1 - dying);
  ellipse(c, 0, enemy.r * 0.45 + 5, enemy.r * 1.25, enemy.r * 0.5, '#050c1190');

  // Readable windup tells the player where the existing ranged shot is going.
  if (!dying && (enemy.windup ?? 0) > 0) {
    if (!mini && !boss && ENEMY_DEFS[enemy.type]?.behavior === 'blink') {
      c.save();
      c.strokeStyle = warn ?? color;
      c.lineWidth = 2;
      c.setLineDash([5, 4]);
      c.beginPath();
      c.arc(
        (enemy.targetX ?? enemy.x) - enemy.x,
        (enemy.targetY ?? enemy.y) - enemy.y,
        enemy.r + 8,
        0,
        Math.PI * 2,
      );
      c.stroke();
      c.restore();
    }
    const charge = 1 - (enemy.windup ?? 0) / 1.2;
    c.save();
    c.globalAlpha = (warn ? 0.4 : 0.18) + charge * 0.5;
    c.strokeStyle = warn ?? (boss && enemy.phase ? '#ff796d' : '#ffc091');
    c.lineWidth = (boss ? 2.5 : 1.5) + (warn ? 1 : 0);
    c.setLineDash([4, 5]);
    c.beginPath();
    c.ellipse(
      0,
      7,
      enemy.r * (1.35 + charge * 0.3),
      enemy.r * (0.65 + charge * 0.15),
      0,
      0,
      Math.PI * 2,
    );
    c.stroke();
    c.setLineDash([]);
    if (!boss) {
      c.rotate(enemy.aim);
      c.beginPath();
      c.moveTo(15, 0);
      c.lineTo(55 + charge * 35, 0);
      c.stroke();
    }
    c.restore();
  }
  if (!dying && boss && enemy.phase) {
    c.strokeStyle = '#ee786a70';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(0, 9, enemy.r * 1.45, enemy.r * 0.65, 0, 0, Math.PI * 2);
    c.stroke();
  }

  if (!dying && (boss || mini || enemy.type === 7)) {
    c.save();
    c.strokeStyle = color;
    c.lineWidth = boss || mini ? 3 : 5;
    c.beginPath();
    if (enemy.type === 7 || (mini && chapter === 2 && miniVariant === 1))
      c.arc(0, 0, enemy.r + 8, enemy.aim - 0.95, enemy.aim + 0.95);
    else {
      const sides = mini ? miniVariant + 3 : variant + 3;
      for (let i = 0; i <= sides; i++) {
        const angle = (i * Math.PI * 2) / sides + time * 0.08;
        const x = Math.cos(angle) * (enemy.r + 12),
          y = Math.sin(angle) * (enemy.r + 12) * 0.6;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
    }
    c.stroke();
    c.restore();
  }
  c.save();
  c.translate(0, bob - enemy.r * 0.13);
  c.rotate(tilt + dying * enemy.facing * 0.32);
  // Deaths pop outward for a moment before shrinking away.
  const scale =
    1 - dying * 0.35 + Math.sin(Math.min(1, dying / 0.3) * Math.PI) * 0.12;
  c.scale(enemy.facing * scale * (1 + recoil), scale * (1 - recoil));
  // Affix outline: a soft halo plus a crisp rim of offset silhouettes.
  // Volatile ones pulse like a lit fuse.
  if (affix && !dying) {
    const lit =
      affix.id === 'volatile'
        ? 0.5 + 0.5 * Math.sin(time * 9 + enemy.visualSeed)
        : 1;
    if (sprite) {
      const rim = outlined(sprite, affix.color),
        pad =
          ((rim.width - sprite.body.width) / 2) * (size / sprite.body.width);
      c.globalAlpha = 0.55 + 0.45 * lit;
      c.drawImage(
        rim,
        -size / 2 - pad,
        -size * 0.62 - pad,
        size + pad * 2,
        size + pad * 2,
      );
      c.globalAlpha = 1;
    } else {
      c.strokeStyle = affix.color;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(0, 0, enemy.r * 1.05, enemy.r * 1.2, 0, 0, Math.PI * 2);
      c.stroke();
    }
  }
  if (sprite) {
    c.drawImage(sprite.body, -size / 2, -size * 0.62, size, size);
    if (enemy.hit > 0 && !dying) {
      c.globalAlpha = Math.min(0.85, enemy.hit / 0.12);
      c.drawImage(sprite.flash, -size / 2, -size * 0.62, size, size);
    } else if (dying > 0 && dying < 0.3) {
      c.globalAlpha = (1 - dying) * (1 - dying / 0.3) * 0.9;
      c.drawImage(sprite.flash, -size / 2, -size * 0.62, size, size);
    }
  } else fallback(c, enemy, enemy.hit > 0 ? '#fff1d5' : color, phase);
  c.restore();

  // Armoured plates: a segmented ring around the base.
  if (affix?.id === 'armored' && !dying)
    for (const [stroke, width] of [
      ['#0a1116', 5],
      [affix.color, 2.5],
    ] as const) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + 0.14;
        c.beginPath();
        c.ellipse(0, 6, enemy.r * 1.4, enemy.r * 0.66, 0, a, a + 0.78);
        c.stroke();
      }
    }
  if (enemy.hp < enemy.max && !boss && !dying) {
    const width = Math.max(24, enemy.r * 2),
      y = -size * 0.55 - 4;
    c.fillStyle = '#08131c';
    c.fillRect(-width / 2 - 1, y - 1, width + 2, 5);
    c.fillStyle = affix?.color ?? color;
    c.fillRect(-width / 2, y, width * Math.max(0, enemy.hp / enemy.max), 3);
  }
  if (affix && !dying) drawGlyph(c, affix.id, affix.color, -size * 0.55 - 14);
  c.restore();
}
