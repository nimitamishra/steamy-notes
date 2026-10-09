import { config } from "./config";
import type { BrushSample } from "./input/gestures";

/** One soft circle applied to the fog. amount < 0 wipes (strength), amount > 0 refogs (to that density). */
export interface Stamp {
  x: number;
  y: number;
  r: number;
  amount: number;
}

export type StrokeKind = "wipe" | "fog";

interface Stroke {
  kind: StrokeKind;
  points: BrushSample[];
}

/**
 * Records strokes, turns them into evenly spaced stamps, and keeps history for Undo.
 * Points are held back for `delayMs` before they're committed, so the last moment of a stroke
 * (e.g. fingers closing for the "stop" pinch) can be discarded.
 */
export class StrokeBook {
  private history: Stroke[] = [];
  private current: Stroke | null = null;
  private pending: { s: BrushSample; t: number }[] = [];
  private delayMs = 0;
  /** canvas width / height; stamp spacing is measured in height units. */
  aspect = 1;

  get drawing(): boolean {
    return this.current !== null;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  begin(kind: StrokeKind, delayMs: number): void {
    this.current = { kind, points: [] };
    this.pending = [];
    this.delayMs = delayMs;
  }

  /** Adds a sample; returns stamps for any points that are now old enough to commit. */
  add(s: BrushSample, t: number): Stamp[] {
    if (!this.current) return [];
    this.pending.push({ s, t });
    return this.commitUntil(t - this.delayMs);
  }

  /** Ends the stroke. If discardPending, the last `delayMs` of motion is dropped. */
  end(t: number, discardPending: boolean): Stamp[] {
    if (!this.current) return [];
    const stamps = discardPending ? this.commitUntil(t - this.delayMs) : this.commitUntil(Infinity);
    if (this.current.points.length > 0) this.history.push(this.current);
    this.current = null;
    this.pending = [];
    return stamps;
  }

  /** Stamps that reverse the most recent stroke. */
  undo(): Stamp[] {
    const last = this.history.pop();
    if (!last) return [];
    const inverse: StrokeKind = last.kind === "wipe" ? "fog" : "wipe";
    // Slightly wider than the original so the soft edges are covered too.
    const widened = last.points.map((p) => ({ ...p, r: p.r * 1.25 }));
    return this.stampsFor(widened, inverse);
  }

  clear(): void {
    this.history = [];
    this.current = null;
    this.pending = [];
  }

  /** Total committed path length of the current stroke (height units) — used for hints. */
  currentLength(): number {
    const pts = this.current?.points ?? [];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += this.dist(pts[i - 1], pts[i]);
    return len;
  }

  private commitUntil(cutoff: number): Stamp[] {
    const cur = this.current;
    if (!cur) return [];
    const stamps: Stamp[] = [];
    while (this.pending.length > 0 && this.pending[0].t <= cutoff) {
      const { s } = this.pending.shift()!;
      const prev = cur.points[cur.points.length - 1];
      cur.points.push(s);
      stamps.push(...(prev ? this.segment(prev, s, cur.kind) : [this.stamp(s, cur.kind)]));
    }
    return stamps;
  }

  private stampsFor(points: BrushSample[], kind: StrokeKind): Stamp[] {
    const out: Stamp[] = [];
    points.forEach((p, i) => {
      if (i === 0) out.push(this.stamp(p, kind));
      else out.push(...this.segment(points[i - 1], p, kind));
    });
    return out;
  }

  /** Stamps from a (exclusive) to b (inclusive). */
  private segment(a: BrushSample, b: BrushSample, kind: StrokeKind): Stamp[] {
    const d = this.dist(a, b);
    const step = Math.max(1e-4, Math.min(a.r, b.r) * config.brush.spacing);
    const n = Math.max(1, Math.ceil(d / step));
    const out: Stamp[] = [];
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      out.push(
        this.stamp({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, r: a.r + (b.r - a.r) * k }, kind),
      );
    }
    return out;
  }

  private stamp(s: BrushSample, kind: StrokeKind): Stamp {
    return {
      x: s.x,
      y: s.y,
      r: s.r,
      amount: kind === "wipe" ? -config.fog.wipeStrength : config.fog.refogLevel,
    };
  }

  private dist(a: BrushSample, b: BrushSample): number {
    return Math.hypot((a.x - b.x) * this.aspect, a.y - b.y);
  }
}
