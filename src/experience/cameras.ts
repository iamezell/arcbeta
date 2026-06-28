import * as THREE from 'three';
import { CameraMode, ExperienceMode, Viewpoint } from './types';
import { FPSController } from '../fps-controller';
import { PLAYER_EYE_OFFSET_FROM_BODY } from '../player/playerScale';

/**
 * Camera mode implementations for the Audience Experience system.
 *
 * Each mode only changes how the single shared camera behaves — it never
 * duplicates rendering or the scene. Adding a future mode (cinematic, replay,
 * hostView) means implementing CameraMode and registering it in the manager.
 */

const clampDelta = (d: number): number => Math.min(d, 0.1); // guard tab-refocus spikes
const smoothing = (k: number, delta: number): number => 1 - Math.exp(-k * clampDelta(delta));
const MAX_PITCH = Math.PI / 2 - 0.05;

/** PARTICIPANT — normal first-person controls via the existing FPSController. */
export class ParticipantCameraMode implements CameraMode {
  readonly id: ExperienceMode = 'participant';

  constructor(
    private deps: {
      camera: THREE.Camera;
      fpsController: FPSController;
      restoreRotation: () => THREE.Euler | null;
      shouldBob: () => boolean;
      bob: () => void;
    }
  ) {}

  enter(): void {
    // Returning from follow/observer: restore the last first-person heading so the
    // view doesn't snap to wherever the spectator camera was pointing.
    const rot = this.deps.restoreRotation();
    if (rot) {
      this.deps.camera.rotation.copy(rot);
    }
  }

  exit(): void {}

  update(delta: number, inVR: boolean): void {
    this.deps.fpsController.update(delta);
    if (!inVR && this.deps.shouldBob()) this.deps.bob();
  }
}

/** FOLLOW — third-person camera that smoothly trails another participant. */
export class FollowCameraMode implements CameraMode {
  readonly id: ExperienceMode = 'follow';

  private targetPos = new THREE.Vector3();
  private desiredPos = new THREE.Vector3();
  private lookPoint = new THREE.Vector3();
  private mtx = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    private deps: {
      camera: THREE.Camera;
      getTargetObject: () => THREE.Object3D | null;
      onTargetLost: () => void;
      drainTransient: () => void;
      distance?: number;
      height?: number;
      headHeight?: number;
    }
  ) {}

  enter(): void {}
  exit(): void {}

  update(delta: number): void {
    // Ignore look/jump input while the camera is driven automatically.
    this.deps.drainTransient();

    const obj = this.deps.getTargetObject();
    if (!obj) {
      this.deps.onTargetLost();
      return;
    }

    obj.getWorldPosition(this.targetPos);
    const yaw = obj.rotation.y;
    const headHeight = this.deps.headHeight ?? PLAYER_EYE_OFFSET_FROM_BODY;
    const dist = this.deps.distance ?? 3.4;
    const height = this.deps.height ?? 1.4;
    const head = this.targetPos.y + headHeight;

    // Sit behind the target relative to its facing (forward is -Z rotated by yaw).
    const behindX = Math.sin(yaw);
    const behindZ = Math.cos(yaw);
    this.desiredPos.set(
      this.targetPos.x + behindX * dist,
      head + height,
      this.targetPos.z + behindZ * dist
    );
    this.lookPoint.set(this.targetPos.x, head, this.targetPos.z);

    // Exponential smoothing on both position and orientation = slight lag, no jitter.
    const a = smoothing(6, delta);
    this.deps.camera.position.lerp(this.desiredPos, a);
    this.mtx.lookAt(this.deps.camera.position, this.lookPoint, this.up);
    this.quat.setFromRotationMatrix(this.mtx);
    this.deps.camera.quaternion.slerp(this.quat, a);
  }
}

/** OBSERVER — fixed "seats" you can hop between, with gentle optional free-look. */
export class ObserverCameraMode implements CameraMode {
  readonly id: ExperienceMode = 'observer';

  private desiredPos = new THREE.Vector3();
  private targetQuat = new THREE.Quaternion();
  private mtx = new THREE.Matrix4();
  private up = new THREE.Vector3(0, 1, 0);
  private transitioning = false;
  private viewpoint: Viewpoint | null = null;

  constructor(
    private deps: {
      camera: THREE.Camera;
      getLookDelta: () => { x: number; y: number };
    }
  ) {}

  setViewpoint(vp: Viewpoint): void {
    this.viewpoint = vp;
    this.desiredPos.copy(vp.position);
    this.mtx.lookAt(vp.position, vp.lookAt, this.up);
    this.targetQuat.setFromRotationMatrix(this.mtx);
    this.transitioning = true;
  }

  enter(): void {
    if (this.viewpoint) this.transitioning = true;
  }

  exit(): void {}

  update(delta: number): void {
    const cam = this.deps.camera;
    if (this.transitioning) {
      const a = smoothing(5, delta);
      cam.position.lerp(this.desiredPos, a);
      cam.quaternion.slerp(this.targetQuat, a);
      if (cam.position.distanceTo(this.desiredPos) < 0.02) {
        cam.position.copy(this.desiredPos);
        cam.quaternion.copy(this.targetQuat);
        this.transitioning = false;
      }
      return;
    }

    // Settled in the seat: hold position, allow gentle look-around.
    cam.position.copy(this.desiredPos);
    const d = this.deps.getLookDelta();
    if (d.x !== 0 || d.y !== 0) {
      cam.rotation.y -= d.x;
      cam.rotation.x -= d.y;
      cam.rotation.x = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cam.rotation.x));
      cam.rotation.z = 0;
    }
  }
}
