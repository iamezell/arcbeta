import * as THREE from 'three';
import { PhysicsManager } from './physics-manager';

export class FPSController {
  private camera: THREE.Camera;
  private domElement: HTMLElement;
  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private role: string;
  private eyeHeight: number;
  private physicsManager: PhysicsManager;
  private lastJumpTime = 0;
  private jumpCooldown = 500; // ms

  constructor(camera: THREE.Camera, domElement: HTMLElement, role: string = 'Actor') {
    this.camera = camera;
    this.domElement = domElement;
    this.role = role;
    this.eyeHeight = role === 'Director' ? 3.0 : 1.6;
    
    // Initialize physics manager
    this.physicsManager = new PhysicsManager();
    
    // Set initial camera position
    const initialPosition = new THREE.Vector3(0, this.eyeHeight, 0);
    this.camera.position.copy(initialPosition);
    
    // Wait for physics world to be ready, then create player body
    this.physicsManager.waitForWorld().then(() => {
      this.physicsManager.createPlayerBody(initialPosition);
      console.log('✅ Physics player body created');
    }).catch(err => {
      console.error('❌ Failed to create physics body:', err);
    });
    
    // Set rotation order to prevent gimbal lock
    // YXZ order: Y (yaw/horizontal) -> X (pitch/vertical) -> Z (roll)
    this.camera.rotation.order = 'YXZ';
    
    this.initListeners();
  }

  private initListeners(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          this.moveForward = true;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          this.moveLeft = true;
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.moveBackward = true;
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.moveRight = true;
          break;
        case 'Space':
          this.jump();
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          this.moveForward = false;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          this.moveLeft = false;
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.moveBackward = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.moveRight = false;
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Pointer lock for mouse look
    this.domElement.addEventListener('click', () => {
      this.domElement.requestPointerLock();
    });

    document.addEventListener('mousemove', (event: MouseEvent) => {
      if (document.pointerLockElement === this.domElement) {
        // Update yaw (horizontal rotation)
        this.camera.rotation.y -= event.movementX * 0.002;
        
        // Update pitch (vertical rotation)
        this.camera.rotation.x -= event.movementY * 0.002;
        
        // Clamp vertical rotation to prevent looking too far up/down
        this.camera.rotation.x = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, this.camera.rotation.x)
        );
        
        // Lock roll to prevent unwanted rotation
        this.camera.rotation.z = 0;
      }
    });
  }

  public update(delta: number): void {
    // Only update if physics world is ready
    if (!this.physicsManager.getWorld()) {
      // Use simple kinematic movement as fallback until physics is ready
      this.updateKinematicMovement(delta);
      return;
    }
    
    // Update physics world
    this.physicsManager.update(delta);
    
    // Apply movement based on current input
    this.physicsManager.applyMovement(
      this.moveForward,
      this.moveBackward,
      this.moveLeft,
      this.moveRight,
      this.camera.rotation
    );
    
    // Update camera position to follow physics body
    const physicsPosition = this.physicsManager.getPlayerPosition();
    if (physicsPosition.length() > 0 || physicsPosition.x !== 0 || physicsPosition.z !== 0) {
      this.camera.position.set(
        physicsPosition.x,
        physicsPosition.y + this.eyeHeight,
        physicsPosition.z
      );
    }
  }

  private updateKinematicMovement(delta: number): void {
    // Simple fallback movement until physics is ready
    const speed = this.role === 'Director' ? 6.0 : 4.0;
    const moveSpeed = speed * delta;

    const direction = new THREE.Vector3();
    if (this.moveForward) direction.z -= 1;
    if (this.moveBackward) direction.z += 1;
    if (this.moveLeft) direction.x -= 1;
    if (this.moveRight) direction.x += 1;

    if (direction.length() > 0) {
      direction.normalize();
      const euler = new THREE.Euler(0, this.camera.rotation.y, 0);
      direction.applyEuler(euler);

      this.camera.position.add(direction.multiplyScalar(moveSpeed));
    }
  }

  private jump(): void {
    const now = Date.now();
    if (now - this.lastJumpTime < this.jumpCooldown) return;
    
    if (this.physicsManager.jump()) {
      this.lastJumpTime = now;
    }
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
}

