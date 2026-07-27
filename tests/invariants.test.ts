import { describe, expect, it } from 'vitest';
import { buildWarehouse } from '../src/presets/builder';
import { Simulation } from '../src/sim/simulation';
import { defaultFleetSpec, defaultSimConfig } from '../src/sim/types';

function makeSim(seed: number, robots: number) {
  const { grid, starts } = buildWarehouse({ width: 21, height: 13 });
  const fleet = defaultFleetSpec(robots);
  const config = {
    ...defaultSimConfig(seed),
    maxTicks: 4000,
    orderCount: 50,
    orderRate: 0.6,
  };
  return new Simulation(grid, fleet, config, starts.slice(0, robots));
}

describe('hard invariants hold every tick across randomized runs', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    it(`seed ${seed}: no collisions, walls, or swaps; items conserved`, () => {
      const sim = makeSim(seed, 6);
      let ticks = 0;
      while (!sim.done) {
        sim.step();
        const violations = sim.checkInvariants();
        expect(violations, `seed ${seed} @tick ${sim.tick}`).toEqual([]);
        ticks++;
        if (ticks > 5000) throw new Error('run did not terminate');
      }
      const m = sim.metrics();
      // every accepted order completes on a solvable layout within the budget
      expect(m.ordersCompleted).toBe(m.ordersAccepted);
      expect(m.ordersAccepted).toBeGreaterThan(0);
      // item conservation at the end
      expect(m.itemsPicked - m.itemsDeposited - m.itemsInTransit).toBe(0);
      expect(m.itemsDeposited).toBe(m.ordersCompleted * sim.fleet.payload);
    });
  }
});

describe('congestion heatmap accumulates and matches grid size', () => {
  it('has one entry per cell and non-negative contention', () => {
    const sim = makeSim(5, 8);
    sim.run();
    const m = sim.metrics();
    expect(m.heatmap.length).toBe(sim.grid.width * sim.grid.height);
    expect(m.heatmap.every((v) => v >= 0)).toBe(true);
    expect(m.heatmap.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});
