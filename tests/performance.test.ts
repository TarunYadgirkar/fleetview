import { describe, expect, it } from 'vitest';
import { buildWarehouse } from '../src/presets/builder';
import { Simulation } from '../src/sim/simulation';
import { defaultFleetSpec, defaultSimConfig } from '../src/sim/types';

describe('performance', () => {
  it('50 robots on 100x100, 10k ticks < 10s', () => {
    const { grid, starts } = buildWarehouse({ width: 100, height: 100 });
    const fleet = defaultFleetSpec(50);
    const config = {
      ...defaultSimConfig(1),
      maxTicks: 10000,
      orderCount: 0, // unlimited: keep robots busy the whole run
      orderRate: 5,
    };
    const sim = new Simulation(grid, fleet, config, starts.slice(0, 50));
    const t0 = performance.now();
    sim.run();
    const elapsed = performance.now() - t0;
    expect(sim.tick).toBe(10000);
    expect(elapsed, `took ${elapsed.toFixed(0)}ms`).toBeLessThan(10000);
  });
});
