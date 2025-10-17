import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FPSController } from './fps-controller';
import { SocketClient } from './socket-client';

export class ARCClient {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private fpsController: FPSController | null = null;
  private socketClient: SocketClient;
  private role: string;
  private playerName: string;
  private remotePlayers: Map<string, THREE.Group> = new Map();
  private lastUpdateTime = 0;
  private updateInterval = 50; // 20 updates per second

  constructor(role: string, playerName: string) {
    this.role = role;
    this.playerName = playerName;
    this.clock = new THREE.Clock();
    this.socketClient = new SocketClient();

    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue

    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      75,
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
    this.setupWindowResize();
    this.animate();
  }

  private setupScene(): void {
    // Lighting
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    hemisphereLight.position.set(0, 20, 0);
    this.scene.add(hemisphereLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

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
    this.scene.add(ground);

    // Grid helper
    const gridHelper = new THREE.GridHelper(100, 100, 0x000000, 0x000000);
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    this.scene.add(gridHelper);

    // Add some reference objects
    const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
    const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(5, 1, -5);
    cube.castShadow = true;
    this.scene.add(cube);

    const sphereGeometry = new THREE.SphereGeometry(1.5, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(-5, 1.5, -5);
    sphere.castShadow = true;
    this.scene.add(sphere);
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
      this.addRemotePlayer(data.id, data.name, data.role);
    });

    // Handle user left
    this.socketClient.onUserLeft((data: any) => {
      this.removeRemotePlayer(data.id);
    });
  }

  private addRemotePlayer(id: string, name: string, role: string): void {
    if (this.remotePlayers.has(id)) return;

    // Create a placeholder avatar (simple capsule)
    const playerGroup = new THREE.Group();

    // Body
    const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1.2, 4, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: role === 'Director' ? 0xffaa00 : role === 'Actor' ? 0x00aaff : 0xaa00ff
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.9;
    body.castShadow = true;
    playerGroup.add(body);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffddaa });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.7;
    head.castShadow = true;
    playerGroup.add(head);

    // Name label (using sprite)
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

    this.scene.add(playerGroup);
    this.remotePlayers.set(id, playerGroup);
    console.log(`➕ Added remote player: ${name} (${role})`);
  }

  private updateRemotePlayer(id: string, position: any, rotation: any): void {
    const player = this.remotePlayers.get(id);
    if (player) {
      player.position.set(position.x, position.y, position.z);
      player.rotation.set(rotation.x, rotation.y, rotation.z);
    }
  }

  private removeRemotePlayer(id: string): void {
    const player = this.remotePlayers.get(id);
    if (player) {
      this.scene.remove(player);
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
    this.renderer.setAnimationLoop(() => {
      const delta = this.clock.getDelta();

      // Update FPS controller
      if (this.fpsController) {
        this.fpsController.update(delta);
      }

      // Send position updates to server (throttled)
      const now = Date.now();
      if (now - this.lastUpdateTime > this.updateInterval) {
        this.sendPositionUpdate();
        this.lastUpdateTime = now;
      }

      // Render scene
      this.renderer.render(this.scene, this.camera);
    });
  };

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

  public getSocketClient(): SocketClient {
    return this.socketClient;
  }
}

// Export for use in VR scene page
(window as any).ARCClient = ARCClient;

