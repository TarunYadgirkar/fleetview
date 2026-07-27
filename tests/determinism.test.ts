import { describe, expect, it } from 'vitest';
import { buildWarehouse } from '../src/presets/builder';
import { Simulation } from '../src/sim/simulation';
import { defaultFleetSpec, defaultSimConfig } from '../src/sim/types';

function run(seed: number) {
  const { grid, starts } = buildWarehouse({ width: 21, height: 13 });
  const fleet = defaultFleetSpec(7);
  const config = { ...defaultSimConfig(seed), maxTicks: 3000, orderCount: 40 };
  const sim = new Simulation(grid, fleet, config, starts.slice(0, 7));
  return sim.run().metrics;
}

describe('determinism', () => {
  it('same seed + layout → identical metrics', () => {
    const a = run(123);
    const b = run(123);
    expect(a).toEqual(b);
  });

  it('same seed → identical per-tick snapshots', () => {
    const build = () => {
      const { grid, starts } = buildWarehouse({ width: 21, height: 13 });
      const config = { ...defaultSimConfig(99), maxTicks: 400, orderCount: 20 };
      return new Simulation(grid, defaultFleetSpec(5), config, starts.slice(0, 5));
    };
    const s1 = build();
    const s2 = build();
    while (!s1.done) {
      s1.step();
      s2.step();
      expect(s1.snapshot()).toEqual(s2.snapshot());
    }
  });

  it('different seeds → different order arrivals (sanity, not identical)', () => {
    const a = run(1);
    const b = run(2);
    // metrics should differ somewhere; if identical the RNG is not threaded
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});
