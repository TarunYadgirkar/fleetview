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

/** fraction of the best marginal gain below which extra robots are deemed wasted */
const SATURATION_GAIN_RATIO = 0.2;

/**
 * Sweep fleet sizes, running one independent deterministic simulation per size, and locate the
 * saturation knee: the first size after which each additional robot buys less than
 * SATURATION_GAIN_RATIO of the best per-robot marginal throughput seen so far.
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
  if (points.length === 1) return points[0].fleetSize;

  let bestGainPerRobot = 0;
  const gains: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const deltaRobots = points[i].fleetSize - points[i - 1].fleetSize;
    const gain =
      deltaRobots > 0 ? (points[i].ordersPerHour - points[i - 1].ordersPerHour) / deltaRobots : 0;
    gains.push(gain);
    if (gain > bestGainPerRobot) bestGainPerRobot = gain;
  }

  if (bestGainPerRobot <= 0) return points[points.length - 1].fleetSize;

  for (let i = 0; i < gains.length; i++) {
    if (gains[i] < bestGainPerRobot * SATURATION_GAIN_RATIO) {
      return points[i].fleetSize;
    }
  }
  return points[points.length - 1].fleetSize;
}
