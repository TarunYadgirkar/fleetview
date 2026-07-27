export function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

export function num(id: string): number {
  const value = Number(($<HTMLInputElement>(id)).value);
  return Number.isFinite(value) ? value : 0;
}

export function setText(id: string, text: string): void {
  $(id).textContent = text;
}

export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}
