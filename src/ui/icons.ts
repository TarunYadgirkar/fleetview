import {
  Boxes,
  BrickWall,
  CircleQuestionMark,
  Cpu,
  Download,
  Eraser,
  Flame,
  Gauge,
  Image,
  Layers,
  Pause,
  Play,
  Plug,
  Route,
  Sparkles,
  SquareStack,
  Timer,
  TrendingUp,
  Truck,
  Upload,
  Wallet,
} from 'lucide';

type IconNode = readonly (readonly [string, Record<string, string | number | undefined>])[];

export const ICONS = {
  boxes: Boxes,
  wall: BrickWall,
  help: CircleQuestionMark,
  cpu: Cpu,
  download: Download,
  eraser: Eraser,
  flame: Flame,
  gauge: Gauge,
  image: Image,
  layers: Layers,
  pause: Pause,
  play: Play,
  plug: Plug,
  route: Route,
  sparkles: Sparkles,
  stack: SquareStack,
  timer: Timer,
  trending: TrendingUp,
  truck: Truck,
  upload: Upload,
  wallet: Wallet,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

/** Inline SVG string for an icon. Bundled at build time — no icon font, no network. */
export function icon(name: IconName, size = 16): string {
  const parts = ICONS[name]
    .map(([tag, attrs]) => {
      const serialized = Object.entries(attrs)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${serialized} />`;
    })
    .join('');
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts}</svg>`;
}
