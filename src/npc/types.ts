// Client mirror of the server NPC vocabulary (backend/npc/types.ts).
// The client never sees forbidden/secret knowledge — only public snapshots and
// (for the director) a detail snapshot with allowed knowledge + memory.

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

export interface NPCDetailSnapshot extends NPCPublicSnapshot {
  personality: string;
  sceneObjective: string;
  allowedKnowledge: string[];
  relationshipToPlayers: string;
  controllingSocketId: string | null;
  memorySummary: string;
  transcript: { speaker: string; text: string; t: number }[];
}

// Result of a server-minted OpenAI Realtime ephemeral session.
export interface RealtimeSessionResult {
  ok: boolean;
  npcId: string;
  clientSecret?: string;
  expiresAt?: number;
  model?: string;
  voice?: string;
  error?: string;
}

export const ALL_CUES: DirectorCue[] = [
  'APPROACH', 'STOP', 'WATCH', 'QUESTION', 'WARN', 'REASSURE', 'DEFLECT',
  'OPEN_GATE', 'CALL_SHEPHERD', 'ESCALATE', 'END_SCENE',
  'ENABLE_CONVERSATION', 'DISABLE_CONVERSATION', 'TRANSFER_TO_HUMAN', 'TRANSFER_TO_AI',
];
