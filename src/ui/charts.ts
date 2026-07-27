import type { ThroughputCurve } from '../sim/scan';
import { PALETTE } from './renderer';

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
