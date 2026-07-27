import type { Cell } from '../core/types';
import { type Grid, isPassable } from '../core/grid';
import { MinHeap } from '../core/pathfinding/heap';

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

interface PNode {
  id: number;
  x: number;
  y: number;
  f: number;
  g: number;
  seq: number;
}

/**
 * Static 4-connected A* (no time dimension, no wait). Optional `blocked` cells are treated as
 * impassable (used for detours around stalled robots), except the start and goal themselves.
 * Deterministic tie-breaking. Returns [start … goal] inclusive, or null if unreachable.
 */
export function shortestPath(
  grid: Grid,
  start: Cell,
  goal: Cell,
  blocked?: Set<number>,
): Cell[] | null {
  const W = grid.width;
  const startId = start.y * W + start.x;
  const goalId = goal.y * W + goal.x;
  if (startId === goalId) return [{ x: start.x, y: start.y }];

  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  let seq = 0;

  const heap = new MinHeap<PNode>((a, b) => {
    if (a.f !== b.f) return a.f - b.f;
    if (a.g !== b.g) return b.g - a.g;
    if (a.id !== b.id) return a.id - b.id;
    return a.seq - b.seq;
  });

  gScore.set(startId, 0);
  heap.push({ id: startId, x: start.x, y: start.y, f: h(start.x, start.y), g: 0, seq: seq++ });

  while (heap.size > 0) {
    const cur = heap.pop()!;
    if (cur.g !== gScore.get(cur.id)) continue;
    if (cur.id === goalId) return reconstruct(cameFrom, goalId, W);

    for (let i = 0; i < 4; i++) {
      const nx = cur.x + DX[i];
      const ny = cur.y + DY[i];
      if (!isPassable(grid, nx, ny)) continue;
      const nid = ny * W + nx;
      if (blocked && nid !== goalId && blocked.has(nid)) continue;
      const ng = cur.g + 1;
      const known = gScore.get(nid);
      if (known !== undefined && known <= ng) continue;
      gScore.set(nid, ng);
      cameFrom.set(nid, cur.id);
      heap.push({ id: nid, x: nx, y: ny, f: ng + h(nx, ny), g: ng, seq: seq++ });
    }
  }
  return null;
}

function reconstruct(cameFrom: Map<number, number>, goalId: number, W: number): Cell[] {
  const path: Cell[] = [];
  let id: number | undefined = goalId;
  while (id !== undefined) {
    path.push({ x: id % W, y: Math.floor(id / W) });
    id = cameFrom.get(id);
  }
  path.reverse();
  return path;
}
