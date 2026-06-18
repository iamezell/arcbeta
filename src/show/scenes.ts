import * as THREE from 'three';
import { StormAudioCueId } from '../audio/LostInTheStormCues';

// Client mirror of the server's show vocabulary (backend/show/showState.ts).
export type SceneId = 'PRE_SHOW' | 'ACT_1_STORM_ROAD';
export type TransitionMode = 'instant' | 'assemble';

/** Visual stage cues (client-side effects). */
export type VisualShowCue = 'thunder' | 'lightning' | 'rainUp' | 'gateLight';

/** All cues the Director can fire — visual + storm audio (synced via showCue socket). */
export type ShowCue = VisualShowCue | StormAudioCueId;

export const SCENE_PRE_SHOW: SceneId = 'PRE_SHOW';
export const SCENE_ACT_1: SceneId = 'ACT_1_STORM_ROAD';

// Human-readable labels for the Director panel "Current Scene" display.
export const SCENE_LABELS: Record<SceneId, string> = {
  PRE_SHOW: 'Loading Zone (Pre-Show)',
  ACT_1_STORM_ROAD: 'Act 1 — Storm Road',
};

// Where the Host stands in the pre-show loading zone. Players spawn at the
// origin facing -Z, so the host is directly ahead of them.
export const HOST_POSITION = new THREE.Vector3(0, 0, -6);

// Player spawn for the pre-show loading zone (x, z; y is the player eye height).
export const PRE_SHOW_SPAWN = { x: 0, z: 0, yaw: 0 };

// Player spawn for Act 1: just outside the broken-down bus, on the road,
// looking down the road toward the distant commune gate (-Z).
export const ACT_1_SPAWN = { x: 2.5, z: 12, yaw: 0 };
