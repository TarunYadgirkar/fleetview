import type { ThroughputCurve } from '../sim/scan';
import type { TimelinePoint } from '../sim/types';
import { PALETTE } from './renderer';

function prepare(canvas: HTMLCanvasElement, height: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(200, rect.width || 320);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, height);
  ctx.fillStyle = '#141716';
  ctx.fillRect(0, 0, w, height);
  return { ctx, w, h: height };
}

/**
 * How the run actually unfolded: cumulative orders against the number of robots working and
 * the queue waiting. End-state numbers hide warm-up, saturation and collapse — this shows them.
 */
export function drawTimeline(
  canvas: HTMLCanvasElement,
  timeline: TimelinePoint[] | null,
  fleetSize: number,
): void {
  const setup = prepare(canvas, 118);
  if (!setup) return;
  const { ctx, w, h } = setup;
  const pad = { l: 6, r: 6, t: 10, b: 14 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  if (!timeline || timeline.length < 2) {
    ctx.fillStyle = '#8b938f';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('Run a simulation to see how it unfolded', pad.l + 4, h / 2);
    return;
  }

  const lastTick = timeline[timeline.length - 1].tick || 1;
  const maxCompleted = Math.max(1, timeline[timeline.length - 1].completed);
  const maxPending = Math.max(1, ...timeline.map((p) => p.pending));
  const px = (tick: number) => pad.l + (tick / lastTick) * plotW;

  const line = (
    value: (p: TimelinePoint) => number,
    max: number,
    color: string,
    fill: boolean,
  ) => {
    ctx.beginPath();
    timeline.forEach((p, i) => {
      const x = px(p.tick);
      const y = pad.t + plotH - (Math.min(value(p), max) / max) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (fill) {
      ctx.lineTo(px(lastTick), pad.t + plotH);
      ctx.lineTo(pad.l, pad.t + plotH);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  };

  // queue depth sits behind as a filled area; it is context, not the headline
  line((p) => p.pending, maxPending, 'rgba(226,74,42,0.22)', true);
  if (fleetSize > 0) line((p) => p.busy, fleetSize, PALETTE.charge, false);
  line((p) => p.completed, maxCompleted, PALETTE.paint, false);

  ctx.fillStyle = '#8b938f';
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillText('0', pad.l, h - 3);
  const end = `${lastTick}t`;
  ctx.fillText(end, pad.l + plotW - ctx.measureText(end).width, h - 3);
}

/**
 * Throughput-vs-fleet-size curve. The saturation point is called out directly on the plot,
 * because that number is the reason anyone runs the sweep.
 */
export function drawCurve(canvas: HTMLCanvasElement, curve: ThroughputCurve | null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(200, rect.width || 320);
  const h = 160;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#242826';
  ctx.fillRect(0, 0, w, h);

  const pad = { l: 34, r: 10, t: 12, b: 22 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  ctx.strokeStyle = '#3b4340';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l + 0.5, pad.t);
  ctx.lineTo(pad.l + 0.5, pad.t + plotH + 0.5);
  ctx.lineTo(pad.l + plotW, pad.t + plotH + 0.5);
  ctx.stroke();

  if (!curve || curve.points.length === 0) {
    ctx.fillStyle = '#9aa19d';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('Run a sweep to plot throughput', pad.l + 8, pad.t + plotH / 2);
    return;
  }

  const sizes = curve.points.map((p) => p.fleetSize);
  const values = curve.points.map((p) => p.ordersPerHour);
  const maxSize = Math.max(...sizes);
  const minSize = Math.min(...sizes);
  const maxVal = Math.max(...values, 1);

  const px = (size: number) =>
    pad.l + (maxSize === minSize ? plotW / 2 : ((size - minSize) / (maxSize - minSize)) * plotW);
  const py = (val: number) => pad.t + plotH - (val / maxVal) * plotH;

  ctx.strokeStyle = PALETTE.lane;
  ctx.lineWidth = 2;
  ctx.beginPath();
  curve.points.forEach((p, i) => {
    const x = px(p.fleetSize);
    const y = py(p.ordersPerHour);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  for (const p of curve.points) {
    const x = px(p.fleetSize);
    const y = py(p.ordersPerHour);
    const isKnee = p.fleetSize === curve.saturationFleetSize;
    ctx.fillStyle = isKnee ? PALETTE.hivis : PALETTE.lane;
    ctx.fillRect(x - 3, y - 3, 6, 6);
    if (isKnee) {
      ctx.strokeStyle = PALETTE.hivis;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y);
      ctx.lineTo(x + 0.5, pad.t + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.fillStyle = '#9aa19d';
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillText(String(Math.round(maxVal)), 4, pad.t + 6);
  ctx.fillText('0', 4, pad.t + plotH);
  ctx.fillText(`${minSize} robots`, pad.l, h - 6);
  const lastLabel = `${maxSize}`;
  ctx.fillText(lastLabel, pad.l + plotW - ctx.measureText(lastLabel).width, h - 6);
}
