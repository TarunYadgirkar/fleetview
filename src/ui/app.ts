import { cellAt, createGrid, isPassable, setCellInPlace } from '../core/grid';
import {
  type Layout,
  deserializeLayout,
  serializeLayout,
} from '../core/layout';
import type { Cell, CellType } from '../core/types';
import { PRESETS } from '../presets';
import { computeRoi } from '../sim/roi';
import type { ThroughputCurve } from '../sim/scan';
import { defaultSimConfig, type FleetSpec, type SimConfig } from '../sim/types';
import type { RunPayload, WorkerRequest, WorkerResponse } from '../worker/protocol';
import { drawCurve } from './charts';
import { $, formatMoney, num, setText } from './dom';
import { PALETTE, Renderer } from './renderer';

const TOOLS: { id: CellType | 'robot'; label: string; color: string }[] = [
  { id: 'empty', label: 'Floor / erase', color: PALETTE.concrete },
  { id: 'wall', label: 'Wall', color: PALETTE.wall },
  { id: 'rack', label: 'Rack', color: PALETTE.steel },
  { id: 'pick', label: 'Pick station', color: PALETTE.paint },
  { id: 'deposit', label: 'Deposit lane', color: PALETTE.lane },
  { id: 'charge', label: 'Charge dock', color: PALETTE.charge },
  { id: 'robot', label: 'Robot home', color: PALETTE.hivis },
];

const SPEEDS = [1, 2, 4, 8, 16];
const FRAMES_PER_SECOND = 30;

export class App {
  private layout: Layout = PRESETS[0].build();
  private backdrop: HTMLImageElement | null = null;
  private backdropOpacity = 0.5;
  private showHeatmap = false;
  private tool: CellType | 'robot' = 'wall';
  private run: RunPayload | null = null;
  private curve: ThroughputCurve | null = null;
  private frame = 0;
  private playing = false;
  private speed = 4;
  private hoverCell = -1;
  private painting = false;
  private requestId = 0;
  private lastFrameTime = 0;

  private readonly renderer: Renderer;
  private readonly worker: Worker;
  private readonly canvas: HTMLCanvasElement;

  constructor() {
    this.canvas = $<HTMLCanvasElement>('floor');
    this.renderer = new Renderer(this.canvas);
    this.worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onWorkerMessage(e.data);

    this.buildTools();
    this.buildSpeeds();
    this.buildPresetOptions();
    this.buildRuleTicks();
    this.bindCanvas();
    this.bindControls();

    window.addEventListener('resize', () => this.redraw());
    this.syncFloorInputs();
    this.updateRoi();
    this.redraw();
    requestAnimationFrame((t) => this.tickPlayback(t));
  }

  /* ---------- chrome construction ---------- */

  private buildTools(): void {
    const host = $('tool-list');
    for (const tool of TOOLS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn tool';
      btn.setAttribute('role', 'radio');
      btn.dataset.tool = tool.id;
      btn.innerHTML = `<span class="tool__chip" style="background:${tool.color}"></span><span>${tool.label}</span>`;
      btn.addEventListener('click', () => {
        this.tool = tool.id;
        this.syncToolButtons();
      });
      host.appendChild(btn);
    }
    this.syncToolButtons();
  }

  private syncToolButtons(): void {
    for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
      const active = btn.dataset.tool === this.tool;
      btn.setAttribute('aria-pressed', String(active));
      btn.setAttribute('aria-checked', String(active));
    }
  }

  private buildSpeeds(): void {
    const host = $('speeds');
    for (const speed of SPEEDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = `${speed}x`;
      btn.dataset.speed = String(speed);
      btn.addEventListener('click', () => {
        this.speed = speed;
        this.syncSpeedButtons();
      });
      host.appendChild(btn);
    }
    this.syncSpeedButtons();
  }

  private syncSpeedButtons(): void {
    for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.speed) === this.speed));
    }
  }

  private buildPresetOptions(): void {
    const select = $<HTMLSelectElement>('preset');
    PRESETS.forEach((preset, i) => {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = preset.name;
      option.title = preset.description;
      select.appendChild(option);
    });
    select.addEventListener('change', () => {
      const preset = PRESETS[Number(select.value)];
      if (!preset) return;
      this.layout = preset.build();
      this.invalidateRun();
      this.syncFloorInputs();
      this.redraw();
    });
  }

  private buildRuleTicks(): void {
    const host = $('rule-ticks');
    host.innerHTML = '';
    for (let i = 0; i <= 40; i++) {
      const tick = document.createElement('span');
      tick.className = i % 5 === 0 ? 'rule__tick rule__tick--major' : 'rule__tick';
      host.appendChild(tick);
    }
  }

  /* ---------- editing ---------- */

  private bindCanvas(): void {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.painting = true;
      this.paintAt(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      const cell = this.cellFromEvent(e);
      this.hoverCell = cell ? cell.y * this.layout.grid.width + cell.x : -1;
      setText('hud-cell', cell ? `x ${cell.x}  y ${cell.y}` : '—');
      if (this.painting) this.paintAt(e);
      else this.redraw();
    });
    const stop = () => {
      this.painting = false;
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', () => {
      this.hoverCell = -1;
      setText('hud-cell', '—');
      this.redraw();
    });
  }

  private cellFromEvent(e: PointerEvent): Cell | null {
    const rect = this.canvas.getBoundingClientRect();
    return this.renderer.screenToCell(this.layout.grid, e.clientX - rect.left, e.clientY - rect.top);
  }

  private paintAt(e: PointerEvent): void {
    const cell = this.cellFromEvent(e);
    if (!cell) return;
    const { grid } = this.layout;
    const id = cell.y * grid.width + cell.x;

    if (this.tool === 'robot') {
      const existing = this.layout.robots.findIndex((r) => r.y * grid.width + r.x === id);
      if (existing >= 0) this.layout.robots.splice(existing, 1);
      else if (isPassable(grid, cell.x, cell.y)) this.layout.robots.push({ x: cell.x, y: cell.y });
    } else {
      if (cellAt(grid, cell.x, cell.y) === this.tool) return;
      setCellInPlace(grid, cell.x, cell.y, this.tool);
      if (!isPassable(grid, cell.x, cell.y)) {
        this.layout.robots = this.layout.robots.filter((r) => r.y * grid.width + r.x !== id);
      }
    }
    this.invalidateRun();
    this.redraw();
  }

  /* ---------- controls ---------- */

  private bindControls(): void {
    $('resize').addEventListener('click', () => this.resizeFloor());
    $('clear').addEventListener('click', () => {
      this.layout.grid = createGrid(this.layout.grid.width, this.layout.grid.height, 'empty');
      this.layout.robots = [];
      this.invalidateRun();
      this.redraw();
    });

    $('show-heat').addEventListener('change', (e) => {
      this.showHeatmap = (e.target as HTMLInputElement).checked;
      this.redraw();
    });

    const backdrop = $<HTMLInputElement>('backdrop');
    backdrop.addEventListener('input', () => {
      this.backdropOpacity = Number(backdrop.value);
      setText('backdrop-out', backdrop.value);
      this.redraw();
    });
    $('backdrop-clear').addEventListener('click', () => {
      this.backdrop = null;
      this.redraw();
    });

    $('import-json').addEventListener('click', () => $<HTMLInputElement>('file-json').click());
    $('import-png').addEventListener('click', () => $<HTMLInputElement>('file-png').click());
    $('export-json').addEventListener('click', () => this.exportJson());
    $<HTMLInputElement>('file-json').addEventListener('change', (e) => this.importJson(e));
    $<HTMLInputElement>('file-png').addEventListener('change', (e) => this.importPng(e));

    $('run').addEventListener('click', () => this.startRun());
    $('sweep').addEventListener('click', () => this.startSweep());

    $('play').addEventListener('click', () => {
      this.playing = !this.playing;
      setText('play', this.playing ? 'Pause' : 'Play');
    });

    const scrub = $<HTMLInputElement>('scrub');
    scrub.addEventListener('input', () => {
      this.frame = Number(scrub.value);
      this.playing = false;
      setText('play', 'Play');
      this.redraw();
    });

    for (const id of ['r-hw', 'r-ops', 'r-labor', 'r-workers', 'r-years', 'f-count']) {
      $(id).addEventListener('input', () => this.updateRoi());
    }
  }

  private resizeFloor(): void {
    const width = Math.max(4, Math.min(200, Math.round(num('grid-w'))));
    const height = Math.max(4, Math.min(200, Math.round(num('grid-h'))));
    const next = createGrid(width, height, 'empty');
    const old = this.layout.grid;
    for (let y = 0; y < Math.min(height, old.height); y++) {
      for (let x = 0; x < Math.min(width, old.width); x++) {
        setCellInPlace(next, x, y, cellAt(old, x, y));
      }
    }
    this.layout.grid = next;
    this.layout.robots = this.layout.robots.filter((r) => r.x < width && r.y < height);
    this.invalidateRun();
    this.redraw();
  }

  private syncFloorInputs(): void {
    $<HTMLInputElement>('grid-w').value = String(this.layout.grid.width);
    $<HTMLInputElement>('grid-h').value = String(this.layout.grid.height);
  }

  /* ---------- files ---------- */

  private exportJson(): void {
    const json = JSON.stringify(serializeLayout(this.layout), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.layout.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private async importJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = deserializeLayout(JSON.parse(await file.text()));
      this.layout = parsed;
      this.invalidateRun();
      this.syncFloorInputs();
      this.redraw();
      this.status(`Loaded ${parsed.name}`);
    } catch (error) {
      this.status(error instanceof Error ? error.message : 'Could not read that file');
    } finally {
      input.value = '';
    }
  }

  private importPng(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      this.backdrop = img;
      this.redraw();
      this.status('Backdrop loaded — trace the walls and racks over it');
    };
    img.onerror = () => this.status('That image could not be loaded');
    img.src = url;
    input.value = '';
  }

  /* ---------- simulation ---------- */

  private readFleet(): FleetSpec {
    return {
      count: Math.max(0, Math.round(num('f-count'))),
      ticksPerMove: Math.max(1, Math.round(num('f-move'))),
      turnCost: Math.max(0, Math.round(num('f-turn'))),
      payload: Math.max(1, Math.round(num('f-payload'))),
      batteryCapacity: Math.max(10, Math.round(num('f-battery'))),
      chargeRate: Math.max(1, Math.round(num('f-charge'))),
      chargeThreshold: Math.min(0.9, Math.max(0, num('f-thresh'))),
    };
  }

  private readConfig(): SimConfig {
    const base = defaultSimConfig(Math.max(1, Math.round(num('c-seed'))));
    return {
      ...base,
      maxTicks: Math.max(10, Math.round(num('c-ticks'))),
      orderRate: Math.max(0.001, num('c-rate')),
      orderMode: $<HTMLSelectElement>('c-mode').value === 'fixed' ? 'fixed' : 'poisson',
      orderCount: Math.max(0, Math.round(num('c-count'))),
      tickSeconds: Math.max(0.1, num('c-secs')),
    };
  }

  /** top the placed homes up to the requested fleet size using free floor */
  private layoutForRun(count: number): Layout {
    const grid = this.layout.grid;
    const robots = this.layout.robots.slice();
    const taken = new Set(robots.map((r) => r.y * grid.width + r.x));
    for (let y = grid.height - 1; y >= 0 && robots.length < count; y--) {
      for (let x = 0; x < grid.width && robots.length < count; x++) {
        const id = y * grid.width + x;
        if (taken.has(id)) continue;
        if (grid.cells[id] !== 0) continue;
        taken.add(id);
        robots.push({ x, y });
      }
    }
    return { ...this.layout, robots: robots.slice(0, Math.max(count, 0)) };
  }

  private startRun(): void {
    const fleet = this.readFleet();
    const config = this.readConfig();
    const layout = this.layoutForRun(fleet.count);
    if (layout.robots.length < fleet.count) {
      this.status(`Only ${layout.robots.length} free cells for ${fleet.count} robots`);
    }
    this.requestId++;
    this.setRunning(true);
    this.status('Simulating…');
    const request: WorkerRequest = {
      type: 'run',
      id: this.requestId,
      layout: serializeLayout(layout),
      fleet,
      config,
    };
    this.worker.postMessage(request);
  }

  private startSweep(): void {
    const sizes = $<HTMLInputElement>('sweep-sizes')
      .value.split(',')
      .map((s) => Math.round(Number(s.trim())))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (sizes.length === 0) {
      setText('sweep-note', 'Enter fleet sizes such as 2, 4, 8, 16');
      return;
    }
    const fleet = this.readFleet();
    const layout = this.layoutForRun(Math.max(...sizes));
    this.requestId++;
    this.setRunning(true);
    setText('sweep-note', 'Sweeping…');
    const request: WorkerRequest = {
      type: 'scan',
      id: this.requestId,
      layout: serializeLayout(layout),
      fleet,
      config: this.readConfig(),
      sizes,
    };
    this.worker.postMessage(request);
  }

  private onWorkerMessage(msg: WorkerResponse): void {
    if (msg.id !== this.requestId) return;
    if (msg.type === 'progress') {
      this.status(`Simulating… tick ${msg.tick} / ${msg.total}`);
      return;
    }
    this.setRunning(false);
    if (msg.type === 'error') {
      this.status(msg.message);
      return;
    }
    if (msg.type === 'scan:done') {
      this.curve = msg.curve;
      drawCurve($<HTMLCanvasElement>('curve'), this.curve);
      setText('sweep-note', `Saturates at ${msg.curve.saturationFleetSize} robots`);
      return;
    }

    this.run = msg;
    this.frame = 0;
    const frames = msg.robotCount > 0 ? msg.cells.length / msg.robotCount : 0;
    const scrub = $<HTMLInputElement>('scrub');
    scrub.max = String(Math.max(0, frames - 1));
    scrub.value = '0';
    scrub.disabled = frames <= 1;
    $<HTMLButtonElement>('play').disabled = frames <= 1;
    this.showMetrics();
    this.status(`Done — ${msg.ticks} ticks simulated`);
    this.updateRoi();
    this.redraw();
  }

  private showMetrics(): void {
    const m = this.run?.metrics;
    if (!m) return;
    setText('m-oph', m.ordersPerHour.toFixed(1));
    setText('m-util', `${(m.utilization * 100).toFixed(0)}%`);
    setText('m-lat', `${m.latencyMean.toFixed(0)}t`);
    setText('m-p95', `${m.latencyP95.toFixed(0)}t`);
    setText('m-done', String(m.ordersCompleted));
    setText('m-acc', String(m.ordersAccepted));
  }

  private updateRoi(): void {
    const roi = computeRoi({
      robots: Math.max(0, Math.round(num('f-count'))),
      hardwareCostPerRobot: num('r-hw'),
      annualLaborCostPerWorker: num('r-labor'),
      workersDisplaced: num('r-workers'),
      annualOpsCostPerRobot: num('r-ops'),
      horizonYears: Math.max(1, Math.round(num('r-years'))),
    });
    setText('r-capex', formatMoney(roi.capex));
    setText('r-net', formatMoney(roi.annualNetSaving));
    setText(
      'r-payback',
      Number.isFinite(roi.paybackMonths) ? `${roi.paybackMonths.toFixed(1)} mo` : 'never',
    );
    setText('r-roi', Number.isFinite(roi.roiPct) ? `${roi.roiPct.toFixed(0)}%` : '—');
  }

  /* ---------- playback + paint ---------- */

  private tickPlayback(time: number): void {
    const elapsed = time - this.lastFrameTime;
    const interval = 1000 / (FRAMES_PER_SECOND * this.speed);
    if (this.playing && this.run && elapsed >= interval) {
      this.lastFrameTime = time;
      const frames = this.run.robotCount > 0 ? this.run.cells.length / this.run.robotCount : 0;
      this.frame++;
      if (this.frame >= frames) {
        this.frame = Math.max(0, frames - 1);
        this.playing = false;
        setText('play', 'Play');
      }
      $<HTMLInputElement>('scrub').value = String(this.frame);
      this.redraw();
    }
    requestAnimationFrame((t) => this.tickPlayback(t));
  }

  private invalidateRun(): void {
    this.run = null;
    this.frame = 0;
    this.playing = false;
    setText('play', 'Play');
    $<HTMLButtonElement>('play').disabled = true;
    $<HTMLInputElement>('scrub').disabled = true;
  }

  private setRunning(running: boolean): void {
    document.querySelector('.app')?.setAttribute('data-running', String(running));
    $<HTMLButtonElement>('run').disabled = running;
    $<HTMLButtonElement>('sweep').disabled = running;
  }

  private status(message: string): void {
    setText('run-status', message);
  }

  private redraw(): void {
    const { grid } = this.layout;
    this.renderer.resize(grid);

    let robotCells: Int32Array | null = null;
    let robotStates: Uint8Array | null = null;
    if (this.run && this.run.robotCount > 0) {
      const n = this.run.robotCount;
      const offset = this.frame * n;
      if (offset + n <= this.run.cells.length) {
        robotCells = this.run.cells.subarray(offset, offset + n);
        robotStates = this.run.states.subarray(offset, offset + n);
      }
    }

    this.renderer.draw({
      grid,
      homes: this.layout.robots.map((r) => r.y * grid.width + r.x),
      robotCells,
      robotStates,
      heatmap: this.run?.metrics.heatmap ?? null,
      showHeatmap: this.showHeatmap,
      backdrop: this.backdrop,
      backdropOpacity: this.backdropOpacity,
      hoverCell: this.hoverCell,
    });

    const tick = this.run ? this.frame * this.run.stride : 0;
    setText('tick-read', String(tick).padStart(4, '0'));
    setText(
      'hud-robots',
      this.run
        ? `${this.run.robotCount} robots`
        : `${this.layout.robots.length} homes placed`,
    );
  }
}
