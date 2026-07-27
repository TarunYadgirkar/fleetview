import { expect } from 'vitest';
import type { Agent, Cell, MapfResult } from '../src/core/types';
import { type Grid, isPassable, manhattan } from '../src/core/grid';

function posAt(path: Cell[], t: number): Cell {
  return path[Math.min(t, path.length - 1)];
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Assert a MAPF solution is physically valid:
 *  - one path per agent, starting at start, ending at goal
 *  - every step is a unit move or a wait onto a passable, in-bounds cell
 *  - no vertex conflict (two agents in one cell at one tick)
 *  - no edge/swap conflict (two agents exchange cells across a tick)
 *  - reported cost equals sum of per-agent arrival times
 * Agents that finish early are treated as resting on their goal thereafter.
 */
export function assertValidSolution(grid: Grid, agents: Agent[], result: MapfResult): void {
  expect(result.paths.length).toBe(agents.length);

  let maxLen = 0;
  for (let i = 0; i < agents.length; i++) {
    const path = result.paths[i];
    const agent = agents[i];
    expect(path.length, `agent ${agent.id} has empty path`).toBeGreaterThan(0);
    expect(sameCell(path[0], agent.start), `agent ${agent.id} start`).toBe(true);
    expect(sameCell(path[path.length - 1], agent.goal), `agent ${agent.id} goal`).toBe(true);

    for (let t = 0; t < path.length; t++) {
      const c = path[t];
      expect(isPassable(grid, c.x, c.y), `agent ${agent.id} on blocked cell ${c.x},${c.y}@${t}`).toBe(
        true,
      );
      if (t > 0) {
        const d = manhattan(path[t - 1], c);
        expect(d <= 1, `agent ${agent.id} illegal step ${d} @${t}`).toBe(true);
      }
    }
    maxLen = Math.max(maxLen, path.length);
  }

  for (let t = 0; t < maxLen; t++) {
    const seen = new Map<string, number>();
    for (let i = 0; i < agents.length; i++) {
      const c = posAt(result.paths[i], t);
      const key = `${c.x},${c.y}`;
      const other = seen.get(key);
      expect(other, `vertex conflict at ${key}@${t} between ${other} and ${i}`).toBeUndefined();
      seen.set(key, i);
    }
    if (t > 0) {
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const iPrev = posAt(result.paths[i], t - 1);
          const iNow = posAt(result.paths[i], t);
          const jPrev = posAt(result.paths[j], t - 1);
          const jNow = posAt(result.paths[j], t);
          const swap = sameCell(iPrev, jNow) && sameCell(jPrev, iNow) && !sameCell(iPrev, iNow);
          expect(swap, `edge swap ${i}/${j} @${t}`).toBe(false);
        }
      }
    }
  }

  const soc = result.paths.reduce((sum, p) => sum + (p.length - 1), 0);
  expect(result.cost, 'cost must equal sum of costs').toBe(soc);
}
