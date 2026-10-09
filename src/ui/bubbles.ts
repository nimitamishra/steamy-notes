/** The coaching hint at the top. Setting the same text again is a no-op. */
export class Hint {
  private text = "";

  constructor(private el: HTMLElement) {}

  set(text: string | null): void {
    const next = text ?? "";
    if (next === this.text) return;
    this.text = next;
    if (next) this.el.textContent = next;
    this.el.classList.toggle("show", next !== "");
  }
}

/** Short-lived message above the toolbar. */
export class Toast {
  private timer = 0;

  constructor(private el: HTMLElement) {}

  show(text: string, ms = 2400): void {
    this.el.textContent = text;
    this.el.classList.add("show");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove("show"), ms);
  }
}
