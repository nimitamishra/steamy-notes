export type FogStyle = "plain" | "droplets";

export interface Settings {
  fogStyle: FogStyle;
}

const KEY = "steamy-notes:settings";
const DEFAULTS: Settings = { fogStyle: "droplets" };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      fogStyle: parsed.fogStyle === "plain" ? "plain" : "droplets",
    };
  } catch {
    // Storage can throw in sandboxed / third-party iframes.
    return { ...DEFAULTS };
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
