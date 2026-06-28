import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { ACT1_GROUND } from './show/act1Ground';

// Initialize Rapier in the module
let rapierInitialized = false;
let rapierInitPromise: Promise<void> | null = null;

const initRapier = async (): Promise<void> => {
  if (rapierInitialized) return;
  if (rapierInitPromise) return rapierInitPromise;
  
  rapierInitPromise = (async () => {
    // For compat build, we need to call init()
    if (typeof RAPIER.init === 'function') {
      await RAPIER.init();
    }
    rapierInitialized = true;
  })();
  
  return rapierInitPromise;
};

export class PhysicsManager {
  private world: RAPIER.World | null = null;
  private playerBody: RAPIER.RigidBody | null = null;
  private playerCollider: RAPIER.Collider | null = null;
  private groundBody: RAPIER.RigidBody | null = null;
  private groundCollider: RAPIER.Collider | null = null;
  private isGrounded = false;
  private lastGroundedTime = 0;
  private worldReady = false;

  constructor() {
    // Initialize world asynchronously
    this.initWorld();
  }

  private async initWorld(): Promise<void> {
    // Wait for Rapier to initialize
    await initRapier();
    
    // Create the physics world
    // Stronger gravity for snappier, less floaty movement
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    
    // Create ground plane
    this.createGround();
    
    this.worldReady = true;
  }

  public async waitForWorld(): Promise<void> {
    if (this.worldReady) return;
    
    // Wait up to 5 seconds for world to be ready
    let attempts = 0;
    while (!this.worldReady && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!this.worldReady) {
      console.warn('Physics world initialization timeout');
    }
  }

  private createGround(): void {
    if (!this.world) return;

    const { centerZ, halfX, halfZ } = ACT1_GROUND;

    const groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, -0.5, centerZ);
    this.groundBody = this.world.createRigidBody(groundBodyDesc);

    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(halfX, 0.5, halfZ);
    this.groundCollider = this.world.createCollider(groundColliderDesc, this.groundBody);
  }

  public createPlayerBody(initialPosition: THREE.Vector3): void {
    if (!this.world) return;
    
    // Create player rigid body
    const playerBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
      // Near-zero damping so motion feels responsive (not "underwater")
      .setLinearDamping(0.02)
      .setAngularDamping(0.5);
    
    this.playerBody = this.world.createRigidBody(playerBodyDesc);
    
    // Create capsule collider for player (height: 1.8, radius: 0.4)
    const playerColliderDesc = RAPIER.ColliderDesc.capsule(0.9, 0.4)
      .setFriction(0.3)
      .setRestitution(0.1);
    
    this.playerCollider = this.world.createCollider(playerColliderDesc, this.playerBody);
  }

  public update(deltaTime: number): void {
    if (!this.world) return;
    
    // Clamp delta time to prevent large jumps in VR
    const clampedDelta = Math.min(deltaTime, 1/30); // Max 30 FPS physics
    
    // Step the physics world
    this.world.timestep = clampedDelta;
    this.world.step();
    
    // Check if player is grounded
    this.checkGrounded();
  }

  private checkGrounded(): void {
    if (!this.playerBody || !this.playerCollider || !this.world) return;

    // Simple ground detection using player position
    // Ground plane center is at y = -0.5 with height 0.5, so top is at y = 0
    // Player capsule: radius 0.4, half-height 0.9
    // Bottom of capsule = playerPos.y - 0.9
    const playerPos = this.playerBody.translation();
    const playerBottom = playerPos.y - 0.9;
    const groundTop = 0.0; // Top of ground plane (center at -0.5, height 0.5)
    
    // Player is grounded if bottom of capsule is close to or touching ground
    // Use tolerance of 0.2 to account for physics settling
    this.isGrounded = (playerBottom <= groundTop + 0.2);
    
    if (this.isGrounded) {
      this.lastGroundedTime = Date.now();
    }
  }

  public applyMovement(forward: boolean, backward: boolean, left: boolean, right: boolean, cameraRotation: THREE.Euler): void {
    // Boolean (digital) input maps onto the analog path at full deflection.
    const strafe = (right ? 1 : 0) - (left ? 1 : 0);
    const fwd = (forward ? 1 : 0) - (backward ? 1 : 0);
    this.applyMovementVector(strafe, fwd, cameraRotation);
  }

  /**
   * Analog movement. strafe/forward are -1..1 (joystick or thumbstick); their
   * combined magnitude scales speed so a half-pushed stick walks, full sprints.
   * x = strafe (+right), forward = +1 moves toward where the camera looks (-Z).
   */
  public applyMovementVector(strafe: number, forward: number, cameraRotation: THREE.Euler): void {
    if (!this.playerBody) return;

    // Fast, arena-FPS style move speed
    const moveSpeed = 10.0;
    const direction = new THREE.Vector3(strafe, 0, -forward);
    const magnitude = Math.min(1, direction.length());

    if (magnitude > 0.0001) {
      direction.normalize();

      // Apply camera yaw so movement is relative to where the player faces.
      const euler = new THREE.Euler(0, cameraRotation.y, 0);
      direction.applyEuler(euler);

      // Directly control horizontal velocity (Quake/Doom style), scaled by deflection.
      const speed = moveSpeed * magnitude;
      const currentVel = this.playerBody.linvel();
      this.playerBody.setLinvel(
        {
          x: direction.x * speed,
          y: currentVel.y, // Preserve vertical velocity for jumping/falling
          z: direction.z * speed
        },
        true
      );
    } else {
      // Simple friction when not pressing movement keys
      const currentVel = this.playerBody.linvel();
      this.playerBody.setLinvel(
        {
          x: currentVel.x * 0.85,
          y: currentVel.y,
          z: currentVel.z * 0.85
        },
        true
      );
    }
  }

  public jump(): boolean {
    if (!this.playerBody || !this.isGrounded) return false;

    // Strong, snappy jump to match faster gravity/movement
    const jumpForce = { x: 0, y: 12.0, z: 0 };
    this.playerBody.applyImpulse(jumpForce, true);

    this.isGrounded = false;
    this.lastGroundedTime = Date.now();
    return true;
  }

  public getPlayerPosition(): THREE.Vector3 {
    if (!this.playerBody) return new THREE.Vector3();
    
    const pos = this.playerBody.translation();
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }

  public getPlayerRotation(): THREE.Euler {
    if (!this.playerBody) return new THREE.Euler();
    
    const rot = this.playerBody.rotation();
    return new THREE.Euler(rot.x, rot.y, rot.z);
  }

  public setPlayerPosition(position: THREE.Vector3): void {
    if (!this.playerBody) return;
    
    this.playerBody.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
  }

  public setPlayerRotation(rotation: THREE.Euler): void {
    if (!this.playerBody) return;
    
    this.playerBody.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z }, true);
  }

  public isPlayerGrounded(): boolean {
    return this.isGrounded;
  }

  public getWorld(): RAPIER.World | null {
    return this.world;
  }

  public destroy(): void {
    if (this.world) {
      if (this.playerBody) {
        this.world.removeRigidBody(this.playerBody);
      }
      if (this.groundBody) {
        this.world.removeRigidBody(this.groundBody);
      }
    }
  }
}
