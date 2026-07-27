import { type Grid, cellAt, isPassable } from '../core/grid';
import { Rng } from '../core/rng';
import type { Cell } from '../core/types';
import { DistanceFieldCache } from './distanceField';
import { mean, ordersPerHour, percentile } from './metrics';
import { type Order, OrderSource } from './orders';
import { shortestPath } from './shortestPath';
import type {
  FleetSpec,
  RobotState,
  RobotView,
  SimConfig,
  SimMetrics,
  SimResult,
  SimSnapshot,
} from './types';

/** consecutive blocked ticks before a robot tries to route around the obstruction */
const DETOUR_AFTER_BLOCKED = 4;
/** consecutive blocked ticks before a robot gives ground to break a head-on deadlock */
const RETREAT_AFTER_BLOCKED = 12;

interface Robot {
  id: number;
  /** staging cell this robot returns to when it has nothing to do */
  home: number;
  cell: number;
  prevCell: number;
  state: RobotState;
  path: number[];
  pathIndex: number;
  target: number;
  order: Order | null;
  carrying: number;
  battery: number;
  dwell: number;
  cooldown: number;
  lastDir: number;
  blockedTicks: number;
  activeTicks: number;
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

function dirBetween(from: number, to: number, width: number): number {
  const dx = (to % width) - (from % width);
  const dy = Math.floor(to / width) - Math.floor(from / width);
  for (let i = 0; i < 4; i++) if (DX[i] === dx && DY[i] === dy) return i;
  return -1;
}

const TRAVEL_STATES: ReadonlySet<RobotState> = new Set<RobotState>([
  'toPick',
  'toDeposit',
  'toCharge',
  'parking',
]);

const WORKING_STATES: ReadonlySet<RobotState> = new Set<RobotState>([
  'toPick',
  'picking',
  'toDeposit',
  'depositing',
]);

/**
 * Tick-based discrete-event simulation. Deterministic given (grid, fleet, config.seed, starts):
 * every stochastic draw goes through one seeded Rng and every ordering is explicit.
 *
 * Movement uses cooperative reservation stepping: a robot may only enter a cell that is empty
 * or has already been vacated this tick, and each cell can be claimed once. That makes vertex
 * collisions and edge swaps structurally impossible rather than merely detected. Robots follow
 * cached BFS distance-field routes and A*-detour around persistent blockages.
 */
export class Simulation {
  private readonly rng: Rng;
  private readonly fields: DistanceFieldCache;
  private readonly orderSource: OrderSource;
  private readonly robots: Robot[] = [];
  private readonly chargeCells: number[] = [];

  private readonly heat: Float64Array;
  private readonly occupant: Int32Array;

  private pending: (Order | null)[] = [];
  private pendingHead = 0;
  private pendingCount = 0;
  private activeCount = 0;

  private tickCount = 0;
  private completed = 0;
  private itemsPicked = 0;
  private itemsDeposited = 0;
  private latencies: number[] = [];
  private violations: string[] = [];

  constructor(
    public readonly grid: Grid,
    public readonly fleet: FleetSpec,
    public readonly config: SimConfig,
    public readonly starts: Cell[],
  ) {
    this.rng = new Rng(config.seed);
    this.fields = new DistanceFieldCache(grid);
    this.heat = new Float64Array(grid.width * grid.height);
    this.occupant = new Int32Array(grid.width * grid.height).fill(-1);

    const pickCells: number[] = [];
    const depositCells: number[] = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const id = y * grid.width + x;
        const type = cellAt(grid, x, y);
        if (type === 'pick') pickCells.push(id);
        else if (type === 'deposit') depositCells.push(id);
        else if (type === 'charge') this.chargeCells.push(id);
      }
    }
    this.orderSource = new OrderSource(config, pickCells, depositCells);

    const count = Math.min(fleet.count, starts.length);
    for (let i = 0; i < count; i++) {
      const cellId = starts[i].y * grid.width + starts[i].x;
      this.robots.push({
        id: i,
        home: cellId,
        cell: cellId,
        prevCell: cellId,
        state: 'idle',
        path: [],
        pathIndex: 0,
        target: -1,
        order: null,
        carrying: 0,
        battery: fleet.batteryCapacity,
        dwell: 0,
        cooldown: 0,
        lastDir: -1,
        blockedTicks: 0,
        activeTicks: 0,
      });
      this.occupant[cellId] = i;
    }
  }

  get tick(): number {
    return this.tickCount;
  }

  get done(): boolean {
    if (this.tickCount >= this.config.maxTicks) return true;
    return this.orderSource.exhausted && this.pendingCount === 0 && this.activeCount === 0;
  }

  step(): void {
    if (this.done) return;
    const tick = this.tickCount;

    for (const order of this.orderSource.arrivals(tick, this.rng)) {
      this.pending.push(order);
      this.pendingCount++;
    }

    this.assign();
    this.progressDwells();
    this.move();

    for (const r of this.robots) {
      this.heat[r.cell] += 1;
      if (WORKING_STATES.has(r.state)) {
        r.activeTicks++;
        if (r.battery > 0) r.battery--;
      }
      if (r.cooldown > 0) r.cooldown--;
    }

    this.tickCount++;
    this.violations = this.detectViolations();
  }

  checkInvariants(): string[] {
    return this.violations;
  }

  private detectViolations(): string[] {
    const found: string[] = [];
    const byCell = new Map<number, number>();
    for (const r of this.robots) {
      const prior = byCell.get(r.cell);
      if (prior !== undefined) {
        found.push(`tick ${this.tickCount}: robots ${prior} and ${r.id} share cell ${r.cell}`);
      }
      byCell.set(r.cell, r.id);

      const x = r.cell % this.grid.width;
      const y = Math.floor(r.cell / this.grid.width);
      if (!isPassable(this.grid, x, y)) {
        found.push(`tick ${this.tickCount}: robot ${r.id} inside blocked cell ${x},${y}`);
      }
    }
    for (const r of this.robots) {
      if (r.prevCell === r.cell) continue;
      const other = byCell.get(r.prevCell);
      if (other === undefined || other === r.id) continue;
      const o = this.robots[other];
      if (o.prevCell === r.cell) {
        found.push(`tick ${this.tickCount}: robots ${r.id} and ${o.id} swapped cells`);
      }
    }
    const inTransit = this.robots.reduce((s, r) => s + r.carrying, 0);
    if (this.itemsPicked - this.itemsDeposited - inTransit !== 0) {
      found.push(`tick ${this.tickCount}: item conservation violated`);
    }
    return found;
  }

  private assign(): void {
    const idle: Robot[] = [];
    for (const r of this.robots) {
      if (r.state !== 'idle' && r.state !== 'parking') continue;
      if (this.needsCharge(r) && this.routeToCharge(r)) continue;
      idle.push(r);
    }
    if (idle.length === 0) return;

    const window = Math.min(this.pending.length, this.pendingHead + idle.length + 4);
    for (let i = this.pendingHead; i < window && idle.length > 0; i++) {
      const order = this.pending[i];
      if (order === null) continue;

      let bestIdx = -1;
      let bestDist = Infinity;
      for (let k = 0; k < idle.length; k++) {
        const d = this.fields.distance(idle[k].cell, order.pick);
        if (d < 0) continue;
        if (d < bestDist || (d === bestDist && bestIdx >= 0 && idle[k].id < idle[bestIdx].id)) {
          bestDist = d;
          bestIdx = k;
        }
      }
      if (bestIdx === -1) continue;

      const robot = idle[bestIdx];
      const path = this.fields.path(robot.cell, order.pick);
      if (path === null) continue;

      idle.splice(bestIdx, 1);
      order.assignedTo = robot.id;
      robot.order = order;
      robot.target = order.pick;
      robot.path = path;
      robot.pathIndex = 0;
      robot.state = 'toPick';
      robot.blockedTicks = 0;
      this.pending[i] = null;
      this.pendingCount--;
      this.activeCount++;
    }
    while (this.pendingHead < this.pending.length && this.pending[this.pendingHead] === null) {
      this.pendingHead++;
    }

    // whatever is left has no work: send it back to staging so it stops squatting on
    // stations and single-width aisles, which is what strands other robots
    for (const r of idle) {
      if (r.state === 'idle' && r.cell !== r.home) this.routeHome(r);
    }
  }

  private routeHome(r: Robot): void {
    const path = this.fields.path(r.cell, r.home);
    if (path === null) return;
    r.target = r.home;
    r.path = path;
    r.pathIndex = 0;
    r.state = 'parking';
    r.blockedTicks = 0;
  }

  private needsCharge(r: Robot): boolean {
    if (this.chargeCells.length === 0) return false;
    return r.battery < this.fleet.batteryCapacity * this.fleet.chargeThreshold;
  }

  private routeToCharge(r: Robot): boolean {
    let best = -1;
    let bestDist = Infinity;
    for (const dock of this.chargeCells) {
      const d = this.fields.distance(r.cell, dock);
      if (d >= 0 && d < bestDist) {
        bestDist = d;
        best = dock;
      }
    }
    if (best === -1) return false;
    const path = this.fields.path(r.cell, best);
    if (path === null) return false;
    r.target = best;
    r.path = path;
    r.pathIndex = 0;
    r.state = 'toCharge';
    r.blockedTicks = 0;
    return true;
  }

  private progressDwells(): void {
    for (const r of this.robots) {
      if (r.state === 'picking') {
        if (--r.dwell > 0) continue;
        r.carrying = this.fleet.payload;
        this.itemsPicked += this.fleet.payload;
        const order = r.order!;
        const path = this.fields.path(r.cell, order.deposit);
        if (path === null) {
          r.state = 'idle';
          continue;
        }
        r.target = order.deposit;
        r.path = path;
        r.pathIndex = 0;
        r.state = 'toDeposit';
        r.blockedTicks = 0;
      } else if (r.state === 'depositing') {
        if (--r.dwell > 0) continue;
        this.itemsDeposited += r.carrying;
        r.carrying = 0;
        const order = r.order!;
        order.completedTick = this.tickCount;
        this.latencies.push(this.tickCount - order.arrivalTick);
        this.completed++;
        this.activeCount--;
        r.order = null;
        r.target = -1;
        r.state = 'idle';
      } else if (r.state === 'charging') {
        r.battery = Math.min(this.fleet.batteryCapacity, r.battery + this.fleet.chargeRate);
        if (r.battery >= this.fleet.batteryCapacity) r.state = 'idle';
      }
    }
  }

  private move(): void {
    const width = this.grid.width;
    const desired = new Map<number, number>();
    const movers: Robot[] = [];

    for (const r of this.robots) {
      r.prevCell = r.cell;
      if (!TRAVEL_STATES.has(r.state)) continue;
      // a robot that ran out of path without arriving (e.g. after retreating) replans
      if (r.pathIndex >= r.path.length && r.cell !== r.target && r.target >= 0) {
        const fresh = this.fields.path(r.cell, r.target);
        if (fresh !== null) {
          r.path = fresh;
          r.pathIndex = 0;
        }
      }
      if (r.cooldown > 0) continue;
      if (r.pathIndex >= r.path.length) continue;
      desired.set(r.id, r.path[r.pathIndex]);
      movers.push(r);
    }

    // idle robots step aside when they are the obstruction
    for (const r of movers) {
      const want = desired.get(r.id)!;
      const occ = this.occupant[want];
      if (occ === -1) continue;
      const blocker = this.robots[occ];
      if (blocker.state !== 'idle' || desired.has(blocker.id)) continue;
      const aside = this.freeNeighbor(blocker.cell, r.cell);
      if (aside !== -1) {
        desired.set(blocker.id, aside);
        movers.push(blocker);
      }
    }

    const claimed = new Map<number, number>();
    const vacated = new Set<number>();
    const settled = new Set<number>();

    for (const r of this.robots) {
      if (!desired.has(r.id)) claimed.set(r.cell, r.id);
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const r of movers) {
        if (settled.has(r.id)) continue;
        const want = desired.get(r.id)!;
        if (claimed.has(want)) continue;
        const occ = this.occupant[want];
        if (occ !== -1 && !vacated.has(want)) continue;
        claimed.set(want, r.id);
        vacated.add(r.cell);
        settled.add(r.id);
        changed = true;
      }
    }

    // clear every vacated cell before claiming any, otherwise a follower moving into a
    // leader's old cell gets wiped when the leader clears it afterwards
    for (const r of movers) {
      if (settled.has(r.id)) this.occupant[r.cell] = -1;
    }

    for (const r of movers) {
      const want = desired.get(r.id)!;
      if (settled.has(r.id)) {
        r.cell = want;
        this.occupant[want] = r.id;
        const dir = dirBetween(r.prevCell, want, width);
        const turned = r.lastDir !== -1 && dir !== r.lastDir;
        r.lastDir = dir;
        r.cooldown = Math.max(0, this.fleet.ticksPerMove - 1) + (turned ? this.fleet.turnCost : 0);
        r.blockedTicks = 0;
        if (TRAVEL_STATES.has(r.state) && r.path[r.pathIndex] === want) r.pathIndex++;
      } else if (TRAVEL_STATES.has(r.state)) {
        r.blockedTicks++;
        this.heat[want] += 1;
        // id-staggered so two robots meeting head-on never give ground on the same tick
        if (r.blockedTicks >= RETREAT_AFTER_BLOCKED + (r.id % 3)) this.retreat(r);
        else if (r.blockedTicks >= DETOUR_AFTER_BLOCKED) this.detour(r);
      }
    }

    for (const r of this.robots) {
      if (!TRAVEL_STATES.has(r.state)) continue;
      if (r.cell !== r.target) continue;
      if (r.state === 'toPick') {
        r.state = 'picking';
        r.dwell = Math.max(1, this.config.pickDwell);
      } else if (r.state === 'toDeposit') {
        r.state = 'depositing';
        r.dwell = Math.max(1, this.config.depositDwell);
      } else if (r.state === 'parking') {
        r.state = 'idle';
        r.target = -1;
      } else {
        r.state = 'charging';
      }
      r.path = [];
      r.pathIndex = 0;
    }
  }

  private freeNeighbor(from: number, avoid: number): number {
    const width = this.grid.width;
    const x = from % width;
    const y = Math.floor(from / width);
    for (let i = 0; i < 4; i++) {
      const nx = x + DX[i];
      const ny = y + DY[i];
      if (!isPassable(this.grid, nx, ny)) continue;
      const nid = ny * width + nx;
      if (nid === avoid) continue;
      if (this.occupant[nid] !== -1) continue;
      return nid;
    }
    return -1;
  }

  /**
   * Last-resort deadlock breaker: give ground to a free neighbour and replan from there.
   * Two robots nose-to-nose in a single-width aisle can never resolve by waiting or detouring
   * (every alternative route is behind one of them), so somebody has to back up.
   */
  private retreat(r: Robot): void {
    const aside = this.freeNeighbor(r.cell, -1);
    if (aside === -1) return;
    r.path = [aside];
    r.pathIndex = 0;
    r.blockedTicks = 0;
  }

  private detour(r: Robot): void {
    if (r.target < 0) return;
    const width = this.grid.width;
    const blocked = new Set<number>();
    for (const other of this.robots) {
      if (other.id !== r.id) blocked.add(other.cell);
    }
    const path = shortestPath(
      this.grid,
      { x: r.cell % width, y: Math.floor(r.cell / width) },
      { x: r.target % width, y: Math.floor(r.target / width) },
      blocked,
    );
    if (path === null || path.length < 2) return;
    r.path = path.slice(1).map((c) => c.y * width + c.x);
    r.pathIndex = 0;
    r.blockedTicks = 0;
  }

  snapshot(): SimSnapshot {
    const width = this.grid.width;
    const robots: RobotView[] = this.robots.map((r) => ({
      id: r.id,
      x: r.cell % width,
      y: Math.floor(r.cell / width),
      state: r.state,
      battery: r.battery,
      carrying: r.carrying,
    }));
    return {
      tick: this.tickCount,
      robots,
      pendingOrders: this.pendingCount,
      activeOrders: this.activeCount,
      completedOrders: this.completed,
    };
  }

  metrics(): SimMetrics {
    const ticks = this.tickCount;
    const robotUtil = this.robots.map((r) => (ticks > 0 ? r.activeTicks / ticks : 0));
    const inTransit = this.robots.reduce((s, r) => s + r.carrying, 0);
    return {
      ticks,
      ordersAccepted: this.orderSource.totalGenerated,
      ordersCompleted: this.completed,
      ordersPerHour: ordersPerHour(this.completed, ticks, this.config.tickSeconds),
      utilization: robotUtil.length > 0 ? mean(robotUtil) : 0,
      robotUtil,
      latencyMean: mean(this.latencies),
      latencyP95: percentile(this.latencies, 0.95),
      heatmap: Array.from(this.heat),
      itemsPicked: this.itemsPicked,
      itemsDeposited: this.itemsDeposited,
      itemsInTransit: inTransit,
    };
  }

  run(): SimResult {
    while (!this.done) this.step();
    return { metrics: this.metrics() };
  }
}
