// All tunables in one place. Units are noted per value.
// Distances in "screen units" are fractions of the canvas HEIGHT unless noted.

export const config = {
  blow: {
    /** Below this RMS (0..1 amplitude) nothing counts as a blow, regardless of noise floor. */
    minRms: 0.015,
    /** A blow must be this many times louder than the ambient noise floor. */
    floorMultiplier: 2.5,
    /** RMS above threshold that maps to strength 1. */
    rmsRange: 0.18,
    /** Spectral flatness (0..1) over the voice band; breath is noise-like (high), voices are tonal (low). */
    minFlatness: 0.15,
    /** Fraction of energy below lowBandHz; blowing directly on a mic is mostly low rumble. */
    minLowRatio: 0.5,
    lowBandHz: 500,
    flatnessBandHz: [150, 4000] as [number, number],
    /** Candidate must persist this long (ms) before it counts — rejects plosives and taps. */
    attackMs: 150,
    /** Keep "blowing" this long (ms) after the signal drops — smooths gaps between breaths. */
    releaseMs: 180,
    /** EMA time constant (ms) for the ambient noise floor. */
    floorTauMs: 3000,
    /** Face visible: lips must look at least this puckered (0..1 blendshape score) for a blow to count. */
    minPucker: 0.3,
    /** Face visible but not puckered: a breath this many times over threshold still counts. */
    overrideMultiplier: 3,
    /** No mic: pucker needed to fog from the face alone, held for silentAttackMs. */
    silentPucker: 0.5,
    silentAttackMs: 350,
  },

  fog: {
    /** Sim texture is canvas size divided by this. */
    simDownscale: 4,
    /** Density added per second at full blow strength (center of falloff). */
    blowRate: 1.6,
    /** Humidity (0..1) gained per second at full blow strength. */
    humidityGain: 0.9,
    /** Humidity lost per second when not blowing — controls how long the fog lasts overall. */
    humidityDecay: 0.012,
    /** Wiped areas regrow toward humidity * regrowCap. Keep < 1 so writing stays readable. */
    regrowCap: 0.6,
    /** Per-second rate of regrowth toward the target (exponential approach). */
    regrowRate: 0.035,
    /** Per-second linear evaporation of density above the target. */
    evapRate: 0.012,
    /** Density used by Undo / Eraser stamps. */
    refogLevel: 0.92,
    /** How strongly a wipe stamp removes fog (0..1) per stamp application. */
    wipeStrength: 0.9,
  },

  brush: {
    /** Index-fingertip wipe radius, in screen units. */
    fingerRadius: 0.02,
    /** Radius for mouse / touch drawing. */
    pointerRadius: 0.022,
    /** Stamp spacing along a stroke, as a fraction of radius. */
    spacing: 0.3,
    /** Points younger than this (ms) are held back so the pinch-to-stop motion doesn't draw. */
    commitDelayMs: 180,
  },

  face: {
    /** Run face detection at most this often (ms) — it only needs to catch a held pucker. */
    detectIntervalMs: 66,
    /** Face missing longer than this (ms) → fall back to mic-only blow detection. */
    lostMs: 400,
  },

  hand: {
    /** Pinch starts below this (thumb-index distance / hand size). */
    pinchOn: 0.28,
    /** Pinch ends above this — hysteresis gap prevents flicker. */
    pinchOff: 0.42,
    /** Run detection at most this often (ms). */
    detectIntervalMs: 33,
    /** Hand missing longer than this (ms) breaks the current stroke. */
    lostMs: 250,
    /** If average detection takes longer than this (ms), turn hand tracking off. */
    tooSlowMs: 70,
    /** One-Euro filter params for fingertip smoothing (positions are 0..1 screen coords). */
    minCutoff: 1.4,
    beta: 6,
  },

  drips: {
    /** Expected drips spawned per second at full humidity. */
    spawnPerSecond: 0.35,
    /** Humidity below which no drips form. */
    minHumidity: 0.45,
    maxDrips: 12,
    /** Head radius range, screen units. */
    radius: [0.006, 0.011] as [number, number],
    /** Speed range while sliding, screen units per second. */
    speed: [0.05, 0.16] as [number, number],
  },
} as const;
