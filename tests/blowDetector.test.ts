import { describe, expect, it } from "vitest";
import { BlowDetector, computeFeatures } from "../src/input/blowDetector";

const SR = 48000;
const BINS = 512;

/** dB spectrum from a power-per-bin function. */
const spectrum = (power: (hz: number) => number) =>
  Float32Array.from({ length: BINS }, (_, i) => 10 * Math.log10(Math.max(1e-12, power((i * SR) / 2 / BINS))));

const wave = (rms: number) => Float32Array.from({ length: 1024 }, (_, i) => (i % 2 ? rms : -rms));

// Blowing into a laptop mic: broadband noise rolling off above ~300 Hz.
const blowSpectrum = spectrum((hz) => 1 / (1 + (hz / 300) ** 2));
// A voiced vowel: harmonics every 150 Hz, very little in between.
const voiceSpectrum = spectrum((hz) => (hz % 150 < 10 ? 1 : 1e-5));
// Blowing straight into the mic: almost all rumble, steep rolloff — not flat at all.
const rumbleSpectrum = spectrum((hz) => 1 / (1 + (hz / 120) ** 4));

describe("computeFeatures", () => {
  it("rates flat noise as flat and tonal speech as not", () => {
    const noise = computeFeatures(spectrum(() => 1), wave(0.1), SR);
    const voice = computeFeatures(voiceSpectrum, wave(0.1), SR);
    expect(noise.flatness).toBeGreaterThan(0.9);
    expect(voice.flatness).toBeLessThan(0.1);
  });

  it("measures low-band energy and RMS", () => {
    const f = computeFeatures(blowSpectrum, wave(0.2), SR);
    expect(f.lowRatio).toBeGreaterThan(0.5);
    expect(f.rms).toBeCloseTo(0.2, 5);
  });
});

describe("BlowDetector", () => {
  const run = (d: BlowDetector, spec: Float32Array, rms: number, ms: number) => {
    let out = { blowing: false, strength: 0 };
    for (let t = 0; t < ms; t += 16) out = d.update(computeFeatures(spec, wave(rms), SR), 16);
    return out;
  };

  it("detects a sustained blow after the attack time", () => {
    const d = new BlowDetector();
    run(d, blowSpectrum, 0.005, 500); // learn quiet room
    expect(run(d, blowSpectrum, 0.15, 64).blowing).toBe(false);
    const out = run(d, blowSpectrum, 0.15, 300);
    expect(out.blowing).toBe(true);
    expect(out.strength).toBeGreaterThan(0.2);
  });

  it("ignores loud speech", () => {
    const d = new BlowDetector();
    run(d, voiceSpectrum, 0.005, 500);
    expect(run(d, voiceSpectrum, 0.2, 1000).blowing).toBe(false);
  });

  it("detects bass-only rumble from blowing directly into the mic", () => {
    const d = new BlowDetector();
    run(d, rumbleSpectrum, 0.003, 500);
    expect(run(d, rumbleSpectrum, 0.05, 400).blowing).toBe(true);
  });

  it("ignores short plosive bursts", () => {
    const d = new BlowDetector();
    run(d, blowSpectrum, 0.005, 500);
    expect(run(d, blowSpectrum, 0.2, 64).blowing).toBe(false);
    expect(run(d, blowSpectrum, 0.005, 200).blowing).toBe(false);
  });

  it("releases after the signal stops", () => {
    const d = new BlowDetector();
    run(d, blowSpectrum, 0.15, 400);
    expect(run(d, blowSpectrum, 0.005, 400).blowing).toBe(false);
  });
});

describe("BlowDetector with the face", () => {
  const run = (d: BlowDetector, spec: Float32Array | null, rms: number, pucker: number | null, ms: number) => {
    let out = { blowing: false, strength: 0 };
    for (let t = 0; t < ms; t += 16)
      out = d.update(spec ? computeFeatures(spec, wave(rms), SR) : null, 16, pucker);
    return out;
  };

  it("blows with a pucker and breath", () => {
    const d = new BlowDetector();
    run(d, blowSpectrum, 0.005, 0, 500);
    expect(run(d, blowSpectrum, 0.08, 0.6, 400).blowing).toBe(true);
  });

  it("does not blow when the face isn't puckered (e.g. talking near the mic)", () => {
    const d = new BlowDetector();
    run(d, blowSpectrum, 0.005, 0, 500);
    expect(run(d, blowSpectrum, 0.04, 0.05, 1000).blowing).toBe(false);
  });

  it("still blows on a very strong breath if the pucker is missed", () => {
    const d = new BlowDetector();
    run(d, blowSpectrum, 0.005, 0, 500);
    expect(run(d, blowSpectrum, 0.3, 0.05, 400).blowing).toBe(true);
  });

  it("does not blow on a pucker with no sound", () => {
    const d = new BlowDetector();
    run(d, blowSpectrum, 0.005, 0, 500);
    expect(run(d, blowSpectrum, 0.005, 0.9, 1000).blowing).toBe(false);
  });

  it("with no mic, a held pucker fogs on its own", () => {
    const d = new BlowDetector();
    expect(run(d, null, 0, 0.8, 200).blowing).toBe(false);
    const out = run(d, null, 0, 0.8, 400);
    expect(out.blowing).toBe(true);
    expect(out.strength).toBeGreaterThan(0.2);
    expect(run(d, null, 0, 0.1, 400).blowing).toBe(false);
  });
});
