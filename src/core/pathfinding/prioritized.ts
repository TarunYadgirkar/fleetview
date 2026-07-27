import type { Agent, Cell, MapfOptions, MapfResult } from '../types';
import type { Grid } from '../grid';
import { type Constraints, edgeKey, spaceTimeAStar, vertexKey } from './astar';

/**
 * Prioritized planning: agents planned in id order, each avoiding the full space-time
 * reservation of all higher-priority agents (including their rest-at-goal occupancy).
 * Fast but incomplete — cannot solve instances that require a lower-priority agent to force
 * a higher one to move (e.g. a single-alcove corridor swap). Used as the CBS fallback.
 */
export function prioritizedPlanning(
  grid: Grid,
  agents: Agent[],
  opts: MapfOptions = {},
): MapfResult {
  const maxTimestep = opts.maxTimestep ?? grid.width * grid.height + 64;
  const horizon = maxTimestep;

  const cons: Constraints = { vertex: new Set(), edge: new Set() };
  const maxResAtCell = new Map<number, number>();
  const cellId = (x: number, y: number) => y * grid.width + x;

  const reserveVertex = (t: number, x: number, y: number) => {
    cons.vertex.add(vertexKey(t, x, y));
    const id = cellId(x, y);
    const prev = maxResAtCell.get(id) ?? -1;
    if (t > prev) maxResAtCell.set(id, t);
  };

  const paths: Cell[][] = [];
  const ordered = agents.slice().sort((a, b) => a.id - b.id);

  for (const agent of ordered) {
    const goalId = cellId(agent.goal.x, agent.goal.y);
    const minGoalTime = maxResAtCell.get(goalId) ?? 0;

    const path = spaceTimeAStar(grid, agent.start, agent.goal, cons, {
      minGoalTime,
      maxTimestep,
    });
    if (path === null) {
      return { paths: [], cost: 0, strategy: 'prioritized', expansions: 0, solved: false };
    }
    paths.push(path);

    // reserve this agent's occupancy for all followers
    for (let t = 0; t < path.length; t++) {
      reserveVertex(t, path[t].x, path[t].y);
      if (t >= 1) {
        const from = path[t - 1];
        const to = path[t];
        if (from.x !== to.x || from.y !== to.y) {
          // forbid a follower from swapping across this edge
          cons.edge.add(edgeKey(t, to.x, to.y, from.x, from.y));
        }
      }
    }
    // rest at goal forever (up to horizon)
    const last = path[path.length - 1];
    for (let t = path.length; t <= horizon; t++) {
      reserveVertex(t, last.x, last.y);
    }
  }

  // restore original order for output
  const byId = new Map<number, Cell[]>();
  ordered.forEach((a, i) => byId.set(a.id, paths[i]));
  const outPaths = agents.map((a) => byId.get(a.id)!);
  const cost = outPaths.reduce((s, p) => s + (p.length - 1), 0);

  return { paths: outPaths, cost, strategy: 'prioritized', expansions: 0, solved: true };
}
