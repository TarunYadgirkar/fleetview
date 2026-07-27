import type { Agent, Cell, MapfOptions, MapfResult } from '../types';
import type { Grid } from '../grid';
import {
  type Constraints,
  edgeKey,
  emptyConstraints,
  spaceTimeAStar,
  vertexKey,
} from './astar';
import { MinHeap } from './heap';

interface CtNode {
  cons: Constraints[]; // per agent
  maxCon: number[]; // max constraint time per agent (for goal-persistence)
  paths: Cell[][];
  cost: number;
  seq: number;
}

type Conflict =
  | { kind: 'vertex'; a: number; b: number; x: number; y: number; t: number }
  | {
      kind: 'edge';
      a: number;
      b: number;
      ax: number;
      ay: number;
      bx: number;
      by: number;
      t: number;
    };

function posAt(path: Cell[], t: number): Cell {
  return path[Math.min(t, path.length - 1)];
}

/** Earliest conflict (lowest t; vertex before edge at the same t) or null. */
function findConflict(paths: Cell[][]): Conflict | null {
  let maxLen = 0;
  for (const p of paths) maxLen = Math.max(maxLen, p.length);

  for (let t = 0; t < maxLen; t++) {
    // vertex
    const occ = new Map<number, number>();
    for (let i = 0; i < paths.length; i++) {
      const c = posAt(paths[i], t);
      const key = c.y * 100000 + c.x;
      const prev = occ.get(key);
      if (prev !== undefined) {
        return { kind: 'vertex', a: prev, b: i, x: c.x, y: c.y, t };
      }
      occ.set(key, i);
    }
    // edge / swap
    if (t >= 1) {
      const moves = new Map<string, number>();
      for (let i = 0; i < paths.length; i++) {
        const from = posAt(paths[i], t - 1);
        const to = posAt(paths[i], t);
        if (from.x === to.x && from.y === to.y) continue; // wait, no edge
        const rev = `${to.x},${to.y}>${from.x},${from.y}`;
        const other = moves.get(rev);
        if (other !== undefined) {
          return {
            kind: 'edge',
            a: other,
            b: i,
            ax: posAt(paths[other], t - 1).x,
            ay: posAt(paths[other], t - 1).y,
            bx: from.x,
            by: from.y,
            t,
          };
        }
        moves.set(`${from.x},${from.y}>${to.x},${to.y}`, i);
      }
    }
  }
  return null;
}

function cloneConstraintsFor(node: CtNode, agent: number): Constraints {
  const src = node.cons[agent];
  return { vertex: new Set(src.vertex), edge: new Set(src.edge) };
}

function planAgent(
  grid: Grid,
  agent: Agent,
  cons: Constraints,
  minGoalTime: number,
  maxTimestep: number,
): Cell[] | null {
  return spaceTimeAStar(grid, agent.start, agent.goal, cons, {
    minGoalTime,
    maxTimestep,
  });
}

function sumCost(paths: Cell[][]): number {
  let c = 0;
  for (const p of paths) c += p.length - 1;
  return c;
}

/**
 * Conflict-Based Search. Optimal (sum-of-costs) on a 4-connected grid with wait actions and
 * unit move cost. High level is best-first over the constraint tree with deterministic
 * tie-breaking; low level is space-time A* honoring vertex/edge constraints. Stops and reports
 * unsolved once the node-expansion budget (opts.maxExpansions) is exceeded.
 */
export function cbs(grid: Grid, agents: Agent[], opts: MapfOptions = {}): MapfResult {
  const maxExpansions = opts.maxExpansions ?? 200000;
  const maxTimestep = opts.maxTimestep ?? grid.width * grid.height + 64;

  if (agents.length === 0) {
    return { paths: [], cost: 0, strategy: 'cbs', expansions: 0, solved: true };
  }

  // root
  const rootCons = agents.map(() => emptyConstraints());
  const rootMax = agents.map(() => 0);
  const rootPaths: Cell[][] = [];
  for (let i = 0; i < agents.length; i++) {
    const p = planAgent(grid, agents[i], rootCons[i], 0, maxTimestep);
    if (p === null) {
      return { paths: [], cost: 0, strategy: 'cbs', expansions: 0, solved: false };
    }
    rootPaths.push(p);
  }

  let seq = 0;
  const open = new MinHeap<CtNode>((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.seq - b.seq;
  });
  open.push({ cons: rootCons, maxCon: rootMax, paths: rootPaths, cost: sumCost(rootPaths), seq: seq++ });

  let expansions = 0;
  while (open.size > 0) {
    if (expansions >= maxExpansions) {
      return { paths: [], cost: 0, strategy: 'partial', expansions, solved: false };
    }
    const node = open.pop()!;
    expansions++;

    const conflict = findConflict(node.paths);
    if (conflict === null) {
      return {
        paths: node.paths,
        cost: node.cost,
        strategy: 'cbs',
        expansions,
        solved: true,
      };
    }

    const branchAgents =
      conflict.kind === 'vertex'
        ? [conflict.a, conflict.b]
        : [conflict.a, conflict.b];

    for (const agentIdx of branchAgents) {
      const cons = cloneConstraintsFor(node, agentIdx);
      if (conflict.kind === 'vertex') {
        cons.vertex.add(vertexKey(conflict.t, conflict.x, conflict.y));
      } else {
        // agent a moved (ax,ay)->(bx,by)? Reconstruct the specific forbidden transition.
        // a goes (ax,ay)->(bx,by) at t; b goes (bx,by)->(ax,ay) at t.
        if (agentIdx === conflict.a) {
          cons.edge.add(edgeKey(conflict.t, conflict.ax, conflict.ay, conflict.bx, conflict.by));
        } else {
          cons.edge.add(edgeKey(conflict.t, conflict.bx, conflict.by, conflict.ax, conflict.ay));
        }
      }
      const maxCon = node.maxCon.slice();
      maxCon[agentIdx] = Math.max(maxCon[agentIdx], conflict.t);

      const newPath = planAgent(grid, agents[agentIdx], cons, maxCon[agentIdx], maxTimestep);
      if (newPath === null) continue;

      const childCons = node.cons.slice();
      childCons[agentIdx] = cons;
      const childPaths = node.paths.slice();
      childPaths[agentIdx] = newPath;

      open.push({
        cons: childCons,
        maxCon,
        paths: childPaths,
        cost: sumCost(childPaths),
        seq: seq++,
      });
    }
  }

  return { paths: [], cost: 0, strategy: 'cbs', expansions, solved: false };
}
