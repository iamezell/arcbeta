import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { LostInTheStormCues, dispatchStormAudioCue } from '../audio/LostInTheStormCues';
import { ShowController } from '../show/ShowController';
import { CueManager } from '../npc/CueManager';
import { CueAction, CueActionType } from './types';

import { BeatStartPayload, MomentStartPayload } from './types';

/** Runtime dependencies injected when the cue engine executes actions. */
export interface CueEngineRuntime {
  role: string;
  audio: AudioManager;
  stormCues: LostInTheStormCues;
  showController: ShowController;
  cueManager: CueManager;
  /** Director-only: broadcast a legacy show cue to all clients. */
  broadcastShowCue: (cue: string) => void;
  /** Director-only: sync beat start to all clients. */
  broadcastStartBeat?: (payload: BeatStartPayload) => void;
  /** Director-only: sync moment start to all clients. */
  broadcastStartMoment?: (payload: MomentStartPayload) => void;
}

export type CueActionHandler = (action: CueAction, ctx: CueEngineRuntime) => void | Promise<void>;

const handlers = new Map<CueActionType, CueActionHandler>();

export function registerCueAction(type: CueActionType, handler: CueActionHandler): void {
  handlers.set(type, handler);
}

export async function executeCueAction(action: CueAction, ctx: CueEngineRuntime): Promise<void> {
  const handler = handlers.get(action.type);
  if (!handler) {
    console.warn(`[CueEngine] no handler for action type "${action.type}"`);
    return;
  }
  await handler(action, ctx);
}

function resolveOffset(
  audio: AudioManager,
  offset: NonNullable<import('./types').AudioPositionalAction['offset']>
): THREE.Vector3 {
  switch (offset) {
    case 'wolf_left':
      return audio.offsetFromGroupCenter(new THREE.Vector3(-22, 1.5, -18));
    case 'wolf_right':
      return audio.offsetFromGroupCenter(new THREE.Vector3(22, 1.5, -18));
    case 'wolf_behind':
      return audio.offsetFromGroupCenter(new THREE.Vector3(0, 1.5, 20));
    case 'gate':
      return audio.offsetFromGroupCenter(new THREE.Vector3(-3.5, 1.6, -74));
    case 'woods':
      return audio.offsetFromGroupCenter(new THREE.Vector3(-14, 1, -10));
    case 'scream_far':
      return audio.offsetFromGroupCenter(new THREE.Vector3(0, 2, -45));
    default:
      return audio.getPlayerGroupCenter();
  }
}

/** Register built-in handlers for all cue action types. Idempotent. */
export function registerDefaultCueActions(): void {
  if (handlers.size > 0) return;

  registerCueAction('audio_global', (action, ctx) => {
    if (action.type !== 'audio_global') return;
    void ctx.audio.triggerCue(action.cue);
  });

  registerCueAction('audio_positional', (action, ctx) => {
    if (action.type !== 'audio_positional') return;
    const pos = action.position
      ? new THREE.Vector3(action.position.x, action.position.y, action.position.z)
      : action.offset
        ? resolveOffset(ctx.audio, action.offset)
        : ctx.audio.getPlayerGroupCenter();
    ctx.audio.triggerCue(action.cue, { position: pos });
  });

  registerCueAction('storm_cue', (action, ctx) => {
    if (action.type !== 'storm_cue') return;
    void dispatchStormAudioCue(ctx.stormCues, action.cue);
  });

  registerCueAction('visual_cue', (action, ctx) => {
    if (action.type !== 'visual_cue') return;
    ctx.showController.handleCue(action.cue);
  });

  registerCueAction('environment', (action, ctx) => {
    if (action.type !== 'environment') return;
    switch (action.effect) {
      case 'rain_up':
        ctx.showController.handleCue('rainUp');
        break;
      case 'rain_down':
        ctx.showController.setRainIntensity(0.25);
        break;
      case 'gate_light':
        ctx.showController.handleCue('gateLight');
        break;
      case 'blackout':
        ctx.showController.triggerBlackout(action.duration ?? 2);
        break;
    }
  });

  registerCueAction('npc_cue', (action, ctx) => {
    if (action.type !== 'npc_cue') return;
    if (ctx.role !== 'Director') return;
    ctx.cueManager.executeCue(action.npcId, action.cue);
  });

  registerCueAction('dialogue', (action, ctx) => {
    if (action.type !== 'dialogue') return;
    const actor = ctx.cueManager.getActor(action.npcId);
    if (actor) {
      actor.receiveCue('WATCH' as import('../npc/types').DirectorCue, action.line);
    }
  });
}
