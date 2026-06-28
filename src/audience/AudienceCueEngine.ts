import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { AudienceRegistry } from './AudienceRegistry';
import { CueTarget, Participant } from './types';
import {
  lostInTheStormCuePack,
  resolveCuePackSrc,
  ShowCuePack,
} from '../audio/cuePacks/lostInTheStorm';

/**
 * Personalized Audience Cue Engine.
 *
 * Resolves a CueTarget (everyone / audience / a person / a random member / a
 * group / a world position) and routes the cue to the correct audio system.
 *
 * NOTE: This is the *audience-targeting* engine. The timed beat/moment engine in
 * src/cueEngine/ is separate and unchanged — this layers personalization on top
 * of the shared AudioManager.
 *
 * ── How to add a new cue type ──────────────────────────────────────────────
 *   1. Add a file under public/audio/library/... and reference it in a cue pack
 *      (src/audio/cuePacks/lostInTheStorm.ts).
 *   2. Add a `case 'your.cueId'` in `executeLocal()` below, choosing global vs
 *      private vs positional playback.
 *   3. (Optional) add a typed helper like triggerPrivateWhisper() for the UI.
 *   4. (Optional) add a button in AudiencePanel.
 */

export type LoopId = 'heartbeat' | 'breathing' | 'dread' | 'warmth' | 'mystery';

export interface TriggerCueRequest {
  cueId: string;
  target: CueTarget;
  /** 0–1 strength hint (affects subtle volume / layering). */
  intensity?: number;
  metadata?: Record<string, unknown>;
}

/** Wire payload for delivering a private cue to a single remote client. */
export interface PrivateCuePayload {
  cueId: string;
  participantId: string;
  intensity?: number;
  metadata?: Record<string, unknown>;
  /** Optional world position (wolf-behind etc.). */
  position?: { x: number; y: number; z: number };
}

/**
 * Networking seam for private cues. In multiplayer, the director's client sends
 * a private cue only to the targeted participant's socket; that client executes
 * it locally. If networking is not wired yet, this can be omitted and private
 * cues simply preview on the director's machine for dev-mock members.
 */
export interface PrivateCueNetwork {
  sendPrivateCue(targetSocketId: string, payload: PrivateCuePayload): void;
}

export interface AudienceCueEngineOpts {
  registry: AudienceRegistry;
  audio: AudioManager;
  cuePack?: ShowCuePack;
  network?: PrivateCueNetwork;
}

export class AudienceCueEngine {
  private readonly registry: AudienceRegistry;
  private readonly audio: AudioManager;
  private readonly pack: ShowCuePack;
  private network?: PrivateCueNetwork;

  constructor(opts: AudienceCueEngineOpts) {
    this.registry = opts.registry;
    this.audio = opts.audio;
    this.pack = opts.cuePack ?? lostInTheStormCuePack;
    this.network = opts.network;
  }

  setNetwork(network: PrivateCueNetwork): void {
    this.network = network;
  }

  // ---------- main entry ----------

  /**
   * Resolve the target and dispatch the cue. Global/positional cues affect the
   * shared world; private cues are routed per participant (local or networked).
   */
  triggerCue(req: TriggerCueRequest): void {
    const resolved = this.registry.resolveTarget(req.target);

    if (this.isPrivateCue(req.cueId)) {
      for (const participant of resolved.participants) {
        this.routePrivate(participant, req, resolved.position);
      }
      return;
    }

    // Global / world cue — plays in this browser (broadcast handled by the
    // director's show layer for multiplayer). worldPosition gives a 3D origin.
    void this.executeLocal(req.cueId, undefined, resolved.position, req.intensity, req.metadata);
  }

  /** Execute a private cue payload received from the network (we are the target). */
  handleRemotePrivateCue(payload: PrivateCuePayload): void {
    const pos = payload.position
      ? new THREE.Vector3(payload.position.x, payload.position.y, payload.position.z)
      : undefined;
    void this.executeLocal(payload.cueId, payload.participantId, pos, payload.intensity, payload.metadata);
  }

  // ---------- private helper methods (used by the Audience Panel) ----------

  triggerPrivateWhisper(participantId: string): void {
    this.triggerCue({ cueId: 'whisper.private', target: this.one(participantId) });
  }

  triggerPrivateHeartbeat(participantId: string): void {
    this.triggerCue({ cueId: 'heartbeat.private', target: this.one(participantId) });
  }

  stopPrivateHeartbeat(participantId: string): void {
    this.routePrivateRaw(participantId, 'heartbeat.stop');
  }

  triggerPrivateChildLaugh(participantId: string): void {
    this.triggerCue({ cueId: 'childLaugh.private', target: this.one(participantId) });
  }

  triggerWolfBehindParticipant(participantId: string): void {
    this.triggerCue({ cueId: 'wolf.behind.private', target: this.one(participantId) });
  }

  reduceFearForParticipant(participantId: string): void {
    this.triggerCue({ cueId: 'comfort.reduceFear', target: this.one(participantId) });
  }

  increaseTensionForParticipant(participantId: string): void {
    this.triggerCue({ cueId: 'dread.increase', target: this.one(participantId) });
  }

  /** SAFETY: silence every scary private cue for one participant. */
  silenceParticipant(participantId: string): void {
    this.triggerCue({ cueId: 'silence.private', target: this.one(participantId) });
  }

  /** SAFETY: global Calm/Reset — stop all private scary loops, restore neutral. */
  calmReset(): void {
    this.audio.stopAllPrivateEverywhere();
    for (const p of this.registry.all()) {
      this.registry.setAffect(p.id, { fearLevel: 0 });
    }
  }

  // ---------- routing ----------

  private routePrivate(participant: Participant, req: TriggerCueRequest, position?: THREE.Vector3): void {
    if (this.registry.shouldPlayLocally(participant)) {
      void this.executeLocal(req.cueId, participant.id, position, req.intensity, req.metadata);
      return;
    }
    if (this.network) {
      const payload: PrivateCuePayload = {
        cueId: req.cueId,
        participantId: participant.id,
        intensity: req.intensity,
        metadata: req.metadata,
      };
      const worldPos = position ?? this.registry.getPosition(participant.id) ?? undefined;
      if (worldPos) payload.position = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
      this.network.sendPrivateCue(participant.id, payload);
      return;
    }
    // TODO(multiplayer): no network layer yet — real remote participants can't be
    // reached privately. Dev-mock members preview locally via shouldPlayLocally.
    console.warn(
      `[AudienceCueEngine] private cue "${req.cueId}" for "${participant.id}" not delivered (no network seam).`
    );
  }

  private routePrivateRaw(participantId: string, cueId: string): void {
    const p = this.registry.get(participantId);
    if (!p) return;
    if (this.registry.shouldPlayLocally(p)) {
      void this.executeLocal(cueId, participantId);
    } else if (this.network) {
      this.network.sendPrivateCue(participantId, { cueId, participantId });
    }
  }

  // ---------- cue execution (this browser) ----------

  private async executeLocal(
    cueId: string,
    participantId?: string,
    position?: THREE.Vector3,
    intensity = 0.5,
    _metadata?: Record<string, unknown>
  ): Promise<void> {
    const pack = this.pack;
    const pid = participantId ?? 'local';

    switch (cueId) {
      // ----- world / global ambience -----
      case 'storm.start':
        await this.audio.playGlobalLoop(resolveCuePackSrc(pack.world.rainLight), {
          layer: 'storm_rain',
          volume: pack.world.rainLight.volume,
          fadeIn: 2,
        });
        await this.audio.playGlobalLoop(resolveCuePackSrc(pack.world.windForest), {
          layer: 'storm_wind',
          volume: pack.world.windForest.volume,
          fadeIn: 2.5,
        });
        break;
      case 'storm.stop':
        this.audio.stopLoop('storm_rain', 2);
        this.audio.stopLoop('storm_wind', 2.5);
        break;
      case 'thunder.distant':
        await this.audio.playGlobalSound(resolveCuePackSrc(pack.world.thunderDistant), {
          volume: pack.world.thunderDistant.volume,
        });
        break;
      case 'thunder.close':
        await this.audio.playGlobalSound(resolveCuePackSrc(pack.world.thunderClose), {
          volume: pack.world.thunderClose.volume,
        });
        break;

      // ----- positional wolves (around the player group or a world position) -----
      case 'wolf.left':
        await this.playPositionalWorld(pack.world.wolfHowls, new THREE.Vector3(-22, 1.5, -18), position);
        break;
      case 'wolf.right':
        await this.playPositionalWorld(pack.world.wolfHowls, new THREE.Vector3(22, 1.5, -18), position);
        break;
      case 'wolf.behind':
        await this.playPositionalWorld(pack.world.wolfGrowl, new THREE.Vector3(0, 1.5, 20), position);
        break;
      case 'wolf.circle':
        await this.playPositionalWorld(pack.world.wolfHowls, new THREE.Vector3(0, 1.5, -18), position);
        break;

      // ----- private intimacy -----
      case 'whisper.private':
        await this.audio.playPrivateWhisper(pid, resolveCuePackSrc(pack.private.whispers), {
          volume: pack.private.whispers.volume,
        });
        break;
      case 'childLaugh.private':
        await this.audio.playPrivateSound(pid, resolveCuePackSrc(pack.private.childLaugh), {
          volume: pack.private.childLaugh.volume,
        });
        break;
      case 'heartbeat.private':
        await this.audio.playPrivateLoop(pid, resolveCuePackSrc(pack.private.heartbeat), 'heartbeat', {
          volume: (pack.private.heartbeat.volume ?? 0.45) * (0.7 + intensity * 0.3),
          fadeIn: 1.5,
        });
        this.registry.setAffect(pid, { fearLevel: Math.min(1, intensity + 0.2) });
        break;
      case 'heartbeat.stop':
        this.audio.stopPrivateLoop(pid, 'heartbeat', 1.2);
        break;

      // ----- wolf behind a specific participant (private positional, with fallback) -----
      case 'wolf.behind.private': {
        const behind = this.behindParticipant(participantId);
        if (behind) {
          await this.audio.playPrivatePositional(pid, resolveCuePackSrc(pack.world.wolfGrowl), behind, {
            volume: pack.world.wolfGrowl.volume,
          });
        } else {
          // Private positional not available → private stereo fallback.
          await this.audio.playPrivateSound(pid, resolveCuePackSrc(pack.world.wolfGrowl), {
            volume: pack.world.wolfGrowl.volume,
          });
        }
        break;
      }

      // ----- comfort / dread (affective) -----
      case 'comfort.reduceFear':
        // Stop scary private loops and gently restore a warm ambience.
        this.audio.stopPrivateLoop(pid, 'heartbeat', 1.5);
        this.audio.stopPrivateLoop(pid, 'dread', 1.5);
        await this.audio.playPrivateLoop(pid, resolveCuePackSrc(pack.cinematic.warmAmbience), 'warmth', {
          volume: pack.cinematic.warmAmbience.volume,
          fadeIn: 2,
        });
        this.registry.setAffect(pid, { fearLevel: 0.1 });
        // Auto-fade the comfort bed so it doesn't linger forever.
        window.setTimeout(() => this.audio.stopPrivateLoop(pid, 'warmth', 3), 12000);
        break;
      case 'dread.increase':
        await this.audio.playPrivateLoop(pid, resolveCuePackSrc(pack.cinematic.lowDread), 'dread', {
          volume: (pack.cinematic.lowDread.volume ?? 0.35) * (0.8 + intensity * 0.2),
          fadeIn: 2.5,
        });
        await this.audio.playPrivateWhisper(pid, resolveCuePackSrc(pack.private.whispers), {
          volume: (pack.private.whispers.volume ?? 0.5) * 0.8,
        });
        this.registry.setAffect(pid, { fearLevel: Math.min(1, intensity + 0.4) });
        break;

      // ----- SAFETY: silence this participant entirely -----
      case 'silence.private':
        this.audio.stopAllPrivate(pid);
        this.registry.setAffect(pid, { fearLevel: 0 });
        break;

      default:
        console.warn(`[AudienceCueEngine] unknown cueId "${cueId}"`);
    }
  }

  // ---------- helpers ----------

  private async playPositionalWorld(
    entry: { src: string | string[]; volume?: number },
    defaultOffset: THREE.Vector3,
    explicitPosition?: THREE.Vector3
  ): Promise<void> {
    const position = explicitPosition ?? this.audio.offsetFromGroupCenter(defaultOffset);
    await this.audio.playPositionalSound(resolveCuePackSrc(entry), position, { volume: entry.volume });
  }

  /** World position just behind the participant (falls back to group offset). */
  private behindParticipant(participantId?: string): THREE.Vector3 | null {
    if (!participantId) return null;
    const pos = this.registry.getPosition(participantId);
    if (!pos) return null;
    // ~3m behind along world -Z relative to the player (no per-player yaw yet).
    return pos.clone().add(new THREE.Vector3(0, 0, 3));
  }

  private isPrivateCue(cueId: string): boolean {
    return (
      cueId.endsWith('.private') ||
      cueId.startsWith('comfort.') ||
      cueId.startsWith('dread.') ||
      cueId === 'silence.private' ||
      cueId === 'heartbeat.stop'
    );
  }

  private one(participantId: string): CueTarget {
    return { type: 'specificParticipant', participantId };
  }
}
