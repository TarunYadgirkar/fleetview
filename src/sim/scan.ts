import type { Cell } from '../core/types';
import type { Grid } from '../core/grid';
import { Simulation } from './simulation';
import type { FleetSpec, SimConfig } from './types';

export interface CurvePoint {
  fleetSize: number;
  ordersPerHour: number;
  utilization: number;
  latencyMean: number;
  latencyP95: number;
}

export interface ThroughputCurve {
  points: CurvePoint[];
  /** fleet size at the saturation knee (throughput stops climbing meaningfully). */
  saturationFleetSize: number;
}

/** share of peak throughput that counts as "no longer worth adding robots" */
const SATURATION_SHARE = 0.95;

/**
 * Sweep fleet sizes, running one independent deterministic simulation per size, and locate the
 * saturation knee: the smallest fleet that still reaches SATURATION_SHARE of the best
 * throughput observed. Marginal-gain thresholds were tried first and misfire on real curves —
 * a small dip early in the sweep reads as saturation long before the curve actually flattens.
 */
export function throughputCurve(
  grid: Grid,
  starts: Cell[],
  fleet: FleetSpec,
  config: SimConfig,
  fleetSizes: number[],
): ThroughputCurve {
  const points: CurvePoint[] = fleetSizes.map((size) => {
    const sim = new Simulation(
      grid,
      { ...fleet, count: size },
      { ...config },
      starts.slice(0, size),
    );
    const m = sim.run().metrics;
    return {
      fleetSize: size,
      ordersPerHour: m.ordersPerHour,
      utilization: m.utilization,
      latencyMean: m.latencyMean,
      latencyP95: m.latencyP95,
    };
  });

  return { points, saturationFleetSize: findSaturation(points) };
}

function findSaturation(points: CurvePoint[]): number {
  if (points.length === 0) return 0;

  let peak = 0;
  for (const p of points) if (p.ordersPerHour > peak) peak = p.ordersPerHour;
  if (peak <= 0) return points[points.length - 1].fleetSize;

  const target = peak * SATURATION_SHARE;
  for (const p of points) {
    if (p.ordersPerHour >= target) return p.fleetSize;
  }
  return points[points.length - 1].fleetSize;
}
