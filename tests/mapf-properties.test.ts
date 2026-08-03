import { describe, expect, it } from 'vitest';
import { cbs } from '../src/core/pathfinding/cbs';
import { prioritizedPlanning } from '../src/core/pathfinding/prioritized';
import { Rng } from '../src/core/rng';
import {
  assertValidSolution,
  generateInstances,
  independentCostLowerBound,
  permuteAgents,
} from './helpers';

const SEEDS = [1, 7, 20240607, 0xbeef];
const INSTANCES_PER_SEED = 200;
const MAX_EXPANSIONS = 20000;
/** unsolved instances are allowed (joint solvability is not guaranteed) but must stay rare */
const MAX_UNSOLVED = 20;

/**
 * The fixture suite proves CBS optimal on eight instances someone chose. These properties hold
 * for *any* instance, so they run over hundreds nobody chose. Permutation invariance is the one
 * that earns its keep: CBS indexes constraints and tie-breaks by agent array position, so
 * reordering the agents must not change the optimal cost, and a fixed-order fixture cannot see it.
 */
describe('CBS properties over seeded random instances', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: ${INSTANCES_PER_SEED} instances hold validity, admissibility, dominance, permutation invariance`, () => {
      const instances = generateInstances(seed, INSTANCES_PER_SEED);
      const permuteRng = new Rng(seed ^ 0x5bf03635);
      let unsolved = 0;

      for (const { grid, agents } of instances) {
        const result = cbs(grid, agents, { maxExpansions: MAX_EXPANSIONS });
        if (!result.solved) {
          unsolved++;
          continue;
        }

        assertValidSolution(grid, agents, result);

        const lowerBound = independentCostLowerBound(grid, agents);
        expect(result.cost, 'CBS cost below the sum-of-costs lower bound').toBeGreaterThanOrEqual(
          lowerBound,
        );

        const prio = prioritizedPlanning(grid, agents);
        if (prio.solved) {
          assertValidSolution(grid, agents, prio);
          expect(result.cost, 'optimal cost above prioritized cost').toBeLessThanOrEqual(prio.cost);
        }

        const permuted = permuteAgents(permuteRng, agents);
        const permutedResult = cbs(grid, permuted, { maxExpansions: MAX_EXPANSIONS });
        expect(permutedResult.solved, 'permuting agents lost the solution').toBe(true);
        assertValidSolution(grid, permuted, permutedResult);
        expect(permutedResult.cost, 'optimal cost depends on agent order').toBe(result.cost);
      }

      expect(unsolved, 'too many instances skipped — the suite is testing nothing').toBeLessThanOrEqual(
        MAX_UNSOLVED,
      );
    });
  }
});
