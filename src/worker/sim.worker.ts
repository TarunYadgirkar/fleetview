import { deserializeLayout } from '../core/layout';
import { throughputCurve } from '../sim/scan';
import { Simulation } from '../sim/simulation';
import { MAX_FRAMES, type WorkerRequest, type WorkerResponse } from './protocol';

const PROGRESS_EVERY = 250;

function post(message: WorkerResponse, transfer?: Transferable[]): void {
  (self as unknown as Worker).postMessage(message, transfer ?? []);
}

function runSimulation(req: Extract<WorkerRequest, { type: 'run' }>): void {
  const layout = deserializeLayout(req.layout);
  const sim = new Simulation(layout.grid, req.fleet, req.config, layout.robots);

  const total = req.config.maxTicks;
  const stride = Math.max(1, Math.ceil(total / MAX_FRAMES));
  const frameCount = Math.floor(total / stride) + 1;
  const n = sim.robotCount;

  const cells = new Int32Array(frameCount * n);
  const states = new Uint8Array(frameCount * n);

  let frame = 0;
  if (n > 0) sim.writeFrame(cells, states, 0);
  frame++;

  while (!sim.done) {
    sim.step();
    if (sim.tick % stride === 0 && frame < frameCount) {
      if (n > 0) sim.writeFrame(cells, states, frame * n);
      frame++;
    }
    if (sim.tick % PROGRESS_EVERY === 0) {
      post({ type: 'progress', id: req.id, tick: sim.tick, total });
    }
  }

  const recorded = frame;
  const trimmedCells = cells.slice(0, recorded * n);
  const trimmedStates = states.slice(0, recorded * n);

  post(
    {
      type: 'run:done',
      id: req.id,
      ticks: sim.tick,
      robotCount: n,
      cells: trimmedCells,
      states: trimmedStates,
      stride,
      metrics: sim.metrics(),
    },
    [trimmedCells.buffer, trimmedStates.buffer],
  );
}

function runScan(req: Extract<WorkerRequest, { type: 'scan' }>): void {
  const layout = deserializeLayout(req.layout);
  const curve = throughputCurve(layout.grid, layout.robots, req.fleet, req.config, req.sizes);
  post({ type: 'scan:done', id: req.id, curve });
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.type === 'run') runSimulation(req);
    else if (req.type === 'scan') runScan(req);
  } catch (error) {
    post({
      type: 'error',
      id: req.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
