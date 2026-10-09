import { FaceLandmarker, FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { config } from "../config";
import type { Landmark } from "./gestures";

/** The first detections include GPU/graph warm-up and are much slower than steady state. */
const WARMUP_FRAMES = 15;

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

const base = () => new URL("mediapipe/", document.baseURI).href;
let filesetPromise: Promise<Fileset> | null = null;
/** Shared wasm runtime for both trackers, self-hosted from public/mediapipe. */
const fileset = () => (filesetPromise ??= FilesetResolver.forVisionTasks(base() + "wasm"));

/** Tries the GPU first, then CPU. */
async function withDelegate<T>(create: (delegate: "GPU" | "CPU") => Promise<T>): Promise<T> {
  try {
    return await create("GPU");
  } catch {
    return await create("CPU");
  }
}

/** Times detections and skips frames that haven't changed. */
class Timed {
  private lastVideoTime = -1;
  private avgMs = 0;
  private samples = 0;

  /** True once detection has proven too slow on this device to feel responsive. */
  get tooSlow(): boolean {
    return this.samples >= WARMUP_FRAMES + 30 && this.avgMs > config.hand.tooSlowMs;
  }

  protected run<T>(video: HTMLVideoElement, fn: () => T): T | undefined {
    if (video.readyState < 2 || video.currentTime === this.lastVideoTime) return undefined;
    this.lastVideoTime = video.currentTime;
    const t0 = performance.now();
    const out = fn();
    const ms = performance.now() - t0;
    this.samples++;
    if (this.samples > WARMUP_FRAMES) this.avgMs = this.avgMs === 0 ? ms : this.avgMs * 0.9 + ms * 0.1;
    return out;
  }
}

export class HandTracker extends Timed {
  private constructor(private landmarker: HandLandmarker) {
    super();
  }

  static async create(): Promise<HandTracker> {
    const fs = await fileset();
    const lm = await withDelegate((delegate) =>
      HandLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: base() + "hand_landmarker.task", delegate },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
      }),
    );
    return new HandTracker(lm);
  }

  /** Returns landmarks, null if no hand, or undefined if the frame hasn't changed. */
  detect(video: HTMLVideoElement, nowMs: number): Landmark[] | null | undefined {
    return this.run(video, () => this.landmarker.detectForVideo(video, nowMs).landmarks[0] ?? null);
  }

  close(): void {
    this.landmarker.close();
  }
}

export interface FaceReading {
  /** 0..1 — how much the face looks like it's blowing (pursed / rounded lips, puffed cheeks). */
  pucker: number;
  /** Mouth center in camera space (not mirrored). */
  mouth: Landmark;
}

// Inner upper / lower lip landmarks in the 478-point face mesh.
const UPPER_LIP = 13;
const LOWER_LIP = 14;

export class FaceTracker extends Timed {
  private constructor(private landmarker: FaceLandmarker) {
    super();
  }

  static async create(): Promise<FaceTracker> {
    const fs = await fileset();
    const lm = await withDelegate((delegate) =>
      FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: base() + "face_landmarker.task", delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      }),
    );
    return new FaceTracker(lm);
  }

  /** Returns a reading, null if no face, or undefined if the frame hasn't changed. */
  detect(video: HTMLVideoElement, nowMs: number): FaceReading | null | undefined {
    return this.run(video, () => {
      const res = this.landmarker.detectForVideo(video, nowMs);
      const pts = res.faceLandmarks[0];
      const shapes = res.faceBlendshapes[0]?.categories;
      if (!pts || !shapes) return null;
      const score = (name: string) => shapes.find((c) => c.categoryName === name)?.score ?? 0;
      return {
        pucker: Math.max(score("mouthPucker"), score("mouthFunnel"), score("cheekPuff")),
        mouth: { x: (pts[UPPER_LIP].x + pts[LOWER_LIP].x) / 2, y: (pts[UPPER_LIP].y + pts[LOWER_LIP].y) / 2 },
      };
    });
  }

  close(): void {
    this.landmarker.close();
  }
}
