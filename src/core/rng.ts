/**
 * Deterministic seeded PRNG. mulberry32 — small, fast, good enough for simulation.
 * Every stochastic decision in core/sim threads one of these explicitly; no globals.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // force to uint32; avoid seed 0 collapsing patterns
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** next float in [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** number of events in one tick given a mean rate (Knuth Poisson) */
  poisson(mean: number): number {
    if (mean <= 0) return 0;
    const L = Math.exp(-mean);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }

  /** snapshot internal state for save/restore (determinism across resume) */
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}
