/**
 * ARC Cue Registry — type definitions.
 *
 * Experiences reference cue *names* only (e.g. `playCue("wolf_howl_far")`).
 * The registry resolves names → shared library assets. Never reference file
 * extensions or paths from gameplay / director code.
 */

import type { SpatialPreset } from '../spatialConfig';

export type VolumeGroup = 'master' | 'sfx' | 'ambience' | 'music' | 'voice' | 'ui';

/** How this cue should sync in multiplayer (metadata for future network layer). */
export type CueScope = 'global' | 'area' | 'player' | 'director';

export interface SpatialDefaults {
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
}

export interface CueDefinition {
  /**
   * Shared library folder: public/audio/cue-packs/<library>/<asset>.opus
   * Omit when this entry is variant-only (see `variants`).
   */
  library?: string;
  /** Basename without extension inside the library folder. */
  asset?: string;
  /** Pick one of these cue names at random (with pitch/volume variation). */
  variants?: string[];
  /** Looping ambience bed (used by playLoop / fadeTo). */
  loop?: boolean;
  /**
   * true  = non-positional (UI, narration, sky beds).
   * false = world positional (default for sfx / voice in world).
   * Omit  = inferred from group (ui/voice global; else world).
   */
  global?: boolean;
  /** Theatrical distance preset when spatial (see spatialConfig.ts). */
  spatialPreset?: SpatialPreset;
  /** @deprecated Prefer spatialPreset. Inline overrides still supported. */
  spatial?: boolean | SpatialDefaults;
  group?: VolumeGroup;
  volume?: number;
  pitchVariation?: [number, number];
  volumeVariation?: [number, number];
  /** Max simultaneous instances of this resolved cue (default 3 for sfx, 1 for loop). */
  maxInstances?: number;
  scope?: CueScope;
}

/** Wire payload shape for future multiplayer audio sync. */
export interface CueEvent {
  cueName: string;
  resolvedCue: string;
  scope: CueScope;
  position?: { x: number; y: number; z: number };
  playerId?: string;
  /** Deterministic variant pick when replaying on clients. */
  seed?: number;
  timestamp: number;
}

export interface PlayCueOptions {
  volume?: number;
  pitch?: number;
  position?: import('three').Vector3;
  /** Override spatial even for global cues. */
  forceSpatial?: boolean;
  /** Skip variant randomization (play this exact cue). */
  noVariants?: boolean;
  /** For multiplayer replay. */
  seed?: number;
}

export interface PlayLoopOptions {
  /** Ambience layer slot (defaults to cue name). Multiple layers can run at once. */
  layer?: string;
  volume?: number;
  fadeIn?: number;
  /** Required for world (non-global) looping ambience. */
  position?: import('three').Vector3;
}

export interface FadeToOptions {
  layer?: string;
  duration?: number;
  volume?: number;
}

export interface PlayPositionalOptions {
  volume?: number;
  pitch?: number;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  loop?: boolean;
}

export interface MovingCueOptions extends PlayPositionalOptions {
  duration: number;
  loop?: boolean;
}

export interface AudioDebugState {
  enabled: boolean;
  loadedCues: string[];
  activeInstances: { id: string; cue: string; resolved: string; group: VolumeGroup; spatial: boolean }[];
  ambienceLayers: { layer: string; cue: string; spatial: boolean }[];
  movingEmitters: number;
  registeredEmitters: EmitterDebugSnapshot[];
  cacheEntries: number;
  estimatedMemoryBytes: number;
}

export interface EmitterDebugSnapshot {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  z: number;
  refDistance: number;
  maxDistance: number;
  volume: number;
  distanceToListener: number;
  active: boolean;
}
