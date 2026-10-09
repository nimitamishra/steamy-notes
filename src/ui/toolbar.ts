import type { Settings } from "../state";

export type Action = "capture" | "undo" | "eraser" | "refog" | "restart" | "style";

export class Toolbar {
  private buttons = new Map<Action, HTMLButtonElement>();

  constructor(
    private el: HTMLElement,
    onAction: (a: Action) => void,
  ) {
    el.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((b) => {
      const action = b.dataset.action as Action;
      this.buttons.set(action, b);
      b.addEventListener("click", () => onAction(action));
    });
  }

  show(): void {
    this.el.hidden = false;
  }

  sync(s: Settings, eraser: boolean, canUndo: boolean): void {
    this.label("style", s.fogStyle === "droplets" ? "on" : "off");
    this.buttons.get("eraser")?.setAttribute("aria-pressed", String(eraser));
    const undo = this.buttons.get("undo");
    if (undo) undo.disabled = !canUndo;
  }

  private label(a: Action, text: string): void {
    const span = this.buttons.get(a)?.querySelector("[data-label]");
    if (span) span.textContent = text;
  }
}
