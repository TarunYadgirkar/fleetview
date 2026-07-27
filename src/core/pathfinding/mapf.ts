import type { Agent, MapfOptions, MapfResult } from '../types';
import type { Grid } from '../grid';
import { cbs } from './cbs';
import { prioritizedPlanning } from './prioritized';

/**
 * Planner facade: run CBS within a node-expansion budget; if it fails to return an optimal
 * solution within that budget, fall back to prioritized planning. Reports which strategy
 * produced the returned solution.
 */
export function planMapf(grid: Grid, agents: Agent[], opts: MapfOptions = {}): MapfResult {
  const optimal = cbs(grid, agents, opts);
  if (optimal.solved) return optimal;

  const fallback = prioritizedPlanning(grid, agents, opts);
  return { ...fallback, expansions: optimal.expansions };
}
