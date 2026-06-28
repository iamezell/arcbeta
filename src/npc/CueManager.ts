import * as THREE from 'three';
import { SocketClient } from '../socket-client';
import { NPCActor } from './NPCActor';
import { HumanActor } from './HumanActor';
import { AIActor } from './AIActor';
import { ConversationManager } from './ConversationManager';
import { NPCMemory } from './NPCMemory';
import {
  DirectorCue,
  NPCPublicSnapshot,
  NPCDetailSnapshot,
  RealtimeSessionResult,
} from './types';

import { WebRTCVoicePipeline } from '../audio/WebRTCVoicePipeline';

export interface CueManagerOpts {
  parent: THREE.Object3D;
  listener: THREE.AudioListener;
  socket: SocketClient;
  role: string;
  playerName: string;
  voicePipeline: WebRTCVoicePipeline;
  registerEmitter?: (emitter: import('../audio/emitters/SpatialAudioEmitter').SpatialAudioEmitter) => void;
  /** Resume/unlock the shared Web Audio context (user-gesture path). */
  onEnsureAudio?: () => Promise<void>;
}

// Minimal shared subtitle overlay (bottom-centre). One line at a time, fading.
class SubtitleOverlay {
  private el: HTMLDivElement;
  private hideTimer: number | null = null;

  constructor() {
    const style = document.createElement('style');
    style.textContent = `
      #npc-subtitle {
        position: fixed; left: 50%; bottom: 12%; transform: translateX(-50%);
        max-width: 70%; padding: 10px 18px; border-radius: 8px; display: none;
        background: rgba(0,0,0,0.72); color: #fff; text-align: center;
        font: 18px 'Segoe UI', sans-serif; z-index: 260; pointer-events: none;
        transition: opacity .3s; line-height: 1.4;
      }
      #npc-subtitle .npc-sub-name { color: #9fd0ff; font-weight: 600; margin-right: 8px; }
    `;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.id = 'npc-subtitle';
    document.body.appendChild(this.el);
  }

  show(name: string, text: string): void {
    this.el.innerHTML = `<span class="npc-sub-name">${name}:</span>${text}`;
    this.el.style.display = 'block';
    this.el.style.opacity = '1';
    if (this.hideTimer) window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.el.style.opacity = '0';
      window.setTimeout(() => (this.el.style.display = 'none'), 300);
    }, 4500);
  }
}

// The single hub the Director panel and a future Stream Deck both call into.
// It owns the NPC actors, applies server-authoritative updates, performs the
// seamless human<->AI swap, and routes subtitles. The server remains
// authoritative — executeCue() just forwards the director's intent.
export class CueManager {
  private parent: THREE.Object3D;
  private listener: THREE.AudioListener;
  private socket: SocketClient;
  private role: string;
  private playerName: string;
  private voicePipeline: WebRTCVoicePipeline;
  private registerEmitter?: CueManagerOpts['registerEmitter'];
  private onEnsureAudio?: CueManagerOpts['onEnsureAudio'];

  private actors = new Map<string, NPCActor>();
  private allNpcs: NPCPublicSnapshot[] = [];
  private npcRoot: THREE.Group;
  private conversation: ConversationManager;
  private memory = new NPCMemory();
  private subtitles = new SubtitleOverlay();

  // Pending ephemeral-session requests, resolved by `npc:realtimeSession`.
  private pendingSessions = new Map<string, (r: RealtimeSessionResult) => void>();

  // Optional director panel hook for refreshes.
  public onRosterChanged: () => void = () => {};

  // NPC ids where Enable Conv was initiated locally (skip socket echo).
  private localConversationEnable = new Set<string>();

  constructor(opts: CueManagerOpts) {
    this.parent = opts.parent;
    this.listener = opts.listener;
    this.socket = opts.socket;
    this.role = opts.role;
    this.playerName = opts.playerName;
    this.voicePipeline = opts.voicePipeline;
    this.registerEmitter = opts.registerEmitter;
    this.onEnsureAudio = opts.onEnsureAudio;

    // All NPC meshes live under one group so we can show/hide them per act.
    this.npcRoot = new THREE.Group();
    this.npcRoot.name = 'npc-root';
    this.npcRoot.visible = false;
    this.parent.add(this.npcRoot);

    this.conversation = new ConversationManager({
      requestSession: (npcId) => this.requestSession(npcId),
      sendTranscript: (npcId, speaker, text) => this.socket.npcTranscript(npcId, speaker, text),
      resumeAudio: () => this.listener.context.resume(),
      onSessionIdleClose: (npcId) => {
        // Keep server + director panel in sync when the WebRTC session closes.
        this.socket.npcCue(npcId, 'DISABLE_CONVERSATION');
      },
    });

    // Web Audio needs a user gesture to start; resume on first interaction.
    const resume = () => {
      this.listener.context.resume().catch(() => {/* ignore */});
    };
    window.addEventListener('click', resume);
    window.addEventListener('keydown', resume);

    this.wireSocket();
    // Ask the server again in case the connect-time roster arrived before listeners.
    this.socket.requestNpcRoster();
  }

  // NPCs only appear in Act 1 (storm road / commune gate).
  setActVisible(visible: boolean): void {
    this.npcRoot.visible = visible;
  }

  // ---------- public API (director panel + Stream Deck) ----------

  // Stream-Deck-ready entry point: a button simply calls executeCue(npcId, cue).
  // Forwarded to the authoritative server, which validates + broadcasts back.
  executeCue(npcId: string, cue: DirectorCue, payload?: { socketId?: string }): void {
    this.socket.npcCue(npcId, cue, payload);
  }

  /** Start/stop conversation locally while the user gesture is still active. */
  async enableConversationLocal(npcId: string): Promise<void> {
    this.localConversationEnable.add(npcId);
    await this.onEnsureAudio?.().catch(() => {/* ignore */});
    await this.listener.context.resume().catch(() => {/* ignore */});
    const actor = this.actors.get(npcId);
    if (!actor) {
      console.warn(`[CueManager] No actor for "${npcId}" — is Act 1 active?`);
      return;
    }
    if (actor.kind !== 'ai') {
      console.warn(`[CueManager] "${npcId}" is human-driven — select an AI guard (e.g. guard1) for voice.`);
      return;
    }
    await actor.enableConversation();
    window.setTimeout(() => this.localConversationEnable.delete(npcId), 5000);
  }

  disableConversationLocal(npcId: string): void {
    this.actors.get(npcId)?.disableConversation();
  }

  requestDetail(npcId: string): void {
    this.socket.requestNpcDetail(npcId);
  }

  getSnapshots(): NPCPublicSnapshot[] {
    return this.allNpcs;
  }

  getMemory(): NPCMemory {
    return this.memory;
  }

  getActor(npcId: string): NPCActor | undefined {
    return this.actors.get(npcId);
  }

  update(delta: number): void {
    this.actors.forEach((a) => a.update(delta));
  }

  // ---------- socket wiring ----------

  private wireSocket(): void {
    this.socket.onNpcRoster((data: { npcs: NPCPublicSnapshot[] }) => {
      this.syncRoster(data.npcs ?? []);
    });

    this.socket.onNpcState((data: { npc: NPCPublicSnapshot }) => {
      const idx = this.allNpcs.findIndex((n) => n.id === data.npc.id);
      if (idx >= 0) this.allNpcs[idx] = data.npc;
      else this.allNpcs.push(data.npc);
      if (data.npc.visibleInWorld) this.upsertActor(data.npc);
      else this.removeActor(data.npc.id);
      this.onRosterChanged();
    });

    this.socket.onNpcCue(
      (data: { npcId: string; cue: DirectorCue; scriptedLine?: string }) => {
        this.applyCue(data.npcId, data.cue, data.scriptedLine);
      }
    );

    this.socket.onNpcConversation((data: { npcId: string; enabled: boolean }) => {
      const actor = this.actors.get(data.npcId);
      if (!actor) return;
      if (data.enabled) {
        if (this.localConversationEnable.has(data.npcId)) return;
        if (this.conversation.isActive(data.npcId) || this.conversation.isStarting(data.npcId)) return;
        actor.enableConversation();
      } else {
        actor.disableConversation();
      }
    });

    this.socket.onNpcSubtitle((data: { npcId: string; speaker: string; text: string }) => {
      this.handleSubtitle(data.npcId, data.speaker, data.text);
    });

    this.socket.onNpcRealtimeSession((data: RealtimeSessionResult) => {
      const resolve = this.pendingSessions.get(data.npcId);
      if (resolve) {
        resolve(data);
        this.pendingSessions.delete(data.npcId);
      }
    });

    this.socket.onNpcDetail((detail: NPCDetailSnapshot) => {
      this.memory.updateDetail(detail);
      this.onRosterChanged();
    });
  }

  // ---------- actor lifecycle + swap ----------

  private syncRoster(npcs: NPCPublicSnapshot[]): void {
    this.allNpcs = npcs;
    const visibleIds = new Set(npcs.filter((n) => n.visibleInWorld).map((n) => n.id));

    for (const snap of npcs) {
      if (snap.visibleInWorld) this.upsertActor(snap);
    }

    for (const [id, actor] of this.actors) {
      if (!visibleIds.has(id)) {
        actor.dispose();
        this.actors.delete(id);
      }
    }

    console.log(`🤖 ${visibleIds.size} on-stage NPC(s), ${npcs.length} in roster`);
    this.onRosterChanged();
  }

  private removeActor(npcId: string): void {
    const actor = this.actors.get(npcId);
    if (!actor) return;
    actor.dispose();
    this.actors.delete(npcId);
  }

  private upsertActor(snap: NPCPublicSnapshot): void {
    const existing = this.actors.get(snap.id);
    if (!existing) {
      this.actors.set(snap.id, this.createActor(snap));
      return;
    }
    const desiredKind = snap.isAI ? 'ai' : 'human';
    if (existing.kind !== desiredKind) {
      // Seamless driver swap: tear the old actor down, build the new one in the
      // same place + state. The role and scene presence are unchanged.
      existing.yieldControl();
      existing.dispose();
      this.actors.set(snap.id, this.createActor(snap));
    } else {
      existing.applySnapshot(snap);
    }
  }

  private createActor(snap: NPCPublicSnapshot): NPCActor {
    const base = {
      snapshot: snap,
      parent: this.npcRoot,
      listener: this.listener,
      actorKind: (snap.isAI ? 'ai' : 'human') as const,
      onSubtitle: (npcId: string, speaker: string, text: string) =>
        this.handleSubtitle(npcId, speaker, text),
      registerEmitter: this.registerEmitter,
    };
    if (snap.isAI) {
      const actor = new AIActor({
        ...base,
        conversation: this.conversation,
        playerName: this.playerName,
        voicePipeline: this.voicePipeline,
      });
      actor.takeOver();
      return actor;
    }
    return new HumanActor(base);
  }

  private applyCue(npcId: string, cue: DirectorCue, scriptedLine?: string): void {
    // Conversation + transfer cues are handled via npc:conversation / npc:state.
    if (
      cue === 'ENABLE_CONVERSATION' ||
      cue === 'DISABLE_CONVERSATION' ||
      cue === 'TRANSFER_TO_HUMAN' ||
      cue === 'TRANSFER_TO_AI'
    ) {
      return;
    }
    const actor = this.actors.get(npcId);
    if (actor) actor.receiveCue(cue, scriptedLine);
  }

  private handleSubtitle(npcId: string, speaker: string, text: string): void {
    const actor = this.actors.get(npcId);
    const npcName = actor?.getSnapshot().name ?? 'NPC';
    const display = speaker === 'npc' ? npcName : speaker.includes(':') ? speaker.split(':')[1] : speaker;
    this.subtitles.show(display, text);
    this.memory.addSubtitle(npcId, speaker, text);
  }

  // Ask the server for an ephemeral Realtime token, resolving when it replies
  // (or after a timeout so the AIActor can fail over to scripted dialogue).
  private requestSession(npcId: string): Promise<RealtimeSessionResult> {
    return new Promise((resolve) => {
      this.pendingSessions.set(npcId, resolve);
      this.socket.requestRealtimeSession(npcId);
      window.setTimeout(() => {
        if (this.pendingSessions.has(npcId)) {
          this.pendingSessions.delete(npcId);
          resolve({ ok: false, npcId, error: 'Realtime session request timed out' });
        }
      }, 8000);
    });
  }
}
