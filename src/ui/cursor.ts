/** Glowing dot on the index fingertip, shown only while writing with the hand. */
export class Cursor {
  constructor(
    private el: HTMLElement,
    private host: HTMLElement,
  ) {}

  /** x, y in 0..1 screen space. */
  update(x: number, y: number, eraser: boolean): void {
    this.el.style.transform = `translate(${x * this.host.clientWidth}px, ${y * this.host.clientHeight}px)`;
    this.el.classList.add("show");
    this.el.classList.toggle("eraser", eraser);
  }

  hide(): void {
    this.el.classList.remove("show");
  }
}
