import { CueManager } from './CueManager';
import { ALL_CUES, DirectorCue } from './types';
import { makeDraggablePanel } from '../ui/DraggablePanel';

// Temporary debug panel for the Director: pick an NPC, fire cues, open/close
// conversation windows, swap AI<->Human, and inspect live state + memory +
// transcript. Director-only; the audience never sees it. This is scaffolding —
// the production control surface is a Stream Deck calling cueManager.executeCue.
export class NPCDirectorPanel {
  private cueManager: CueManager;
  private panel: HTMLDivElement;
  private npcSelect!: HTMLSelectElement;
  private cueSelect!: HTMLSelectElement;
  private stateBox!: HTMLDivElement;
  private memoryBox!: HTMLDivElement;

  constructor(cueManager: CueManager) {
    this.cueManager = cueManager;
    this.injectStyles();
    this.panel = document.createElement('div');
    this.panel.id = 'npc-director';
    this.panel.innerHTML = `
      <h4>🤖 NPC Director</h4>
      <label class="npcd-l">NPC</label>
      <select class="npcd-npc"></select>
      <div class="npcd-state">—</div>
      <label class="npcd-l">Cue</label>
      <div class="npcd-row">
        <select class="npcd-cue"></select>
        <button class="npcd-fire">Fire</button>
      </div>
      <div class="npcd-row">
        <button data-act="enable">Enable Conv</button>
        <button data-act="disable">Disable Conv</button>
      </div>
      <div class="npcd-row">
        <button data-act="toHuman">AI → Human</button>
        <button data-act="toAI">Human → AI</button>
      </div>
      <div class="npcd-row">
        <button data-act="memory">View Memory / Transcript</button>
      </div>
      <div class="npcd-memory">No NPC selected.</div>
    `;
    document.body.appendChild(this.panel);

    this.npcSelect = this.panel.querySelector('.npcd-npc') as HTMLSelectElement;
    this.cueSelect = this.panel.querySelector('.npcd-cue') as HTMLSelectElement;
    this.stateBox = this.panel.querySelector('.npcd-state') as HTMLDivElement;
    this.memoryBox = this.panel.querySelector('.npcd-memory') as HTMLDivElement;

    for (const cue of ALL_CUES) {
      const opt = document.createElement('option');
      opt.value = cue;
      opt.textContent = cue;
      this.cueSelect.appendChild(opt);
    }

    this.wireEvents();
    this.cueManager.onRosterChanged = () => this.refresh();
    this.refresh();
    makeDraggablePanel(this.panel);
  }

  private wireEvents(): void {
    this.npcSelect.addEventListener('change', () => {
      this.cueManager.requestDetail(this.selectedNpc());
      this.refresh();
    });
    (this.panel.querySelector('.npcd-fire') as HTMLButtonElement).addEventListener('click', () => {
      this.cueManager.executeCue(this.selectedNpc(), this.cueSelect.value as DirectorCue);
    });
    this.panel.querySelectorAll('.npcd-row button[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = (btn as HTMLElement).dataset.act;
        const npcId = this.selectedNpc();
        if (!npcId) return;
        if (act === 'enable') {
          // Start WebRTC in the click handler so autoplay isn't blocked later.
          void this.cueManager.enableConversationLocal(npcId);
          this.cueManager.executeCue(npcId, 'ENABLE_CONVERSATION');
        } else if (act === 'disable') {
          this.cueManager.disableConversationLocal(npcId);
          this.cueManager.executeCue(npcId, 'DISABLE_CONVERSATION');
        }
        else if (act === 'toHuman') this.cueManager.executeCue(npcId, 'TRANSFER_TO_HUMAN');
        else if (act === 'toAI') this.cueManager.executeCue(npcId, 'TRANSFER_TO_AI');
        else if (act === 'memory') {
          this.cueManager.requestDetail(npcId);
          window.setTimeout(() => this.renderMemory(), 350);
        }
      });
    });
  }

  private selectedNpc(): string {
    return this.npcSelect.value;
  }

  refresh(): void {
    const snaps = this.cueManager.getSnapshots();
    const prev = this.npcSelect.value;
    this.npcSelect.innerHTML = '';
    for (const s of snaps) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.isAI ? 'AI' : 'HUMAN'})`;
      this.npcSelect.appendChild(opt);
    }
    if (prev && snaps.some((s) => s.id === prev)) {
      this.npcSelect.value = prev;
    } else {
      const firstAi = snaps.find((s) => s.isAI);
      if (firstAi) this.npcSelect.value = firstAi.id;
    }

    const sel = snaps.find((s) => s.id === this.selectedNpc());
    if (sel) {
      this.stateBox.innerHTML =
        `<b>${sel.name}</b> — ${sel.isAI ? 'AI' : 'HUMAN'}<br>` +
        `State: ${sel.currentState} · Emotion: ${sel.currentEmotion}<br>` +
        `Conversation: ${sel.conversationEnabled ? 'ON' : 'off'} · Cue: ${sel.currentCue ?? '—'}`;
    } else {
      this.stateBox.textContent = '—';
    }
  }

  private renderMemory(): void {
    const npcId = this.selectedNpc();
    const detail = this.cueManager.getMemory().getDetail(npcId);
    const transcript = this.cueManager.getMemory().getTranscript(npcId);
    const lines: string[] = [];
    if (detail) {
      lines.push(`<b>Objective:</b> ${detail.sceneObjective}`);
      if (detail.allowedKnowledge.length) {
        lines.push(`<b>Allowed:</b> ${detail.allowedKnowledge.join('; ')}`);
      }
      lines.push(`<b>Memory:</b> ${detail.memorySummary}`);
    }
    lines.push('<b>Transcript:</b>');
    if (transcript.length) {
      for (const t of transcript.slice(-12)) {
        const who = t.speaker === 'npc' ? (detail?.name ?? 'NPC') : t.speaker.replace('player:', '');
        lines.push(`<span class="npcd-t">${who}:</span> ${t.text}`);
      }
    } else {
      lines.push('<i>(no lines yet)</i>');
    }
    this.memoryBox.innerHTML = lines.join('<br>');
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #npc-director {
        position: fixed; right: 16px; top: 16px; width: 250px; z-index: 320;
        background: rgba(14,16,22,0.94); border: 1px solid rgba(140,150,255,0.28);
        border-radius: 10px; padding: 14px; color: #e8ecff; font: 13px 'Segoe UI', sans-serif;
        max-height: 90vh; overflow-y: auto;
      }
      #npc-director h4 { margin: 0 0 10px; font-size: 14px; }
      #npc-director .npcd-l { display: block; opacity: 0.7; margin: 8px 0 4px; font-size: 12px; }
      #npc-director select {
        width: 100%; background: #20242f; color: #fff; border: 1px solid rgba(255,255,255,0.18);
        border-radius: 6px; padding: 5px;
      }
      #npc-director .npcd-row { display: flex; gap: 6px; margin-top: 8px; }
      #npc-director .npcd-row select { flex: 1; }
      #npc-director button {
        flex: 1; padding: 7px; border: 0; border-radius: 6px; cursor: pointer;
        background: #2e3340; color: #fff; font-size: 12px;
      }
      #npc-director button:hover { background: #3c4150; }
      #npc-director .npcd-fire { flex: 0 0 60px; background: #3a6cff; }
      #npc-director .npcd-state {
        margin: 8px 0; padding: 8px; background: #181c26; border-radius: 6px; line-height: 1.5;
        font-size: 12px;
      }
      #npc-director .npcd-memory {
        margin-top: 8px; padding: 8px; background: #14171f; border-radius: 6px; line-height: 1.5;
        font-size: 12px; max-height: 200px; overflow-y: auto;
      }
      #npc-director .npcd-t { color: #9fd0ff; }
    `;
    document.head.appendChild(style);
  }
}
