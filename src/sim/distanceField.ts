import { type Grid, isPassable } from '../core/grid';

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/**
 * Lazily-computed BFS distance fields, one per goal cell, cached for the life of a run.
 * Warehouses have few distinct goals (pick/deposit/charge stations) but many robots and many
 * trips, so paying one O(cells) BFS per station and then descending the field turns every
 * subsequent route into an O(path length) walk. This is what keeps 50 robots × 10k ticks fast.
 */
export class DistanceFieldCache {
  private readonly fields = new Map<number, Int32Array>();

  constructor(private readonly grid: Grid) {}

  /** dist[cellId] in moves to the goal; -1 where unreachable. */
  field(goalId: number): Int32Array {
    const cached = this.fields.get(goalId);
    if (cached) return cached;

    const { width, height } = this.grid;
    const dist = new Int32Array(width * height).fill(-1);
    const gx = goalId % width;
    const gy = Math.floor(goalId / width);

    if (isPassable(this.grid, gx, gy)) {
      dist[goalId] = 0;
      const queue = new Int32Array(width * height);
      let head = 0;
      let tail = 0;
      queue[tail++] = goalId;
      while (head < tail) {
        const cur = queue[head++];
        const cx = cur % width;
        const cy = Math.floor(cur / width);
        const nd = dist[cur] + 1;
        for (let i = 0; i < 4; i++) {
          const nx = cx + DX[i];
          const ny = cy + DY[i];
          if (!isPassable(this.grid, nx, ny)) continue;
          const nid = ny * width + nx;
          if (dist[nid] !== -1) continue;
          dist[nid] = nd;
          queue[tail++] = nid;
        }
      }
    }

    this.fields.set(goalId, dist);
    return dist;
  }

  /** moves from `fromId` to `goalId`, or -1 if unreachable. */
  distance(fromId: number, goalId: number): number {
    return this.field(goalId)[fromId];
  }

  /**
   * Steepest-descent path along the field: [next, …, goal] (excludes the start cell).
   * Deterministic neighbor order. Returns null when unreachable.
   */
  path(fromId: number, goalId: number): number[] | null {
    const dist = this.field(goalId);
    if (dist[fromId] === -1) return null;

    const { width } = this.grid;
    const out: number[] = [];
    let cur = fromId;
    let d = dist[cur];
    while (d > 0) {
      const cx = cur % width;
      const cy = Math.floor(cur / width);
      let next = -1;
      for (let i = 0; i < 4; i++) {
        const nx = cx + DX[i];
        const ny = cy + DY[i];
        if (!isPassable(this.grid, nx, ny)) continue;
        const nid = ny * width + nx;
        if (dist[nid] === d - 1) {
          next = nid;
          break;
        }
      }
      if (next === -1) return null;
      out.push(next);
      cur = next;
      d--;
    }
    return out;
  }
}
