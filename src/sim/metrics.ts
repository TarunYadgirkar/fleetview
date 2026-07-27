export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** nearest-rank percentile (p in 0..1). Non-destructive. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function ordersPerHour(completed: number, ticks: number, tickSeconds: number): number {
  const hours = (ticks * tickSeconds) / 3600;
  return hours > 0 ? completed / hours : 0;
}
