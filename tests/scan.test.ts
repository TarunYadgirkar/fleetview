import { describe, expect, it } from 'vitest';
import { buildWarehouse } from '../src/presets/builder';
import { throughputCurve } from '../src/sim/scan';
import { defaultFleetSpec, defaultSimConfig } from '../src/sim/types';

describe('throughput vs fleet-size curve', () => {
  it('produces a point per fleet size and finds a saturation knee', () => {
    const { grid, starts } = buildWarehouse({ width: 21, height: 13 });
    const fleet = defaultFleetSpec(1);
    const config = { ...defaultSimConfig(7), maxTicks: 1500, orderCount: 0, orderRate: 3 };
    const sizes = [1, 2, 4, 6, 8, 12];
    const curve = throughputCurve(grid, starts, fleet, config, sizes);

    expect(curve.points.map((p) => p.fleetSize)).toEqual(sizes);
    expect(curve.points.every((p) => p.ordersPerHour >= 0)).toBe(true);
    // throughput with more robots should beat a single robot
    const first = curve.points[0].ordersPerHour;
    const best = Math.max(...curve.points.map((p) => p.ordersPerHour));
    expect(best).toBeGreaterThan(first);
    // saturation is one of the tested sizes and not the smallest
    expect(sizes).toContain(curve.saturationFleetSize);
    expect(curve.saturationFleetSize).toBeGreaterThan(1);

    // it is the *smallest* fleet within 95% of peak throughput: the knee, not an early dip
    const peak = Math.max(...curve.points.map((p) => p.ordersPerHour));
    const knee = curve.points.find((p) => p.fleetSize === curve.saturationFleetSize)!;
    expect(knee.ordersPerHour).toBeGreaterThanOrEqual(peak * 0.95);
    for (const p of curve.points) {
      if (p.fleetSize < curve.saturationFleetSize) {
        expect(p.ordersPerHour).toBeLessThan(peak * 0.95);
      }
    }
  });

  it('is deterministic', () => {
    const { grid, starts } = buildWarehouse({ width: 21, height: 13 });
    const fleet = defaultFleetSpec(1);
    const config = { ...defaultSimConfig(7), maxTicks: 800, orderCount: 0, orderRate: 3 };
    const sizes = [1, 3, 6];
    const a = throughputCurve(grid, starts, fleet, config, sizes);
    const b = throughputCurve(grid, starts, fleet, config, sizes);
    expect(a).toEqual(b);
  });
});
