import { Server } from 'socket.io';
import { SCENE_ROOM } from '../rooms/sessionManager';
import {
  NPCData,
  NPCDefinition,
  NPCPublicSnapshot,
  NPCDetailSnapshot,
  DirectorCue,
  ActorKind,
  RealtimeSessionResult,
} from './types';
import { NPCStateMachine } from './NPCStateMachine';
import { SceneMemory } from './SceneMemory';
import { NPCBrain, SceneContext } from './NPCBrain';
import { getRealtimeService } from './RealtimeService';
import { ACT1_ROSTER } from './roster';

// The authoritative brain-stem of the NPC system. The director (and Stream Deck)
// talk ONLY to this. It owns NPC runtime state, executes cues, swaps the driving
// actor (human <-> AI), mints Realtime sessions, and broadcasts everything to
// in-scene clients. Clients are pure renderers/performers of what this says.

function defToRuntime(def: NPCDefinition): NPCData {
  return {
    ...def,
    currentEmotion: 'NEUTRAL',
    currentState: 'IDLE',
    isHuman: def.defaultActor === 'human',
    isAI: def.defaultActor === 'ai',
    conversationEnabled: false,
    currentCue: null,
    controllingSocketId: null,
  };
}

export class DirectorController {
  private io: Server | null = null;
  private npcs = new Map<string, NPCData>();
  private memory = new SceneMemory();
  private scene: SceneContext = {
    sceneId: 'ACT_1_STORM_ROAD',
    sceneDescription:
      'Night. A storm batters a muddy road outside a fenced commune. The players are stranded by a broken-down bus; a lit gate looms in the distance. Tension is high and trust is thin.',
  };

  constructor(roster: NPCDefinition[] = ACT1_ROSTER) {
    for (const def of roster) {
      this.npcs.set(def.id, defToRuntime(def));
    }
  }

  setIO(io: Server): void {
    this.io = io;
  }

  setDirectorIntent(intent: string): void {
    this.scene.directorIntent = intent;
  }

  // ---------- snapshots ----------

  private toPublic(npc: NPCData): NPCPublicSnapshot {
    return {
      id: npc.id,
      name: npc.name,
      role: npc.role,
      currentState: npc.currentState,
      currentEmotion: npc.currentEmotion,
      isHuman: npc.isHuman,
      isAI: npc.isAI,
      conversationEnabled: npc.conversationEnabled,
      currentCue: npc.currentCue,
      location: npc.location,
      voice: npc.voiceProfile.voice,
      visibleInWorld: npc.visibleInWorld === true,
    };
  }

  getPublicSnapshots(): NPCPublicSnapshot[] {
    return Array.from(this.npcs.values()).map((n) => this.toPublic(n));
  }

  // Director-only: full detail incl. allowed knowledge + memory + transcript.
  getDetail(npcId: string): NPCDetailSnapshot | null {
    const npc = this.npcs.get(npcId);
    if (!npc) return null;
    return {
      ...this.toPublic(npc),
      personality: npc.personality,
      sceneObjective: npc.sceneObjective,
      allowedKnowledge: npc.allowedKnowledge,
      relationshipToPlayers: npc.relationshipToPlayers,
      controllingSocketId: npc.controllingSocketId,
      memorySummary: this.memory.summarize(npc.id),
      transcript: this.memory.get(npc.id).transcript,
    };
  }

  // ---------- cue execution (the one entry point for director + Stream Deck) ----------

  // Stream-Deck-ready: a button simply calls executeCue(npcId, cue).
  executeCue(
    npcId: string,
    cue: DirectorCue,
    payload?: { socketId?: string },
    actingSocketId?: string | null
  ): { ok: boolean; error?: string } {
    // Scene-wide cue.
    if (cue === 'END_SCENE') {
      this.endScene();
      return { ok: true };
    }

    const npc = this.npcs.get(npcId);
    if (!npc) return { ok: false, error: `Unknown NPC: ${npcId}` };

    switch (cue) {
      case 'ENABLE_CONVERSATION':
        npc.conversationEnabled = true;
        npc.currentCue = cue;
        this.emitConversation(npc);
        this.broadcastNpc(npc);
        return { ok: true };

      case 'DISABLE_CONVERSATION':
        npc.conversationEnabled = false;
        npc.currentCue = cue;
        this.emitConversation(npc);
        this.broadcastNpc(npc);
        return { ok: true };

      case 'TRANSFER_TO_HUMAN':
        this.setActor(npc, 'human', payload?.socketId ?? null);
        npc.currentCue = cue;
        this.broadcastNpc(npc);
        return { ok: true };

      case 'TRANSFER_TO_AI':
        this.setActor(npc, 'ai', null);
        npc.currentCue = cue;
        this.broadcastNpc(npc);
        return { ok: true };

      default: {
        // State / "speaking" cue.
        const next = NPCStateMachine.nextState(npc.currentState, cue);
        npc.currentState = next;
        npc.currentEmotion = NPCStateMachine.emotionForState(next);
        npc.currentCue = cue;

        // Failsafe line for clients that aren't in a live AI conversation.
        const scriptedLine = NPCStateMachine.isStateCue(cue)
          ? NPCBrain.fallbackLine(npc, cue)
          : undefined;

        this.emitCue(npc, cue, scriptedLine);
        this.broadcastNpc(npc);
        return { ok: true };
      }
    }
  }

  private endScene(): void {
    for (const npc of this.npcs.values()) {
      npc.conversationEnabled = false;
      npc.currentState = 'IDLE';
      npc.currentEmotion = 'NEUTRAL';
      npc.currentCue = 'END_SCENE';
      this.emitConversation(npc);
      this.broadcastNpc(npc);
    }
    this.io?.to(SCENE_ROOM).emit('npc:sceneEnded', {});
    this.memory.clear();
  }

  // Swap the driving actor. The NPC role and 3D presence are unchanged — only
  // who performs it. This is the core "AI is an understudy" mechanic.
  private setActor(npc: NPCData, kind: ActorKind, socketId: string | null): void {
    npc.isHuman = kind === 'human';
    npc.isAI = kind === 'ai';
    npc.controllingSocketId = kind === 'human' ? socketId : null;
    if (kind === 'human') {
      // A human took over — the AI conversation window closes.
      npc.conversationEnabled = false;
    }
  }

  // ---------- Realtime session minting ----------

  async createRealtimeSession(npcId: string): Promise<RealtimeSessionResult> {
    const npc = this.npcs.get(npcId);
    if (!npc) return { ok: false, npcId, error: 'Unknown NPC' };
    if (!npc.isAI) return { ok: false, npcId, error: 'NPC is not AI-driven' };
    if (!npc.conversationEnabled) return { ok: false, npcId, error: 'Conversation not enabled' };

    const instructions = NPCBrain.buildInstructions(npc, this.scene, this.memory);
    return getRealtimeService().createSession(npcId, instructions, npc.voiceProfile.voice);
  }

  isRealtimeConfigured(): boolean {
    return getRealtimeService().isConfigured();
  }

  // ---------- memory + transcripts ----------

  recordTranscript(npcId: string, speaker: string, text: string): void {
    if (!this.npcs.has(npcId) || !text) return;

    this.memory.recordTranscript(npcId, speaker, text);
    if (speaker.startsWith('player')) {
      // speaker may be "player:Alice"
      const name = speaker.includes(':') ? speaker.split(':')[1] : '';
      if (name) this.memory.recordPlayerName(npcId, name);
      this.memory.classifyPlayerLine(npcId, text);
    }
    // Broadcast as a subtitle to everyone in the scene.
    this.io?.to(SCENE_ROOM).emit('npc:subtitle', { npcId, speaker, text });
  }

  // Director can log scene observations (obedience, suspicious behaviour) by hand.
  noteObservation(npcId: string, kind: 'suspicious' | 'obedience', text: string): void {
    if (kind === 'suspicious') this.memory.recordSuspicious(npcId, text);
    else this.memory.recordObedience(npcId, text);
  }

  // ---------- failsafe: human disconnect -> AI takeover ----------

  handleDisconnect(socketId: string): void {
    for (const npc of this.npcs.values()) {
      if (npc.isHuman && npc.controllingSocketId === socketId) {
        console.log(`🎭 Human actor for ${npc.name} disconnected — AI takes over.`);
        this.setActor(npc, 'ai', null);
        this.broadcastNpc(npc);
      }
    }
  }

  // ---------- broadcasts ----------

  /**
   * Open live AI voice for every on-stage, AI-driven NPC (e.g. when Act 1 starts).
   * Reuses ENABLE_CONVERSATION so all clients sync. Clients still need one
   * audio-unlock gesture for the browser to permit playback.
   */
  enableOnStageAIVoices(): void {
    for (const npc of this.npcs.values()) {
      if (npc.visibleInWorld && npc.isAI && !npc.conversationEnabled) {
        this.executeCue(npc.id, 'ENABLE_CONVERSATION');
        console.log(`🎙️  Auto-enabled live voice for on-stage AI NPC "${npc.id}"`);
      }
    }
  }

  broadcastRoster(target?: { emit: (ev: string, data: any) => void }): void {
    const payload = { npcs: this.getPublicSnapshots() };
    if (target) target.emit('npc:roster', payload);
    else this.io?.to(SCENE_ROOM).emit('npc:roster', payload);
  }

  private broadcastNpc(npc: NPCData): void {
    this.io?.to(SCENE_ROOM).emit('npc:state', { npc: this.toPublic(npc) });
  }

  private emitCue(npc: NPCData, cue: DirectorCue, scriptedLine?: string): void {
    this.io?.to(SCENE_ROOM).emit('npc:cue', {
      npcId: npc.id,
      cue,
      scriptedLine,
      snapshot: this.toPublic(npc),
    });
  }

  private emitConversation(npc: NPCData): void {
    this.io?.to(SCENE_ROOM).emit('npc:conversation', {
      npcId: npc.id,
      enabled: npc.conversationEnabled,
      isAI: npc.isAI,
      realtimeConfigured: this.isRealtimeConfigured(),
    });
  }
}

let activeDirector: DirectorController | null = null;

export function getDirectorController(): DirectorController {
  if (!activeDirector) activeDirector = new DirectorController();
  return activeDirector;
}
