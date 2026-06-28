/**
 * Human-scale constants shared by the FPS camera, physics capsule, and
 * placeholder player avatars. Matches ARC Dummy adult height (1.8m).
 */

export const ADULT_HEIGHT = 1.8;

/** Eye line from the floor for a standing 1.8m adult (~90%). */
export const PLAYER_EYE_HEIGHT = 1.63;

/** Elevated director/host view (still human-ish, not flycam). */
export const DIRECTOR_EYE_HEIGHT = 2.5;

/** Rapier capsule half-height (see PhysicsManager.createPlayerBody). */
export const PLAYER_CAPSULE_HALF_HEIGHT = 0.9;

export const PLAYER_CAPSULE_RADIUS = 0.4;

/** Y position of the physics body center when standing on y=0 ground. */
export const PLAYER_BODY_CENTER_Y = PLAYER_CAPSULE_HALF_HEIGHT;

/** Camera Y offset from physics body center → eyes at PLAYER_EYE_HEIGHT when grounded. */
export const PLAYER_EYE_OFFSET_FROM_BODY = PLAYER_EYE_HEIGHT - PLAYER_BODY_CENTER_Y;

export function cameraOffsetFromGroundEye(eyeHeightFromGround: number): number {
  return eyeHeightFromGround - PLAYER_BODY_CENTER_Y;
}

export function eyeHeightForRole(role: string): number {
  return role === 'Director' ? DIRECTOR_EYE_HEIGHT : PLAYER_EYE_HEIGHT;
}
