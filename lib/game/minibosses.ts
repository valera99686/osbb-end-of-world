import type { BossPattern } from './bosses';

export const MINIBOSS_TYPE = 98;
export const MINIBOSSES = [
  {
    name: 'Ланковий патруля',
    health: 720,
    speed: 39,
    radius: 27,
    size: 100,
    artIndex: 1,
    color: '#f1bc72',
    contactDamage: 14,
    guide:
      'Чергує три снаряди віялом і силовий удар по прямій. Виходь із позначеної смуги. Перемога: предмет на вибір, монети й 4 брухту.',
  },
  {
    name: 'Споровий сторож',
    health: 1450,
    speed: 32,
    radius: 30,
    size: 108,
    artIndex: 5,
    color: '#b9d67e',
    contactDamage: 18,
    guide:
      'Залишає спорові плями на твоєму попередньому місці та стріляє насінням. Не стій у колах. Перемога: предмет на вибір, монети й 4 брухту.',
  },
  {
    name: 'Релейний мисливець',
    health: 2500,
    speed: 42,
    radius: 28,
    size: 104,
    artIndex: 4,
    color: '#b1a5f0',
    contactDamage: 22,
    guide:
      'Креслить хрест із лазерних смуг і випускає прицільні залпи. Відійди по діагоналі від перехрестя. Перемога: предмет на вибір, монети й 4 брухту.',
  },
] as const;

export function minibossFor(chapter: number) {
  return MINIBOSSES[Math.max(0, Math.min(2, Math.floor(chapter)))];
}

// Attacks lock the player's old position. All area strikes have an additional
// visible warning after the engine's windup, including in the second phase.
export function minibossPattern(
  chapter: number,
  phase: number,
  beat: number,
  x: number,
  y: number,
  playerX: number,
  playerY: number,
): BossPattern {
  const def = minibossFor(chapter);
  const aimed = Math.atan2(playerY - y, playerX - x);
  const damage = 9 + chapter * 3;
  const pattern: BossPattern = {
    name: '',
    cooldown: phase ? 2.8 : 3.6,
    shots: [],
    hazards: [],
    summons: [],
  };
  const fan = (count: number, speed: number) => {
    for (let i = 0; i < count; i++)
      pattern.shots.push({
        angle: aimed + (i - (count - 1) / 2) * 0.26,
        speed,
        damage,
      });
  };
  const line = (
    x: number,
    y: number,
    x2: number,
    y2: number,
    radius: number,
  ) => {
    pattern.hazards.push({
      x,
      y,
      x2,
      y2,
      radius,
      age: -1.1,
      duration: 0.3,
      damage,
      color: def.color,
    });
  };
  if (chapter === 0) {
    if (beat % 2 === 0) {
      pattern.name = 'Патрульне віяло';
      fan(3, phase ? 180 : 160);
    } else {
      pattern.name = 'Силовий удар';
      line(x, y, x + Math.cos(aimed) * 470, y + Math.sin(aimed) * 470, 24);
    }
  } else if (chapter === 1) {
    if (beat % 2 === 0) {
      pattern.name = 'Споровий слід';
      for (const offset of [-65, 65])
        pattern.hazards.push({
          x: Math.max(55, Math.min(1545, playerX + offset)),
          y: Math.max(55, Math.min(945, playerY)),
          radius: 49,
          age: -1.1,
          duration: 1.7,
          damage,
          color: def.color,
        });
    } else {
      pattern.name = 'Насіннєвий залп';
      fan(phase ? 5 : 3, 170);
    }
  } else {
    if (beat % 2 === 0) {
      pattern.name = 'Релейний перехрест';
      line(
        Math.max(45, playerX - 290),
        playerY,
        Math.min(1555, playerX + 290),
        playerY,
        17,
      );
      line(
        playerX,
        Math.max(45, playerY - 240),
        playerX,
        Math.min(955, playerY + 240),
        17,
      );
    } else {
      pattern.name = 'Прицільний залп';
      fan(phase ? 5 : 3, 205);
    }
  }
  return pattern;
}
