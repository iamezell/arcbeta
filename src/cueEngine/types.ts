import type { ShowCue } from '../show/scenes';
import type { StormAudioCueId } from '../audio/LostInTheStormCues';
import type { DirectorCue } from '../npc/types';

/** Atomic cue action types the engine can dispatch. */
export type CueActionType =
  | 'audio_global'
  | 'audio_positional'
  | 'storm_cue'
  | 'visual_cue'
  | 'environment'
  | 'npc_cue'
  | 'dialogue';

export interface CueActionBase {
  type: CueActionType;
  label?: string;
}

/** Non-positional audio from the cue registry. */
export interface AudioGlobalAction extends CueActionBase {
  type: 'audio_global';
  cue: string;
}

/** Positional audio from the cue registry. */
export interface AudioPositionalAction extends CueActionBase {
  type: 'audio_positional';
  cue: string;
  position?: { x: number; y: number; z: number };
  /** Theatrical offset presets (see LostInTheStormCues). */
  offset?: 'wolf_left' | 'wolf_right' | 'wolf_behind' | 'gate' | 'woods' | 'scream_far';
}

/** Storm staging helper (existing LostInTheStormCues dispatch). */
export interface StormCueAction extends CueActionBase {
  type: 'storm_cue';
  cue: StormAudioCueId;
}

/** Visual show cue (lightning, rain, gate lamps, etc.). */
export interface VisualCueAction extends CueActionBase {
  type: 'visual_cue';
  cue: ShowCue;
}

/** Environment / lighting state change on the show layer. */
export interface EnvironmentAction extends CueActionBase {
  type: 'environment';
  effect: 'rain_up' | 'rain_down' | 'blackout' | 'gate_light';
  /** Seconds for temporary effects like blackout (default 2). */
  duration?: number;
}

/** NPC director cue (server-authoritative when role is Director). */
export interface NpcCueAction extends CueActionBase {
  type: 'npc_cue';
  npcId: string;
  cue: DirectorCue;
}

/** Scripted subtitle line without changing NPC state machine. */
export interface DialogueAction extends CueActionBase {
  type: 'dialogue';
  npcId: string;
  line: string;
}

export type CueAction =
  | AudioGlobalAction
  | AudioPositionalAction
  | StormCueAction
  | VisualCueAction
  | EnvironmentAction
  | NpcCueAction
  | DialogueAction;

/** One timed step inside a beat (seconds from beat start). */
export interface TimedCue {
  at: number;
  action: CueAction;
}

/** A timed sequence of atomic cues. */
export interface BeatDefinition {
  id: string;
  label: string;
  description?: string;
  cues: TimedCue[];
  /** When true, cannot replay unless CueEngine.resetProgress() or force start. */
  oneTime?: boolean;
  /** Hint for UI / moment chaining (seconds). */
  duration?: number;
}

/** A story moment composed of one or more beats played in order. */
export interface MomentDefinition {
  id: string;
  label: string;
  description?: string;
  beats: string[];
  oneTime?: boolean;
}

export type BeatRunState = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface BeatStartPayload {
  beatId: string;
  startedAt: number;
  momentId?: string;
  force?: boolean;
}

export interface MomentStartPayload {
  momentId: string;
  startedAt: number;
  force?: boolean;
}

export interface CueEngineDefinitions {
  beats: Record<string, BeatDefinition>;
  moments: Record<string, MomentDefinition>;
}
