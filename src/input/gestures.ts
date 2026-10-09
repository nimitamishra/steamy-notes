import { config } from "../config";
import { cameraToScreen, type CoverFit } from "../coords";

export interface Landmark {
  x: number;
  y: number;
}

// MediaPipe hand landmark indices.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

export interface HandShape {
  /** Thumb-index distance divided by hand size (scale-invariant). */
  pinchRatio: number;
  /** Index fingertip, screen space — the pen. */
  indexTip: { x: number; y: number };
}

/**
 * @param aspect camera frame width / height, so distances are measured in real proportions.
 */
export function analyzeHand(lm: Landmark[], aspect: number, fit: CoverFit): HandShape {
  const dist = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const handSize = Math.max(1e-6, dist(lm[WRIST], lm[MIDDLE_MCP]));
  return {
    pinchRatio: dist(lm[THUMB_TIP], lm[INDEX_TIP]) / handSize,
    indexTip: cameraToScreen(lm[INDEX_TIP].x, lm[INDEX_TIP].y, fit),
  };
}

/** Pinch with hysteresis: on below pinchOn, off above pinchOff. */
export class PinchTracker {
  pinched = false;
  update(ratio: number): { pinched: boolean; started: boolean } {
    const was = this.pinched;
    if (!was && ratio < config.hand.pinchOn) this.pinched = true;
    else if (was && ratio > config.hand.pinchOff) this.pinched = false;
    return { pinched: this.pinched, started: !was && this.pinched };
  }
  reset(): void {
    this.pinched = false;
  }
}

export interface BrushSample {
  x: number;
  y: number;
  /** Radius in screen-height units. */
  r: number;
}
