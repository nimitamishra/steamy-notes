import { describe, expect, it } from "vitest";
import { StrokeBook } from "../src/strokes";
import { nextHint } from "../src/state";

const r = 0.02;

describe("StrokeBook", () => {
  it("spaces stamps evenly along a segment", () => {
    const b = new StrokeBook();
    b.begin("wipe", 0);
    b.add({ x: 0, y: 0.5, r }, 0);
    const stamps = b.add({ x: 0.1, y: 0.5, r }, 1);
    // 0.1 / (0.02 * 0.3) ≈ 16.7 → 17 steps
    expect(stamps).toHaveLength(17);
    expect(stamps.every((s) => s.amount < 0)).toBe(true);
  });

  it("held points are never drawn if the stroke ends with discard", () => {
    const b = new StrokeBook();
    b.begin("wipe", 0);
    b.add({ x: 0.1, y: 0.5, r }, 0);
    b.add({ x: 0.2, y: 0.5, r }, 50);
    // Thumb closing in for the stop pinch: hold.
    expect(b.add({ x: 0.5, y: 0.5, r }, 100, true)).toEqual([]);
    expect(b.add({ x: 0.9, y: 0.5, r }, 150, true)).toEqual([]);
    expect(b.end(true)).toEqual([]);
    // Undo replays exactly what was kept.
    const maxX = Math.max(...b.undo().map((s) => s.x));
    expect(maxX).toBeCloseTo(0.2);
  });

  it("held points are drawn once the hold is released (false alarm)", () => {
    const b = new StrokeBook();
    b.begin("wipe", 0);
    b.add({ x: 0.1, y: 0.5, r }, 0);
    b.add({ x: 0.2, y: 0.5, r }, 50, true);
    const stamps = b.add({ x: 0.3, y: 0.5, r }, 100);
    expect(Math.max(...stamps.map((s) => s.x))).toBeCloseTo(0.3);
    expect(stamps.some((s) => Math.abs(s.x - 0.2) < 1e-6)).toBe(true);
  });

  it("undo refogs the last stroke and eraser strokes undo by wiping", () => {
    const b = new StrokeBook();
    b.begin("wipe", 0);
    b.add({ x: 0.1, y: 0.1, r }, 0);
    b.end(false);
    b.begin("fog", 0);
    b.add({ x: 0.5, y: 0.5, r }, 2);
    b.end(false);

    const undoEraser = b.undo();
    expect(undoEraser[0].amount).toBeLessThan(0);
    const undoWipe = b.undo();
    expect(undoWipe[0].amount).toBeGreaterThan(0);
    expect(undoWipe[0].r).toBeGreaterThan(r);
    expect(b.canUndo).toBe(false);
  });

  it("does not record empty strokes", () => {
    const b = new StrokeBook();
    b.begin("wipe", 100);
    b.add({ x: 0.1, y: 0.1, r }, 0);
    b.end(true);
    expect(b.canUndo).toBe(false);
  });
});

describe("nextHint", () => {
  const ev = { fogged: false, penDown: false, wrote: false, penUpAfterWriting: false };
  it("walks blow → pinch → write → lift → done", () => {
    expect(nextHint("blow", ev)).toBe("blow");
    expect(nextHint("blow", { ...ev, fogged: true })).toBe("pinch");
    expect(nextHint("pinch", { ...ev, penDown: true })).toBe("write");
    expect(nextHint("write", { ...ev, wrote: true })).toBe("lift");
    expect(nextHint("lift", { ...ev, penUpAfterWriting: true })).toBe("done");
  });
});
