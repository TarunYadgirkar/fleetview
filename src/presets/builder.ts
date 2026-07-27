import { type Grid, createGrid, isPassable, setCellInPlace } from '../core/grid';
import type { Cell, CellType } from '../core/types';

export interface BuiltLayout {
  name: string;
  grid: Grid;
  /** ordered pool of robot home cells; take the first N for an N-robot fleet. */
  starts: Cell[];
}

export interface WarehouseOpts {
  width: number;
  height: number;
  name?: string;
  /** how many home cells to expose (defaults to a generous pool). */
  maxStarts?: number;
}

/**
 * Regular warehouse: single-cell rack pillars at odd/odd interior coords leave a
 * fully-connected aisle lattice (all even rows and columns are passable), so every
 * pick/deposit/charge cell is reachable from every start. Pick stations line the
 * left edge, deposit the right edge, charge docks the top-left.
 */
export function buildWarehouse(opts: WarehouseOpts): BuiltLayout {
  const { width, height } = opts;
  const grid = createGrid(width, height, 'empty');

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (x % 2 === 1 && y % 2 === 1) setCellInPlace(grid, x, y, 'rack');
    }
  }

  const paint = (x: number, y: number, t: CellType) => {
    if (x >= 0 && y >= 0 && x < width && y < height) setCellInPlace(grid, x, y, t);
  };

  for (let y = 1; y < height - 1; y += 2) {
    paint(0, y, 'pick');
    paint(width - 1, y, 'deposit');
  }
  for (let x = 0; x < Math.min(width, 8); x += 2) paint(x, 0, 'charge');

  const starts: Cell[] = [];
  const cap = opts.maxStarts ?? width * height;
  for (let y = height - 1; y >= 0 && starts.length < cap; y--) {
    for (let x = 0; x < width && starts.length < cap; x++) {
      if (isPassable(grid, x, y) && grid.cells[y * width + x] === 0) {
        starts.push({ x, y });
      }
    }
  }

  return { name: opts.name ?? `warehouse ${width}x${height}`, grid, starts };
}
