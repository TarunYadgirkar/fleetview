import { CODE_CELL, type Grid } from '../core/grid';
import type { CellType } from '../core/types';
import { type Palette, palette, withAlpha } from './theme';

const CELL_TOKEN: Record<CellType, keyof Palette | null> = {
  empty: null,
  wall: 'wall',
  rack: 'rack',
  pick: 'pick',
  charge: 'charge',
  deposit: 'deposit',
};

/** Room around the floor for the dimension lines that label its size. */
const MARGIN = { top: 30, right: 12, bottom: 12, left: 32 };
const DIM_OFFSET = 15;

export const LEGEND: { type: CellType; label: string }[] = [
  { type: 'rack', label: 'Rack' },
  { type: 'wall', label: 'Wall' },
  { type: 'pick', label: 'Pick' },
  { type: 'deposit', label: 'Deposit' },
  { type: 'charge', label: 'Charge' },
];

function cellFill(type: CellType): string | null {
  const token = CELL_TOKEN[type];
  return token ? palette()[token] : null;
}

export function cellColor(type: CellType): string {
  return cellFill(type) ?? palette().floor;
}

export interface RobotFrame {
  cells: Int32Array;
  states: Uint8Array;
  /** previous recorded frame, used to interpolate motion between ticks */
  prev: Int32Array | null;
  /** 0..1 progress from prev to cells */
  alpha: number;
  /** older frames, newest first, drawn as a fading trail */
  trail: Int32Array[];
}

export interface RenderState {
  grid: Grid;
  homes: number[];
  robots: RobotFrame | null;
  heatmap: number[] | null;
  showHeatmap: boolean;
  showTrails: boolean;
  backdrop: HTMLImageElement | null;
  backdropOpacity: number;
  hoverCell: number;
  selectedRobot: number;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private baseCell = 16;
  private baseX = 0;
  private baseY = 0;
  private zoom = 1;
  private panX = 0;
  private panY = 0;

  /** `paper` is the token behind the floor, so dimension labels knock out to the right color. */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly paper: 'sheet' | 'raised' = 'sheet',
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
  }

  get cellSize(): number {
    return this.baseCell * this.zoom;
  }

  private get originX(): number {
    return this.baseX + this.panX;
  }

  private get originY(): number {
    return this.baseY + this.panY;
  }

  setZoom(next: number, focusX: number, focusY: number): void {
    const clamped = Math.min(6, Math.max(0.4, next));
    if (clamped === this.zoom) return;
    // keep the cell under the cursor pinned while zooming
    const beforeX = (focusX - this.originX) / this.cellSize;
    const beforeY = (focusY - this.originY) / this.cellSize;
    this.zoom = clamped;
    this.panX = focusX - beforeX * this.cellSize - this.baseX;
    this.panY = focusY - beforeY * this.cellSize - this.baseY;
  }

  get zoomLevel(): number {
    return this.zoom;
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
  }

  resetView(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  screenToCell(grid: Grid, px: number, py: number): { x: number; y: number } | null {
    const cell = this.cellSize;
    const x = Math.floor((px - this.originX) / cell);
    const y = Math.floor((py - this.originY) / cell);
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
    return { x, y };
  }

  resize(grid: Grid): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const availW = rect.width - MARGIN.left - MARGIN.right;
    const availH = rect.height - MARGIN.top - MARGIN.bottom;
    this.baseCell = Math.max(3, Math.min(availW / grid.width, availH / grid.height));
    this.baseX = MARGIN.left + (availW - this.baseCell * this.zoom * grid.width) / 2;
    this.baseY = MARGIN.top + (availH - this.baseCell * this.zoom * grid.height) / 2;
  }

  draw(state: RenderState): void {
    const { ctx } = this;
    const { grid } = state;
    const cell = this.cellSize;
    const ox = this.originX;
    const oy = this.originY;
    const rect = this.canvas.getBoundingClientRect();

    const c = palette();

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = c[this.paper];
    ctx.fillRect(0, 0, rect.width, rect.height);

    const floorW = cell * grid.width;
    const floorH = cell * grid.height;

    ctx.fillStyle = c.floor;
    ctx.fillRect(ox, oy, floorW, floorH);

    if (state.backdrop && state.backdropOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = state.backdropOpacity;
      ctx.drawImage(state.backdrop, ox, oy, floorW, floorH);
      ctx.restore();
    }

    this.drawSlabJoints(grid, floorW, floorH);
    this.drawCells(grid);
    if (state.showHeatmap && state.heatmap) this.drawHeat(grid, state.heatmap);

    if (state.robots) {
      if (state.showTrails) this.drawTrails(grid, state.robots);
      this.drawRobots(grid, state.robots, state.selectedRobot);
    } else {
      this.drawHomes(grid, state.homes);
    }

    if (state.hoverCell >= 0) {
      const hx = state.hoverCell % grid.width;
      const hy = Math.floor(state.hoverCell / grid.width);
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + hx * cell + 1, oy + hy * cell + 1, cell - 2, cell - 2);
    }

    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox - 0.75, oy - 0.75, floorW + 1.5, floorH + 1.5);
    this.drawDimensions(grid, floorW, floorH);
  }

  /**
   * Size callouts drawn the way a building plan does it: extension lines off the floor edge,
   * a dimension line with slash ticks, and the measurement knocked out of the line.
   */
  private drawDimensions(grid: Grid, floorW: number, floorH: number): void {
    const { ctx } = this;
    const c = palette();
    const ox = this.originX;
    const oy = this.originY;
    const dimY = Math.round(oy - DIM_OFFSET) + 0.5;
    const dimX = Math.round(ox - DIM_OFFSET) + 0.5;

    ctx.save();
    ctx.strokeStyle = c.ruleStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const x of [ox, ox + floorW]) {
      const px = Math.round(x) + 0.5;
      ctx.moveTo(px, oy - 4);
      ctx.lineTo(px, dimY - 5);
    }
    for (const y of [oy, oy + floorH]) {
      const py = Math.round(y) + 0.5;
      ctx.moveTo(ox - 4, py);
      ctx.lineTo(dimX - 5, py);
    }
    ctx.moveTo(ox, dimY);
    ctx.lineTo(ox + floorW, dimY);
    ctx.moveTo(dimX, oy);
    ctx.lineTo(dimX, oy + floorH);
    ctx.stroke();

    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [x, y] of [
      [ox, dimY],
      [ox + floorW, dimY],
      [dimX, oy],
      [dimX, oy + floorH],
    ]) {
      ctx.moveTo(x - 3.5, y + 3.5);
      ctx.lineTo(x + 3.5, y - 3.5);
    }
    ctx.stroke();

    ctx.font = `500 11px ${c.dataFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.dimLabel(`${grid.width} cells`, ox + floorW / 2, dimY, 0);
    this.dimLabel(`${grid.height} cells`, dimX, oy + floorH / 2, -Math.PI / 2);
    ctx.restore();
  }

  private dimLabel(text: string, x: number, y: number, angle: number): void {
    const { ctx } = this;
    const c = palette();
    const width = ctx.measureText(text).width + 10;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = c[this.paper];
    ctx.fillRect(-width / 2, -7, width, 14);
    ctx.fillStyle = c.inkMuted;
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  private drawSlabJoints(grid: Grid, floorW: number, floorH: number): void {
    const { ctx } = this;
    const cell = this.cellSize;
    if (cell < 7) return;
    const ox = this.originX;
    const oy = this.originY;
    ctx.strokeStyle = palette().floorJoint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= grid.width; x++) {
      const px = Math.round(ox + x * cell) + 0.5;
      ctx.moveTo(px, oy);
      ctx.lineTo(px, oy + floorH);
    }
    for (let y = 0; y <= grid.height; y++) {
      const py = Math.round(oy + y * cell) + 0.5;
      ctx.moveTo(ox, py);
      ctx.lineTo(ox + floorW, py);
    }
    ctx.stroke();
  }

  private drawCells(grid: Grid): void {
    const { ctx } = this;
    const cell = this.cellSize;
    const ox = this.originX;
    const oy = this.originY;
    const solid = cell >= 5;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const type = CODE_CELL[grid.cells[y * grid.width + x]];
        const fill = cellFill(type);
        if (fill === null) continue;
        const px = ox + x * cell;
        const py = oy + y * cell;

        if (type === 'wall') {
          ctx.fillStyle = fill;
          ctx.fillRect(px, py, cell, cell);
        } else if (type === 'rack') {
          ctx.fillStyle = fill;
          ctx.fillRect(px, py, cell, cell);
          if (solid) {
            // top highlight / bottom shade reads as physical height
            ctx.fillStyle = 'rgba(255,255,255,0.14)';
            ctx.fillRect(px, py, cell, Math.max(1, cell * 0.12));
            ctx.fillStyle = 'rgba(0,0,0,0.22)';
            ctx.fillRect(px, py + cell - Math.max(1, cell * 0.12), cell, Math.max(1, cell * 0.12));
          }
        } else {
          ctx.fillStyle = fill;
          ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
          if (solid) {
            ctx.strokeStyle = withAlpha(palette().ink, 0.35);
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 1.5, py + 1.5, cell - 3, cell - 3);
          }
        }
      }
    }
  }

  /** congestion drawn as a red wash: the more robots crossed a cell, the redder it gets */
  private drawHeat(grid: Grid, heat: number[]): void {
    const { ctx } = this;
    const cell = this.cellSize;
    const ox = this.originX;
    const oy = this.originY;
    let peak = 0;
    for (const v of heat) if (v > peak) peak = v;
    if (peak <= 0) return;
    const color = palette().heat;

    for (let i = 0; i < heat.length; i++) {
      const v = heat[i];
      if (v <= 0) continue;
      const t = Math.min(1, Math.sqrt(v / peak));
      if (t < 0.04) continue;
      const x = i % grid.width;
      const y = Math.floor(i / grid.width);
      ctx.fillStyle = withAlpha(color, 0.7 * t);
      ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }
  }

  private drawHomes(grid: Grid, homes: number[]): void {
    const { ctx } = this;
    const cell = this.cellSize;
    const ox = this.originX;
    const oy = this.originY;
    ctx.strokeStyle = palette().robot;
    ctx.lineWidth = Math.max(1, cell * 0.1);
    for (const id of homes) {
      const x = id % grid.width;
      const y = Math.floor(id / grid.width);
      const inset = cell * 0.24;
      ctx.strokeRect(ox + x * cell + inset, oy + y * cell + inset, cell - inset * 2, cell - inset * 2);
    }
  }

  private drawTrails(grid: Grid, frame: RobotFrame): void {
    const { ctx } = this;
    const cell = this.cellSize;
    if (cell < 6) return;
    const ox = this.originX;
    const oy = this.originY;
    const r = Math.max(1, cell * 0.11);
    const color = palette().robot;

    frame.trail.forEach((past, depth) => {
      const fade = 0.4 * (1 - depth / (frame.trail.length + 1));
      if (fade <= 0.02) return;
      ctx.fillStyle = withAlpha(color, fade);
      for (let i = 0; i < past.length; i++) {
        const id = past[i];
        if (id < 0) continue;
        const cx = ox + (id % grid.width) * cell + cell / 2;
        const cy = oy + Math.floor(id / grid.width) * cell + cell / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  private drawRobots(grid: Grid, frame: RobotFrame, selected: number): void {
    const { ctx } = this;
    const cell = this.cellSize;
    const ox = this.originX;
    const oy = this.originY;
    const size = cell * 0.68;
    const radius = Math.min(3, cell * 0.16);
    const detail = cell >= 9;
    const c = palette();

    for (let i = 0; i < frame.cells.length; i++) {
      const id = frame.cells[i];
      if (id < 0) continue;

      let gx = id % grid.width;
      let gy = Math.floor(id / grid.width);
      if (frame.prev && frame.alpha < 1) {
        const pid = frame.prev[i];
        if (pid >= 0 && pid !== id) {
          const px = pid % grid.width;
          const py = Math.floor(pid / grid.width);
          gx = px + (gx - px) * frame.alpha;
          gy = py + (gy - py) * frame.alpha;
        }
      }

      const cx = ox + gx * cell + cell / 2;
      const cy = oy + gy * cell + cell / 2;

      const code = frame.states[i];
      const laden = code === 4 || code === 5;
      const resting = code === 0 || code === 1 || code === 7;
      const charging = code === 7;

      ctx.fillStyle = charging ? c.charge : resting ? c.robotIdle : c.robot;
      roundRect(ctx, cx - size / 2, cy - size / 2, size, size, radius);
      ctx.fill();

      if (detail) {
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = 1.25;
        roundRect(ctx, cx - size / 2, cy - size / 2, size, size, radius);
        ctx.stroke();
      }

      if (laden && detail) {
        ctx.fillStyle = c.ink;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1.2, size * 0.19), 0, Math.PI * 2);
        ctx.fill();
      }

      if (i === selected) {
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(cx - cell / 2 + 1, cy - cell / 2 + 1, cell - 2, cell - 2);
        ctx.setLineDash([]);
      }
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  if (r <= 0.5) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
