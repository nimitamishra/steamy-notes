import { config } from "../config";
import type { Stamp } from "../strokes";

interface Drip {
  x: number;
  y: number;
  r: number;
  speed: number;
  sliding: boolean;
  /** Seconds until the next stick/slip switch. */
  timer: number;
  wobblePhase: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Heavy condensation that runs down in stick-slip bursts, clearing a streak. */
export class Drips {
  private drips: Drip[] = [];

  clear(): void {
    this.drips = [];
  }

  /**
   * @param humidity 0..1
   * @returns wipe stamps for the trails this frame
   */
  update(dt: number, humidity: number, enabled: boolean): Stamp[] {
    const c = config.drips;
    if (!enabled) {
      this.drips = [];
      return [];
    }

    const spawnChance = humidity > c.minHumidity ? c.spawnPerSecond * humidity * dt : 0;
    if (this.drips.length < c.maxDrips && Math.random() < spawnChance) {
      this.drips.push({
        x: rand(0.05, 0.95),
        y: rand(0.08, 0.55),
        r: rand(c.radius[0], c.radius[1]),
        speed: 0,
        sliding: false,
        timer: rand(0.4, 1.5),
        wobblePhase: Math.random() * 10,
      });
    }

    const stamps: Stamp[] = [];
    for (const d of this.drips) {
      d.timer -= dt;
      if (d.timer <= 0) {
        d.sliding = !d.sliding || Math.random() < 0.3;
        d.speed = d.sliding ? rand(c.speed[0], c.speed[1]) : 0;
        d.timer = d.sliding ? rand(0.4, 1.4) : rand(0.2, 1.0);
      }
      if (!d.sliding) {
        // Gathering water while stuck.
        d.r = Math.min(c.radius[1] * 1.3, d.r + dt * 0.0008);
        continue;
      }
      const prevY = d.y;
      d.y += d.speed * dt;
      d.wobblePhase += dt * 3;
      d.x += Math.sin(d.wobblePhase) * 0.00008;
      // Stamp along the movement so fast drips leave a continuous streak.
      const steps = Math.max(1, Math.ceil((d.y - prevY) / (d.r * 0.3)));
      for (let i = 1; i <= steps; i++) {
        stamps.push({ x: d.x, y: prevY + ((d.y - prevY) * i) / steps, r: d.r * 0.85, amount: -0.6 });
      }
    }
    this.drips = this.drips.filter((d) => d.y < 1 + d.r * 2);
    return stamps;
  }

  /** Heads for the composite shader: [x, y, r, 0] per drip. */
  heads(): Float32Array {
    const out = new Float32Array(this.drips.length * 4);
    this.drips.forEach((d, i) => out.set([d.x, d.y, d.r, 0], i * 4));
    return out;
  }

  get count(): number {
    return this.drips.length;
  }
}
