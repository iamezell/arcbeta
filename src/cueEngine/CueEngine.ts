import {
  BeatDefinition,
  BeatRunState,
  BeatStartPayload,
  CueAction,
  CueEngineDefinitions,
  MomentDefinition,
  MomentStartPayload,
} from './types';
import { BeatRunner } from './BeatRunner';
import {
  CueEngineRuntime,
  executeCueAction,
  registerDefaultCueActions,
} from './cueActionRegistry';

export interface CueEngineOpts {
  runtime: CueEngineRuntime;
  definitions: CueEngineDefinitions;
}

/**
 * Orchestrates theatrical beats and moments. Director triggers sync via socket;
 * all clients run BeatRunner against the shared `startedAt` anchor.
 */
export class CueEngine {
  private readonly runtime: CueEngineRuntime;
  private readonly beats: Map<string, BeatDefinition>;
  private readonly moments: Map<string, MomentDefinition>;
  private readonly runner = new BeatRunner();
  private readonly completedBeats = new Set<string>();
  private readonly completedMoments = new Set<string>();
  private momentQueue: string[] = [];
  private activeMomentId: string | null = null;
  private onStateChange?: (state: BeatRunState, beatId: string | null) => void;

  constructor(opts: CueEngineOpts) {
    registerDefaultCueActions();
    this.runtime = opts.runtime;
    this.beats = new Map(Object.entries(opts.definitions.beats));
    this.moments = new Map(Object.entries(opts.definitions.moments));
  }

  setOnStateChange(cb: (state: BeatRunState, beatId: string | null) => void): void {
    this.onStateChange = cb;
  }

  getBeatIds(): string[] {
    return [...this.beats.keys()];
  }

  getMomentIds(): string[] {
    return [...this.moments.keys()];
  }

  getBeat(id: string): BeatDefinition | undefined {
    return this.beats.get(id);
  }

  getMoment(id: string): MomentDefinition | undefined {
    return this.moments.get(id);
  }

  isBeatCompleted(id: string): boolean {
    return this.completedBeats.has(id);
  }

  isMomentCompleted(id: string): boolean {
    return this.completedMoments.has(id);
  }

  /** Fire a single atomic cue immediately (emergency overrides). */
  async fireImmediate(action: CueAction): Promise<void> {
    await executeCueAction(action, this.runtime);
  }

  /**
   * Director: request server sync then run locally when broadcast arrives.
   * Non-director: no-op (waits for remote payload).
   */
  requestStartBeat(beatId: string, opts?: { force?: boolean }): boolean {
    const beat = this.beats.get(beatId);
    if (!beat) {
      console.warn(`[CueEngine] unknown beat "${beatId}"`);
      return false;
    }
    if (beat.oneTime && this.completedBeats.has(beatId) && !opts?.force) {
      console.warn(`[CueEngine] beat "${beatId}" already played (use force to replay)`);
      return false;
    }
    if (this.runtime.role !== 'Director') return false;
    this.runtime.broadcastStartBeat?.({ beatId, startedAt: Date.now(), force: opts?.force });
    return true;
  }

  requestStartMoment(momentId: string, opts?: { force?: boolean }): boolean {
    const moment = this.moments.get(momentId);
    if (!moment) {
      console.warn(`[CueEngine] unknown moment "${momentId}"`);
      return false;
    }
    if (moment.oneTime && this.completedMoments.has(momentId) && !opts?.force) {
      console.warn(`[CueEngine] moment "${momentId}" already played (use force to replay)`);
      return false;
    }
    if (this.runtime.role !== 'Director') return false;
    this.runtime.broadcastStartMoment?.({ momentId, startedAt: Date.now(), force: opts?.force });
    return true;
  }

  /** Called on all clients when server broadcasts beat start. */
  handleBeatStart(payload: BeatStartPayload): void {
    const beat = this.beats.get(payload.beatId);
    if (!beat) return;
    if (beat.oneTime && this.completedBeats.has(payload.beatId) && !payload.force) return;

    this.activeMomentId = payload.momentId ?? null;
    this.runner.start(beat, payload.startedAt, {
      onCue: (action) => void executeCueAction(action, this.runtime),
      onComplete: (beatId) => {
        if (beat.oneTime) this.completedBeats.add(beatId);
      },
      onStateChange: (state, beatId) => this.onStateChange?.(state, beatId),
    });
  }

  /** Called on all clients when server broadcasts moment start. */
  handleMomentStart(payload: MomentStartPayload): void {
    const moment = this.moments.get(payload.momentId);
    if (!moment) return;
    if (moment.oneTime && this.completedMoments.has(payload.momentId) && !payload.force) return;

    this.runner.cancel();
    this.activeMomentId = payload.momentId;
    this.momentQueue = [...moment.beats];
    this.runNextMomentBeat(payload.momentId, payload.force);
  }

  pauseBeat(): void {
    this.runner.pause();
  }

  resumeBeat(): void {
    this.runner.resume();
  }

  stopBeat(): void {
    this.runner.stop();
    this.momentQueue = [];
    this.activeMomentId = null;
  }

  cancelBeat(): void {
    this.runner.cancel();
    this.momentQueue = [];
    this.activeMomentId = null;
  }

  resetProgress(scope: 'beats' | 'moments' | 'all' = 'all'): void {
    if (scope === 'beats' || scope === 'all') this.completedBeats.clear();
    if (scope === 'moments' || scope === 'all') this.completedMoments.clear();
  }

  getRunnerState(): BeatRunState {
    return this.runner.getState();
  }

  private runNextMomentBeat(momentId: string, force?: boolean): void {
    const nextId = this.momentQueue.shift();
    if (!nextId) {
      const moment = this.moments.get(momentId);
      if (moment?.oneTime) this.completedMoments.add(momentId);
      this.activeMomentId = null;
      return;
    }

    const beat = this.beats.get(nextId);
    if (!beat) {
      this.runNextMomentBeat(momentId, force);
      return;
    }
    if (beat.oneTime && this.completedBeats.has(nextId) && !force) {
      this.runNextMomentBeat(momentId, force);
      return;
    }

    this.runner.start(beat, Date.now(), {
      onCue: (action) => void executeCueAction(action, this.runtime),
      onComplete: (beatId) => {
        if (beat.oneTime) this.completedBeats.add(beatId);
        window.setTimeout(() => this.runNextMomentBeat(momentId, force), 400);
      },
      onStateChange: (state, beatId) => this.onStateChange?.(state, beatId),
    });
  }
}

export type CueEngineRuntimeWithBroadcast = CueEngineRuntime;