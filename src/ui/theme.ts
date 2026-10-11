/**
 * Canvas drawing cannot read CSS variables, so the palette is read once from the tokens in
 * styles.css. The stylesheet stays the single definition of every color.
 */
const TOKENS = {
  sheet: '--sheet',
  raised: '--raised',
  rule: '--rule',
  ruleStrong: '--rule-strong',
  ink: '--ink',
  inkMuted: '--ink-muted',
  inkFaint: '--ink-faint',
  signal: '--signal',
  hazard: '--hazard',
  go: '--go',
  stop: '--stop',
  floor: '--floor',
  floorJoint: '--floor-joint',
  wall: '--cell-wall',
  rack: '--cell-rack',
  pick: '--cell-pick',
  deposit: '--cell-deposit',
  charge: '--cell-charge',
  robot: '--robot',
  robotIdle: '--robot-idle',
  heat: '--heat',
  dataFont: '--font-data',
} as const;

export type Palette = Record<keyof typeof TOKENS, string>;

let cached: Palette | null = null;

export function palette(): Palette {
  if (cached) return cached;
  const style = getComputedStyle(document.documentElement);
  const entries = Object.entries(TOKENS).map(([key, token]) => [
    key,
    style.getPropertyValue(token).trim(),
  ]);
  cached = Object.fromEntries(entries) as Palette;
  return cached;
}

/** `#rrggbb` plus an alpha, as a canvas-ready color string. */
export function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
