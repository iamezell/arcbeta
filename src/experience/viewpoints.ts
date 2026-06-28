import * as THREE from 'three';
import { Viewpoint } from './types';

/**
 * Predefined Observer "seats" for the Act 1 Storm Road scene.
 *
 * Coordinates are anchored to real scene landmarks (see ShowController):
 *   - Bus group   at (-5, 0, 6)
 *   - Commune gate at (0, 0, -75), crossbar ~y7.5
 *   - Road runs along -Z; player spawns near (2.5, 12)
 *
 * These are deliberately data-driven and easy to tune per scene. When ARC grows
 * multiple scenes, swap this for a per-scene lookup keyed by SceneId.
 */
export const ACT1_VIEWPOINTS: Viewpoint[] = [
  {
    id: 'gate',
    label: 'Gate',
    position: new THREE.Vector3(8, 4, -58),
    lookAt: new THREE.Vector3(0, 6, -75),
  },
  {
    id: 'forest',
    label: 'Forest',
    position: new THREE.Vector3(22, 5, -22),
    lookAt: new THREE.Vector3(0, 1.5, -30),
  },
  {
    id: 'church',
    label: 'Church',
    position: new THREE.Vector3(-14, 6, -2),
    lookAt: new THREE.Vector3(0, 2, -52),
  },
  {
    id: 'bus',
    label: 'Bus',
    position: new THREE.Vector3(-11, 3, 13),
    lookAt: new THREE.Vector3(-5, 2, 6),
  },
];

export function getDefaultViewpoints(): Viewpoint[] {
  return ACT1_VIEWPOINTS;
}
