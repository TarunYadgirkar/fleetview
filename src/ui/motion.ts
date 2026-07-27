// motion/mini ships just the WAAPI-backed animate (~2.5 kB) instead of the full engine.
import { animate } from 'motion/mini';

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Staged entrance for a group of elements. A no-op under reduced motion — the elements are
 * already visible in their resting state, so skipping the animation costs nothing.
 */
export function revealGroup(targets: Element[] | NodeListOf<Element>, delay = 0): void {
  const list = Array.from(targets);
  if (list.length === 0 || prefersReducedMotion()) return;
  list.forEach((el, i) => {
    animate(
      el,
      { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0px)'] },
      { duration: 0.42, delay: delay + i * 0.045, ease: [0.22, 0.61, 0.36, 1] },
    );
  });
}

export function pop(target: Element): void {
  if (prefersReducedMotion()) return;
  animate(target, { transform: ['scale(0.94)', 'scale(1)'] }, { duration: 0.22 });
}

/**
 * Count a metric up to its new value. Falls back to setting the text directly under reduced
 * motion, and for values that did not meaningfully change.
 */
export function countTo(
  el: HTMLElement,
  to: number,
  format: (value: number) => string,
  from = 0,
): void {
  // rAF never fires in a hidden/background tab, so an animation-only path can leave the
  // metric showing its placeholder forever. Skip straight to the value in that case.
  if (prefersReducedMotion() || document.hidden || !Number.isFinite(to)) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const duration = 520;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // belt and braces: guarantee the exact final value even if frames stop being scheduled
  window.setTimeout(() => {
    el.textContent = format(to);
  }, duration + 80);
}
