/**
 * Act 1 walkable ground bounds — shared by the visible mud plane and the
 * Rapier floor collider. Keep in sync when the commune layout moves deeper.
 *
 * Covers: bus spawn (z≈12) through back dorms / water tower (z≈-172).
 */
export const ACT1_GROUND = {
  centerZ: -55,
  halfX: 55,
  halfZ: 130,
  /** Visual plane width (X) and depth (Z) in meters. */
  planeWidth: 120,
  planeDepth: 260,
} as const;
