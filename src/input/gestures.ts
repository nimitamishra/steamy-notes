import { config } from "../config";
import { cameraToScreen, type CoverFit } from "../coords";

export interface Landmark {
  x: number;
  y: number;
  /** Relative depth, roughly the same scale as x (MediaPipe). */
  z?: number;
}

// MediaPipe hand landmark indices.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;

export interface HandFrame {
  /** Normalized image landmarks (0..1, camera space) — used for position. */
  image: Landmark[];
  /** Real-world 3D landmarks in meters — the main pinch measure, so hand angle/distance don't matter. */
  world: Landmark[];
}

export interface HandShape {
  /** 3D thumb↔index distance / hand size (world landmarks). Drives release and the pen hold. */
  pinchRatio: number;
  /** Same thing measured on the camera image — a second opinion. */
  pinchRatio2D: number;
  /** Every pinch condition holds this frame (both measures close, and not just a curled hand). */
  closed: boolean;
  /** Index fingertip, screen space — the pen. */
  indexTip: { x: number; y: number };
}

const dist3 = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

/**
 * @param aspect camera frame width / height, so 2D distances are in real proportions.
 */
export function analyzeHand(hand: HandFrame, fit: CoverFit, aspect: number): HandShape {
  const h = config.hand;
  const w = hand.world;
  const im = hand.image;
  const dist2 = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

  const size3 = Math.max(1e-6, dist3(w[WRIST], w[MIDDLE_MCP]));
  const size2 = Math.max(1e-6, dist2(im[WRIST], im[MIDDLE_MCP]));
  const thumbIndex = dist3(w[THUMB_TIP], w[INDEX_TIP]);
  const pinchRatio = thumbIndex / size3;
  const pinchRatio2D = dist2(im[THUMB_TIP], im[INDEX_TIP]) / size2;
  // A loose fist also brings the index tip to the thumb — but then the middle tip is right there too.
  // In a real pinch the middle finger stays clearly farther from the thumb.
  const curled = dist3(w[THUMB_TIP], w[MIDDLE_TIP]) < thumbIndex * h.curledMargin;

  return {
    pinchRatio,
    pinchRatio2D,
    closed: pinchRatio < h.pinchOn && pinchRatio2D < h.pinchOn2D && !curled,
    indexTip: cameraToScreen(im[INDEX_TIP].x, im[INDEX_TIP].y, fit),
  };
}

/**
 * Deliberate-pinch detector. A pinch "starts" only when:
 * - the hand has been visible for handSettleMs,
 * - the fingers were clearly apart (ratio > pinchOff) since the last pinch — you have to *make* a
 *   pinch, a hand that's already closed never counts,
 * - every pinch condition holds for pinchHoldMs straight,
 * - and pinchCooldownMs has passed since the last one.
 * Release is hysteretic: the pinch ends when the ratio rises above pinchOff.
 */
export class PinchTracker {
  pinched = false;
  private closedMs = 0;
  private visibleMs = 0;
  private sinceStartMs = Infinity;
  private armed = false;

  update(shape: { pinchRatio: number; closed: boolean }, dtMs: number): { pinched: boolean; started: boolean } {
    const h = config.hand;
    this.visibleMs += dtMs;
    this.sinceStartMs += dtMs;
    const open = shape.pinchRatio > h.pinchOff;
    const was = this.pinched;

    if (!was) {
      if (open) this.armed = true;
      this.closedMs = shape.closed ? this.closedMs + dtMs : 0;
      if (
        this.armed &&
        this.closedMs >= h.pinchHoldMs &&
        this.visibleMs >= h.handSettleMs &&
        this.sinceStartMs >= h.pinchCooldownMs
      ) {
        this.pinched = true;
        this.armed = false;
        this.sinceStartMs = 0;
      }
    } else if (open) {
      this.pinched = false;
      this.closedMs = 0;
      this.armed = true;
    }
    return { pinched: this.pinched, started: !was && this.pinched };
  }

  /** Call when the hand is lost. */
  reset(): void {
    this.pinched = false;
    this.closedMs = 0;
    this.visibleMs = 0;
    this.armed = false;
  }
}

export interface BrushSample {
  x: number;
  y: number;
  /** Radius in screen-height units. */
  r: number;
}
