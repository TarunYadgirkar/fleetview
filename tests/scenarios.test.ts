import { describe, expect, it } from 'vitest';
import type { Cell } from '../src/core/types';
import type { Grid } from '../src/core/grid';
import { PRESETS } from '../src/presets';
import { Simulation } from '../src/sim/simulation';
import { defaultSimConfig } from '../src/sim/types';
import { SCENARIOS } from '../src/ui/scenarios';

/** Mirrors App.layoutForRun: pad the preset's homes with free cells scanned bottom-up. */
function startCells(grid: Grid, homes: readonly Cell[], count: number): Cell[] {
  const robots = homes.slice();
  const taken = new Set(robots.map((r) => r.y * grid.width + r.x));
  for (let y = grid.height - 1; y >= 0 && robots.length < count; y--) {
    for (let x = 0; x < grid.width && robots.length < count; x++) {
      const id = y * grid.width + x;
      if (taken.has(id) || grid.cells[id] !== 0) continue;
      taken.add(id);
      robots.push({ x, y });
    }
  }
  return robots.slice(0, count);
}

/**
 * Every demo button must produce motion and numbers on the very first click. The failure this
 * guards against is a fleet that gridlocks partway through: utilisation still reads high because
 * every robot is "busy", but no order completes for the rest of the run and the visitor watches a
 * frozen floor. That is why the last-completion assertion exists.
 */
describe('demo scenarios', () => {
  it('offers at least one scenario and pins every seed', () => {
    expect(SCENARIOS.length).toBeGreaterThan(0);
    for (const s of SCENARIOS) {
      expect(Number.isInteger(s.config.seed)).toBe(true);
      expect(s.config.seed).toBeGreaterThan(0);
      expect(PRESETS[s.preset]).toBeDefined();
    }
  });

  for (const scenario of SCENARIOS) {
    describe(scenario.label, () => {
      // Dense Cold Storage stalls non-monotonically in fleet size on this solver; it stays
      // reachable from the Layout dropdown but must never sit behind a one-click demo.
      it('does not point at a layout known to gridlock', () => {
        expect(PRESETS[scenario.preset].name).not.toBe('Dense Cold Storage');
      });

      it('completes orders and keeps completing them to the end of the run', () => {
        const layout = PRESETS[scenario.preset].build();
        const config = { ...defaultSimConfig(scenario.config.seed), ...scenario.config };
        const sim = new Simulation(
          layout.grid,
          scenario.fleet,
          config,
          startCells(layout.grid, layout.robots, scenario.fleet.count),
        );
        while (!sim.done) sim.step();

        const m = sim.metrics();
        expect(m.ordersCompleted).toBeGreaterThan(0);
        expect(m.utilization).toBeGreaterThanOrEqual(0.3);

        let lastCompletion = 0;
        let seen = 0;
        for (const point of m.timeline) {
          if (point.completed > seen) {
            seen = point.completed;
            lastCompletion = point.tick;
          }
        }
        expect(lastCompletion).toBeGreaterThanOrEqual(config.maxTicks * 0.85);
      });
    });
  }
});
