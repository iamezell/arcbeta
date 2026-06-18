import * as THREE from 'three';
import { CueAssetLoader } from './CueAssetLoader';
import { resolveCue, isGlobalCue, getSpatialPreset } from './cueRegistry';
import { SpatialAudioEmitter } from './emitters/SpatialAudioEmitter';
import { AmbientAudioEmitter } from './emitters';
import { applySpatialPreset, SPATIAL_PRESETS } from './spatialConfig';
import {
  AudioDebugState,
  CueDefinition,
  CueEvent,
  CueScope,
  EmitterDebugSnapshot,
  FadeToOptions,
  MovingCueOptions,
  PlayCueOptions,
  PlayLoopOptions,
  PlayPositionalOptions,
  SpatialDefaults,
  VolumeGroup,
} from './cueRegistry/types';

export type PlayerPositionProvider = () => THREE.Vector3[];

interface AudioManagerOpts {
  camera: THREE.Camera;
  sceneParent: THREE.Object3D;
  listener?: THREE.AudioListener;
  getPlayerPositions: PlayerPositionProvider;
}

interface ActiveInstance {
  id: string;
  cueName: string;
  resolvedName: string;
  audio: THREE.Audio | THREE.PositionalAudio;
  emitter?: THREE.Object3D;
  group: VolumeGroup;
  spatial: boolean;
}

interface AmbienceLayer {
  layer: string;
  cueName: string;
  audio: THREE.Audio | THREE.PositionalAudio;
  emitter?: THREE.Object3D;
  spatialEmitter?: AmbientAudioEmitter;
  targetVolume: number;
  spatial: boolean;
}

interface MovingEmitter {
  id: string;
  cueName: string;
  object: THREE.Object3D;
  audio: THREE.PositionalAudio;
  points: THREE.Vector3[];
  segmentIndex: number;
  segmentT: number;
  segmentDuration: number;
  loopPath: boolean;
}

let instanceCounter = 0;

/**
 * Central ARC soundboard — cue-name driven, Opus-first, spatial-aware.
 *
 * Usage (never pass file paths or extensions):
 *   audio.playCue('wolf_howl_far')
 *   audio.triggerCue('thunder')       // theatrical alias + variant pick
 *   audio.playLoop('rain_light', { layer: 'weather' })
 *   audio.fadeTo('rain_heavy', { layer: 'weather', duration: 3 })
 *   audio.playPositional('church_bell', position)
 */
export class AudioManager {
  private camera: THREE.Camera;
  private sceneParent: THREE.Object3D;
  private listener: THREE.AudioListener;
  private getPlayerPositions: PlayerPositionProvider;
  private assetLoader: CueAssetLoader;

  private enabled = false;
  private enableButton: HTMLButtonElement | null = null;

  private groupVolume: Record<VolumeGroup, number> = {
    master: 1,
    sfx: 1,
    ambience: 1,
    music: 1,
    voice: 1,
    ui: 1,
  };

  private instances: ActiveInstance[] = [];
  private ambienceLayers = new Map<string, AmbienceLayer>();
  private movingEmitters: MovingEmitter[] = [];
  /** resolved cue name → active count (for maxInstances). */
  private instanceCounts = new Map<string, number>();

  /** Last theatrical events (for debug / future multiplayer sync). */
  private recentEvents: CueEvent[] = [];

  /** Persistent world emitters (NPC voices, future player voice). */
  private registeredEmitters: SpatialAudioEmitter[] = [];

  constructor(opts: AudioManagerOpts) {
    this.camera = opts.camera;
    this.sceneParent = opts.sceneParent;
    this.getPlayerPositions = opts.getPlayerPositions;
    this.listener = opts.listener ?? new THREE.AudioListener();
    if (!opts.listener) this.camera.add(this.listener);
    this.assetLoader = new CueAssetLoader(this.listener.context);
    this.createEnableButton();
  }

  getListener(): THREE.AudioListener {
    return this.listener;
  }

  /** Register a persistent world emitter (NPC voice, player voice, prop loop). */
  registerEmitter(emitter: SpatialAudioEmitter): void {
    if (!this.registeredEmitters.includes(emitter)) {
      this.registeredEmitters.push(emitter);
    }
  }

  unregisterEmitter(emitter: SpatialAudioEmitter): void {
    this.registeredEmitters = this.registeredEmitters.filter((e) => e !== emitter);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async enable(): Promise<void> {
    const ctx = this.listener.context;
    if (ctx.state === 'suspended') await ctx.resume();
    this.enabled = true;
    if (this.enableButton) this.enableButton.style.display = 'none';
    console.log('🔊 ARC audio enabled');
  }

  setGroupVolume(group: VolumeGroup, volume: number): void {
    this.groupVolume[group] = THREE.MathUtils.clamp(volume, 0, 1);
    this.instances.forEach((inst) => this.applyVolume(inst));
    this.ambienceLayers.forEach((layer) => this.applyAmbienceVolume(layer));
  }

  getPlayerGroupCenter(out = new THREE.Vector3()): THREE.Vector3 {
    const positions = this.getPlayerPositions();
    if (positions.length === 0) {
      this.camera.getWorldPosition(out);
      return out;
    }
    out.set(0, 0, 0);
    for (const p of positions) out.add(p);
    out.multiplyScalar(1 / positions.length);
    return out;
  }

  offsetFromGroupCenter(offset: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    const center = this.getPlayerGroupCenter(out);
    const yaw = this.camera.rotation.y;
    return center.clone().add(offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  }

  // ---------- theatrical API (director / Stream Deck) ----------

  /** Live soundboard trigger — resolves variants, returns sync-ready event metadata. */
  triggerCue(cueName: string, options?: PlayCueOptions): CueEvent | null {
    const seed = options?.seed ?? Math.random();
    const resolved = resolveCue(cueName, { seed, noVariants: options?.noVariants });
    if (!resolved) return null;

    void this.playCue(cueName, { ...options, seed });

    const event: CueEvent = {
      cueName,
      resolvedCue: resolved.name,
      scope: (resolved.def.scope ?? 'director') as CueScope,
      seed,
      timestamp: Date.now(),
    };
    if (options?.position) {
      event.position = { x: options.position.x, y: options.position.y, z: options.position.z };
    }
    this.recentEvents.push(event);
    if (this.recentEvents.length > 32) this.recentEvents.shift();
    return event;
  }

  /** Play a one-shot (or loop=false) cue by name. */
  async playCue(cueName: string, options: PlayCueOptions = {}): Promise<string | null> {
    if (!this.enabled) return null;

    const resolved = resolveCue(cueName, { seed: options.seed, noVariants: options.noVariants });
    if (!resolved) return null;

    if (resolved.def.loop) {
      await this.playLoop(resolved.name, {
        layer: cueName,
        volume: options.volume,
        fadeIn: 1.5,
        position: options.position,
      });
      return cueName;
    }

    if (!this.canPlayInstance(resolved.name, resolved.def.maxInstances ?? 3)) return null;

    const spatial = this.shouldBeSpatial(resolved.def, options);
    let position = options.position;
    if (spatial && !position) {
      // World cue without explicit origin — place near the listener (small-room fallback).
      position = this.getPlayerGroupCenter().clone();
      position.y += 1;
    }
    const buffer = await this.assetLoader.load(resolved.library, resolved.asset, resolved.name);
    const pitch = options.pitch ?? this.randomPitch(resolved.def.pitchVariation);
    const volume = this.computeVolume(resolved.def, options.volume, resolved.def.volumeVariation);

    if (spatial && position) {
      const preset = getSpatialPreset(resolved.def);
      const cfg = this.spatialConfig(resolved.def);
      return this.spawnPositional(resolved.name, resolved.name, buffer, position, {
        volume,
        pitch,
        loop: false,
        refDistance: cfg.refDistance,
        maxDistance: cfg.maxDistance,
        rolloffFactor: cfg.rolloffFactor,
        group: resolved.def.group ?? 'sfx',
        preset,
      });
    }

    return this.spawnGlobal(resolved.name, resolved.name, buffer, { volume, pitch, loop: false, group: resolved.def.group ?? 'sfx' });
  }

  async playLoop(cueName: string, options: PlayLoopOptions = {}): Promise<void> {
    if (!this.enabled) return;
    const resolved = resolveCue(cueName, { noVariants: true });
    if (!resolved) return;

    const layer = options.layer ?? cueName;
    this.stopLoop(layer, 0);

    const buffer = await this.assetLoader.load(resolved.library, resolved.asset, resolved.name);
    const targetVol = this.computeVolume(resolved.def, options.volume ?? resolved.def.volume, undefined);
    const global = isGlobalCue(resolved.def);

    if (global) {
      const audio = new THREE.Audio(this.listener);
      audio.setBuffer(buffer);
      audio.setLoop(true);
      audio.setVolume(options.fadeIn ? 0 : targetVol);
      audio.play();

      this.ambienceLayers.set(layer, {
        layer,
        cueName: resolved.name,
        audio,
        targetVolume: targetVol,
        spatial: false,
      });
      if (options.fadeIn && options.fadeIn > 0) {
        this.fadeAudioVolume(audio, 0, targetVol, options.fadeIn);
      }
      return;
    }

    // World ambience loop — requires a physical origin.
    const position = options.position ?? this.getPlayerGroupCenter().clone();
    const emitterObj = new THREE.Object3D();
    emitterObj.position.copy(position);
    this.sceneParent.add(emitterObj);

    const spatialEmitter = new AmbientAudioEmitter({
      id: `ambient-${layer}`,
      label: layer,
      parent: emitterObj,
      listener: this.listener,
    });
    spatialEmitter.playLoop(buffer);
    spatialEmitter.audio.setVolume(options.fadeIn ? 0 : targetVol);

    this.ambienceLayers.set(layer, {
      layer,
      cueName: resolved.name,
      audio: spatialEmitter.audio,
      emitter: emitterObj,
      spatialEmitter,
      targetVolume: targetVol,
      spatial: true,
    });
    if (options.fadeIn && options.fadeIn > 0) {
      this.fadeAudioVolume(spatialEmitter.audio, 0, targetVol, options.fadeIn);
    }
  }

  stopLoop(layerOrCue: string, fadeOut = 0.5): void {
    const layer = this.ambienceLayers.get(layerOrCue);
    if (!layer) return;
    this.ambienceLayers.delete(layerOrCue);

    const cleanup = (): void => {
      layer.audio.stop();
      if (layer.spatialEmitter) layer.spatialEmitter.dispose();
      if (layer.emitter) this.sceneParent.remove(layer.emitter);
    };

    if (fadeOut <= 0) {
      cleanup();
      return;
    }
    const start = layer.audio.getVolume();
    this.fadeAudioVolume(layer.audio, start, 0, fadeOut, cleanup);
  }

  /** Crossfade an ambience layer to a new cue (e.g. rain_light → rain_heavy). */
  async fadeTo(cueName: string, options: FadeToOptions = {}): Promise<void> {
    const layer = options.layer ?? 'ambience';
    const duration = options.duration ?? 2.5;
    const existing = this.ambienceLayers.get(layer);

    if (existing) {
      const start = existing.audio.getVolume();
      this.fadeAudioVolume(existing.audio, start, 0, duration, () => existing.audio.stop());
      this.ambienceLayers.delete(layer);
    }

    await this.playLoop(cueName, { layer, fadeIn: duration, volume: options.volume });
  }

  async playPositional(cueName: string, position: THREE.Vector3, options: PlayPositionalOptions = {}): Promise<string | null> {
    if (!this.enabled) return null;
    const resolved = resolveCue(cueName, { noVariants: true });
    if (!resolved) return null;
    if (!this.canPlayInstance(resolved.name, resolved.def.maxInstances ?? 3)) return null;

    const buffer = await this.assetLoader.load(resolved.library, resolved.asset, resolved.name);
    const spatial = this.spatialConfig(resolved.def);
    const preset = getSpatialPreset(resolved.def);
    return this.spawnPositional(cueName, resolved.name, buffer, position, {
      volume: this.computeVolume(resolved.def, options.volume, resolved.def.volumeVariation),
      pitch: options.pitch ?? this.randomPitch(resolved.def.pitchVariation),
      loop: options.loop ?? false,
      refDistance: options.refDistance ?? spatial.refDistance,
      maxDistance: options.maxDistance ?? spatial.maxDistance,
      rolloffFactor: options.rolloffFactor ?? spatial.rolloffFactor,
      group: resolved.def.group ?? 'sfx',
      preset,
    });
  }

  /** Stop all playing instances matching a cue name (requested or resolved). */
  stopCue(cueName: string): void {
    for (const inst of [...this.instances]) {
      if (inst.cueName === cueName || inst.resolvedName === cueName) {
        this.disposeInstance(inst);
      }
    }
    if (this.ambienceLayers.has(cueName)) this.stopLoop(cueName);
  }

  /** Moving positional cue along a path (e.g. wolf circling the group). */
  async playMovingCue(
    cueName: string,
    pathPoints: THREE.Vector3[],
    options: MovingCueOptions
  ): Promise<void> {
    if (!this.enabled || pathPoints.length < 2) return;
    const resolved = resolveCue(cueName, { noVariants: true });
    if (!resolved) return;

    const buffer = await this.assetLoader.load(resolved.library, resolved.asset, resolved.name);
    const object = new THREE.Object3D();
    object.position.copy(pathPoints[0]);
    this.sceneParent.add(object);

    const audio = new THREE.PositionalAudio(this.listener);
    audio.setBuffer(buffer);
    applySpatialPreset(audio, getSpatialPreset(resolved.def));
    if (options.refDistance !== undefined) audio.setRefDistance(options.refDistance);
    if (options.maxDistance !== undefined) audio.setMaxDistance(options.maxDistance);
    if (options.rolloffFactor !== undefined) audio.setRolloffFactor(options.rolloffFactor);
    audio.setLoop(options.loop ?? false);
    const vol = this.computeVolume(resolved.def, options.volume, resolved.def.volumeVariation);
    audio.setVolume(vol);
    audio.setPlaybackRate(options.pitch ?? this.randomPitch(resolved.def.pitchVariation));
    object.add(audio);
    audio.play();

    const id = `move-${++instanceCounter}`;
    this.movingEmitters.push({
      id,
      cueName: resolved.name,
      object,
      audio,
      points: pathPoints.map((p) => p.clone()),
      segmentIndex: 0,
      segmentT: 0,
      segmentDuration: options.duration / Math.max(1, pathPoints.length - 1),
      loopPath: options.loop ?? false,
    });

    if (!options.loop) {
      audio.onEnded = () => this.removeMovingEmitter(id);
    }
  }

  update(delta: number): void {
    this.syncListenerAndWorld();

    for (const emitter of this.registeredEmitters) {
      emitter.update(delta);
    }

    for (let i = this.movingEmitters.length - 1; i >= 0; i--) {
      const m = this.movingEmitters[i];
      if (!m.audio.isPlaying && !m.loopPath) {
        this.removeMovingEmitter(m.id);
        continue;
      }
      m.segmentT += delta;
      const t = Math.min(1, m.segmentT / m.segmentDuration);
      const from = m.points[m.segmentIndex];
      const to = m.points[m.segmentIndex + 1] ?? m.points[0];
      m.object.position.lerpVectors(from, to, t);
      m.object.updateMatrixWorld(true);
      m.audio.updateMatrixWorld(true);

      if (m.segmentT >= m.segmentDuration) {
        m.segmentIndex++;
        m.segmentT = 0;
        if (m.segmentIndex >= m.points.length - 1) {
          if (m.loopPath) m.segmentIndex = 0;
          else m.segmentIndex = m.points.length - 2;
        }
      }
    }

    this.instances = this.instances.filter((inst) => {
      if (inst.audio.isPlaying) return true;
      this.disposeInstance(inst, false);
      return false;
    });
  }

  /**
   * Camera is not in the scene graph, so the AudioListener never gets automatic
   * matrix updates. Sync the Web Audio API listener to the camera each frame.
   */
  private syncListenerAndWorld(): void {
    let root: THREE.Object3D = this.sceneParent;
    while (root.parent) root = root.parent;
    root.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.listener.updateMatrixWorld(true);

    const ctx = this.listener.context;
    const apiListener = ctx.listener;
    const t = ctx.currentTime;

    const pos = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    this.camera.getWorldPosition(pos);
    this.camera.getWorldDirection(forward);

    if (apiListener.positionX) {
      apiListener.positionX.setValueAtTime(pos.x, t);
      apiListener.positionY.setValueAtTime(pos.y, t);
      apiListener.positionZ.setValueAtTime(pos.z, t);
      apiListener.forwardX.setValueAtTime(forward.x, t);
      apiListener.forwardY.setValueAtTime(forward.y, t);
      apiListener.forwardZ.setValueAtTime(forward.z, t);
      apiListener.upX.setValueAtTime(up.x, t);
      apiListener.upY.setValueAtTime(up.y, t);
      apiListener.upZ.setValueAtTime(up.z, t);
    } else {
      apiListener.setPosition(pos.x, pos.y, pos.z);
      apiListener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  getDebugState(): AudioDebugState {
    const registeredEmitters = this.collectEmitterSnapshots();
    return {
      enabled: this.enabled,
      loadedCues: this.assetLoader.getLoadedKeys(),
      activeInstances: this.instances.map((i) => ({
        id: i.id,
        cue: i.cueName,
        resolved: i.resolvedName,
        group: i.group,
        spatial: i.spatial,
      })),
      ambienceLayers: [...this.ambienceLayers.values()].map((l) => ({
        layer: l.layer,
        cue: l.cueName,
        spatial: l.spatial,
      })),
      movingEmitters: this.movingEmitters.length,
      registeredEmitters,
      cacheEntries: this.assetLoader.getCacheSize(),
      estimatedMemoryBytes: this.assetLoader.estimateMemoryBytes(),
    };
  }

  getEmitterSnapshots(): EmitterDebugSnapshot[] {
    return this.collectEmitterSnapshots();
  }

  private collectEmitterSnapshots(): EmitterDebugSnapshot[] {
    const out: EmitterDebugSnapshot[] = this.registeredEmitters.map((e) => {
      const info = e.getDebugInfo();
      return {
        id: info.id,
        kind: info.kind,
        label: info.label,
        x: info.position.x,
        y: info.position.y,
        z: info.position.z,
        refDistance: info.refDistance,
        maxDistance: info.maxDistance,
        volume: info.volume,
        distanceToListener: info.distanceToListener,
        active: info.active,
      };
    });

    for (const inst of this.instances) {
      if (!inst.spatial || !inst.emitter) continue;
      const pos = new THREE.Vector3();
      inst.emitter.getWorldPosition(pos);
      const listenerPos = new THREE.Vector3();
      this.listener.getWorldPosition(listenerPos);
      const pa = inst.audio as THREE.PositionalAudio;
      out.push({
        id: inst.id,
        kind: 'cue',
        label: inst.cueName,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        refDistance: pa.getRefDistance(),
        maxDistance: pa.getMaxDistance(),
        volume: pa.getVolume(),
        distanceToListener: pos.distanceTo(listenerPos),
        active: pa.isPlaying,
      });
    }

    return out;
  }

  getRecentEvents(): CueEvent[] {
    return [...this.recentEvents];
  }

  // ---------- internals ----------

  private async spawnGlobal(
    cueName: string,
    resolvedName: string,
    buffer: AudioBuffer,
    opts: { volume: number; pitch: number; loop: boolean; group: VolumeGroup }
  ): Promise<string> {
    const audio = new THREE.Audio(this.listener);
    audio.setBuffer(buffer);
    audio.setLoop(opts.loop);
    audio.setPlaybackRate(opts.pitch);
    audio.setVolume(opts.volume * this.groupVolume[opts.group] * this.groupVolume.master);
    audio.play();

    const id = `g-${++instanceCounter}`;
    const inst: ActiveInstance = {
      id,
      cueName,
      resolvedName,
      audio,
      group: opts.group,
      spatial: false,
    };
    this.trackInstance(inst);
    if (!opts.loop) {
      audio.onEnded = () => this.disposeInstance(inst);
    }
    return id;
  }

  private async spawnPositional(
    cueName: string,
    resolvedName: string,
    buffer: AudioBuffer,
    position: THREE.Vector3,
    opts: PlayPositionalOptions & { pitch: number; group: VolumeGroup; preset?: import('./spatialConfig').SpatialPreset }
  ): Promise<string> {
    const emitter = new THREE.Object3D();
    emitter.position.copy(position);
    this.sceneParent.add(emitter);

    const audio = new THREE.PositionalAudio(this.listener);
    audio.setBuffer(buffer);
    if (opts.preset) {
      applySpatialPreset(audio, opts.preset);
    }
    if (opts.refDistance !== undefined) audio.setRefDistance(opts.refDistance);
    if (opts.maxDistance !== undefined) audio.setMaxDistance(opts.maxDistance);
    if (opts.rolloffFactor !== undefined) audio.setRolloffFactor(opts.rolloffFactor);
    audio.setLoop(opts.loop ?? false);
    audio.setPlaybackRate(opts.pitch);
    audio.setVolume((opts.volume ?? 1) * this.groupVolume[opts.group] * this.groupVolume.master);
    emitter.add(audio);
    audio.play();

    const id = `p-${++instanceCounter}`;
    const inst: ActiveInstance = {
      id,
      cueName,
      resolvedName,
      audio,
      emitter,
      group: opts.group,
      spatial: true,
    };
    this.trackInstance(inst);
    if (!opts.loop) {
      audio.onEnded = () => this.disposeInstance(inst);
    }
    return id;
  }

  private trackInstance(inst: ActiveInstance): void {
    this.instances.push(inst);
    const n = (this.instanceCounts.get(inst.resolvedName) ?? 0) + 1;
    this.instanceCounts.set(inst.resolvedName, n);
  }

  private disposeInstance(inst: ActiveInstance, removeFromList = true): void {
    inst.audio.stop();
    if (inst.emitter) {
      inst.emitter.remove(inst.audio);
      this.sceneParent.remove(inst.emitter);
    }
    const n = (this.instanceCounts.get(inst.resolvedName) ?? 1) - 1;
    if (n <= 0) this.instanceCounts.delete(inst.resolvedName);
    else this.instanceCounts.set(inst.resolvedName, n);
    if (removeFromList) {
      this.instances = this.instances.filter((i) => i.id !== inst.id);
    }
  }

  private removeMovingEmitter(id: string): void {
    const idx = this.movingEmitters.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const m = this.movingEmitters[idx];
    m.object.remove(m.audio);
    this.sceneParent.remove(m.object);
    this.movingEmitters.splice(idx, 1);
  }

  private canPlayInstance(resolvedName: string, max: number): boolean {
    return (this.instanceCounts.get(resolvedName) ?? 0) < max;
  }

  private shouldBeSpatial(def: CueDefinition, options: PlayCueOptions): boolean {
    if (options.forceSpatial) return true;
    if (isGlobalCue(def)) return !!options.position;
    return true;
  }

  private spatialConfig(def: CueDefinition): Required<SpatialDefaults> {
    if (typeof def.spatial === 'object') {
      const preset = getSpatialPreset(def);
      const base = SPATIAL_PRESETS[preset];
      return {
        refDistance: def.spatial.refDistance ?? base.refDistance,
        maxDistance: def.spatial.maxDistance ?? base.maxDistance,
        rolloffFactor: def.spatial.rolloffFactor ?? base.rolloffFactor,
      };
    }
    const preset = getSpatialPreset(def);
    const cfg = SPATIAL_PRESETS[preset];
    return {
      refDistance: cfg.refDistance,
      maxDistance: cfg.maxDistance,
      rolloffFactor: cfg.rolloffFactor,
    };
  }

  private randomPitch(range?: [number, number]): number {
    if (!range) return 1;
    return range[0] + Math.random() * (range[1] - range[0]);
  }

  private computeVolume(
    def: { volume?: number; group?: VolumeGroup },
    override?: number,
    variation?: [number, number]
  ): number {
    let v = override ?? def.volume ?? 1;
    if (variation) v *= variation[0] + Math.random() * (variation[1] - variation[0]);
    const group = def.group ?? 'sfx';
    return v * this.groupVolume[group] * this.groupVolume.master;
  }

  private applyVolume(inst: ActiveInstance): void {
    const base = inst.audio.getVolume() / (this.groupVolume[inst.group] * this.groupVolume.master || 1);
    inst.audio.setVolume(base * this.groupVolume[inst.group] * this.groupVolume.master);
  }

  private applyAmbienceVolume(layer: AmbienceLayer): void {
    layer.audio.setVolume(layer.targetVolume * this.groupVolume.ambience * this.groupVolume.master);
  }

  private fadeAudioVolume(
    audio: THREE.Audio,
    from: number,
    to: number,
    durationSec: number,
    onDone?: () => void
  ): void {
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / (durationSec * 1000));
      audio.setVolume(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(tick);
      else onDone?.();
    };
    requestAnimationFrame(tick);
  }

  private createEnableButton(): void {
    const btn = document.createElement('button');
    btn.id = 'arc-enable-audio';
    btn.textContent = '🔊 Enable Audio';
    btn.style.cssText = `
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      z-index: 600; padding: 10px 20px; border: 0; border-radius: 8px;
      background: #3a6cff; color: #fff; font: 15px 'Segoe UI', sans-serif;
      cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    `;
    btn.addEventListener('click', () => void this.enable());
    document.body.appendChild(btn);
    this.enableButton = btn;
    window.addEventListener('keydown', () => void this.enable(), { once: true });
    window.addEventListener('click', () => void this.enable(), { once: true });
  }
}
