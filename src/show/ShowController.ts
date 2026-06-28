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
import { createCommuneRoadSet } from './sets/CommuneRoadSet';
import { createCommuneSetDressing, COMMUNE_GATE_Z } from './sets/communeAssets';
import { SHOW_SCALE_DUMMIES, placeScaleTestDummies } from './dummies/arcDummies';

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
  private communeGroup: THREE.Group | null = null;
  private dummiesGroup: THREE.Group | null = null;
  private gateLampMeshes: THREE.Mesh[] = [];
  private gateLights: THREE.PointLight[] = [];

  // Rain.
  private rain: THREE.Points | null = null;
  private rainVelocities: Float32Array | null = null;
  private rainIntensity = 0; // 0 = dry, 1 = downpour
  private readonly rainCount = 1800;
  private readonly rainArea = { w: 80, h: 45, d: 80, cx: 0, cy: 22, cz: -12 };

  // Act 1 atmosphere: layered lighting, sky, fog.
  private hemiLight: THREE.HemisphereLight | null = null;
  private moonLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private skyMesh: THREE.Mesh | null = null;
  // Base intensities — tuned for readable rehearsal blocking while keeping a stormy night.
  private baseHemiIntensity = 0.62;
  private baseAmbientIntensity = 0.42;
  private baseMoonIntensity = 1.05;
  // Storm fog: lighter + thinner so the road/gate stay visible.
  private readonly act1FogColor = new THREE.Color(0x2e3848);
  private readonly act1FogDensity = 0.0055;
  private act1Fog: THREE.FogExp2 | null = null;

  // Lightning.
  private lightningLight: THREE.PointLight | null = null;
  private lightningEnergy = 0; // decays each frame after a flash
  private baseBackground = new THREE.Color(0x141c28);

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
    // Pre-show is a dark void; clear the Act 1 storm atmosphere.
    this.setAct1Atmosphere(false);
    this.scene.background = new THREE.Color(0x05060a);
    this.currentScene = SCENE_PRE_SHOW;
    this.onSceneChanged(this.currentScene);
  }

  // Build the full Act 1 storm road (everything visible immediately).
  loadAct1StormRoad(): void {
    if (!this.act1Group) this.act1Group = this.buildAct1Scene();
    if (this.preShowGroup) this.preShowGroup.visible = false;
    this.act1Group.visible = true;

    // Make every sub-assembly fully visible (no fade) and start the storm.
    [this.roadGroup, this.busGroup, this.gateGroup, this.communeGroup, this.dummiesGroup].forEach((g) => {
      if (g) {
        g.visible = true;
        this.setOpacity(g, 1);
      }
    });
    this.rainIntensity = 0.55;
    this.applyRainIntensity();
    this.setAct1Atmosphere(true);

    // Opening drone bed (instant mode).
    void this.stormCues.startAct1Drone();

    this.currentScene = SCENE_ACT_1;
    this.onSceneChanged(this.currentScene);
  }

  // Main entry: route a server-driven transition to the right loader.
  transitionToAct(sceneId: SceneId, mode: TransitionMode): void {
    this.clearAssembleTimers();
    if (sceneId === SCENE_PRE_SHOW) {
      this.stormCues.stopAct1Drone();
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

    [this.roadGroup, this.busGroup, this.gateGroup, this.communeGroup, this.dummiesGroup].forEach((g) => {
      if (g) {
        g.visible = false;
        this.setOpacity(g, 0);
      }
    });
    this.rainIntensity = 0;
    this.applyRainIntensity();
    // Start in a black void; the sky/fog fade in with the world below.
    this.setAct1Atmosphere(false);
    this.scene.background = new THREE.Color(0x000000);

    // Opening drone bed underscores the whole build (assemble mode).
    void this.stormCues.startAct1Drone();

    const step = (delay: number, fn: () => void) => {
      this.assembleTimers.push(window.setTimeout(fn, delay));
    };

    // 1. Road fades in, and the sky/fog resolve out of the void.
    step(200, () => {
      this.revealGroup(this.roadGroup, 1400);
      this.setAct1Atmosphere(true);
    });
    // 2. Bus appears.
    step(1800, () => this.revealGroup(this.busGroup, 1100));
    // 3. Rain starts.
    step(3100, () => {
      this.rainIntensity = 0.55;
      this.applyRainIntensity();
    });
    // 4. Lightning flash (+ thunder).
    step(4000, () => {
      this.triggerLightning();
      this.audio.play('thunder_clap');
    });
    // 5. Commune gate (and the commune beyond it) appears in the distance.
    step(4800, () => {
      this.revealGroup(this.gateGroup, 1400);
      this.revealGroup(this.communeGroup, 1600);
      this.revealGroup(this.dummiesGroup, 1200);
    });
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
        this.triggerLightning();
        break;
      case 'rainUp':
        this.rainIntensity = Math.min(1, this.rainIntensity + 0.25);
        this.applyRainIntensity();
        break;
      case 'gateLight':
        this.gateLightOn();
        break;
      case 'blackout':
        this.triggerBlackout(2);
        break;
    }
  }

  getCurrentScene(): SceneId {
    return this.currentScene;
  }

  /** Cue engine: set rain level directly (0 = dry, 1 = downpour). */
  setRainIntensity(intensity: number): void {
    this.rainIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
    this.applyRainIntensity();
  }

  /** Brief theatrical blackout — kills rain, sky, and fog, then restores. */
  triggerBlackout(durationSec = 2): void {
    const prevRain = this.rainIntensity;
    const hadFog = !!this.scene.fog;
    const skyWasVisible = !!this.skyMesh?.visible;
    this.rainIntensity = 0;
    this.applyRainIntensity();
    if (this.skyMesh) this.skyMesh.visible = false;
    this.scene.fog = null;
    this.scene.background = new THREE.Color(0x000000);
    window.setTimeout(() => {
      this.rainIntensity = prevRain;
      this.applyRainIntensity();
      if (skyWasVisible || hadFog) this.setAct1Atmosphere(true);
    }, durationSec * 1000);
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

    // Expansive stormy night sky so players never see a black void.
    this.skyMesh = this.buildStormSky();
    g.add(this.skyMesh);

    // --- Layered lighting: stormy night but readable for rehearsal ---

    // 1. Soft outdoor fill: cool sky, earthy ground.
    this.hemiLight = new THREE.HemisphereLight(0x6a7a9a, 0x3a3228, this.baseHemiIntensity);
    this.hemiLight.position.set(0, 30, 0);
    g.add(this.hemiLight);

    // 2. Moonlight: blue-white key light with soft shadows.
    this.moonLight = new THREE.DirectionalLight(0xb8cce8, this.baseMoonIntensity);
    this.moonLight.position.set(-38, 46, -18);
    this.moonLight.target.position.set(0, 0, -50);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(2048, 2048);
    this.moonLight.shadow.bias = -0.0006;
    const sc = this.moonLight.shadow.camera as THREE.OrthographicCamera;
    sc.near = 1;
    sc.far = 180;
    sc.left = -60;
    sc.right = 60;
    sc.top = 60;
    sc.bottom = -60;
    sc.updateProjectionMatrix();
    g.add(this.moonLight);
    g.add(this.moonLight.target);

    // 2b. Weak fill from the opposite side (no shadows) — lifts faces/road without killing mood.
    const moonFill = new THREE.DirectionalLight(0x8098b8, 0.32);
    moonFill.position.set(28, 24, 30);
    moonFill.target.position.set(0, 0, -40);
    g.add(moonFill);
    g.add(moonFill.target);

    // 3. Ambient base so shadows read as deep blue, not black.
    this.ambientLight = new THREE.AmbientLight(0x384858, this.baseAmbientIntensity);
    g.add(this.ambientLight);

    // 4. Cheap road fill lights: bus spawn, mid-road, gate approach (Quest-safe count).
    this.addRoadFillLights(g);

    // Procedural rehearsal set: curved muddy road, silhouette forest, fences,
    // broken signpost, rocks/bushes, lantern posts, distant commune buildings.
    // (Bus and gate stay below — the gate owns the gate-light cue.)
    this.roadGroup = createCommuneRoadSet({ gateZ: -73, spawn: { x: ACT_1_SPAWN.x, z: ACT_1_SPAWN.z } });
    this.busGroup = this.buildBus();
    this.gateGroup = this.buildGate();
    // Lived-in commune placeholder buildings behind the gate (low-poly).
    this.communeGroup = createCommuneSetDressing({ gateZ: COMMUNE_GATE_Z });
    g.add(this.roadGroup, this.busGroup, this.gateGroup, this.communeGroup);

    // Blocky placeholder characters for scale testing / NPC staging (no collision).
    if (SHOW_SCALE_DUMMIES) {
      this.dummiesGroup = placeScaleTestDummies(g);
    }

    // Rain + lightning belong to Act 1.
    this.rain = this.buildRain();
    g.add(this.rain);

    this.lightningLight = new THREE.PointLight(0xbfd0ff, 0, 600, 1.2);
    this.lightningLight.position.set(0, 70, -20);
    g.add(this.lightningLight);

    this.root.add(g);
    return g;
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
    [leftPost, rightPost, crossbar].forEach((m) => (m.castShadow = true));
    group.add(leftPost, rightPost, crossbar);

    // Distant lamps near the gate (warm beacons — brighter by default for rehearsal).
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x5a4a2a,
      emissive: 0xffaa55,
      emissiveIntensity: 0.85,
    });
    const lampGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    [-3.5, 3.5].forEach((x) => {
      const lamp = new THREE.Mesh(lampGeo, lampMat.clone());
      lamp.position.set(x, 6.5, 0);
      group.add(lamp);
      this.gateLampMeshes.push(lamp);

      const light = new THREE.PointLight(0xffaa55, 1.6, 55, 1.5);
      light.position.set(x, 6.5, 0.5);
      group.add(light);
      this.gateLights.push(light);
    });

    // Warm pool on the ground at the entrance.
    const refuge = new THREE.PointLight(0xffb066, 1.8, 34, 1.8);
    refuge.position.set(0, 1.4, 2.5);
    group.add(refuge);

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

  // ---------- sky ----------

  /** A few cheap point lights along the road so players can read terrain at night. */
  private addRoadFillLights(parent: THREE.Group): void {
    const fills: Array<{ color: number; intensity: number; dist: number; x: number; y: number; z: number }> = [
      // Bus / spawn area — cool moonlit fill where players first land.
      { color: 0xc8d8f0, intensity: 1.4, dist: 38, x: 2, y: 5, z: 14 },
      // Mid road — keeps the curve readable while walking.
      { color: 0xb0c4e0, intensity: 1.0, dist: 42, x: -1, y: 6, z: -18 },
      // Gate approach — warm hint pulling toward refuge.
      { color: 0xffc890, intensity: 0.9, dist: 36, x: 0, y: 4, z: -58 },
    ];
    for (const f of fills) {
      const light = new THREE.PointLight(f.color, f.intensity, f.dist, 1.6);
      light.position.set(f.x, f.y, f.z);
      light.name = 'road-fill';
      parent.add(light);
    }
  }

  /**
   * Procedural stormy-night sky dome. A cheap gradient (dark blue-gray zenith ->
   * lighter storm horizon) with faint cloud streaks. No HDRI download, no
   * postprocessing — cheap enough for Quest. The horizon colour matches the fog
   * so distant geometry dissolves seamlessly into the sky. `fog:false` keeps the
   * dome itself crisp; `BackSide` renders it from the inside.
   */
  private buildStormSky(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(400, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x121820) },
        horizonColor: { value: new THREE.Color(0x3a4658) },
        bottomColor: { value: new THREE.Color(0x1a2028) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        void main() {
          float h = vDir.y;
          vec3 col = (h > 0.0)
            ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55))
            : mix(horizonColor, bottomColor, clamp(-h * 2.0, 0.0, 1.0));
          // Subtle storm cloud streaks banded near the horizon.
          float n = sin(vDir.x * 3.0 + 1.3) * sin(vDir.z * 2.0) * 0.5 + 0.5;
          float band = smoothstep(0.0, 0.35, h) * (1.0 - smoothstep(0.35, 0.85, h));
          col += (n * 0.045) * band * vec3(0.55, 0.62, 0.8);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'storm-sky';
    mesh.frustumCulled = false;
    return mesh;
  }

  // ---------- atmosphere (fog + background) ----------

  /** Turn the Act 1 storm atmosphere (fog + sky background) on or off. */
  private setAct1Atmosphere(on: boolean): void {
    if (on) {
      if (!this.act1Fog) this.act1Fog = new THREE.FogExp2(this.act1FogColor.getHex(), this.act1FogDensity);
      this.scene.fog = this.act1Fog;
      this.scene.background = this.baseBackground;
      if (this.skyMesh) this.skyMesh.visible = true;
    } else {
      this.scene.fog = null;
      if (this.skyMesh) this.skyMesh.visible = false;
    }
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

  /**
   * Reusable lightning flash. Bursts a white point light, briefly lifts the
   * whole scene (hemisphere + ambient) and the fog, then decays smoothly back to
   * the storm baseline. Thunder is intentionally NOT played here so the Director
   * can time the audio independently (fire the `thunder` cue separately).
   *
   * Wired to the `lightning` show cue and safe to call directly from any cue.
   */
  triggerLightning(): void {
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
      const e = this.lightningEnergy;
      this.lightningLight.intensity = e * 9;

      // Whole scene briefly brightens: lift the soft fills above their baseline.
      if (this.hemiLight) this.hemiLight.intensity = this.baseHemiIntensity + e * 1.6;
      if (this.ambientLight) this.ambientLight.intensity = this.baseAmbientIntensity + e * 0.9;
      if (this.moonLight) this.moonLight.intensity = this.baseMoonIntensity + e * 2.0;

      // Slightly brighten the fog so the flash reads in the distance too.
      if (this.act1Fog) {
        this.act1Fog.color.copy(this.act1FogColor).lerp(new THREE.Color(0x6f7fa0), e * 0.6);
      }

      // Lift the sky/background toward storm grey for non-fogged framing.
      const tint = e * 0.5;
      if (!this.skyMesh?.visible) {
        this.scene.background = new THREE.Color(tint * 0.4, tint * 0.45, tint * 0.6);
      }
    } else if (this.lightningLight.intensity !== 0) {
      // Settle back to baseline.
      this.lightningLight.intensity = 0;
      if (this.hemiLight) this.hemiLight.intensity = this.baseHemiIntensity;
      if (this.ambientLight) this.ambientLight.intensity = this.baseAmbientIntensity;
      if (this.moonLight) this.moonLight.intensity = this.baseMoonIntensity;
      if (this.act1Fog) this.act1Fog.color.copy(this.act1FogColor);
      if (!this.skyMesh?.visible) this.scene.background = this.baseBackground;
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
