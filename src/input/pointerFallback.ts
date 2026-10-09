export interface PointerHandlers {
  down(x: number, y: number): void;
  move(x: number, y: number): void;
  up(): void;
}

/** Mouse/touch drawing on the canvas. Coordinates are 0..1 of the element (already mirror space). */
export function attachPointer(el: HTMLElement, h: PointerHandlers): void {
  let activeId: number | null = null;
  const pos = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const;
  };

  el.addEventListener("pointerdown", (e) => {
    if (activeId !== null) return;
    activeId = e.pointerId;
    el.setPointerCapture(e.pointerId);
    h.down(...pos(e));
    e.preventDefault();
  });
  el.addEventListener("pointermove", (e) => {
    if (e.pointerId === activeId) h.move(...pos(e));
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    h.up();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

/** Space bar (held) acts as a blow. Ignored while typing in inputs. */
export function attachHuffKey(onChange: (held: boolean) => void): void {
  const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || isTyping(e)) return;
    e.preventDefault();
    if (!e.repeat) onChange(true);
  });
  window.addEventListener("keyup", (e) => {
    if (e.code !== "Space") return;
    e.preventDefault(); // otherwise a focused toolbar button would also "click"
    onChange(false);
  });
  window.addEventListener("blur", () => onChange(false));
}
