import * as THREE from 'three';
import { PhysicsManager } from './physics-manager';
import { InputManager } from './input/InputManager';
import {
  PLAYER_BODY_CENTER_Y,
  cameraOffsetFromGroundEye,
  eyeHeightForRole,
} from './player/playerScale';

export class FPSController {
  private camera: THREE.Camera;
  private domElement: HTMLElement;
  private input: InputManager;
  private role: string;
  private eyeHeightFromGround: number;
  /** Added to physics body Y to place the camera at eye level (not full eye height). */
  private cameraOffsetY: number;
  private physicsManager: PhysicsManager;
  private lastJumpTime = 0;
  private jumpCooldown = 500; // ms
  private readonly maxPitch = Math.PI / 2 - 0.05;

  constructor(camera: THREE.Camera, domElement: HTMLElement, role: string = 'Actor', input: InputManager) {
    this.camera = camera;
    this.domElement = domElement;
    this.role = role;
    this.input = input;
    this.eyeHeightFromGround = eyeHeightForRole(role);
    this.cameraOffsetY = cameraOffsetFromGroundEye(this.eyeHeightFromGround);

    // Initialize physics manager
    this.physicsManager = new PhysicsManager();

    // Camera at eye height; physics capsule center sits lower (see playerScale.ts).
    const initialPosition = new THREE.Vector3(0, this.eyeHeightFromGround, 0);
    this.camera.position.copy(initialPosition);

    // Wait for physics world to be ready, then create player body
    this.physicsManager.waitForWorld().then(() => {
      this.physicsManager.createPlayerBody(
        new THREE.Vector3(0, PLAYER_BODY_CENTER_Y, 0)
      );
      console.log('✅ Physics player body created');
    }).catch(err => {
      console.error('❌ Failed to create physics body:', err);
    });
    
    // Set rotation order to prevent gimbal lock
    // YXZ order: Y (yaw/horizontal) -> X (pitch/vertical) -> Z (roll)
    this.camera.rotation.order = 'YXZ';
  }

  /** Apply accumulated look delta (mouse / touch / gyro) to the camera. */
  private applyLook(): void {
    const look = this.input.getLookDelta();
    if (look.x === 0 && look.y === 0) return;
    this.camera.rotation.y -= look.x; // yaw
    this.camera.rotation.x -= look.y; // pitch
    // Clamp pitch so the camera never flips over.
    this.camera.rotation.x = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.camera.rotation.x));
    this.camera.rotation.z = 0; // lock roll
  }

  public update(delta: number): void {
    // Look is the same regardless of physics readiness.
    this.applyLook();
    if (this.input.consumeJump()) this.jump();

    const move = this.input.getMoveVector();

    // Only update if physics world is ready
    if (!this.physicsManager.getWorld()) {
      // Use simple kinematic movement as fallback until physics is ready
      this.updateKinematicMovement(delta, move.x, move.y);
      return;
    }
    
    // Update physics world
    this.physicsManager.update(delta);
    
    // Apply analog movement (works for keyboard, joystick, and VR thumbstick).
    this.physicsManager.applyMovementVector(move.x, move.y, this.camera.rotation);
    
    // Update camera position to follow physics body
    const physicsPosition = this.physicsManager.getPlayerPosition();
    this.camera.position.set(
      physicsPosition.x,
      physicsPosition.y + this.cameraOffsetY,
      physicsPosition.z
    );
  }

  private updateKinematicMovement(delta: number, strafe: number, forward: number): void {
    // Simple fallback movement until physics is ready
    const speed = this.role === 'Director' ? 6.0 : 4.0;
    const moveSpeed = speed * delta;

    const direction = new THREE.Vector3(strafe, 0, -forward);
    if (direction.length() > 0.0001) {
      const magnitude = Math.min(1, direction.length());
      direction.normalize();
      const euler = new THREE.Euler(0, this.camera.rotation.y, 0);
      direction.applyEuler(euler);
      this.camera.position.add(direction.multiplyScalar(moveSpeed * magnitude));
    }
  }

  private jump(): void {
    const now = Date.now();
    if (now - this.lastJumpTime < this.jumpCooldown) return;
    
    if (this.physicsManager.jump()) {
      this.lastJumpTime = now;
    }
  }

  public resetToSpawn(): void {
    this.camera.position.set(0, this.eyeHeightFromGround, 0);
    this.camera.rotation.set(0, 0, 0);
    this.physicsManager.setPlayerPosition(new THREE.Vector3(0, PLAYER_BODY_CENTER_Y, 0));
    this.physicsManager.setPlayerRotation(new THREE.Euler(0, 0, 0));
  }

  // Move the player to a specific spot on the floor with an optional heading.
  // Used by the show system to drop players into a scene's spawn position.
  public setPosition(x: number, z: number, yaw: number = 0): void {
    this.camera.rotation.set(0, yaw, 0);
    // Physics body = capsule center; camera = eye height from ground.
    this.physicsManager.setPlayerPosition(new THREE.Vector3(x, PLAYER_BODY_CENTER_Y, z));
    this.camera.position.set(x, this.eyeHeightFromGround, z);
    this.physicsManager.setPlayerRotation(new THREE.Euler(0, 0, 0));
  }

  public getPosition(): THREE.Vector3 {
    return this.physicsManager.getPlayerPosition();
  }

  public getRotation(): THREE.Euler {
    return this.camera.rotation.clone();
  }

  public isGrounded(): boolean {
    return this.physicsManager.isPlayerGrounded();
  }

  public getPhysicsManager(): PhysicsManager {
    return this.physicsManager;
  }

  /**
   * Set movement from VR controller thumbstick (e.g. from gamepad axes).
   * Routes through the same InputManager as every other source so the movement
   * pipeline stays unified.
   */
  public setVRMovement(forward: boolean, backward: boolean, left: boolean, right: boolean): void {
    const x = (right ? 1 : 0) - (left ? 1 : 0);
    const y = (forward ? 1 : 0) - (backward ? 1 : 0);
    this.input.setVRMove(x, y);
  }
}

