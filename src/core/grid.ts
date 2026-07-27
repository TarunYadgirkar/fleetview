import type { Cell, CellType } from './types';

export const CELL_CODE: Record<CellType, number> = {
  empty: 0,
  wall: 1,
  rack: 2,
  pick: 3,
  charge: 4,
  deposit: 5,
};

export const CODE_CELL: CellType[] = ['empty', 'wall', 'rack', 'pick', 'charge', 'deposit'];

const CHAR_TO_TYPE: Record<string, CellType> = {
  '.': 'empty',
  '#': 'wall',
  R: 'rack',
  P: 'pick',
  C: 'charge',
  D: 'deposit',
};

const TYPE_TO_CHAR: Record<CellType, string> = {
  empty: '.',
  wall: '#',
  rack: 'R',
  pick: 'P',
  charge: 'C',
  deposit: 'D',
};

export interface Grid {
  width: number;
  height: number;
  /** row-major CellType codes */
  cells: Uint8Array;
}

export function createGrid(width: number, height: number, fill: CellType = 'empty'): Grid {
  const cells = new Uint8Array(width * height);
  if (fill !== 'empty') cells.fill(CELL_CODE[fill]);
  return { width, height, cells };
}

export function idx(grid: Grid, x: number, y: number): number {
  return y * grid.width + x;
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

export function cellAt(grid: Grid, x: number, y: number): CellType {
  return CODE_CELL[grid.cells[idx(grid, x, y)]];
}

/** Robots may occupy any in-bounds cell that is not a wall or a rack. */
export function isPassable(grid: Grid, x: number, y: number): boolean {
  if (!inBounds(grid, x, y)) return false;
  const code = grid.cells[idx(grid, x, y)];
  return code !== CELL_CODE.wall && code !== CELL_CODE.rack;
}

/** Immutable single-cell update (editor undo-friendly). Sim never mutates the grid. */
export function setCell(grid: Grid, x: number, y: number, type: CellType): Grid {
  const cells = new Uint8Array(grid.cells);
  cells[idx(grid, x, y)] = CELL_CODE[type];
  return { width: grid.width, height: grid.height, cells };
}

/** In-place set for batch editor operations on a freshly-cloned grid. */
export function setCellInPlace(grid: Grid, x: number, y: number, type: CellType): void {
  grid.cells[idx(grid, x, y)] = CELL_CODE[type];
}

export function cloneGrid(grid: Grid): Grid {
  return { width: grid.width, height: grid.height, cells: new Uint8Array(grid.cells) };
}

/** Build a grid from ASCII rows. Handy for fixtures and presets. */
export function fromStrings(rows: string[]): Grid {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    if (row.length !== width) {
      throw new Error(`Row ${y} width ${row.length} != ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const type = CHAR_TO_TYPE[row[x]];
      if (type === undefined) throw new Error(`Unknown cell char '${row[x]}' at ${x},${y}`);
      cells[y * width + x] = CELL_CODE[type];
    }
  }
  return { width, height, cells };
}

export function toStrings(grid: Grid): string[] {
  const rows: string[] = [];
  for (let y = 0; y < grid.height; y++) {
    let row = '';
    for (let x = 0; x < grid.width; x++) {
      row += TYPE_TO_CHAR[cellAt(grid, x, y)];
    }
    rows.push(row);
  }
  return rows;
}

/** 4-connected neighbors that are in-bounds and passable. Deterministic order: N, E, S, W. */
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export function passableNeighbors(grid: Grid, x: number, y: number, out: Cell[]): void {
  out.length = 0;
  for (let i = 0; i < 4; i++) {
    const nx = x + DX[i];
    const ny = y + DY[i];
    if (isPassable(grid, nx, ny)) out.push({ x: nx, y: ny });
  }
}

export function cellId(grid: Grid, x: number, y: number): number {
  return y * grid.width + x;
}

export function cellFromId(grid: Grid, id: number): Cell {
  return { x: id % grid.width, y: Math.floor(id / grid.width) };
}

export function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
