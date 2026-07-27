import { type Grid, fromStrings, toStrings } from './grid';
import type { Cell } from './types';

export interface Layout {
  name: string;
  grid: Grid;
  /** robot home cells, in placement order */
  robots: Cell[];
  cellSizePx: number;
}

export interface LayoutJson {
  version: 1;
  width: number;
  height: number;
  cells: string;
  robots: { id: number; x: number; y: number }[];
  meta: { name: string; cellSizePx: number };
}

export function serializeLayout(layout: Layout): LayoutJson {
  return {
    version: 1,
    width: layout.grid.width,
    height: layout.grid.height,
    cells: toStrings(layout.grid).join(''),
    robots: layout.robots.map((r, i) => ({ id: i, x: r.x, y: r.y })),
    meta: { name: layout.name, cellSizePx: layout.cellSizePx },
  };
}

class LayoutError extends Error {}

function fail(message: string): never {
  throw new LayoutError(`Invalid layout: ${message}`);
}

/** Parse and validate untrusted layout JSON (file import). Never trusts shape or ranges. */
export function deserializeLayout(input: unknown): Layout {
  if (typeof input !== 'object' || input === null) fail('expected an object');
  const raw = input as Record<string, unknown>;

  if (raw.version !== 1) fail(`unsupported version ${String(raw.version)}`);

  const width = raw.width;
  const height = raw.height;
  if (!Number.isInteger(width) || (width as number) < 1 || (width as number) > 400) {
    fail('width must be an integer in 1..400');
  }
  if (!Number.isInteger(height) || (height as number) < 1 || (height as number) > 400) {
    fail('height must be an integer in 1..400');
  }
  const w = width as number;
  const h = height as number;

  if (typeof raw.cells !== 'string') fail('cells must be a string');
  const cells = raw.cells as string;
  if (cells.length !== w * h) fail(`cells length ${cells.length} != ${w * h}`);

  const rows: string[] = [];
  for (let y = 0; y < h; y++) rows.push(cells.slice(y * w, (y + 1) * w));

  let grid: Grid;
  try {
    grid = fromStrings(rows);
  } catch (e) {
    fail(e instanceof Error ? e.message : 'unparseable cells');
  }

  const robots: Cell[] = [];
  const seen = new Set<number>();
  if (raw.robots !== undefined) {
    if (!Array.isArray(raw.robots)) fail('robots must be an array');
    for (const entry of raw.robots) {
      if (typeof entry !== 'object' || entry === null) fail('robot entry must be an object');
      const r = entry as Record<string, unknown>;
      if (!Number.isInteger(r.x) || !Number.isInteger(r.y)) fail('robot x/y must be integers');
      const x = r.x as number;
      const y = r.y as number;
      if (x < 0 || y < 0 || x >= w || y >= h) fail(`robot out of bounds at ${x},${y}`);
      const id = y * w + x;
      if (seen.has(id)) fail(`two robots share cell ${x},${y}`);
      seen.add(id);
      robots.push({ x, y });
    }
  }

  const meta = (raw.meta ?? {}) as Record<string, unknown>;
  const name = typeof meta.name === 'string' ? meta.name : 'Imported layout';
  const cellSizePx =
    Number.isFinite(meta.cellSizePx) && (meta.cellSizePx as number) > 0
      ? Math.min(64, Math.max(4, Math.round(meta.cellSizePx as number)))
      : 24;

  return { name, grid, robots, cellSizePx };
}
