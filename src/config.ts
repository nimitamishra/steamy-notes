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
    /** Humidity lost per second when not blowing — controls how long the fog lasts overall (~8 min). */
    humidityDecay: 0.002,
    /** Wiped areas regrow toward humidity * regrowCap. Keep < 1 so writing stays readable. */
    regrowCap: 0.6,
    /** Per-second rate of regrowth toward the target (exponential approach; ~80s time constant). */
    regrowRate: 0.012,
    /** Per-second linear evaporation of density above the target. */
    evapRate: 0.003,
    /** Density the Refog button sets the whole mirror to. (Eraser/undo instead restore the surrounding level.) */
    refogLevel: 0.92,
    /** How strongly an eraser/undo stamp restores fog to the surrounding level (0..1) per application. */
    restoreStrength: 1,
    /** How strongly a wipe stamp removes fog (0..1) per stamp application. */
    wipeStrength: 0.9,
  },

  brush: {
    /** Wipe radius per size setting, in screen units (finger and mouse/touch alike). */
    sizes: { s: 0.011, m: 0.019, l: 0.032 },
    /** Stamp spacing along a stroke, as a fraction of radius. */
    spacing: 0.3,
    /** Small lag (ms) before hand points draw; most stop-pinch protection comes from hand.approachRatio. */
    commitDelayMs: 60,
  },

  face: {
    /** Run face detection at most this often (ms) — it only needs to catch a held pucker. */
    detectIntervalMs: 66,
    /** Face missing longer than this (ms) → fall back to mic-only blow detection. */
    lostMs: 400,
  },

  hand: {
    /**
     * Pinch ratio = thumb-tip↔index-tip distance / wrist↔middle-knuckle distance, measured on
     * MediaPipe's real-world 3D landmarks (meters), so it doesn't depend on hand angle or distance
     * from the camera. Touching ≈ 0.1–0.25, relaxed open hand ≈ 0.6+.
     */
    pinchOn: 0.3,
    /** Pinch ends above this — hysteresis gap prevents flicker. Also "clearly open" for arming. */
    pinchOff: 0.45,
    /** Second opinion on the camera image (thumb↔index / wrist↔middle-knuckle, 2D). Must also be below this. */
    pinchOn2D: 0.35,
    /** Curled-hand reject: not a pinch if thumb↔middle-tip < thumb↔index-tip × this. */
    curledMargin: 1.6,
    /** While writing, below this the thumb is closing in: hold the pen (don't draw) in case it's a stop-pinch. */
    approachRatio: 0.5,
    /** Fingers must stay pinched this long (ms) before it counts — rejects passing-through poses. */
    pinchHoldMs: 90,
    /** Minimum time (ms) between two pinches, so one pinch can't toggle twice. */
    pinchCooldownMs: 400,
    /** Ignore pinches until a newly found hand has been visible this long (ms). */
    handSettleMs: 250,
    /** Run detection at most this often (ms); 0 = every new camera frame. */
    detectIntervalMs: 0,
    /** Hand missing longer than this (ms) breaks the current stroke (brief dropouts don't). */
    lostMs: 400,
    /** If average detection takes longer than this (ms), turn hand tracking off. */
    tooSlowMs: 70,
    /** One-Euro filter params for fingertip smoothing (positions are 0..1 screen coords). */
    minCutoff: 2.5,
    beta: 6,
  },

} as const;
