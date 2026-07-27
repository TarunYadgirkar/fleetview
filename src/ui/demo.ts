import { fromStrings, isPassable } from '../core/grid';
import { cbs } from '../core/pathfinding/cbs';
import type { Agent, Cell } from '../core/types';
import { PALETTE } from './renderer';

/**
 * The classic corridor swap: a single-width corridor with one passing bay. Two robots must
 * exchange ends. Without conflict resolution they meet nose-to-nose and stop forever; CBS makes
 * one wait in the bay. This is the whole argument for the solver, in five cells.
 */
const ROWS = ['...', '#.#'];

const AGENTS: Agent[] = [
  { id: 0, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 } },
  { id: 1, start: { x: 2, y: 0 }, goal: { x: 0, y: 0 } },
];

const ROBOT_COLORS = [PALETTE.hivis, '#4fa3c7'];
const HOLD_FRAMES = 14;

interface DemoTrack {
  paths: Cell[][];
  deadlockAt: number | null;
  cost: number | null;
}

/** Each robot greedily steps toward its goal and waits when the next cell is taken. */
function naiveTrack(): DemoTrack {
  const grid = fromStrings(ROWS);
  const positions = AGENTS.map((a) => ({ ...a.start }));
  const paths: Cell[][] = positions.map((p) => [{ ...p }]);
  const STEPS = 8;

  for (let t = 0; t < STEPS; t++) {
    const occupied = new Set(positions.map((p) => `${p.x},${p.y}`));
    let moved = false;
    for (let i = 0; i < AGENTS.length; i++) {
      const goal = AGENTS[i].goal;
      const here = positions[i];
      if (here.x === goal.x && here.y === goal.y) continue;
      const dx = Math.sign(goal.x - here.x);
      const next = { x: here.x + dx, y: here.y };
      if (isPassable(grid, next.x, next.y) && !occupied.has(`${next.x},${next.y}`)) {
        occupied.delete(`${here.x},${here.y}`);
        occupied.add(`${next.x},${next.y}`);
        positions[i] = next;
        moved = true;
      }
    }
    for (let i = 0; i < AGENTS.length; i++) paths[i].push({ ...positions[i] });
    if (!moved) return { paths, deadlockAt: t, cost: null };
  }
  return { paths, deadlockAt: null, cost: null };
}

function cbsTrack(): DemoTrack {
  const grid = fromStrings(ROWS);
  const result = cbs(grid, AGENTS);
  if (!result.solved) return naiveTrack();
  return { paths: result.paths, deadlockAt: null, cost: result.cost };
}

function positionAt(path: Cell[], t: number): Cell {
  return path[Math.min(Math.max(0, Math.floor(t)), path.length - 1)];
}

function lerpPosition(path: Cell[], t: number): { x: number; y: number } {
  const a = positionAt(path, t);
  const b = positionAt(path, t + 1);
  const frac = t - Math.floor(t);
  const ease = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
  return { x: a.x + (b.x - a.x) * ease, y: a.y + (b.y - a.y) * ease };
}

function drawTrack(
  canvas: HTMLCanvasElement,
  track: DemoTrack,
  t: number,
  stalled: boolean,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const grid = fromStrings(ROWS);
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 260;
  const cellSize = Math.floor(w / grid.width);
  const h = cellSize * grid.height;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const offsetX = Math.round((w - cellSize * grid.width) / 2);

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const px = offsetX + x * cellSize;
      const py = y * cellSize;
      const open = isPassable(grid, x, y);
      ctx.fillStyle = open ? PALETTE.concrete : 'rgba(42,46,44,0.55)';
      ctx.fillRect(px, py, cellSize - 2, cellSize - 2);
    }
  }

  // goal markers
  AGENTS.forEach((agent, i) => {
    const px = offsetX + agent.goal.x * cellSize;
    const py = agent.goal.y * cellSize;
    ctx.strokeStyle = ROBOT_COLORS[i];
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(px + 5, py + 5, cellSize - 12, cellSize - 12);
    ctx.setLineDash([]);
  });

  track.paths.forEach((path, i) => {
    const pos = lerpPosition(path, t);
    const px = offsetX + pos.x * cellSize;
    const py = pos.y * cellSize;
    const inset = cellSize * 0.2;
    ctx.fillStyle = ROBOT_COLORS[i];
    ctx.fillRect(px + inset, py + inset, cellSize - inset * 2 - 2, cellSize - inset * 2 - 2);
    ctx.strokeStyle = 'rgba(20,22,21,0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + inset, py + inset, cellSize - inset * 2 - 2, cellSize - inset * 2 - 2);
  });

  if (stalled) {
    const a = lerpPosition(track.paths[0], t);
    const b = lerpPosition(track.paths[1], t);
    const mx = offsetX + ((a.x + b.x) / 2) * cellSize + cellSize / 2 - 1;
    const my = ((a.y + b.y) / 2) * cellSize + cellSize / 2;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 240);
    ctx.strokeStyle = `rgba(226,74,42,${pulse})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(mx, my, cellSize * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export interface DemoHandles {
  stop(): void;
}

/**
 * Runs both tracks in lockstep so the two panels stay comparable frame for frame.
 * Loops with a hold at the end of each cycle.
 */
export function startCorridorDemo(
  naiveCanvas: HTMLCanvasElement,
  cbsCanvas: HTMLCanvasElement,
  onReady?: (info: { cost: number | null; naiveStalled: boolean }) => void,
): DemoHandles {
  const naive = naiveTrack();
  const solved = cbsTrack();
  onReady?.({ cost: solved.cost, naiveStalled: naive.deadlockAt !== null });

  const span = Math.max(...solved.paths.map((p) => p.length), ...naive.paths.map((p) => p.length));
  let raf = 0;
  let start = performance.now();
  const speed = 1.6; // cells per second

  const frame = (now: number) => {
    const elapsed = ((now - start) / 1000) * speed;
    if (elapsed > span + HOLD_FRAMES / speed) start = now;
    const t = Math.min(elapsed, span - 1);
    const naiveT = Math.min(t, naive.paths[0].length - 1);
    drawTrack(naiveCanvas, naive, naiveT, naive.deadlockAt !== null && t > naive.deadlockAt);
    drawTrack(cbsCanvas, solved, t, false);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}
