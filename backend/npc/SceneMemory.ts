// Per-NPC, per-scene memory. Deliberately scoped to the *current* scene only —
// long-term / cross-scene memory can be layered on later by swapping the backing
// store. The summary produced here is injected into the NPC brain prompt so the
// AI (or a human reading their panel) reacts to what just happened.

export interface MemoryEntry {
  text: string;
  t: number;
}

export interface TranscriptLine {
  speaker: string; // 'player:<name>' | 'npc'
  text: string;
  t: number;
}

export interface NPCMemoryRecord {
  playerNames: string[];
  promises: MemoryEntry[];
  insults: MemoryEntry[];
  questions: MemoryEntry[];
  suspiciousBehavior: MemoryEntry[];
  obedience: MemoryEntry[]; // whether players obeyed instructions
  transcript: TranscriptLine[];
}

function emptyRecord(): NPCMemoryRecord {
  return {
    playerNames: [],
    promises: [],
    insults: [],
    questions: [],
    suspiciousBehavior: [],
    obedience: [],
    transcript: [],
  };
}

export class SceneMemory {
  private byNpc = new Map<string, NPCMemoryRecord>();

  get(npcId: string): NPCMemoryRecord {
    let rec = this.byNpc.get(npcId);
    if (!rec) {
      rec = emptyRecord();
      this.byNpc.set(npcId, rec);
    }
    return rec;
  }

  recordPlayerName(npcId: string, name: string): void {
    const rec = this.get(npcId);
    if (name && !rec.playerNames.includes(name)) rec.playerNames.push(name);
  }

  recordPromise(npcId: string, text: string): void {
    this.get(npcId).promises.push({ text, t: Date.now() });
  }

  recordInsult(npcId: string, text: string): void {
    this.get(npcId).insults.push({ text, t: Date.now() });
  }

  recordQuestion(npcId: string, text: string): void {
    this.get(npcId).questions.push({ text, t: Date.now() });
  }

  recordSuspicious(npcId: string, text: string): void {
    this.get(npcId).suspiciousBehavior.push({ text, t: Date.now() });
  }

  recordObedience(npcId: string, text: string): void {
    this.get(npcId).obedience.push({ text, t: Date.now() });
  }

  recordTranscript(npcId: string, speaker: string, text: string): void {
    const rec = this.get(npcId);
    rec.transcript.push({ speaker, text, t: Date.now() });
    // Keep the transcript bounded for the prototype.
    if (rec.transcript.length > 50) rec.transcript.shift();
  }

  // Lightweight heuristic tagging so the AI's own utterances and player lines
  // populate the structured memory without a separate NLP pass.
  classifyPlayerLine(npcId: string, text: string): void {
    const lower = text.toLowerCase();
    if (text.includes('?')) this.recordQuestion(npcId, text);
    if (/\b(promise|i swear|i will|we will|i'll|we'll)\b/.test(lower)) {
      this.recordPromise(npcId, text);
    }
    if (/\b(idiot|stupid|shut up|liar|hate you|useless)\b/.test(lower)) {
      this.recordInsult(npcId, text);
    }
  }

  // Compact, prompt-ready summary of what the NPC remembers this scene.
  summarize(npcId: string): string {
    const rec = this.byNpc.get(npcId);
    if (!rec) return 'No memories yet this scene.';

    const parts: string[] = [];
    if (rec.playerNames.length) parts.push(`Known players: ${rec.playerNames.join(', ')}.`);
    if (rec.promises.length) parts.push(`Promises made to you: ${rec.promises.map((p) => p.text).join(' | ')}.`);
    if (rec.questions.length) {
      const recent = rec.questions.slice(-3).map((q) => q.text).join(' | ');
      parts.push(`Recent questions: ${recent}.`);
    }
    if (rec.insults.length) parts.push(`You were insulted: ${rec.insults.map((p) => p.text).join(' | ')}.`);
    if (rec.suspiciousBehavior.length) {
      parts.push(`Suspicious behaviour noticed: ${rec.suspiciousBehavior.map((p) => p.text).join(' | ')}.`);
    }
    if (rec.obedience.length) parts.push(`Instruction compliance: ${rec.obedience.map((p) => p.text).join(' | ')}.`);

    return parts.length ? parts.join(' ') : 'No notable memories yet this scene.';
  }

  clear(npcId?: string): void {
    if (npcId) this.byNpc.delete(npcId);
    else this.byNpc.clear();
  }
}
