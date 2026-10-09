export type BrushSize = "s" | "m" | "l";

export interface Settings {
  brushSize: BrushSize;
}

const KEY = "steamy-notes:settings";

export function loadSettings(): Settings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    return { brushSize: parsed.brushSize === "s" || parsed.brushSize === "l" ? parsed.brushSize : "m" };
  } catch {
    // Storage can throw in sandboxed / third-party iframes.
    return { brushSize: "m" };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore — settings just won't persist */
  }
}

/** First-run coaching: each step advances once the user does it. */
export type HintStep = "blow" | "pinch" | "write" | "lift" | "done";

export function nextHint(
  step: HintStep,
  ev: { fogged: boolean; penDown: boolean; wrote: boolean; penUpAfterWriting: boolean },
): HintStep {
  switch (step) {
    case "blow":
      return ev.fogged ? "pinch" : step;
    case "pinch":
      return ev.penDown ? "write" : step;
    case "write":
      return ev.wrote ? "lift" : step;
    case "lift":
      return ev.penUpAfterWriting ? "done" : step;
    case "done":
      return step;
  }
}
