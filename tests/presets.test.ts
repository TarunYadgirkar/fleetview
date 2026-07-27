import { describe, expect, it } from 'vitest';
import { cellAt, isPassable } from '../src/core/grid';
import { deserializeLayout, serializeLayout } from '../src/core/layout';
import { PRESETS } from '../src/presets';
import { DistanceFieldCache } from '../src/sim/distanceField';
import { Simulation } from '../src/sim/simulation';
import { defaultFleetSpec, defaultSimConfig } from '../src/sim/types';

describe('demo presets', () => {
  it('ships three distinct realistic layouts', () => {
    expect(PRESETS.length).toBe(3);
    const names = new Set(PRESETS.map((p) => p.name));
    expect(names.size).toBe(3);
  });

  for (const preset of PRESETS) {
    describe(preset.name, () => {
      const layout = preset.build();

      it('has stations of every kind and free robot homes', () => {
        const counts = { pick: 0, deposit: 0, charge: 0 };
        for (let y = 0; y < layout.grid.height; y++) {
          for (let x = 0; x < layout.grid.width; x++) {
            const t = cellAt(layout.grid, x, y);
            if (t === 'pick' || t === 'deposit' || t === 'charge') counts[t]++;
          }
        }
        expect(counts.pick).toBeGreaterThan(0);
        expect(counts.deposit).toBeGreaterThan(0);
        expect(counts.charge).toBeGreaterThan(0);
        expect(layout.robots.length).toBeGreaterThanOrEqual(8);
        for (const r of layout.robots) {
          expect(isPassable(layout.grid, r.x, r.y)).toBe(true);
        }
      });

      it('every station is reachable from every robot home', () => {
        const fields = new DistanceFieldCache(layout.grid);
        const stations: number[] = [];
        for (let y = 0; y < layout.grid.height; y++) {
          for (let x = 0; x < layout.grid.width; x++) {
            const t = cellAt(layout.grid, x, y);
            if (t === 'pick' || t === 'deposit' || t === 'charge') stations.push(y * layout.grid.width + x);
          }
        }
        for (const station of stations) {
          for (const home of layout.robots) {
            const from = home.y * layout.grid.width + home.x;
            expect(
              fields.distance(from, station),
              `station ${station} unreachable from ${home.x},${home.y}`,
            ).toBeGreaterThanOrEqual(0);
          }
        }
      });

      it('runs a simulation to completion with invariants intact', () => {
        const robots = Math.min(8, layout.robots.length);
        const config = { ...defaultSimConfig(4), maxTicks: 6000, orderCount: 30, orderRate: 0.5 };
        const sim = new Simulation(
          layout.grid,
          defaultFleetSpec(robots),
          config,
          layout.robots.slice(0, robots),
        );
        while (!sim.done) {
          sim.step();
          expect(sim.checkInvariants()).toEqual([]);
        }
        const m = sim.metrics();
        expect(m.ordersAccepted).toBe(30);
        expect(m.ordersCompleted).toBe(30);
        expect(m.ordersPerHour).toBeGreaterThan(0);
      });

      it('survives a JSON export/import round trip', () => {
        const json = serializeLayout(layout);
        const back = deserializeLayout(JSON.parse(JSON.stringify(json)));
        expect(back.grid.width).toBe(layout.grid.width);
        expect(back.grid.height).toBe(layout.grid.height);
        expect(Array.from(back.grid.cells)).toEqual(Array.from(layout.grid.cells));
        expect(back.robots).toEqual(layout.robots);
      });
    });
  }
});

describe('layout import validation', () => {
  it('rejects malformed payloads', () => {
    expect(() => deserializeLayout(null)).toThrow(/Invalid layout/);
    expect(() => deserializeLayout({ version: 2 })).toThrow(/unsupported version/);
    expect(() => deserializeLayout({ version: 1, width: 2, height: 2, cells: '..' })).toThrow(
      /cells length/,
    );
    expect(() =>
      deserializeLayout({ version: 1, width: 2, height: 1, cells: '.?' }),
    ).toThrow(/Invalid layout/);
    expect(() =>
      deserializeLayout({
        version: 1,
        width: 2,
        height: 1,
        cells: '..',
        robots: [{ x: 5, y: 0 }],
      }),
    ).toThrow(/out of bounds/);
  });
});
