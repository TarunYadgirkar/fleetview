import { animate } from 'motion/mini';
import { type IconName, icon } from './icons';
import { prefersReducedMotion } from './motion';

type Tone = 'info' | 'good' | 'bad';

const TONE_ICON: Record<Tone, IconName> = {
  info: 'sparkles',
  good: 'gauge',
  bad: 'flame',
};

let host: HTMLElement | null = null;

function ensureHost(): HTMLElement {
  if (host) return host;
  host = document.createElement('div');
  host.className = 'toasts';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

export function toast(message: string, tone: Tone = 'info', ms = 3600): void {
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.innerHTML = `${icon(TONE_ICON[tone], 15)}<span>${message}</span>`;
  ensureHost().appendChild(el);

  if (!prefersReducedMotion()) {
    animate(
      el,
      { opacity: [0, 1], transform: ['translateY(10px) scale(0.98)', 'translateY(0) scale(1)'] },
      { duration: 0.26, ease: [0.22, 0.61, 0.36, 1] },
    );
  }

  window.setTimeout(() => {
    if (prefersReducedMotion()) {
      el.remove();
      return;
    }
    animate(el, { opacity: [1, 0], transform: ['translateY(0)', 'translateY(-6px)'] }, { duration: 0.22 })
      .finished.then(() => el.remove())
      .catch(() => el.remove());
  }, ms);
}
