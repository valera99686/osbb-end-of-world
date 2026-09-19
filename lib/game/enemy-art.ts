import { ENEMY_DEFS, campaignBoss } from './encounters';
import { MINIBOSS_TYPE, minibossFor } from './minibosses';
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
type Sprite = { body: HTMLCanvasElement; flash: HTMLCanvasElement };

// All animation is driven by simulation time. Rendering never consumes the
// combat RNG, and the two atlases are decoded only once across expeditions.
class EnemyAtlas {
  enemies: Sprite[] = [];
  bosses: Sprite[] = [];
  regions: Sprite[][] = [];
  constructor() {
    if (typeof Image === 'undefined') return;
    this.load('/art/enemies-v1.png', false);
    this.load('/art/bosses-v1.png', true);
    this.load('/art/enemies-rust-v2.webp', false, 0);
    this.load('/art/enemies-green-v2.webp', false, 1);
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
    atlas.src = url;
  }
}
let atlas: EnemyAtlas | undefined;
export function preloadEnemyArt() {
  atlas ??= new EnemyAtlas();
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
) {
  const boss = enemy.type === 99;
  const mini = enemy.type === MINIBOSS_TYPE;
  const def = boss
    ? campaignBoss(chapter, variant)
    : mini
      ? minibossFor(chapter, miniVariant)
      : ENEMY_DEFS[enemy.type];
  const color = def?.color ?? '#efb96a';
  const size = boss
    ? campaignBoss(chapter, variant).size
    : mini
      ? minibossFor(chapter, miniVariant).size
      : SIZES[def.artIndex] * ENEMY_DEFS[enemy.type].scale;
  const sprite = boss
    ? atlas?.bosses[def.artIndex]
    : (atlas?.regions[def.location]?.[
        mini
          ? 6 + miniVariant
          : enemy.type < 9
            ? enemy.type % 3
            : 3 + ((enemy.type - 9) % 3)
      ] ?? atlas?.enemies[def.artIndex]);
  const phase = enemy.walk + enemy.visualSeed * 1.7;
  const hovering = def.artIndex === 4 || (boss && def.artIndex === 3);
  const bob = hovering
    ? Math.sin(time * 3.5 + enemy.visualSeed) * 3.2 - 4
    : Math.sin(phase * 2) * (boss ? 1.4 : 1.3);
  const tilt =
    Math.sin(phase) * (boss ? 0.018 : enemy.type === 1 ? 0.055 : 0.035);
  const recoil =
    Math.sin(Math.min(1, enemy.attack / 0.18) * Math.PI) *
    (boss ? 0.055 : 0.11);
  c.save();
  c.translate(enemy.x, enemy.y);
  if (dying) c.globalAlpha = Math.max(0, 1 - dying);
  ellipse(c, 0, enemy.r * 0.45 + 5, enemy.r * 1.25, enemy.r * 0.5, '#050c1190');

  // Readable windup tells the player where the existing ranged shot is going.
  if (!dying && (enemy.windup ?? 0) > 0) {
    if (!mini && !boss && ENEMY_DEFS[enemy.type]?.behavior === 'blink') {
      c.save();
      c.strokeStyle = color;
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
    c.globalAlpha = 0.18 + charge * 0.5;
    c.strokeStyle = boss && enemy.phase ? '#ff796d' : '#ffc091';
    c.lineWidth = boss ? 2.5 : 1.5;
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
  const scale = 1 - dying * 0.35;
  c.scale(enemy.facing * scale * (1 + recoil), scale * (1 - recoil));
  if (sprite) {
    c.drawImage(sprite.body, -size / 2, -size * 0.62, size, size);
    if (enemy.hit > 0 && !dying) {
      c.globalAlpha = Math.min(0.85, enemy.hit / 0.12);
      c.drawImage(sprite.flash, -size / 2, -size * 0.62, size, size);
    }
  } else fallback(c, enemy, enemy.hit > 0 ? '#fff1d5' : color, phase);
  c.restore();

  if (enemy.hp < enemy.max && !boss && !dying) {
    const width = Math.max(24, enemy.r * 2),
      y = -size * 0.55 - 4;
    c.fillStyle = '#08131c';
    c.fillRect(-width / 2 - 1, y - 1, width + 2, 5);
    c.fillStyle = color;
    c.fillRect(-width / 2, y, width * Math.max(0, enemy.hp / enemy.max), 3);
  }
  c.restore();
}
