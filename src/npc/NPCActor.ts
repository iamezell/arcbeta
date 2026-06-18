import * as THREE from 'three';
import { NPCAudioEmitter } from '../audio/emitters';
import { SpatialAudioEmitter } from '../audio/emitters/SpatialAudioEmitter';
import { ActorInterface } from './ActorInterface';
import { NPCStateMachine } from './NPCStateMachine';
import {
  ActorKind,
  DirectorCue,
  NPCEmotion,
  NPCPublicSnapshot,
  NPCState,
} from './types';

export interface NPCActorOpts {
  snapshot: NPCPublicSnapshot;
  parent: THREE.Object3D;
  listener: THREE.AudioListener;
  // Who is driving this NPC (must be known before subclass fields initialize).
  actorKind: ActorKind;
  // Push a subtitle to the shared overlay.
  onSubtitle: (npcId: string, speaker: string, text: string) => void;
  /** Register world-space emitter with AudioManager for debug + per-frame updates. */
  registerEmitter?: (emitter: SpatialAudioEmitter) => void;
}

// Common functionality shared by every NPC driver (human or AI): the 3D
// presence (placeholder body + name label), the talking indicator, spatial
// audio plumbing, subtitle output, and animation hooks. Subclasses add the
// driver-specific behaviour (live WebRTC vs. human-performed).
export abstract class NPCActor implements ActorInterface {
  abstract readonly kind: ActorKind;

  protected snapshot: NPCPublicSnapshot;
  protected parent: THREE.Object3D;
  protected listener: THREE.AudioListener;
  protected actorKind: ActorKind;
  protected onSubtitle: (npcId: string, speaker: string, text: string) => void;

  protected group: THREE.Group;
  protected body: THREE.Mesh;
  protected indicator: THREE.Mesh;
  protected voiceEmitter: NPCAudioEmitter;
  protected labelSprite: THREE.Sprite | null = null;

  protected currentState: NPCState;
  protected currentEmotion: NPCEmotion;
  protected talking = false;
  protected talkPhase = 0;

  constructor(opts: NPCActorOpts) {
    this.snapshot = opts.snapshot;
    this.parent = opts.parent;
    this.listener = opts.listener;
    this.actorKind = opts.actorKind;
    this.onSubtitle = opts.onSubtitle;
    this.currentState = opts.snapshot.currentState;
    this.currentEmotion = opts.snapshot.currentEmotion;

    this.group = new THREE.Group();
    this.group.position.set(
      opts.snapshot.location.x,
      opts.snapshot.location.y,
      opts.snapshot.location.z
    );

    // Placeholder body (greybox), tinted by who is driving the role.
    const bodyColor = this.bodyColor();
    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45, 1.1, 4, 8),
      new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyColor,
        emissiveIntensity: 0.45,
        roughness: 0.6,
      })
    );
    this.body.position.y = 1.0;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Talking indicator: a small sphere above the head, coloured by emotion and
    // pulsing while the NPC speaks.
    this.indicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      new THREE.MeshStandardMaterial({
        color: NPCStateMachine.colorForEmotion(this.currentEmotion),
        emissive: NPCStateMachine.colorForEmotion(this.currentEmotion),
        emissiveIntensity: 0.4,
      })
    );
    this.indicator.position.y = 2.1;
    this.group.add(this.indicator);

    // Positional voice at the NPC's mouth — moves with the actor.
    this.voiceEmitter = new NPCAudioEmitter({
      id: `npc-voice-${opts.snapshot.id}`,
      label: opts.snapshot.name,
      parent: this.group,
      listener: opts.listener,
    });
    opts.registerEmitter?.(this.voiceEmitter);

    this.buildLabel();
    this.parent.add(this.group);
  }

  // ---------- ActorInterface (common implementations) ----------

  // Default cue handling: advance local state + perform the failsafe scripted
  // line as a subtitle. Subclasses extend (AI nudges the live model instead).
  receiveCue(cue: DirectorCue, scriptedLine?: string): void {
    if (NPCStateMachine.isStateCue(cue)) {
      const next = NPCStateMachine.nextState(this.currentState, cue);
      this.setState(next, NPCStateMachine.emotionForState(next));
    }
    if (scriptedLine) this.performLine(scriptedLine);
  }

  setState(state: NPCState, emotion: NPCEmotion): void {
    this.currentState = state;
    this.currentEmotion = emotion;
    const color = NPCStateMachine.colorForEmotion(emotion);
    const mat = this.indicator.material as THREE.MeshStandardMaterial;
    mat.color.setHex(color);
    mat.emissive.setHex(color);
    // SILENT mode: dim the indicator and never speak.
    mat.emissiveIntensity = state === 'SILENT' ? 0.05 : 0.4;
  }

  abstract enableConversation(): void;
  abstract disableConversation(): void;
  abstract speak(text?: string): void;
  abstract yieldControl(): void;
  abstract takeOver(): void;

  dispose(): void {
    this.setTalking(false);
    this.voiceEmitter.dispose();
    this.parent.remove(this.group);
  }

  // ---------- shared helpers ----------

  getId(): string {
    return this.snapshot.id;
  }

  getSnapshot(): NPCPublicSnapshot {
    return this.snapshot;
  }

  applySnapshot(snapshot: NPCPublicSnapshot): void {
    this.snapshot = snapshot;
    this.setState(snapshot.currentState, snapshot.currentEmotion);
    this.group.position.set(snapshot.location.x, snapshot.location.y, snapshot.location.z);
  }

  /** Resume the Web Audio context (browser autoplay policy). */
  async unlockAudio(): Promise<void> {
    const ctx = this.listener.context;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  setTalking(talking: boolean): void {
    this.talking = talking;
    if (!talking) {
      this.indicator.scale.setScalar(1);
    }
  }

  // Show a line as a subtitle and flash the talking indicator. Used for scripted
  // / human-performed lines (the live AI path drives the indicator from audio).
  protected performLine(text: string): void {
    if (this.currentState === 'SILENT') return;
    this.onSubtitle(this.snapshot.id, 'npc', text);
    this.setTalking(true);
    window.setTimeout(() => this.setTalking(false), 2200);
  }

  // Per-frame animation: pulse the indicator while talking.
  // Voice emitter updates run via AudioManager.registerEmitter().
  update(delta: number): void {
    if (this.talking) {
      this.talkPhase += delta * 10;
      this.indicator.scale.setScalar(1 + Math.sin(this.talkPhase) * 0.25);
    }
  }

  protected bodyColor(): number {
    // Driver-coded tint so it's obvious who's performing: AI=indigo, human=teal.
    return this.actorKind === 'ai' ? 0x5c6bc0 : 0x26a69a;
  }

  protected buildLabel(): void {
    if (this.labelSprite) {
      this.group.remove(this.labelSprite);
      this.labelSprite = null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = '22px Segoe UI, Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.snapshot.name}`, 128, 28);
    ctx.font = '15px Segoe UI, Arial';
    ctx.fillStyle = this.actorKind === 'ai' ? '#9fa8ff' : '#7fe3d4';
    ctx.fillText(`[${this.actorKind.toUpperCase()}]`, 128, 50);

    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.position.y = 2.5;
    sprite.scale.set(2, 0.5, 1);
    this.group.add(sprite);
    this.labelSprite = sprite;
  }
}
