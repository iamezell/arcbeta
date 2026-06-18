import type * as THREE from 'three';

/**
 * Theatrical distance model for ARC world audio.
 *
 * Ranges (approximate):
 *   0–10 m   clear, full intelligibility
 *  10–25 m   slight attenuation
 *  25–50 m   noticeably quieter / muffled speech
 *  50+ m     nearly inaudible (maxDistance cutoff)
 */

export type SpatialPreset = 'speech' | 'sfx' | 'ambience_local' | 'creature' | 'player_voice';

export interface TheatricalSpatialConfig {
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
  volume: number;
  /** Head offset from parent origin (mouth / speaker). */
  localOffsetY: number;
}

export const SPATIAL_PRESETS: Record<SpatialPreset, TheatricalSpatialConfig> = {
  // maxDistance 120: bus (z≈12) to gate guards (z≈-74) is ~86 m — faint at bus, clear at gate.
  speech: { refDistance: 5, maxDistance: 120, rolloffFactor: 1.8, volume: 1, localOffsetY: 1.55 },
  sfx: { refDistance: 4, maxDistance: 45, rolloffFactor: 1.5, volume: 1, localOffsetY: 1 },
  ambience_local: { refDistance: 8, maxDistance: 55, rolloffFactor: 1.2, volume: 0.85, localOffsetY: 1.5 },
  creature: { refDistance: 6, maxDistance: 60, rolloffFactor: 1.45, volume: 0.9, localOffsetY: 1.2 },
  player_voice: { refDistance: 4, maxDistance: 40, rolloffFactor: 1.55, volume: 1, localOffsetY: 1.5 },
};

export function speechMuffleCutoff(distanceM: number, occlusionFactor = 1): number {
  const d = distanceM / Math.max(0.01, occlusionFactor);
  if (d < 10) return 22000;
  if (d < 25) return 3500;
  if (d < 45) return 900;
  if (d < 70) return 350;
  if (d < 100) return 180;
  return 120;
}

export function applySpatialPreset(
  audio: THREE.PositionalAudio,
  preset: SpatialPreset,
  volumeScale = 1
): void {
  const cfg = SPATIAL_PRESETS[preset];
  audio.setRefDistance(cfg.refDistance);
  audio.setMaxDistance(cfg.maxDistance);
  audio.setRolloffFactor(cfg.rolloffFactor);
  audio.setVolume(cfg.volume * volumeScale);
}

/** Apply theatrical distance model to a raw Web Audio PannerNode (WebRTC voice path). */
export function theatricalGainFromDistance(
  distanceM: number,
  preset: SpatialPreset,
  occlusionFactor = 1
): number {
  const cfg = SPATIAL_PRESETS[preset];
  const d = distanceM / Math.max(0.01, occlusionFactor);
  if (d >= cfg.maxDistance) return 0;
  if (d <= cfg.refDistance) return 1;
  return cfg.refDistance / (cfg.refDistance + cfg.rolloffFactor * (d - cfg.refDistance));
}

export function applyPresetToPanner(panner: PannerNode, preset: SpatialPreset): void {
  const cfg = SPATIAL_PRESETS[preset];
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = cfg.refDistance;
  panner.maxDistance = cfg.maxDistance;
  panner.rolloffFactor = cfg.rolloffFactor;
}

/** Panner for stereo/HRTF only — distance falloff applied manually on a GainNode. */
export function applyPannerStereoOnly(panner: PannerNode): void {
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'linear';
  panner.refDistance = 10000;
  panner.maxDistance = 100001;
  panner.rolloffFactor = 0;
}
