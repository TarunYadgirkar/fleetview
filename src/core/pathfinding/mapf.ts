import type { Agent, MapfOptions, MapfResult } from '../types';
import type { Grid } from '../grid';

/**
 * Planner facade: run CBS within a node-expansion budget; if it exceeds the
 * budget, fall back to prioritized planning. Reports which strategy produced
 * the returned solution.
 */
export function planMapf(_grid: Grid, _agents: Agent[], _opts?: MapfOptions): MapfResult {
  throw new Error('not implemented: planMapf');
}
