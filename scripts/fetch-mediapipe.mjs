// Copies MediaPipe wasm out of node_modules and downloads the hand + face models,
// so the app self-hosts everything under public/mediapipe.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "mediapipe");
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const models = {
  "hand_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
};

mkdirSync(outDir, { recursive: true });

if (existsSync(wasmSrc)) {
  // The ES-module build isn't used (we load the classic script), so skip its ~13MB.
  cpSync(wasmSrc, join(outDir, "wasm"), {
    recursive: true,
    filter: (src) => !src.includes("vision_wasm_module_internal"),
  });
} else {
  console.warn("[fetch-mediapipe] tasks-vision not installed yet; skipping wasm copy");
}

for (const [file, url] of Object.entries(models)) {
  const path = join(outDir, file);
  if (existsSync(path)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[fetch-mediapipe] ${file} download failed: ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  console.log(`[fetch-mediapipe] downloaded ${file}`);
}
