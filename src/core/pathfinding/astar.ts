import type { Cell } from '../types';
import { type Grid, isPassable } from '../grid';
import { MinHeap } from './heap';

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

interface Node {
  x: number;
  y: number;
  t: number;
  f: number;
  seq: number;
}

const DX = [0, 1, 0, -1, 0];
const DY = [-1, 0, 1, 0, 0]; // N, E, S, W, wait

/**
 * Space-time A* over a 4-connected grid with a wait action. Each move (including wait)
 * costs 1, so g == t. Honors vertex + edge constraints and goal-persistence: a goal node
 * only counts once t >= minGoalTime, guaranteeing the agent can rest on its goal without
 * violating a later constraint. Returns the cell sequence [t=0 … arrival] or null.
 */
export function spaceTimeAStar(
  grid: Grid,
  start: Cell,
  goal: Cell,
  constraints: Constraints,
  opts: AStarOptions = {},
): Cell[] | null {
  const W = grid.width;
  const HW = W * grid.height;
  const minGoalTime = opts.minGoalTime ?? 0;
  const maxT = opts.maxTimestep ?? HW + 64;

  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const stateKey = (x: number, y: number, t: number) => t * HW + y * W + x;

  // lower f first; tie → higher g (t) first; tie → lower cell id; tie → insertion order
  const heap = new MinHeap<Node>((a, b) => {
    if (a.f !== b.f) return a.f - b.f;
    if (a.t !== b.t) return b.t - a.t;
    const ca = a.y * W + a.x;
    const cb = b.y * W + b.x;
    if (ca !== cb) return ca - cb;
    return a.seq - b.seq;
  });

  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  let seq = 0;

  const startKey = stateKey(start.x, start.y, 0);
  gScore.set(startKey, 0);
  heap.push({ x: start.x, y: start.y, t: 0, f: h(start.x, start.y), seq: seq++ });

  while (heap.size > 0) {
    const cur = heap.pop()!;
    const curKey = stateKey(cur.x, cur.y, cur.t);
    // stale entry (a better path to this state was already expanded)
    if (cur.t !== gScore.get(curKey)) continue;

    if (cur.x === goal.x && cur.y === goal.y && cur.t >= minGoalTime) {
      return reconstruct(cameFrom, curKey, W, HW);
    }
    if (cur.t >= maxT) continue;

    const nt = cur.t + 1;
    for (let i = 0; i < 5; i++) {
      const nx = cur.x + DX[i];
      const ny = cur.y + DY[i];
      if (!isPassable(grid, nx, ny)) continue;
      if (constraints.vertex.has(vertexKey(nt, nx, ny))) continue;
      if (i < 4 && constraints.edge.has(edgeKey(nt, cur.x, cur.y, nx, ny))) continue;

      const nKey = stateKey(nx, ny, nt);
      if (gScore.has(nKey)) continue; // g == t is monotonic along expansion order
      gScore.set(nKey, nt);
      cameFrom.set(nKey, curKey);
      heap.push({ x: nx, y: ny, t: nt, f: nt + h(nx, ny), seq: seq++ });
    }
  }
  return null;
}

function reconstruct(cameFrom: Map<number, number>, endKey: number, W: number, HW: number): Cell[] {
  const path: Cell[] = [];
  let key: number | undefined = endKey;
  while (key !== undefined) {
    const t = Math.floor(key / HW);
    const rem = key - t * HW;
    path.push({ x: rem % W, y: Math.floor(rem / W) });
    key = cameFrom.get(key);
  }
  path.reverse();
  return path;
}
