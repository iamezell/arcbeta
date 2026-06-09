import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FPSController } from './fps-controller';
import { SocketClient } from './socket-client';
import { RoomController } from './room/RoomController';

export class ARCClient {
  private scene: THREE.Scene;
  private sceneWrapper: THREE.Group;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private fpsController: FPSController | null = null;
  private socketClient: SocketClient;
  private role: string;
  private playerName: string;
  private remotePlayers: Map<string, THREE.Group> = new Map();
  private remotePlayerPhysics: Map<string, { position: THREE.Vector3; rotation: THREE.Euler; velocity: THREE.Vector3 }> = new Map();
  private lastUpdateTime = 0;
  private updateInterval = 50; // 20 updates per second
  private physicsUpdateInterval = 16; // 60 FPS for physics
  private gltfLoader: GLTFLoader;
  private vrThumbstickDeadzone = 0.4;
  private hemisphereLight!: THREE.HemisphereLight;
  private roomController: RoomController | null = null;

  constructor(role: string, playerName: string) {
    this.role = role;
    this.playerName = playerName;
    this.clock = new THREE.Clock();
    this.socketClient = new SocketClient();
    this.gltfLoader = new GLTFLoader();

    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101014); // Dark interior
    this.sceneWrapper = new THREE.Group();
    this.scene.add(this.sceneWrapper);

    // Initialize camera (60° vertical FOV = natural FPS look; 75° can feel like a fishbowl)
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    // Add VR button
    document.body.appendChild(VRButton.createButton(this.renderer));

    this.setupScene();
    this.setupNetworking();
    this.setupFPSController();
    this.setupLocalPlayerModel();
    this.setupRoom();
    this.setupWindowResize();
    this.animate();
  }

  private setupRoom(): void {
    // The room is built entirely from server data once `roomState` arrives.
    this.roomController = new RoomController({
      camera: this.camera,
      socket: this.socketClient,
      sceneParent: this.sceneWrapper,
      roomLight: this.hemisphereLight,
      role: this.role,
    });
  }

  private async setupLocalPlayerModel(): Promise<void> {
    // Load the local player's avatar model based on their role
    try {
      await this.loadPlayerModel(null, this.role, this.playerName);
      console.log(`✅ Local player model loaded for ${this.role}`);
    } catch (error) {
      console.warn(`⚠️ Could not load local player model:`, error);
    }
  }

  private setupScene(): void {
    // All environment content goes in sceneWrapper so we can shift the world for VR locomotion
    const wrap = this.sceneWrapper;

    // Lighting (hemisphere light is dimmable by the Director via room_light state)
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    hemisphereLight.position.set(0, 20, 0);
    wrap.add(hemisphereLight);
    this.hemisphereLight = hemisphereLight;

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    wrap.add(directionalLight);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080,
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    wrap.add(ground);

    // Grid helper
    const gridHelper = new THREE.GridHelper(100, 100, 0x000000, 0x000000);
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    wrap.add(gridHelper);

    // Interactive room geometry is built by RoomController from server data.
  }

  private setupFPSController(): void {
    this.fpsController = new FPSController(
      this.camera,
      this.renderer.domElement,
      this.role
    );
  }

  private setupNetworking(): void {
    // Handle remote player movements
    this.socketClient.onPlayerMove((data: any) => {
      this.updateRemotePlayer(data.id, data.position, data.rotation);
    });

    // Handle user joined
    this.socketClient.onUserJoined((data: any) => {
      if (data.id === this.socketClient.getSocketId()) return;
      this.addRemotePlayer(data.id, data.name, data.role).catch(err => {
        console.error(`Failed to add remote player ${data.name}:`, err);
      });
    });

    // Handle user left
    this.socketClient.onUserLeft((data: any) => {
      this.removeRemotePlayer(data.id);
    });
  }

  private async addRemotePlayer(id: string, name: string, role: string): Promise<void> {
    if (this.remotePlayers.has(id)) return;

    const playerGroup = new THREE.Group();

    // Try to load model based on role
    await this.loadPlayerModel(playerGroup, role, name);

    this.sceneWrapper.add(playerGroup);
    this.remotePlayers.set(id, playerGroup);
    playerGroup.position.set(0, 1.6, 0);
    console.log(`➕ Added remote player: ${name} (${role})`);
  }

  private async loadPlayerModel(playerGroup: THREE.Group | null, role: string, name: string): Promise<void> {
    // For now we always use a simple square/cube placeholder for players
    if (playerGroup) {
      this.createPlaceholderAvatar(playerGroup, role, name);
    }

    return;
  }

  private addNameLabel(playerGroup: THREE.Group, name: string): void {
    // Name label
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, 256, 64);
    context.font = '24px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.fillText(name, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.y = 2.2;
    sprite.scale.set(2, 0.5, 1);
    playerGroup.add(sprite);
  }

  private createPlaceholderAvatar(playerGroup: THREE.Group, role: string, name: string): void {
    // Single cube "square" body
    const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: role === 'Director' ? 0xffaa00 : role === 'Actor' ? 0x00aaff : 0xaa00ff
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.5;
    body.castShadow = true;
    playerGroup.add(body);

    // Add name label
    this.addNameLabel(playerGroup, name);
  }

  private updateRemotePlayer(id: string, position: any, rotation: any): void {
    const player = this.remotePlayers.get(id);
    if (player) {
      // Store physics data for interpolation
      this.remotePlayerPhysics.set(id, {
        position: new THREE.Vector3(position.x, position.y, position.z),
        rotation: new THREE.Euler(rotation.x, rotation.y, rotation.z),
        velocity: new THREE.Vector3() // Will be calculated from position differences
      });
      
      // Apply immediate position update
      player.position.set(position.x, position.y, position.z);
      player.rotation.set(rotation.x, rotation.y, rotation.z);
    }
  }

  private removeRemotePlayer(id: string): void {
    const player = this.remotePlayers.get(id);
    if (player) {
      this.sceneWrapper.remove(player);
      this.remotePlayers.delete(id);
      console.log(`➖ Removed remote player: ${id}`);
    }
  }

  private setupWindowResize(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private animate = (): void => {
    this.renderer.setAnimationLoop((time: number, frame: XRFrame | undefined) => {
      const delta = this.clock.getDelta();
      const inVR = !!(frame && this.renderer.xr.isPresenting);

      // VR: read thumbstick and drive movement
      if (inVR && this.fpsController) {
        this.updateVRMovement();
      }

      // Update FPS controller (includes physics)
      if (this.fpsController) {
        this.fpsController.update(delta);
        if (!inVR) this.addCameraBob();
      }

      // VR: shift world so player position matches physics (camera is driven by headset)
      if (inVR && this.fpsController) {
        const pos = this.fpsController.getPosition();
        this.sceneWrapper.position.set(-pos.x, -pos.y, -pos.z);
      } else {
        this.sceneWrapper.position.set(0, 0, 0);
      }

      // Send position updates to server (throttled)
      const now = Date.now();
      if (now - this.lastUpdateTime > this.updateInterval) {
        this.sendPositionUpdate();
        this.lastUpdateTime = now;
      }

      // Interpolate remote players for smooth movement
      this.interpolateRemotePlayers(delta);

      // Raycast for interactable room objects (desktop focus for the MVP)
      if (this.roomController && !inVR) {
        this.roomController.update();
      }

      // Render scene
      this.renderer.render(this.scene, this.camera);
    });
  };

  private updateVRMovement(): void {
    const session = this.renderer.xr.getSession();
    if (!session || !this.fpsController) return;
    const sources = session.getInputSources();
    const dz = this.vrThumbstickDeadzone;
    let forward = false;
    let backward = false;
    let left = false;
    let right = false;
    // Prefer left controller for movement; fall back to any controller with a gamepad
    const leftSource = sources.find(s => s.hand === 'left' && s.gamepad && s.gamepad.axes.length >= 2);
    const moveSource = leftSource ?? sources.find(s => s.gamepad && s.gamepad.axes.length >= 2);
    if (moveSource?.gamepad) {
      const gp = moveSource.gamepad;
      const x = gp.axes[0] ?? 0;
      const y = gp.axes[1] ?? 0;
      if (x < -dz) left = true;
      if (x > dz) right = true;
      if (y < -dz) forward = true;
      if (y > dz) backward = true;
    }
    this.fpsController.setVRMovement(forward, backward, left, right);
  }

  private sendPositionUpdate(): void {
    if (this.fpsController) {
      const position = this.fpsController.getPosition();
      const rotation = this.fpsController.getRotation();
      this.socketClient.sendPlayerMove(
        { x: position.x, y: position.y, z: position.z },
        { x: rotation.x, y: rotation.y, z: rotation.z }
      );
    }
  }

  private addCameraBob(): void {
    if (!this.fpsController) return;
    
    // Add subtle camera bob when moving and grounded
    if (this.fpsController.isGrounded()) {
      // Simple bob effect based on movement
      const bobIntensity = 0.01;
      const bobSpeed = 0.15;
      const time = this.clock.getElapsedTime();
      
      // Check if player is moving (this would need to be tracked in FPSController)
      const bob = Math.sin(time * bobSpeed) * bobIntensity;
      this.camera.position.y += bob * 0.1; // Very subtle effect
    }
  }

  private interpolateRemotePlayers(delta: number): void {
    // Smooth interpolation for remote players
    this.remotePlayers.forEach((player, id) => {
      const physicsData = this.remotePlayerPhysics.get(id);
      if (physicsData) {
        // Interpolate position
        const targetPosition = physicsData.position;
        const currentPosition = player.position;
        
        currentPosition.lerp(targetPosition, delta * 10); // Smooth interpolation
        
        // Interpolate rotation
        const targetRotation = physicsData.rotation;
        const currentRotation = player.rotation;
        
        currentRotation.x = THREE.MathUtils.lerp(currentRotation.x, targetRotation.x, delta * 10);
        currentRotation.y = THREE.MathUtils.lerp(currentRotation.y, targetRotation.y, delta * 10);
        currentRotation.z = THREE.MathUtils.lerp(currentRotation.z, targetRotation.z, delta * 10);
      }
    });
  }

  public getSocketClient(): SocketClient {
    return this.socketClient;
  }

  // Model loading utilities
  public async loadModel(modelPath: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        modelPath,
        (gltf) => {
          const model = gltf.scene;
          // Enable shadows for loaded models
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          resolve(model);
        },
        (progress) => {
          console.log(`Loading ${modelPath}: ${(progress.loaded / progress.total * 100)}%`);
        },
        (error) => {
          console.error(`Error loading model ${modelPath}:`, error);
          reject(error);
        }
      );
    });
  }

  public async loadEnvironmentModel(modelPath: string, position?: THREE.Vector3, rotation?: THREE.Euler): Promise<void> {
    try {
      const model = await this.loadModel(modelPath);
      
      if (position) model.position.copy(position);
      if (rotation) model.rotation.copy(rotation);
      
      this.sceneWrapper.add(model);
      console.log(`✅ Loaded environment model: ${modelPath}`);
    } catch (error) {
      console.error(`❌ Failed to load environment model: ${modelPath}`, error);
    }
  }
}

// Prevent tree-shaking by using the export
(window as any).ARCClient = ARCClient;

