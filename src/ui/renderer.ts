import { CODE_CELL, type Grid } from '../core/grid';
import type { CellType } from '../core/types';

export const PALETTE = {
  concrete: '#b8b5ac',
  slabJoint: '#a8a49b',
  steel: '#6e6a61',
  wall: '#2a2e2c',
  paint: '#e8b930',
  lane: '#4fa3c7',
  charge: '#6fa287',
  hivis: '#ff6a1a',
  shell: '#1c1f1e',
  ink: '#edeae3',
} as const;

const CELL_FILL: Record<CellType, string | null> = {
  empty: null,
  wall: PALETTE.wall,
  rack: PALETTE.steel,
  pick: PALETTE.paint,
  charge: PALETTE.charge,
  deposit: PALETTE.lane,
};

export interface ViewTransform {
  cell: number;
  offsetX: number;
  offsetY: number;
}

export interface RenderState {
  grid: Grid;
  /** cell ids of robot homes, drawn when no run is loaded */
  homes: number[];
  /** cell id per robot for the current frame, or null when idle */
  robotCells: Int32Array | null;
  robotStates: Uint8Array | null;
  heatmap: number[] | null;
  showHeatmap: boolean;
  backdrop: HTMLImageElement | null;
  backdropOpacity: number;
  hoverCell: number;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private view: ViewTransform = { cell: 16, offsetX: 0, offsetY: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
  }

  get transform(): ViewTransform {
    return this.view;
  }

  /** viewport pixel → cell coords, or null outside the floor */
  screenToCell(grid: Grid, px: number, py: number): { x: number; y: number } | null {
    const { cell, offsetX, offsetY } = this.view;
    const x = Math.floor((px - offsetX) / cell);
    const y = Math.floor((py - offsetY) / cell);
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
    return { x, y };
  }

  resize(grid: Grid): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cell = Math.max(
      3,
      Math.floor(Math.min(rect.width / grid.width, rect.height / grid.height)),
    );
    this.view = {
      cell,
      offsetX: Math.round((rect.width - cell * grid.width) / 2),
      offsetY: Math.round((rect.height - cell * grid.height) / 2),
    };
  }

  draw(state: RenderState): void {
    const { ctx } = this;
    const { grid } = state;
    const { cell, offsetX, offsetY } = this.view;
    const rect = this.canvas.getBoundingClientRect();

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = PALETTE.shell;
    ctx.fillRect(0, 0, rect.width, rect.height);

    const floorW = cell * grid.width;
    const floorH = cell * grid.height;

    ctx.fillStyle = PALETTE.concrete;
    ctx.fillRect(offsetX, offsetY, floorW, floorH);

    if (state.backdrop && state.backdropOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = state.backdropOpacity;
      ctx.drawImage(state.backdrop, offsetX, offsetY, floorW, floorH);
      ctx.restore();
    }

    this.drawSlabJoints(grid, floorW, floorH);
    this.drawCells(grid);
    if (state.showHeatmap && state.heatmap) this.drawHeat(grid, state.heatmap);
    if (state.robotCells) this.drawRobots(grid, state.robotCells, state.robotStates);
    else this.drawHomes(grid, state.homes);

    if (state.hoverCell >= 0) {
      const hx = state.hoverCell % grid.width;
      const hy = Math.floor(state.hoverCell / grid.width);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(offsetX + hx * cell + 1, offsetY + hy * cell + 1, cell - 2, cell - 2);
    }

    ctx.strokeStyle = PALETTE.wall;
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX - 1, offsetY - 1, floorW + 2, floorH + 2);
  }

  private drawSlabJoints(grid: Grid, floorW: number, floorH: number): void {
    const { ctx } = this;
    const { cell, offsetX, offsetY } = this.view;
    if (cell < 6) return;
    ctx.strokeStyle = PALETTE.slabJoint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= grid.width; x++) {
      const px = Math.round(offsetX + x * cell) + 0.5;
      ctx.moveTo(px, offsetY);
      ctx.lineTo(px, offsetY + floorH);
    }
    for (let y = 0; y <= grid.height; y++) {
      const py = Math.round(offsetY + y * cell) + 0.5;
      ctx.moveTo(offsetX, py);
      ctx.lineTo(offsetX + floorW, py);
    }
    ctx.stroke();
  }

  private drawCells(grid: Grid): void {
    const { ctx } = this;
    const { cell, offsetX, offsetY } = this.view;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const type = CODE_CELL[grid.cells[y * grid.width + x]];
        const fill = CELL_FILL[type];
        if (fill === null) continue;
        const px = offsetX + x * cell;
        const py = offsetY + y * cell;
        ctx.fillStyle = fill;
        if (type === 'pick' || type === 'deposit' || type === 'charge') {
          ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
        } else {
          ctx.fillRect(px, py, cell, cell);
        }
      }
    }
  }

  /** congestion drawn as rubber scuffing worn into the slab */
  private drawHeat(grid: Grid, heat: number[]): void {
    const { ctx } = this;
    const { cell, offsetX, offsetY } = this.view;
    let peak = 0;
    for (const v of heat) if (v > peak) peak = v;
    if (peak <= 0) return;

    for (let i = 0; i < heat.length; i++) {
      const v = heat[i];
      if (v <= 0) continue;
      const t = Math.min(1, Math.sqrt(v / peak));
      if (t < 0.04) continue;
      const x = i % grid.width;
      const y = Math.floor(i / grid.width);
      ctx.fillStyle = `rgba(${Math.round(60 + 195 * t)}, ${Math.round(40 + 30 * t)}, 24, ${0.15 + 0.6 * t})`;
      ctx.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
    }
  }

  private drawHomes(grid: Grid, homes: number[]): void {
    const { ctx } = this;
    const { cell, offsetX, offsetY } = this.view;
    ctx.strokeStyle = PALETTE.hivis;
    ctx.lineWidth = Math.max(1, cell * 0.12);
    for (const id of homes) {
      const x = id % grid.width;
      const y = Math.floor(id / grid.width);
      const px = offsetX + x * cell;
      const py = offsetY + y * cell;
      const inset = cell * 0.22;
      ctx.strokeRect(px + inset, py + inset, cell - inset * 2, cell - inset * 2);
    }
  }

  private drawRobots(grid: Grid, cells: Int32Array, states: Uint8Array | null): void {
    const { ctx } = this;
    const { cell, offsetX, offsetY } = this.view;
    const r = cell * 0.34;
    for (let i = 0; i < cells.length; i++) {
      const id = cells[i];
      if (id < 0) continue;
      const x = id % grid.width;
      const y = Math.floor(id / grid.width);
      const cx = offsetX + x * cell + cell / 2;
      const cy = offsetY + y * cell + cell / 2;

      const code = states ? states[i] : 2;
      const laden = code === 4 || code === 5;
      const resting = code === 0 || code === 1 || code === 7;

      // outlined so a resting robot stays legible against concrete and heat wash
      ctx.fillStyle = resting ? '#575f5a' : PALETTE.hivis;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      if (cell >= 6) {
        ctx.strokeStyle = PALETTE.shell;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - r + 0.5, cy - r + 0.5, r * 2 - 1, r * 2 - 1);
      }

      if (laden && cell >= 8) {
        ctx.fillStyle = PALETTE.shell;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, r * 0.38), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
