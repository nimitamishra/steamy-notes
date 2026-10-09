import "./ui/styles.css";
import { capture } from "./capture";
import { config } from "./config";
import { cameraToScreen, coverFit, type CoverFit } from "./coords";
import { BlowDetector, type AudioFeatures } from "./input/blowDetector";
import { analyzeHand, PinchTracker, type BrushSample, type Landmark } from "./input/gestures";
import { FaceTracker, HandTracker } from "./input/vision";
import { attachHuffKey, attachPointer } from "./input/pointerFallback";
import { OneEuro } from "./input/smoothing";
import { attachVideo, requestMedia, setTracksEnabled, type MediaGrant } from "./media/camera";
import { Mic } from "./media/mic";
import { Drips } from "./render/drips";
import { Renderer } from "./render/renderer";
import { loadSettings, nextHint, saveSettings, type HintStep } from "./state";
import { StrokeBook, type Stamp, type StrokeKind } from "./strokes";
import { Hint, Toast } from "./ui/bubbles";
import { Cursor } from "./ui/cursor";
import { Toolbar, type Action } from "./ui/toolbar";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function main(): void {
  if (new URLSearchParams(location.search).has("embed")) document.body.classList.add("embed");

  const canvas = $<HTMLCanvasElement>("mirror");
  const video = $<HTMLVideoElement>("video");
  const startEl = $("start");
  const beginBtn = $<HTMLButtonElement>("begin");
  const huffBtn = $<HTMLButtonElement>("huff");

  let renderer: Renderer;
  try {
    renderer = new Renderer(canvas);
  } catch (e) {
    console.error(e);
    startEl.hidden = true;
    $("unsupported").hidden = false;
    return;
  }

  const settings = loadSettings();
  const hint = new Hint($("hint"));
  const toast = new Toast($("toast"));
  const cursor = new Cursor($("cursor"), $("app"));
  const strokes = new StrokeBook();
  const drips = new Drips();
  const detector = new BlowDetector();
  const pinch = new PinchTracker();
  const fx = new OneEuro(config.hand.minCutoff, config.hand.beta);
  const fy = new OneEuro(config.hand.minCutoff, config.hand.beta);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touchFirst = matchMedia("(pointer: coarse)").matches;
  const debugEl = new URLSearchParams(location.search).has("debug") ? $("debug") : null;
  if (debugEl) debugEl.hidden = false;

  let media: MediaGrant = { video: null, audio: null };
  let audioCtx: AudioContext | null = null;
  let mic: Mic | null = null;
  let handTracker: HandTracker | null = null;
  let faceTracker: FaceTracker | null = null;

  // ---- live state ----
  let humidity = 0;
  let huffHeld = false;
  let eraser = false;
  let penDown = false; // hand pen state
  let strokeSource: "hand" | "pointer" | null = null;
  let handSeenAt = -Infinity;
  let lastHandT = 0;
  let queued: Stamp[] = [];
  let hintStep: HintStep = "blow";
  let wroteThisStroke = false;
  let penUpAfterWriting = false;
  let raf = 0;
  let lastT = 0;
  let lastDetect = 0;
  let needsResize = true;
  let lastFeatures: AudioFeatures | null = null;
  let lastPinchRatio = NaN;
  // Face: smoothed pucker + where the mouth is, so breath lands in front of it.
  let faceSeenAt = -Infinity;
  let lastFaceDetect = 0;
  let pucker = 0;
  const mouth = { x: 0.5, y: 0.55 };
  const DEFAULT_BLOW_CENTER = { x: 0.5, y: 0.55 };

  const queue = (s: Stamp[]) => {
    if (s.length) queued.push(...s);
  };
  const strokeKind = (): StrokeKind => (eraser ? "fog" : "wipe");
  const syncToolbar = () => toolbar.sync(settings, eraser, strokes.canUndo);

  const fit = (): CoverFit =>
    video.videoWidth
      ? coverFit(video.videoWidth, video.videoHeight, canvas.width, canvas.height)
      : coverFit(1, 1, 1, 1);

  const endStroke = (now: number, discardTail: boolean) => {
    queue(strokes.end(now, discardTail));
    if (wroteThisStroke) penUpAfterWriting = true;
    wroteThisStroke = false;
    strokeSource = null;
    syncToolbar();
  };

  // ---- hand input ----
  const setPen = (down: boolean, now: number) => {
    penDown = down;
    if (!down && strokeSource === "hand") endStroke(now, true);
  };

  const handleHand = (lm: Landmark[] | null, now: number) => {
    if (!lm) {
      if (now - handSeenAt > config.hand.lostMs) {
        if (strokeSource === "hand") endStroke(now, false);
        pinch.reset();
        fx.reset();
        fy.reset();
        cursor.hide();
      }
      return;
    }
    handSeenAt = now;
    const shape = analyzeHand(lm, video.videoWidth / video.videoHeight, fit());
    lastPinchRatio = shape.pinchRatio;
    const p = pinch.update(shape.pinchRatio);
    // Pinch once to start writing, pinch again to stop.
    if (p.started) setPen(!penDown, now);

    const dt = Math.max(0.001, (now - lastHandT) / 1000);
    lastHandT = now;
    const tip = shape.indexTip;
    const brush: BrushSample = { x: fx.filter(tip.x, dt), y: fy.filter(tip.y, dt), r: config.brush.fingerRadius };

    if (strokeSource === "pointer") return;
    if (penDown) cursor.update(brush.x, brush.y, eraser);
    else cursor.hide();
    if (penDown) {
      if (strokeSource !== "hand") {
        strokes.begin(strokeKind(), config.brush.commitDelayMs);
        strokeSource = "hand";
      }
      queue(strokes.add(brush, now));
    }
  };

  // ---- pointer input (mouse / touch) ----
  const pointerBrush = (x: number, y: number): BrushSample => ({ x, y, r: config.brush.pointerRadius });
  attachPointer(canvas, {
    down(x, y) {
      if (strokeSource === "hand") return;
      strokeSource = "pointer";
      strokes.begin(strokeKind(), 0);
      queue(strokes.add(pointerBrush(x, y), performance.now()));
    },
    move(x, y) {
      if (strokeSource !== "pointer") return;
      queue(strokes.add(pointerBrush(x, y), performance.now()));
    },
    up() {
      if (strokeSource !== "pointer") return;
      endStroke(performance.now(), false);
    },
  });

  // ---- huff (no-mic fallback) ----
  const setHuff = (held: boolean) => {
    huffHeld = held;
    huffBtn.classList.toggle("active", held);
  };
  attachHuffKey(setHuff);
  huffBtn.addEventListener("pointerdown", (e) => {
    huffBtn.setPointerCapture(e.pointerId);
    setHuff(true);
  });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) huffBtn.addEventListener(ev, () => setHuff(false));

  // ---- toolbar ----
  const onAction = async (a: Action) => {
    const now = performance.now();
    switch (a) {
      case "capture": {
        const flash = $("flash");
        flash.classList.remove("go");
        void flash.offsetWidth; // restart animation
        flash.classList.add("go");
        try {
          const r = await capture(canvas);
          if (r === "downloaded") toast.show("saved");
        } catch {
          toast.show("couldn't save that one");
        }
        break;
      }
      case "undo":
        if (strokeSource) endStroke(now, false);
        queue(strokes.undo());
        break;
      case "eraser":
        eraser = !eraser;
        toast.show(eraser ? "eraser on. your finger puts fog back" : "eraser off");
        break;
      case "refog":
        renderer.fill(config.fog.refogLevel);
        humidity = Math.max(humidity, 0.9);
        break;
      case "restart":
        if (strokeSource) endStroke(now, false);
        renderer.fill(0);
        humidity = 0;
        penDown = false;
        strokes.clear();
        drips.clear();
        break;
      case "style":
        settings.fogStyle = settings.fogStyle === "droplets" ? "plain" : "droplets";
        saveSettings(settings);
        break;
    }
    syncToolbar();
  };
  const toolbar = new Toolbar($("toolbar"), (a) => void onAction(a));

  // ---- hints ----
  const hintText = (): string | null => {
    const handVisible = performance.now() - handSeenAt < 1000;
    const usingHand = handTracker !== null;
    switch (hintStep) {
      case "blow":
        if (mic) return "blow on the mirror";
        if (faceTracker) return "purse your lips and blow at the mirror";
        return touchFirst ? "hold the button to fog it up" : "hold space to fog it up";
      case "pinch":
        if (!usingHand) return touchFirst ? "write with your finger" : "click and drag to write";
        if (!handVisible) return "raise a hand, then pinch to write";
        return "pinch to start writing";
      case "write":
        return usingHand ? "write with your index finger" : null;
      case "lift":
        if (!usingHand || strokeSource === "pointer") return null;
        return "pinch again to stop writing";
      case "done":
        return humidity < 0.08 && !huffHeld ? "all clear. blow to fog it up again" : null;
    }
  };

  const updateHints = () => {
    if (strokes.currentLength() > 0.2) wroteThisStroke = true;
    hintStep = nextHint(hintStep, {
      fogged: humidity > 0.35,
      penDown: penDown || strokeSource === "pointer",
      wrote: wroteThisStroke,
      penUpAfterWriting,
    });
    hint.set(hintText());
  };

  // ---- main loop ----
  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
    lastT = t;

    if (needsResize) {
      renderer.resize();
      strokes.aspect = renderer.aspect;
      needsResize = false;
    }
    renderer.uploadVideo(video);

    if (faceTracker && t - lastFaceDetect >= config.face.detectIntervalMs) {
      lastFaceDetect = t;
      const face = faceTracker.detect(video, t);
      if (face) {
        faceSeenAt = t;
        pucker += (face.pucker - pucker) * 0.5;
        const m = cameraToScreen(face.mouth.x, face.mouth.y, fit());
        mouth.x += (m.x - mouth.x) * 0.3;
        mouth.y += (m.y - mouth.y) * 0.3;
      }
      if (faceTracker.tooSlow) {
        faceTracker.close();
        faceTracker = null;
      }
    }
    const faceVisible = faceTracker !== null && t - faceSeenAt < config.face.lostMs;

    let blow = huffHeld ? 1 : 0;
    if (mic || faceVisible) {
      lastFeatures = mic ? mic.read() : null;
      blow = Math.max(blow, detector.update(lastFeatures, dt * 1000, faceVisible ? pucker : null).strength);
    }
    humidity =
      blow > 0
        ? Math.min(1, humidity + blow * config.fog.humidityGain * dt)
        : Math.max(0, humidity - config.fog.humidityDecay * dt);

    if (handTracker && t - lastDetect >= config.hand.detectIntervalMs) {
      lastDetect = t;
      const lm = handTracker.detect(video, t);
      if (lm !== undefined) handleHand(lm, t);
      if (handTracker.tooSlow) {
        handTracker.close();
        handTracker = null;
        cursor.hide();
        toast.show("hand tracking is slow on this device. use touch instead", 4000);
      }
    }

    const dripStamps = drips.update(dt, humidity, settings.fogStyle === "droplets" && !reducedMotion);
    renderer.frame({
      dt,
      time: t / 1000,
      blow: blow * config.fog.blowRate,
      blowCenter: faceVisible ? mouth : DEFAULT_BLOW_CENTER,
      humidity,
      stamps: queued.concat(dripStamps),
      drips: drips.heads(),
      fit: fit(),
      droplets: settings.fogStyle === "droplets",
    });
    queued = [];
    updateHints();
    if (debugEl) renderDebug(blow);
  };

  const renderDebug = (blow: number) => {
    const f = lastFeatures;
    const c = config.blow;
    const mark = (ok: boolean) => (ok ? "✅" : "·");
    debugEl!.textContent = [
      `mic       ${mic ? audioCtx?.state : "none"}`,
      f ? `rms       ${f.rms.toFixed(3)}  ${mark(f.rms > c.minRms)} (min ${c.minRms})` : "rms       —",
      f ? `flatness  ${f.flatness.toFixed(3)}  ${mark(f.flatness > c.minFlatness)} (> ${c.minFlatness})` : "",
      f ? `lowRatio  ${f.lowRatio.toFixed(3)}  ${mark(f.lowRatio > c.minLowRatio)} (> ${c.minLowRatio})` : "",
      `face      ${faceTracker ? (performance.now() - faceSeenAt < config.face.lostMs ? "seen" : "—") : "off"}  pucker ${pucker.toFixed(2)} (> ${c.minPucker}; no-mic > ${c.silentPucker})`,
      `blowing   ${detector.blowing ? "YES" : "no"}  strength ${blow.toFixed(2)}  [${detector.reason}]`,
      `humidity  ${humidity.toFixed(2)}`,
      `hand      ${handTracker ? (performance.now() - handSeenAt < 300 ? "seen" : "—") : "off"}  pinch ${lastPinchRatio.toFixed(2)} (on < ${config.hand.pinchOn}, off > ${config.hand.pinchOff})`,
      `pen       ${penDown ? "DOWN" : "up"}`,
    ].join("\n");
  };

  const startLoop = () => {
    cancelAnimationFrame(raf);
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  };

  new ResizeObserver(() => (needsResize = true)).observe(canvas);

  // Dev-only: step frames by hand (rAF doesn't run in hidden/automated tabs).
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __fog: {
        step(n = 1, dtMs = 16) {
          for (let i = 0; i < n; i++) {
            frame(lastT + dtMs);
            cancelAnimationFrame(raf);
          }
        },
        state: () => ({ humidity, hintStep, penDown, strokeSource, hand: !!handTracker, face: !!faceTracker, mic: !!mic }),
      },
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (startEl.isConnected && !startEl.classList.contains("leaving")) return;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      setTracksEnabled([media.video, media.audio], false);
      void audioCtx?.suspend();
    } else {
      setTracksEnabled([media.video, media.audio], true);
      void audioCtx?.resume();
      startLoop();
    }
  });

  // Browsers may suspend audio (e.g. after a permission prompt); any tap wakes it back up.
  window.addEventListener("pointerdown", () => {
    if (audioCtx?.state === "suspended") void audioCtx.resume();
  });

  // ---- start ----
  beginBtn.addEventListener("click", async () => {
    beginBtn.disabled = true;
    beginBtn.textContent = "starting…";
    // Create audio inside the click so browsers allow it to start.
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AC();

    // ?nomedia skips camera/mic — handy for testing the fallbacks and fog rendering.
    const skipMedia = new URLSearchParams(location.search).has("nomedia");
    media = skipMedia ? { video: null, audio: null } : await requestMedia();
    if (media.video) {
      await attachVideo(video, media.video).catch(() => (media.video = null));
    }
    if (media.audio) {
      mic = new Mic(audioCtx, media.audio);
      await audioCtx.resume();
    }

    huffBtn.hidden = mic !== null && !touchFirst;
    startEl.classList.add("leaving");
    setTimeout(() => startEl.remove(), 600);
    toolbar.show();
    syncToolbar();
    startLoop();

    if (!media.video && !media.audio) toast.show("no camera or mic. hold space to fog, drag to write", 4000);
    else if (!media.video) toast.show("no camera. writing on a blank mirror", 4000);
    else if (!media.audio) toast.show(touchFirst ? "no mic. hold the button to fog" : "no mic. hold space to fog", 4000);

    if (media.video) {
      HandTracker.create()
        .then((t) => (handTracker = t))
        .catch((e) => {
          console.warn("Hand tracking unavailable", e);
          toast.show("hand tracking unavailable. drag to write instead", 4000);
        });
      // Optional: confirms blows (and lets you fog without a mic). The app works fine without it.
      FaceTracker.create()
        .then((t) => (faceTracker = t))
        .catch((e) => console.warn("Face tracking unavailable", e));
    }
  });
}

main();
