# steamy notes

Your webcam becomes a bathroom mirror. Blow on it to fog it up, pinch, and write a note in the steam with your finger.

- **Blowing** is detected with the mic and confirmed by your face (pursed lips), so talking doesn't fog the mirror. The fog forms in front of your mouth and slowly fades, like real condensation.
- **Writing** uses [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) hand tracking. Pinch to start writing with your index finger, and pinch again to stop.
- **Drops**: condensation beads, plus drips that run down and leave clear streaks.
- Save a photo, undo, eraser, refog, clear.
- Works without hand tracking or a mic, using mouse, touch, or the space bar instead.
- Runs entirely in your browser. Nothing is uploaded.

## Run it

```bash
npm install      # also fetches the MediaPipe hand + face models into public/mediapipe
npm run dev      # http://localhost:5173
```

To try it on a phone on the same Wi-Fi, run `npm run dev:host`. It serves over HTTPS with a self-signed certificate, which is needed because browsers only allow camera and mic on secure pages. Accept the certificate warning on the phone.

| Command | |
|---|---|
| `npm test` | unit tests (blow detection, gestures, strokes) |
| `npm run typecheck` | TypeScript |
| `npm run build` | static site → `dist/` |

Add `?nomedia` to the URL to skip camera and mic. You can still fog the mirror with Space or the huff button and draw with the mouse. Add `?debug` to show live mic, face, and pinch readings, which helps when tuning blow detection.

## How to play

| Do this | To |
|---|---|
| Purse your lips and blow (or hold **Space** / **hold to blow**) | fog the mirror |
| Pinch | start writing with your index finger |
| Pinch again | stop writing |
| Click and drag, or touch | write without hand tracking |

## Deploy & embed

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. Enable it once in **Settings → Pages → Source: GitHub Actions**.

Embed it anywhere with an iframe. The `allow` attribute is required for camera and mic:

```html
<iframe src="https://<you>.github.io/steamy-notes/?embed=1"
        allow="camera; microphone; web-share"
        style="border:0;width:100%;aspect-ratio:4/3"></iframe>
```

For Next.js, copy [`examples/nextjs/SteamyNotes.tsx`](examples/nextjs/SteamyNotes.tsx). It only loads the iframe after a click, so visitors aren't asked for permissions as soon as the page opens.

## How it works

See [AGENTS.md](AGENTS.md) for the architecture, the fog simulation, and the conventions.
