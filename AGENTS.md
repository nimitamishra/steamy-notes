# AGENTS.md — steamy notes

Guidance for AI agents and humans working in this repo. Read this before changing code.

## What this is

A browser app that turns the user's front camera into a **mirror** they can fog up by **blowing into the mic**, then **write on with their fingers** (tracked by hand tracking) — just like a bathroom mirror after a hot shower. Everything runs on-device; no server, no uploads.

Two delivery targets, one codebase:
1. **Standalone** — static site on GitHub Pages; anyone can fork/clone and run it.
2. **Embeddable** — dropped into the author's Next.js site as an `<iframe>` (live interactive demo).

Must work on **laptop/desktop and phones/tablets**. UI should feel **quiet and designed, not generated**: see "UI / visual direction".

## Experience spec

### States

```
START ──(tap "Begin", grant camera+mic)──▶ MIRROR (clear)
MIRROR ──(blow)──▶ fog accumulates while blowing (gradual, soft-edged)
FOGGED, pen up ──(pinch)──▶ pen down: index fingertip wipes fog along its path
pen down ──(pinch again)──▶ pen up
```

- **Mirror:** front camera, horizontally flipped. Plain mirror — the room is visible, no background removal. Minimal chrome over the video.
- **Blow detection (mic + face):** blowing adds fog; longer/stronger blows add more. Mic signature = loud + sustained (≥150ms) + noise-like (breath across the mic) or bass-heavy (straight into it). The face (MediaPipe `FaceLandmarker` blendshapes: max of `mouthPucker`, `mouthFunnel`, `cheekPuff`) confirms it:
  - face visible → needs pucker **and** breath; talking with a relaxed mouth won't fog. A very strong breath (3× threshold) still counts in case the pucker is missed.
  - no face → mic only. No mic → a clearly held pucker fogs on its own, more gently.
  - Breath lands **in front of the mouth** (mouth position drives the fog's blow center).
  - Tune live with `?debug` (shows the reason each frame did/didn't count).
- **Fog is a living surface** (behave like real life):
  - With no blowing, fog slowly evaporates over time.
  - Wiped areas slowly, **partially** re-fog (never fully back to original density on their own).
  - Blowing again thickens fog everywhere, including over writing (partially obscuring it).
- **Writing with the hand:** nothing is drawn (and no cursor shown) until the user **pinches**. Then the **index fingertip only** is the pen, at a fixed width. **Pinch again** to stop. The last `commitDelayMs` of a stroke is discarded on stop so the closing-pinch motion doesn't leave a mark. Before the first pinch, the hint confirms the hand was found.
- **Drips** (fog style "droplets"): condensation beads form where fog is dense; occasionally one grows heavy and **runs down**, wobbling slightly, clearing a streak behind it that slowly re-fogs. Style "plain" disables drips.

### Toolbar actions

| Action | Behavior |
|---|---|
| **Capture** | Save a PNG of exactly what the user sees (mirrored video + fog + writing). Web Share sheet on mobile when available, download otherwise. Small shutter flash. |
| **Undo** | Re-fog the most recent stroke's path (soft). Repeatable through stroke history. |
| **Eraser** (mode toggle) | While active, the brush *adds* fog instead of wiping — "rubbing out" writing. |
| **Refog** | Re-fog the whole mirror to full density instantly (fresh surface, no blowing needed). |
| **Restart** | Back to a clear mirror; history cleared; blow to start again. |
| **Fog style** | `plain` ↔ `droplets`. |

### Fallbacks (always available; also used for development)

- **No mic / denied:** hold **Space** or press-and-hold a "huff" button to fog.
- **No hand tracking / denied / slow device:** draw with **mouse or touch** (press = pen down). On phones, touch is the primary input; hand tracking stays enabled if performant.
- **No WebGL2:** show a friendly "your browser can't fog up 😢" message.

## Tech stack

| Concern | Choice |
|---|---|
| Build | Vite + TypeScript (strict). No UI framework — vanilla DOM + CSS. |
| Camera | `navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })` |
| Hand + face tracking | `@mediapipe/tasks-vision` `HandLandmarker` (1 hand, ~30fps) + `FaceLandmarker` with blendshapes (1 face, ~15fps), GPU delegate with CPU fallback, shared wasm runtime |
| Fonts | Instrument Serif (italic, name/headings) + DM Mono (all UI), bundled via `@fontsource` — no font CDN |
| Mic | Web Audio API: `AudioContext` + `AnalyserNode` |
| Rendering | WebGL2, raw (small helpers in `src/render/gl.ts`). No three.js. |
| Tests | Vitest for pure logic |
| Hosting | GitHub Pages via GitHub Actions |

MediaPipe WASM + model files are **self-hosted** under `public/mediapipe/` (copied at build/postinstall), not loaded from a CDN — privacy and reliability.

## Architecture

```
src/
  main.ts                 boot, input wiring, main loop (also the dev-only window.__fog hook)
  config.ts               ALL tunables (thresholds, rates, sizes) live here
  coords.ts               pure: cover-fit + camera→mirror-screen mapping (the only horizontal flip)
  state.ts                settings (persisted to localStorage) + first-run hint steps
  strokes.ts              pure: stroke history, stamp spacing, commit delay, Undo
  capture.ts              canvas → PNG → share sheet / download
  media/
    camera.ts             getUserMedia (camera+mic with per-device fallback), track enable/disable
    mic.ts                AudioContext + AnalyserNode → AudioFeatures
  input/
    blowDetector.ts       pure: spectrum frame → { blowing, strength }
    vision.ts             MediaPipe HandTracker + FaceTracker (pucker + mouth position); decoupled from render
    gestures.ts           pure: landmarks → pinch ratio (hysteresis) + index fingertip
    smoothing.ts          One-Euro filter for fingertip positions
    pointerFallback.ts    mouse/touch drawing + Space-key huff
  render/
    gl.ts                 shader/program/target helpers, fullscreen triangle
    renderer.ts           fog sim ping-pong + composite; resize resamples the fog
    drips.ts              CPU drip particles → wipe stamps + heads for the shader
    shaders/              common.glsl (noise), fogSim.frag, composite.frag, copy.frag
  ui/
    toolbar.ts, cursor.ts, bubbles.ts (hint + toast), styles.css
scripts/fetch-mediapipe.mjs   postinstall: copies wasm, downloads hand model → public/mediapipe (gitignored)
tests/                        Vitest unit tests for the pure modules
examples/nextjs/SteamyNotes.tsx click-to-load iframe wrapper for Next.js
```

### Fog simulation (the heart of it)

Fog **density** `D ∈ [0,1]` is a single-channel texture (≈ ¼ screen resolution), updated each frame on the GPU by ping-ponging two framebuffers:

```
D' = D
   + blowStrength * blowRate * dt * falloff(uv)        // blowing (soft radial, bottom-center biased)
   - evaporationRate * dt * D                          // fades when idle
   + regrowRate * dt * max(0, regrowCap - D)           // wiped areas partially refog
   then stamp strokes: wipe → D *= (1 - brushMask); eraser/undo → D += brushMask * k
   then stamp drip trails: D *= (1 - dripMask)
```

The **composite shader** samples the mirrored video twice — sharp, and blurred (mip/downsampled) — and mixes by `D`, adding a cool white haze and subtle low-frequency noise so fog isn't uniform. In `droplets` style, bead normals (procedural) refract the sharp video slightly and add specular highlights.

**Strokes** are recorded as point lists `{x, y, radius}[]` in normalized mirror-space so Undo can replay them as refog stamps and so resizes don't break them.

### Coordinate conventions

- Everything the user sees is **mirror space** (video flipped horizontally). MediaPipe landmarks arrive in camera space — flip `x → 1 - x` **once**, in `coords.ts#cameraToScreen`. Nowhere else.
- Shaders get two varyings: `v_tex` (GL texture space, y up) for sampling render targets, and `v_uv` (screen space, y down) for logic, stamps, and the video. Mixing them up flips the fog vertically.
- Normalized `[0,1]` coordinates internally; convert to pixels only at render time.
- Video uses *cover* fit; landmark → screen mapping must account for the crop (`coords.ts#coverFit`).

## Embedding contract

- Standalone URL: `https://<user>.github.io/<repo>/`
- Embed: `?embed=1` → hides title/footer, fills its container, transparent-friendly edges.
- Required iframe attributes (camera/mic are blocked without them):
  ```html
  <iframe src="https://<user>.github.io/<repo>/?embed=1"
          allow="camera; microphone; web-share"
          style="border:0;width:100%;aspect-ratio:4/3"></iframe>
  ```
- Next.js: use `examples/nextjs/SteamyNotes.tsx` (client component, lazy-loads the iframe only when scrolled into view / clicked, so the demo doesn't prompt for permissions on page load).
- Optional `postMessage` events to parent (`steamynotes:ready`, `steamynotes:capture`) — nice-to-have, not v1.

## UI / visual direction

Quiet, editorial, a little bathroom-tile. The fog is the star; chrome stays out of the way.
- **Avoid the "AI app" look:** no pastel gradients, glassmorphism, emoji in UI copy, sparkles, bouncy squish animations, or "let's go ✨" voice.
- **Type:** Instrument Serif italic for the name only; DM Mono 12px for everything else.
- **Color:** ink `#1c1d1f` on paper `#f3f2ee`, hairline borders `rgba(28,29,31,.14)`, small radii (5–8px). Active = ink fill. No accent color.
- **Toolbar:** text-only mono buttons ("save photo · undo · eraser · refog · clear | drops on").
- **Copy:** plain, lowercase, short, no emoji ("blow on the mirror", "pinch to start writing", "pinch again to stop").
- **Start screen:** big serif name, three numbered steps, one ink button.
- **Fingertip:** small white dot shown only while hand-writing (hollow ring when erasing).
- First-run hints advance as the user succeeds (blow → pinch → write → stop).
- Respect `prefers-reduced-motion` (no drips, no transitions). Touch targets ≥ 44px on coarse pointers.

## Conventions

- TypeScript strict; no `any` without a comment explaining why.
- **Pure logic is separate from browser APIs** (`blowDetector`, `gestures`, `smoothing`, `state`) so it's unit-testable.
- **Magic numbers go in `config.ts`**, with a one-line comment on units and intent.
- Don't add runtime dependencies without a strong reason; bundle size matters for the embed.
- CSS: `[hidden]` is forced to `display: none !important` — don't fight it with component display rules.
- Clean up media: stop tracks, close `AudioContext`, and pause the loop on `visibilitychange` hidden.
- No network calls at runtime other than loading own static assets.

## Commands

```bash
npm install        # also copies MediaPipe wasm/model into public/mediapipe
npm run dev        # dev server (camera needs a secure context; localhost is OK)
npm run dev:host   # HTTPS (self-signed) on the LAN, for testing on phones
npm run build      # static build → dist/
npm run preview    # serve dist/
npm test           # vitest
npm run typecheck
```

To test on a phone: `npm run dev:host` and open the HTTPS URL on the same network (accept the cert warning).

### Debugging without a camera

- `?nomedia` skips camera/mic; fog with Space or the huff button, draw with the mouse.
- `?debug` shows a live panel: mic RMS / flatness / lowRatio against their thresholds, blow state, humidity, pinch ratio, pen state.
- In dev builds, `window.__fog.step(n, dtMs)` advances `n` frames by hand and `window.__fog.state()` returns live state. Use this when automating a browser: `requestAnimationFrame` doesn't run in hidden/occluded tabs.
- A fake camera: draw into a canvas and set `video.srcObject = canvas.captureStream(30)`.

## Testing

- **Unit (Vitest):** blow detector on synthetic signals (white noise burst = blow; sine/speech-like = not), pinch hysteresis, index-tip mapping, hint transitions, stroke spacing/undo.
- **Manual QA checklist** (run before merging UI/render changes):
  - [ ] Permissions denied → fallbacks work, friendly message shown
  - [ ] Talking normally does not fog; a 0.5s blow visibly fogs
  - [ ] Pinch starts writing, pinch again stops, no stray mark from the stop-pinch; text reads correctly (not mirrored) to the user
  - [ ] Undo, Eraser, Refog, Restart behave per the table above
  - [ ] Drips run and leave streaks; `plain` has none
  - [ ] Capture matches the screen
  - [ ] Works in Chrome, Safari (macOS + iOS), Firefox; inside an iframe with `allow`
  - [ ] Tab hidden → camera/loop paused

## Roadmap

- **v1:** everything in "Experience spec" + fallbacks + Pages deploy + Next.js example.
- **Later:** multi-finger wipe width / pinch-and-hold mode (built then removed in v1 for simplicity), two-hand drawing, postMessage API, web component build, sound effects (squeak on wipe), share-link/gallery, palm-swipe gesture for Refog.
