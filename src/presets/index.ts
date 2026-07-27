import { type Grid, createGrid, setCellInPlace } from '../core/grid';
import type { Layout } from '../core/layout';
import type { Cell, CellType } from '../core/types';

export interface Preset {
  name: string;
  description: string;
  build(): Layout;
}

function painter(grid: Grid) {
  return (x: number, y: number, type: CellType) => {
    if (x >= 0 && y >= 0 && x < grid.width && y < grid.height) setCellInPlace(grid, x, y, type);
  };
}

/** Free (plain empty) cells scanned bottom-up, used as the robot home pool. */
function collectHomes(grid: Grid, limit = 256): Cell[] {
  const homes: Cell[] = [];
  for (let y = grid.height - 1; y >= 0 && homes.length < limit; y--) {
    for (let x = 0; x < grid.width && homes.length < limit; x++) {
      if (grid.cells[y * grid.width + x] === 0) homes.push({ x, y });
    }
  }
  return homes;
}

/**
 * Goods-to-person fulfillment centre: long double-deep rack runs, one-cell picking aisles,
 * cross-aisles every six rows, pick stations along the west wall and packing on the east.
 */
function buildFulfillmentCenter(): Layout {
  const width = 40;
  const height = 24;
  const grid = createGrid(width, height, 'empty');
  const paint = painter(grid);

  for (let x = 4; x <= 35; x++) {
    if ((x - 4) % 3 === 2) continue; // picking aisle
    for (let y = 2; y <= 21; y++) {
      if ((y - 2) % 6 === 5) continue; // cross aisle
      paint(x, y, 'rack');
    }
  }

  for (const y of [3, 6, 9, 12, 15, 18]) paint(0, y, 'pick');
  for (const y of [4, 8, 12, 16, 20]) paint(width - 1, y, 'deposit');
  for (const x of [2, 4, 6, 8]) paint(x, height - 1, 'charge');

  return {
    name: 'Fulfillment Centre',
    grid,
    robots: collectHomes(grid, 64),
    cellSizePx: 20,
  };
}

/**
 * Cross-dock sortation hub: inbound doors along the north wall, outbound chutes to the south,
 * a wide open sortation floor broken by structural columns. Congestion forms mid-floor.
 */
function buildCrossDock(): Layout {
  const width = 48;
  const height = 20;
  const grid = createGrid(width, height, 'empty');
  const paint = painter(grid);

  for (const bx of [8, 16, 24, 32, 40]) {
    for (const by of [5, 10, 14]) {
      paint(bx, by, 'rack');
      paint(bx + 1, by, 'rack');
      paint(bx, by + 1, 'rack');
      paint(bx + 1, by + 1, 'rack');
    }
  }

  for (let x = 4; x <= 44; x += 4) paint(x, 0, 'pick');
  for (let x = 6; x <= 42; x += 6) paint(x, height - 1, 'deposit');
  for (const y of [3, 7, 11, 15]) paint(0, y, 'charge');

  return {
    name: 'Cross-Dock Sortation',
    grid,
    robots: collectHomes(grid, 96),
    cellSizePx: 18,
  };
}

/**
 * Dense cold storage: deep 4x6 rack blocks on single-width aisles with only two inbound picks
 * and two outbound lanes. Deliberately bottleneck-heavy — the layout where fleet size saturates
 * early and the congestion heatmap earns its keep.
 */
function buildColdStorage(): Layout {
  const width = 32;
  const height = 32;
  const grid = createGrid(width, height, 'empty');
  const paint = painter(grid);

  for (let bx = 0; bx < 6; bx++) {
    for (let by = 0; by < 4; by++) {
      const x0 = 2 + bx * 5;
      const y0 = 2 + by * 7;
      for (let dx = 0; dx < 4; dx++) {
        for (let dy = 0; dy < 6; dy++) paint(x0 + dx, y0 + dy, 'rack');
      }
    }
  }

  paint(0, 5, 'pick');
  paint(0, 20, 'pick');
  paint(width - 1, 10, 'deposit');
  paint(width - 1, 25, 'deposit');
  paint(2, height - 1, 'charge');
  paint(5, height - 1, 'charge');

  return {
    name: 'Dense Cold Storage',
    grid,
    robots: collectHomes(grid, 64),
    cellSizePx: 20,
  };
}

export const PRESETS: Preset[] = [
  {
    name: 'Fulfillment Centre',
    description: '40×24 goods-to-person aisles, 6 pick stations, 5 packing lanes.',
    build: buildFulfillmentCenter,
  },
  {
    name: 'Cross-Dock Sortation',
    description: '48×20 open sortation floor, 11 inbound doors, 7 outbound chutes.',
    build: buildCrossDock,
  },
  {
    name: 'Dense Cold Storage',
    description: '32×32 narrow-aisle deep storage, only 2 picks and 2 outbound lanes.',
    build: buildColdStorage,
  },
];
