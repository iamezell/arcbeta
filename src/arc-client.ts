import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FPSController } from './fps-controller';
import { SocketClient } from './socket-client';
import { RoomController } from './room/RoomController';
import { ShowController } from './show/ShowController';
import { ShowDirectorUI } from './show/ShowDirectorUI';
import { SceneId } from './show/scenes';
import { CueManager } from './npc/CueManager';
import { NPCDirectorPanel } from './npc/NPCDirectorPanel';
import { AudioManager } from './audio/AudioManager';
import { AudioHooks } from './audio/AudioHooksBridge';
import { LostInTheStormCues } from './audio/LostInTheStormCues';
import { AudioDebugPanel } from './audio/AudioDebugPanel';
import { AudioDebugVisualizer } from './audio/AudioDebugVisualizer';
import { WebRTCVoicePipeline, exposeWebRTCVoiceConsole } from './audio/WebRTCVoicePipeline';
import { WebRTCVoiceDebug } from './audio/WebRTCVoiceDebug';
import { isWebRTCVoiceDebugEnabled } from './audio/webrtcVoiceConfig';
import { CueEngine } from './cueEngine/CueEngine';
import { ACT1_CUE_DEFINITIONS, STORM_CUE_ACTIONS } from './cueEngine/definitions/act1Moments';
import { CueAction } from './cueEngine/types';
import { ShowCue } from './show/scenes';
import { AudienceRegistry } from './audience/AudienceRegistry';
import { AudienceCueEngine, PrivateCuePayload } from './audience/AudienceCueEngine';
import { AudiencePanel } from './audience/AudiencePanel';
import { ParticipantRole } from './audience/types';
import { InputManager } from './input/InputManager';
import {
  ADULT_HEIGHT,
  PLAYER_BODY_CENTER_Y,
} from './player/playerScale';
import { TouchControls } from './input/TouchControls';
import { MobileHUD } from './ui/MobileHUD';
import { getDeviceInfo, supportsDeviceOrientation } from './utils/device';
import { AudienceExperienceManager } from './experience/AudienceExperienceManager';
import { ExperienceMenu } from './experience/ExperienceMenu';
import { getDefaultViewpoints } from './experience/viewpoints';

export class ARCClient {
  private scene: THREE.Scene;
  private sceneWrapper: THREE.Group;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private fpsController: FPSController | null = null;
  private input: InputManager | null = null;
  private touchControls: TouchControls | null = null;
  private mobileHUD: MobileHUD | null = null;
  private reduceMotion = false;
  private experienceManager: AudienceExperienceManager | null = null;
  private experienceMenu: ExperienceMenu | null = null;
  private socketClient: SocketClient;
  private role: string;
  private playerName: string;
  private remotePlayers: Map<string, THREE.Group> = new Map();
  private remotePlayerPhysics: Map<string, { position: THREE.Vector3; rotation: THREE.Euler; velocity: THREE.Vector3 }> = new Map();
  private pendingRemoteAdds = new Set<string>();
  private lastUpdateTime = 0;
  private updateInterval = 50; // 20 updates per second
  private physicsUpdateInterval = 16; // 60 FPS for physics
  private gltfLoader: GLTFLoader;
  private vrThumbstickDeadzone = 0.4;
  private hemisphereLight!: THREE.HemisphereLight;
  private roomController: RoomController | null = null;
  private showController: ShowController | null = null;
  private showDirectorUI: ShowDirectorUI | null = null;
  private cueManager: CueManager | null = null;
  private npcDirectorPanel: NPCDirectorPanel | null = null;
  private audioManager: AudioManager | null = null;
  private audioHooks: AudioHooks | null = null;
  private stormCues: LostInTheStormCues | null = null;
  private audioDebugPanel: AudioDebugPanel | null = null;
  private audioDebugVisualizer: AudioDebugVisualizer | null = null;
  private audioDebugRefresh = 0;
  private webRTCVoicePipeline: WebRTCVoicePipeline | null = null;
  private webRTCVoiceDebug: WebRTCVoiceDebug | null = null;
  private webRTCVoiceDebugRefresh = 0;
  private cueEngine: CueEngine | null = null;
  private audienceRegistry: AudienceRegistry | null = null;
  private audienceCueEngine: AudienceCueEngine | null = null;
  private audiencePanel: AudiencePanel | null = null;

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
    // Filmic tone mapping + soft shadows give the theatrical scenes depth without
    // post-processing. Shadows are disabled again on mobile (setMobilePerformanceMode).
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    // Add VR button
    document.body.appendChild(VRButton.createButton(this.renderer));

    this.setupScene();
    this.setupNetworking();
    this.setupFPSController();
    this.setupAudio();
    this.setupLocalPlayerModel();
    this.setupRoom();
    this.setupShow();
    this.setupNPCs();
    this.setupCueEngine();
    this.setupAudience();
    this.setupExperience();
    this.setupDirectorKeyboard();
    this.setupDirectorHud();
    this.setupWindowResize();
    this.animate();
  }

  /**
   * Director control now lives on the Stream Deck (see docs/StreamDeck.md), so the
   * on-screen panels are hidden by default to free up screen real estate. Press
   * "H" to peek/hide the HUD (Show, NPC, and Audience panels) when needed.
   */
  private setupDirectorHud(): void {
    if (this.role !== 'Director') return;
    const panelIds = ['arc-show-director', 'npc-director', 'arc-audience-panel'];
    let visible = false;

    const apply = (): void => {
      for (const id of panelIds) {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? '' : 'none';
      }
      pill.textContent = visible ? '🎛 HUD: on (H)' : '🎛 HUD: off (H) · Stream Deck';
      pill.style.opacity = visible ? '1' : '0.6';
    };

    const pill = document.createElement('div');
    pill.id = 'arc-hud-toggle';
    pill.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:400;background:rgba(14,16,22,0.9);' +
      'border:1px solid rgba(120,200,255,0.3);color:#cfe2ff;font:11px/1.4 "Segoe UI",sans-serif;' +
      'padding:6px 10px;border-radius:14px;cursor:pointer;user-select:none;';
    pill.title = 'Toggle director on-screen panels (H). Control is on the Stream Deck.';
    pill.addEventListener('click', () => {
      visible = !visible;
      apply();
    });
    document.body.appendChild(pill);

    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'KeyH') {
        e.preventDefault();
        visible = !visible;
        apply();
      }
    });

    // Panels are created during their own setup; hide them on next tick.
    window.setTimeout(apply, 0);
  }

  private setupAudio(): void {
    this.audioManager = new AudioManager({
      camera: this.camera,
      sceneParent: this.sceneWrapper,
      getPlayerPositions: () => this.collectPlayerPositions(),
    });
    this.webRTCVoicePipeline = new WebRTCVoicePipeline(this.audioManager.getListener().context);
    exposeWebRTCVoiceConsole(this.webRTCVoicePipeline);
    if (isWebRTCVoiceDebugEnabled() && this.role === 'Director') {
      this.webRTCVoiceDebug = new WebRTCVoiceDebug(this.webRTCVoicePipeline);
    }
    this.audioHooks = new AudioHooks(this.audioManager);
    this.stormCues = new LostInTheStormCues(this.audioManager);
    this.audioDebugVisualizer = new AudioDebugVisualizer(this.sceneWrapper);
    if (this.role === 'Director') {
      this.audioDebugPanel = new AudioDebugPanel(this.audioManager, this.audioDebugVisualizer);
    }
  }

  /** Positions used to centre spatial cues on the player group. */
  private collectPlayerPositions(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    const local = new THREE.Vector3();
    this.camera.getWorldPosition(local);
    out.push(local);
    this.remotePlayers.forEach((group) => {
      out.push(group.position.clone());
    });
    return out;
  }

  /** Director hotkeys 1–0 → storm audio cues (synced via showCue). */
  private setupDirectorKeyboard(): void {
    if (this.role !== 'Director') return;

    const keyToStormId: Record<string, string> = {};
    for (const entry of STORM_CUE_ACTIONS) {
      if (entry.key) keyToStormId[`Digit${entry.key}`] = entry.id;
    }

    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const stormId = keyToStormId[e.code];
      if (!stormId) return;
      e.preventDefault();
      this.broadcastImmediateAction({ type: 'storm_cue', cue: stormId as import('./audio/LostInTheStormCues').StormAudioCueId });
    });
  }

  /** Sync emergency / manual cues that map to legacy showCue or npcCue. */
  private broadcastImmediateAction(action: CueAction): void {
    if (this.role !== 'Director') {
      void this.cueEngine?.fireImmediate(action);
      return;
    }
    if (action.type === 'storm_cue') {
      this.socketClient.showCue(action.cue);
      return;
    }
    if (action.type === 'visual_cue') {
      this.socketClient.showCue(action.cue);
      return;
    }
    if (action.type === 'npc_cue') {
      this.cueManager?.executeCue(action.npcId, action.cue);
      return;
    }
    void this.cueEngine?.fireImmediate(action);
  }

  private setupRoom(): void {
    // The room is built entirely from server data once `roomState` arrives.
    this.roomController = new RoomController({
      camera: this.camera,
      socket: this.socketClient,
      sceneParent: this.sceneWrapper,
      roomLight: this.hemisphereLight,
      role: this.role,
      audio: this.audioHooks!,
    });
    this.roomController.onRoomRestart = () => {
      this.fpsController?.resetToSpawn();
      this.sceneWrapper.position.set(0, 0, 0);
    };
  }

  private setupShow(): void {
    // Build the theatrical show layer. The server is authoritative for which
    // scene is active; this client just renders it and runs cues.
    this.showController = new ShowController({
      scene: this.scene,
      parent: this.sceneWrapper,
      role: this.role,
      audio: this.audioHooks!,
      stormCues: this.stormCues!,
      onTeleport: (spawn) => {
        this.fpsController?.setPosition(spawn.x, spawn.z, spawn.yaw);
        // Re-centre the VR world shift so headset locomotion stays correct.
        this.sceneWrapper.position.set(0, 0, 0);
      },
    });

    // Everyone starts in the loading zone until the server says otherwise.
    this.showController.loadPreShowScene();

    // Director gets the stage control panel.
    if (this.role === 'Director') {
      this.showDirectorUI = new ShowDirectorUI();
      this.showDirectorUI.onStartAct = (sceneId, mode) => {
        this.socketClient.startAct(sceneId, mode);
      };
      this.showDirectorUI.onFireAction = (action) => this.broadcastImmediateAction(action);
      this.showDirectorUI.onStartBeat = (beatId) => this.cueEngine?.requestStartBeat(beatId);
      this.showDirectorUI.onStartMoment = (momentId) => this.cueEngine?.requestStartMoment(momentId);
      this.showDirectorUI.onPauseBeat = () => this.cueEngine?.pauseBeat();
      this.showDirectorUI.onResumeBeat = () => this.cueEngine?.resumeBeat();
      this.showDirectorUI.onStopBeat = () => this.cueEngine?.stopBeat();
      this.showDirectorUI.setCurrentScene(this.showController.getCurrentScene());
    }

    // Every client hides/shows NPCs with the active act (CueManager wired in setupNPCs).
    this.showController.onSceneChanged = (scene: SceneId) => {
      this.showDirectorUI?.setCurrentScene(scene);
      this.cueManager?.setActVisible(scene === 'ACT_1_STORM_ROAD');
    };

    // Server-driven sync: initial snapshot (incl. late joiners), live
    // transitions, and one-shot cues.
    this.socketClient.onShowState((data: { currentScene: SceneId }) => {
      this.showController?.applyInitialScene(data.currentScene);
    });
    this.socketClient.onSceneTransition((data: { currentScene: SceneId; mode: any }) => {
      this.showController?.syncSceneTransition(data);
    });
    this.socketClient.onShowCue((data: { cue: ShowCue }) => {
      this.showController?.handleCue(data.cue);
    });

    this.socketClient.onCueEngineBeatStart((data) => {
      this.cueEngine?.handleBeatStart(data);
    });

    this.socketClient.onCueEngineMomentStart((data) => {
      this.cueEngine?.handleMomentStart(data);
    });
  }

  private setupCueEngine(): void {
    if (!this.audioManager || !this.stormCues || !this.showController || !this.cueManager) return;

    this.cueEngine = new CueEngine({
      definitions: ACT1_CUE_DEFINITIONS,
      runtime: {
        role: this.role,
        audio: this.audioManager,
        stormCues: this.stormCues,
        showController: this.showController,
        cueManager: this.cueManager,
        broadcastShowCue: (cue) => this.socketClient.showCue(cue),
        broadcastStartBeat: (payload) => this.socketClient.startBeat(payload.beatId, payload.startedAt, {
          momentId: payload.momentId,
          force: payload.force,
        }),
        broadcastStartMoment: (payload) =>
          this.socketClient.startMoment(payload.momentId, payload.startedAt, payload.force),
      },
    });

    this.cueEngine.setOnStateChange((state, beatId) => {
      const label = beatId ? this.cueEngine?.getBeat(beatId)?.label ?? beatId : '—';
      this.showDirectorUI?.setBeatStatus(`${state}: ${label}`);
    });
  }

  /**
   * Personalized audience cue system: tracks participants, lets the Director
   * target private cues at individuals/groups, and routes private cues over the
   * network to a single target client (local preview for dev-mock members).
   */
  private setupAudience(): void {
    if (!this.audioManager) return;

    const registry = new AudienceRegistry();
    this.audienceRegistry = registry;

    // Register the local participant (own camera position drives spatial cues).
    const selfId = 'self';
    registry.upsert({
      id: selfId,
      displayName: this.playerName,
      role: this.roleToParticipantRole(this.role),
      isLocal: true,
      audioEnabled: this.audioManager.isEnabled(),
      getPosition: () => this.camera.getWorldPosition(new THREE.Vector3()),
    });
    registry.setLocalId(selfId);

    // Dev mode: seed mock audience so the Director can audition private cues in
    // a single browser before multiplayer presence is wired.
    if (import.meta.env.DEV) {
      registry.seedMockAudience(3);
    }

    this.audienceCueEngine = new AudienceCueEngine({
      registry,
      audio: this.audioManager,
      network: {
        // Multiplayer: deliver a private cue only to the targeted participant.
        sendPrivateCue: (targetSocketId, payload) =>
          this.socketClient.sendPrivateCue(targetSocketId, payload),
      },
    });

    // Receive private cues addressed to this client and play them locally.
    this.socketClient.onPrivateCue((payload: PrivateCuePayload) => {
      this.audienceCueEngine?.handleRemotePrivateCue(payload);
    });

    // Global Calm / Reset (Stream Deck safety) — stop all private cues here.
    this.socketClient.onCalmReset(() => {
      this.audienceCueEngine?.calmReset();
    });

    // Mark local audio enabled after the first user gesture (autoplay policy).
    const markAudio = (): void => {
      registry.setAudioEnabled(selfId, true);
      window.removeEventListener('click', markAudio);
      window.removeEventListener('keydown', markAudio);
    };
    window.addEventListener('click', markAudio);
    window.addEventListener('keydown', markAudio);

    // Director gets the Audience panel; the audience stays immersive.
    if (this.role === 'Director') {
      this.audiencePanel = new AudiencePanel(registry, this.audienceCueEngine);
    }
  }

  /** Small non-blocking banner (e.g. "movement limited on phone"). */
  public showDeviceNotice(message: string): void {
    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText =
      'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:500;' +
      'max-width:90%;background:rgba(20,24,34,0.92);border:1px solid rgba(120,200,255,0.35);' +
      'color:#dfeaff;font:13px/1.4 "Segoe UI",sans-serif;padding:10px 16px;border-radius:10px;' +
      'text-align:center;box-shadow:0 4px 18px rgba(0,0,0,0.4);';
    document.body.appendChild(el);
    window.setTimeout(() => {
      el.style.transition = 'opacity 0.6s';
      el.style.opacity = '0';
      window.setTimeout(() => el.remove(), 700);
    }, 6000);
  }

  private roleToParticipantRole(role: string): ParticipantRole {
    const r = role.toLowerCase();
    if (r === 'director') return 'director';
    if (r === 'host') return 'host';
    if (r === 'actor') return 'actor';
    return 'audience';
  }

  private setupNPCs(): void {
    // Share the AudioManager listener with NPC spatial playback (one listener per camera).
    const listener = this.audioManager!.getListener();

    // The CueManager owns the NPC actors and applies authoritative server
    // updates. NPCs live in the world group so VR locomotion applies.
    this.cueManager = new CueManager({
      parent: this.sceneWrapper,
      listener,
      socket: this.socketClient,
      role: this.role,
      playerName: this.playerName,
      voicePipeline: this.webRTCVoicePipeline!,
      registerEmitter: (emitter) => this.audioManager!.registerEmitter(emitter),
      onEnsureAudio: () => this.audioManager!.enable(),
    });

    // Director gets the debug control panel; the audience stays immersive.
    if (this.role === 'Director') {
      this.npcDirectorPanel = new NPCDirectorPanel(this.cueManager);
    }

    // Hide NPCs until Act 1; show immediately if we already restored into Act 1.
    this.cueManager.setActVisible(
      this.showController?.getCurrentScene() === 'ACT_1_STORM_ROAD'
    );
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
    // All environment content goes in sceneWrapper so we can shift the world for VR locomotion.
    const wrap = this.sceneWrapper;

    // The theatrical scenes start in a black void; the ShowController owns the
    // per-scene lighting and geometry. We keep only a very dim hemisphere fill
    // (also handed to RoomController for its optional room_light toggle) so the
    // void isn't pure black before a scene's own lights are added.
    this.scene.background = new THREE.Color(0x000000);

    const hemisphereLight = new THREE.HemisphereLight(0x445566, 0x1a1820, 0.28);
    hemisphereLight.position.set(0, 20, 0);
    wrap.add(hemisphereLight);
    this.hemisphereLight = hemisphereLight;

    // Scene geometry (loading zone, Act 1) is built by ShowController; interactive
    // room geometry is built by RoomController from server data when present.
  }

  private setupFPSController(): void {
    // Unified input layer. Keyboard/mouse is always available (desktop); touch
    // and VR sources plug into the same InputManager (see setupMobileControls /
    // updateVRMovement). The FPSController only ever reads the aggregated result.
    this.input = new InputManager(this.renderer.domElement);
    this.fpsController = new FPSController(
      this.camera,
      this.renderer.domElement,
      this.role,
      this.input
    );

    if (getDeviceInfo().isMobile) {
      this.setupMobileControls();
    }
  }

  /**
   * Phone/tablet controls: on-screen joystick + touch look feeding the same
   * InputManager, a theatrical HUD, and a lighter render profile. Hidden on
   * desktop and never created in WebXR (headsets use controller input).
   */
  private setupMobileControls(): void {
    if (!this.input) return;
    this.setMobilePerformanceMode();

    // Hide the VR button on phones (no headset) to keep the view clean.
    const vrBtn = document.getElementById('VRButton');
    if (vrBtn) vrBtn.style.display = 'none';
    // Hide the desktop info/controls panel; the mobile HUD replaces it.
    const info = document.getElementById('info');
    if (info) info.style.display = 'none';

    this.touchControls = new TouchControls(this.input);

    this.mobileHUD = new MobileHUD({
      gyroSupported: supportsDeviceOrientation(),
      onEnableAudio: async () => {
        await this.audioManager?.enable();
        // Resume the realtime-voice context too, if present.
        try {
          await this.audioManager?.getListener().context.resume();
        } catch {
          /* ignore */
        }
        const selfId = this.socketClient.getSocketId();
        if (selfId) this.audienceRegistry?.setAudioEnabled(selfId, true);
      },
      onToggleGyro: async () => {
        if (!this.touchControls) return false;
        if (this.touchControls.isGyroEnabled()) {
          this.touchControls.disableGyro();
          return false;
        }
        return this.touchControls.enableGyro();
      },
      onRecenter: () => this.fpsController?.resetToSpawn(),
      onCalm: () => this.audienceCueEngine?.calmReset(),
      onLeave: () => {
        window.location.href = '/join';
      },
      onVolume: (v: number) => this.audioManager?.setGroupVolume('master', v),
      onReduceMotion: (on: boolean) => {
        this.reduceMotion = on;
      },
    });
  }

  /**
   * Lighter rendering for phones: cap pixel ratio, soften shadows. Audio quality
   * is intentionally left untouched.
   */
  public setMobilePerformanceMode(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = false;
  }

  /**
   * Audience Experience Modes (Participant / Follow / Observer, extensible to
   * Host/Director/Cinematic/Replay). The director keeps their own controls, so
   * this is for everyone else. The manager owns camera behavior; we just route
   * the per-frame camera update and the broadcast pose through it.
   */
  private setupExperience(): void {
    if (this.role === 'Director') return;
    if (!this.fpsController || !this.input || !this.audienceRegistry) return;

    this.experienceManager = new AudienceExperienceManager({
      camera: this.camera,
      fpsController: this.fpsController,
      input: this.input,
      registry: this.audienceRegistry,
      viewpoints: getDefaultViewpoints(),
      getTouchControls: () => this.touchControls,
      shouldBob: () => !this.reduceMotion,
      bob: () => this.addCameraBob(),
    });

    this.experienceMenu = new ExperienceMenu(this.experienceManager, this.audienceRegistry);
  }

  private setupNetworking(): void {
    // Handle remote player movements
    this.socketClient.onPlayerMove((data: any) => {
      this.updateRemotePlayer(data.id, data.position, data.rotation);
    });

    // Full sync of who is in the 3D scene (avoids duplicate avatars).
    this.socketClient.onLobbyState((data: { users: Array<{ id: string; name: string; role: string; inScene?: boolean }> }) => {
      this.syncInScenePlayers(data.users);
    });

    // Handle user joined (in-scene only — filtered in SocketClient)
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

  // Replace the remote-player set with the authoritative in-scene list.
  private syncInScenePlayers(users: Array<{ id: string; name: string; role: string; inScene?: boolean }>): void {
    const selfId = this.socketClient.getSocketId();
    const inScene = users.filter((u) => u.inScene === true && u.id !== selfId);
    const ids = new Set(inScene.map((u) => u.id));

    for (const id of Array.from(this.remotePlayers.keys())) {
      if (!ids.has(id)) this.removeRemotePlayer(id);
    }

    for (const u of inScene) {
      this.addRemotePlayer(u.id, u.name, u.role).catch((err) => {
        console.error(`Failed to sync remote player ${u.name}:`, err);
      });
    }
  }

  private async addRemotePlayer(id: string, name: string, role: string): Promise<void> {
    if (this.remotePlayers.has(id) || this.pendingRemoteAdds.has(id)) return;
    this.pendingRemoteAdds.add(id);

    try {
      const playerGroup = new THREE.Group();
      await this.loadPlayerModel(playerGroup, role, name);
      this.sceneWrapper.add(playerGroup);
      this.remotePlayers.set(id, playerGroup);
      playerGroup.position.set(0, PLAYER_BODY_CENTER_Y, 0);

      // Track this participant for personalized audience cues (position = avatar).
      this.audienceRegistry?.upsert({
        id,
        displayName: name,
        role: this.roleToParticipantRole(role),
        audioEnabled: true,
        object: playerGroup,
        getPosition: () => playerGroup.getWorldPosition(new THREE.Vector3()),
      });

      console.log(`➕ Added remote player: ${name} (${role})`);
    } finally {
      this.pendingRemoteAdds.delete(id);
    }
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
    sprite.position.y = ADULT_HEIGHT / 2 + 0.35;
    sprite.scale.set(2, 0.5, 1);
    playerGroup.add(sprite);
  }

  private createPlaceholderAvatar(playerGroup: THREE.Group, role: string, name: string): void {
    // Blocky body sized to match ARC adult dummies (1.8m). Group origin = capsule center.
    const bodyGeometry = new THREE.BoxGeometry(0.5, ADULT_HEIGHT, 0.4);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: role === 'Director' ? 0xffaa00 : role === 'Actor' ? 0x00aaff : 0xaa00ff
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0;
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
    this.pendingRemoteAdds.delete(id);
    const player = this.remotePlayers.get(id);
    if (player) {
      this.sceneWrapper.remove(player);
      this.remotePlayers.delete(id);
      // SAFETY: clear any lingering private cues for a departing participant.
      this.audioManager?.stopAllPrivate(id);
      this.audienceRegistry?.remove(id);
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

      // Update unified input, then drive the camera. When an experience manager
      // is present (audience), it owns camera behavior for the active mode
      // (Participant delegates to the FPSController; Follow/Observer take over).
      this.input?.update(delta);
      if (this.experienceManager) {
        this.experienceManager.update(delta, inVR);
      } else if (this.fpsController) {
        this.fpsController.update(delta);
        if (!inVR && !this.reduceMotion) this.addCameraBob();
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

      // Advance theatrical show effects (rain, lightning, fades)
      this.showController?.update(delta);

      // Advance spatial audio (moving emitters)
      this.audioManager?.update(delta);
      this.webRTCVoicePipeline?.update(this.camera, delta);

      if (this.webRTCVoiceDebug) {
        this.webRTCVoiceDebugRefresh += delta;
        if (this.webRTCVoiceDebugRefresh > 0.5) {
          this.webRTCVoiceDebugRefresh = 0;
          this.webRTCVoiceDebug.refresh();
        }
      }

      if (this.audioDebugPanel?.isOpen()) {
        this.audioDebugRefresh += delta;
        if (this.audioDebugRefresh > 1) {
          this.audioDebugRefresh = 0;
          this.audioDebugPanel.refresh();
        }
      }

      // Advance NPC actors (talking indicators, etc.)
      this.cueManager?.update(delta);

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
    if (!this.fpsController) return;
    // In Follow/Observer modes the camera no longer represents the avatar, so the
    // manager returns the frozen first-person pose — keeping this viewer's avatar
    // stable for everyone else while they watch.
    const pose = this.experienceManager
      ? this.experienceManager.getBroadcastPose()
      : { position: this.fpsController.getPosition(), rotation: this.fpsController.getRotation() };
    this.socketClient.sendPlayerMove(
      { x: pose.position.x, y: pose.position.y, z: pose.position.z },
      { x: pose.rotation.x, y: pose.rotation.y, z: pose.rotation.z }
    );
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

