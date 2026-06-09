import * as THREE from 'three';
import { GeometryDef, WireObject, WireRoom } from './types';

// Builds and updates the greybox room purely from server data. It owns no
// gameplay logic — it renders object geometry and reflects authoritative state
// through colour, and exposes interactable meshes for raycasting.

export interface InteractableHandle {
  objectId: string;
  mesh: THREE.Mesh;
}

const HIGHLIGHT_EMISSIVE = 0x333311;

export class RoomRenderer {
  private parent: THREE.Object3D;
  private group: THREE.Group = new THREE.Group();
  private meshes: Map<string, THREE.Mesh> = new Map();
  private objectDefs: Map<string, WireObject> = new Map();
  private highlighted: THREE.Mesh | null = null;
  // Light the Director can switch off. Supplied by the host so we can dim the room.
  private roomLight?: THREE.HemisphereLight;

  constructor(parent: THREE.Object3D, roomLight?: THREE.HemisphereLight) {
    this.parent = parent;
    this.roomLight = roomLight;
    this.parent.add(this.group);
  }

  build(room: WireRoom, states: Record<string, string>): void {
    this.clear();

    // Static greybox shell.
    for (const geo of room.scenery) {
      const mesh = this.makeMesh(geo);
      mesh.userData.interactive = false;
      this.group.add(mesh);
    }

    // Interactive objects.
    for (const obj of room.objects) {
      this.objectDefs.set(obj.id, obj);
      const mesh = this.makeMesh(obj.geometry);
      mesh.userData.interactive = obj.interactions.length > 0;
      mesh.userData.objectId = obj.id;
      this.group.add(mesh);
      this.meshes.set(obj.id, mesh);

      const state = states[obj.id];
      if (state) this.applyState(obj.id, state);
    }
  }

  private makeMesh(geo: GeometryDef): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    switch (geo.shape) {
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(geo.size.x, geo.size.x, geo.size.y, 24);
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(geo.size.x, geo.size.y);
        break;
      case 'box':
      default:
        geometry = new THREE.BoxGeometry(geo.size.x, geo.size.y, geo.size.z);
        break;
    }
    const material = new THREE.MeshStandardMaterial({ color: geo.color, roughness: 0.85, metalness: 0.1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(geo.position.x, geo.position.y, geo.position.z);
    if (geo.rotationY) mesh.rotation.y = geo.rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Remember the base colour so highlight can be removed cleanly.
    mesh.userData.baseColor = geo.color;
    return mesh;
  }

  // Reflect an authoritative state change in the greybox visuals.
  applyState(objectId: string, state: string): void {
    const mesh = this.meshes.get(objectId);
    const def = this.objectDefs.get(objectId);
    if (!mesh || !def) {
      // The room light is special: it isn't always a visible mesh interaction.
      if (objectId === 'room_light') this.setRoomLight(state !== 'off');
      return;
    }

    const color = def.colorByState?.[state];
    if (color !== undefined) {
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(color);
      mesh.userData.baseColor = color;
    }

    // Opened things read as "out of the way": drop opacity.
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const opened = state === 'open';
    mat.transparent = opened;
    mat.opacity = opened ? 0.35 : 1;

    if (objectId === 'room_light') this.setRoomLight(state !== 'off');
  }

  private setRoomLight(on: boolean): void {
    if (this.roomLight) this.roomLight.intensity = on ? 1.5 : 0.15;
  }

  getInteractableMeshes(): THREE.Mesh[] {
    return Array.from(this.meshes.values()).filter((m) => m.userData.interactive);
  }

  getObjectDef(objectId: string): WireObject | undefined {
    return this.objectDefs.get(objectId);
  }

  highlight(mesh: THREE.Mesh | null): void {
    if (this.highlighted === mesh) return;
    if (this.highlighted) {
      (this.highlighted.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
    }
    if (mesh) {
      (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(HIGHLIGHT_EMISSIVE);
    }
    this.highlighted = mesh;
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose?.();
    }
    this.meshes.clear();
    this.objectDefs.clear();
    this.highlighted = null;
  }
}
