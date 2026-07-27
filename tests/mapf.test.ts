import { describe, expect, it } from 'vitest';
import { fromStrings } from '../src/core/grid';
import { cbs } from '../src/core/pathfinding/cbs';
import { prioritizedPlanning } from '../src/core/pathfinding/prioritized';
import { planMapf } from '../src/core/pathfinding/mapf';
import type { Agent } from '../src/core/types';
import { FIXTURES } from './fixtures/mapf-fixtures';
import { assertValidSolution } from './helpers';

describe('CBS optimality on known instances', () => {
  for (const fx of FIXTURES) {
    it(`${fx.name} → optimal cost ${fx.optimalCost}`, () => {
      const grid = fromStrings(fx.rows);
      const result = cbs(grid, fx.agents);
      expect(result.solved, `${fx.name} must be solved`).toBe(true);
      expect(result.strategy).toBe('cbs');
      assertValidSolution(grid, fx.agents, result);
      expect(result.cost, `${fx.name}: ${fx.note}`).toBe(fx.optimalCost);
    });
  }
});

describe('planMapf facade', () => {
  for (const fx of FIXTURES) {
    it(`${fx.name} → solved, valid`, () => {
      const grid = fromStrings(fx.rows);
      const result = planMapf(grid, fx.agents, { maxExpansions: 100000 });
      expect(result.solved).toBe(true);
      assertValidSolution(grid, fx.agents, result);
    });
  }

  it('falls back to prioritized when CBS budget is exhausted', () => {
    // F4 bottleneck forces CBS to branch; prioritized can still solve it (suboptimally)
    const fx = FIXTURES[3];
    const grid = fromStrings(fx.rows);
    const result = planMapf(grid, fx.agents, { maxExpansions: 1 });
    expect(result.solved).toBe(true);
    expect(result.strategy).toBe('prioritized');
    assertValidSolution(grid, fx.agents, result);
    expect(result.cost).toBeGreaterThanOrEqual(fx.optimalCost);
  });
});

describe('CBS is necessary: prioritized fails the corridor swap', () => {
  it('prioritized cannot solve the single-alcove swap, CBS solves it optimally', () => {
    const fx = FIXTURES[2]; // F3 corridor swap
    const grid = fromStrings(fx.rows);
    const prio = prioritizedPlanning(grid, fx.agents);
    expect(prio.solved).toBe(false);
    const opt = cbs(grid, fx.agents);
    expect(opt.solved).toBe(true);
    expect(opt.cost).toBe(fx.optimalCost);
  });
});

describe('prioritized planning produces valid (not necessarily optimal) solutions', () => {
  for (const name of ['F1', 'F2', 'F5', 'F7']) {
    const fx = FIXTURES.find((f) => f.name.startsWith(name))!;
    it(`${fx.name}`, () => {
      const grid = fromStrings(fx.rows);
      const result = prioritizedPlanning(grid, fx.agents);
      expect(result.solved).toBe(true);
      assertValidSolution(grid, fx.agents, result);
      expect(result.cost).toBeGreaterThanOrEqual(fx.optimalCost);
    });
  }
});

describe('unsolvable instances', () => {
  it('goal sealed behind walls → not solved', () => {
    // agent 0 goal (2,0) is walled off from its start
    const grid = fromStrings(['.#.', '.#.']);
    const agents: Agent[] = [{ id: 0, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 } }];
    const result = cbs(grid, agents, { maxTimestep: 50 });
    expect(result.solved).toBe(false);
  });

  it('empty agent list → trivially solved, cost 0', () => {
    const grid = fromStrings(['...']);
    const result = cbs(grid, []);
    expect(result.solved).toBe(true);
    expect(result.cost).toBe(0);
    expect(result.paths).toEqual([]);
  });
});

describe('determinism of the planner', () => {
  it('same instance → identical cost and paths', () => {
    const grid = fromStrings(FIXTURES[3].rows);
    const r1 = cbs(grid, FIXTURES[3].agents);
    const r2 = cbs(grid, FIXTURES[3].agents);
    expect(r1.cost).toBe(r2.cost);
    expect(r1.paths).toEqual(r2.paths);
  });
});
