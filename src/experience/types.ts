import * as THREE from 'three';

/**
 * Audience Experience Modes.
 *
 * This is intentionally an open string-union rather than a closed enum so future
 * modes (hostView, directorView, cinematic, replay) can be added without touching
 * the camera-mode registry contract. Each mode maps to a CameraMode implementation
 * registered in AudienceExperienceManager.
 */
export type ExperienceMode =
  | 'participant'
  | 'follow'
  | 'observer'
  // Future-ready (not yet registered):
  | 'hostView'
  | 'directorView'
  | 'cinematic'
  | 'replay';

/** A fixed "seat" the Observer can jump between. */
export interface Viewpoint {
  id: string;
  label: string;
  position: THREE.Vector3;
  /** World point the camera initially looks at. */
  lookAt: THREE.Vector3;
}

/**
 * A camera behavior. Modes own how the camera moves for the duration they're
 * active. enter()/exit() bracket activation so transitions can be smoothed.
 */
export interface CameraMode {
  readonly id: ExperienceMode;
  /** Called when this mode becomes active. `fromCamera` is the live camera state. */
  enter(): void;
  /** Called when leaving this mode. */
  exit(): void;
  /** Per-frame camera update. `inVR` lets modes defer to the headset when needed. */
  update(delta: number, inVR: boolean): void;
}
