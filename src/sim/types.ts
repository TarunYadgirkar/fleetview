import type { MapfOptions } from '../core/types';

export type RobotState =
  | 'idle'
  | 'toPick'
  | 'picking'
  | 'toDeposit'
  | 'depositing'
  | 'toCharge'
  | 'charging';

export interface FleetSpec {
  count: number;
  /** integer ticks to traverse one cell (derived from speed at build time). */
  ticksPerMove: number;
  /** extra ticks to rotate 90°. */
  turnCost: number;
  /** items carried per trip (>=1). */
  payload: number;
  /** ticks of active operation on a full charge. */
  batteryCapacity: number;
  /** battery ticks restored per tick on a dock. */
  chargeRate: number;
  /** route to charge when battery/capacity < this fraction (0..1). */
  chargeThreshold: number;
}

export interface SimConfig {
  seed: number;
  maxTicks: number;
  /** mean orders per tick (poisson) or 1/interval basis (fixed). */
  orderRate: number;
  orderMode: 'poisson' | 'fixed';
  /** total orders to generate; 0 = unlimited (run to maxTicks). */
  orderCount: number;
  /** replan MAPF every N ticks (and on demand). */
  replanInterval: number;
  /** wall-clock seconds represented by one tick (for orders/hour). */
  tickSeconds: number;
  pickDwell: number;
  depositDwell: number;
  mapf: MapfOptions;
}

export interface RobotView {
  id: number;
  x: number;
  y: number;
  state: RobotState;
  battery: number;
  carrying: number;
}

export interface SimSnapshot {
  tick: number;
  robots: RobotView[];
  pendingOrders: number;
  activeOrders: number;
  completedOrders: number;
}

export interface SimMetrics {
  ticks: number;
  ordersAccepted: number;
  ordersCompleted: number;
  ordersPerHour: number;
  /** fleet-average utilization (fraction of ticks doing useful work). */
  utilization: number;
  /** per-robot utilization. */
  robotUtil: number[];
  latencyMean: number;
  latencyP95: number;
  /** per-cell contention accumulated over the run (row-major, width*height). */
  heatmap: number[];
  itemsPicked: number;
  itemsDeposited: number;
  itemsInTransit: number;
}

export interface SimResult {
  metrics: SimMetrics;
}

export function defaultFleetSpec(count: number): FleetSpec {
  return {
    count,
    ticksPerMove: 1,
    turnCost: 0,
    payload: 1,
    batteryCapacity: 100000,
    chargeRate: 10,
    chargeThreshold: 0.2,
  };
}

export function defaultSimConfig(seed = 1): SimConfig {
  return {
    seed,
    maxTicks: 5000,
    orderRate: 0.5,
    orderMode: 'poisson',
    orderCount: 0,
    replanInterval: 8,
    tickSeconds: 1,
    pickDwell: 2,
    depositDwell: 2,
    mapf: { maxExpansions: 5000, maxTimestep: 512 },
  };
}
