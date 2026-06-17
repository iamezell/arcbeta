import { NPCDetailSnapshot } from './types';

interface TranscriptLine {
  speaker: string;
  text: string;
  t: number;
}

// Client-side cache of NPC memory + transcripts for the Director panel. The
// authoritative memory lives on the server (SceneMemory); this just mirrors what
// the director needs to *see* (detail snapshots + a rolling subtitle log).
export class NPCMemory {
  private details = new Map<string, NPCDetailSnapshot>();
  private transcripts = new Map<string, TranscriptLine[]>();

  updateDetail(detail: NPCDetailSnapshot): void {
    this.details.set(detail.id, detail);
    // Seed the transcript log from the authoritative snapshot.
    this.transcripts.set(detail.id, [...detail.transcript]);
  }

  addSubtitle(npcId: string, speaker: string, text: string): void {
    const list = this.transcripts.get(npcId) ?? [];
    list.push({ speaker, text, t: Date.now() });
    if (list.length > 60) list.shift();
    this.transcripts.set(npcId, list);
  }

  getDetail(npcId: string): NPCDetailSnapshot | undefined {
    return this.details.get(npcId);
  }

  getTranscript(npcId: string): TranscriptLine[] {
    return this.transcripts.get(npcId) ?? [];
  }
}
