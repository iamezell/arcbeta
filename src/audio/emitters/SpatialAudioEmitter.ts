import * as THREE from 'three';
import {
  SpatialPreset,
  SPATIAL_PRESETS,
  applySpatialPreset,
  speechMuffleCutoff,
} from '../spatialConfig';

export interface EmitterDebugInfo {
  id: string;
  kind: string;
  label: string;
  position: THREE.Vector3;
  refDistance: number;
  maxDistance: number;
  volume: number;
  distanceToListener: number;
  occlusionFactor: number;
  active: boolean;
}

export interface SpatialAudioEmitterOpts {
  id: string;
  kind: string;
  label: string;
  parent: THREE.Object3D;
  listener: THREE.AudioListener;
  preset: SpatialPreset;
  occlusionFactor?: number;
  enableSpeechMuffle?: boolean;
}

type PositionalAudioInternal = THREE.PositionalAudio & { panner: PannerNode };

/**
 * World-space audio emitter for buffered cues (THREE.PositionalAudio).
 * WebRTC live voice uses WebRTCVoicePipeline — not this class.
 */
export class SpatialAudioEmitter {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly preset: SpatialPreset;
  readonly audio: THREE.PositionalAudio;
  readonly parent: THREE.Object3D;

  protected listener: THREE.AudioListener;
  protected occlusionFactor = 1;
  protected enableSpeechMuffle = false;
  protected muffleFilter: BiquadFilterNode | null = null;
  protected bufferSourceConnected = false;

  private readonly worldPos = new THREE.Vector3();
  private _disposed = false;

  constructor(opts: SpatialAudioEmitterOpts) {
    this.id = opts.id;
    this.kind = opts.kind;
    this.label = opts.label;
    this.parent = opts.parent;
    this.listener = opts.listener;
    this.preset = opts.preset;
    this.occlusionFactor = opts.occlusionFactor ?? 1;
    this.enableSpeechMuffle = opts.enableSpeechMuffle ?? false;

    this.audio = new THREE.PositionalAudio(opts.listener);
    applySpatialPreset(this.audio, opts.preset);

    const y = SPATIAL_PRESETS[opts.preset].localOffsetY;
    this.audio.position.set(0, y, 0);
    this.parent.add(this.audio);
  }

  setOcclusionFactor(factor: number): void {
    this.occlusionFactor = THREE.MathUtils.clamp(factor, 0, 1);
  }

  playBuffer(buffer: AudioBuffer, loop = false): void {
    this.audio.setBuffer(buffer);
    this.audio.setLoop(loop);
    this.audio.play();
    this.bufferSourceConnected = true;
    this.syncPannerPosition(true);
  }

  stop(): void {
    this.audio.stop();
  }

  isPlaying(): boolean {
    return this.audio.isPlaying;
  }

  update(_delta: number): void {
    if (this._disposed) return;

    if (this.audio.isPlaying) {
      this.syncPannerPosition();
    }

    if (!this.enableSpeechMuffle || !this.muffleFilter) return;

    const listenerWorld = new THREE.Vector3();
    this.listener.getWorldPosition(listenerWorld);
    const distance = this.worldPos.distanceTo(listenerWorld);
    const cfg = SPATIAL_PRESETS[this.preset];
    if (distance > cfg.maxDistance * 1.2) return;

    this.muffleFilter.frequency.value = speechMuffleCutoff(distance, this.occlusionFactor);
  }

  getDebugInfo(): EmitterDebugInfo {
    this.syncPannerPosition(true);
    const listenerWorld = new THREE.Vector3();
    this.listener.getWorldPosition(listenerWorld);
    const panner = (this.audio as PositionalAudioInternal).panner;
    const distance = this.worldPos.distanceTo(listenerWorld);

    return {
      id: this.id,
      kind: this.kind,
      label: this.label,
      position: this.worldPos.clone(),
      refDistance: panner?.refDistance ?? this.audio.getRefDistance(),
      maxDistance: panner?.maxDistance ?? this.audio.getMaxDistance(),
      volume: this.audio.getVolume(),
      distanceToListener: distance,
      occlusionFactor: this.occlusionFactor,
      active: this.audio.isPlaying,
    };
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    try {
      this.audio.disconnect();
    } catch { /* no-op */ }
    this.parent.remove(this.audio);
  }

  syncPannerPosition(refreshWorldMatrices = false): void {
    if (refreshWorldMatrices) {
      let root: THREE.Object3D = this.audio;
      while (root.parent) root = root.parent;
      root.updateMatrixWorld(true);
    }

    this.audio.getWorldPosition(this.worldPos);
    const panner = (this.audio as PositionalAudioInternal).panner;
    if (!panner) return;

    const t = this.listener.context.currentTime;
    if (panner.positionX) {
      panner.positionX.setValueAtTime(this.worldPos.x, t);
      panner.positionY.setValueAtTime(this.worldPos.y, t);
      panner.positionZ.setValueAtTime(this.worldPos.z, t);
    } else {
      panner.setPosition(this.worldPos.x, this.worldPos.y, this.worldPos.z);
    }
  }
}
