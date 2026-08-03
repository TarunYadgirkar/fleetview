import { expect } from 'vitest';
import type { Agent, Cell, MapfResult } from '../src/core/types';
import { type Grid, createGrid, isPassable, manhattan, setCellInPlace } from '../src/core/grid';
import { Rng } from '../src/core/rng';
import { shortestPath } from '../src/sim/shortestPath';

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

const MIN_WIDTH = 4;
const MAX_WIDTH = 7;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 6;
const MAX_WALL_DENSITY = 0.25;
const MIN_AGENTS = 2;
const MAX_AGENTS = 4;
/** attempts per accepted instance before we declare the generator broken */
const ATTEMPT_BUDGET = 50;

export interface RandomInstance {
  grid: Grid;
  agents: Agent[];
}

/** Sum of independent single-agent shortest-path distances — the sum-of-costs lower bound. */
export function independentCostLowerBound(grid: Grid, agents: Agent[]): number {
  let total = 0;
  for (const agent of agents) {
    const path = shortestPath(grid, agent.start, agent.goal);
    expect(path, `agent ${agent.id} goal unreachable`).not.toBeNull();
    total += path!.length - 1;
  }
  return total;
}

export function permuteAgents(rng: Rng, agents: Agent[]): Agent[] {
  const out = agents.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Seeded random MAPF instances: small grids, random wall density, 2–4 agents with distinct
 * starts and distinct goals. Instances where any agent's goal is unreachable from its start are
 * discarded — a solver is not expected to answer those. Solvability of the *joint* problem is
 * not guaranteed, which is why callers must tolerate a small number of unsolved instances.
 */
export function generateInstances(seed: number, count: number): RandomInstance[] {
  const rng = new Rng(seed);
  const out: RandomInstance[] = [];
  for (let attempt = 0; attempt < count * ATTEMPT_BUDGET && out.length < count; attempt++) {
    const instance = tryInstance(rng);
    if (instance !== null) out.push(instance);
  }
  if (out.length < count) {
    throw new Error(`seed ${seed}: generated only ${out.length}/${count} instances`);
  }
  return out;
}

function tryInstance(rng: Rng): RandomInstance | null {
  const width = rng.int(MIN_WIDTH, MAX_WIDTH);
  const height = rng.int(MIN_HEIGHT, MAX_HEIGHT);
  const density = rng.next() * MAX_WALL_DENSITY;

  const grid = createGrid(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rng.next() < density) setCellInPlace(grid, x, y, 'wall');
    }
  }

  const free: Cell[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isPassable(grid, x, y)) free.push({ x, y });
    }
  }

  const count = rng.int(MIN_AGENTS, MAX_AGENTS);
  if (free.length < count) return null;

  const starts = pickDistinct(rng, free, count);
  const goals = pickDistinct(rng, free, count);
  const agents: Agent[] = starts.map((start, i) => ({ id: i, start, goal: goals[i] }));

  for (const agent of agents) {
    if (shortestPath(grid, agent.start, agent.goal) === null) return null;
  }
  return { grid, agents };
}

function pickDistinct(rng: Rng, cells: Cell[], count: number): Cell[] {
  const pool = cells.slice();
  const picked: Cell[] = [];
  for (let i = 0; i < count; i++) {
    const j = rng.int(i, pool.length - 1);
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
    picked.push(pool[i]);
  }
  return picked;
}
