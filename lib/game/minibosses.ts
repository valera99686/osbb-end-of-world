import type { BossPattern } from './bosses';

export const MINIBOSS_TYPE = 98;
export const MINIBOSSES = [
  {
    location: 0,
    variant: 0,
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
    location: 0,
    variant: 1,
    name: 'Магнітний майстер',
    health: 800,
    speed: 30,
    radius: 29,
    size: 108,
    artIndex: 2,
    color: '#e5ad7b',
    contactDamage: 15,
    guide:
      'Ставить магнітні поля, що сповільнюють будинок, і випускає кільце уламків із проходом. Виходь із поля ривком.',
  },
  {
    location: 0,
    variant: 2,
    name: 'Котельний наглядач',
    health: 680,
    speed: 36,
    radius: 28,
    size: 105,
    artIndex: 0,
    color: '#ffbb81',
    contactDamage: 16,
    guide:
      'Перекриває шлях паровими смугами й підриває ділянку, де стояв будинок. Відійди від розмітки до викиду пари.',
  },
  {
    location: 1,
    variant: 0,
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
    location: 1,
    variant: 1,
    name: 'Матка рою',
    health: 1320,
    speed: 35,
    radius: 31,
    size: 112,
    artIndex: 2,
    color: '#c5d28a',
    contactDamage: 17,
    guide:
      'Кличе пилкових метеликів і прикриває їх насіннєвими залпами. Проріджуй рій і не стій між маткою та її охороною.',
  },
  {
    location: 1,
    variant: 2,
    name: 'Кореневий ловчий',
    health: 1580,
    speed: 28,
    radius: 31,
    size: 115,
    artIndex: 3,
    color: '#86caaa',
    contactDamage: 20,
    guide:
      'Ставить дві стіни коріння з проходом посередині, потім націлює удар у цей прохід. Не затримуйся між стінами.',
  },
  {
    location: 2,
    variant: 0,
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
  {
    location: 2,
    variant: 1,
    name: 'Дзеркальний агент',
    health: 2250,
    speed: 36,
    radius: 30,
    size: 112,
    artIndex: 2,
    color: '#a5d7f1',
    contactDamage: 21,
    guide:
      'Лобові дзеркала послаблюють прямі влучання. Обходь агента збоку та виходь із діагональних лазерних смуг.',
  },
  {
    location: 2,
    variant: 2,
    name: 'Хронометр',
    health: 2700,
    speed: 30,
    radius: 31,
    size: 115,
    artIndex: 5,
    color: '#d2a8f1',
    contactDamage: 20,
    guide:
      'Залишає кілька відкладених вибухів уздовж твого сліду й створює поле сповільнення. Рухайся вперед, не повертайся одразу назад.',
  },
] as const;

export function minibossFor(chapter: number, variant = 0) {
  return MINIBOSSES[
    Math.max(0, Math.min(2, Math.floor(chapter))) * 3 +
      Math.max(0, Math.min(2, Math.floor(variant)))
  ];
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
  variant = 0,
): BossPattern {
  const def = minibossFor(chapter, variant);
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
  const pool = (
    px: number,
    py: number,
    radius: number,
    delay: number,
    duration: number,
    slow?: number,
  ) => {
    pattern.hazards.push({
      x: Math.max(50, Math.min(1550, px)),
      y: Math.max(50, Math.min(950, py)),
      radius,
      age: -delay,
      duration,
      damage,
      color: def.color,
      slow,
    });
  };
  if (variant === 1 && chapter === 0) {
    if (beat % 2 === 0) {
      pattern.name = 'Магнітні пастки';
      pool(playerX - 75, playerY, 60, 1.1, 2.2, 0.6);
      pool(playerX + 75, playerY, 60, 1.1, 2.2, 0.6);
    } else {
      pattern.name = 'Кільце уламків';
      for (let i = 2; i < 12; i++)
        pattern.shots.push({
          angle: aimed + (i * Math.PI) / 6,
          speed: phase ? 150 : 130,
          damage,
        });
    }
  } else if (variant === 2 && chapter === 0) {
    if (beat % 2 === 0) {
      pattern.name = 'Паровий коридор';
      for (const offset of [-95, 95])
        line(
          playerX - 260,
          playerY + offset,
          playerX + 260,
          playerY + offset,
          24,
        );
    } else {
      pattern.name = 'Скидання тиску';
      pool(playerX, playerY, phase ? 82 : 68, 1.2, 0.4);
    }
  } else if (variant === 1 && chapter === 1) {
    if (beat % 2 === 0) {
      pattern.name = 'Пробудження рою';
      pattern.summons.push(12, ...(phase ? [12] : []));
      pattern.cooldown = 4.8;
    } else {
      pattern.name = 'Захист матки';
      fan(5, 160);
    }
  } else if (variant === 2 && chapter === 1) {
    if (beat % 2 === 0) {
      pattern.name = 'Коренева клітка';
      for (const offset of [-100, 100]) {
        line(
          playerX + offset,
          playerY - 200,
          playerX + offset,
          playerY + 200,
          23,
        );
        pattern.hazards[pattern.hazards.length - 1].duration = 1.8;
      }
    } else {
      pattern.name = 'Удар кореня';
      line(x, y, x + Math.cos(aimed) * 550, y + Math.sin(aimed) * 550, 30);
      pool(playerX, playerY, 55, 1.6, 0.3);
    }
  } else if (variant === 1 && chapter === 2) {
    if (beat % 2 === 0) {
      pattern.name = 'Дзеркальні леза';
      line(playerX - 230, playerY - 230, playerX + 230, playerY + 230, 17);
      line(playerX - 230, playerY + 230, playerX + 230, playerY - 230, 17);
    } else {
      pattern.name = 'Розщеплений промінь';
      fan(phase ? 7 : 5, 180);
    }
  } else if (variant === 2 && chapter === 2) {
    if (beat % 2 === 0) {
      pattern.name = 'Відлуння секунд';
      for (let i = 0; i < 3; i++)
        pool(
          playerX - Math.cos(aimed) * i * 75,
          playerY - Math.sin(aimed) * i * 75,
          48,
          1.1 + i * 0.5,
          0.4,
        );
    } else {
      pattern.name = 'Повільна мить';
      pool(playerX, playerY, 95, 1.3, 2.2, 0.6);
      fan(3, 160);
    }
  } else if (chapter === 0) {
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
