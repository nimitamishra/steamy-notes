import { describe, expect, it } from "vitest";
import { cameraToScreen, coverFit } from "../src/coords";
import { analyzeHand, PinchTracker, type HandFrame, type Landmark } from "../src/input/gestures";
import { config } from "../src/config";

const identity = coverFit(1, 1, 1, 1);

type Pose = "open" | "pinch" | "curled" | "thumbBehind";

/**
 * Synthetic hands. World coords in meters (hand size 9cm wrist→middle knuckle); image coords use
 * the same layout scaled into 0..1 (x/y only), so 2D and 3D agree unless a pose says otherwise.
 */
function hand(pose: Pose): HandFrame {
  const world: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  world[0] = { x: 0, y: 0.05, z: 0 }; // wrist
  world[9] = { x: 0, y: -0.04, z: 0 }; // middle knuckle
  world[8] = { x: -0.02, y: -0.09, z: 0 }; // index tip
  world[12] = { x: 0.0, y: -0.11, z: 0 }; // middle tip (extended)
  world[4] = { x: 0.05, y: -0.03, z: 0 }; // thumb tip, away
  if (pose === "pinch") world[4] = { x: -0.008, y: -0.088, z: 0 };
  if (pose === "thumbBehind") world[4] = { x: -0.008, y: -0.088, z: 0.05 }; // overlaps on camera only
  if (pose === "curled") {
    // Loose fist: index and middle tips both tucked against the thumb.
    world[8] = { x: -0.01, y: -0.0, z: -0.02 };
    world[12] = { x: 0.0, y: 0.0, z: -0.02 };
    world[4] = { x: -0.005, y: -0.005, z: -0.02 };
  }
  const image = world.map((p) => ({ x: 0.5 + p.x * 3, y: 0.5 + p.y * 3 }));
  return { image, world };
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
  const shape = (p: Pose) => analyzeHand(hand(p), identity, 1);

  it("a real pinch is closed; an open hand is clearly open", () => {
    expect(shape("pinch").closed).toBe(true);
    expect(shape("open").closed).toBe(false);
    expect(shape("open").pinchRatio).toBeGreaterThan(config.hand.pinchOff);
  });

  it("a thumb that only overlaps the finger on camera is not a pinch", () => {
    expect(shape("thumbBehind").pinchRatio2D).toBeLessThan(config.hand.pinchOn2D);
    expect(shape("thumbBehind").closed).toBe(false);
  });

  it("a loosely curled hand is not a pinch", () => {
    expect(shape("curled").closed).toBe(false);
  });

  it("uses the mirrored index fingertip as the pen", () => {
    const tip = shape("open").indexTip;
    expect(tip.x).toBeCloseTo(1 - (0.5 - 0.06));
    expect(tip.y).toBeCloseTo(0.5 - 0.27);
  });
});

describe("PinchTracker", () => {
  const { pinchHoldMs, handSettleMs, pinchCooldownMs } = config.hand;
  const STEP = 16;
  const OPEN = { pinchRatio: 0.8, closed: false };
  const CLOSED = { pinchRatio: 0.15, closed: true };
  const BETWEEN = { pinchRatio: 0.4, closed: false };
  /** Feeds a pose for `ms` in small detection steps; returns how many pinches started. */
  const feed = (p: PinchTracker, s: { pinchRatio: number; closed: boolean }, ms: number) => {
    let starts = 0;
    for (let t = 0; t < ms; t += STEP) if (p.update(s, STEP).started) starts++;
    return starts;
  };
  const settled = () => {
    const p = new PinchTracker();
    feed(p, OPEN, handSettleMs + 50);
    return p;
  };

  it("needs the pinch held, not a passing touch", () => {
    const p = settled();
    expect(feed(p, CLOSED, pinchHoldMs - 2 * STEP)).toBe(0); // fingers brush past each other
    expect(feed(p, OPEN, 100)).toBe(0);
    expect(feed(p, CLOSED, pinchHoldMs + 50)).toBe(1); // deliberate pinch
  });

  it("a hand that is already closed never counts until it opens first", () => {
    const p = new PinchTracker();
    expect(feed(p, CLOSED, handSettleMs + 1000)).toBe(0);
    expect(feed(p, OPEN, 50)).toBe(0);
    expect(feed(p, CLOSED, pinchHoldMs + 50)).toBe(1);
  });

  it("half-closing (between on and off) never arms or triggers", () => {
    const p = new PinchTracker();
    feed(p, BETWEEN, handSettleMs + 50);
    expect(feed(p, CLOSED, pinchHoldMs + 50)).toBe(0);
  });

  it("uses hysteresis and a cooldown so one pinch can't toggle twice", () => {
    const p = settled();
    expect(feed(p, CLOSED, pinchHoldMs + 20)).toBe(1);
    expect(feed(p, BETWEEN, 60)).toBe(0); // stays pinched, no new start
    expect(feed(p, OPEN, 40)).toBe(0); // released
    expect(feed(p, CLOSED, pinchHoldMs + 20)).toBe(0); // re-pinch inside cooldown
    expect(feed(p, OPEN, pinchCooldownMs)).toBe(0);
    expect(feed(p, CLOSED, pinchHoldMs + 20)).toBe(1); // after cooldown
  });

  it("resets when the hand is lost", () => {
    const p = settled();
    p.reset();
    expect(feed(p, CLOSED, handSettleMs + 200)).toBe(0);
  });
});
