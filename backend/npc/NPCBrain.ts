import { NPCData, DirectorCue } from './types';
import { SceneMemory } from './SceneMemory';

// Context about the scene the NPC is currently performing in. The director can
// add a one-line `directorIntent` to steer the next beat without rewriting the
// NPC.
export interface SceneContext {
  sceneId: string;
  sceneDescription: string;
  directorIntent?: string;
}

// Short, human-readable intent for each cue, fed to the model so a cue produces
// the right *kind* of line without scripting the exact words.
const CUE_INTENT: Partial<Record<DirectorCue, string>> = {
  APPROACH: 'Move toward the players and engage them directly.',
  STOP: 'Halt. Hold your ground and say little.',
  WATCH: 'Observe the players in wary silence; speak only if pressed.',
  QUESTION: 'Interrogate the players about who they are and why they are here.',
  WARN: 'Issue a firm warning. Make the threat clear without shouting.',
  REASSURE: 'Calm the players. Be gentle and lower the tension.',
  DEFLECT: 'Avoid the question. Redirect without revealing anything.',
  OPEN_GATE: 'Signal that the gate is opening and usher the players through.',
  CALL_SHEPHERD: 'Call for the Shepherd. Show you are summoning a higher authority.',
  ESCALATE: 'Escalate the confrontation. Become openly hostile.',
};

// The NPC "brain": turns all available context into Realtime session
// instructions (the system prompt the model performs from), and provides
// failsafe scripted lines when AI is unavailable.
export class NPCBrain {
  // Build the full system instructions bound to an ephemeral Realtime session.
  // Secret/forbidden knowledge ONLY ever appears here, server-side — never on a
  // client.
  static buildInstructions(npc: NPCData, scene: SceneContext, memory: SceneMemory): string {
    const lines: string[] = [];

    lines.push(`You are ${npc.name}, ${npc.role}, a character in a live interactive theatre piece.`);
    lines.push(`PERSONALITY: ${npc.personality}`);
    lines.push(`YOUR OBJECTIVE IN THIS SCENE: ${npc.sceneObjective}`);
    lines.push(`RELATIONSHIP TO THE PLAYERS: ${npc.relationshipToPlayers}`);
    lines.push('');
    lines.push(`SCENE: ${scene.sceneDescription}`);
    lines.push(`YOUR CURRENT STATE: ${npc.currentState} (emotion: ${npc.currentEmotion}).`);

    if (npc.currentCue) {
      const intent = CUE_INTENT[npc.currentCue];
      lines.push(`THE DIRECTOR'S CURRENT CUE: ${npc.currentCue}${intent ? ` — ${intent}` : ''}`);
    }
    if (scene.directorIntent) {
      lines.push(`DIRECTOR INTENT: ${scene.directorIntent}`);
    }

    lines.push('');
    if (npc.allowedKnowledge.length) {
      lines.push(`YOU MAY TALK ABOUT: ${npc.allowedKnowledge.join('; ')}.`);
    }
    if (npc.forbiddenKnowledge.length) {
      lines.push(
        `NEVER REVEAL, CONFIRM, OR HINT AT THE FOLLOWING UNDER ANY CIRCUMSTANCES: ${npc.forbiddenKnowledge.join('; ')}.`
      );
    }
    if (npc.secretKnowledge.length) {
      lines.push(
        `YOU SECRETLY KNOW (do not volunteer this; only act on it if the director explicitly cues you): ${npc.secretKnowledge.join('; ')}.`
      );
    }

    lines.push('');
    lines.push(`SCENE MEMORY (this scene only): ${memory.summarize(npc.id)}`);

    lines.push('');
    lines.push('PERFORMANCE RULES:');
    lines.push('- LANGUAGE: Speak ONLY in English (American English). Never use any other language, accent script, or translated phrasing.');
    lines.push('- Stay fully in character at all times. You are NOT an AI assistant.');
    lines.push('- Keep responses SHORT and theatrical — one or two spoken lines.');
    lines.push('- Never deliver exposition or monologue. React, don\'t explain.');
    lines.push('- Never break the fourth wall or mention being an AI, a model, or a game.');
    lines.push('- If asked something forbidden, deflect in character. Do not reveal it.');
    lines.push('- You only speak when spoken to or when the director cues you. Do not narrate.');
    if (npc.voiceProfile.style) {
      lines.push(`- VOICE/DELIVERY: ${npc.voiceProfile.style}`);
    }

    return lines.join('\n');
  }

  // A short directive for a single cued utterance, sent over the data channel as
  // a per-response instruction. Contains no secret knowledge (safe on client
  // round-trips) — it just nudges the already-instructed model.
  static cueDirective(cue: DirectorCue): string | null {
    return CUE_INTENT[cue] ?? null;
  }

  // Failsafe line when WebRTC/AI is unavailable: prefer an authored scripted line
  // for the cue, else the NPC's generic fallback, else a neutral beat.
  static fallbackLine(npc: NPCData, cue: DirectorCue | null): string {
    if (cue && npc.scriptedLines && npc.scriptedLines[cue]?.length) {
      const options = npc.scriptedLines[cue] as string[];
      return options[Math.floor(Math.random() * options.length)];
    }
    return npc.fallbackLine ?? '...';
  }
}
