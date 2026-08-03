import { cellAt, createGrid, isPassable, setCellInPlace } from '../core/grid';
import { type Layout, deserializeLayout, serializeLayout } from '../core/layout';
import type { Cell, CellType } from '../core/types';
import { PRESETS } from '../presets';
import { computeRoi } from '../sim/roi';
import type { ThroughputCurve } from '../sim/scan';
import { STATE_CODES } from '../sim/simulation';
import { defaultSimConfig, type FleetSpec, type SimConfig } from '../sim/types';
import type { RunPayload, WorkerRequest, WorkerResponse } from '../worker/protocol';
import { drawCurve, drawTimeline } from './charts';
import { $, formatMoney, num, setText } from './dom';
import { type IconName, icon } from './icons';
import { Intro } from './intro';
import { countTo, pop, prefersReducedMotion, revealGroup } from './motion';
import { LEGEND, Renderer, type RobotFrame, cellColor } from './renderer';
import { SCENARIOS, type Scenario } from './scenarios';
import { toast } from './toast';

const TOOLS: { id: CellType | 'robot'; label: string; key: string; iconName: IconName }[] = [
  { id: 'empty', label: 'Floor / erase', key: '1', iconName: 'eraser' },
  { id: 'wall', label: 'Wall', key: '2', iconName: 'wall' },
  { id: 'rack', label: 'Rack', key: '3', iconName: 'stack' },
  { id: 'pick', label: 'Pick station', key: '4', iconName: 'boxes' },
  { id: 'deposit', label: 'Deposit lane', key: '5', iconName: 'route' },
  { id: 'charge', label: 'Charge dock', key: '6', iconName: 'plug' },
  { id: 'robot', label: 'Robot home', key: '7', iconName: 'truck' },
];

const SPEEDS = [1, 2, 4, 8, 16];
const BASE_FPS = 30;
const TRAIL_LENGTH = 5;

const WORKER_FAILURE =
  'Simulation worker stopped unexpectedly. Reload the page; if it repeats, lower Max ticks or fleet size.';

const STATE_LABEL: Record<string, string> = {
  idle: 'Idle',
  parking: 'Returning',
  toPick: 'To pick',
  picking: 'Picking',
  toDeposit: 'To deposit',
  depositing: 'Depositing',
  toCharge: 'To charger',
  charging: 'Charging',
};

export class App {
  private layout: Layout = PRESETS[0].build();
  private backdrop: HTMLImageElement | null = null;
  private backdropOpacity = 0.5;
  private showHeatmap = false;
  private showTrails = true;
  private tool: CellType | 'robot' = 'wall';
  private run: RunPayload | null = null;
  private curve: ThroughputCurve | null = null;
  private frame = 0;
  private frameProgress = 0;
  private playing = false;
  private speed = 4;
  private hoverCell = -1;
  private painting = false;
  private panning = false;
  private lastPointer = { x: 0, y: 0 };
  private selectedRobot = -1;
  private requestId = 0;
  private lastTime = 0;
  private sweeping = false;
  /** set by a demo click, consumed when that run's metrics land */
  private revealResults = false;

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
    // without these the UI wedges on "Simulating…" forever: setRunning(false) is only ever
    // reached from onmessage, so a worker that dies never re-enables Run or Sweep.
    this.worker.onerror = () => this.abortRun(WORKER_FAILURE);
    this.worker.onmessageerror = () => this.abortRun(WORKER_FAILURE);

    this.buildTools();
    this.buildSpeeds();
    this.buildPresetOptions();
    this.buildDemoButtons();
    this.buildRuleTicks();
    this.buildLegend();
    this.buildPanelIcons();
    this.bindCanvas();
    this.bindControls();
    this.bindKeyboard();

    new Intro(document.querySelector<HTMLElement>('.app')!, {
      onEnter: () => this.onEnterPlanner(),
      onRunDemo: () => this.runDemo(0),
    });

    window.addEventListener('resize', () => this.redraw());
    this.syncFloorInputs();
    this.updateRoi();
    this.redraw();
    requestAnimationFrame((t) => this.tickPlayback(t));
  }

  private onEnterPlanner(): void {
    this.redraw();
    revealGroup(document.querySelectorAll('.panels .panel'), 0.02);
  }

  /* ---------- chrome ---------- */

  private buildTools(): void {
    const host = $('tool-list');
    host.innerHTML = '';
    for (const tool of TOOLS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn tool';
      btn.setAttribute('role', 'radio');
      btn.dataset.tool = tool.id;
      const swatch =
        tool.id === 'robot'
          ? '#ff6a1a'
          : cellColor(tool.id as CellType);
      btn.innerHTML =
        `<span class="tool__chip" style="background:${swatch}"></span>` +
        `<span>${tool.label}</span><kbd>${tool.key}</kbd>`;
      btn.addEventListener('click', () => this.selectTool(tool.id));
      host.appendChild(btn);
    }
    this.syncToolButtons();
  }

  private selectTool(tool: CellType | 'robot'): void {
    this.tool = tool;
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
    host.innerHTML = '';
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
    select.innerHTML = '';
    PRESETS.forEach((preset, i) => {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = preset.name;
      option.title = preset.description;
      select.appendChild(option);
    });
    select.addEventListener('change', () => this.loadPreset(Number(select.value)));
  }

  private loadPreset(index: number): void {
    const preset = PRESETS[index];
    if (!preset) return;
    this.layout = preset.build();
    this.renderer.resetView();
    this.invalidateRun();
    this.syncFloorInputs();
    this.redraw();
  }

  private buildDemoButtons(): void {
    const host = $('scenario-list');
    host.innerHTML = '';
    SCENARIOS.forEach((scenario, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = i === 0 ? 'btn btn--wide btn--primary scenario__btn' : 'btn btn--wide scenario__btn';
      btn.dataset.demo = String(i);
      btn.innerHTML = icon('play', 12);
      const label = document.createElement('span');
      label.textContent = scenario.label;
      btn.appendChild(label);
      btn.addEventListener('click', () => this.runDemo(i));
      host.appendChild(btn);

      const caption = document.createElement('p');
      caption.className = 'scenario__cap';
      caption.textContent = scenario.caption;
      host.appendChild(caption);
    });
  }

  /**
   * One click: load the floor, write every input the scenario depends on, run it. All thirteen
   * fields are written even when they match the defaults — a visitor who already fiddled with
   * Battery or Max ticks must still get the result the caption advertises.
   */
  private runDemo(index: number): void {
    const scenario = SCENARIOS[index];
    if (!scenario || $<HTMLButtonElement>('run').disabled) return;

    $<HTMLSelectElement>('preset').value = String(scenario.preset);
    this.loadPreset(scenario.preset);
    this.applyScenarioInputs(scenario);
    this.updateRoi();
    // set before the run so a synchronous postMessage failure clears it again via abortRun
    this.revealResults = true;
    this.startRun();
  }

  /**
   * The settings rail scrolls independently of the page, and Results sits below the fold on a
   * laptop. A one-click demo that leaves its own numbers off-screen is worse than no demo, so
   * bring them into view once they exist. Only for demo runs — a visitor who pressed Run himself
   * chose where he was looking.
   */
  private scrollResultsIntoView(): void {
    // a smooth scroll is driven by animation frames, which never arrive in a background tab —
    // jump instead, same reasoning as countTo
    const smooth = !prefersReducedMotion() && !document.hidden;
    $('results-panel').scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' });
  }

  private applyScenarioInputs(scenario: Scenario): void {
    const { fleet, config } = scenario;
    $<HTMLInputElement>('f-count').value = String(fleet.count);
    $<HTMLInputElement>('f-move').value = String(fleet.ticksPerMove);
    $<HTMLInputElement>('f-turn').value = String(fleet.turnCost);
    $<HTMLInputElement>('f-payload').value = String(fleet.payload);
    $<HTMLInputElement>('f-battery').value = String(fleet.batteryCapacity);
    $<HTMLInputElement>('f-charge').value = String(fleet.chargeRate);
    $<HTMLInputElement>('f-thresh').value = String(fleet.chargeThreshold);
    $<HTMLInputElement>('c-seed').value = String(config.seed);
    $<HTMLInputElement>('c-ticks').value = String(config.maxTicks);
    $<HTMLSelectElement>('c-mode').value = config.orderMode;
    $<HTMLInputElement>('c-rate').value = String(config.orderRate);
    $<HTMLInputElement>('c-count').value = String(config.orderCount);
    $<HTMLInputElement>('c-secs').value = String(config.tickSeconds);
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

  private buildLegend(): void {
    const host = $('legend');
    host.innerHTML = LEGEND.map(
      (entry) =>
        `<span class="legend__item"><span class="legend__swatch" style="background:${cellColor(
          entry.type,
        )}"></span>${entry.label}</span>`,
    ).join('');
  }

  private buildPanelIcons(): void {
    for (const title of document.querySelectorAll<HTMLElement>('.panel__title[data-icon]')) {
      title.insertAdjacentHTML('afterbegin', icon(title.dataset.icon as IconName, 14));
    }
    $('show-intro').innerHTML = icon('help', 15);
  }

  /* ---------- canvas interaction ---------- */

  private bindCanvas(): void {
    const canvas = this.canvas;

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.lastPointer = { x: e.clientX, y: e.clientY };
      // middle button, or space-less right drag, pans instead of painting
      if (e.button === 1 || e.button === 2) {
        this.panning = true;
        return;
      }
      if (this.run) {
        this.selectRobotAt(e);
        return;
      }
      this.painting = true;
      this.paintAt(e);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (this.panning) {
        this.renderer.panBy(e.clientX - this.lastPointer.x, e.clientY - this.lastPointer.y);
        this.lastPointer = { x: e.clientX, y: e.clientY };
        this.redraw();
        return;
      }
      const cell = this.cellFromEvent(e);
      this.hoverCell = cell ? cell.y * this.layout.grid.width + cell.x : -1;
      setText('hud-cell', cell ? `x ${cell.x}  y ${cell.y}` : '—');
      if (this.painting) this.paintAt(e);
      else this.redraw();
    });

    const stop = () => {
      this.painting = false;
      this.panning = false;
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerleave', () => {
      this.hoverCell = -1;
      setText('hud-cell', '—');
      this.redraw();
    });

    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  /**
   * Trackpads fire a stream of wheel events with wildly varying deltas, so a fixed zoom step
   * per event runs away instantly. Follow the convention every canvas tool uses: pinch (which
   * browsers deliver as ctrl+wheel) zooms, plain scroll pans, and the step scales with the
   * actual delta. When the floor already fits, plain scroll is left alone so the page can scroll.
   */
  private onWheel(e: WheelEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    // deltaMode: 0 = pixels, 1 = lines, 2 = pages
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
    const dx = e.deltaX * scale;
    const dy = e.deltaY * scale;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // clamp so one violent gesture cannot jump several zoom levels
      const step = Math.max(-40, Math.min(40, dy));
      this.renderer.setZoom(
        this.renderer.zoomLevel * Math.exp(-step * 0.01),
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
      this.redraw();
      return;
    }

    if (this.renderer.zoomLevel <= 1.001) return; // nothing to pan — let the page scroll
    e.preventDefault();
    this.renderer.panBy(-dx, -dy);
    this.redraw();
  }

  private zoomFromCentre(factor: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.setZoom(this.renderer.zoomLevel * factor, rect.width / 2, rect.height / 2);
    this.redraw();
  }

  private cellFromEvent(e: PointerEvent): Cell | null {
    const rect = this.canvas.getBoundingClientRect();
    return this.renderer.screenToCell(this.layout.grid, e.clientX - rect.left, e.clientY - rect.top);
  }

  private selectRobotAt(e: PointerEvent): void {
    const cell = this.cellFromEvent(e);
    if (!cell || !this.run) return;
    const id = cell.y * this.layout.grid.width + cell.x;
    const frame = this.currentFrameCells();
    if (!frame) return;
    const found = frame.indexOf(id);
    this.selectedRobot = found;
    this.updateInspector();
    this.redraw();
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
      toast('Floor cleared.', 'info');
    });

    $('show-heat').addEventListener('change', (e) => {
      this.showHeatmap = (e.target as HTMLInputElement).checked;
      if (this.showHeatmap && !this.run) toast('Run a simulation to collect congestion.', 'info');
      this.redraw();
    });
    $('show-trails').addEventListener('change', (e) => {
      this.showTrails = (e.target as HTMLInputElement).checked;
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
    $('play').addEventListener('click', () => this.togglePlay());
    $('zoom-in').addEventListener('click', () => this.zoomFromCentre(1.25));
    $('zoom-out').addEventListener('click', () => this.zoomFromCentre(1 / 1.25));
    $('zoom-reset').addEventListener('click', () => {
      this.renderer.resetView();
      this.redraw();
    });

    $('inspector-close').addEventListener('click', () => {
      this.selectedRobot = -1;
      $('inspector').hidden = true;
      this.redraw();
    });

    const scrub = $<HTMLInputElement>('scrub');
    scrub.addEventListener('input', () => {
      this.frame = Number(scrub.value);
      this.frameProgress = 0;
      this.playing = false;
      this.syncPlayLabel();
      this.redraw();
    });

    for (const id of ['r-hw', 'r-ops', 'r-labor', 'r-workers', 'r-years', 'f-count']) {
      $(id).addEventListener('input', () => this.updateRoi());
    }
  }

  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const tool = TOOLS.find((t) => t.key === e.key);
      if (tool) {
        this.selectTool(tool.id);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.key === 'r' || e.key === 'R') {
        this.startRun();
      } else if (e.key === 'h' || e.key === 'H') {
        const box = $<HTMLInputElement>('show-heat');
        box.checked = !box.checked;
        box.dispatchEvent(new Event('change'));
      } else if (e.key === '0') {
        this.renderer.resetView();
        this.redraw();
      }
    });
  }

  private togglePlay(): void {
    if ($<HTMLButtonElement>('play').disabled) return;
    this.playing = !this.playing;
    this.syncPlayLabel();
    pop($('play'));
  }

  private syncPlayLabel(): void {
    const btn = $('play');
    btn.innerHTML = `${icon(this.playing ? 'pause' : 'play', 14)}<span>${
      this.playing ? 'Pause' : 'Play'
    }</span>`;
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
    this.renderer.resetView();
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
    toast('Layout exported.', 'good');
  }

  private async importJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = deserializeLayout(JSON.parse(await file.text()));
      this.layout = parsed;
      this.renderer.resetView();
      this.invalidateRun();
      this.syncFloorInputs();
      this.redraw();
      toast(`Loaded ${parsed.name}.`, 'good');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not read that file', 'bad', 6000);
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
      toast('Backdrop loaded — trace the walls and racks over it.', 'good', 5000);
    };
    img.onerror = () => toast('That image could not be loaded.', 'bad');
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

  private layoutForRun(count: number): Layout {
    const grid = this.layout.grid;
    const robots = this.layout.robots.slice();
    const taken = new Set(robots.map((r) => r.y * grid.width + r.x));
    for (let y = grid.height - 1; y >= 0 && robots.length < count; y--) {
      for (let x = 0; x < grid.width && robots.length < count; x++) {
        const id = y * grid.width + x;
        if (taken.has(id) || grid.cells[id] !== 0) continue;
        taken.add(id);
        robots.push({ x, y });
      }
    }
    return { ...this.layout, robots: robots.slice(0, Math.max(count, 0)) };
  }

  private startRun(): void {
    if ($<HTMLButtonElement>('run').disabled) return;
    const fleet = this.readFleet();
    const config = this.readConfig();
    const layout = this.layoutForRun(fleet.count);
    if (layout.robots.length < fleet.count) {
      toast(`Only ${layout.robots.length} free cells — fleet trimmed to fit.`, 'bad', 5000);
    }
    this.requestId++;
    this.setRunning(true);
    this.status('Simulating…');
    $('progress').hidden = false;
    this.sweeping = false;
    this.postToWorker({
      type: 'run',
      id: this.requestId,
      layout: serializeLayout(layout),
      fleet,
      config,
    });
  }

  private startSweep(): void {
    const sizes = $<HTMLInputElement>('sweep-sizes')
      .value.split(',')
      .map((s) => Math.round(Number(s.trim())))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (sizes.length === 0) {
      setText('sweep-note', 'Enter fleet sizes such as 2, 4, 8, 16.');
      return;
    }
    this.requestId++;
    this.setRunning(true);
    setText('sweep-note', `Running ${sizes.length} simulations…`);
    this.sweeping = true;
    this.postToWorker({
      type: 'scan',
      id: this.requestId,
      layout: serializeLayout(this.layoutForRun(Math.max(...sizes))),
      fleet: this.readFleet(),
      config: this.readConfig(),
      sizes,
    });
  }

  /** postMessage itself can throw (structured-clone failure), which onmessage never sees. */
  private postToWorker(request: WorkerRequest): void {
    try {
      this.worker.postMessage(request);
    } catch {
      this.abortRun(WORKER_FAILURE);
    }
  }

  /** Single recovery path out of a run: re-enable the controls and say what happened. */
  private abortRun(message: string): void {
    this.setRunning(false);
    this.revealResults = false;
    $('progress').hidden = true;
    if (this.sweeping) setText('sweep-note', 'Sweep stopped before it finished.');
    this.sweeping = false;
    this.status(message);
    toast(message, 'bad', 6000);
  }

  private onWorkerMessage(msg: WorkerResponse): void {
    if (msg.id !== this.requestId) return;

    if (msg.type === 'progress') {
      const pct = Math.round((msg.tick / Math.max(1, msg.total)) * 100);
      $<HTMLElement>('progress-bar').style.width = `${pct}%`;
      this.status(`Simulating… ${pct}%`);
      return;
    }

    if (msg.type === 'error') {
      this.abortRun(msg.message);
      return;
    }

    this.setRunning(false);
    $('progress').hidden = true;

    if (msg.type === 'scan:done') {
      this.curve = msg.curve;
      drawCurve($<HTMLCanvasElement>('curve'), this.curve);
      setText('sweep-note', `Saturates at ${msg.curve.saturationFleetSize} robots — past that, throughput barely moves.`);
      toast(`Sweep done. Saturation at ${msg.curve.saturationFleetSize} robots.`, 'good');
      return;
    }

    this.run = msg;
    this.frame = 0;
    this.frameProgress = 0;
    this.selectedRobot = -1;
    $('inspector').hidden = true;

    const frames = msg.robotCount > 0 ? msg.cells.length / msg.robotCount : 0;
    const scrub = $<HTMLInputElement>('scrub');
    scrub.max = String(Math.max(0, frames - 1));
    scrub.value = '0';
    scrub.disabled = frames <= 1;
    $<HTMLButtonElement>('play').disabled = frames <= 1;

    this.showMetrics();
    this.status(`${msg.ticks} ticks simulated.`);
    this.updateRoi();
    this.redraw();

    if (this.revealResults) {
      this.revealResults = false;
      this.scrollResultsIntoView();
    }

    if (frames > 1) {
      this.playing = true;
      this.syncPlayLabel();
    }
  }

  private showMetrics(): void {
    const m = this.run?.metrics;
    if (!m) return;
    countTo($('m-oph'), m.ordersPerHour, (v) => v.toFixed(1));
    countTo($('m-util'), m.utilization * 100, (v) => `${v.toFixed(0)}%`);
    countTo($('m-lat'), m.latencyMean, (v) => `${v.toFixed(0)}t`);
    countTo($('m-p95'), m.latencyP95, (v) => `${v.toFixed(0)}t`);
    countTo($('m-done'), m.ordersCompleted, (v) => v.toFixed(0));
    countTo($('m-acc'), m.ordersAccepted, (v) => v.toFixed(0));
    drawTimeline($<HTMLCanvasElement>('timeline'), m.timeline, this.run?.robotCount ?? 0);

    const verdict = $('verdict');
    const backlog = m.ordersAccepted - m.ordersCompleted;
    const util = m.utilization;
    let text: string;
    if (m.ordersAccepted === 0) {
      text = 'No orders arrived. Add pick and deposit stations, or raise the arrival rate.';
    } else if (backlog > m.ordersAccepted * 0.25) {
      text = `The fleet is oversubscribed — ${backlog} orders never got served. Add robots or lower the arrival rate.`;
    } else if (util < 0.3) {
      text = `Robots idle ${Math.round((1 - util) * 100)}% of the time. You could run this floor with fewer.`;
    } else {
      text = `Demand and fleet are balanced: ${Math.round(util * 100)}% utilisation with the backlog under control.`;
    }
    verdict.textContent = text;
    verdict.hidden = false;
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

  /* ---------- playback ---------- */

  private get frameCount(): number {
    if (!this.run || this.run.robotCount === 0) return 0;
    return this.run.cells.length / this.run.robotCount;
  }

  private currentFrameCells(): Int32Array | null {
    if (!this.run || this.run.robotCount === 0) return null;
    const n = this.run.robotCount;
    const offset = this.frame * n;
    if (offset + n > this.run.cells.length) return null;
    return this.run.cells.subarray(offset, offset + n);
  }

  private tickPlayback(time: number): void {
    const dt = this.lastTime === 0 ? 0 : time - this.lastTime;
    this.lastTime = time;

    if (this.playing && this.run) {
      const frames = this.frameCount;
      const perFrame = 1000 / (BASE_FPS * this.speed);
      this.frameProgress += dt / perFrame;
      while (this.frameProgress >= 1) {
        this.frameProgress -= 1;
        this.frame++;
        if (this.frame >= frames - 1) {
          this.frame = Math.max(0, frames - 1);
          this.frameProgress = 0;
          this.playing = false;
          this.syncPlayLabel();
          break;
        }
      }
      $<HTMLInputElement>('scrub').value = String(this.frame);
      if (this.selectedRobot >= 0) this.updateInspector();
      this.redraw();
    }
    requestAnimationFrame((t) => this.tickPlayback(t));
  }

  private buildRobotFrame(): RobotFrame | null {
    if (!this.run || this.run.robotCount === 0) return null;
    const n = this.run.robotCount;
    const cells = this.currentFrameCells();
    if (!cells) return null;

    const prevIndex = this.frame - 1;
    const prev =
      prevIndex >= 0 ? this.run.cells.subarray(prevIndex * n, prevIndex * n + n) : null;

    const trail: Int32Array[] = [];
    if (this.showTrails) {
      for (let d = 1; d <= TRAIL_LENGTH; d++) {
        const idx = this.frame - d;
        if (idx < 0) break;
        trail.push(this.run.cells.subarray(idx * n, idx * n + n));
      }
    }

    return {
      cells,
      states: this.run.states.subarray(this.frame * n, this.frame * n + n),
      prev,
      alpha: this.playing ? Math.min(1, this.frameProgress) : 1,
      trail,
    };
  }

  private updateInspector(): void {
    const box = $('inspector');
    if (this.selectedRobot < 0 || !this.run) {
      box.hidden = true;
      return;
    }
    const n = this.run.robotCount;
    const offset = this.frame * n + this.selectedRobot;
    if (offset >= this.run.cells.length) return;
    const cellId = this.run.cells[offset];
    const state = STATE_CODES[this.run.states[offset]] ?? 'idle';
    box.hidden = false;
    setText('insp-id', String(this.selectedRobot));
    setText('insp-state', STATE_LABEL[state] ?? state);
    setText('insp-cell', `${cellId % this.layout.grid.width}, ${Math.floor(cellId / this.layout.grid.width)}`);
    setText('insp-load', state === 'toDeposit' || state === 'depositing' ? 'yes' : 'no');
    setText('insp-batt', state === 'charging' ? 'charging' : 'ok');
  }

  private invalidateRun(): void {
    this.run = null;
    this.frame = 0;
    this.frameProgress = 0;
    this.playing = false;
    this.selectedRobot = -1;
    $('inspector').hidden = true;
    this.syncPlayLabel();
    $<HTMLButtonElement>('play').disabled = true;
    $<HTMLInputElement>('scrub').disabled = true;
  }

  private setRunning(running: boolean): void {
    document.querySelector('.app')?.setAttribute('data-running', String(running));
    $<HTMLButtonElement>('run').disabled = running;
    $<HTMLButtonElement>('sweep').disabled = running;
    // swapping the layout mid-run would leave the in-flight worker result rendered against a
    // different grid, so demos are locked out until the current run lands
    for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-demo]')) {
      btn.disabled = running;
    }
  }

  private status(message: string): void {
    setText('run-status', message);
  }

  private redraw(): void {
    const { grid } = this.layout;
    this.renderer.resize(grid);

    this.renderer.draw({
      grid,
      homes: this.layout.robots.map((r) => r.y * grid.width + r.x),
      robots: this.buildRobotFrame(),
      heatmap: this.run?.metrics.heatmap ?? null,
      showHeatmap: this.showHeatmap,
      showTrails: this.showTrails,
      backdrop: this.backdrop,
      backdropOpacity: this.backdropOpacity,
      hoverCell: this.hoverCell,
      selectedRobot: this.selectedRobot,
    });

    const tick = this.run ? this.frame * this.run.stride : 0;
    setText('tick-read', String(tick).padStart(4, '0'));
    setText(
      'hud-robots',
      this.run ? `${this.run.robotCount} robots` : `${this.layout.robots.length} homes`,
    );
    setText('zoom-reset', `${Math.round(this.renderer.zoomLevel * 100)}%`);
  }
}
