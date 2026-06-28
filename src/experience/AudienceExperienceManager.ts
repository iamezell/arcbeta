import * as THREE from 'three';
import { CameraMode, ExperienceMode, Viewpoint } from './types';
import { ParticipantCameraMode, FollowCameraMode, ObserverCameraMode } from './cameras';
import { FPSController } from '../fps-controller';
import { InputManager } from '../input/InputManager';
import { TouchControls } from '../input/TouchControls';
import { AudienceRegistry } from '../audience/AudienceRegistry';

export interface ExperienceManagerDeps {
  camera: THREE.Camera;
  fpsController: FPSController;
  input: InputManager;
  registry: AudienceRegistry;
  viewpoints: Viewpoint[];
  /** Touch overlay (mobile) so the manager can hide the joystick in passive modes. */
  getTouchControls: () => TouchControls | null;
  /** Whether the participant-mode camera bob should run (false when Reduce Motion). */
  shouldBob: () => boolean;
  bob: () => void;
}

/**
 * AudienceExperienceManager — the single owner of "how does this viewer
 * experience the show right now".
 *
 * It tracks the current ExperienceMode, swaps the active CameraMode, gates input,
 * and exposes the pose other clients should see for this viewer's avatar. It does
 * NOT duplicate rendering: every mode drives the one shared camera.
 *
 * Extending: register a new CameraMode in `buildModes()` and add its id to the
 * ExperienceMode union — the manager/menu plumbing stays the same. This is the
 * foundation for Host View, Director View, Cinematic and Replay cameras.
 */
export class AudienceExperienceManager {
  private deps: ExperienceManagerDeps;
  private modeId: ExperienceMode = 'participant';
  private current: CameraMode;

  private participantMode: ParticipantCameraMode;
  private followMode: FollowCameraMode;
  private observerMode: ObserverCameraMode;

  private followTargetId: string | null = null;
  private observerIndex = 0;

  // Frozen first-person pose, broadcast while the viewer is passively watching so
  // their avatar stays put for everyone else (and so returning is seamless).
  private lastPose = { position: new THREE.Vector3(), rotation: new THREE.Euler(0, 0, 0, 'YXZ') };

  private listeners = new Set<() => void>();

  constructor(deps: ExperienceManagerDeps) {
    this.deps = deps;

    this.participantMode = new ParticipantCameraMode({
      camera: deps.camera,
      fpsController: deps.fpsController,
      restoreRotation: () => this.lastPose.rotation,
      shouldBob: deps.shouldBob,
      bob: deps.bob,
    });

    this.followMode = new FollowCameraMode({
      camera: deps.camera,
      getTargetObject: () =>
        this.followTargetId ? this.deps.registry.get(this.followTargetId)?.object ?? null : null,
      onTargetLost: () => this.handleTargetLost(),
      drainTransient: () => this.drainTransient(),
    });

    this.observerMode = new ObserverCameraMode({
      camera: deps.camera,
      getLookDelta: () => this.deps.input.getLookDelta(),
    });

    this.current = this.participantMode;
    this.applyInputForMode();
  }

  // ---- Public API ----

  getMode(): ExperienceMode {
    return this.modeId;
  }

  getFollowTargetId(): string | null {
    return this.followTargetId;
  }

  getViewpoints(): Viewpoint[] {
    return this.deps.viewpoints;
  }

  getObserverViewpointId(): string | undefined {
    return this.deps.viewpoints[this.observerIndex]?.id;
  }

  setMode(mode: ExperienceMode): void {
    // Allow re-entry for follow/observer (target/seat may change); short-circuit
    // only for participant when already there.
    if (mode === this.modeId && mode === 'participant') return;

    this.current.exit();

    switch (mode) {
      case 'follow':
        this.current = this.followMode;
        break;
      case 'observer':
        this.current = this.observerMode;
        if (this.deps.viewpoints.length) {
          this.observerMode.setViewpoint(this.deps.viewpoints[this.observerIndex]);
        }
        break;
      case 'participant':
      default:
        this.current = this.participantMode;
        break;
    }

    this.modeId = mode === 'follow' || mode === 'observer' ? mode : 'participant';
    this.applyInputForMode();
    this.current.enter();
    this.emit();
  }

  followParticipant(participantId: string): void {
    this.followTargetId = participantId;
    if (this.modeId !== 'follow') {
      this.setMode('follow');
    } else {
      this.emit(); // target switched while already following — smooth, no re-enter
    }
  }

  stopFollowing(): void {
    this.followTargetId = null;
    this.setMode('participant');
  }

  setObserverCamera(viewpointId: string): void {
    const idx = this.deps.viewpoints.findIndex((v) => v.id === viewpointId);
    if (idx >= 0) this.observerIndex = idx;
    if (this.modeId !== 'observer') {
      this.setMode('observer');
    } else {
      this.observerMode.setViewpoint(this.deps.viewpoints[this.observerIndex]);
      this.emit();
    }
  }

  /** Drive the active camera. Call once per frame from the render loop. */
  update(delta: number, inVR: boolean): void {
    if (this.modeId === 'participant') {
      // Keep the broadcast/return pose current.
      this.lastPose.position.copy(this.deps.fpsController.getPosition());
      this.lastPose.rotation.copy(this.deps.fpsController.getRotation());
    }
    this.current.update(delta, inVR);
  }

  /** Pose other clients should render for this viewer's avatar. */
  getBroadcastPose(): { position: THREE.Vector3; rotation: THREE.Euler } {
    if (this.modeId === 'participant') {
      return {
        position: this.deps.fpsController.getPosition(),
        rotation: this.deps.fpsController.getRotation(),
      };
    }
    return { position: this.lastPose.position, rotation: this.lastPose.rotation };
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ---- Internal ----

  private handleTargetLost(): void {
    // Graceful fallback when the followed participant disconnects.
    this.followTargetId = null;
    this.setMode('observer');
  }

  private applyInputForMode(): void {
    const tc = this.deps.getTouchControls();
    // Follow drives the camera fully — hide the joystick/look overlay. Participant
    // and Observer keep it (movement / gentle look respectively).
    tc?.setVisible(this.modeId !== 'follow');
  }

  /** Discard accumulated look/jump so passive modes don't queue input. */
  private drainTransient(): void {
    this.deps.input.getLookDelta();
    this.deps.input.consumeJump();
  }

  private emit(): void {
    this.listeners.forEach((cb) => cb());
  }
}
