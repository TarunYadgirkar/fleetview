import { describe, expect, it } from 'vitest';
import { buildWarehouse } from '../src/presets/builder';
import { STATE_CODES, Simulation } from '../src/sim/simulation';
import { defaultFleetSpec, defaultSimConfig } from '../src/sim/types';

describe('playback frame capture', () => {
  it('writeFrame matches snapshot() for every tick', () => {
    const { grid, starts } = buildWarehouse({ width: 15, height: 9 });
    const robots = 4;
    const config = { ...defaultSimConfig(8), maxTicks: 120, orderCount: 10, orderRate: 0.5 };
    const sim = new Simulation(grid, defaultFleetSpec(robots), config, starts.slice(0, robots));

    const cells = new Int32Array(robots);
    const states = new Uint8Array(robots);

    while (!sim.done) {
      sim.step();
      sim.writeFrame(cells, states, 0);
      const snap = sim.snapshot();
      for (let i = 0; i < robots; i++) {
        expect(cells[i]).toBe(snap.robots[i].y * grid.width + snap.robots[i].x);
        expect(STATE_CODES[states[i]]).toBe(snap.robots[i].state);
      }
    }
  });

  it('encodes every reachable robot state', () => {
    expect(new Set(STATE_CODES).size).toBe(STATE_CODES.length);
    expect(STATE_CODES).toContain('parking');
    expect(STATE_CODES).toContain('charging');
  });
});
