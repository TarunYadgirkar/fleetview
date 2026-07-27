import { describe, expect, it } from 'vitest';
import { buildWarehouse } from '../src/presets/builder';
import { Simulation } from '../src/sim/simulation';
import { defaultFleetSpec, defaultSimConfig } from '../src/sim/types';

function run(seed: number, maxTicks = 1200) {
  const { grid, starts } = buildWarehouse({ width: 21, height: 13 });
  const config = { ...defaultSimConfig(seed), maxTicks, orderCount: 0, orderRate: 0.4 };
  const sim = new Simulation(grid, defaultFleetSpec(6), config, starts.slice(0, 6));
  return sim.run().metrics;
}

describe('run timeline', () => {
  it('samples the run and ends on the final totals', () => {
    const m = run(5);
    expect(m.timeline.length).toBeGreaterThan(4);

    const last = m.timeline[m.timeline.length - 1];
    expect(last.tick).toBe(m.ticks);
    expect(last.completed).toBe(m.ordersCompleted);
  });

  it('completed orders never decrease', () => {
    const m = run(9);
    for (let i = 1; i < m.timeline.length; i++) {
      expect(m.timeline[i].completed).toBeGreaterThanOrEqual(m.timeline[i - 1].completed);
    }
  });

  it('busy robots never exceed the fleet, pending never goes negative', () => {
    const m = run(11);
    for (const point of m.timeline) {
      expect(point.busy).toBeLessThanOrEqual(6);
      expect(point.busy).toBeGreaterThanOrEqual(0);
      expect(point.pending).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(run(3).timeline).toEqual(run(3).timeline);
  });

  it('stays bounded on long runs', () => {
    const m = run(2, 20000);
    expect(m.timeline.length).toBeLessThanOrEqual(260);
    expect(m.timeline[m.timeline.length - 1].tick).toBe(m.ticks);
  });
});
