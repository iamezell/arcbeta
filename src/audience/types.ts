import * as THREE from 'three';

/**
 * Audience / participant system types for ARC's personalized cue engine.
 *
 * A "participant" is anyone connected to the live experience. The director can
 * target cues at everyone, a subset, a single person, a random audience member,
 * or a world position — letting each audience member have a unique-but-shared
 * experience.
 */

export type ParticipantRole = 'audience' | 'actor' | 'director' | 'host';

/** Optional affective state — reserved for future adaptive direction. */
export interface ParticipantAffect {
  /** 0–1, how immersed/present the participant feels. */
  immersionLevel: number;
  /** 0–1, how frightened. Used by comfort/dread cues. */
  fearLevel: number;
  /** 0–1, how engaged/attentive. */
  engagementLevel: number;
}

export interface Participant {
  id: string;
  displayName: string;
  role: ParticipantRole;
  /** True for the local browser's own participant. */
  isLocal: boolean;
  /**
   * Dev-mock members have no real socket. Their private cues are previewed
   * locally so the director can audition the experience in a single browser.
   */
  isMock: boolean;
  audioEnabled: boolean;
  affect: ParticipantAffect;
  /** Optional avatar/object reference (remote avatar group or local rig). */
  object?: THREE.Object3D;
  /** Optional live world position provider (camera or avatar). */
  getPosition?: () => THREE.Vector3;
}

/** Plain snapshot for UI rendering (no live refs / functions). */
export interface ParticipantSnapshot {
  id: string;
  displayName: string;
  role: ParticipantRole;
  isLocal: boolean;
  isMock: boolean;
  audioEnabled: boolean;
  affect: ParticipantAffect;
  hasPosition: boolean;
}

/**
 * Cue targeting. The engine resolves a target into the set of participants the
 * cue should reach (and/or a world position for spatial cues).
 */
export type CueTarget =
  | { type: 'everyone' }
  | { type: 'audienceOnly' }
  | { type: 'actorsOnly' }
  | { type: 'specificParticipant'; participantId: string }
  | { type: 'randomAudienceMember' }
  | { type: 'group'; participantIds: string[] }
  | { type: 'worldPosition'; position: THREE.Vector3 };

export interface ResolvedTarget {
  /** Participants this cue should reach. */
  participants: Participant[];
  /** Optional world position (for worldPosition targets or positional cues). */
  position?: THREE.Vector3;
}

export const DEFAULT_AFFECT: ParticipantAffect = {
  immersionLevel: 0.5,
  fearLevel: 0,
  engagementLevel: 0.5,
};
