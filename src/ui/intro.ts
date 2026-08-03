import { type DemoHandles, startCorridorDemo } from './demo';
import { $ } from './dom';
import { revealGroup } from './motion';

const SEEN_KEY = 'fleetview:seen-intro';

export interface IntroOptions {
  onEnter(): void;
  onRunDemo(): void;
}

/**
 * The explainer view. Shown on a first visit and reachable afterwards from the planner's
 * "What is this?" button. The corridor demo only runs while the view is on screen.
 */
export class Intro {
  private demo: DemoHandles | null = null;

  constructor(
    private readonly app: HTMLElement,
    private readonly options: IntroOptions,
  ) {
    $('enter-planner').addEventListener('click', () => this.close());
    $('enter-planner-2').addEventListener('click', () => this.close());
    $('skip-intro').addEventListener('click', () => this.close());
    $('intro-preset').addEventListener('click', () => {
      this.close();
      this.options.onRunDemo();
    });
    $('show-intro').addEventListener('click', () => this.open());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });

    if (this.hasSeen()) this.close(false);
    else this.open();
  }

  private get isOpen(): boolean {
    return this.app.dataset.view === 'intro';
  }

  private hasSeen(): boolean {
    try {
      return localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  private remember(): void {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode — showing the intro again is an acceptable fallback */
    }
  }

  open(): void {
    this.app.dataset.view = 'intro';
    this.startDemo();
    revealGroup(document.querySelectorAll('.hero > *'), 0.05);
    revealGroup(document.querySelectorAll('.step'), 0.15);
  }

  close(remember = true): void {
    this.app.dataset.view = 'planner';
    this.demo?.stop();
    this.demo = null;
    if (remember) this.remember();
    this.options.onEnter();
  }

  private startDemo(): void {
    if (this.demo) return;
    this.demo = startCorridorDemo(
      $<HTMLCanvasElement>('demo-naive'),
      $<HTMLCanvasElement>('demo-cbs'),
      ({ cost, naiveStalled }) => {
        const note = $('thesis-cost');
        note.textContent = naiveStalled
          ? `Uncoordinated routing deadlocks here. CBS solves it at sum-of-costs ${cost} — provably the cheapest possible.`
          : `CBS solves it at sum-of-costs ${cost}.`;
      },
    );
  }
}
