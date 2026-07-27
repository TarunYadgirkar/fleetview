import type { Cell } from '../core/types';
import type { Grid } from '../core/grid';
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

export function throughputCurve(
  _grid: Grid,
  _starts: Cell[],
  _fleet: FleetSpec,
  _config: SimConfig,
  _fleetSizes: number[],
): ThroughputCurve {
  throw new Error('not implemented: throughputCurve');
}
