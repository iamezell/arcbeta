import * as THREE from 'three';
import {
  CueTarget,
  DEFAULT_AFFECT,
  Participant,
  ParticipantAffect,
  ParticipantRole,
  ParticipantSnapshot,
  ResolvedTarget,
} from './types';

export interface RegisterParticipantInput {
  id: string;
  displayName: string;
  role: ParticipantRole;
  isLocal?: boolean;
  isMock?: boolean;
  audioEnabled?: boolean;
  object?: THREE.Object3D;
  getPosition?: () => THREE.Vector3;
}

/**
 * Tracks every connected participant (audience, actors, director, host) and
 * resolves CueTargets into concrete participant sets + positions.
 *
 * Avatars/positions are optional: if multiplayer presence is not wired for a
 * participant, position-dependent cues fall back gracefully (see CueEngine).
 */
export class AudienceRegistry {
  private participants = new Map<string, Participant>();
  private localId: string | null = null;
  private listeners = new Set<() => void>();

  setLocalId(id: string): void {
    this.localId = id;
    const p = this.participants.get(id);
    if (p) p.isLocal = true;
    this.emitChange();
  }

  getLocalId(): string | null {
    return this.localId;
  }

  upsert(input: RegisterParticipantInput): Participant {
    const existing = this.participants.get(input.id);
    const participant: Participant = {
      id: input.id,
      displayName: input.displayName,
      role: input.role,
      isLocal: input.isLocal ?? existing?.isLocal ?? input.id === this.localId,
      isMock: input.isMock ?? existing?.isMock ?? false,
      audioEnabled: input.audioEnabled ?? existing?.audioEnabled ?? false,
      affect: existing?.affect ?? { ...DEFAULT_AFFECT },
      object: input.object ?? existing?.object,
      getPosition: input.getPosition ?? existing?.getPosition,
    };
    this.participants.set(participant.id, participant);
    this.emitChange();
    return participant;
  }

  remove(id: string): void {
    if (this.participants.delete(id)) this.emitChange();
  }

  clearMocks(): void {
    let changed = false;
    for (const [id, p] of this.participants) {
      if (p.isMock) {
        this.participants.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitChange();
  }

  get(id: string): Participant | undefined {
    return this.participants.get(id);
  }

  all(): Participant[] {
    return [...this.participants.values()];
  }

  audienceMembers(): Participant[] {
    return this.all().filter((p) => p.role === 'audience');
  }

  // ---- Convenience accessors used by the Audience Experience system ----

  /** Every connected participant (audience, actors, director, host). */
  getParticipants(): Participant[] {
    return this.all();
  }

  getAudienceMembers(): Participant[] {
    return this.audienceMembers();
  }

  getActors(): Participant[] {
    return this.all().filter((p) => p.role === 'actor');
  }

  /** The host/director, if present (host preferred, director as fallback). */
  getHost(): Participant | undefined {
    return this.all().find((p) => p.role === 'host') ?? this.all().find((p) => p.role === 'director');
  }

  /** Participants a viewer can follow (everyone except themselves). */
  getFollowable(): Participant[] {
    return this.all().filter((p) => p.id !== this.localId);
  }

  setAudioEnabled(id: string, enabled: boolean): void {
    const p = this.participants.get(id);
    if (p && p.audioEnabled !== enabled) {
      p.audioEnabled = enabled;
      this.emitChange();
    }
  }

  setAffect(id: string, patch: Partial<ParticipantAffect>): void {
    const p = this.participants.get(id);
    if (!p) return;
    p.affect = {
      immersionLevel: clamp01(patch.immersionLevel ?? p.affect.immersionLevel),
      fearLevel: clamp01(patch.fearLevel ?? p.affect.fearLevel),
      engagementLevel: clamp01(patch.engagementLevel ?? p.affect.engagementLevel),
    };
    this.emitChange();
  }

  /** Resolve a CueTarget into the participants it should reach (+ optional position). */
  resolveTarget(target: CueTarget): ResolvedTarget {
    switch (target.type) {
      case 'everyone':
        return { participants: this.all() };
      case 'audienceOnly':
        return { participants: this.audienceMembers() };
      case 'actorsOnly':
        return { participants: this.all().filter((p) => p.role === 'actor') };
      case 'specificParticipant': {
        const p = this.participants.get(target.participantId);
        return { participants: p ? [p] : [] };
      }
      case 'randomAudienceMember': {
        const audience = this.audienceMembers();
        if (audience.length === 0) return { participants: [] };
        const pick = audience[Math.floor(Math.random() * audience.length)];
        return { participants: [pick] };
      }
      case 'group': {
        const set = new Set(target.participantIds);
        return { participants: this.all().filter((p) => set.has(p.id)) };
      }
      case 'worldPosition':
        return { participants: this.all(), position: target.position.clone() };
      default:
        return { participants: [] };
    }
  }

  /** Whether a cue aimed at this participant should play in THIS browser. */
  shouldPlayLocally(participant: Participant): boolean {
    // Local player always hears their own private cues.
    // Mock members are previewed locally so a single-browser director can audition.
    return participant.isLocal || participant.isMock || participant.id === this.localId;
  }

  getPosition(id: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const p = this.participants.get(id);
    if (!p) return null;
    if (p.getPosition) return out.copy(p.getPosition());
    if (p.object) return p.object.getWorldPosition(out);
    return null;
  }

  snapshot(): ParticipantSnapshot[] {
    return this.all().map((p) => ({
      id: p.id,
      displayName: p.displayName,
      role: p.role,
      isLocal: p.isLocal,
      isMock: p.isMock,
      audioEnabled: p.audioEnabled,
      affect: { ...p.affect },
      hasPosition: !!(p.getPosition || p.object),
    }));
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emitChange(): void {
    this.listeners.forEach((cb) => cb());
  }

  /**
   * Dev-only sample audience. Lets the director exercise personalized cues in a
   * single browser before multiplayer presence is fully wired.
   */
  seedMockAudience(count = 3): void {
    const names = ['John', 'Maya', 'Theo', 'Aisha', 'Diego', 'Lena'];
    for (let i = 0; i < count; i++) {
      const id = `mock-${i + 1}`;
      this.upsert({
        id,
        displayName: names[i % names.length],
        role: 'audience',
        isMock: true,
        audioEnabled: true,
      });
    }
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
