import type { Rng } from '../core/rng';
import type { SimConfig } from './types';

export interface Order {
  id: number;
  arrivalTick: number;
  /** cell id of the pick station */
  pick: number;
  /** cell id of the deposit station */
  deposit: number;
  assignedTo: number;
  completedTick: number;
}

/**
 * Seeded order arrivals. Poisson by mean rate (realistic), or a fixed interval (easier to
 * reason about in tests). Every draw goes through the injected Rng so a run is reproducible.
 */
export class OrderSource {
  private nextId = 0;
  private generated = 0;

  constructor(
    private readonly config: SimConfig,
    private readonly pickCells: number[],
    private readonly depositCells: number[],
  ) {}

  get totalGenerated(): number {
    return this.generated;
  }

  get exhausted(): boolean {
    return this.config.orderCount > 0 && this.generated >= this.config.orderCount;
  }

  /** orders arriving on this tick */
  arrivals(tick: number, rng: Rng): Order[] {
    if (this.pickCells.length === 0 || this.depositCells.length === 0) return [];
    if (this.exhausted) return [];

    let count: number;
    if (this.config.orderMode === 'fixed') {
      const interval = Math.max(1, Math.round(1 / Math.max(this.config.orderRate, 1e-9)));
      count = tick % interval === 0 ? 1 : 0;
    } else {
      count = rng.poisson(this.config.orderRate);
    }

    if (this.config.orderCount > 0) {
      count = Math.min(count, this.config.orderCount - this.generated);
    }

    const out: Order[] = [];
    for (let i = 0; i < count; i++) {
      const pick = this.pickCells[rng.int(0, this.pickCells.length - 1)];
      const deposit = this.depositCells[rng.int(0, this.depositCells.length - 1)];
      out.push({
        id: this.nextId++,
        arrivalTick: tick,
        pick,
        deposit,
        assignedTo: -1,
        completedTick: -1,
      });
      this.generated++;
    }
    return out;
  }
}
