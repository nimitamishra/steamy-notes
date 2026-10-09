import type { BrushSize } from "../state";

export type Action = "capture" | "undo" | "eraser" | "refog" | "restart";

export class Toolbar {
  private buttons = new Map<Action, HTMLButtonElement>();
  private sizes: HTMLButtonElement[];

  constructor(
    private el: HTMLElement,
    onAction: (a: Action) => void,
    onSize: (s: BrushSize) => void,
  ) {
    el.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((b) => {
      const action = b.dataset.action as Action;
      this.buttons.set(action, b);
      b.addEventListener("click", () => onAction(action));
    });
    this.sizes = [...el.querySelectorAll<HTMLButtonElement>("button[data-size]")];
    for (const b of this.sizes) b.addEventListener("click", () => onSize(b.dataset.size as BrushSize));
  }

  show(): void {
    this.el.hidden = false;
  }

  sync(eraser: boolean, canUndo: boolean, size: BrushSize): void {
    this.buttons.get("eraser")?.setAttribute("aria-pressed", String(eraser));
    const undo = this.buttons.get("undo");
    if (undo) undo.disabled = !canUndo;
    for (const b of this.sizes) b.setAttribute("aria-checked", String(b.dataset.size === size));
  }
}
