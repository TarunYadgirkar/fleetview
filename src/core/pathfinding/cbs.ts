import type { Agent, MapfOptions, MapfResult } from '../types';
import type { Grid } from '../grid';

export function cbs(_grid: Grid, _agents: Agent[], _opts?: MapfOptions): MapfResult {
  throw new Error('not implemented: cbs');
}
