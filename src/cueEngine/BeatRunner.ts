import { BeatDefinition, BeatRunState, CueAction, TimedCue } from './types';

export interface BeatRunnerCallbacks {
  onCue: (action: CueAction, timed: TimedCue) => void;
  onComplete: (beatId: string) => void;
  onStateChange?: (state: BeatRunState, beatId: string | null) => void;
}

/**
 * Schedules timed cues relative to a shared anchor timestamp (for multiplayer sync).
 * Supports pause / resume by skipping already-fired cues and rescheduling the rest.
 */
export class BeatRunner {
  private state: BeatRunState = 'idle';
  private beat: BeatDefinition | null = null;
  private anchorMs = 0;
  private pausedElapsedSec = 0;
  private firedIndices = new Set<number>();
  private timers: number[] = [];
  private callbacks: BeatRunnerCallbacks | null = null;

  getState(): BeatRunState {
    return this.state;
  }

  getBeatId(): string | null {
    return this.beat?.id ?? null;
  }

  getElapsedSec(): number {
    if (this.state === 'idle' || !this.beat) return 0;
    if (this.state === 'paused') return this.pausedElapsedSec;
    return Math.max(0, (Date.now() - this.anchorMs) / 1000);
  }

  start(beat: BeatDefinition, startedAtMs: number, callbacks: BeatRunnerCallbacks): void {
    this.stop();
    this.beat = beat;
    this.callbacks = callbacks;
    this.anchorMs = startedAtMs;
    this.pausedElapsedSec = 0;
    this.firedIndices.clear();
    this.setState('running');
    this.scheduleRemaining();
  }

  pause(): void {
    if (this.state !== 'running' || !this.beat) return;
    this.pausedElapsedSec = this.getElapsedSec();
    this.clearTimers();
    this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused' || !this.beat) return;
    this.anchorMs = Date.now() - this.pausedElapsedSec * 1000;
    this.setState('running');
    this.scheduleRemaining();
  }

  stop(): void {
    this.clearTimers();
    this.beat = null;
    this.callbacks = null;
    this.firedIndices.clear();
    this.setState('idle');
  }

  cancel(): void {
    const beatId = this.beat?.id ?? null;
    const callbacks = this.callbacks;
    this.clearTimers();
    this.beat = null;
    this.callbacks = null;
    this.firedIndices.clear();
    callbacks?.onStateChange?.('cancelled', beatId);
    this.state = 'idle';
  }

  private scheduleRemaining(): void {
    if (!this.beat || !this.callbacks) return;
    this.clearTimers();

    const elapsed = this.getElapsedSec();
    this.beat.cues.forEach((timed, index) => {
      if (this.firedIndices.has(index)) return;
      if (timed.at < elapsed - 0.05) {
        this.firedIndices.add(index);
        return;
      }
      const delayMs = Math.max(0, timed.at * 1000 - elapsed * 1000);
      const timer = window.setTimeout(() => {
        if (this.state !== 'running' || !this.beat) return;
        this.firedIndices.add(index);
        this.callbacks?.onCue(timed.action, timed);
      }, delayMs);
      this.timers.push(timer);
    });

    const endAt =
      this.beat.duration ??
      Math.max(0, ...this.beat.cues.map((c) => c.at)) + 0.5;
    const endDelayMs = Math.max(0, endAt * 1000 - elapsed * 1000);
    this.timers.push(
      window.setTimeout(() => {
        if (this.state !== 'running' || !this.beat) return;
        const id = this.beat.id;
        this.setState('completed');
        this.callbacks?.onComplete(id);
        this.stop();
      }, endDelayMs)
    );
  }

  private clearTimers(): void {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }

  private setState(state: BeatRunState): void {
    this.state = state;
    this.callbacks?.onStateChange?.(state, this.beat?.id ?? null);
  }
}
