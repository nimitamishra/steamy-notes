// One-Euro filter (Casiez et al. 2012): low jitter when still, low lag when moving fast.

class LowPass {
  private y: number | null = null;
  filter(x: number, alpha: number): number {
    this.y = this.y === null ? x : this.y + alpha * (x - this.y);
    return this.y;
  }
  get last(): number | null {
    return this.y;
  }
  reset(): void {
    this.y = null;
  }
}

const alphaFor = (cutoff: number, dtS: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dtS);
};

export class OneEuro {
  private x = new LowPass();
  private dx = new LowPass();

  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff = 1,
  ) {}

  filter(value: number, dtS: number): number {
    const prev = this.x.last;
    const d = prev === null || dtS <= 0 ? 0 : (value - prev) / dtS;
    const edx = this.dx.filter(d, alphaFor(this.dCutoff, Math.max(dtS, 1e-3)));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alphaFor(cutoff, Math.max(dtS, 1e-3)));
  }

  reset(): void {
    this.x.reset();
    this.dx.reset();
  }
}
