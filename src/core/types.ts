export interface Cell {
  x: number;
  y: number;
}

export type CellType = 'empty' | 'wall' | 'rack' | 'pick' | 'charge' | 'deposit';

export interface Agent {
  id: number;
  start: Cell;
  goal: Cell;
}

export type MapfStrategy = 'cbs' | 'prioritized' | 'partial' | 'none';

export interface MapfResult {
  /** paths[i][t] = cell of agent i at tick t. Length varies per agent (arrival time). */
  paths: Cell[][];
  /** sum of costs = Σ arrival time of each agent */
  cost: number;
  strategy: MapfStrategy;
  expansions: number;
  solved: boolean;
}

export interface MapfOptions {
  /** CBS high-level node-expansion budget (deterministic fallback trigger). */
  maxExpansions?: number;
  /** wall-clock guard, interactive path only (not used by deterministic tests). */
  timeBudgetMs?: number;
  /** low-level horizon cap (ticks). */
  maxTimestep?: number;
}
