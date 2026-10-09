// Mapping between mirror-space screen coords and camera coords.
// Screen coords: 0..1 across the canvas, y down, already mirrored (what the user sees).
// Camera coords: 0..1 across the raw video frame, y down, NOT mirrored (what MediaPipe reports).

/** videoUVmirrored = screenUV * scale + offset (object-fit: cover). */
export interface CoverFit {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

export function coverFit(videoW: number, videoH: number, screenW: number, screenH: number): CoverFit {
  const va = videoW / videoH;
  const sa = screenW / screenH;
  if (va > sa) {
    // Video is wider than the screen: crop the sides.
    const scaleX = sa / va;
    return { scaleX, scaleY: 1, offsetX: (1 - scaleX) / 2, offsetY: 0 };
  }
  const scaleY = va / sa;
  return { scaleX: 1, scaleY, offsetX: 0, offsetY: (1 - scaleY) / 2 };
}

/** Camera-space point → mirror screen-space point. The ONLY place the horizontal flip happens. */
export function cameraToScreen(x: number, y: number, fit: CoverFit): { x: number; y: number } {
  const mx = 1 - x;
  return { x: (mx - fit.offsetX) / fit.scaleX, y: (y - fit.offsetY) / fit.scaleY };
}
