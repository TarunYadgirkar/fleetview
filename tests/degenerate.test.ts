import { describe, expect, it } from 'vitest';
import { createGrid, fromStrings, setCellInPlace } from '../src/core/grid';
import type { Cell } from '../src/core/types';
import { buildWarehouse } from '../src/presets/builder';
import { Simulation } from '../src/sim/simulation';
import { defaultFleetSpec, defaultSimConfig } from '../src/sim/types';

function stepAllChecking(sim: Simulation, cap = 20000): number {
  let ticks = 0;
  while (!sim.done) {
    sim.step();
    expect(sim.checkInvariants(), `@tick ${sim.tick}`).toEqual([]);
    if (++ticks > cap) break;
  }
  return ticks;
}

describe('degenerate layouts', () => {
  it('single corridor, one robot: every accepted order completes', () => {
    // 1-tall corridor with pick at left, deposit at right
    const grid = fromStrings(['P..........D']);
    const starts: Cell[] = [{ x: 1, y: 0 }];
    const config = { ...defaultSimConfig(3), maxTicks: 4000, orderCount: 12, orderRate: 0.4 };
    const sim = new Simulation(grid, defaultFleetSpec(1), config, starts);
    stepAllChecking(sim);
    const m = sim.metrics();
    expect(m.ordersAccepted).toBe(12);
    expect(m.ordersCompleted).toBe(m.ordersAccepted);
    expect(m.itemsPicked - m.itemsDeposited - m.itemsInTransit).toBe(0);
  });

  it('single corridor, two robots: head-on deadlock is contained, never illegal', () => {
    // A dead-end 1-wide corridor cannot host two opposing full-length traversals — no planner
    // can solve it (see DECISIONS D14). What MUST hold is that the sim degrades safely:
    // invariants every tick, no crash, no phantom completions, items conserved.
    const grid = fromStrings(['P..........D']);
    const starts: Cell[] = [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const config = { ...defaultSimConfig(3), maxTicks: 1500, orderCount: 12, orderRate: 0.4 };
    const sim = new Simulation(grid, defaultFleetSpec(2), config, starts);
    stepAllChecking(sim);
    const m = sim.metrics();
    expect(sim.tick).toBe(1500);
    expect(m.ordersCompleted).toBeLessThanOrEqual(m.ordersAccepted);
    expect(m.itemsPicked - m.itemsDeposited - m.itemsInTransit).toBe(0);
  });

  it('fully blocked: no crash, physical invariants hold, nothing completes', () => {
    const grid = createGrid(6, 6, 'wall');
    // one lone passable cell for a robot to sit on, surrounded by walls
    setCellInPlace(grid, 0, 0, 'empty');
    const config = { ...defaultSimConfig(1), maxTicks: 300, orderCount: 5 };
    const sim = new Simulation(grid, defaultFleetSpec(1), config, [{ x: 0, y: 0 }]);
    stepAllChecking(sim);
    const m = sim.metrics();
    expect(m.ordersCompleted).toBe(0);
  });

  it('zero robots: accepts orders, completes none, no crash', () => {
    const { grid } = buildWarehouse({ width: 15, height: 9 });
    const config = { ...defaultSimConfig(1), maxTicks: 300, orderCount: 5 };
    const sim = new Simulation(grid, defaultFleetSpec(0), config, []);
    stepAllChecking(sim);
    const m = sim.metrics();
    expect(m.ordersCompleted).toBe(0);
    expect(m.utilization).toBe(0);
  });

  it('200 robots: dense fleet, invariants hold every tick, deterministic', () => {
    const { grid, starts } = buildWarehouse({ width: 33, height: 33 });
    expect(starts.length).toBeGreaterThanOrEqual(200);
    const build = () => {
      const config = { ...defaultSimConfig(11), maxTicks: 300, orderCount: 60, orderRate: 2 };
      return new Simulation(grid, defaultFleetSpec(200), config, starts.slice(0, 200));
    };
    const s1 = build();
    stepAllChecking(s1, 300);
    const m1 = s1.metrics();
    const s2 = build();
    const m2 = s2.run().metrics;
    expect(m1).toEqual(m2);
  });
});
