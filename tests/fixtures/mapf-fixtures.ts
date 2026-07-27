import type { Agent } from '../../src/core/types';

export interface MapfFixture {
  name: string;
  rows: string[];
  agents: Agent[];
  /** hand-verified optimal sum-of-costs */
  optimalCost: number;
  note: string;
}

const a = (id: number, sx: number, sy: number, gx: number, gy: number): Agent => ({
  id,
  start: { x: sx, y: sy },
  goal: { x: gx, y: gy },
});

/**
 * Eight known-optimal MAPF instances. Optima verified by hand (lower-bound-achieved
 * or explicit enumeration). See per-fixture notes.
 */
export const FIXTURES: MapfFixture[] = [
  {
    name: 'F1 single straight line',
    rows: ['.....'],
    agents: [a(0, 0, 0, 4, 0)],
    optimalCost: 4,
    note: 'one agent, 4 moves, no conflicts.',
  },
  {
    name: 'F2 two parallel lanes',
    rows: ['.....', '.....'],
    agents: [a(0, 0, 0, 4, 0), a(1, 0, 1, 4, 1)],
    optimalCost: 8,
    note: 'independent lanes, 4 + 4.',
  },
  {
    name: 'F3 corridor swap via alcove',
    rows: ['...', '#.#'],
    agents: [a(0, 0, 0, 2, 0), a(1, 2, 0, 0, 0)],
    optimalCost: 7,
    note: 'single-width corridor, one alcove (1,1). One detours (+2), one waits (+1). LB 7.',
  },
  {
    name: 'F4 bottleneck door cross',
    rows: ['...', '#.#', '...'],
    agents: [a(0, 0, 0, 0, 2), a(1, 2, 0, 2, 2)],
    optimalCost: 9,
    note: 'both cross through single door (1,1); one waits ≥1 ⇒ 4 + 5. LB 9.',
  },
  {
    name: 'F5 open-room diagonal cross',
    rows: ['.....', '.....', '.....', '.....', '.....'],
    agents: [a(0, 0, 0, 4, 4), a(1, 4, 0, 0, 4)],
    optimalCost: 16,
    note: 'sum of individual shortest (8 + 8); conflict-free routing at that cost exists.',
  },
  {
    name: 'F6 four-agent cyclic rotation',
    rows: ['..', '..'],
    agents: [a(0, 0, 0, 1, 0), a(1, 1, 0, 1, 1), a(2, 1, 1, 0, 1), a(3, 0, 1, 0, 0)],
    optimalCost: 4,
    note: 'simultaneous rotation around 2x2; no vertex/edge conflict; 1 move each.',
  },
  {
    name: 'F7 follow in corridor',
    rows: ['....'],
    agents: [a(0, 0, 0, 2, 0), a(1, 1, 0, 3, 0)],
    optimalCost: 4,
    note: 'trailing agent follows; 2 + 2, no waiting needed.',
  },
  {
    name: 'F8 adjacent swap needs detour',
    rows: ['..', '..'],
    agents: [a(0, 0, 0, 1, 0), a(1, 1, 0, 0, 0)],
    optimalCost: 4,
    note: 'direct swap illegal; one detours (3 moves), other direct (1). LB 4.',
  },
];
