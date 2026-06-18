import * as THREE from 'three';
import { AudioHooks } from '../audio/AudioHooksBridge';
import {
  SceneId,
  TransitionMode,
  ShowCue,
  SCENE_PRE_SHOW,
  SCENE_ACT_1,
  HOST_POSITION,
  PRE_SHOW_SPAWN,
  ACT_1_SPAWN,
} from './scenes';
import {
  LostInTheStormCues,
  STORM_AUDIO_CUE_IDS,
  StormAudioCueId,
  dispatchStormAudioCue,
} from '../audio/LostInTheStormCues';

// Drives the theatrical ARC flow on the client: builds the pre-show loading
// zone and Act 1 storm road from placeholder geometry, performs synchronized
// scene transitions (instant or sequenced "assemble"), and runs stage cues
// (thunder / lightning / rain / gate light).
//
// The server is authoritative for WHICH scene is active; this class only renders
// it. All geometry lives under `root` (a child of the world `sceneWrapper`), so
// VR locomotion already applies.

interface ShowControllerOpts {
  scene: THREE.Scene;
  parent: THREE.Object3D;
  role: string;
  audio: AudioHooks;
  stormCues: LostInTheStormCues;
  // Move the local player to a spawn point (x/z on the floor, yaw heading).
  onTeleport: (spawn: { x: number; z: number; yaw: number }) => void;
}

interface FadeEntry {
  materials: THREE.Material[];
  duration: number;
  elapsed: number;
}

export class ShowController {
  private scene: THREE.Scene;
  private root: THREE.Group;
  private role: string;
  private onTeleport: (spawn: { x: number; z: number; yaw: number }) => void;
  private audio: AudioHooks;
  private stormCues: LostInTheStormCues;

  private preShowGroup: THREE.Group | null = null;
  private act1Group: THREE.Group | null = null;

  // Act 1 sub-assemblies (revealed individually during "assemble" mode).
  private roadGroup: THREE.Group | null = null;
  private busGroup: THREE.Group | null = null;
  private gateGroup: THREE.Group | null = null;
  private gateLampMeshes: THREE.Mesh[] = [];
  private gateLights: THREE.PointLight[] = [];

  // Rain.
  private rain: THREE.Points | null = null;
  private rainVelocities: Float32Array | null = null;
  private rainIntensity = 0; // 0 = dry, 1 = downpour
  private readonly rainCount = 1800;
  private readonly rainArea = { w: 80, h: 45, d: 80, cx: 0, cy: 22, cz: -12 };

  // Lightning.
  private lightningLight: THREE.PointLight | null = null;
  private lightningEnergy = 0; // decays each frame after a flash
  private baseBackground = new THREE.Color(0x000000);

  private currentScene: SceneId = SCENE_PRE_SHOW;
  private fades: FadeEntry[] = [];
  private assembleTimers: number[] = [];

  // Notified whenever the active scene changes (for the Director UI display).
  public onSceneChanged: (scene: SceneId) => void = () => {};

  constructor(opts: ShowControllerOpts) {
    this.scene = opts.scene;
    this.role = opts.role;
    this.onTeleport = opts.onTeleport;
    this.audio = opts.audio;
    this.stormCues = opts.stormCues;

    this.root = new THREE.Group();
    this.root.name = 'show-root';
    opts.parent.add(this.root);

    this.scene.background = this.baseBackground;
  }

  // ---------- public API ----------

  // Build + show the Matrix-style loading zone. Safe to call repeatedly.
  loadPreShowScene(): void {
    if (!this.preShowGroup) this.preShowGroup = this.buildPreShowScene();
    this.preShowGroup.visible = true;
    if (this.act1Group) this.act1Group.visible = false;
    this.currentScene = SCENE_PRE_SHOW;
    this.onSceneChanged(this.currentScene);
  }

  // Build the full Act 1 storm road (everything visible immediately).
  loadAct1StormRoad(): void {
    if (!this.act1Group) this.act1Group = this.buildAct1Scene();
    if (this.preShowGroup) this.preShowGroup.visible = false;
    this.act1Group.visible = true;

    // Make every sub-assembly fully visible (no fade) and start the storm.
    [this.roadGroup, this.busGroup, this.gateGroup].forEach((g) => {
      if (g) {
        g.visible = true;
        this.setOpacity(g, 1);
      }
    });
    this.rainIntensity = 0.55;
    this.applyRainIntensity();

    this.currentScene = SCENE_ACT_1;
    this.onSceneChanged(this.currentScene);
  }

  // Main entry: route a server-driven transition to the right loader.
  transitionToAct(sceneId: SceneId, mode: TransitionMode): void {
    this.clearAssembleTimers();
    if (sceneId === SCENE_PRE_SHOW) {
      this.loadPreShowScene();
      this.onTeleport(PRE_SHOW_SPAWN);
      return;
    }
    if (sceneId === SCENE_ACT_1) {
      if (mode === 'assemble') {
        this.assembleAct1StormRoad();
      } else {
        this.loadAct1StormRoad();
        this.onTeleport(ACT_1_SPAWN);
      }
    }
  }

  // Apply the initial scene a (possibly late-joining) client receives. Late
  // joiners always hard-cut into the active scene.
  applyInitialScene(sceneId: SceneId): void {
    if (sceneId === SCENE_ACT_1) {
      this.loadAct1StormRoad();
      this.onTeleport(ACT_1_SPAWN);
    } else {
      this.loadPreShowScene();
    }
  }

  // Handler for the server's `sceneTransition` broadcast.
  syncSceneTransition(payload: { currentScene: SceneId; mode: TransitionMode }): void {
    this.transitionToAct(payload.currentScene, payload.mode);
  }

  // "Assemble" mode: players stay in black space while Act 1 builds in front of
  // them prop-by-prop, then they're moved to their Act 1 spawn.
  assembleAct1StormRoad(): void {
    if (!this.act1Group) this.act1Group = this.buildAct1Scene();

    // Black void: hide the loading zone and every Act 1 prop to start.
    if (this.preShowGroup) this.preShowGroup.visible = false;
    this.act1Group.visible = true;
    this.currentScene = SCENE_ACT_1;
    this.onSceneChanged(this.currentScene);

    [this.roadGroup, this.busGroup, this.gateGroup].forEach((g) => {
      if (g) {
        g.visible = false;
        this.setOpacity(g, 0);
      }
    });
    this.rainIntensity = 0;
    this.applyRainIntensity();

    const step = (delay: number, fn: () => void) => {
      this.assembleTimers.push(window.setTimeout(fn, delay));
    };

    // 1. Road fades in.
    step(200, () => this.revealGroup(this.roadGroup, 1400));
    // 2. Bus appears.
    step(1800, () => this.revealGroup(this.busGroup, 1100));
    // 3. Rain starts.
    step(3100, () => {
      this.rainIntensity = 0.55;
      this.applyRainIntensity();
    });
    // 4. Lightning flash (+ thunder).
    step(4000, () => {
      this.flashLightning();
      this.audio.play('thunder_clap');
    });
    // 5. Commune gate appears in the distance.
    step(4800, () => this.revealGroup(this.gateGroup, 1400));
    // 6. Move players to their Act 1 spawn positions.
    step(6400, () => this.onTeleport(ACT_1_SPAWN));
  }

  // One-shot stage cue from the Director (visual + audio).
  handleCue(cue: ShowCue): void {
    if ((STORM_AUDIO_CUE_IDS as readonly string[]).includes(cue)) {
      void dispatchStormAudioCue(this.stormCues, cue as StormAudioCueId);
      return;
    }
    switch (cue) {
      case 'thunder':
        this.audio.play('thunder_clap');
        break;
      case 'lightning':
        this.flashLightning();
        break;
      case 'rainUp':
        this.rainIntensity = Math.min(1, this.rainIntensity + 0.25);
        this.applyRainIntensity();
        break;
      case 'gateLight':
        this.gateLightOn();
        break;
    }
  }

  getCurrentScene(): SceneId {
    return this.currentScene;
  }

  // Per-frame: animate rain, decay lightning, advance fades.
  update(delta: number): void {
    this.updateFades(delta);
    this.updateRain(delta);
    this.updateLightning(delta);
  }

  // ---------- pre-show scene ----------

  private buildPreShowScene(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'pre-show';

    // Soft fill so silhouettes aren't pure black, kept low for the void feel.
    const ambient = new THREE.AmbientLight(0x3344aa, 0.35);
    g.add(ambient);

    // Near-black floor to catch the spotlight.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    // Subtle Matrix-style grid.
    const grid = new THREE.GridHelper(60, 60, 0x33ff88, 0x0a3a22);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as any).opacity = 0.25;
    grid.position.y = 0.02;
    g.add(grid);

    // Host spotlight aimed at the host position.
    const spot = new THREE.SpotLight(0xffffff, 6, 40, Math.PI / 5, 0.5, 1.2);
    spot.position.set(HOST_POSITION.x, 10, HOST_POSITION.z + 0.5);
    spot.target.position.copy(HOST_POSITION);
    g.add(spot);
    g.add(spot.target);

    // Glowing ring marking where the host stands.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.06, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0x33ff88, transparent: true, opacity: 0.8 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(HOST_POSITION.x, 0.04, HOST_POSITION.z);
    g.add(ring);

    this.root.add(g);
    return g;
  }

  // ---------- Act 1 scene ----------

  private buildAct1Scene(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'act1-storm-road';
    g.visible = false;

    // Cold moonlit ambient + a weak directional "moon".
    g.add(new THREE.AmbientLight(0x223044, 0.5));
    const moon = new THREE.DirectionalLight(0x5566aa, 0.6);
    moon.position.set(-20, 40, -30);
    g.add(moon);

    // Muddy ground accent (wider than the road).
    const mud = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 180),
      new THREE.MeshStandardMaterial({ color: 0x161109, roughness: 1, metalness: 0 })
    );
    mud.rotation.x = -Math.PI / 2;
    mud.position.set(0, -0.01, -40);
    mud.receiveShadow = true;
    g.add(mud);

    this.roadGroup = this.buildRoad();
    this.busGroup = this.buildBus();
    this.gateGroup = this.buildGate();
    g.add(this.roadGroup, this.busGroup, this.gateGroup);

    // Rain + lightning belong to Act 1.
    this.rain = this.buildRain();
    g.add(this.rain);

    this.lightningLight = new THREE.PointLight(0xbfd0ff, 0, 600, 1.2);
    this.lightningLight.position.set(0, 70, -20);
    g.add(this.lightningLight);

    this.root.add(g);
    return g;
  }

  private buildRoad(): THREE.Group {
    const group = new THREE.Group();
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 150),
      new THREE.MeshStandardMaterial({ color: 0x131316, roughness: 0.9, metalness: 0.1 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, -45);
    road.receiveShadow = true;
    group.add(road);

    // Faint centre line so the road reads as a road.
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 150),
      new THREE.MeshStandardMaterial({ color: 0x4a4730, roughness: 1 })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.02, -45);
    group.add(line);
    return group;
  }

  private buildBus(): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d3329, roughness: 0.8, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 11), bodyMat);
    body.position.set(0, 1.6, 0);
    body.castShadow = true;
    group.add(body);

    // A couple of dim window strips to suggest the bus.
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      emissive: 0x111820,
      roughness: 0.4,
    });
    const windows = new THREE.Mesh(new THREE.BoxGeometry(4.02, 0.8, 8), winMat);
    windows.position.set(0, 2.2, 0);
    group.add(windows);

    // Broken-down: parked off the road and tilted.
    group.position.set(-5, 0, 6);
    group.rotation.z = 0.05;
    group.rotation.y = 0.12;
    return group;
  }

  private buildGate(): THREE.Group {
    const group = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x20201a, roughness: 0.9 });
    const postGeo = new THREE.BoxGeometry(1, 8, 1);

    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-3.5, 4, 0);
    const rightPost = new THREE.Mesh(postGeo, postMat);
    rightPost.position.set(3.5, 4, 0);

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(9, 1, 1), postMat);
    crossbar.position.set(0, 7.5, 0);
    group.add(leftPost, rightPost, crossbar);

    // Distant lamps near the gate (dim by default; "Gate Light On" brightens).
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x5a4a2a,
      emissive: 0xffaa55,
      emissiveIntensity: 0.35,
    });
    const lampGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    [-3.5, 3.5].forEach((x) => {
      const lamp = new THREE.Mesh(lampGeo, lampMat.clone());
      lamp.position.set(x, 6.5, 0);
      group.add(lamp);
      this.gateLampMeshes.push(lamp);

      const light = new THREE.PointLight(0xffaa55, 0.65, 45, 1.5);
      light.position.set(x, 6.5, 0.5);
      group.add(light);
      this.gateLights.push(light);
    });

    // Far down the road.
    group.position.set(0, 0, -75);
    return group;
  }

  private gateLightOn(): void {
    this.gateLampMeshes.forEach((m) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.4;
    });
    this.gateLights.forEach((l) => {
      l.intensity = 3;
    });
  }

  // ---------- rain ----------

  private buildRain(): THREE.Points {
    const positions = new Float32Array(this.rainCount * 3);
    this.rainVelocities = new Float32Array(this.rainCount);
    const { w, h, d, cx, cy, cz } = this.rainArea;
    for (let i = 0; i < this.rainCount; i++) {
      positions[i * 3] = cx + (Math.random() - 0.5) * w;
      positions[i * 3 + 1] = cy + (Math.random() - 0.5) * h;
      positions[i * 3 + 2] = cz + (Math.random() - 0.5) * d;
      this.rainVelocities[i] = 18 + Math.random() * 14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xaab4d0,
      size: 0.16,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  private applyRainIntensity(): void {
    if (!this.rain) return;
    const mat = this.rain.material as THREE.PointsMaterial;
    mat.opacity = 0.6 * this.rainIntensity;
  }

  private updateRain(delta: number): void {
    if (!this.rain || !this.rainVelocities || this.rainIntensity <= 0) return;
    if (!this.act1Group?.visible) return;
    const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const { h, cy } = this.rainArea;
    const top = cy + h / 2;
    const bottom = cy - h / 2;
    const speedScale = 0.6 + this.rainIntensity * 0.8;
    for (let i = 0; i < this.rainCount; i++) {
      let y = pos.getY(i) - this.rainVelocities[i] * speedScale * delta;
      if (y < bottom) y = top;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  // ---------- lightning ----------

  private flashLightning(): void {
    this.lightningEnergy = 1;
    // A quick second strike for a more natural flicker.
    this.assembleTimers.push(
      window.setTimeout(() => {
        this.lightningEnergy = Math.max(this.lightningEnergy, 0.7);
      }, 120)
    );
  }

  private updateLightning(delta: number): void {
    if (!this.lightningLight) return;
    if (this.lightningEnergy > 0) {
      this.lightningEnergy = Math.max(0, this.lightningEnergy - delta * 4.5);
      this.lightningLight.intensity = this.lightningEnergy * 8;
      // Briefly lift the black sky toward storm grey.
      const tint = this.lightningEnergy * 0.5;
      this.scene.background = new THREE.Color(tint * 0.4, tint * 0.45, tint * 0.6);
    } else if (this.lightningLight.intensity !== 0) {
      this.lightningLight.intensity = 0;
      this.scene.background = this.baseBackground;
    }
  }

  // ---------- fade helpers ----------

  private revealGroup(group: THREE.Group | null, duration: number): void {
    if (!group) return;
    group.visible = true;
    const materials = this.collectMaterials(group);
    materials.forEach((m) => {
      m.transparent = true;
      m.opacity = 0;
    });
    this.fades.push({ materials, duration, elapsed: 0 });
  }

  private updateFades(delta: number): void {
    if (this.fades.length === 0) return;
    this.fades = this.fades.filter((fade) => {
      fade.elapsed += delta * 1000;
      const t = Math.min(1, fade.elapsed / fade.duration);
      fade.materials.forEach((m) => {
        m.opacity = t;
      });
      return t < 1;
    });
  }

  private setOpacity(obj: THREE.Object3D, value: number): void {
    this.collectMaterials(obj).forEach((m) => {
      m.transparent = value < 1;
      m.opacity = value;
    });
  }

  private collectMaterials(obj: THREE.Object3D): THREE.Material[] {
    const out: THREE.Material[] = [];
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        if (Array.isArray(mesh.material)) out.push(...mesh.material);
        else out.push(mesh.material);
      }
    });
    return out;
  }

  private clearAssembleTimers(): void {
    this.assembleTimers.forEach((t) => clearTimeout(t));
    this.assembleTimers = [];
  }
}
