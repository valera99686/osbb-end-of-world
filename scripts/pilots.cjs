// Headless pilots for Battle simulations, shared by scripts/balance-audit.cjs
// and tests/combat-feel.test.cjs. Needs `npm test` to have built .test-build.
//   idle / stationary: never moves, never dashes or pulses.
//   circle: fixed ellipse with proximity dash and pulse; no perception.
//   reactive: keeps its distance, steps out of armed-soon zones, sidesteps
//     enemy shots, pulses crowds and dashes out of danger.
const { hazardContains } = require('../.test-build/bosses.js');

const LEADERS = 98;
// Would the zone hit (x, y) if it were armed now, with `pad` px to spare?
const armedAt = (h, x, y, pad = 0) =>
  hazardContains({ ...h, age: 0, radius: h.radius + pad }, x, y);
function nearest(b) {
  let near = Infinity;
  for (const e of b.enemies)
    if (e.hp > 0) near = Math.min(near, Math.hypot(e.x - b.x, e.y - b.y));
  return near;
}
function circle(b, seed) {
  const a = b.elapsed * 0.42 + seed * 0.13;
  const dx = 800 + Math.cos(a) * 290 - b.x,
    dy = 500 + Math.sin(a) * 260 - b.y;
  const len = Math.hypot(dx, dy) || 1;
  b.stick = { x: dx / len, y: dy / len };
  const near = nearest(b);
  if (near < 220) b.pulse();
  if (near < 85) b.dash();
}
function reactive(b) {
  const alive = b.enemies.filter((e) => e.hp > 0);
  let vx = 0,
    vy = 0,
    danger = false,
    near = Infinity;
  for (const e of alive) {
    const dx = b.x - e.x,
      dy = b.y - e.y,
      d = Math.hypot(dx, dy) || 1;
    near = Math.min(near, d);
    if (d < 260) {
      vx += (dx / d) * ((260 - d) / 260) * 1.4;
      vy += (dy / d) * ((260 - d) / 260) * 1.4;
    }
    if (d < 60) danger = true;
  }
  for (const h of b.hazards) {
    if (h.age >= h.duration || !armedAt(h, b.x, b.y, 40)) continue;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2,
        tx = b.x + Math.cos(a) * 90,
        ty = b.y + Math.sin(a) * 90;
      if (tx < 60 || tx > 1540 || ty < 60 || ty > 940) continue;
      if (b.hazards.some((o) => o.age < o.duration && armedAt(o, tx, ty, 20)))
        continue;
      vx += Math.cos(a) * 3;
      vy += Math.sin(a) * 3;
      break;
    }
    if (armedAt(h, b.x, b.y) && h.age > -0.25 && h.age < 0) danger = true;
  }
  for (const s of b.bullets) {
    if (!s.enemy || s.life <= 0) continue;
    const rx = b.x - s.x,
      ry = b.y - s.y,
      d = Math.hypot(rx, ry);
    if (d > 220) continue;
    const sp = Math.hypot(s.vx, s.vy) || 1,
      ux = s.vx / sp,
      uy = s.vy / sp;
    if (rx * ux + ry * uy < 0) continue;
    const side = rx * -uy + ry * ux;
    if (Math.abs(side) < 40) {
      const sign = side >= 0 ? 1 : -1;
      vx += -uy * sign * 2;
      vy += ux * sign * 2;
      if (d < 60) danger = true;
    }
  }
  vx +=
    (b.x < 200 ? (200 - b.x) / 100 : 0) - (b.x > 1400 ? (b.x - 1400) / 100 : 0);
  vy +=
    (b.y < 180 ? (180 - b.y) / 100 : 0) - (b.y > 820 ? (b.y - 820) / 100 : 0);
  vx += (800 - b.x) * 0.0006;
  vy += (500 - b.y) * 0.0006;
  const len = Math.hypot(vx, vy);
  b.stick = len > 0.05 ? { x: vx / len, y: vy / len } : { x: 0, y: 0 };
  const crowd = alive.filter(
    (e) => Math.hypot(e.x - b.x, e.y - b.y) < 225,
  ).length;
  if (crowd >= 3 || (alive.some((e) => e.type >= LEADERS) && near < 235))
    b.pulse();
  if (danger) b.dash();
}
// One simulation step of input for `pilot`; call before b.update(dt).
function steer(b, pilot, seed = 0) {
  if (pilot === 'circle') circle(b, seed);
  else if (pilot === 'reactive') reactive(b);
}
// Runs a battle to its end (or `limit` seconds) and reports what happened.
function play(b, pilot, { seed = 0, dt = 0.025, limit = 260, each } = {}) {
  const maxHp = b.stats.health;
  let phase2 = null,
    lowest = b.run.hp;
  while (!b.ended && b.elapsed < limit) {
    steer(b, pilot, seed);
    b.update(dt);
    each?.(b);
    lowest = Math.min(lowest, b.run.hp);
    if (phase2 === null && b.enemies.some((e) => e.type >= LEADERS && e.phase))
      phase2 = b.elapsed;
  }
  return {
    ended: b.ended,
    reason: b.endReason,
    hpPercent: (100 * Math.max(0, b.run.hp)) / maxHp,
    lowestPercent: (100 * Math.max(0, lowest)) / maxHp,
    seconds: b.elapsed,
    phase2,
  };
}
module.exports = { steer, play, armedAt };
