import { config } from "../config";

export interface AudioFeatures {
  /** Time-domain RMS amplitude, 0..1. */
  rms: number;
  /** Spectral flatness over the voice band, 0..1 (1 = white noise). */
  flatness: number;
  /** Fraction of spectral power below the low band cutoff, 0..1. */
  lowRatio: number;
}

/**
 * Extracts features from one analyser frame.
 * @param dbSpectrum output of AnalyserNode.getFloatFrequencyData (dBFS per bin)
 * @param timeDomain output of AnalyserNode.getFloatTimeDomainData (-1..1)
 */
export function computeFeatures(
  dbSpectrum: Float32Array,
  timeDomain: Float32Array,
  sampleRate: number,
): AudioFeatures {
  let sumSq = 0;
  for (let i = 0; i < timeDomain.length; i++) sumSq += timeDomain[i] * timeDomain[i];
  const rms = Math.sqrt(sumSq / Math.max(1, timeDomain.length));

  const binHz = sampleRate / 2 / dbSpectrum.length;
  const [fLo, fHi] = config.blow.flatnessBandHz;
  const lowCut = config.blow.lowBandHz;

  let total = 0;
  let low = 0;
  let logSum = 0;
  let linSum = 0;
  let n = 0;
  for (let i = 1; i < dbSpectrum.length; i++) {
    const hz = i * binHz;
    // dB → power; clamp -Infinity bins (silence) to a tiny floor so logs stay finite.
    const p = Math.max(1e-12, Math.pow(10, dbSpectrum[i] / 10));
    total += p;
    if (hz < lowCut) low += p;
    if (hz >= fLo && hz <= fHi) {
      logSum += Math.log(p);
      linSum += p;
      n++;
    }
  }
  const flatness = n > 0 && linSum > 0 ? Math.exp(logSum / n) / (linSum / n) : 0;
  const lowRatio = total > 0 ? low / total : 0;
  return { rms, flatness, lowRatio };
}

/**
 * Turns mic features + (optionally) the face into a debounced { blowing, strength } signal.
 *
 * - Face visible: the face has to agree. Puckered lips + breath noise = blow; talking (no pucker)
 *   doesn't fog. A very strong breath-like mic signal still counts, in case the pucker is missed.
 * - No face: mic only.
 * - No mic: a clearly puckered face held for a moment fogs on its own, more gently.
 */
export class BlowDetector {
  private noiseFloor = 0.01;
  private candidateMs = 0;
  private quietMs = 0;
  blowing = false;
  strength = 0;
  /** Why the last frame did or didn't count — shown in ?debug. */
  reason = "";

  /**
   * @param f mic features, or null when there is no mic
   * @param pucker 0..1 when a face is visible, null otherwise
   */
  update(f: AudioFeatures | null, dtMs: number, pucker: number | null = null): { blowing: boolean; strength: number } {
    const c = config.blow;
    const threshold = Math.max(c.minRms, this.noiseFloor * c.floorMultiplier);
    const loud = f !== null && f.rms > threshold;
    // Either signature counts: breath across the mic (noise-like) or straight into it (bass rumble).
    const noiseLike = f !== null && (f.flatness > c.minFlatness || f.lowRatio > c.minLowRatio);
    // With a pucker confirming it, accept a looser version of the same signature.
    const breathy = f !== null && (f.flatness > c.minFlatness * 0.5 || f.lowRatio > c.minLowRatio * 0.8);
    const puckered = pucker !== null && pucker > c.minPucker;

    let candidate: boolean;
    let attackMs: number = c.attackMs;
    let raw: number;
    if (f === null) {
      candidate = pucker !== null && pucker > c.silentPucker;
      attackMs = c.silentAttackMs;
      raw = candidate ? 0.5 * Math.min(1, (pucker! - c.silentPucker) / (1 - c.silentPucker) + 0.4) : 0;
      this.reason = pucker === null ? "no mic, no face" : candidate ? "face only" : "no mic, not puckered";
    } else {
      raw = Math.min(1, Math.max(0, (f.rms - threshold) / c.rmsRange));
      if (pucker === null) {
        candidate = loud && noiseLike;
        this.reason = candidate ? "mic" : loud ? "mic: not breath-like" : "mic: quiet";
      } else {
        const veryStrong = noiseLike && f.rms > threshold * c.overrideMultiplier;
        candidate = (puckered && loud && breathy) || veryStrong;
        this.reason = candidate
          ? puckered
            ? "face + mic"
            : "mic (very strong)"
          : !puckered
            ? "face: not puckered"
            : loud
              ? "face ok, mic not breath-like"
              : "face ok, mic quiet";
      }
    }

    if (candidate) {
      this.candidateMs += dtMs;
      this.quietMs = 0;
    } else {
      this.candidateMs = 0;
      this.quietMs += dtMs;
    }

    if (!this.blowing && this.candidateMs >= attackMs) this.blowing = true;
    if (this.blowing && this.quietMs >= c.releaseMs) this.blowing = false;

    // Only learn the floor from non-loud frames, so a long blow doesn't raise it.
    if (f && !loud && !this.blowing) {
      const a = 1 - Math.exp(-dtMs / c.floorTauMs);
      this.noiseFloor += (f.rms - this.noiseFloor) * a;
    }

    const target = this.blowing ? Math.max(0.25, raw) : 0;
    // Light smoothing so fog growth doesn't stutter.
    this.strength += (target - this.strength) * Math.min(1, dtMs / 80);
    return { blowing: this.blowing, strength: this.strength };
  }
}
