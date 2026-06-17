import { NPCActor, NPCActorOpts } from './NPCActor';
import { ConversationManager, ConversationClient } from './ConversationManager';
import { NPCStateMachine } from './NPCStateMachine';
import { ActorKind, DirectorCue } from './types';

export interface AIActorOpts extends NPCActorOpts {
  conversation: ConversationManager;
  playerName: string;
}

// Short per-cue directives (no secret knowledge) used to nudge the already-
// instructed live model when a cue fires mid-conversation. Mirrors backend NPCBrain.
const CUE_DIRECTIVE: Partial<Record<DirectorCue, string>> = {
  APPROACH: 'Move toward the players and engage them directly. Speak now.',
  STOP: 'Halt. Hold your ground and say little. Speak now.',
  WATCH: 'Observe the players in wary silence, then speak one short warning if needed.',
  QUESTION: 'Question the players about who they are and why they are here. Speak now.',
  WARN: 'Issue a firm warning. Make the threat clear without shouting. Speak now.',
  REASSURE: 'Calm the players. Be gentle and lower the tension. Speak now.',
  DEFLECT: 'Avoid the question. Redirect without revealing anything. Speak now.',
  OPEN_GATE: 'Signal that the gate is opening and usher the players through. Speak now.',
  CALL_SHEPHERD: 'Call for the Shepherd. Show you are summoning a higher authority. Speak now.',
  ESCALATE: 'Escalate the confrontation. Become openly hostile. Speak now.',
};

// An AI-driven NPC: a temporary understudy that speaks via the OpenAI Realtime
// API over WebRTC. It only listens inside a director-opened conversation window
// and degrades to scripted dialogue if the live session fails (failsafe).
export class AIActor extends NPCActor implements ConversationClient {
  readonly kind: ActorKind = 'ai';

  // ConversationClient identity.
  npcId: string;
  playerName: string;

  private conversation: ConversationManager;
  private conversationLive = false;
  private conversationStarting = false;
  private lastScriptedLine: string | undefined;

  constructor(opts: AIActorOpts) {
    super(opts);
    this.conversation = opts.conversation;
    this.npcId = opts.snapshot.id;
    this.playerName = opts.playerName;
  }

  receiveCue(cue: DirectorCue, scriptedLine?: string): void {
    this.lastScriptedLine = scriptedLine;

    // Update local state/emotion regardless of driver.
    if (NPCStateMachine.isStateCue(cue)) {
      const next = NPCStateMachine.nextState(this.currentState, cue);
      this.setState(next, NPCStateMachine.emotionForState(next));
    }

    // Live session: nudge the model. Otherwise perform the failsafe line.
    if (this.conversationLive && this.conversation.isActive(this.npcId)) {
      const directive =
        CUE_DIRECTIVE[cue] ??
        (scriptedLine ? `In character, say something like: "${scriptedLine}"` : null);
      if (directive) {
        this.conversation.createResponse(this.npcId, directive);
      } else if (scriptedLine) {
        this.performLine(scriptedLine);
      }
    } else if (scriptedLine) {
      this.performLine(scriptedLine);
    }
  }

  async enableConversation(): Promise<void> {
    if (this.conversationLive || this.conversationStarting) return;
    if (this.conversation.isActive(this.npcId)) {
      this.conversationLive = true;
      return;
    }
    this.conversationStarting = true;
    try {
      await this.unlockAudio();
      const ok = await this.conversation.start(this);
      this.conversationLive = ok;
      if (!ok) {
        console.warn(`[${this.npcId}] live conversation unavailable; using scripted dialogue.`);
        if (this.lastScriptedLine) this.performLine(this.lastScriptedLine);
      }
    } finally {
      this.conversationStarting = false;
    }
  }

  disableConversation(): void {
    if (!this.conversationLive && !this.conversation.isActive(this.npcId)) return;
    this.conversation.stop(this.npcId);
    this.conversationLive = false;
  }

  speak(text?: string): void {
    if (this.conversationLive && this.conversation.isActive(this.npcId)) {
      this.conversation.createResponse(this.npcId, text);
    } else if (text) {
      this.performLine(text);
    }
  }

  yieldControl(): void {
    // Handing the role to a human: shut the live window down cleanly.
    this.disableConversation();
  }

  takeOver(): void {
    // Just became the AI driver; the director opens conversation separately.
  }

  dispose(): void {
    this.disableConversation();
    super.dispose();
  }

  // ---------- ConversationClient ----------

  onNpcLine(text: string): void {
    this.onSubtitle(this.npcId, 'npc', text);
  }

  onPlayerLine(text: string): void {
    this.onSubtitle(this.npcId, `player:${this.playerName}`, text);
  }

  onTimeout(): void {
    this.conversationLive = false;
    console.warn(
      `[${this.npcId}] live voice session ended (idle timeout). ` +
        'Use Enable Conv in the NPC Director panel to restore audio.'
    );
  }

  onFailed(reason: string): void {
    this.conversationLive = false;
    console.warn(`[${this.npcId}] conversation failed: ${reason}`);
  }
}
