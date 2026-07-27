import type { LayoutJson } from '../core/layout';
import type { ThroughputCurve } from '../sim/scan';
import type { FleetSpec, SimConfig, SimMetrics } from '../sim/types';

export type WorkerRequest =
  | { type: 'run'; id: number; layout: LayoutJson; fleet: FleetSpec; config: SimConfig }
  | {
      type: 'scan';
      id: number;
      layout: LayoutJson;
      fleet: FleetSpec;
      config: SimConfig;
      sizes: number[];
    };

export interface RunPayload {
  type: 'run:done';
  id: number;
  ticks: number;
  robotCount: number;
  /** frame f, robot i → cells[f * robotCount + i] */
  cells: Int32Array;
  states: Uint8Array;
  /** ticks between recorded frames */
  stride: number;
  metrics: SimMetrics;
}

export type WorkerResponse =
  | { type: 'progress'; id: number; tick: number; total: number }
  | RunPayload
  | { type: 'scan:done'; id: number; curve: ThroughputCurve }
  | { type: 'error'; id: number; message: string };

/** cap on recorded playback frames, so long runs stay within a sane memory budget */
export const MAX_FRAMES = 4000;
