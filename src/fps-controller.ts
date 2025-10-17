import * as THREE from 'three';

export class FPSController {
  private camera: THREE.Camera;
  private domElement: HTMLElement;
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private canJump = false;
  private yVelocity = 0;
  private role: string;
  private eyeHeight: number;

  constructor(camera: THREE.Camera, domElement: HTMLElement, role: string = 'Actor') {
    this.camera = camera;
    this.domElement = domElement;
    this.role = role;
    this.eyeHeight = role === 'Director' ? 3.0 : 1.6;
    this.camera.position.y = this.eyeHeight;
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
          if (this.canJump) {
            this.yVelocity = 0.15;
            this.canJump = false;
          }
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
        this.camera.rotation.y -= event.movementX * 0.002;
        this.camera.rotation.x -= event.movementY * 0.002;
        // Clamp vertical rotation
        this.camera.rotation.x = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, this.camera.rotation.x)
        );
      }
    });
  }

  public update(delta: number): void {
    // Calculate movement direction
    this.direction.set(0, 0, 0);
    if (this.moveForward) this.direction.z -= 1;
    if (this.moveBackward) this.direction.z += 1;
    if (this.moveLeft) this.direction.x -= 1;
    if (this.moveRight) this.direction.x += 1;

    this.direction.normalize();

    // Apply rotation to direction
    const euler = new THREE.Euler(0, this.camera.rotation.y, 0);
    this.direction.applyEuler(euler);

    // Update velocity
    const speed = this.role === 'Director' ? 5.0 : 3.0;
    this.velocity.x = this.direction.x * speed * delta;
    this.velocity.z = this.direction.z * speed * delta;
    this.velocity.y += this.yVelocity;

    // Apply gravity
    this.yVelocity -= delta * 0.5;

    // Update camera position
    this.camera.position.x += this.velocity.x;
    this.camera.position.z += this.velocity.z;
    this.camera.position.y += this.velocity.y;

    // Ground collision
    if (this.camera.position.y < this.eyeHeight) {
      this.yVelocity = 0;
      this.camera.position.y = this.eyeHeight;
      this.canJump = true;
    }

    // Damping
    this.velocity.multiplyScalar(0.9);
  }

  public getPosition(): THREE.Vector3 {
    return this.camera.position.clone();
  }

  public getRotation(): THREE.Euler {
    return this.camera.rotation.clone();
  }
}

