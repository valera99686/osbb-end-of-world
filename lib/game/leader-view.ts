import { type Enemy, isLeader } from './battle-core';
import { drawEnemy } from './enemy-art';
import type { Battle } from './engine';
import { leaderArmor } from './leader-mech';
import { MINIBOSS_TYPE } from './minibosses';

// What the leaders' mechanics look like on the floor: the helpers (antennas,
// cocoons, eggs, a valve, nodes, guards, decoys), the threads that tie them to
// the leader, its armour, the clock of the time keeper, the floor plan, the
// gap of the steam, the marks over a house. All of it is drawn from the
// enemies' and the leader's plain fields, so a guest of a mirror sees it too.

const num = (e: Enemy, key: string): number => {
  const v = e.mech?.[key];
  return typeof v === 'number' ? v : 0;
};
const leaderOf = (b: Battle): Enemy | undefined =>
  b.enemies.find((e) => e.hp > 0 && isLeader(e.type));

// How see-through a leader is (the relay hunter hides at a distance).
export const leaderAlpha = (e: Enemy) => (num(e, 'cloak') ? 0.28 : 1);

function bar(c: CanvasRenderingContext2D, e: Enemy) {
  if (e.hp >= e.max) return;
  const width = Math.max(26, e.r * 2.2);
  c.fillStyle = 'rgba(5,12,17,0.7)';
  c.fillRect(e.x - width / 2, e.y + e.r + 6, width, 4);
  c.fillStyle = '#e8c36a';
  c.fillRect(
    e.x - width / 2 + 1,
    e.y + e.r + 7,
    (width - 2) * Math.max(0, e.hp / e.max),
    2,
  );
}

export function drawHelper(
  c: CanvasRenderingContext2D,
  b: Battle,
  e: Enemy,
  dying: number,
) {
  const t = b.elapsed + e.visualSeed;
  if (e.tag === 'decoy') {
    // The agent's double: the same body, a little see-through and shimmering.
    const lead = leaderOf(b);
    c.save();
    c.globalAlpha = (0.55 + 0.1 * Math.sin(t * 9)) * (1 - dying);
    drawEnemy(
      c,
      { ...e, type: MINIBOSS_TYPE, r: lead?.r ?? e.r, scale: 1, hp: 1, max: 1 },
      b.run.chapter,
      b.elapsed,
      0,
      b.run.bossVariants[b.run.chapter],
      b.minibossVariant,
      b.settings.colorblind,
      null,
    );
    c.restore();
    return;
  }
  c.save();
  c.translate(e.x, e.y);
  if (dying) c.globalAlpha = Math.max(0, 1 - dying);
  c.fillStyle = 'rgba(5,12,17,0.45)';
  c.beginPath();
  c.ellipse(0, e.r * 0.55, e.r * 1.1, e.r * 0.45, 0, 0, Math.PI * 2);
  c.fill();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (e.tag === 'antenna') {
    c.strokeStyle = '#9fd0f0';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 6);
    c.lineTo(0, -34);
    for (const [y, w] of [
      [-12, 9],
      [-22, 15],
      [-31, 7],
    ]) {
      c.moveTo(-w, y);
      c.lineTo(w, y);
    }
    c.stroke();
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    c.fillStyle = `rgba(143,208,255,${0.5 + pulse * 0.5})`;
    c.beginPath();
    c.arc(0, -37, 4 + pulse * 2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = `rgba(143,208,255,${0.15 + pulse * 0.25})`;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, -37, 12 + pulse * 10, 0, Math.PI * 2);
    c.stroke();
  } else if (e.tag === 'pod') {
    const s = 1 + 0.06 * Math.sin(t * 3);
    c.scale(s, s);
    c.fillStyle = '#4f7f35';
    c.strokeStyle = '#b6e07a';
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(0, -4, 21, 26, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = 'rgba(182,224,122,0.6)';
    c.lineWidth = 2;
    for (const x of [-9, 0, 9]) {
      c.beginPath();
      c.moveTo(x * 0.5, 16);
      c.quadraticCurveTo(x * 1.4, -4, x, -24);
      c.stroke();
    }
  } else if (e.tag === 'egg') {
    const laid = num(e, 'laid'),
      hatch = num(e, 'hatch'),
      k =
        hatch > laid
          ? Math.max(0, Math.min(1, (b.elapsed - laid) / (hatch - laid)))
          : 0;
    c.fillStyle = '#efe5bd';
    c.strokeStyle = '#c9b97a';
    c.lineWidth = 2.5;
    c.beginPath();
    c.ellipse(0, -3, 12, 16, Math.sin(t * 10) * 0.08 * k, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(158,138,70,0.5)';
    c.beginPath();
    c.arc(-3, -6, 2.5, 0, Math.PI * 2);
    c.arc(4, 2, 2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = k > 0.7 ? '#ff7a5a' : '#d6e38a';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, -3, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    c.stroke();
  } else if (e.tag === 'valve') {
    c.rotate(t * 0.8);
    c.strokeStyle = '#6cc7e8';
    c.fillStyle = 'rgba(108,199,232,0.2)';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(0, 0, 20, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(
        Math.cos((i * Math.PI) / 2) * 20,
        Math.sin((i * Math.PI) / 2) * 20,
      );
      c.stroke();
    }
    c.rotate(-t * 0.8);
    c.fillStyle = '#e8f6ff';
    c.beginPath();
    c.arc(0, 0, 5, 0, Math.PI * 2);
    c.fill();
  } else if (e.tag === 'node') {
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    c.fillStyle = `rgba(127,215,255,${0.1 + pulse * 0.18})`;
    c.beginPath();
    c.arc(0, -2, 30 + pulse * 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#25506f';
    c.strokeStyle = '#7fd7ff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, -24);
    c.lineTo(18, -2);
    c.lineTo(0, 20);
    c.lineTo(-18, -2);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#e8fbff';
    c.beginPath();
    c.moveTo(3, -14);
    c.lineTo(-6, -1);
    c.lineTo(0, -1);
    c.lineTo(-3, 11);
    c.lineTo(7, -3);
    c.lineTo(1, -3);
    c.closePath();
    c.fill();
  } else if (e.tag === 'guard') {
    const flap = Math.sin(t * 16);
    c.fillStyle = 'rgba(227,201,74,0.85)';
    c.strokeStyle = '#8a6d1a';
    c.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      c.save();
      c.scale(side, 1);
      c.rotate(-0.4 - flap * 0.5);
      c.beginPath();
      c.ellipse(11, -2, 12, 7, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.restore();
    }
    c.fillStyle = '#5a4511';
    c.beginPath();
    c.ellipse(0, 0, 3.5, 9, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  if (!dying) bar(c, e);
}

// A leader's mechanic on the floor around it.
export function drawLeaderMechanic(
  c: CanvasRenderingContext2D,
  b: Battle,
  e: Enemy,
) {
  const colorblind = b.settings.colorblind;
  c.save();
  // The threads that tie a leader to what shields or feeds it.
  for (const m of b.enemies) {
    if (m.hp <= 0 || (m.tag !== 'antenna' && m.tag !== 'pod')) continue;
    const feed = m.tag === 'pod';
    c.strokeStyle = feed ? 'rgba(182,224,122,0.45)' : 'rgba(143,208,255,0.4)';
    c.lineWidth = 2;
    c.setLineDash(feed ? [] : [4, 6]);
    c.lineDashOffset = -b.elapsed * (feed ? -40 : 40);
    c.beginPath();
    c.moveTo(m.x, m.y - 10);
    c.lineTo(e.x, e.y - e.r * 0.4);
    c.stroke();
  }
  c.setLineDash([]);
  // Armour: an arc where the plate is, whole when it holds, dashed when down.
  const front = leaderArmor(b.mechHost(), e, e.aim + Math.PI);
  if (e.tag === 'commandant' || e.tag === 'mini-0-0' || e.tag === 'mini-2-1') {
    const up = front < 1;
    c.strokeStyle = colorblind ? '#ffb000' : up ? '#d9ecf7' : '#e8c36a';
    c.globalAlpha = up ? 0.85 : 0.35;
    c.lineWidth = up ? 6 : 3;
    c.setLineDash(up ? [] : [6, 6]);
    c.beginPath();
    c.arc(e.x, e.y - e.r * 0.2, e.r + 18, e.aim - 1.22, e.aim + 1.22);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;
  }
  // The keeper of time: a clock while time stands still.
  if (e.tag === 'chronarch' && num(e, 'until') > b.elapsed) {
    const left = (num(e, 'until') - b.elapsed) / 3;
    c.strokeStyle = '#c9b6ff';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(e.x, e.y - e.r * 0.2, e.r + 26, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(e.x, e.y - e.r * 0.2);
    c.lineTo(
      e.x + Math.sin(left * Math.PI * 2) * (e.r + 20),
      e.y - e.r * 0.2 - Math.cos(left * Math.PI * 2) * (e.r + 20),
    );
    c.stroke();
    c.fillStyle = 'rgba(201,182,255,0.16)';
    c.beginPath();
    c.arc(e.x, e.y - e.r * 0.2, e.r + 26, 0, Math.PI * 2);
    c.fill();
  }
  // The floor plan: the cells that stay whole.
  if (e.tag === 'architect' && num(e, 'planUntil') > b.elapsed) {
    const safe = e.mech?.safe;
    if (Array.isArray(safe)) {
      c.strokeStyle = colorblind ? '#ffffff' : '#8be0a2';
      c.fillStyle = 'rgba(139,224,162,0.16)';
      c.lineWidth = 4;
      const cw = 1600 / 6,
        ch = 1000 / 3;
      for (const i of safe) {
        const x = (i % 6) * cw + 4,
          y = Math.floor(i / 6) * ch + 4;
        c.fillRect(x, y, cw - 8, ch - 8);
        c.strokeRect(x, y, cw - 8, ch - 8);
      }
    }
  }
  // The steam's way through.
  if (e.tag === 'mini-0-2' && num(e, 'gapUntil') > b.elapsed) {
    const gap = num(e, 'gap');
    c.strokeStyle = '#9fe0a8';
    c.fillStyle = 'rgba(159,224,168,0.1)';
    c.lineWidth = 3;
    c.setLineDash([10, 8]);
    c.fillRect(gap - 120, 0, 240, 1000);
    c.strokeRect(gap - 120, 0, 240, 1000);
    c.setLineDash([]);
  }
  c.restore();
}

// The spore marks over a house, and the roots when the third one lands.
export function drawMarks(c: CanvasRenderingContext2D, b: Battle) {
  const draw = (x: number, y: number, seat: number) => {
    const marks = b.marks[seat] ?? 0,
      rooted = (b.rooted[seat] ?? 0) > 0;
    if (!marks && !rooted) return;
    c.save();
    c.fillStyle = '#9ccf6a';
    c.strokeStyle = '#2b4a17';
    c.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      c.globalAlpha = i < marks || rooted ? 1 : 0.25;
      c.beginPath();
      c.arc(x + (i - 1) * 14, y - 76, 5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    if (rooted) {
      c.globalAlpha = 0.9;
      c.strokeStyle = '#4f7f35';
      c.lineWidth = 4;
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.1 + i * 0.2);
        c.beginPath();
        c.moveTo(x, y + 22);
        c.quadraticCurveTo(
          x + Math.cos(a) * 20,
          y + 30,
          x + Math.cos(a) * 34,
          y + 20 + Math.sin(a) * 12,
        );
        c.stroke();
      }
    }
    c.restore();
  };
  draw(b.x, b.y, 0);
  for (const a of b.allies) if (!a.down && !a.away) draw(a.x, a.y, a.seat);
}
