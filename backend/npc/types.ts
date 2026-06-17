// ARC NPC system — shared type vocabulary (server-authoritative).
//
// DESIGN PRINCIPLE: AI NPCs are temporary understudies for future human actors.
// A "Human Actor" and an "AI Actor" are interchangeable drivers of the same NPC
// role. Everything below describes the NPC role and its runtime; *who* is driving
// it (human vs AI) is just a pair of flags + the active ActorInterface on the
// client. The director can swap drivers at any time without changing the role.

export type NPCState =
  | 'IDLE'
  | 'WATCHING'
  | 'SUSPICIOUS'
  | 'PROTECTIVE'
  | 'HOSTILE'
  | 'CALM'
  | 'GUIDING'
  | 'AFRAID'
  | 'SILENT';

export type NPCEmotion =
  | 'NEUTRAL'
  | 'CALM'
  | 'TENSE'
  | 'FEARFUL'
  | 'ANGRY'
  | 'WARM'
  | 'SUSPICIOUS'
  | 'STERN';

// Director-issued commands. These are the *only* way an NPC changes behaviour —
// NPCs are never autonomous. Stream Deck buttons map 1:1 to these.
export type DirectorCue =
  | 'APPROACH'
  | 'STOP'
  | 'WATCH'
  | 'QUESTION'
  | 'WARN'
  | 'REASSURE'
  | 'DEFLECT'
  | 'OPEN_GATE'
  | 'CALL_SHEPHERD'
  | 'ESCALATE'
  | 'END_SCENE'
  | 'ENABLE_CONVERSATION'
  | 'DISABLE_CONVERSATION'
  | 'TRANSFER_TO_HUMAN'
  | 'TRANSFER_TO_AI';

export type ActorKind = 'human' | 'ai';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// How an NPC should sound when driven by AI (OpenAI Realtime voice + delivery).
export interface VoiceProfile {
  voice: string; // OpenAI Realtime voice id (alloy, ash, ballad, coral, ...)
  style?: string; // delivery notes injected into the brain prompt
}

// Static, authored definition of an NPC role in a scene. This is the part a
// writer fills in; it never changes at runtime.
export interface NPCDefinition {
  id: string;
  name: string;
  role: string;
  personality: string;
  sceneObjective: string;
  // Knowledge tiers drive the brain prompt. Forbidden/secret are NEVER sent to
  // clients — they only ever live in server-built instructions bound to the
  // ephemeral Realtime token.
  allowedKnowledge: string[];
  forbiddenKnowledge: string[];
  secretKnowledge: string[];
  relationshipToPlayers: string;
  voiceProfile: VoiceProfile;
  location: Vec3;
  defaultActor: ActorKind;
  // If true, the client spawns a 3D body at `location`. Off-stage NPCs (director
  // cues only) stay invisible until a later act enables them.
  visibleInWorld?: boolean;
  // Failsafe dialogue used when AI/WebRTC is unavailable, keyed by cue.
  scriptedLines?: Partial<Record<DirectorCue, string[]>>;
  // Last-resort line if nothing else applies.
  fallbackLine?: string;
}

// Full authoritative runtime structure for an NPC (definition + live state).
export interface NPCData extends NPCDefinition {
  currentEmotion: NPCEmotion;
  currentState: NPCState;
  isHuman: boolean;
  isAI: boolean;
  conversationEnabled: boolean;
  currentCue: DirectorCue | null;
  // Socket id of the human currently driving this NPC (when isHuman).
  controllingSocketId: string | null;
}

// Public snapshot broadcast to every in-scene client. Intentionally omits
// forbidden/secret knowledge so players can't read the script.
export interface NPCPublicSnapshot {
  id: string;
  name: string;
  role: string;
  currentState: NPCState;
  currentEmotion: NPCEmotion;
  isHuman: boolean;
  isAI: boolean;
  conversationEnabled: boolean;
  currentCue: DirectorCue | null;
  location: Vec3;
  voice: string;
  visibleInWorld: boolean;
}

// Director-only detail (state + allowed knowledge + memory + transcript).
export interface NPCDetailSnapshot extends NPCPublicSnapshot {
  personality: string;
  sceneObjective: string;
  allowedKnowledge: string[];
  relationshipToPlayers: string;
  controllingSocketId: string | null;
  memorySummary: string;
  transcript: { speaker: string; text: string; t: number }[];
}

// Result of minting an OpenAI Realtime ephemeral session for a client.
export interface RealtimeSessionResult {
  ok: boolean;
  npcId: string;
  clientSecret?: string;
  expiresAt?: number;
  model?: string;
  voice?: string;
  error?: string;
}
