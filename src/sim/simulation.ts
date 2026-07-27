import type { Grid } from '../core/grid';
import type { Cell } from '../core/types';
import type { FleetSpec, SimConfig, SimMetrics, SimResult, SimSnapshot } from './types';

export class Simulation {
  constructor(
    public readonly grid: Grid,
    public readonly fleet: FleetSpec,
    public readonly config: SimConfig,
    /** start cells for each robot; length is the effective fleet size. */
    public readonly starts: Cell[],
  ) {
    void this.grid;
    void this.fleet;
    void this.config;
    void this.starts;
  }

  get tick(): number {
    throw new Error('not implemented: Simulation.tick');
  }

  get done(): boolean {
    throw new Error('not implemented: Simulation.done');
  }

  step(): void {
    throw new Error('not implemented: Simulation.step');
  }

  /** returns list of invariant violations at the current tick (empty = ok). */
  checkInvariants(): string[] {
    throw new Error('not implemented: Simulation.checkInvariants');
  }

  snapshot(): SimSnapshot {
    throw new Error('not implemented: Simulation.snapshot');
  }

  metrics(): SimMetrics {
    throw new Error('not implemented: Simulation.metrics');
  }

  run(): SimResult {
    throw new Error('not implemented: Simulation.run');
  }
}
