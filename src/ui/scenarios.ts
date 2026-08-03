import type { FleetSpec, SimConfig } from '../sim/types';

/** The subset of SimConfig the planner exposes as inputs; everything else stays at its default. */
export type ScenarioConfig = Pick<
  SimConfig,
  'seed' | 'maxTicks' | 'orderRate' | 'orderMode' | 'orderCount' | 'tickSeconds'
>;

export interface Scenario {
  label: string;
  caption: string;
  /** index into PRESETS */
  preset: number;
  fleet: FleetSpec;
  config: ScenarioConfig;
}

const FLEET: Omit<FleetSpec, 'count'> = {
  ticksPerMove: 1,
  turnCost: 1,
  payload: 1,
  batteryCapacity: 1800,
  chargeRate: 20,
  chargeThreshold: 0.2,
};

const CONFIG: Omit<ScenarioConfig, 'seed' | 'orderRate'> = {
  maxTicks: 1800,
  orderMode: 'poisson',
  orderCount: 0,
  tickSeconds: 1,
};

/**
 * One-click demos. Every seed is pinned: fleets on a busy floor can deadlock into a state where
 * robots stay "busy" but no order ever completes again, and whether that happens is seed-dependent.
 * These triples were measured to keep completing orders to the end of the run — tests/scenarios.test.ts
 * fails loudly if a new entry does not.
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    label: 'Peak day, 24 robots',
    caption: 'A right-sized fleet on a busy fulfilment floor: ~500 orders/hour at 81% utilisation.',
    preset: 0,
    fleet: { ...FLEET, count: 24 },
    config: { ...CONFIG, seed: 1, orderRate: 0.18 },
  },
  {
    label: 'Same day, 12 robots',
    caption: 'The same 284 orders, half the fleet. 154 of them never get served.',
    preset: 0,
    fleet: { ...FLEET, count: 12 },
    config: { ...CONFIG, seed: 1, orderRate: 0.18 },
  },
  {
    label: 'Cross-dock hub, 20 robots',
    caption: 'A different building: wide-open sortation floor, ~740 orders/hour.',
    preset: 1,
    fleet: { ...FLEET, count: 20 },
    config: { ...CONFIG, seed: 3, orderRate: 0.22 },
  },
];
