// The battle canvas is filled pixel by pixel, so a big or dense screen costs
// frames long before the simulation does (a fight update is well under a
// millisecond). This is the safety net for a slow display path: the canvas gets
// a pixel budget, and its detail falls while frames stay long and comes back
// when they are quick. (The usual cause of 70 ms frames was elsewhere, see
// sprites.ts.) Only the size of the backing store changes: the world, the
// camera and the simulation work in CSS pixels, so a fight plays out the same
// at any detail (and two devices in lockstep need not agree on it).
export const PACE = {
  // Pixels the canvas may have at full detail: a 1440p screen at one to one.
  budget: 4_000_000,
  // The sharpest ratio of backing pixels to CSS pixels, and the softest.
  top: 2,
  floor: 0.5,
  // Frames are judged in windows of this many. A window slower than `slow`
  // (ms per frame) takes detail away towards `aim`; one quicker than `ok`
  // gives some back, but never above 90% of a level that was too slow.
  window: 45,
  slow: 26,
  aim: 20,
  ok: 19,
  least: 0.4,
  back: 1.15,
  left: 0.9,
  // A gap this long is a tab coming back, not a slow frame; a shorter one is
  // counted at most this long, so one hiccup cannot decide a window.
  gap: 250,
  cap: 100,
  // The start of every fight is not judged (sprites are still being decoded
  // and the caches are cold), and neither are the frames after a change.
  warm: 2500,
  settle: 12,
} as const;

export class Pacer {
  // Share of the sharpest ratio the screen can afford, 1 down to `least`.
  detail = 1;
  private ceiling = 1;
  private area = 0;
  private sum = 0;
  private count = 0;
  private since = 0;
  private skip = 0;
  // A new fight: its first moments are not judged.
  begin() {
    this.since = 0;
    this.sum = this.count = 0;
  }
  // Backing pixels per CSS pixel for a canvas of this size on this display.
  ratio(device: number, w: number, h: number) {
    const sharp = Math.min(
      PACE.top,
      Number.isFinite(device) && device > 0 ? device : 1,
    );
    const area = Math.max(1, w * h);
    // A very different screen (a resized window, a turned phone) starts over.
    if (!this.area) this.area = area;
    else if (area > this.area * 1.5 || area < this.area / 1.5) {
      this.area = area;
      this.detail = this.ceiling = 1;
      this.sum = this.count = 0;
      this.skip = PACE.settle;
    }
    const fit = Math.min(sharp, Math.sqrt(PACE.budget / area));
    return Math.min(sharp, Math.max(PACE.floor, fit * this.detail));
  }
  // One frame took `ms` between two animation frames.
  frame(ms: number) {
    if (!(ms > 0) || ms > PACE.gap) return;
    this.since += Math.min(PACE.cap, ms);
    if (this.since < PACE.warm) return;
    if (this.skip > 0) {
      this.skip--;
      return;
    }
    this.sum += Math.min(PACE.cap, ms);
    if (++this.count < PACE.window) return;
    const mean = this.sum / this.count;
    this.sum = this.count = 0;
    // Cost follows the pixel count, which follows the ratio squared.
    if (mean > PACE.slow && this.detail > PACE.least) {
      const cut = Math.max(0.5, Math.min(0.9, Math.sqrt(PACE.aim / mean)));
      this.ceiling = this.detail * PACE.left;
      this.detail = Math.max(PACE.least, this.detail * cut);
      this.skip = PACE.settle;
    } else if (mean < PACE.ok && this.detail < this.ceiling) {
      this.detail = Math.min(this.ceiling, this.detail * PACE.back);
      this.skip = PACE.settle;
    }
  }
}
// One for the page: what a screen can afford is learned once and kept for the
// next fight.
export const pacer = new Pacer();
