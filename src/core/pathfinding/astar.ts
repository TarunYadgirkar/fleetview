import type { Cell } from '../types';
import type { Grid } from '../grid';

/**
 * Constraints for a single agent's low-level space-time A*.
 * vertex key: `${t}:${x},${y}`  — forbid being at cell at tick t
 * edge key:   `${t}:${fx},${fy}>${tx},${ty}` — forbid arriving at (tx,ty) at tick t
 *             having departed (fx,fy) at t-1 (blocks swaps)
 */
export interface Constraints {
  vertex: Set<string>;
  edge: Set<string>;
}

export function emptyConstraints(): Constraints {
  return { vertex: new Set(), edge: new Set() };
}

export function vertexKey(t: number, x: number, y: number): string {
  return `${t}:${x},${y}`;
}

export function edgeKey(t: number, fx: number, fy: number, tx: number, ty: number): string {
  return `${t}:${fx},${fy}>${tx},${ty}`;
}

export interface AStarOptions {
  maxTimestep?: number;
  /** the agent may only rest on its goal once t >= this (goal-persistence). */
  minGoalTime?: number;
}

export function spaceTimeAStar(
  _grid: Grid,
  _start: Cell,
  _goal: Cell,
  _constraints: Constraints,
  _opts?: AStarOptions,
): Cell[] | null {
  throw new Error('not implemented: spaceTimeAStar');
}
