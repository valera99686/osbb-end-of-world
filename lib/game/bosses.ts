export interface Hazard {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius: number;
  age: number;
  duration: number;
  damage: number;
  color: string;
  drain?: number;
}
export const BOSS_GUIDES = [
  'Комендант стріляє віялом і б’є по позначеній ділянці. Рухайся поперек прицілу, виходь із кола.',
  'Мати теплиць вирощує коріння із затримкою та кличе дрібних істот. Залишай собі шлях для відступу.',
  'Колектор випускає повільні монетні спіралі й боргові пастки. Пастка забирає міцність і до 5 монет.',
  'Архітектор креслить лазерні лінії. Вийди у вільний сектор, поки пунктир не став суцільним.',
  'Останній будинок чергує віяла й вибухи. Після втрати половини міцності атаки поєднуються.',
];
export interface BossPattern {
  name: string;
  cooldown: number;
  shots: { angle: number; speed: number; damage: number }[];
  hazards: Hazard[];
  summons: number[];
}
export function bossPattern(
  chapter: number,
  phase: number,
  beat: number,
  x: number,
  y: number,
  playerX: number,
  playerY: number,
): BossPattern {
  const aimed = Math.atan2(playerY - y, playerX - x);
  const result: BossPattern = {
    name: '',
    cooldown: 2.6,
    shots: [],
    hazards: [],
    summons: [],
  };
  const fan = (count: number, spread: number, speed: number, angle = aimed) => {
    for (let i = 0; i < count; i++)
      result.shots.push({
        angle: angle + (i - (count - 1) / 2) * spread,
        speed,
        damage: 10 + chapter * 2,
      });
  };
  const pool = (
    px: number,
    py: number,
    radius: number,
    delay: number,
    duration: number,
    color: string,
    drain = 0,
  ) =>
    result.hazards.push({
      x: Math.max(55, Math.min(1545, px)),
      y: Math.max(55, Math.min(945, py)),
      radius,
      age: -delay,
      duration,
      damage: 10 + chapter * 2,
      color,
      drain,
    });
  if (chapter === 0) {
    result.name = beat % 3 === 2 ? 'Удар опорами' : 'Загороджувальний вогонь';
    if (beat % 3 === 2)
      pool(playerX, playerY, phase ? 106 : 84, 0.95, 0.3, '#eda166');
    else fan(phase ? 7 : 5, 0.22, phase ? 230 : 185);
    result.cooldown = phase ? 1.65 : 2.35;
  } else if (chapter === 1) {
    result.name = beat % 2 ? 'Насіння варти' : 'Коріння пам’яті';
    for (let i = 0; i < (phase ? 4 : 3); i++) {
      const angle = i * 2.4 + beat;
      pool(
        playerX + (i ? Math.cos(angle) * 130 : 0),
        playerY + (i ? Math.sin(angle) * 130 : 0),
        62,
        1.15 + i * 0.12,
        2.8,
        '#99ce78',
      );
    }
    if (beat % 2) result.summons = phase ? [3, 3, 3] : [3, 3];
    result.cooldown = phase ? 2.7 : 3.5;
  } else if (chapter === 2) {
    result.name = beat % 2 ? 'Боргова пастка' : 'Монетна спіраль';
    const count = phase ? 13 : 10;
    for (let i = 0; i < count; i++)
      result.shots.push({
        angle: (i * Math.PI * 2) / count + beat * 0.57,
        speed: 112 + (i % 2) * 32,
        damage: 14,
      });
    if (beat % 2) {
      for (let i = 0; i < (phase ? 5 : 3); i++) {
        const angle = (i * Math.PI * 2) / (phase ? 6 : 4);
        pool(
          playerX + Math.cos(angle) * 105,
          playerY + Math.sin(angle) * 105,
          43,
          1.2,
          2,
          '#c4a0e0',
          5,
        );
      }
    }
    result.cooldown = phase ? 2.1 : 2.8;
  } else if (chapter === 3) {
    result.name = phase ? 'Перекреслити квартал' : 'Лінії знесення';
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      result.hazards.push({
        x: x1,
        y: y1,
        x2,
        y2,
        radius: 18,
        age: -1.2,
        duration: 0.42,
        damage: 19,
        color: '#83dbe8',
      });
    line(30, playerY, 1570, playerY);
    line(playerX, 30, playerX, 970);
    if (phase)
      line(
        30,
        playerY + (beat % 2 ? -145 : 145),
        1570,
        playerY + (beat % 2 ? -145 : 145),
      );
    result.cooldown = phase ? 2.4 : 3.1;
  } else {
    result.name = phase
      ? 'Аварійний протокол'
      : beat % 2
        ? 'Обвал перекриття'
        : 'Не залишайте будинок';
    if (phase || beat % 2 === 0) fan(phase ? 11 : 7, 0.18, phase ? 215 : 170);
    if (phase || beat % 2) {
      pool(playerX, playerY, 85, 1.05, 0.35, '#ffaf88');
      for (let i = 0; i < 2; i++)
        pool(
          playerX + Math.cos(beat + i * Math.PI) * 150,
          playerY + Math.sin(beat + i * Math.PI) * 150,
          70,
          1.4,
          0.3,
          '#ffaf88',
        );
    }
    if (phase && beat % 3 === 2) result.summons = [0, 1];
    result.cooldown = phase ? 2.2 : 2.7;
  }
  return result;
}
export function hazardContains(h: Hazard, x: number, y: number): boolean {
  if (h.age < 0 || h.age >= h.duration) return false;
  if (h.x2 === undefined || h.y2 === undefined)
    return Math.hypot(x - h.x, y - h.y) < h.radius + 18;
  const dx = h.x2 - h.x,
    dy = h.y2 - h.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - h.x) * dx + (y - h.y) * dy) / Math.max(1, dx * dx + dy * dy),
    ),
  );
  return Math.hypot(x - h.x - dx * t, y - h.y - dy * t) < h.radius + 18;
}
export function drawHazard(c: CanvasRenderingContext2D, h: Hazard) {
  c.save();
  c.strokeStyle = h.color;
  c.fillStyle = h.color;
  c.globalAlpha = h.age < 0 ? 0.45 : 0.85;
  c.lineWidth = h.age < 0 ? 2 : h.x2 !== undefined ? h.radius * 2 : 4;
  c.setLineDash(h.age < 0 ? [7, 7] : []);
  c.beginPath();
  if (h.x2 !== undefined && h.y2 !== undefined) {
    c.moveTo(h.x, h.y);
    c.lineTo(h.x2, h.y2);
    c.stroke();
  } else {
    c.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = h.age < 0 ? 0.08 : 0.22;
    c.fill();
    if (h.age < 0) {
      c.setLineDash([]);
      c.globalAlpha = 0.55;
      c.beginPath();
      c.arc(h.x, h.y, h.radius * Math.max(0, 1 + h.age / 1.6), 0, Math.PI * 2);
      c.stroke();
    }
  }
  c.restore();
}
