import * as THREE from 'three';
import type { EmitterDebugSnapshot } from './cueRegistry/types';

/**
 * In-world debug overlay for active audio emitters — position, attenuation radii, volume.
 * Shown when the audio debug panel is open (Director, backtick toggle).
 */
export class AudioDebugVisualizer {
  private root: THREE.Group;
  private markers = new Map<string, THREE.Group>();
  private enabled = false;

  constructor(parent: THREE.Object3D) {
    this.root = new THREE.Group();
    this.root.name = 'audio-debug-visualizer';
    parent.add(this.root);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.root.visible = on;
    if (!on) this.clearMarkers();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  sync(emitters: EmitterDebugSnapshot[]): void {
    if (!this.enabled) return;

    const seen = new Set<string>();
    for (const e of emitters) {
      seen.add(e.id);
      let marker = this.markers.get(e.id);
      if (!marker) {
        marker = this.createMarker(e);
        this.markers.set(e.id, marker);
        this.root.add(marker);
      }
      this.updateMarker(marker, e);
    }

    for (const [id, marker] of this.markers) {
      if (!seen.has(id)) {
        this.root.remove(marker);
        this.disposeMarker(marker);
        this.markers.delete(id);
      }
    }
  }

  private createMarker(e: EmitterDebugSnapshot): THREE.Group {
    const g = new THREE.Group();
    g.name = `audio-emitter-${e.id}`;

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.85 })
    );
    core.name = 'core';
    g.add(core);

    const refRing = new THREE.Mesh(
      new THREE.RingGeometry(e.refDistance - 0.08, e.refDistance + 0.08, 48),
      new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    refRing.rotation.x = -Math.PI / 2;
    refRing.name = 'ref-ring';
    g.add(refRing);

    const maxRing = new THREE.Mesh(
      new THREE.RingGeometry(e.maxDistance - 0.12, e.maxDistance + 0.12, 64),
      new THREE.MeshBasicMaterial({ color: 0xff6644, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
    );
    maxRing.rotation.x = -Math.PI / 2;
    maxRing.name = 'max-ring';
    g.add(maxRing);

    return g;
  }

  private updateMarker(marker: THREE.Group, e: EmitterDebugSnapshot): void {
    marker.position.set(e.x, e.y, e.z);

    const core = marker.getObjectByName('core') as THREE.Mesh | undefined;
    if (core) {
      const mat = core.material as THREE.MeshBasicMaterial;
      mat.color.setHex(e.active ? 0x44aaff : 0x556677);
      mat.opacity = e.active ? 0.85 : 0.35;
      const scale = 0.6 + Math.min(1, e.volume) * 0.6;
      core.scale.setScalar(scale);
    }

    const refRing = marker.getObjectByName('ref-ring') as THREE.Mesh | undefined;
    if (refRing) {
      refRing.geometry.dispose();
      refRing.geometry = new THREE.RingGeometry(e.refDistance - 0.08, e.refDistance + 0.08, 48);
    }

    const maxRing = marker.getObjectByName('max-ring') as THREE.Mesh | undefined;
    if (maxRing) {
      maxRing.geometry.dispose();
      maxRing.geometry = new THREE.RingGeometry(e.maxDistance - 0.12, e.maxDistance + 0.12, 64);
      const mat = maxRing.material as THREE.MeshBasicMaterial;
      mat.opacity = e.distanceToListener > e.maxDistance ? 0.08 : 0.2;
    }
  }

  private clearMarkers(): void {
    for (const marker of this.markers.values()) {
      this.root.remove(marker);
      this.disposeMarker(marker);
    }
    this.markers.clear();
  }

  private disposeMarker(marker: THREE.Group): void {
    marker.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
