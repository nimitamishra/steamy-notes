import { describe, expect, it } from "vitest";
import { cameraToScreen, coverFit } from "../src/coords";
import { analyzeHand, PinchTracker, type Landmark } from "../src/input/gestures";
import { config } from "../src/config";

const identity = coverFit(1, 1, 1, 1);

/** A hand pointing up with the index tip at (0.44, 0.48); thumb either touching it or away. */
function hand(pinch: boolean): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8 }));
  lm[0] = { x: 0.5, y: 0.8 }; // wrist
  lm[9] = { x: 0.5, y: 0.65 }; // middle MCP → hand size 0.15
  lm[8] = { x: 0.44, y: 0.48 }; // index tip
  lm[4] = pinch ? { x: 0.45, y: 0.48 } : { x: 0.3, y: 0.62 };
  return lm;
}

describe("coords", () => {
  it("mirrors horizontally", () => {
    expect(cameraToScreen(0.2, 0.3, identity)).toEqual({ x: 0.8, y: 0.3 });
  });

  it("accounts for cover cropping", () => {
    // 16:9 video on a square screen: sides are cropped.
    const fit = coverFit(1600, 900, 1000, 1000);
    expect(fit.scaleY).toBe(1);
    expect(fit.scaleX).toBeCloseTo(900 / 1600);
    expect(cameraToScreen(0.5, 0.5, fit).x).toBeCloseTo(0.5);
  });
});

describe("analyzeHand", () => {
  it("detects a pinch by ratio", () => {
    expect(analyzeHand(hand(true), 1, identity).pinchRatio).toBeLessThan(config.hand.pinchOn);
    expect(analyzeHand(hand(false), 1, identity).pinchRatio).toBeGreaterThan(config.hand.pinchOff);
  });

  it("uses the mirrored index fingertip as the pen", () => {
    const tip = analyzeHand(hand(false), 1, identity).indexTip;
    expect(tip.x).toBeCloseTo(0.56);
    expect(tip.y).toBeCloseTo(0.48);
  });
});

describe("PinchTracker", () => {
  it("uses hysteresis and reports the start edge once", () => {
    const p = new PinchTracker();
    expect(p.update(0.2)).toEqual({ pinched: true, started: true });
    expect(p.update(0.35)).toEqual({ pinched: true, started: false }); // inside the gap: stays pinched
    expect(p.update(0.5).pinched).toBe(false);
    expect(p.update(0.35).pinched).toBe(false); // inside the gap: stays released
  });
});
